# 10 · Identity boundaries, account data and retention

**Base:** `stack/09-review-corrections` (`f182b38`)
**Head:** `stack/10-identity-and-retention`
**Status:** Draft. No merge, no deployment, no real Toss integration, no paid service.

## Why

The review gate for a pilot named three missing pieces: real identity (the demo
switcher is not authentication), user data deletion/export, and a retention story for
withdrawn content and rejected evidence. Deployment and Toss compatibility were
undocumented, so "low-cost path" was an assumption rather than a decision.

## What changed

### Identity (`CIVICPULSE_AUTH_MODE`)

- `demo` (default): unchanged password-less switcher, clearly labelled. The standalone
  demo still runs with zero setup.
- `password`: email + password accounts, scrypt with per-password salt, timing-safe
  verification, generic 401s, per-email and per-process rate limits. There is no
  registration endpoint and no email reset; accounts are provisioned with
  `npm run user:create -- --email … --name … [--role moderator]`.
- Switching to `password` invalidates password-less demo sessions instead of leaving
  old cookies valid; an unknown mode fails loudly at startup rather than silently
  serving the demo switcher.
- Migration v9 adds nullable `email`, `password_hash`, `deleted_at` and a unique email
  index. Deleted accounts never resolve as a session.

### Account data

- `GET /api/account/export` returns the signed-in account's own reports, evidence,
  status records, supports and follow-ups as a JSON attachment. No password material,
  other identities, storage keys or precise coordinates.
- `POST /api/account/delete` (explicit confirmation; password re-entry in password
  mode) withdraws published reports first, deletes drafts and personal rows, queues
  every owned file through the durable cleanup, and anonymises the user row to a
  "탈퇴한 사용자" tombstone so historical foreign keys remain valid.
- `/account` page and header account menu expose both actions.

### Retention

- `CIVICPULSE_RETENTION_DAYS` (default 90, bounded 1–3650).
- `runRetention` deletes removed reports in full after the window (text, masks,
  timeline, evidence, supports, follow-ups) and purges rejected evidence; every file
  goes through `media_cleanup`, which now deliberately outlives the report row.
- Triggers: `npm run retention` for cron/systemd, or moderator-only
  `POST /api/moderation/retention`. No in-process scheduler.
- `GET /api/health` adds `retentionEligible` next to `mediaCleanupPending`.

### Deployment decisions

`docs/DEPLOYMENT.md` records the single-process Node + SQLite + local-volume shape, the
reason serverless/edge is excluded, the environment variables, the backup/restore
procedure and the residual blockers. `docs/TOSS.md` records Toss compatibility as
**BLOCKED** on app registration and credentials, lists what already works and the
exact adapter steps that remain.

## Verification (observed)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 137 tests / 24 files |
| `npm run build` | PASS |
| `npm run e2e` | PASS — 17 Chromium tests (demo mode unchanged) |

New tests: password hashing/policy/sign-in, mode switching and demo-session
invalidation, account export scoping, account deletion (withdrawal, drafts, foreign
evidence, anonymisation), retention purge (removed reports, rejected vs approved
evidence, inside-window no-op).

Also smoke-tested on a real `next start` in password mode with a temporary data dir:
wrong password → 401, correct → 200 with a signed session, `/api/account/export` →
owner-scoped JSON, demo identity switch → 403. No external service or persistent state
was touched.

## Remaining risks

- Password mode has no registration, reset, MFA or session revocation list; compromise
  of the session secret signs everyone out but cannot selectively revoke.
- Login rate limits are per process and per email; a determined attacker can still
  cause temporary lockout of one address.
- Account deletion leaves anonymised tombstones and completed media-queue rows for
  referential integrity; backups may still hold older copies.
- Retention is scheduled externally; if the cron is not configured, nothing purges.
- Toss login/payments remain unimplemented and unclaimed; a WebView has not been
  tested.
- Demo accounts can be deleted in demo mode, which breaks that switcher entry until a
  database reset.

## Not implemented

No deployment, no object storage, no queue, no OIDC/Toss provider, no email delivery,
no payments.
