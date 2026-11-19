# CivicPulse architecture (living document)

Last updated: 2026-11-19 (stage 01).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19, TypeScript strict | One deployable app: server components for private data, route handlers for mutations. |
| Styling | Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`) | No external font/CDN dependency; system + Korean font stack. |
| Persistence | `node:sqlite` (built-in, synchronous) | File at `.local/data/civicpulse.sqlite` (WAL). No native build step. |
| Media | `sharp` on the server | Originals under `.local/media/private`, publishable derivatives under `.local/media/public`. |
| Validation | `zod` at every API boundary | Parsed values, not raw JSON, reach domain code. |
| Tests | Vitest (domain/API) + Playwright (real Chromium) | See “Verification” below. |

Why SQLite: the MVP is a single-node demo. It keeps the data model relational and
migration-friendly (`PRAGMA user_version`) without requiring an external service,
and it can be swapped for Postgres later behind the repository modules in
`src/lib/domain/`.

## Boundaries

```
src/app/**            UI (server components) and route handlers (thin)
src/lib/domain/**     Business rules; the only place that writes domain tables
src/lib/db/**         Connection, migrations, typed query helpers, demo seed
src/lib/auth/**       Signed demo session (token primitives + cookie glue)
src/lib/http/**       JSON envelope, zod parsing, same-origin guard, safe errors
src/lib/security/**   In-process rate limiting (defence in depth)
src/lib/config.ts     Paths, limits, feature modes (lazy, no import side effects)
```

Rules enforced today:

- **Demo identity is explicit.** `<select>`/cards switch a signed, httpOnly cookie
  (`cp_session`). No passwords, no real accounts; the UI and docs say “모의 로그인”.
  The token is `v1.<base64url payload>.<HMAC-SHA256>` verified in constant time.
- **Write endpoints are same-origin only.** `assertSameOrigin` requires a matching
  `Origin`/`Host` and rejects cross-site fetch metadata.
- **Errors never leak internals.** Only `ApiError` messages reach clients; anything
  else becomes a generic 500 and is logged server-side.
- **Private fields stay private.** `reports.lat/lng` hold precise coordinates and
  are never serialized publicly; `public_lat/public_lng` (rounded) exist separately
  from day one so later stages cannot accidentally publish precision.

## Data model (schema v1, stage 01)

- `users` — seeded demo identities with a role (`citizen` | `moderator`).
- `reports` — owner, text fields, category, area label, private/pubic coordinates,
  `state` (`draft` | `published` | `removed`).

Later stages append migrations; released migrations are never edited.

## Running

```bash
npm install
npm run dev            # http://localhost:3000 (0.0.0.0 for preview tunnels)
npm run check          # typecheck + lint + unit tests
npm run build
npm run e2e:libs       # one-off: Chromium system libs + fonts into .local/ (no root)
npm run e2e:install    # one-off: download Chromium
npm run e2e            # real browser flow tests
npm run db:reset -- --yes
```

## Verification status (stage 01)

| Check | Status | Evidence |
|---|---|---|
| Typecheck / lint | VERIFIED | `npm run typecheck`, `npm run lint` (exit 0) |
| Unit + integration | VERIFIED | `npm test` — 27 tests, real SQLite in temp dir |
| Production build | VERIFIED | `next build` |
| Browser E2E | VERIFIED | `npm run e2e` — 4 Chromium tests incl. session persistence and 403 origin rejection |
| Responsive layout | LIMITED | CSS breakpoints implemented; not visually reviewed on mobile widths |

## Known limitations (stage 01)

- Demo session is not authentication: anyone who can reach the app can pick any demo
  identity. Acceptable only for synthetic local demos.
- Rate limiting is per process and resets on restart; durable uniqueness rules must
  live in SQL (added with each feature).
- No interactive map: adding a tile provider requires a key/attribution decision.
- `node:sqlite` is a Node built-in; the app therefore targets a Node runtime, not
  Cloudflare Workers. A Workers deployment would need D1 plus a storage adapter.
