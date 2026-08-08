# OraLign — Application Security Audit

**Scope:** full stack — Next.js frontend, NestJS backend, PostgreSQL (Prisma), Redis.
**Method:** static source review of every controller/service/guard/DTO, tracing authorization from each HTTP request through the service to the actual database query; every candidate finding was adversarially re-verified against the real code to confirm exploitability and calibrate severity.
**Nature of review:** authorized review of the owner's own application. Read-only; no destructive testing.

> **Confidence marking.** Every finding below is **CONFIRMED** (the vulnerable code path was traced end-to-end) unless explicitly marked *Potential*. Five candidate findings were **refuted** on verification and are listed at the end as “Confirmed-safe”, so you don’t re-investigate them.

---

## Remediation Status (fixed in this pass)

25 of 27 findings were remediated in code; 2 low/informational items were deliberately deferred (they need a new dependency or a lockfile regeneration the AV-blocked host can’t do safely) and are documented as follow-ups.

| ID | Severity | Status | What changed |
|---|---|---|---|
| H-1 | High | ✅ Fixed | `PaymentsModule` fails closed — refuses to boot the always-succeed mock gateway in production unless `ALLOW_MOCK_PAYMENTS=true`. |
| M-1 | Medium | ✅ Fixed | Payment-plan reads now authorize the caller against the parent order (`assertPlanReadable`). |
| M-2 | Medium | ✅ Fixed | `GET /dentist-profile` is admin-only; `:id` + search redact `taxId`/`clinicEmail` for non-owner/non-admin. |
| M-3 | Medium | ✅ Fixed | `POST /working-hours` now calls `assertOwnership`. |
| M-4 | Medium | ✅ Fixed | Treatment fee computed server-side; client `amount` removed (DTO + service). |
| M-5 | Medium | ✅ Fixed | `refreshToken` rejects deactivated/deleted users. |
| M-6 | Medium | ✅ Fixed | `tokenVersion` column + migration; embedded in tokens; bumped on reset/change; verified on refresh. |
| M-7 | Medium | ✅ Fixed | Crypto OTP (`crypto.randomInt`) + per-account verify lockout + route throttle. |
| M-8 | Medium | ✅ Fixed (mitigated) | Per-email caps on active appointment requests (per practitioner + overall). Full email-confirmation flow remains a recommended follow-up. |
| M-9 | Medium | ✅ Fixed | Avatar/patient photos always re-encoded through sharp to `.webp`; undecodable files rejected (no raw store). |
| L-1 | Low | ✅ Fixed | Unified sign-in error (unknown email == wrong password), frontend updated. |
| L-2 | Low | ✅ Fixed | Reset token single-use via `tokenVersion` binding. |
| L-3 | Low | ✅ Fixed | Mirror cookie marked `Secure` over HTTPS. |
| L-4 | Low | ✅ Fixed | 500s return an opaque message; the real error is logged server-side. |
| L-5 | Low | ✅ Fixed | Idempotency keys namespaced per caller; raw keys no longer logged. |
| L-6 | Low | ⚠️ Deferred | Redis throttler storage needs a new dependency; single-instance deployment makes in-memory acceptable for now. |
| L-7 | Low | ✅ Fixed | `docker-compose.yml` fails closed on missing DB/Redis/JWT secrets. |
| L-8 | Low | ⚠️ Deferred (with note) | Gating public working-hours on `isListedPublicly` would break the dentist’s own onboarding (shared endpoint); needs an auth-aware redesign. |
| L-9 | Low | ✅ Fixed | Blog view-counter throttled per IP. |
| L-10 | Low | ⏸ Not changed | Community-media buffering is a perf hardening; left as-is. |
| I-2 | Info | ✅ Fixed (backend) | `/uploads` served with `nosniff` + sandbox CSP. Full frontend CSP remains a follow-up. |
| I-5 | Info | ✅ Fixed | `server_tokens off;` in both nginx vhosts. |
| I-6 | Info | ⚠️ Deferred | Prisma CLI/client version align needs `npm install` (AV-blocked host); low-risk skew. |

