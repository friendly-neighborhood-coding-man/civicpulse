# CivicPulse — handoff

Latest verified head: `stack/09-review-corrections` (`git log -1` on the branch; the
review-correction commit precedes the docs commit containing this file). Baseline was
`stack/06-delivery` at `280b590`; `c1a9782` is its parent, not a divergent head.

Date: 2026-11-19. Repository: <https://github.com/friendly-neighborhood-coding-man/civicpulse>.
All work is synthetic: no real report was submitted, no email/SMS sent, no government
contact fabricated, nothing deployed, no repository setting changed.

## Stack (all branches pushed; **no Pull Request exists yet**)

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
| 09 Review corrections | `stack/09-review-corrections` | `stack/08-takedown-and-followup` | `git log -1` |

**Why no Draft PRs:** this sandbox has no authenticated GitHub CLI or token
(`gh auth status` → not logged in; no `GITHUB_*`/`GH_TOKEN`). Branch pushes work
through the managed git remote only. Body files are ready:

```bash
gh pr create --draft --base main                       --head stack/01-foundation        --title "01 · Foundation"              --body-file docs/pr/01-foundation.md
gh pr create --draft --base stack/01-foundation        --head stack/02-report-creation   --title "02 · Report Creation"         --body-file docs/pr/02-report-creation.md
gh pr create --draft --base stack/02-report-creation   --head stack/03-privacy           --title "03 · Privacy Protection"      --body-file docs/pr/03-privacy.md
gh pr create --draft --base stack/03-privacy           --head stack/04-community         --title "04 · Community & Tracking"    --body-file docs/pr/04-community.md
gh pr create --draft --base stack/04-community         --head stack/05-followup          --title "05 · Follow-up Workflow"      --body-file docs/pr/05-followup.md
gh pr create --draft --base stack/05-followup          --head stack/06-delivery          --title "06 · Demo & Toss Readiness"   --body-file docs/pr/06-delivery.md
gh pr create --draft --base stack/06-delivery          --head stack/07-security-hardening --title "07 · Security Hardening"     --body-file docs/pr/07-security-hardening.md
gh pr create --draft --base stack/07-security-hardening --head stack/08-takedown-and-followup --title "08 · Takedown & Follow-up" --body-file docs/pr/08-takedown-and-followup.md
```

## What the mission corrected (stages 07–08)

- **Public text privacy (P0-A).** Publication now requires reading the exact public
  title/body and acknowledges a server-issued token bound to that content, plus an
  explicit decision when the heuristic scanner reports candidates. The audit stores
  counts/kinds only. Evidence notes are scanned too.
- **Status provenance (P0-B).** Any HTTPS URL no longer becomes "공식 확인". Only a
  host in the curated official-portal registry can back `official_source`; other links
  become `moderator_claim` (미검증). Only `official_source` drives the public official
  status, feed chip, follow-up resolution rule and draft's official section.
- **Evidence lifecycle hole.** Approved evidence photos now require the parent report
  to still be published.
- **Concurrency.** Evidence review checks the SQL change count, so one decision wins.
- **Support in follow-ups (P1-A).** Drafts snapshot the accurate, duplicate-proof
  support count, state that it is interest rather than truth, and never use it for
  eligibility.
- **Evidence chronology (P1-B).** "New evidence" uses approval time against the
  previous follow-up's review time, so late approval counts.
- **Withdrawal/retention (P1-C).** Owner withdrawal and moderator takedown remove the
  public page, public photo and evidence photos immediately (transaction, then files),
  keep the audit record, and are idempotent.

Stage 09 addresses the independent review on PRs #8/#9: portal-domain checks are no
longer presented as case verification, follow-ups use only the latest official status
and require an explicit acknowledgement of a resolution claim, failed post-withdrawal
deletions are durably queued and retried, and the text token is documented and exposed
as an unsigned fingerprint. See `docs/REVIEW_CORRECTIONS.md`.

See `docs/ACCEPTANCE_REVIEW.md` for the original defect table, reproductions and
resolved/open findings.

## Checks actually run (stage 08 head)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors/warnings) |
| `npm test` (Vitest) | PASS — 124 tests / 21 files |
| `npm run build` | PASS — production build |
| `npm run e2e` (Playwright, Chromium, `next start`, fresh `.local/e2e`) | PASS — 17 tests |
| Visual review | privacy text panel (1280px and 390px), public provenance panel, withdrawn owner page |

The Chromium run executed: honest home/health; identity switch/sign-out; foreign
origin rejection; create → edit → reload; invalid upload/fields; signed-out draft 404;
mask → preview → publish → anonymous public read; text-review gate incl. synthetic
phone and stale token; publish without consent/masks refused; cross-user publish 404;
support idempotency; pending evidence 404 → approval → public evidence; citizen blocked
from moderation and official statuses; unrelated HTTPS rejected as official source;
moderator claim accepted but not official; follow-up draft → approval persisted with no
submission; ineligible reasons; owner withdrawal → public page/photo/evidence 404 and
feed entry removed.

## Mocked vs real

| Thing | Status |
|---|---|
| Draft/follow-up text | **Mock/deterministic** template (`CIVICPULSE_AI_MODE=mock`); no model call |
| Identity | **Mock** seeded users + signed demo cookie; labelled 모의 로그인 |
| Official channels | **Verified registry** (안전신문고, 국민신문고) with source URL + `asOf 2026-11-19` |
| Official status | **Moderator-entered**, domain-checked; **no government API**, no automatic confirmation |
| Text privacy scan | **Heuristic** patterns; misses likely; human review required |
| Face/plate detection | **Not real**; manual masking is the path (browser `FaceDetector` unavailable → NOT_RUN) |
| Evidence redaction | **Manual** uploader confirmation + moderator review |
| Withdrawal | **Visibility control**, not guaranteed erasure everywhere |
| Submission | **Does not exist** by design |
| Toss SDK / payments / email / SMS / analytics | None; docs only |

## Unresolved risks (unchanged or newly documented)

- Node-only stack (`sharp`, `node:sqlite`) → no edge/Workers deployment as-is.
- Demo authentication; no account deletion, export, or real identity.
- In-memory rate limiting resets on restart; single-node SQLite; local media disk.
- Withdrawal cannot reach backups, third-party caches, search engines or screenshots;
  no scheduled purge or legal hold.
- Removed reports retain private originals, masks, timeline and text audit.
- Heuristic text scan has false negatives/positives; only human review is a control.
- Official provenance verifies a domain, not the cited page's content.
- No published-text revision flow, no pagination, no notifications.

## Cost

No paid API, cloud resource or deployment: **KRW 0** measured. Hosting estimates are
assumptions, not measurements.

## Recommended next actions

1. Create the eight Draft PRs with the commands above and review in stack order.
2. Read `docs/REVIEW_CORRECTIONS.md`; decide whether the remaining risks are acceptable
   for a demo.
3. Choose a real database and Node hosting, replace demo auth, and add account
   deletion/export before any public pilot.
4. Add a scheduled media/retention purge and a published-text revision flow.
5. Only then start Toss integration per `docs/TOSS_READINESS.md`, re-verifying every
   policy URL at that time.
