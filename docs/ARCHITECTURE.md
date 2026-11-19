# CivicPulse architecture (living document)

Last updated: 2026-11-19 (stage 02 — report creation).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19, TypeScript strict | Server components for private data, route handlers for mutations. |
| Styling | Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`) | No external font/CDN dependency. `word-break: keep-all` for Korean. |
| Persistence | `node:sqlite` (built-in, synchronous) | File at `.local/data/civicpulse.sqlite` (WAL). No native build step. |
| Media | `sharp` on the server | Originals under `.local/media/private`, publishable derivatives under `.local/media/public`. |
| Validation | `zod` at every API boundary | Parsed values, not raw JSON, reach domain code. |
| Tests | Vitest (domain/API) + Playwright (real Chromium) | 58 unit/integration, 7 browser tests at stage 02. |

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
| Unit + integration | VERIFIED | `npm test` — 58 tests over real SQLite and real sharp decoding |
| Production build | VERIFIED | `npm run build` |
| Browser E2E | VERIFIED | `npm run e2e` — 7 Chromium tests incl. create → edit → reload → other-user 404 |
| Visual layout | VERIFIED (limited) | Desktop 1280×1000 and mobile 390×844 screenshots inspected; no Safari/Firefox run |
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