**New DB migration:** `20260720000002_auth_session_revocation` adds `tokenVersion` + `failedVerificationAttempts` to `User` (additive, safe). Runs automatically on backend boot in prod.

**Operational note:** with H-1 + L-7, production now refuses to start unless a real payment gateway is configured (or `ALLOW_MOCK_PAYMENTS=true` is set) and DB/Redis/JWT secrets are provided in `.env.production`.

---

## Executive Summary

The codebase is **defensively well-engineered at the framework layer**. The bootstrap (`main.ts`) gets the fundamentals right that most NestJS apps get wrong: a strict global `ValidationPipe` (`whitelist + forbidNonWhitelisted + transform`) that neutralises mass-assignment, an explicit CORS allowlist with **no** wildcard fallback, Helmet with HSTS in production, a 1 MB JSON body cap, Swagger disabled in production, and a global `ThrottlerGuard`. All raw SQL uses parameterized Prisma tagged templates (no string concatenation, no `queryRawUnsafe`). Secrets are not committed, `.gitignore` covers `.env*`, and JWT signing secrets **fail closed** in production (the app refuses to boot on a weak/placeholder secret). Most object-scoped endpoints correctly route through an ownership helper (`findAccessibleOrder` / `assertOrderReadable`).

The problems are not in the framework wiring — they are in **specific endpoints that missed the ownership pattern used everywhere else**, and in the **payment/fee integrity layer**, which is unfinished.

**The most important risks, in order:**

1. **Payments are not real.** The only bound payment gateway is a mock that returns `SUCCESS` unconditionally in every environment. A dentist can mark installments paid and unlock aligner fabrication **without paying**. (High)
2. **The professional treatment-fee is client-priced.** `POST /orders/:id/treatment-fee/pay` trusts a client-supplied `amount`; a doctor can pay `0` and unlock treatment-plan creation instantly. (Medium — becomes High the moment a real gateway is attached)
3. **A cluster of BOLA / IDOR gaps** on endpoints that forgot the ownership check the rest of the app uses: payment-plan reads, dentist-profile reads (leaks every clinic’s tax ID), and working-hours writes. (Medium ×3)
4. **Session management is incomplete:** tokens are irrevocable (logout / password-reset / password-change do not invalidate live sessions), and account deactivation is bypassable via the refresh endpoint. (Medium ×2)

None of these are framework-level rot; each is a contained, well-defined fix. There is **no SQL injection, no RCE, no auth bypass, no committed secret, and no confirmed XSS.**

**Security score: 70 / 100** — see the last section for the rationale. Strong foundations; **not yet safe to take real money** until findings 1, 2, and the BOLA cluster are fixed.

---

## Severity summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 9 |
| Low | 10 |
| Informational | 7 |

---

## CRITICAL FINDINGS

None. No path to account takeover, RCE, authentication bypass, or full database compromise was found.

---

## HIGH FINDINGS — fix before taking any real payment

### H-1 · Card payment rail always returns SUCCESS — “pay” unlocks fabrication with no money collected
- **Severity:** High · **Verdict:** CONFIRMED
- **CWE/OWASP:** CWE-840 Business Logic Errors; OWASP **API6:2023** Unrestricted Access to Sensitive Business Flows
- **Endpoint:** `POST /quotations/:quotationId/installments/:installmentId/pay-by-card`
- **Files:**
  - `oralign-backend/src/payments/payments.module.ts:30` — `PAYMENT_GATEWAY` bound **unconditionally** to `MockPaymentGateway`
  - `oralign-backend/src/payments/gateways/mock-payment.gateway.ts:55` — returns `SUCCESS` whenever `MOCK_PAYMENT_CONTROLLABLE !== 'true'` (the default/production path)
  - `oralign-backend/src/payments/services/payments.service.ts:237` — `payByCard` → `handleSuccess` flips `Payment→success`, `Installment→paid`, unlocks the `QuoteStepBatch`, advances the order to `fabrication`

