# CivicPulse — handoff

Latest verified head: `stack/11-auth-privacy-corrections` at the commit containing
this file (`git log -1`). Previous head: `stack/10-identity-and-retention` at
`27dcf10`.

Date: 2026-11-20. Repository:
<https://github.com/friendly-neighborhood-coding-man/civicpulse>.
All work is synthetic: no real report was submitted, no email/SMS sent, no government
contact fabricated, nothing deployed, no repository setting changed, no paid API used.

## Stack (all branches pushed; Draft PRs #2–#11 exist)

| Stage | Branch | Base | Head |
|---|---|---|---|
| 01 Foundation | `stack/01-foundation` | `main` | `2c8fe47` |
| 02 Report creation | `stack/02-report-creation` | `stack/01-foundation` | `3ad88fc` |
| 03 Privacy & publication | `stack/03-privacy` | `stack/02-report-creation` | `568614f` |
| 04 Community & tracking | `stack/04-community` | `stack/03-privacy` | `3221194` |
| 05 Follow-up workflow | `stack/05-followup` | `stack/04-community` | `b1cd7c7` |
| 06 Demo & Toss readiness | `stack/06-delivery` | `stack/05-followup` | `280b590` |
| 07 Security hardening | `stack/07-security-hardening` | `stack/06-delivery` | `b380411` |
| 08 Takedown & follow-up | `stack/08-takedown-and-followup` | `stack/07-security-hardening` | `aed422f` |
| 09 Review corrections | `stack/09-review-corrections` | `stack/08-takedown-and-followup` | `f182b38` |
| 10 Identity & retention | `stack/10-identity-and-retention` | `stack/09-review-corrections` | `27dcf10` |
| 11 Auth privacy corrections | `stack/11-auth-privacy-corrections` | `stack/10-identity-and-retention` | `git log -1` |

**PR creation:** PRs #2–#11 are Draft and unmerged. This sandbox's GitHub CLI is
unauthenticated (`gh auth status` → not logged in), so the stage-11 branch was pushed
without opening its Draft PR. The body is ready:

```bash
gh pr create --draft \
  --base stack/10-identity-and-retention \
  --head stack/11-auth-privacy-corrections \
  --title "11 · Auth Privacy Corrections" \
  --body-file docs/pr/11-auth-privacy-corrections.md
```

The earlier commands (if a PR is ever missing):

```bash
gh pr create --draft --base main --head stack/01-foundation --title "01 · Foundation" --body-file docs/pr/01-foundation.md
gh pr create --draft --base stack/01-foundation --head stack/02-report-creation --title "02 · Report Creation" --body-file docs/pr/02-report-creation.md
gh pr create --draft --base stack/02-report-creation --head stack/03-privacy --title "03 · Privacy Protection" --body-file docs/pr/03-privacy.md
gh pr create --draft --base stack/03-privacy --head stack/04-community --title "04 · Community & Tracking" --body-file docs/pr/04-community.md
gh pr create --draft --base stack/04-community --head stack/05-followup --title "05 · Follow-up Workflow" --body-file docs/pr/05-followup.md
gh pr create --draft --base stack/05-followup --head stack/06-delivery --title "06 · Demo & Toss Readiness" --body-file docs/pr/06-delivery.md
gh pr create --draft --base stack/06-delivery --head stack/07-security-hardening --title "07 · Security Hardening" --body-file docs/pr/07-security-hardening.md
gh pr create --draft --base stack/07-security-hardening --head stack/08-takedown-and-followup --title "08 · Takedown & Follow-up" --body-file docs/pr/08-takedown-and-followup.md
gh pr create --draft --base stack/08-takedown-and-followup --head stack/09-review-corrections --title "09 · Review Corrections" --body-file docs/pr/09-review-corrections.md
gh pr create --draft --base stack/09-review-corrections --head stack/10-identity-and-retention --title "10 · Identity & Retention" --body-file docs/pr/10-identity-and-retention.md
```

## What stage 11 corrects (PR #11 review)

1. **Account enumeration.** At `27dcf10`, unauthenticated `GET /api/session` returned
   every live account (ids, handles, display names, roles) and `demo: true`, and the
   home page server-rendered the same directory. The route now returns `users: []` in
   password mode, only the acting user's safe projection when signed in, and exactly
   the synthetic `DEMO_USERS` in demo mode. `listUsers` was removed; the header, home
   page and signed-out cards are mode-aware; `/api/health` reports
   `authMode` and derives `demoMode`. Reproduced at `27dcf10` with two provisioned
   accounts on a temporary server: both were disclosed, including the moderator role.
