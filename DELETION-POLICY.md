# Deletion policy

**Rule zero:** no normal user or admin action may destroy clinical, financial,
treatment, quotation, payment or audit history through a cascading hard
delete. Business deletion is *archive* (`deletedAt`); permanent deletion is a
privileged, trash-first, dependency-checked exception.

```
NORMAL DELETE            RESTORE                 PERMANENT DELETE
     │                      │                          │
soft delete             deletedAt = null          admin / super_admin only
deletedAt = now()       row visible again              │
row hidden from                                  row must ALREADY be archived
normal reads                                           │
history preserved                                dependency check (409 DELETION_BLOCKED
                                                 while protected records depend on it)
                                                       │
                                                 safe? ──no──▶ 409, nothing touched
                                                       │yes
                                                 hard delete in ONE transaction
                                                 + best-effort file cleanup after commit
                                                 (Postgres ON DELETE RESTRICT is the backstop)
```

## Entity classification

| Class | Entities | Delete behaviour |
|---|---|---|
| **Business roots** (clinical / financial) | User, Patient, DentalOrder | Soft delete only in day-to-day use. Permanent delete = trash-first + blocked (409) while anything below depends on them: User → patients / orders; Patient → orders (any, incl. archived); DentalOrder → quotation / payments / treatment plans. |
| **Ledger / issued documents** | Quotation, QuoteInstallment, QuoteStepBatch, Payment (invoice/receipt numbers, proofs, snapshots) | Never deleted by a parent's deletion (`Restrict`). The only hard delete is admin **cancel** of a draft/sent quotation, forced by `Quotation.orderId @unique`, and refused (409) once *any* payment record exists. Plan wipes (attach-pack / configure-plan / draft total change) refuse while a success / pending / awaiting_confirmation payment exists; failed attempts keep their row (`Payment.installment` → SetNull). |
| **Clinical children** | TreatmentPlan, TreatmentPlanIpr, TreatmentMessage, TreatmentMessageAttachment, OrderToothInstruction, OrderFile | Owned by their root and only removed with it. Because the root cannot be purged while plans/quotes/payments exist, they only cascade for orders that never entered the clinical/financial pipeline. OrderFile soft delete keeps the blob (restorable); the 30-day retention sweep purges trashed files. |
| **Actor references** (audit) | `createdBy`, `sender`, `uploadedBy`, `approvedBy`, `rejectedBy`, `confirmedBy`, `initiatedBy`, `deliveredBy`, `assignedDesigner`, `assignedAdmin`, `reviewedBy` | `onDelete: SetNull`; the record survives the account. Name snapshots (`createdByName`, `senderName`/`senderRole`) are written at create time so history still reads after an account is purged. |
| **Config / content** | DentistProfile (+WorkingHours, Appointment), Pack (+PackPrice), Blog, BlogImage, SliderMedia, CommunitySubmission (+media), SupportConversation (+messages), Notification | Soft delete where the model has `deletedAt`; owned children cascade with their (soft-deleted-first) parent; Pack purge is trash-first, historical quotes keep the pack snapshot. **CommunitySubmission and Blog are the only entities with a true permanent delete** — nothing clinical or financial points at them, and a community story holds personal data (name, phone, e-mail, a child's name/age, photos and video of real people) that an erasure request must be able to remove. Both are trash-first; the story purge takes its media rows, blobs and `/uploads/community/<id>` with it, while a post purge deliberately leaves `BlogImage` alone (shared library, other posts may still use it). |
| **Technical / temporary** | UploadSession + chunk dirs, expired trashed OrderFile blobs, archived SupportConversation, media variants | Hard delete / cascade / cron are fine. `UploadCleanupService` (the single retention scheduler): stale sessions (24 h), trashed order files (30 d), and support conversations an admin archived more than 30 d ago — that last sweep lives in `SupportService.purgeExpiredDeletedConversations()`, which owns the model and the `/uploads/support/<id>` layout. |

## Prisma relations (after `20260816000001_deletion_policy_protect_clinical_and_ledger`)

| Relation | Was | Now | Why |
|---|---|---|---|
| Patient.doctor → User | Cascade | **Restrict** | patients are the root of the clinical tree |
| DentalOrder.doctor → User | Cascade | **Restrict** | orders own devis, payments, plans |
| DentalOrder.patient → Patient | Cascade | **Restrict** | idem |
| TreatmentPlan.order → DentalOrder | Cascade | **Restrict** | the plan is the clinical record |
| Quotation.order → DentalOrder | Cascade | **Restrict** | numbered devis must survive |
| Payment.order → DentalOrder | Cascade | **Restrict** | ledger |
| Payment.quotation → Quotation | Cascade | **Restrict** | ledger |
| Payment.installment → QuoteInstallment | Cascade | **SetNull** (optional) | re-planning never destroys a payment record |
| TreatmentPlan.createdBy → User | Cascade | **SetNull** (optional) + `createdByName` | actor ref, not ownership |
| TreatmentMessage.sender → User | Cascade | **SetNull** (optional) + `senderName`, `senderRole` | staff purge must not punch holes in a doctor's clinical thread |
| TreatmentMessageAttachment.uploadedBy → User | Cascade | **SetNull** (optional) | deliverables outlive the uploader |
| Quotation.createdBy → User | Cascade | **SetNull** (optional) + `createdByName` | staff purge must not wipe devis + ledger |
| SupportMessage.sender → User | Cascade | **SetNull** (optional) + `senderName` | admin purge must not delete replies in doctors' threads |

**Remaining `onDelete: Cascade` (17), each justified:** OrderToothInstruction.order, OrderFile.order, UploadSession.order (owned children of an order that can only be purged when history-free); TreatmentPlanIpr.treatmentPlan, TreatmentMessage.treatmentPlan, TreatmentMessageAttachment.message (owned by a plan, which is Restrict-protected upstream); QuoteInstallment.quotation, QuoteStepBatch.quotation, QuoteStepBatch.installment (plan rows of a quote that can only be deleted via payment-guarded cancel); DentistProfile.user, WorkingHours.dentistProfile, Appointment.dentistProfile (config / lead data owned by the account; quotes carry a clinic snapshot); PackPrice.pack (catalogue rows; quotes carry a pack snapshot); Notification.recipient (inbox); SupportConversation.doctor, SupportMessage.conversation (a doctor's own support thread); CommunitySubmissionMedia.submission (public content). Pack.quotations, Blog cover/author, SliderMedia/BlogImage/CommunitySubmission actor refs were already SetNull.

## HTTP contract

| Action | Endpoint | Who | Result |
|---|---|---|---|
| Archive | `DELETE /orders/:id`, `/patients/:id`, `/users/:id`, `/admin/packs/:id`, … | owner / admin per module | 200; patient with active orders → **409** `PATIENT_HAS_ACTIVE_ORDERS`; self-delete → 403 |
| Restore | `POST /orders/:id/restore`, `/patients/:id/restore`, `/users/:id/restore`, `/admin/packs/:id/restore`, `/slider-media/:id/restore`, `/support/conversations/:id/restore`; `PATCH /admin/community-submissions/:id/restore`, `/admin/blog/:id/restore` | admin (patients: owner dentist too) | 200, idempotent |
| Trash view | `GET /orders?includeDeleted=true`, `GET /patients?includeDeleted=true`, `GET /users/deleted/list`, `GET /admin/community-submissions?includeDeleted=true`, `GET /admin/blog?includeDeleted=true` | admin | only archived rows |
| Permanent | `DELETE /orders/:id/permanent`, `/patients/:id/permanent`, `/users/:id/permanent`, `/admin/packs/:id/permanent`, `/admin/community-submissions/:id/permanent`, `/admin/blog/:id/permanent`, bulk variants | admin / super_admin | live row → **400** `NOT_ARCHIVED`; protected dependencies → **409** `DELETION_BLOCKED` with the list ("3 orders, 1 quotation"); bulk returns `{deleted/count, blocked, skipped}` |

Frontend: `toastMutationError()` shows the backend message for 409 (long-lived toast); `PermanentDeleteDialog` requires typing `DELETE`, keeps the dialog open while pending, and permanent actions are only rendered for archived rows.

## Rules for new code

1. Business deletion = `update({ data: { deletedAt: new Date() } })`. Never `delete()` on User / Patient / DentalOrder / Quotation / Payment / TreatmentPlan outside the purge routines.
2. Before any hard delete: require `deletedAt !== null`, fetch dependency counts in one query, call `assertNoDependents()`, delete children-first inside `$transaction`, unlink files **after** commit (`purgeStoredMedia` handles variants).
3. Every read on a model with `deletedAt` filters `deletedAt: null` (and the parent's when the parent can be archived: `order: { deletedAt: null }`, `user: { deletedAt: null }`) unless it is explicitly the trash view.
4. New actor FKs are optional + `SetNull` + snapshot the display name via `lookupActorName()`.
5. Test it: `bash scripts/test-deletion-policy.sh` (67 checks, clinical + financial) and
   `bash scripts/test-content-lifecycle.sh` (43 checks, community + blog), plus `npx jest`
   (the `*.deletion.spec.ts` / `*.retention.spec.ts` units).
