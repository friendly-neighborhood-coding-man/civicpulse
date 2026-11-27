# Deployment and storage decisions

Status of this document: **decision record for a low-cost, single-node deployment.**
Nothing here has been deployed. No paid resource was created. The numbers below are
assumptions or documented host limits, not measurements.

## What the app actually requires

| Requirement | Why | Consequence |
|---|---|---|
| Node.js >= 22.5, one long-lived process | `next start`, `node:sqlite`, `sharp` | No serverless/edge target; no Workers/Vercel functions |
| Persistent filesystem | SQLite database + private/public media files | Needs a volume or disk; ephemeral filesystems lose data |
| HTTPS origin | secure session cookie (`NODE_ENV=production`), same-origin mutations | TLS-terminating proxy or platform domain |
| Optional cron | retention purge and media reconciliation | A scheduler or a periodic manual run |

`next build` + `next start` is the verified path (E2E runs against it). There is no
container build in the repository; a Dockerfile is not required for a host that runs
Node directly, and adding one without a demonstrated need was deliberately skipped.

## Recommended shape (cheapest defensible)

One small instance (1 vCPU / 1 GB is enough for a demo; sizes are assumptions) with a
persistent volume mounted at `/data`:

```
CIVICPULSE_DATA_DIR=/data
CIVICPULSE_DB_PATH=/data/data/civicpulse.sqlite
CIVICPULSE_SESSION_SECRET=<openssl rand -hex 32>
CIVICPULSE_AUTH_MODE=demo|password
CIVICPULSE_RETENTION_DAYS=90
```

Compatible host classes (any is sufficient; no vendor is required):

- a small VM with a block volume and a reverse proxy (Caddy/nginx) for TLS;
- a PaaS machine/instance with an attached disk;
- a home server behind a tunnel for a private demo.

Do **not** use a platform whose filesystem is ephemeral or whose runtime is edge-only:
the database and media would disappear or the native modules would not load.

## Storage decisions

- **SQLite (WAL)** for structured data. It is one file, backups are a file copy, and
  the workload is a single process. Migrations run automatically on connection and
  are append-only (`src/lib/db/migrations.ts`, current version 9).
- **Local filesystem** for media, split into `private/` (originals, working copies,
  pending/rejected evidence) and `public/` (re-encoded redacted copies). Keys are
  server-generated UUIDs; no user filename reaches the path.
- **No object storage yet.** It adds credentials, signed URLs and a second consistency
  domain. It becomes justified when more than one app instance must serve media; the
  media-store module is the single seam to replace.
- **No Redis/queue.** The only durable job is media cleanup, stored in SQLite
  (`media_cleanup`) and retried explicitly. A message broker has no demonstrated need
  at this scale.

## Identity

- Default `CIVICPULSE_AUTH_MODE=demo`: password-less synthetic accounts, clearly
  labelled. This keeps the standalone demo usable with zero setup and is **not**
  authentication.
- `CIVICPULSE_AUTH_MODE=password`: email + password accounts with scrypt hashes.
  Provision with `npm run user:create -- --email ... --name ... [--role moderator]`.
  There is no public sign-up, no email reset and no OAuth provider (credentials and
  app registration are unavailable and are not faked).
- Sessions are HMAC-signed cookies with a 30-day expiry; switching modes invalidates
  password-less demo sessions. In password mode `GET /api/session` returns no account
  directory (not even other ids or roles) and `/api/health` reports `authMode`.
- Logout expires this browser's cookie and is not rate limited (a 429 must never keep a
  session the person ended). A copied token remains valid until expiry: there is no
  server-side revocation list.

## Retention and deletion

- Withdrawal closes public routes immediately and queues public/evidence files.
- Account deletion withdraws published reports, then queues the private `original` and
  `working` copies immediately as well, removes drafts and personal rows, anonymises
  the identity and reports `cleanupPending`. The removed report row (text, masks,
  timeline) remains until retention. Exact role-by-role policy:
  [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md).
- `CIVICPULSE_RETENTION_DAYS` (default 90, bounded 1–3650) controls when removed
  reports and rejected evidence are purged in full.
- Run the purge with `npm run retention` from cron/systemd, or
  `POST /api/moderation/retention` as a moderator. There is no in-process scheduler;
  without it, removed report rows and any retained originals stay indefinitely.
- `GET /api/health` exposes `mediaCleanupPending` and `retentionEligible` counts as the
  operational signal. Both should be 0 in steady state. A pending media key has no
  alerting beyond this count and the structured server log.
- Backups are outside the app: a database snapshot or media copy can retain deleted
  content. Document and shorten the backup window if deletion promises matter.

## Backups and restore

Minimum credible backup for this shape:

1. stop writes briefly (or use `sqlite3 .backup`) and copy the database file;
2. copy `media/private` and `media/public`;
3. keep `CIVICPULSE_SESSION_SECRET` separately — losing it only signs everyone out,
   but a restored database with a different secret is otherwise fine.

Restore is the reverse: place the files under `CIVICPULSE_DATA_DIR`, start the app,
and check `/api/health` reports the expected schema version.

## Known deployment blockers

- Node-only runtime: no edge/Workers deployment.
- Single process: in-memory rate limits and no horizontal scale.
- File uploads require a body-size limit at the proxy as well (the app enforces its
  own, but a proxy limit prevents large bodies reaching Node).
- No TLS termination inside the app; run it behind a proxy.
- Toss deployment requires app registration and Toss login credentials. See
  [TOSS.md](TOSS.md); this is **BLOCKED**, not implemented.

## Multimodal AI (stages 12–14)

- Default `CIVICPULSE_AI_MODE=mock`: no network, no cost, no key. The panel labels it
  `시뮬레이션 · 모델 미호출`; observations exist only for the three shipped samples.
- Live mode requires `CIVICPULSE_AI_MODE=openai` **and** a server-side
  `OPENAI_API_KEY`. The key is never sent to the browser, logged, or returned by
  `/api/health` (which reports only mode, provider, model and `configured`).
- If live mode is selected without a key, the server records an explicit
  `missing_credentials` fallback. It does **not** run the simulation and label it as a
  model result.
- Default model `gpt-5-mini`; its official page lists image input, structured outputs
  and the Responses endpoint, and marks the snapshot deprecated. Set
  `CIVICPULSE_AI_MODEL` to a current vision model before a paid run.
- Every call sends one ≤512 px, metadata-free JPEG copy plus the citizen's text and the
  district label. Original files, precise coordinates, the landmark and account
  identifiers are not sent.
- Bounds: `CIVICPULSE_AI_TIMEOUT_MS` (25 s), `CIVICPULSE_AI_MAX_OUTPUT_TOKENS` (2 500),
  `CIVICPULSE_AI_DAILY_LIMIT` (100), `CIVICPULSE_AI_USER_DAILY_LIMIT` (10),
  `CIVICPULSE_AI_PER_REPORT_LIMIT` (5). A zero daily limit disables live calls.
- Data: `report_analyses` stores the validated result, provenance, failure code,
  guardrail counts and token counts — never the API key, prompt, image bytes or provider
  error body. `npm run ai:usage` prints aggregate counts and an **estimate** only.
- Provider retention/training/residency is unknown. `store: false` is not a
  zero-retention guarantee, and no such claim is made in the UI or docs.
- **No live call has been verified.** See [AI.md](AI.md) for the operator smoke test
  and the remaining cost/retention caveats.
- If the analysis service is unavailable, the private draft remains usable; the panel
  shows a labelled fallback with a fixed reason and offers a retry.
