> **Draft / independent acceptance pending.** Implementation agent reports passing
> local tests and Chromium E2E. These have not been reproduced independently. No
> merge, live release, public citizen-data processing, paid API use or Toss
> integration authorized.

Tracks [#1](https://github.com/friendly-neighborhood-coding-man/civicpulse/issues/1).

# 11 · Authentication privacy corrections

**Base:** `stack/10-identity-and-retention` (`27dcf10`)
**Head:** `stack/11-auth-privacy-corrections`
**Status:** Draft. No merge, deployment, real complaint or paid service.

## Why

The independent review on PR #11 found three defects in the stage-10 identity work:
password mode published the entire account directory from `GET /api/session` and
`/api/health` misreported the mode; the sign-out button claimed success without
checking the response; and account deletion retained private originals of published
reports while the UI implied all photos were deleted.

The same enumeration defect also existed outside the reviewed route: the home page
and every signed-out `DemoSignInCard` rendered `listUsers(db)` server-side, and the
demo switcher listed password accounts if a deployment switched back to demo mode.

## What changed

### 1. No account directory outside demo mode

- `GET /api/session` now builds its response with `buildSessionView`
  (`src/lib/domain/session-view.ts`):
  - `password`: `{ user: <own safe projection or null>, users: [], demo: false }`;
  - `demo`: `{ user, users: <fixed synthetic DEMO_USERS only>, demo: true }`.
- `listUsers` (every live account, including provisioned password users) is gone.
  `listDemoUsers` selects only the predefined demo ids and omits deleted rows.
- The home page renders the switcher card only in demo mode; password mode shows a
  login/account link and states that no directory or switching exists.
- `DemoSignInCard` is mode-aware. In password mode it links to `/login` instead of
  rendering identities. Page headings no longer tell password users to "choose a
  demo user".
- `GET /api/health` returns `authMode` and derives `demoMode` from it instead of
  hardcoding `true`.

### 2. Logout verifies the server

- `DELETE /api/session` is no longer rate limited. Signing out is a safety action:
  a 429 must not leave a session the person explicitly ended. It only expires the
  caller's own cookie and is idempotent.
- `AuthMenu` uses `requestSignOut` (`src/lib/auth/signout.ts`), which requires a 2xx
  response **and** `ok: true` before reporting success. On 429/500/network failure it
  shows the error, stays on the page and does not refresh as if signed out.
- The successful response expires `cp_session` (`maxAge: 0`); the browser suite
  then confirms `/api/session` returns `user: null` and no live cookie remains.
- The stateless 30-day token limitation is unchanged and still documented: logout
  ends this browser's session, not a stolen copy of the token.

### 3. Account deletion removes private media immediately

- For published reports, deletion first withdraws the report (public page, public
  photo and evidence photos close/queue immediately), then queues the `original` and
  `working` private copies as well and deletes their media rows.
- Previously those private copies survived until the 90-day retention purge, and
  only if an external cron ran. The UI now states the exact scope.
- Failures stay in `media_cleanup` with `attempts`/`last_error`; the response and
  `/api/health` expose the pending count, and retries happen through the existing
  reconciliation paths.
- The one deliberate retention exception is the **removed report row** (title,
  body, masks, timeline) until retention purges it, plus the anonymised user
  tombstone and completed storage keys. See `docs/ACCOUNT_DELETION.md`.

## Regression tests

New or extended tests (all failing assertions target the old behavior/shape):

| Test | Reproduces |
|---|---|
| `tests/auth-privacy.test.ts` (4) | password-mode view contains no other id/name/handle/role/email; authenticated view returns only self; demo view contains exactly `DEMO_USERS` and no password account |
| `tests/signout.test.ts` (5) | 2xx-only success; 429, 500, non-JSON, `ok:false` and network failure all return an error message, never success |
| `tests/account.test.ts` (+2) | exact media roles for a published report; failed cleanup pending with errors, then completed by one retry |
| `tests/retention.test.ts` (+1) | account-deleted report row purge does not revive or re-queue removed media |
| `e2e-password/auth-privacy.spec.ts` (3) | real password server: unauthenticated directory absent; health reports password mode; login returns self only; logout clears cookie; 35 sign-outs never 429; mocked 500 and aborted network keep the session and show an error |
| `e2e/foundation.spec.ts` | demo health reports `authMode: "demo"` (existing demo behavior preserved) |

The base-commit disclosure was reproduced independently (see Verification). The
new account-deletion and retention tests were also run against `27dcf10`: all three
failed there (`filesQueued` was 0 for a published report and the two private files
survived deletion), then passed on this branch.

## Verification (observed)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 149 tests / 26 files |
| `npm run build` | PASS |
| `npm run e2e` | PASS — 17 Chromium tests (demo mode) |
| `npm run e2e:password` | PASS — 3 Chromium tests (password mode, throwaway data dir) |
| Base reproduction | `stack/10` server returned the full directory and `demo: true`; see below |
| Base regression run | New deletion/retention tests fail at `27dcf10` (0 files queued, 2 private files retained); pass at the stage-11 head |

Base reproduction (before the fix, `27dcf10`, temporary data dir, no external
state): two provisioned password accounts, then unauthenticated
`GET /api/session` returned both accounts with ids, handles, display names and roles
(including the moderator), plus `demo: true`. The same page HTML contained the other
account. The fixed password-mode suite asserts none of those markers appears.

## Remaining risks (unchanged or newly documented)

- Password accounts still have no registration, reset, MFA or selective session
  revocation. Logout expires the browser cookie; a copied token lives until expiry.
- Removed report rows and other users' evidence rows on a withdrawn report survive
  until the external retention job runs. Without cron they remain.
- Completed `media_cleanup` rows keep storage keys indefinitely (no content).
- Backups, snapshots, caches and third-party copies are outside the app.
- Cleanup failures are observable via counts/logs but there is no alerting; a key
  that can never be deleted remains pending.
- Password-mode browser coverage is a separate config (`npm run e2e:password`), not
  part of the default `npm run e2e`; both must be run for full coverage.
- Toss login/payments remain **BLOCKED** on app registration and credentials.

## Not implemented

No deployment, migration, object storage, queue, scheduler, OIDC/Toss provider, email
delivery or payments. No published-text revision flow.

## Candidate next packages (not started)

1. `stack/12-published-revisions`: published text/photo are immutable today
   (`updateDraftReport` refuses non-drafts). A revision table with re-review and a
   visible revision history is the next substantive product gap.
2. `stack/13-operations`: package the retention/media-cleanup run as a systemd
   timer or cron file, add a durable (SQLite) rate-limit store, and alert on
   `mediaCleanupPending > 0`. Rate limits and scheduling are both external today.