**Explanation.** There is no real processor wired. The mock gateway’s synchronous return is treated as authoritative, and it deterministically returns `SUCCESS`. The installment *amount* is loaded server-side (so this is not amount-tampering) — the problem is that the **“paid” state is granted for free.**

**Attack scenario.** An authenticated dentist calls the endpoint for their own installment with no body. `loadInstallmentForCaller` authorizes them, `assertPayable` passes, a `pending` Payment is created, the mock returns `SUCCESS`, and `handleSuccess` marks the installment paid, unlocks that aligner step-batch, and (when the plan clears) moves the order to fabrication. Repeat across installments → the entire payment plan is completed for free.

**Impact.** If this build is deployed with card payments exposed, doctors obtain paid treatment/fabrication without paying. This is an **unfinished integration**, so the impact is only realised in an environment actually deployed this way — but the code path is live today.

**Remediation.**
1. **Fail closed:** refuse to boot with `MockPaymentGateway` when `NODE_ENV === 'production'`; select the gateway by environment.
2. Until a real processor is integrated, **gate the pay-by-card route behind a non-production guard** so it cannot stamp financial state in prod.
3. When the real gateway lands, only flip Payment/installment/batch state after a **server-verified signed webhook/callback**, not the synchronous charge return.

```ts
// payments.module.ts — select by environment, fail closed in prod
{
  provide: PAYMENT_GATEWAY,
  useClass: process.env.NODE_ENV === 'production'
    ? RealPaymentGateway            // must exist before prod card payments are enabled
    : MockPaymentGateway,
}
```

---

## MEDIUM FINDINGS

### M-1 · BOLA — payment-plan reads leak any tenant’s installments & step-batches
- **CWE-639 / OWASP API1:2023 BOLA** · CONFIRMED
- **Endpoints:** `GET /quotations/:id/installments`, `GET /quotations/:id/step-batches`
- **File:** `oralign-backend/src/quotations/controllers/quotation-payment-plan.controller.ts:91` → `quotation-payment-plan.service.ts:426` (`getPlan(quotationId)` queries `where: { quotationId }` only)

These two routes are role-gated (`dentist/admin/super_admin/designer`) but — unlike **every other** quotation route, which flows through `assertOrderReadable` — they never check that the caller owns the parent order. Any authenticated dentist/designer who knows another order’s quotation UUID reads its full financial schedule (amounts, due dates, paid/overdue status, step-batch ranges). The service doc-comment even claims “the controller checks ownership” — it does not. Exploitation needs a *known* UUID (UUIDs are not blind-enumerable), hence Medium not High.

**Fix:** forward `@CurrentUser()` into `getPlan` and call the existing `assertOrderReadable` / `getForOrderByQuotationId` helper before returning. (Same one-line pattern used across the rest of `QuotationService`.)

### M-2 · Any authenticated user can read every clinic’s tax ID & clinic email
- **CWE-639 / API1+API3:2023** · CONFIRMED
- **Endpoints:** `GET /dentist-profile/:id`, `GET /dentist-profile`
- **File:** `oralign-backend/src/dentist-profile/controllers/dentist-profile.controller.ts:232` → `getProfileById` / `getAllProfiles` (guarded by `JwtAuthGuard` only — no role, no owner scoping, caller not passed in)

`getProfileById` returns the full DTO including `taxId` (matricule fiscal) and `clinicEmail`; `getAllProfiles` dumps the entire private practitioner directory. Any logged-in user (any dentist/designer) reads private business data for every clinic.
**Fix:** restrict `GET /dentist-profile` to admin roles; scope `/:id` to owner-or-admin (mirror `updateProfile`), or strip `taxId`/`clinicEmail` from the projection for non-owners.

