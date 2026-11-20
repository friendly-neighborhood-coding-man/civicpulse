# 09 · Independent-review corrections

**Base:** `stack/08-takedown-and-followup` (`aed422f`)
**Head:** `stack/09-review-corrections`
**Status:** Draft. No merge, no deployment, no real submission.

Addresses the independent static review on PRs
[#8](https://github.com/friendly-neighborhood-coding-man/civicpulse/pull/8) and
[#9](https://github.com/friendly-neighborhood-coding-man/civicpulse/pull/9). Each
finding was reproduced with a failing test before the fix.

## Findings

| # | Finding | Root cause | Correction |
|---|---|---|---|
| 1 | A valid portal host was presented as case verification | One provenance axis meant both "official domain" and "case resolved" | Labels are 공식 포털 인용; `caseVerified: false`, explicit "사건 단위 확인: 안 됨" row, scope constants |
| 2 | Any historical `resolved` blocked follow-ups forever | `find()` over the whole timeline | Only the latest `official_source` event counts; `recurred`/`unresolved` reopens |
| 2b | A resolution claim silently disabled the citizen path | Treated an unverified claim as a hard block | Explicit `acknowledgeRecordedResolution` step, enforced server-side |
| 3 | Failed media deletion after withdrawal was never retried | Obligation lived only in one response; `removed` returned early | Durable `media_cleanup` queue + retry path + health signal + moderator endpoint |
| 4 | Text token described as server-issued | Inaccurate description of a 32-bit FNV hash | Renamed to fingerprint; API exposes `tokenKind`/`signed`; docs and PR #8 errata |

## Behaviour changes

- `GET /api/public/reports/:id` / issue page: `officialReference.caseVerified = false`,
  `officialCaseVerified = false`, and an explicit case-verification row.
- `GET /api/reports/:id/followups` adds `resolutionRecorded` and
  `requiresResolutionAcknowledgement`; `POST` accepts
  `{ acknowledgeRecordedResolution: true }` and remains 409 without it.
- `POST /api/reports/:id/withdraw` returns `cleanupPending`; repeated withdrawals retry
  pending deletions; `GET /api/health` returns `mediaCleanupPending`.
- New `POST /api/moderation/media-cleanup` (moderator-only, same-origin, rate limited).
- `GET /api/reports/:id/privacy/text` returns `tokenKind:
  "unsigned-content-fingerprint"` and `signed: false`.
- Migration v8 adds `media_cleanup` only.

## Verification (observed)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 124 tests / 21 files |
| `npm run build` | PASS |
| `npm run e2e` | PASS — 17 Chromium tests |

New regression tests: `tests/review-corrections.test.ts` (6) and one Chromium test
that cites a portal homepage, records `resolved`, proves the API refuses a follow-up
without acknowledgement, then creates one after the explicit checkbox.
`e2e/takedown.spec.ts` also asserts `mediaCleanupPending === 0` after a real
withdrawal.

## Remaining risks

- Case content, receipt numbers and resolution remain unverified; no government API.
- A permanently undeletable media key stays pending with a visible error and needs an
  operator; there is no alerting or terminal state.
- Withdrawal is not erasure (caches, backups, search engines).
- Demo authentication, in-memory rate limits, SQLite and local media are unchanged.
- The text fingerprint is a staleness check only.

## Not implemented

No merge, deployment, real identity, retention scheduler, Toss integration or paid
service.