2. **Logout correctness.** `DELETE /api/session` is no longer rate limited (a 429 must
   not hold a session the person ended). `AuthMenu` requires 2xx + `ok:true` before
   navigating, shows 429/500/network errors, and keeps the session on failure. Success
   expires `cp_session`; the password browser suite verifies `user: null` afterwards.
3. **Account deletion media.** Published reports are withdrawn, then the private
   `original` and `working` copies are queued immediately (not after 90 days) and their
   media rows removed. Failures remain in `media_cleanup` with attempts/error and are
   retried by the existing reconciliation paths. The removed report row is the
   documented retention exception. See `docs/ACCOUNT_DELETION.md`.

## Checks actually run (stage 11 head)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors/warnings) |
| `npm test` (Vitest) | PASS — 149 tests / 26 files |
| `npm run build` | PASS — production build |
| `npm run e2e` (Chromium, `next start`, demo, fresh `.local/e2e`) | PASS — 17 tests |
| `npm run e2e:password` (Chromium, `next start`, password, fresh `.local/e2e-password`) | PASS — 3 tests |
| Base reproduction (`27dcf10`, temporary worktree/server) | Both password accounts and `demo: true` disclosed |

The demo Chromium run executes: honest home/health; identity switch/sign-out; foreign
origin rejection; create → edit → reload; invalid upload/fields; signed-out draft 404;
mask → preview → publish → anonymous public read; text-review gate; publish without
consent/masks refused; cross-user publish 404; support idempotency; pending evidence →
approval → public evidence; citizen blocked from moderation; unrelated HTTPS rejected
as official; follow-up draft → approval with no submission; owner withdrawal removes
page/photo/evidence/feed.

The password Chromium run executes: unauthenticated session/home expose no other
account or role and health says password mode; login exposes only self; success clears
the cookie; 35 sign-outs never return 429; mocked 500 and aborted network keep the
session and show an error.

New tests: `tests/auth-privacy.test.ts` (4), `tests/signout.test.ts` (5), account
deletion media roles + failed cleanup/retry (+2), retention-after-account-deletion
(+1), `e2e-password/auth-privacy.spec.ts` (3).

## Mocked vs real

| Thing | Status |
|---|---|
| Draft/follow-up text | **Mock/deterministic** template (`CIVICPULSE_AI_MODE=mock`); no model call |
| Demo identity | **Mock** seeded users + signed cookie; labelled not authentication |
| Password identity | **Real local** scrypt accounts provisioned by `npm run user:create`; no registration/reset/MFA |
| Official channels | **Verified registry** (안전신문고, 국민신문고) with source URL + `asOf 2026-11-19` |
| Official status | **Moderator-entered**, domain-checked; **no government API**, no automatic confirmation |
| Face/plate detection | **Not real**; manual masking is the path |
| Withdrawal/deletion | Visibility + app-stored file deletion; backups/caches/third parties out of reach |
| Submission | **Does not exist** by design |
| Toss SDK / payments / email / SMS / analytics | None; `docs/TOSS.md` records Toss as BLOCKED |

## Unresolved risks

- Node-only stack (`sharp`, `node:sqlite`) → no edge/Workers deployment as-is.
- Password accounts have no registration, reset, MFA or selective session revocation.
  Logout expires this browser's cookie; a copied 30-day token stays valid.
- Removed report rows (text, masks, timeline) and other users' evidence rows on a
  withdrawn report remain until the external retention job. Without cron they remain.
- Completed `media_cleanup` rows keep storage keys indefinitely (no content).
- Media cleanup failures are observable by count/log but not alerted.
- Official provenance verifies a domain, not the cited page's content.
- No published-text revision flow, notifications, pagination or durable rate limiting.

## Cost

No paid API, cloud resource or deployment: **KRW 0** measured. Hosting estimates are
assumptions, not measurements.

## Recommended next actions

1. Open the stage-11 Draft PR with the command above, then review #2–#11 in stack order.
2. For a pilot: Node hosting with a persistent volume, `CIVICPULSE_AUTH_MODE=password`,
   a TLS proxy, `npm run retention` in cron, and monitoring of `/api/health`
   (`mediaCleanupPending`, `retentionEligible`, `authMode`).
3. Next packages (not started): `stack/12-published-revisions` (published text/photo are
   immutable today; add revision rows, re-review and visible history) and
   `stack/13-operations` (package retention/cleanup as a systemd timer or cron file,
   durable SQLite rate limiting, alerting on pending cleanup).
4. Toss integration remains blocked on app registration and credentials; do not start it
   before the pilot gaps above are closed.