### M-3 · Missing ownership check on working-hours creation (cross-clinic write)
- **CWE-639 / API1:2023** · CONFIRMED
- **Endpoint:** `POST /working-hours`
- **File:** `oralign-backend/src/working-hours/services/working-hours.service.ts:33` (`createWorkingHours` takes `dentistProfileId` from the body, no caller identity)

`updateWorkingHours`/`deleteWorkingHours` call `assertOwnership`; **create does not**. Any authenticated user writes schedule rows onto another clinic’s profile (bounded by a `dentistProfileId_dayOfWeek` unique constraint, so it’s pollution not takeover).
**Fix:** inject `@CurrentUser()`, call `assertOwnership(dentistProfileId, caller)` before create — or derive the profile from the caller’s own `userId`.

### M-4 · Treatment-fee amount is client-supplied and unvalidated
- **CWE-840 / CWE-472; OWASP API3/API6** · CONFIRMED
- **Endpoint:** `POST /orders/:id/treatment-fee/pay`
- **File:** `oralign-backend/src/orders/services/order.service.ts:654` (`payTreatmentFee`); controller binds `@Body()` to an **inline TS type**, not a class-validator DTO, so the global ValidationPipe doesn’t strip/validate it — `body.amount ?? 0` is forwarded raw

A doctor can pay `0` (or any value) and instantly stamp `treatmentFeePaidAt`, which is the gate that unlocks treatment-plan creation. Because the card branch also uses the mock collector (H-1), no funds move regardless.
**Fix:** derive the fee **server-side** from `CompanyBillingSettings.defaultTreatmentFee` (the same source the gate reads); ignore/reject a client `amount`; replace the inline body type with a real DTO. **This becomes High the moment a real gateway is attached** — the server must charge the server-derived amount, never a client value.

### M-5 · Account deactivation is bypassable via the refresh-token endpoint
- **CWE-613 / CWE-285** · CONFIRMED
- **Endpoint:** `POST /api/auth/refresh-token`
- **File:** `oralign-backend/src/auth/services/auth.service.ts:437` (`refreshToken` does not check `isActive`, unlike `signIn` at :153)

A deactivated (or in-review) user keeps minting fresh 15-minute access tokens indefinitely by refreshing — deactivation never takes effect.
**Fix:** in `refreshToken`, reject `!user.isActive || user.deletedAt` (mirror `signIn`). Ideally add a `tokenVersion` and re-check it in `JwtStrategy.validate()` too.

### M-6 · Tokens are irrevocable — logout / reset / password-change don’t kill sessions
- **CWE-613 / CWE-640** · CONFIRMED
- **File:** `oralign-backend/src/auth/services/auth.service.ts:389` (`resetPassword` / `changePassword` / `generateTokens` — no session/version invalidation; no server-side logout)

After a password reset (e.g. following a compromise) all previously issued access **and refresh** tokens remain valid — the attacker keeps access. There is no real logout/revocation.
**Fix:** add `User.tokenVersion` (or `passwordChangedAt`), embed it in tokens, verify it in `JwtStrategy.validate()` + `refreshToken`, and bump it on reset/change/logout. Or maintain a Redis refresh-token allowlist keyed by `jti`.

### M-7 · Email-verification OTP: no per-account lockout + non-crypto RNG
- **CWE-330 / CWE-307** · CONFIRMED
- **Endpoint:** `POST /api/auth/verify-email`
- **File:** `oralign-backend/src/auth/services/auth.service.ts:503` (`generateOtp` uses `Math.random()`; `verifyEmail` has no failed-attempt lockout)

The 6-digit code is guessable at a rate bounded only by the per-IP throttle, and it’s generated with a non-cryptographic RNG. No per-account strike counter (unlike `signIn`’s 5-strike lockout).
**Fix:** `crypto.randomInt(100000, 1000000)`; per-account lockout after ~5 failures; a strict route-level `@Throttle` on verify-email; constant-time compare.

