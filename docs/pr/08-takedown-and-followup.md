# 08 · Takedown, retention boundary and support-aware follow-ups

**Base:** `stack/07-security-hardening` **Head:** `stack/08-takedown-and-followup`
**Status:** Draft. No merge, no deployment, no real submission.

## Why

- **P1-A:** Follow-up drafts ignored community support entirely, even though
  "communicating meaningful community support" is part of the product contract.
- **P1-B:** "New evidence since the previous follow-up" compared upload timestamps.
  Evidence uploaded before the previous request but approved afterwards was silently
  excluded, so a citizen could be told there was nothing new when there was.
- **P1-C:** `state = 'removed'` existed but no code path could reach it. Published
  reports, their public photo and their approved evidence had no withdrawal or
  takedown route, and public media was cacheable for 60 seconds.

## What changed

- Migration v7: `followups.support_count`, `reports.removed_at/removed_by/removal_reason`.
- Follow-up drafts snapshot the accurate support count and state plainly that it is
  community interest, not evidence of truth. Support is deliberately **not** an
  eligibility input: popularity alone can never create a draft.
- Evidence is compared by `reviewed_at` (approval), against the previous follow-up's
  review time; drafts cite the approval date.
- New `src/lib/domain/takedown.ts` + `POST /api/reports/:id/withdraw` for owner
  withdrawal and moderator takedown: transactional state change, public media row
  removed, then public and evidence bytes deleted from disk. Idempotent.
- Two-step UI on the owner page and in the moderator panel; removed state is labelled
  공개 중단됨 instead of 비공개 초안.
- Public and evidence photos are `no-store`; evidence photos require the parent report
  to still be published.

## Verification (observed)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 118 tests / 20 files |
| `npm run build` | PASS |
| `npm run e2e` | PASS — 16 Chromium tests (adds withdrawal) |

New assertions: duplicate support does not inflate the count; 2 supporters with no
evidence still cannot request a follow-up; the draft contains 지지 2명 and the
"not a truth judgement" sentence; evidence uploaded before and approved after the
previous follow-up counts as new; owner withdrawal 404s the public report, report
photo and evidence photo in a browser; a non-owner citizen is refused; moderator
takedown records the actor and reason; draft withdrawal is refused; repeats are
idempotent; public media and evidence files are gone while the audit row remains.

## Remaining risks

- Withdrawal is a visibility control, not erasure. Backups, external caches, search
  engines and screenshots can retain copies; the UI says so and there is no purge job.
- Removed reports retain private originals, masks, timeline and text audit.
- No revision flow for published text; withdrawal is the only remedy short of support.
- No account deletion or data export.

## Not implemented

No deployment, no Toss SDK, no real identity, no notifications, no scheduled retention.
