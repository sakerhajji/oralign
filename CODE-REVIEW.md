# OraLign — Staff-level Codebase Review

**Scope:** full monorepo (`oralign-frontend` Next.js 16 / React 19 · `oralign-backend` NestJS 11 / Prisma 7 / Postgres / Redis / Socket.IO · deploy). **Method:** 11 specialist read-only passes (frontend code quality, backend code quality, architecture, UI/UX, design system, responsiveness, accessibility, performance, animations, security, React correctness) over ~486 source files; every finding cites a real `file:line`; the highest-impact findings were re-verified by hand against the code. **No code was changed.** Date: 2026-08-15.

---

## Phase 1 — Understanding

**Stack.** Frontend: Next.js 16 (App Router, `src/proxy.ts` middleware), React 19, TypeScript strict, Tailwind v4 (`@theme inline`) + shadcn/radix primitives, TanStack Query 5, react-hook-form + zod, socket.io-client, three (STL viewer), recharts, framer-motion + gsap (both installed), leaflet, country-state-city. Backend: NestJS 11, Prisma 7 (`@prisma/adapter-pg`), Redis (cache-manager), Socket.IO gateways ×3, Puppeteer PDF (quotes/invoices/order sheet), sharp/yauzl media pipeline, nodemailer, class-validator DTOs with a strict global `ValidationPipe`. Infra: docker-compose (dev + production overlay), nginx TLS termination for `oralign.com.tn` / `api.oralign.com.tn`.

**Architecture.** Two apps, no shared package: the frontend hand-mirrors the API contract in one 2,085-line `lib/types/index.ts`. Frontend data layer is disciplined — every feature has a `*.service.ts` (axios `apiClient` with 401→refresh interceptor) and a hooks file with a query-key factory + targeted `setQueryData`/invalidation. Auth = JWT (15 min access + 7 d refresh, `tokenVersion` revocation) stored in **localStorage**, plus a non-HttpOnly mirror cookie the middleware only checks for presence. State: React Query for server state, small contexts (`AuthProvider`, `LangProvider`), local `useState` elsewhere. Backend: feature modules with controller/service/DTO; auth via per-controller `JwtAuthGuard`+`RolesGuard` (only `ThrottlerGuard` is global); notifications via `EventEmitter2` listener + direct `MailService` calls; media processed by an in-process async queue; single-instance assumptions throughout (in-memory throttler, in-process event bus, default socket adapter).

**Major features.** Order wizard (6 steps, clinical file slots, odontogram, chunked/resumable 1 GB uploads), packs/quotations/payment plans (card mock / bank transfer / cash, installments, step batches), treatment plans + IPR, treatment-fee flow, admin/doctor dashboards (KPI + WS invalidation), support & treatment chat, blog CMS, public showcase, onboarding, appointments, invoices/PDFs, i18n FR/EN (app) + FR/EN/AR (showcase).

**Design system.** Real shadcn v4 primitives used at volume (`<Button>` 365×, `<Card>` 127×, `<Skeleton>` 91×). Tokens: shadcn oklch palette only — **no success/warning/info tokens**, no z-index scale, no size below `text-xs`, and the showcase's brand palette lives only as `--sc-*` CSS vars (never registered in `@theme`).

**Conventions.** Query-key factories per domain; `formatPrice` declared as the single money formatter; `useT()` for i18n; ownership checks (`assertOwnership` / admin-or-owner-or-designer) — but each of these conventions is violated in several places (see findings).

---

## Strengths (genuine)

- **Payments core is solid**: `PaymentsService.handleSuccess` locks the installment with `SELECT … FOR UPDATE`, handles idempotent replays and sibling races, and updates payment/installment/batch/quotation/order in one transaction (`oralign-backend/src/payments/services/payments.service.ts:565-796`).
- **Upload security is genuinely hardened on the main path**: byte-level marker scan + extension denylist, ZIPs inspected via central directory only (never extracted → zip-slip structurally impossible) (`media/file-security.ts`, `media/processors/zip.processor.ts`); all raw SQL is parameterized Prisma tagged templates.
- **Odontogram engineering**: `React.memo` with documented rationale, per-tooth `contain: layout style paint`, hover-only layer promotion, streamed sprite load with progress, native `<button>`s with descriptive `aria-label`/`aria-pressed` (`components/orders/odontogram-selector.tsx`).
- **Socket hooks are robust**: ref-counted shared socket, async `auth` refreshing the token before every reconnect, room membership replayed on `connect`, symmetric `off()` cleanup (`lib/hooks/use-*-socket.ts`).
- **React Query configured well** (5-min stale, no focus refetch, `placeholderData` + hover prefetch on orders); async effects consistently guard against races with cancellation flags.
- **List pages share a coherent UX pattern**: search + Filters(N) + chips + explicit empty/loading/error + a mobile card list under `md`.

---

## Phase 2 — Audit

### 🔴 Critical

**POST /auth/change-password has no auth guard — unauthenticated and crashes with 500 on every call**
File: `oralign-backend/src/auth/controllers/auth.controller.ts:132`
Problem: `AuthController` has no class-level guard and the handler has no `@UseGuards`; `JwtAuthGuard` is not global (only `ThrottlerGuard` is `APP_GUARD` in `app.module.ts:134`). `@CurrentUser()` (line 139) is therefore always `undefined`, `currentUser.sub` throws, and the filter returns an opaque 500. *(Verified by hand.)*
Why it matters: A sensitive auth route is reachable without a token, and the user-facing password-change feature is broken (the `tokenVersion` bump on change never fires — undermining the M-6 revocation fix). It only "fails closed" today by accident.
Recommended fix: Add `@UseGuards(JwtAuthGuard)` to the handler (or class-level, keeping `@Public()` on pre-auth routes). Add an e2e check: unauthenticated call → 401.