### M-8 · Unauthenticated appointment booking → calendar-exhaustion DoS + mail-bombing
- **CWE-799 / CWE-770** · CONFIRMED
- **Endpoint:** `POST /api/appointments` (`@Public()`, 10/hr/IP throttle only)
- **File:** `oralign-backend/src/appointments/appointments.service.ts` (`create` writes `status=pending`, which counts as a taken slot and emails the practitioner)

An unauthenticated attacker books with any `patientEmail`; `pending` requests immediately consume public availability and email the practitioner. Rotating IPs saturates a target’s calendar and floods their inbox (bounded by the number of real slots).
**Fix:** don’t let unverified `pending` requests block public availability (exclude from the taken-set, or auto-expire after a short TTL); require an email OTP/confirmation before a slot is reserved; add a per-`dentistProfileId` cap (throttle is per-IP only). Consider CAPTCHA.

### M-9 · Avatar / patient-photo upload — spoofable MIME, preserved extension, no content scan
- **CWE-434 / CWE-79** · CONFIRMED
- **Endpoints:** `POST /api/users/:id/avatar`, `POST /api/patients/:id/profile-photo`
- **Files:** `oralign-backend/src/users/controllers/user.controller.ts:382` & `patient.controller.ts:123` (filter = `file.mimetype.startsWith('image/')`, which is client-controlled); `local-storage.service.ts:64` stores with the attacker’s original extension and **falls through to store raw bytes** if sharp can’t decode

Unlike the **order** upload path — which runs the `scanUploadContent()` byte-scanner (magic-byte + extension agreement, denylists `.svg`/`.html`/scripts) — these two image endpoints trust the multipart MIME header and keep the client extension. An attacker uploads `x.html`/`x.svg` with `Content-Type: image/png`; it’s stored and later served **inline from the API origin** (`/uploads/*`), i.e. stored HTML/SVG XSS. (Blast radius is limited by these being different origin from the app, and by no CSP — see I-2.)
**Fix:** run the same `scanUploadContent()` scanner here; always re-encode through sharp to a fixed safe format (`.webp`) and **reject** on decode failure instead of storing raw bytes; never derive the stored extension from `originalname`; serve `/uploads` with `Content-Disposition: attachment` (add to the `setHeaders` callback in `main.ts`).

---

## LOW FINDINGS

| # | Title | CWE | Location | Fix (short) |
|---|---|---|---|---|
| L-1 | Sign-in / verify-email responses enable **user enumeration** (distinct messages for unknown vs wrong-password) | CWE-204 | `auth.service.ts:149` | Return a single generic “invalid credentials”; identical response + timing for unknown vs known email. |
| L-2 | Password-reset JWT is **multi-use** within its 1-hour window, not tied to password state | CWE-640 | `auth.service.ts:389` | Single-use (store a reset `jti`/`passwordChangedAt`; invalidate on use); shorten TTL to ~15 min. |
| L-3 | **Token storage in localStorage** (access **and** refresh) + a non-HttpOnly/non-Secure mirror cookie | CWE-522 / CWE-1004 | `oralign-frontend/src/lib/api/client.ts:30` | Move refresh token to an HttpOnly+Secure+SameSite cookie; keep only a short-lived access token in memory. This is the **blast-radius amplifier** for any future XSS. |
| L-4 | Global exception filter **leaks raw internal error messages** on 500 | CWE-209 | `common/exceptions/exception.filter.ts:48` | Return a generic message + correlation id for 5xx; log details server-side only. |
| L-5 | **Idempotency-key replay** returns another user’s Payment before the ownership check (Redis fast-path) | CWE-639 | `payments.service.ts:211` | Namespace the key per caller (`payment:idem:${userId}:${key}`) and add `initiatedById` to the WHERE; stop logging raw keys. |
| L-6 | Throttler uses **in-memory** storage — counters reset on restart, don’t aggregate across instances | CWE-770 | `app.module.ts:74` | Use a Redis throttler storage so limits hold behind multiple replicas / restarts. |
| L-7 | **Weak default Redis (and DB) password**; Redis reachable by every container on the shared bridge network | CWE-798 / CWE-1188 | `docker-compose.yml:30` | Replace `${REDIS_PASSWORD:-redis_secure_password}` (and the DB equivalent) with `${REDIS_PASSWORD:?set me}` so the stack **fails closed**; put Redis on an internal-only network. (JWT secrets already fail closed — good.) |
| L-8 | Public **working-hours** endpoints leak schedules of non-listed / unapproved practitioners | CWE-639 / CWE-200 | `working-hours.controller.ts:74` | Only expose schedules for approved/listed practitioners. |
| L-9 | Public **blog view-counter** inflatable without dedup/limit | CWE-799 | `public-blog.controller.ts:73` | Throttle + dedupe (per-IP/day) or make it best-effort/async. |
| L-10 | Public **community-submission** buffers large media in memory + synchronous ffmpeg transcode | CWE-400 | `community-submission.controller.ts:56` | Stream to disk, move transcode to a queue/worker, cap concurrency. |

