# Account deletion and media lifecycle

Status: implemented in `stack/11-auth-privacy-corrections`; verified by unit tests
and a real password-mode Chromium run. This document is the policy the code and UI
must keep matching.

## Policy in one sentence

Account deletion immediately closes every public surface, queues **all** of the
account's private and public media for deletion, removes its drafts and personal
rows, anonymises the identity, and retains only a minimal removed-report row and
completed cleanup keys until the retention window purges the row.

## Exactly which file roles survive

For a report that was **published** when the account was deleted:

| Item | Where | On account deletion | Tested |
|---|---|---|---|
| Redacted public photo (`public`) | `media/public` | Row and bytes queued/deleted immediately | `tests/account.test.ts` |
| Working copy (`working`) | `media/private` | Queued/deleted immediately (not after 90 days) | `tests/account.test.ts` |
| Original upload (`original`) | `media/private` | Queued/deleted immediately (not after 90 days) | `tests/account.test.ts` |
| Evidence photos authored by the account | `media/private` | Queued/deleted immediately; rows deleted | `tests/account.test.ts` |
| Evidence photos by other users on that report | `media/private` | Queued by withdrawal (the report is no longer public); rows survive until report retention | `tests/takedown.test.ts`, `tests/retention.test.ts` |
| Report row (title, body, masks, timeline) | SQLite | **Retained** with `state = 'removed'` until `runRetention` purges it | `tests/account.test.ts`, `tests/retention.test.ts` |
| `media_cleanup` rows | SQLite | Retained after completion; storage keys only, no text or personal data | `tests/account.test.ts` |
| User row | SQLite | Anonymised (`탈퇴한 사용자`, `deleted-…` handle, email/password cleared, `deleted_at` set) as a foreign-key anchor | `tests/password-identity.test.ts`, `tests/account.test.ts` |

For a **draft**, the report row and all its media rows are deleted immediately
(cascade), and its files go through the same queue.

## Necessary retention exceptions

1. **Removed report row until the retention window (default 90 days).**
   Withdrawal/takedown is a visibility control. The removed row preserves what was
   published and why it stopped being public, which is needed to review moderator
   and owner actions. The retention job deletes it in full. This depends on an
   external scheduler (`npm run retention`); without one, the row is retained
   indefinitely. `GET /api/health` reports `retentionEligible`.
2. **Anonymised user tombstone.**
   Historical rows reference the user id. The row contains no email, password hash,
   handle or display name after deletion.
3. **Completed cleanup keys.**
   `media_cleanup` keeps the storage key and completion time so retries stay
   idempotent. It deliberately has no foreign key to `reports` and no report text.
4. **Other users' evidence rows on a withdrawn report.**
   Their private photos are queued with the withdrawal, but the evidence rows (and
   note text) remain until the report's retention purge. This is the pre-existing
   takedown audit boundary, not an account-deletion claim about other people's data.

## Failure and retry

- Every file deletion is written to `media_cleanup` **before** the request returns;
  bytes are deleted afterwards.
- A failed delete leaves `attempts` and `last_error` visible and the obligation
  durable across restarts. `cleanupPending` in the deletion response and
  `mediaCleanupPending` in `/api/health` expose it.
- Retry paths: the next withdrawal of the same report, `npm run retention`, or
  moderator-only `POST /api/moderation/media-cleanup`.
- A successful retry completes the row; the key remains as a completed record.
- Tested with a simulated filesystem failure: all three media roles stay pending
  with an error, then one reconciliation pass deletes them.

## What deletion cannot promise

- Copies already in backups, filesystem snapshots, browser caches, screenshots,
  search engines, proxies or third-party archives are outside this application.
- A stateless signed session token copied before logout remains cryptographically
  valid until its 30-day expiry; logout expires this browser's cookie, not a
  server-side revocation list (there is none yet).
- If the external retention job is not scheduled, removed report rows remain.

The deletion UI states the immediate media deletion, the retention window for the
removed record, and the backup/cache limit before the confirmation checkbox.