**PUT /users/:id lets any user set a new password with no current-password check and no session revocation**
File: `oralign-backend/src/users/services/user.service.ts:150`
Problem: `UpdateUserDto` exposes `password?` (`users/dto/user.dto.ts:172`); `updateUser` hashes it for self-edits (line 152-153) without verifying the current password and without incrementing `tokenVersion` — unlike `AuthService.changePassword` which does both. `PUT /users/:id` carries no `@Roles`. *(Verified by hand.)*
Why it matters: This is the blast-radius amplifier for the localStorage token design: any XSS or 15-min stolen access token converts into a **permanent** account takeover (set password → old sessions stay valid). Combined with the item above, there is currently no correct self-service password change path.
Recommended fix: Remove `password` from `UpdateUserDto`; self-service change goes only through `/auth/change-password`. If admins need to force-set, keep it inside the existing `isAdmin` branch and bump `tokenVersion` in the same update.

**Order wizard `saveDraft` sets `savedOrder` only after the tooth-instructions PUT — a failed PUT after a successful create yields duplicate orders**
File: `oralign-frontend/src/components/orders/order-wizard.tsx:655`
Problem: `nextOrder` is created/updated (655-657), then `updateTeeth.mutateAsync` (682-691), and only then `setSavedOrder(nextOrder)` (692). If the second call rejects, the order exists server-side but `savedOrder` stays undefined → the next Save/Continue calls `createOrder` again. The rejection is also unhandled (`onClick={saveDraft}` at 929).
Why it matters: Duplicate draft orders for the same patient are a data-integrity problem for the clinic and the planner queue.
Recommended fix: `setSavedOrder(nextOrder)` immediately after create/update resolves; wrap the tail in try/catch (hooks already toast).

**Orders page bulk actions operate on rows selected on other pages/filters**
File: `oralign-frontend/src/app/dashboard/orders/page.tsx:293`
Problem: `selectedIds` is a plain Set reset only on trash-toggle and mutation success; page/tab/filter changes keep hidden ids, yet `runBulkDelete`/`runBulkPermanentDelete`/`runBulkStatus` send `Array.from(selectedIds)` (439-464). The comment at 290-292 claims the opposite.
Why it matters: An admin can permanently delete or re-status orders that are **not visible** — irreversible operations on unseen data.
Recommended fix: Reuse the patients-page pattern (`{key: paramsKey, ids}` and derive selection only when key matches), or clear selection whenever `params` change and restrict payloads to `orders.filter(o => selectedIds.has(o.id))`.

### 🟠 High Priority

**Order-file previews / STL / downloads use raw `fetch` with the raw access token and never refresh — deterministic failure after 15 min**
File: `oralign-frontend/src/components/orders/order-file-upload.tsx:3057`
Problem: `fetchSecureBlobUrl` (3057), `fetchStlBuffer` (1689), `fetchOriginalBlob` (3199), `downloadOrderFile` (3258) and `useAuthenticatedObjectUrl` (`treatment-plan-review.tsx:820`) bypass the axios 401→refresh interceptor; three near-identical "authed blob URL" implementations exist (`lib/hooks/use-authed-image.ts` + two copies).
Why it matters: A doctor mid-session on the most-used clinical surface gets "HTTP 401" on Copy/Edit/Download; `downloadOrderFile` even saves the 401 JSON body as a `.jpg`/`.stl` (no `response.ok` check, 3259-3263).
Recommended fix: One `fetchAuthedBlob(url)` built on `apiClient` (`responseType: 'blob'`) in `lib`; where streaming progress is required, call `await ensureValidAccessToken()` first. Delete the copies.

**Treatment-fee receipt upload skips the M-9 upload hardening entirely**
File: `oralign-backend/src/orders/controllers/order.controller.ts:287`
Problem: `POST /orders/:id/treatment-fee/proof` uses `diskStorage` with **no `fileFilter`**, no `validateFile`, no `scanUploadContent`, no dangerous-extension check — only a 10 MB cap; multer writes `<Date.now()>-<originalname>` under `/uploads` **before** the authorization checks in the service run, so rejected requests leave files on disk. *(Verified by hand.)*
Why it matters: A dentist can store `x.html`/`x.svg` served from the API origin; only the recently added `/uploads` sandbox CSP + nosniff stand between that and stored XSS. Same class as the fixed M-9.
Recommended fix: Reuse `isDangerousUploadExtension()` + `scanUploadContent()`; restrict to image/PDF by magic bytes; re-encode images via sharp (as `LocalStorageService` does); store PDFs under a UUID name with fixed `.pdf`; authorize before writing (memory storage or check first).