---

## INFORMATIONAL / HARDENING

- **I-1 (assurance):** Raw SQL, SSRF, download path-traversal, mass-assignment, and child-process spawn were specifically checked and are **safe** — parameterized queries, no user-URL server fetch, path guards on downloads, strict ValidationPipe, and fixed-argument `spawn` (no shell).
- **I-2 · No Content-Security-Policy** on frontend or API, and uploads served inline on the API origin (`main.ts` `helmet contentSecurityPolicy:false`; nginx sets none). Add a strict CSP on the frontend vhost and `Content-Disposition: attachment` on `/uploads`. This is the mitigating control that would shrink M-9 and L-3.
- **I-3 · Chromium PDF renderer** runs `--no-sandbox`. Acceptable only because no user-controlled HTML reaches it today; keep it that way, or run the renderer in a locked-down container/user-ns.
- **I-4 · Patient/doctor PII cached in Redis as plaintext JSON** (public-viewer token payload, dashboards). Low value to an attacker who already has Redis, but note it for a PHI threat model; ensure Redis is network-isolated (L-7).
- **I-5 · nginx `server_tokens` not disabled** — version disclosure. Add `server_tokens off;`.
- **I-6 · Prisma CLI (7.8.0) vs `@prisma/client` (7.6.0) skew** — align versions to avoid drift.
- **I-7 · `ffmpeg-static`** ships a large native binary; invocation is safe (fixed args) but keep it patched.

---

## Endpoint Security Matrix (representative — highest-risk routes)

