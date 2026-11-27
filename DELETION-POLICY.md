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
| **Business roots** (clinical / financial) | User, Patient, DentalOrder | Soft delete only in day-to-day use. Permanent delete = trash-first + blocked (409) while anything below depends on them: User → patients / orders; Patient → orders (any, incl. archived); DentalOrder → quotation / payments / treatment plans / aligner deliveries / production events. |
| **Ledger / issued documents** | Quotation, QuoteInstallment, QuoteStepBatch, Payment (invoice/receipt numbers, proofs, snapshots) | Never deleted by a parent's deletion (`Restrict`). The only hard delete is admin **cancel** of a draft/sent quotation, forced by `Quotation.orderId @unique`, and refused (409) once *any* payment record exists. Plan wipes (attach-pack / configure-plan / draft total change) refuse while a success / pending / awaiting_confirmation payment exists; failed attempts keep their row (`Payment.installment` → SetNull). |
| **Clinical children** | TreatmentPlan, TreatmentPlanIpr, TreatmentPlanDocument, TreatmentMessage, TreatmentMessageAttachment, OrderToothInstruction, OrderFile | Owned by their root and only removed with it. Because the root cannot be purged while plans/quotes/payments exist, they only cascade for orders that never entered the clinical/financial pipeline. OrderFile soft delete keeps the blob (restorable); the 30-day retention sweep purges trashed files. |
| **Actor references** (audit) | `createdBy`, `sender`, `uploadedBy`, `approvedBy`, `rejectedBy`, `confirmedBy`, `initiatedBy`, `deliveredBy`, `assignedDesigner`, `assignedAdmin`, `reviewedBy`, `reviewOpenedBy`, `cancelledBy`, `unlockedBy`, `treatmentFeeRejectedBy`, the `actor` of AccountActivityEvent / BillingSettingsAuditLog | `onDelete: SetNull`; the record survives the account. Name snapshots (`createdByName`, `senderName`/`senderRole`) are written at create time so history still reads after an account is purged. |
| **Config / content** | DentistProfile (+WorkingHours, Appointment), Pack (+PackPrice), Blog, BlogImage, SliderMedia, CommunitySubmission (+media), SupportConversation (+messages), Notification | Soft delete where the model has `deletedAt`; owned children cascade with their (soft-deleted-first) parent; Pack purge is trash-first, historical quotes keep the pack snapshot. **CommunitySubmission and Blog are the only entities with a true permanent delete** — nothing clinical or financial points at them, and a community story holds personal data (name, phone, e-mail, a child's name/age, photos and video of real people) that an erasure request must be able to remove. Both are trash-first; the story purge takes its media rows, blobs and `/uploads/community/<id>` with it, while a post purge deliberately leaves `BlogImage` alone (shared library, other posts may still use it). |
| **Technical / temporary** | UploadSession + chunk dirs, expired trashed OrderFile blobs, archived SupportConversation, media variants | Hard delete / cascade / cron are fine. `UploadCleanupService` (the single retention scheduler): stale sessions (24 h), trashed order files (30 d), and support conversations an admin archived more than 30 d ago — that last sweep lives in `SupportService.purgeExpiredDeletedConversations()`, which owns the model and the `/uploads/support/<id>` layout. |

## Prisma relations (after `20260816000001_deletion_policy_protect_clinical_and_ledger`)

| Relation | Was | Now | Why |
|---|---|---|---|
| Patient.doctor → User | Cascade | **Restrict** | patients are the root of the clinical tree |
| DentalOrder.doctor → User | Cascade | **Restrict** | orders own devis, payments, plans |
| DentalOrder.patient → Patient | Cascade | **Restrict** | idem |
| TreatmentPlan.order → DentalOrder | Cascade | **Restrict** | the plan is the clinical record |
| AlignerDelivery.order → DentalOrder | — (new) | **Restrict** | append-only log of aligners handed to the patient; an order with deliveries is never purged (409 lists them) |
| Quotation.order → DentalOrder | Cascade | **Restrict** | numbered devis must survive |
| Payment.order → DentalOrder | Cascade | **Restrict** | ledger |
| Payment.quotation → Quotation | Cascade | **Restrict** | ledger |
| Payment.installment → QuoteInstallment | Cascade | **SetNull** (optional) | re-planning never destroys a payment record |
| TreatmentPlan.createdBy → User | Cascade | **SetNull** (optional) + `createdByName` | actor ref, not ownership |
| AlignerDelivery.createdBy → User | — (new) | **SetNull** (optional) + `createdByName` | the delivery log outlives whoever recorded it |
| TreatmentMessage.sender → User | Cascade | **SetNull** (optional) + `senderName`, `senderRole` | staff purge must not punch holes in a doctor's clinical thread |
| TreatmentMessageAttachment.uploadedBy → User | Cascade | **SetNull** (optional) | deliverables outlive the uploader |
| Quotation.createdBy → User | Cascade | **SetNull** (optional) + `createdByName` | staff purge must not wipe devis + ledger |
| SupportMessage.sender → User | Cascade | **SetNull** (optional) + `senderName` | admin purge must not delete replies in doctors' threads |
| DentalOrder.parentOrder → DentalOrder | — (new, `20261110000000_supplemental_orders`) | **Restrict** | an initial case is never purged while supplemental requests (refinement, replacement, transfer template, warranty) point at it; archiving a case with an open request is refused (409 `SUPPLEMENTAL_ACTIVE_CHILDREN`) |
| SupplementalOrderRequest.order → DentalOrder | — (new) | **Cascade** | the typed request row is the child order's own payload |
| SupplementalOrderRequest.createdBy / reviewedBy → User | — (new) | **SetNull** (optional) + `createdByName` / `reviewedByName` | actor refs (made optional in `20261112000000_supplemental_aligner_form`) |
| SupplementalOrderRequest.sourceTreatmentPlan → TreatmentPlan | — (new) | **SetNull** (optional) | a transfer template keeps its version number if the plan row ever goes |
| SupplementalOrderRequest.convertedReplacementOrder → DentalOrder | — (new) | **SetNull** (optional) | a rejected warranty keeps its history if the paid replacement draft is purged |
| SupplementalToothSelection / SupplementalToothContact.request → SupplementalOrderRequest | — (new) | **Cascade** | the dentist's teeth and contacts are owned by the request |
| ProductionEvent.order → DentalOrder | — (new, `20261125000001_production_module`) | **Restrict** | the lab's act log (printed, thermoformed, cut, delivered) is clinical history and append-only: a wrong entry is cancelled (cancel columns + reason), never deleted; an order with any row, cancelled or `legacy_batch` included, is never purged (the purge guard reports "N production events", 409 `DELETION_BLOCKED`) |
| ProductionEvent.createdBy / cancelledBy → User | — (new) | **SetNull** (optional) + `createdByName` / `createdByRole` / `cancelledByName` | actor refs: purging a technician's account never blocks on, nor blanks, the journal she wrote |
| ProductionNotice.order → DentalOrder | — (new) | **Cascade** | technical outbox rows of the practitioner notices; they only go with an order, which cannot be purged while it has production events |
| ProductionProgress.order → DentalOrder | — (new) | **Cascade** | a read model recomputed from the events (`src/scripts/rebuild-production-progress.ts` rebuilds it): it lives and dies with its order |
| TreatmentPlanDocument.treatmentPlan → TreatmentPlan | — (new, `20261126000000_treatment_plan_documents`) | **Cascade** | the analysis PDFs (CBCT, cephalometric) are owned by their plan version, itself Restrict-protected; a renewal copies the rows and shares the file, which leaves the disk only once no row (document, movement or dental table image) refers to it (`treatment-plans/documents/plan-file-store.ts`) |
| TreatmentPlanDocument.uploadedBy → User | — (new) | **SetNull** (optional) + `uploadedByName` | actor ref: the analysis outlives the planner who uploaded it |
| Payment.reviewOpenedBy → User | — (new, `20261127000001_spec_model`) | **SetNull** (optional) + `reviewOpenedByName` | actor ref: the first admin who opened a transfer receipt; the review stamp (`reviewOpenedAt`) and the `payment_review_opened` order-history row outlive the account |
| Payment.cancelledBy → User | — (new) | **SetNull** (optional) + `cancelledByName` | actor ref: who withdrew or superseded a transfer declaration (status `cancelled`, receipt file kept) |
| DentalOrder.treatmentFeeRejectedBy → User | — (new) | **SetNull** (optional) + `treatmentFeeRejectedByName` | actor ref: the admin who refused a treatment-fee transfer; the reason (`treatmentFeeRejectionReason`) stays on the order |
| QuoteStepBatch.unlockedBy → User | — (new) | **SetNull** (optional) + `unlockedByName` | actor ref: who released the steps (`unlockSource` payment / installment_cancelled / manual); null actor = the system (card settlement). The `batch_unlocked` order-history row carries the same actor snapshot |
| OrderAuditLog.paymentId | — (new) | **plain indexed column, no FK** | the order history names the Payment a transfer / unlock row is about; the ledger is Restrict-protected and must never be blocked (or blanked) by its journal |
| AccountActivityEvent.user → User | — (new) | **Cascade** | the account's own inactivity journal (warnings, deactivation, reactivation, block / unblock), like its inbox. A dentist who ever ordered can never be purged (Patient / DentalOrder Restrict), so the cascade only runs for accounts without clinical history; the rule itself never deletes anything |
| AccountActivityEvent.actor → User | — (new) | **SetNull** (optional) + `actorName`, `actorRole` | actor ref: the admin who reactivated / blocked; null = the daily sweep |
| BillingSettingsAuditLog.actor → User | — (new) | **SetNull** (optional) + `actorName` | actor ref: the fiscal / rollout settings trail (retenue rate, switch and threshold, stamp, TVA, inactivity rule) outlives the admin who changed them; the trail is append-only and never deleted |

**Remaining `onDelete: Cascade` (19), each justified:** OrderToothInstruction.order, OrderFile.order, UploadSession.order (owned children of an order that can only be purged when history-free); TreatmentPlanIpr.treatmentPlan, TreatmentPlanDocument.treatmentPlan, TreatmentMessage.treatmentPlan, TreatmentMessageAttachment.message (owned by a plan, which is Restrict-protected upstream); QuoteInstallment.quotation, QuoteStepBatch.quotation, QuoteStepBatch.installment (plan rows of a quote that can only be deleted via payment-guarded cancel); DentistProfile.user, WorkingHours.dentistProfile, Appointment.dentistProfile (config / lead data owned by the account; quotes carry a clinic snapshot); PackPrice.pack (catalogue rows; quotes carry a pack snapshot); Notification.recipient (inbox); AccountActivityEvent.user (the account's own activity journal); SupportConversation.doctor, SupportMessage.conversation (a doctor's own support thread); CommunitySubmissionMedia.submission (public content). Pack.quotations, Blog cover/author, SliderMedia/BlogImage/CommunitySubmission actor refs were already SetNull.

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