**Order wizard loads only the first 100 patients / 100 dentists and filters client-side**
File: `oralign-frontend/src/components/orders/order-wizard.tsx:317`
Problem: `patientParams = {page:1, limit:100}` feeds an in-memory filter (1366); no `search` param is ever sent (the picker's own comment admits the cap).
Why it matters: Past 100 patients the wizard silently cannot find records → users create duplicates.
Recommended fix: Send the debounced query to `patientsService.getPatients({search})` (list pages already do this) or show "first N shown — refine search" when `total > data.length`.

**Support chat: mark-read effect keys on `messages.length`, so socket-delivered admin replies stay unread**
File: `oralign-frontend/src/components/support/support-bubble.tsx:464`
Problem: The effect fires when `unreadByDoctor > 0` but depends on `[conversation.id, messages.length]`; the socket handler appends the message (length changes) while cached `unreadByDoctor` is still 0, so the read never fires; the later `unreadByDoctor` change is not a dependency.
Why it matters: Stuck unread badge / wrong read receipts — the exact state the effect exists to prevent.
Recommended fix: Depend on the actual condition: `[conversation.id, unread]` with `unread = data?.conversation?.unreadByDoctor ?? 0`.

**Admin dashboard freezes the range's `to` at mount (ms precision) — WS invalidation / polling can never surface new data, and every mount is a cache miss**
File: `oralign-frontend/src/components/dashboard/admin-dashboard.tsx:77`
Problem: `defaultRange()` computes `to = new Date().toISOString()` once; it goes into the query key and into `createdAt: {lte: to}` on the backend. Presets in `date-range-picker.tsx:33-34` do the same.
Why it matters: The "real-time" admin landing page silently goes stale the moment it mounts; the ms timestamp defeats React Query and backend cache keys.
Recommended fix: For presets send only `from` and let the backend default `to = now` per request (`resolveRange` already does); include `to` only for explicit custom ranges.

**`approveQuoteIfSent` duplicates quote approval and moves the order to fabrication before any money lands**
File: `oralign-backend/src/payments/services/payments.service.ts:1152`
Problem: The payments path re-implements approval logic that lives in the quotation service and advances order status on a payment *intent* rather than a settled payment.
Why it matters: Two divergent implementations of a state transition around money; the order can show "fabrication" with nothing collected.
Recommended fix: Delegate to `QuotationService.approve` and gate the fabrication transition on `handleSuccess` only.

**PUT /treatment-plans/:id lets a planner (incl. designer) write `status` directly, bypassing approve()/reject()**
File: `oralign-backend/src/treatment-plans/services/treatment-plan.service.ts:307`
Problem: The generic update accepts a status field, so the dedicated transition methods (with their side effects/notifications) can be skipped.
Why it matters: State-machine bypass on a clinical workflow.
Recommended fix: Strip `status` from the update DTO; transitions only via the dedicated endpoints.

**No Prisma error mapping — unique-constraint / not-found races surface as opaque 500s**
File: `oralign-backend/src/common/exceptions/exception.filter.ts:50`
Problem: `PrismaClientKnownRequestError` (P2002/P2025) falls into the generic 500 branch.
Why it matters: Legit user errors (duplicate email, concurrent delete) become "Internal server error"; monitoring noise hides real crashes.
Recommended fix: Map P2002→409, P2025→404 in the filter (10 lines).

**Five modules re-provide `PrismaService` → up to six PrismaClient + `pg Pool(20)` instances**
File: `oralign-backend/src/notifications/notification.module.ts:21`
Problem: `PrismaService` is listed in `providers` of several feature modules instead of one `@Global()` PrismaModule.
Why it matters: Connection pool multiplication (6×20 = 120 potential connections against Postgres) and lifecycle hooks running per instance.
Recommended fix: Single `@Global()` `PrismaModule` exporting `PrismaService`; remove from feature `providers`.

**Effectively no automated tests**
File: `oralign-backend/src/app.controller.spec.ts:1`
Problem: 48 lines of Nest boilerplate; no frontend test runner; the bash suites (`scripts/test-*.sh`) require a live Docker stack.
Why it matters: Every refactor in this report (and the 2–4k-line components) has no safety net; the bash suites already drifted stale (fixed twice this week).
Recommended fix: Start with high-value seams: backend e2e for auth/payments/uploads (supertest against a test DB), Vitest for `lib/utils` + hooks; wire into CI.

**`OrderService` is a 2,445-line god-service (orders + treatment-fee payments + uploads + ZIP export + PDF)**
File: `oralign-backend/src/orders/services/order.service.ts:238`
Problem: Unrelated concerns share one class and one injection surface; the ownership check (admin/owner/designer) is reimplemented in five services (`treatment-plan.service.ts:106` etc.).
Why it matters: Change amplification and merge conflicts; the copy-pasted authz checks are exactly where BOLA bugs come from (three were fixed in the security audit).
Recommended fix: Extract `OrderFilesService`, `OrderExportService`, `TreatmentFeeService`; one shared `OrderAccessPolicy` (or guard) for the admin/owner/designer rule.

**Notification design split across two channels (direct `MailService` calls + event bus) fired side by side**
File: `oralign-backend/src/orders/services/order.service.ts:580`
Why it matters: Two sources of truth for "who gets told what"; duplicated/missed notifications when one path changes.
Recommended fix: Emit domain events only; the listener owns mail + in-app + WS.

**Access + refresh tokens in localStorage; mirror cookie non-HttpOnly and presence-only**
File: `oralign-frontend/src/lib/api/client.ts:40`
Problem: 7-day refresh token readable by any script; no CSP on the frontend.
Why it matters: Any XSS = full session theft (and, with the `PUT /users/:id` issue, permanent takeover). Also: the mirror cookie is a session cookie while tokens persist → after a browser restart users are bounced to `/login` despite a valid session (`client.ts:22`).
Recommended fix: Move the refresh token to an HttpOnly, SameSite=Lax cookie issued by the backend (`/auth/refresh` reads it); keep the short access token in memory; add a frontend CSP. Medium-term item, but it changes the severity of every XSS.

**`country-state-city` ships an 8.2 MB world-cities JSON into onboarding + billing client bundles**
File: `oralign-frontend/src/components/ui/country-city-picker.tsx:4`
Problem: `import { Country, City } from 'country-state-city'` statically pulls `city.json` (8,064,491 B). *(Verified.)*
Why it matters: Multi-MB JS parse on onboarding — the first-run experience — and on every billing-settings visit.
Recommended fix: Load cities lazily per selected country via a small API route / dynamic import of a per-country slice, or replace with a country-only picker + free-text city.

**Root layout wraps the public marketing site in dashboard providers, shipping the ~68 KB gz dashboard dictionary to every showcase page**
File: `oralign-frontend/src/app/layout.tsx:106`
Recommended fix: Move `QueryProvider/AuthProvider/LangProvider` into `app/dashboard/layout.tsx` (+ account/onboarding); showcase keeps its own `_lib/i18n`.

**Inline STL viewers run an unconditional 60 fps WebGL render loop per slot for the lifetime of the page**
File: `oralign-frontend/src/components/orders/order-file-upload.tsx:1891`
Problem: `animate()` calls `renderer.render()` every frame forever with `autoRotate` false — nothing changes between frames. *(Verified.)*
Why it matters: Two live viewers = continuous GPU/CPU burn on the order page (laptop fans, battery), and it competes with everything else that animates.
Recommended fix: Render on demand: `controls.addEventListener('change', render)` + one render after load/resize; pause when `document.hidden` or off-screen (IntersectionObserver).

**Admin trend chart wraps oklch tokens in `hsl()` — colors are invalid**
File: `oralign-frontend/src/components/dashboard/admin-dashboard.tsx:361`
Problem: `stopColor="hsl(var(--primary))"` while `--primary: oklch(0.205 0 0)` (`globals.css:60`). *(Verified.)*
Recommended fix: `stopColor="var(--primary)"`.

**Users page "Active / Blocked" KPI tiles count only the current page**
File: `oralign-frontend/src/app/dashboard/users/users-content.tsx:335`
Problem: `data?.data.filter(u => u.isActive).length` over the paginated slice. *(Verified.)*
Recommended fix: Return counts from the API (or a `/users/stats` endpoint) — never derive totals from a page.

**Payments error state renders docker/npm shell commands to end users**
File: `oralign-frontend/src/app/dashboard/payments/history/history-content.tsx:749`
Problem: `docker compose up -d --build backend`, `npx prisma migrate deploy`, `npm run start:dev` in the JSX error branch. *(Verified.)*
Recommended fix: Replace with the standard `EmptyState`/error copy + retry.

**Orders list: sort menu hidden on desktop and column headers sort one direction only**
File: `oralign-frontend/src/app/dashboard/orders/page.tsx:558`
Recommended fix: Show the sort control on all breakpoints; header click toggles asc/desc with an indicator.

**Notification bell content is a radix `DropdownMenu` with no menu items — keyboard users cannot reach anything inside**
File: `oralign-frontend/src/components/notifications/notification-bell.tsx:90`
Problem: `<DropdownMenuContent>` (role=menu) contains plain `<Button>`/`<Link>` rows; radix menu keyboard nav only visits `DropdownMenuItem`s.
Recommended fix: Use `Popover` (or `Sheet` on mobile) for a panel of arbitrary content; keep `DropdownMenu` for menus.

**Odontogram `ColorPopover` never receives focus — swatches unreachable by keyboard, focus not restored**
File: `oralign-frontend/src/components/orders/odontogram-selector.tsx:1838`
Recommended fix: `autoFocus` the first swatch (or the container with `tabIndex=-1`) on open; restore focus to the tooth button on close; same for `IprPopover` Escape/focus handling (line 708).

**Dialog `sm:max-w-sm` footgun: unprefixed `max-w-*` overrides are silently ignored on desktop (dialogs render 384 px)**
File: `oralign-frontend/src/components/ui/dialog.tsx:69` (victims: `admin-media-content.tsx:289`, `blog-editor-dialog.tsx:258`, `clinic-view-dialog.tsx:62`)
Problem: twMerge keeps `sm:max-w-sm` alongside `max-w-4xl`, and the prefixed one wins ≥640 px.
Recommended fix: Remove `sm:max-w-sm` from the primitive (make width a `size` variant or require callers to pass `sm:max-w-*`), then fix the three victims. Same defect in `sheet.tsx:71` (`data-[side=right]:w-[95%] … sm:max-w-2xl` outranks consumer overrides → the showcase mobile menu is not full-screen, `mobile-nav.tsx:68`).

**No semantic status tokens; 575 raw palette classes across 37 app files**
File: `oralign-frontend/src/app/globals.css:68`
Problem: Only `--destructive` exists; "paid/approved" = `emerald-*` inline everywhere, "pending" = `amber-*`, primary actions sometimes `blue-600`.
Why it matters: Inconsistent status colors, no dark-mode path (104 hand-written `dark:` variants with no theme provider), and each new badge reinvents the palette.
Recommended fix: Add `--success/--warning/--info` (+ foreground) tokens and `Badge`/`Alert` variants; migrate the top offenders (badges, status chips) first.

**Showcase brand palette exists only as CSS vars — 716 `[var(--sc-*)]` arbitrary classes**
File: `oralign-frontend/src/app/(showcase)/showcase.css:12`
Recommended fix: Register `--color-sc-*` in `@theme` so `bg-sc-black` etc. work; mechanical replace.

**List-page kit (FilterChip, SortMenu, EmptyState, Pagination, confirm dialog) copy-pasted across orders / patients / payment-history**
File: `oralign-frontend/src/app/dashboard/orders/page.tsx:1213`
Problem: `FilterChip` byte-identical ×3, `Pagination` ×3 already drifting.
Recommended fix: `components/dashboard/list/*` with dict-key props; import from all three pages.

**framer-motion imported by exactly one dialog (and it breaks the shadcn Dialog animation); gsap is a dead dependency**
File: `oralign-frontend/src/components/users/edit-user-dialog.tsx:202`
Recommended fix: Remove both packages; use `tw-animate-css` classes the other dialogs already use.

**Showcase `Reveal` blinks already-visible content at hydration (SSR visible → snapped to opacity 0 → re-fades)**
File: `oralign-frontend/src/app/(showcase)/_components/shared/reveal.tsx:32`
Recommended fix: Start hidden only for elements below the fold (IntersectionObserver-gated class), or gate the initial state on `useSyncExternalStore` mounted flag.

### 🟡 Medium

**Auth guard is opt-in per controller; only ThrottlerGuard is global** — `oralign-backend/src/app.module.ts:134`. Every new controller must remember `@UseGuards`; the change-password bug above is the direct consequence. Fix: register `JwtAuthGuard` as `APP_GUARD` honoring `@Public()` (the decorator already exists).

**Config read from `process.env` in 48 places with divergent fallbacks; `ConfigService` never injected** — `oralign-backend/src/app.module.ts:48`. Fix: one typed `config.ts` (zod-validated at boot).

**Bank-transfer proof + invoice PDF endpoints are `@SkipThrottle` and spawn a Chromium render per request (no cache, no concurrency cap)** — `oralign-backend/src/invoices/invoices.controller.ts:87`. Fix: drop `@SkipThrottle`, cache per (paymentId, language) like quotation PDFs, small render semaphore.

**WebSocket sessions never re-validate (no `tokenVersion`/`isActive` check, no disconnect at `exp`)** — `oralign-backend/src/support/gateways/support-chat.gateway.ts:67`. Undermines M-6 for chat. Fix: `setTimeout(() => client.disconnect(true), exp - now)` in `handleConnection`; frontend already reconnects with a fresh token.

**Admin CSV export emits dentist-controlled strings without formula neutralisation (CSV injection)** — `oralign-backend/src/reports/services/reports.service.ts:142`. Fix: prefix `=+-@\t\r` cells with `'`.

**`declareBankTransfer` emits `PaymentDeclared` from inside the open transaction** — `payments.service.ts:343`. Fix: emit after commit.

**`TreatmentPlanService.create`: non-atomic plan-create + order-status bump; order row read three times** — `treatment-plan.service.ts:222`. Fix: single `$transaction`.

**Orders list endpoint loads every `OrderFile` row (with JSON variants/metadata) for every order on the page** — `order.service.ts:130`. Fix: `_count` + thumbnail only in the list include.

**`uploadFiles` validates/writes one-by-one; a late rejection orphans earlier blobs** — `order.service.ts:1436`. Fix: validate all, then write.

**Schema: missing indexes for treatment-fee queue / revenue queries; redundant `orderCode` index** — `prisma/schema.prisma:502`.

**`getTopDoctors`: type-erasing cast forces the only `any`s in the backend, wasted `groupBy`, unbounded `findMany`** — `admin-dashboard.service.ts:545`.

**RBAC primitives copy-pasted; shared `bank-details.util.ts` is dead while two verbatim copies live in services** — `common/utils/bank-details.util.ts:13`.

**Frontend API contract is a hand-mirrored 2,085-line types file with no generation/contract check** — `lib/types/index.ts:1868`. Fix: generate from the Nest Swagger spec (openapi-typescript) or at least split per domain.

**Cross-feature cache invalidation uses raw string keys instead of the key factories** — `lib/hooks/use-orders.ts:315`; `supportKeys.detail` nested under `conversations` so list invalidations refetch every open thread (`use-support.ts:31`); `orderKeys.files` nested under `detail` (`use-orders.ts:79`).

**Current user has two sources of truth (AuthProvider state + React Query `currentUser`), synced by hand; `/users/me` fetched twice on cold load** — `lib/providers/auth-provider.tsx:95`.

**Error-message localisation gap: frontend sends `Accept-Language`, backend never reads it; two duplicated fallback helpers** — `lib/api/client.ts:204`.

**WS gateways reflect any Origin (`cors: {origin: true}`), diverging from the HTTP allowlist; handshake auth triplicated** — `dashboard.gateway.ts:36`.

**`ClinicalOrderFiles` allows a second slot upload while a chunked upload runs; single `activeUpload` record gets clobbered** — `order-file-upload.tsx:458`. Fix: derive `disabled` from `activeUpload !== null` or key by slot.

**Currency formatting inconsistent: local `money`/`toFixed(3)` in quote panel + quote review ignore `formatPrice`** — `quote-pack-panel.tsx:148`.

**Small helpers re-implemented per file with drift: `formatBytes` ×3, date locale ×~10, `genderLabel` ×4, `ageFromDob` ×2 (different thresholds; English in the wizard review)** — `order-wizard.tsx:3048`.

**i18n gaps: hardcoded English validation messages, ReviewStep labels, upload overlay** — `order-wizard.tsx:458`.

**Dead code in the wizard: `ManufacturingStep` never rendered (+ helpers, constants, imports)** — `order-wizard.tsx:2576`; **1,300 lines of unused shadcn scaffold** (`components/data-table.tsx`, `chart-area-interactive.tsx`, `section-cards.tsx`, `nav-documents.tsx`) and a public `/test` page.

**`DoctorSearchPicker` and `PatientSearchPicker` are ~200-line near-verbatim copies** — `order-wizard.tsx:1136`.

**Production doctor payment path hardcodes `mockOutcome: 'success'` (sent as `X-Mock-Outcome` on real card payments)** — `quote-pack-panel.tsx:1800`. *(Verified; contained — backend ignores it unless `MOCK_PAYMENT_CONTROLLABLE=true`, and the mock is fail-closed in prod — but test scaffolding does not belong in the money path.)*

**Treatment viewer iframe sandbox comment is inaccurate; inner third-party iframe has no sandbox** — `treatment-plan-review.tsx:589`.

**`useAuthedImage` LRU eviction revokes blob URLs still rendered by mounted components** — `lib/hooks/use-authed-image.ts:52`. Broken thumbnails after scrolling long threads.

**URL→input sync effect clobbers keystrokes typed during the `router.replace` round-trip** — `components/dashboard/doctor-latest-orders.tsx:198`.

**Dashboard slider keeps every video slide autoplaying behind `opacity-0`; inactive slides keep focusable links** — `dashboard-slider.tsx:113`.

**Recharts (109 KB gz) loaded on `/dashboard` for every role incl. dentists who never render it** — `app/dashboard/page.tsx:7`. Fix: `next/dynamic` the admin dashboard.

**Order detail: quotation fetch waits for the order fetch though the id is in the URL (A→B waterfall)** — `app/dashboard/orders/[id]/page.tsx:169`.

**`usePatients` has no `placeholderData` → table unmounts to a skeleton on every page/sort change** — `lib/hooks/use-patients.ts:33`.

**Users page a generation behind: hand-rolled 10-column `<table>` with no mobile treatment; bulk bar doesn't wrap** — `users-content.tsx:474`.

**Payment history table (8-9 nowrap columns) has no card fallback** — `components/payments/payment-history-table.tsx:203`.

**Mobile sidebar drawer 10 rem wide truncates FR labels; the only mobile nav opener is a 28 px button** — `ui/sidebar.tsx:36`, `:363`.

**Sidebar expands only on mouse hover — no keyboard/click path at md+ (`SidebarRail` defined but never rendered)** — `components/app-sidebar.tsx:370`.

**Table rows use `role="link"` + `aria-label` and hide the focus ring, breaking table semantics for AT** — `orders/page.tsx:974`; **status filter strip is `role=tablist/tab` without the keyboard contract or a tabpanel** — `:529`.

**`ChoiceCard` inside `role="radiogroup"` has no `role=radio`/`aria-checked`; wizard `TextInput`/`FieldError` lack `htmlFor`/`aria-describedby`/`aria-invalid`** — `order-wizard.tsx:3100`, `:3139`.

**Icon-only buttons with no accessible name (kebab menus, close/back)** — `packs-content.tsx:598` and siblings; **`<span role="button">` nested inside `<button>`** — `ui/searchable-combobox.tsx:217`, `history-content.tsx:935`; **combobox listbox has no `option` roles / active-descendant** — `searchable-combobox.tsx:244`.

**Button/Input scale stops at h-9 but the product wants 40 px controls — 60 ad-hoc `h-10` overrides** — `ui/button.tsx:25`. Fix: add an `xl`/`h-10` size variant.

**No z-index scale: 10 arbitrary values (1…10000) against radix's z-50** — showcase `header.tsx:89`. Fix: 4-5 named layers as CSS vars.

**Card shell re-implemented ~63× with four different radii; two dashboard drill-down dialogs share ~460 identical lines** — `order-wizard.tsx:698`, `paid-orders-dialog.tsx:227`.

**Micro-type improvised: `text-[10px]` ×83, `text-[11px]` ×86; muted-on-muted ≈4.35:1 (below AA)** — `outstanding-balance-dialog.tsx:301`, `orders/page.tsx:1538`. Fix: one `text-2xs` token + `--muted-foreground` nudge.

**Two table-header styles across admin tables** — `ui/table.tsx:73`. **Page headers/containers use four different styles** — `orders/page.tsx:484`.

**Sidebar clip-path reveal still transitions `box-shadow` and per-button layout inside the layer** — `ui/sidebar.tsx:305`. Fix: fade a pseudo-element shadow via opacity; make the button size change transition-free in icon mode.

**Permanent `will-change` on every showcase `Reveal` (51×); no `prefers-reduced-motion` handling in the app shell; ribbon marquee seam; guide scroll-progress drives React state per scroll frame** — `showcase.css:110`, `globals.css:2`, `ribbon-marquee.tsx:9`, `guide-scroll-progress.tsx:18`.

**Slot upload progress allocates a new state object per XHR progress event, re-rendering the whole files tree** — `order-file-upload.tsx:380`. Fix: bail out when the rounded percent is unchanged.

**Floating support bubble overlaps bottom-right actions; only the orders page compensates** — `support-bubble.tsx:108`.

**Primary actions/status colors bypass the token palette; orders row exposes the same actions four ways; select-all tri-state differs between sibling pages** — `orders/[id]/page.tsx:1337`, `orders/page.tsx:1076`, `patients/page.tsx:652`.

**Deferred L-8 is trivially closable: public working-hours routes have no public consumer** — `working-hours.controller.ts:61`. Fix: `@UseGuards(JwtAuthGuard)`.

**Appointment accept/decline are state-changing GET links** — `appointments.controller.ts:74`. Mail link scanners can flip a request. Fix: confirmation page + POST.

### 🟢 Minor / Polish

- `useCallback` wrappers on list pages documented as preventing row re-renders, but no row is memoised — `orders/page.tsx:384`.
- `URL.createObjectURL` inside `useMemo` (impure) — `quote-pack-panel.tsx:1717`; blob revoke inside `setState` updaters — `image-edit-dialog.tsx:250`.
- Row-hover prefetch fires a detail GET per hovered row (up to 50 per sweep) — `orders/page.tsx:979`.
- `transition-all` ×24 (17 outside primitives); determinate `Progress` animates `width` not `transform`; 7 durations + 5 custom ms + 5 easings, no motion tokens — `ui/progress.tsx:35`, `globals.css:9`.
- Icon sizing mixes `h-N w-N` and `size-N` (355 vs 165); 104 `dark:` variants with no theme provider.
- Orders tables force `min-w-[1240px]` → permanent horizontal scrollbar on 1280 px laptops — `orders/page.tsx:883`.
- Patient mobile card doesn't truncate long emails — `patients/page.tsx:1202`; wizard step circles are 32 px targets ~18 px apart — `order-wizard.tsx:1059`; 20 px clear buttons — `history-content.tsx:978`.
- Spinner-only loading states without status text; chat lists without a live region — `onboarding/profile/page.tsx:38`, `support-bubble.tsx:545`.
- `CardContent` padding overrides double the Card's built-in padding — `ui/card.tsx:14`.
- `useSettledWidth` rationale comment is stale after the sidebar refactor — `odontogram-selector.tsx:498`.
- WS CORS `origin: true` (low impact — bearer-token handshake) — `treatment-chat.gateway.ts:42`.
- Magic literals: `'TND'` hard-coded 27×, `UPLOAD_ROOT` re-declared in 9 files, byte constants retyped — `payments.service.ts:762`.
- Hard delete leaves treatment-plan blobs orphaned on disk — `order.service.ts:533`.
- Showcase eyebrow typography: 17 font sizes / 19 tracking values for one role; two hand-rolled video lightboxes — `showcase.css:89`, `guide-video-card.tsx:115`.

---

## Scores (0–10)

| Area | Score | Rationale |
|---|---|---|
| **Overall Code Quality** | **6.0** | Strict TS (0 `any` in FE), disciplined data layer and some excellent modules — pulled down by 2–4k-line components/services, copy-pasted helpers/authz/list kits, dead code, and near-zero tests. |
| **Architecture** | **6.5** | Clear feature modules and a good service/hooks/key-factory layer; but hand-mirrored types, opt-in auth guards, split notification channels, single-process assumptions, and duplicated Prisma providers will hurt as the team/product grows. |
| **UI / UX** | **6.5** | Coherent shadcn language and strong list-page pattern; undermined by real functional UX bugs (frozen dashboard, wrong KPI totals, hidden sort, shell commands in an error state, chat unread bug) and a users page a generation behind. |
| **Design Consistency** | **5.5** | Primitives used at volume, but no status/z-index/micro-type/motion tokens, 575 raw palette classes, 716 arbitrary showcase colors, and the dialog/sheet width footguns silently break widths. |
| **Performance** | **6.5** | Good RQ config, prefetching, code-split odontogram; but an 8 MB JSON in the onboarding bundle, dashboard dictionary on marketing pages, always-on 60 fps WebGL loops, ms-precision cache keys, and recharts for everyone. |
| **Accessibility** | **6.0** | Odontogram tooth controls are exemplary; elsewhere: keyboard-unreachable notification panel and color popover, mis-roled rows/tabs/radios, unlabeled inputs and icon buttons, hover-only sidebar. |
| **Security** | **7.0** | The 27-finding audit fixed the big structural issues and the upload/SQL story is genuinely solid — but two new HIGHs (unguarded change-password, password set via PUT /users/:id) plus the localStorage token design keep this from being higher. |

---

## Top 10 issues to fix first (by real impact)

1. **`PUT /users/:id` password set without current-password check or `tokenVersion` bump** — `oralign-backend/src/users/services/user.service.ts:150` (permanent takeover amplifier).
2. **`POST /auth/change-password` unguarded + crashing** — `oralign-backend/src/auth/controllers/auth.controller.ts:132` (then make `JwtAuthGuard` global with `@Public()`).
3. **Orders bulk actions act on invisible rows** — `oralign-frontend/src/app/dashboard/orders/page.tsx:293` (irreversible deletes).
4. **Wizard `saveDraft` duplicate-order race** — `oralign-frontend/src/components/orders/order-wizard.tsx:655`.
5. **Treatment-fee receipt upload bypasses upload hardening** — `oralign-backend/src/orders/controllers/order.controller.ts:287`.
6. **Raw-fetch file paths never refresh the token (previews/STL/downloads fail after 15 min; corrupt downloads)** — `oralign-frontend/src/components/orders/order-file-upload.tsx:3057`.
7. **Admin dashboard frozen `to` + ms-precision keys (stale "real-time" page, cache defeated)** — `oralign-frontend/src/components/dashboard/admin-dashboard.tsx:77`.
8. **Wizard patient/dentist pickers capped at 100, client-side search** — `oralign-frontend/src/components/orders/order-wizard.tsx:317`.
9. **Support chat unread/mark-read effect bug** — `oralign-frontend/src/components/support/support-bubble.tsx:464`.
10. **Dialog/Sheet width footguns in the primitives** (`ui/dialog.tsx:69`, `ui/sheet.tsx:71`) — one root fix repairs media, blog, clinic dialogs and the showcase mobile menu.

Runners-up: `country-state-city` 8 MB bundle; STL 60 fps loop; `approveQuoteIfSent`; Prisma error mapping; single global `PrismaModule`; test harness.

---

## Refactoring Plan (safe, incremental — each step independently verifiable)

**Step 1 — Security hot-fixes (backend, ~1 h)**
Remove `password` from `UpdateUserDto`; add `@UseGuards(JwtAuthGuard)` to `change-password`; add `fileFilter` + `scanUploadContent`/`isDangerousUploadExtension` to the treatment-fee proof route; CSV formula neutralisation.
*Verify:* unauthenticated `POST /auth/change-password` → 401; `PUT /users/:id {password}` → 400 (whitelist); `.html` receipt → 400; packs/CBCT bash suites still green.

**Step 2 — Make auth default-deny (backend)**
Register `JwtAuthGuard` as `APP_GUARD` honoring `@Public()`; grep every controller and delete now-redundant per-class guards; keep `RolesGuard` per route.
*Verify:* hit each `@Public()` route without a token (200) and one protected route per module without a token (401).

**Step 3 — Two frontend data-integrity fixes**
`saveDraft` sets `savedOrder` before the tooth PUT + try/catch; orders bulk selection keyed by `paramsKey` (copy the patients pattern).
*Verify:* wizard: fail the tooth PUT (dev tools offline) → next save updates, does not create; orders: select on page 1, go to page 2, bulk bar shows 0.

**Step 4 — One authed-blob helper**
Add `fetchAuthedBlob(url, {onProgress?})` in `lib/api` (apiClient blob + `ensureValidAccessToken()` for streaming); replace the five raw fetches; `downloadOrderFile` checks `ok` and toasts; fix `useAuthedImage` LRU revoke (refcount or don't revoke).
*Verify:* expire the access token (shorten TTL in dev), click Copy/Download/STL → works; corrupt-download case gone.

**Step 5 — Dashboard freshness + cache keys**
Presets send `from` only; `to` only for custom; round `from` to the minute.
*Verify:* mount admin dashboard, create an order in another tab, wait for WS invalidate → KPI updates without reload; network tab shows cache hits on remount.

**Step 6 — Wizard pickers server-side search**
Send debounced `search` to patients/dentists endpoints; show "first N — refine" when `total > length`; extract one `SearchPicker<T>` to replace the two copies.
*Verify:* seed 150 test patients; the 150th is findable.

**Step 7 — Primitive footguns**
`dialog.tsx`: drop `sm:max-w-sm` from the base (add a `size` prop or document `sm:max-w-*`); `sheet.tsx`: move side widths behind a variant so consumer overrides win; fix the four victim call sites; add `xl` (h-10) button/input size and delete the 60 `h-10` overrides.
*Verify:* media/blog/clinic dialogs render wide on desktop; showcase mobile menu full-screen; storybook-free visual pass through the affected screens.

**Step 8 — Support chat + slider correctness**
Mark-read effect depends on `unread`; flatten `supportKeys`; slider renders only the active video, inactive slides `inert`.
*Verify:* admin replies over WS while doctor thread is open → badge clears; only one `<video>` playing.

**Step 9 — Bundle hygiene**
Lazy per-country cities (or country-only picker); move dashboard providers under `app/dashboard` + `account`/`onboarding`; `next/dynamic` the admin dashboard (recharts); remove framer-motion + gsap; delete the 1,300 lines of unused scaffold + `ManufacturingStep` + `/test`.
*Verify:* `next build` bundle analyzer: onboarding chunk −8 MB, showcase first-load JS drops, `/dashboard` for dentist role no longer includes recharts.

**Step 10 — STL viewer render-on-demand + progress re-render guard**
`controls.addEventListener('change', render)`, render on load/resize, pause on `document.hidden`; bail out of `setActiveUpload` when rounded percent unchanged.
*Verify:* Chrome performance panel on the order page: GPU/CPU idle when not interacting.

**Step 11 — Backend structure (behind the tests from Step 12; do them together)**
Global `PrismaModule`; Prisma error mapping in the filter; `OrderAccessPolicy` shared by the five services; extract `OrderFilesService` / `OrderExportService` / `TreatmentFeeService` from `OrderService`; delegate `approveQuoteIfSent` to `QuotationService`; strip `status` from treatment-plan update DTO; typed config module.
*Verify:* bash suites (CBCT 26/26, packs 41/41) + new e2e stay green after each extraction; `SELECT count(*) FROM pg_stat_activity` shows one pool.

**Step 12 — Test harness (start before Step 11 lands)**
Backend: supertest e2e for auth (guards, change-password, revocation), payments happy path, upload rejection; frontend: Vitest for `lib/utils`, key factories, `readBodyWithProgress`, `useAuthedImage`; run in CI.
*Verify:* CI green; a deliberate guard removal fails a test.

**Step 13 — Design tokens + list kit**
Add `--success/--warning/--info`, `Badge`/`Alert` variants, `text-2xs`, z-index layer vars, motion duration/easing tokens; register `--color-sc-*` in `@theme`; extract `components/dashboard/list/*` (FilterChip/SortMenu/EmptyState/Pagination/ConfirmDialog); migrate orders/patients/history.
*Verify:* grep counts of `emerald-`/`z-[`/`text-[10px]`/`[var(--sc-` trend to zero; visual pass.

**Step 14 — Accessibility pass on the identified components**
Notification panel → `Popover`; odontogram popovers focus + restore + Escape; wizard `TextInput`/`FieldError`/`ChoiceCard` semantics; combobox `option` roles; icon buttons `aria-label`; sidebar keyboard/click expand (render `SidebarRail`); table rows back to real rows with a link cell.
*Verify:* keyboard-only walkthrough of order creation and notification review; axe run on orders, wizard, dashboard.

**Step 15 — Users page + payment tables responsive parity; users KPI from API; payments error copy**
*Verify:* 375 px pass on users/payments; KPI tiles match DB counts.

*(Everything above preserves behavior except where the behavior itself is the bug. Recommend one PR per step.)*