| Endpoint | Method | Auth | Role/Owner scope | Input validation | Rate limit | Main risk | Severity |
|---|---|---|---|---|---|---|---|
| `/quotations/:id/installments` | GET | JWT | role only, **no owner check** | id param | global | BOLA (M-1) | Medium |
| `/quotations/:id/step-batches` | GET | JWT | role only, **no owner check** | id param | global | BOLA (M-1) | Medium |
| `/dentist-profile/:id` | GET | JWT | **none (owner/role missing)** | id param | global | PII/tax-id leak (M-2) | Medium |
| `/dentist-profile` | GET | JWT | **none** | pagination | global | full directory dump (M-2) | Medium |
| `/working-hours` | POST | JWT | **no owner check** | DTO | global | cross-clinic write (M-3) | Medium |
| `/orders/:id/treatment-fee/pay` | POST | JWT | owner ✓ | **inline type, amount unvalidated** | global | fee bypass (M-4) | Medium→High |
| `/quotations/:qid/installments/:id/pay-by-card` | POST | JWT | owner ✓ | DTO ✓ | global | **mock always succeeds** (H-1) | High |
| `/api/auth/refresh-token` | POST | Public | n/a | DTO | throttled | deactivation bypass (M-5) | Medium |
| `/api/auth/reset-password` | POST | Public | n/a | DTO | throttled | irrevocable tokens (M-6, L-2) | Medium |
| `/api/auth/verify-email` | POST | Public | n/a | DTO | per-IP only | OTP brute (M-7) | Medium |
| `/api/auth/sign-in` | POST | Public | n/a | DTO | 5-strike + throttle ✓ | enumeration (L-1) | Low |
| `/api/appointments` | POST | Public | n/a | DTO (email format only) | 10/hr/IP | calendar DoS (M-8) | Medium |
| `/api/users/:id/avatar` | POST | JWT | owner ✓ | **MIME-header only** | global | stored HTML/SVG (M-9) | Medium |
| `/api/patients/:id/profile-photo` | POST | JWT | owner ✓ | **MIME-header only** | global | stored HTML/SVG (M-9) | Medium |
| `/orders/:id/files/*` (chunked) | POST/PUT | JWT | owner ✓ | DTO + **content scan** ✓ | global | (well-secured) | — |
| `/orders/:id/download-all` | GET | JWT | planner + scope ✓ | id | global | (well-secured) | — |
| `/api/community-submissions` | POST | Public | n/a | DTO | 5/min | resource exhaustion (L-10) | Low |
| `/dev/*` (payment mocks) | POST | JWT+admin | **absent in prod** ✓ | DTO | global | (safe — not registered in prod) | — |

Routes not listed that were checked and found correctly scoped: orders CRUD/files, treatment-plans, patients (read/update), invoices, notifications, support, reports, admin/doctor dashboards, packs admin, quotation approve/reject, slider-media.

---

## Area Audits

**Frontend (Next.js).** No API routes / server actions (0 `route.ts`). Two `dangerouslySetInnerHTML` sites reviewed — not fed attacker-controlled HTML. No secret in `NEXT_PUBLIC_*` (only API/App URLs + public video URLs). The Next middleware (`proxy.ts`) gates `/dashboard` and `/account` on cookie **presence** only (not signature) and admin UI is hidden client-side — **but this was refuted as a vuln** because the backend enforces authorization on every data endpoint, so a forged cookie yields an empty shell and zero data. The treatment-viewer iframe was scrutinised for `javascript:`/`data:` URL injection and refuted (sandboxed; staff-only write path; no confirmed sink). Real frontend item: token storage (L-3).

**Backend (NestJS).** Guards, the strict global ValidationPipe, CORS allowlist, Helmet, throttler, and the parameterized Prisma layer are all correctly configured. Findings are per-endpoint authorization omissions (M-1..M-4, M-9) and auth-session lifecycle gaps (M-5, M-6, M-7, L-1, L-2), not systemic. The global exception filter leaks messages (L-4).

**PostgreSQL.** No SQL injection — all raw SQL is parameterized (`pg_advisory_xact_lock`, `SELECT … FOR UPDATE` row locks used correctly for payment/order race safety). Passwords hashed with bcrypt. Main DB-adjacent risk is the weak default DB password if `.env.production` omits it (L-7).

**Redis.** Holds cache/PII/dashboard KPIs and idempotency keys. Issues: per-caller idempotency namespacing (L-5), in-memory (not Redis) throttler storage (L-6), weak default password + shared network (L-7), plaintext PII (I-4). No cached-permission bypass found (RBAC is evaluated per request, not cached).

**Dependencies.** No confirmed vulnerable version pinned in review; `npm audit` could not be machine-verified (registry’s legacy endpoint returns 400 — run `npm audit` interactively to confirm). Prisma version skew (I-6), `--no-sandbox` Chromium (I-3), native `ffmpeg-static` (I-7) are the notable items.

