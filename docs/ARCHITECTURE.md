# CivicPulse architecture (living document)

Last updated: 2026-11-20 (stage 11 — auth privacy corrections).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19, TypeScript strict | Server components for private data, route handlers for mutations. |
| Styling | Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`) | No external font/CDN dependency. `word-break: keep-all` for Korean. |
| Persistence | `node:sqlite` (built-in, synchronous) | File at `.local/data/civicpulse.sqlite` (WAL). No native build step. |
| Media | `sharp` on the server | Originals under `.local/media/private`, publishable derivatives under `.local/media/public`. |
| Validation | `zod` at every API boundary | Parsed values, not raw JSON, reach domain code. |
| Tests | Vitest (domain/API) + Playwright (real Chromium) | 95 unit/integration, 14 browser tests at stage 05. |

Why SQLite: the MVP is a single-node demo. It keeps the data model relational and
migration-friendly (`PRAGMA user_version`) without an external service, and can be
swapped behind the repository modules in `src/lib/domain/`.

## Boundaries

```
src/app/**              UI (server components) and thin route handlers
src/lib/domain/**       Business rules; the only place that writes domain tables
src/lib/services/**     Assistant (deterministic), image intake, media storage
src/lib/db/**           Connection, migrations, typed query helpers, demo seed
src/lib/auth/**         Signed demo session (token primitives + cookie glue)
src/lib/http/**         JSON envelope, zod parsing, form parsing, same-origin guard
src/lib/security/**     In-process rate limiting (defence in depth)
src/lib/config.ts       Paths, limits, feature modes (lazy, no import side effects)
```

Rules enforced today:

- **Demo identity is explicit.** `cp_session` is an HMAC-signed, httpOnly cookie.
  No passwords, no real accounts; the UI says “모의 로그인”.
- **Write endpoints are same-origin only** (`assertSameOrigin`), rate limited per user.
- **Errors never leak internals.** Only `ApiError` messages reach clients.
- **Private data stays private.** `reports.lat/lng` hold precise coordinates and are
  never serialized; `public_lat/public_lng` are rounded to 2 decimals. Storage keys and
  original media are never returned to any client.
- **Ownership is checked in the domain layer,** not in the UI. A non-owner gets 404
  (not 403) for a private draft, so existence is not disclosed.

## Data model

Schema v2 (migrations in `src/lib/db/migrations.ts`):

- `users` — seeded demo identities with a role (`citizen` | `moderator`).
- `reports` — owner, title, editable draft body, original user description, landmark,
  category, area id/label, private + rounded coordinates, state
  (`draft` | `published` | `removed`), assistant mode/timestamp, evidence and step
  lists, channel id + check date.
- `report_media` — one row per stored file with role
  (`original` | `working` | `public` reserved for stage 03), server-generated key,
  dimensions and byte size.

Later stages append migrations; released migrations are never edited.

## Report creation flow (stage 02)

1. `POST /api/reports` (multipart): same-origin check → session → per-user rate limit →
   zod validation of text fields → sharp decode/validation of the photo.
2. `generateDraft` produces a template-based Korean draft, evidence checklist and the
   verified channel id for the category. No network call.
3. Files are written to private storage, then the report and two media rows are inserted
   in one transaction; on failure both files are deleted again.
4. The response includes the owner projection and `published: false`, `submitted: false`.

## Privacy and publication flow (stage 03)

1. The owner marks rectangles on the real photo (normalised 0..1 fractions of the
   image box). Modes: solid (default, opaque), blur, pixellate. Optional experimental
   face detection only when the browser exposes `FaceDetector`; it is a hint, never a
   gate.
2. `POST …/redaction/preview` runs the **same server pipeline** and returns the image
   bytes with `no-store`. The client shows that exact output.
3. `POST …/publish` requires: owner + draft state, `privacyReviewed` and `consent`
   acknowledgements, a separate `noSensitiveContent` acknowledgement when there are no
   masks, and a preview matching the current mask set. It re-encodes the working copy,
   applies every mask, writes the result to the **public** storage scope, then records
   masks, consent version and timestamps in one transaction.
4. Public reads (`/issues/[publicId]`, `/api/public/reports/[publicId]`, `…/photo`) only
   ever touch `role = 'public'` media and the narrow public projection (no owner, no
   coordinates, no original description, no storage keys). Drafts 404 publicly.

Limitation made explicit in code and tests: pixellating a uniform-colour area can
leave it visually unchanged. The UI therefore defaults to solid, warns about this, and
never treats any mode or the detector as proof of safety.

## Community and tracking (stage 04)

- **Support** is a join table with `PRIMARY KEY (report_id, user_id)`: the database, not
  the UI, guarantees one support per account per issue. Support is displayed as
  participation, never as verification.
- **Evidence** is inserted as `pending`, stored in the private scope, and served only
  through `/api/public/evidence/[id]/photo` when `status = 'approved'`. Moderators see
  pending photos through a `private, no-store` route. Approve/reject is recorded with
  reviewer and timestamp; a second decision is refused (409).
- **Status events** are append-only rows with `kind` (`official` | `user_claim` | `mock`),
  `status` (a fixed vocabulary), a note and optional source. Authorship rules live in the
  domain layer: citizens may only record the owner's claim; official/mock need a
  moderator; official requires an `https://` source. The public projection exposes the
  latest official status and latest claim as separate fields, and the timeline keeps
  every event labelled.
- **Feed** lists published reports only, ordered by publication time, with a support
  count and the latest official status.

The trust boundary is enforced in SQL and domain code, not in components: `pending`
rows never reach a public query, and the owner id is used only server-side to decide
which controls to render.

## Follow-up workflow (stage 05)

Eligibility (`src/lib/domain/followup.ts`) is a set of observable conditions, each
reported as a human-readable reason: waiting period elapsed, at least one **newly
approved** evidence item since publication or the last follow-up, no official
`resolved` status, no draft awaiting review, and cooldown after an approved follow-up.

A draft is generated by a deterministic template (`src/lib/services/followup.ts`) that
restates the official status (with source), the owner's claims (labelled as unverified)
and approved evidence. It can only name a channel from the curated registry — never an
invented agency, email or phone number. `POST /api/followups/[id]` records human
approval or discard; there is deliberately **no sent state** and no outbound call.

## Official channel registry

`src/lib/domain/channels.ts` is a curated, source-checked list. Each entry records the
operator, URL, what it handles, what to expect, its limitations, a **source URL** and an
**as-of date**. If a category has no verified channel, the UI says
“확인된 공식 창구 없음” rather than guessing. The app never submits anything: the card
only links to the official portal for the citizen to complete themselves.

Current verified entries (checked 2026-11-19):

- 안전신문고 (행정안전부) — road/facility damage and 생활불편 (waste, illegal signage).
- 국민신문고 (국민권익위원회) — general civil petitions; the handling department is
  assigned after submission.

## Running

```bash
npm install
npm run dev            # http://localhost:3000 (0.0.0.0 for preview tunnels)
npm run check          # typecheck + lint + unit tests
npm run build
npm run e2e:libs       # one-off: Chromium system libs + fonts into ~/.cache (no root)
npm run e2e:install    # one-off: download Chromium
npm run e2e            # real browser flow tests
npm run db:reset -- --yes
node scripts/capture.mjs http://127.0.0.1:3000   # optional screenshots → .local/screenshots
```

## Verification status (stage 02)

| Check | Status | Evidence |
|---|---|---|
| Typecheck / lint | VERIFIED | `npm run typecheck`, `npm run lint` — exit 0 |
| Unit + integration | VERIFIED | `npm test` — 95 tests over real SQLite, real sharp decoding, real redaction pixels, moderation transitions and follow-up eligibility |
| Production build | VERIFIED | `npm run build` |
| Browser E2E | VERIFIED | `npm run e2e` — 14 Chromium tests incl. support → moderation → official status, follow-up draft → human approval, and anonymous read |
| Visual layout | VERIFIED (limited) | Desktop and mobile screenshots inspected; no Safari/Firefox run |
| Automatic face detection | NOT_RUN | Only runs if the browser exposes `FaceDetector`; not available in headless Chromium. Mapping logic unit tested. |
| Plate detection | NOT_IMPLEMENTED | No detector; manual masking only, stated in UI |
| Follow-up submission | NOT_IMPLEMENTED | By design: the citizen submits the reviewed draft on the official site; no integration exists |
| Remote AI adapter | NOT_RUN | Not implemented; no key or spending authorization |
| Toss SDK integration | NOT_RUN | Future stage; no platform credentials |

## Known limitations (stage 02)

- Demo session is not authentication: anyone who can reach the app can pick any demo
  identity. Acceptable only for synthetic local demos.
- Rate limiting is per process and resets on restart.
- Multipart uploads are buffered in memory; a deployment must cap body size at the proxy.
- Location is district-level only (curated centroids). There is no interactive map or
  geocoding because that needs a tile/geocoding provider decision.
- `node:sqlite` is a Node built-in, so the app targets a Node runtime (not Cloudflare
  Workers). A Workers deployment would need D1 plus a storage adapter.
- Orphaned media files are possible if the process dies between file write and DB commit;
  a periodic sweep is not implemented.
- Redaction is manual; there is no verified detector, and pixellation can be weak on
  flat colours (default is solid).
- A published issue cannot yet be edited or taken down; public photos are cacheable for
  60 seconds.
- Masks are not persisted until publication, so leaving the page loses the rectangles.
- Evidence moderation is manual and there is no automatic redaction for evidence photos;
  approved evidence bytes are not deleted by any takedown flow yet.
- No notifications, comments or subscriptions; support counts are demo-account counts.
- Follow-up drafts are deterministic templates; there is no model-generated language,
  no export/download, and no submission tracking. Waiting period/cooldown are demo
  configuration printed in the UI, not legal policy.
- Follow-ups are visible to the owner only; moderators cannot review them yet.

## Public-text privacy gate (stage 07)

Publishing previously reviewed only pixels; `title` and `description` were copied
into the public projection verbatim. Now:

- `src/lib/privacy/text.ts` scans the exact public fields for six synthetic-friendly
  shapes (resident-id, phone, email, plate, unit address, honorific name hint). It
  is explicitly a heuristic and the UI says so; findings never claim safety.
- Findings carry only a masked preview and offsets. The audit stored on the report
  (`text_findings`) contains kinds/counts/fields, never the values.
- `POST /api/reports/:id/publish` requires `textReviewed` **and** a
  `textToken` issued for the current text. Editing the draft changes the token, so
  an old acknowledgement cannot approve new content.
- Findings require a second, explicit acknowledgement (`textFindingsReviewed`);
  correcting the text removes the requirement.
- Evidence notes are public text too, so the same scan rejects a note that contains
  a detected shape, with an editable message.

## Status provenance (stage 07)

`kind = 'official'` used to mean "a moderator typed an HTTPS URL". That conflated a
moderator assertion with a government record. Migration v6 rebuilds the table:

| kind | who | requirement | public label |
|---|---|---|---|
| `official_source` | moderator | host in the curated registry (안전신문고/국민신문고), https, no userinfo | 공식 포털 인용 · 운영자 입력 |
| `moderator_claim` | moderator | any https link or none | 운영자 기록 · 미검증 |
| `user_claim` | report owner | no link | 시민 주장 |
| `mock` | moderator | no link | 모의 데이터 |

No authenticated government integration exists (`AUTHENTICATED_OFFICIAL_INTEGRATION =
false`); nothing is labelled as one. The host check uses exact/suffix matching, so
`https://www.safetyreport.go.kr.evil.example/`, `https://evilsafetyreport.go.kr/` and
`https://www.safetyreport.go.kr@evil.example/` are all rejected. Only
`official_source` feeds `officialStatus`, the feed chip, and the draft's official
section; unverified moderator notes are carried into drafts as labelled claims.
Legacy `official` rows are reclassified by the same rule during migration, so an
overstated row becomes 미검증 rather than keeping the old claim.

**Domain verification is not case verification** (stage 09). The check proves only
that an HTTPS address belongs to a registered portal; it says nothing about the
specific case, its receipt, its processing state or its resolution, and the cited
page is never fetched. `IssueDetail.officialReference` therefore carries
`caseVerified: false`, the panel prints "사건 단위 확인: 안 됨 (도메인만 확인)", and the
labels say **공식 포털 인용** rather than "공식 확인".

## Follow-up support and evidence chronology (stage 08)

- A draft snapshots `support_count`. It is stated as community interest that does
  **not** determine truth or legitimacy. Support is not an eligibility input, so
  popularity alone can never create a draft; only waiting period + newly approved
  evidence + unresolved status + cooldown do.
- "New evidence" is evaluated against the previous follow-up's review time and each
  item's **approval** time (`reviewed_at`), not its upload time. A photo uploaded
  before the previous request but approved afterwards is new material. The draft
  prints the approval date and labels it accordingly.

## Withdrawal, takedown and retention (stage 08)

- `POST /api/reports/:id/withdraw` (owner or moderator, same-origin, rate limited)
  marks the report `removed` with `removed_at/removed_by/removal_reason`, deletes the
  public media row in the same transaction, and only then deletes the public image
  and every evidence image from disk.
- Every public surface already filtered on `state = 'published'`; the evidence photo
  route now also checks the parent report, so approved evidence cannot outlive a
  takedown.
- Public media is served `no-store`, so withdrawal is not masked by a shared cache.
- Retention is deliberate and partial: the report row, masks, timeline, text audit
  and private original/working copies remain for the audit trail. See "Known
  limitations" for what is *not* deleted.

## Review corrections (stage 09)

- **Current recorded status, not any historical one.** Follow-up eligibility reads
  only the latest `official_source` event. A later `recurred`/`unresolved` clears an
  older `resolved`, so a citizen is never permanently locked out (the previous rule
  matched any historical resolution).
- **A resolution claim needs an explicit decision.** Because a portal citation does
  not verify resolution, a recorded `resolved` returns
  `requiresResolutionAcknowledgement: true` instead of silently blocking;
  `POST .../followups` requires `acknowledgeRecordedResolution: true`, which the
  owner sets with a disclosure checkbox.
- **Durable media cleanup.** Migration v8 adds `media_cleanup`; withdrawal enqueues
  every public/evidence file before commit, attempts deletion, and leaves failures
  pending with `attempts`/`last_error`. The repeat-withdrawal path retries instead of
  returning early, `POST /api/moderation/media-cleanup` is the moderator-only
  reconciliation hook, and `GET /api/health` reports `mediaCleanupPending`. No text,
  note or personal data is stored in the queue.
- **The publish token is an unsigned fingerprint.** `publicTextFingerprint` (FNV-1a)
  detects an edited draft whose acknowledgement is stale. It is not server-issued,
  signed or proof of review; `tokenKind`/`signed` expose that in the API.

## Identity, account data and retention (stage 10)

- **Two explicit providers.** `CIVICPULSE_AUTH_MODE=demo` keeps the password-less
  synthetic switcher (default, zero setup, labelled as not authentication).
  `password` stores email + scrypt hashes and signs in through
  `POST /api/auth/login`; accounts are provisioned by `npm run user:create`, never by
  a public endpoint. Unknown modes throw instead of silently falling back.
- **Mode switching is a boundary.** `isSessionAllowedForMode` rejects password-less
  accounts in password mode, so a leftover demo cookie stops working; the demo
  switcher endpoint is refused rather than merely hidden.
- **Export** (`GET /api/account/export`) is owner-scoped and excludes password
  material, other identities and storage keys. **Deletion** withdraws published
  reports, deletes drafts and personal rows, queues owned files, and anonymises the
  user row to preserve historical foreign keys.
- **Retention** (`runRetention`, `CIVICPULSE_RETENTION_DAYS`, default 90) deletes
  removed reports and rejected evidence after the window. `media_cleanup` has no FK to
  `reports` on purpose: queued deletions must survive the row they refer to. Triggers
  are `npm run retention` (cron) and a moderator endpoint; there is no scheduler.
- **Deployment** is one Node process + SQLite + a persistent volume, documented in
  `docs/DEPLOYMENT.md`; Toss login/payments are documented as blocked in
  `docs/TOSS.md` and are not claimed to work.

## Auth privacy corrections (stage 11)

- **No directory outside demo mode.** `buildSessionView` is the only shaper of
  `GET /api/session`. Password mode returns `users: []` and the acting user (or
  `null`); demo mode returns exactly the predefined `DEMO_USERS` rows and never a
  provisioned password account. `listUsers` (every live account) was removed so a
  later page cannot reintroduce the leak. The home page, signed-out cards and
  header are mode-aware; `/api/health` derives `demoMode` from `authMode`.
- **Logout verifies the response.** `DELETE /api/session` is intentionally not
  rate limited: a 429 must not keep a session the person ended. The client helper
  `requestSignOut` requires 2xx + `ok:true`, shows 429/500/network errors, and only
  then navigates. Success expires `cp_session`. The signed token itself remains
  valid until its 30-day expiry if copied (no revocation list).
- **Account deletion ends withdrawal's private-media exception.** Published
  reports are withdrawn, then `original` and `working` files are queued immediately
  with their media rows removed; failed deletes stay durable and observable. The
  removed report row, anonymised user tombstone and completed cleanup keys are the
  documented retention exceptions in `docs/ACCOUNT_DELETION.md`.

## Verification status (stage 11)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 149 tests / 26 files |
| `npm run build` | PASS (production build used by both E2E suites) |
| `npm run e2e` | PASS — 17 Chromium tests against `next start` (demo mode) |
| `npm run e2e:password` | PASS — 3 Chromium tests against a password-mode `next start` |
| Base reproduction | `27dcf10` returned both provisioned accounts (ids, handles, roles) and `demo: true` unauthenticated |

## Known limitations (stage 11)

- Text scanning is pattern-based: it misses names without honorifics, obfuscated
  digits, unusual addresses, and can false-positive. Human review is the control.
- Official provenance is a **domain** check plus a human assertion. The cited page's
  content is not fetched or verified, and no government API is integrated.
- Withdrawal removes public visibility and app-served media, not every copy: browser
  caches, screenshots, search engines, backups and CDN logs are outside this app.
- A media key that can never be deleted stays pending with its error visible; there
  is no terminal abandon state or alerting, so an operator must inspect
  `mediaCleanupPending`.
- Withdrawal keeps a removed report's private originals, masks and timeline until the
  retention job (or account deletion) removes them. Without an external scheduler the
  row and non-account-deleted originals remain indefinitely.
- Demo cookie identity, single-node SQLite, local-filesystem media and an in-process
  rate limiter remain the deployment boundaries (no edge/Workers target). Password mode
  has no registration, reset, MFA or selective session revocation.
- Logout expires this browser's cookie only; a copied 30-day token stays valid.
- Account deletion keeps the removed report row (text, masks, timeline) until the
  retention window, plus an anonymised tombstone and completed media-queue keys; it
  cannot reach backups or external caches.
- No public pagination, no edit/revision flow for published text, no notification.