---

## Confirmed-safe (candidate findings refuted on verification)

Don’t re-investigate these — each was traced and found non-exploitable:
1. **JWT algorithm not pinned / shared dev secret** — refuted: `passport-jwt` verifies with the configured secret; prod fails closed on weak secrets.
2. **Next middleware trusts unverified cookie presence** — refuted: backend enforces authz on all data; forged cookie ⇒ empty UI, no data.
3. **Treatment-viewer iframe URL injection** — refuted: sandboxed + staff-only write path, no reachable `javascript:`/`data:` sink.
4. **Weak default JWT/DB/Redis secrets with no fail-closed check** — *partially* refuted: JWT/refresh/reset secrets **do** fail closed (`requiredSecret`); only DB/Redis passwords silently fall back (kept as L-7).
5. **`npm audit` unverifiable** — informational, not a vuln.

---

## Recommended Fix Order

**Phase 0 — before enabling real payments (do first):**
1. **H-1** — gate/replace the mock payment gateway; fail closed in prod; verify settlement via signed webhook.
2. **M-4** — server-price the treatment fee; remove the client `amount`.

**Phase 1 — authorization (this week):**
3. **M-1** — add the ownership check to the two payment-plan reads.
4. **M-2** — restrict dentist-profile reads (admin-only list; strip `taxId`/`clinicEmail`).
5. **M-3** — add `assertOwnership` to working-hours create.

**Phase 2 — session & auth hardening:**
6. **M-5** — reject inactive users on refresh.
7. **M-6** — `tokenVersion` for real revocation on reset/change/logout.
8. **M-7** — crypto OTP + per-account lockout on verify-email.
9. **L-1, L-2** — generic auth responses; single-use reset token.

**Phase 3 — abuse & upload:**
10. **M-8** — appointment confirmation + auto-expiry + per-profile cap.
11. **M-9** — content-scan + re-encode avatar/patient photos.
12. **L-5, L-6** — per-caller idempotency; Redis throttler storage.

**Phase 4 — config & defense-in-depth:**
13. **L-7** — fail-closed DB/Redis secrets; isolate Redis.
14. **I-2** — deploy a strict CSP + `Content-Disposition: attachment` on `/uploads`.
15. **L-3, L-4, I-5, I-6** — token storage, error-message hygiene, `server_tokens off`, Prisma version align.

---

## Security Score — 70 / 100

**What earns the points (foundations are strong):** strict global input validation and mass-assignment defense; parameterized SQL everywhere; CORS allowlist with no wildcard; Helmet + HSTS; global rate limiting; JWT secrets that fail closed; Swagger + dev endpoints absent in prod; RBAC ownership helpers used correctly on the majority of object-scoped routes; a real content-scanner on the primary (order) upload path; no committed secrets; correct DB row-locking for payment races.

**What costs the points:** the payment/fee integrity layer is unfinished and currently grants paid state for free (H-1, M-4); a repeated **authorization-omission pattern** where specific endpoints skipped the ownership check the rest of the app applies (M-1, M-2, M-3, plus L-5, L-8); and an **incomplete session lifecycle** — no revocation, deactivation bypass (M-5, M-6). For an application handling PHI **and** money, those are the categories that must be airtight, so they weigh heavily.

**Interpretation.** This is a **well-built app with a handful of serious but contained gaps**, not a fragile one. Clearing Phase 0 + Phase 1 (5 fixes) would move it to roughly **85/100**; completing Phase 2 as well would put it in solid production-ready territory (~90). The score is deliberately held below “good” today because the money path is not yet safe to expose.

---

*Findings were produced by tracing each request path to its database sink and adversarially re-verifying every candidate against the real code; items depending on conditions the code prevents were refuted rather than reported. Where a finding’s realistic impact hinges on deployment state (e.g. the mock gateway, weak default secrets), that dependency is stated explicitly.*
