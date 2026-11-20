# Independent-review corrections (stage 09)

Source: the independent static review comments on Draft PRs
[#8](https://github.com/friendly-neighborhood-coding-man/civicpulse/pull/8) and
[#9](https://github.com/friendly-neighborhood-coding-man/civicpulse/pull/9), plus
the ledger in [Issue #1](https://github.com/friendly-neighborhood-coding-man/civicpulse/issues/1).
All four findings were reproduced in code before being fixed. Nothing is merged,
deployed, or sent to an agency.

Branch: `stack/09-review-corrections` (base `stack/08-takedown-and-followup`,
`aed422f`). All prior PRs remain Draft.

## Findings and dispositions

### 1. Portal-domain validation was presented as case verification — RESOLVED

**Reproduction.** `addStatusEvent` accepted `https://www.safetyreport.go.kr/` (the
portal *homepage*) with `status = resolved`; `KIND_LABEL.official_source` read
"공식 출처 확인"; `getIssueDetail` exposed `officialStatus = resolved`; the public
panel said "공식 출처 확인"; and `getFollowupEligibility` treated it as resolution.

**Root cause.** One provenance axis (`kind`) carried two different claims: "the link
is on an official domain" and "this case was resolved". The second was never checked
and cannot be checked without a case-level integration.

**Correction.**
- The public label is now **"공식 포털 인용 · 운영자 입력"** everywhere (panel, feed,
  moderator form, follow-up draft).
- `IssueDetail.officialReference` carries `{ caseVerified: false, verification:
  "domain_and_moderator_assertion" }` and `IssueDetail.officialCaseVerified = false`;
  the panel adds an explicit **"사건 단위 확인: 안 됨 (도메인만 확인)"** row.
- `OFFICIAL_SOURCE_SCOPE` enumerates what the host check proves and what it does not.
- The panel and draft text state that receipt, processing and resolution are not
  verified and that no government API is integrated.
- The resolution claim no longer silently suppresses follow-ups (see 2/2b).

**Tests.** `tests/review-corrections.test.ts` ("portal domain is not case
verification"), `e2e/followup.spec.ts` (records a homepage citation and asserts the
disclosure).

### 2. A historical `resolved` blocked follow-ups forever — RESOLVED

**Reproduction.** `official_source resolved` at T1, `official_source recurred` at T2,
new evidence approved at T3, waiting period elapsed: eligibility still contained
"공식 확인으로 해결된 제보입니다" and stayed false.

**Root cause.** `getFollowupEligibility` used
`.find(event => event.kind === 'official_source' && event.status === 'resolved')` over
the whole timeline instead of the *latest* official-source status.

**Correction.** Only the latest `official_source` event is considered. `recurred` or
`unresolved` clears the resolution gate; the follow-up draft prints the current
status (including 재발) as a portal citation, not as verified case resolution.

**Tests.** `tests/review-corrections.test.ts` ("a later recurred status reopens
follow-ups").

### 2b. A resolution *claim* must not disable the path silently — RESOLVED

**Reproduction/decision.** Because finding 1 establishes that a portal citation does
not verify resolution, using it as a hard, permanent block was itself the defect.
Silently ignoring the claim would hide moderator input.

**Correction.** When the latest portal citation is `resolved`, eligibility reports
`resolutionRecorded` (with `caseVerified: false`) and
`requiresResolutionAcknowledgement: true`. Creating a draft requires
`acknowledgeRecordedResolution: true` in the request body, which the owner sets via an
explicit checkbox that restates the limitation. The server enforces it; the checkbox
is not trusted. Reasons are returned to the UI as before.

**Tests.** `tests/review-corrections.test.ts` ("a resolution claim needs an explicit
decision"), `e2e/followup.spec.ts` ("treats a recorded resolution as a claim, not a
permanent block").

### 3. Failed media deletion after withdrawal was never retried — RESOLVED

**Reproduction.** A failing delete incremented `mediaDeleteFailures` but left the
file. The next withdrawal hit `state === 'removed'` and returned early, so the
orphaned bytes and the failure disappeared from view.

**Root cause.** The deletion obligation existed only in the response of the request
that created it; nothing durable recorded it.

**Correction.** Migration v8 adds `media_cleanup` (report id, scope, storage key,
attempts, `last_error`, `completed_at`, unique per key). The withdrawal transaction
enqueues every public and evidence file before commit, then attempts deletion.
Failures stay pending with an observable error/attempt count.
`processMediaCleanup` retries, and it runs:
- after every withdrawal, including the idempotent repeat path;
- through `POST /api/moderation/media-cleanup` (moderator-only, rate limited);
- `GET /api/health` reports `mediaCleanupPending` as the operational signal.

Only storage keys are stored; no report text, notes or personal data.

**Tests.** `tests/review-corrections.test.ts` (injected transient failure → retry
succeeds → queue empty; repeat withdrawal retries), `e2e/takedown.spec.ts` (health
reports zero after a real withdrawal).

**Residual limitation.** A key that can never be deleted (for example, a corrupted
key rejected by `assertSafeKey`) stays pending forever with its error visible. There
is no terminal "abandon" state or alerting; an operator must inspect it. This is
documented rather than hidden.

### 4. The text token was described as server-issued — RESOLVED (documentation + API honesty)

**Root cause.** PR #8 described `publicTextReviewToken` as a "server-issued" token; it
is a 32-bit FNV-1a hash computed from client-visible text.

**Correction.**
- Renamed the implementation to `publicTextFingerprint` (old name kept as an alias).
- `buildPublicTextReview` now returns `tokenKind: "unsigned-content-fingerprint"` and
  `signed: false`, and `/api/reports/:id/privacy/text` exposes them.
- JSDoc states exactly what it detects (stale acknowledgement after an edit) and what
  it does not (proof of review, tamper resistance), including why forging it is
  pointless: the server recomputes it and the stored human acknowledgement is the
  control.
- `docs/pr/07-security-hardening.md` carries an explicit correction.

No HMAC was added because there is no demonstrated need: a signed token would not
prove a human read the text, only that the server produced the value.

**Tests.** `tests/review-corrections.test.ts` (token kind/shape/signed flag).

## Fresh-eyes review of this correction

Two additional defects were found in the new code and fixed before commit:

1. Cleanup counts in the idempotent path were global, so one report's withdrawal
   reported another report's pending files. Processing is now scoped to the report,
   and the response counts only that report.
2. `requestedBy` on a repeated withdrawal reflected the *caller*, not the original
   remover. It is now derived from `removed_by`.

One test-suite coupling was exposed, not a product defect: four specs uploaded
evidence as `demo-hana` (limit 3/hour) and 20+ demo identity switches exceeded the
30/minute demo cap. Uploads are now spread across accounts; the demo switcher limit
is configurable (bounded, never disabled) and the E2E server sets headroom. No
production rule was removed or weakened.

## Verification (observed at this head)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 124 tests / 21 files |
| `npm run build` | PASS |
| `npm run e2e` | PASS — 17 Chromium tests |

## Open items (unchanged or newly documented)

- Domain checks do not verify case content, receipt numbers or resolution; no
  government API exists.
- Media cleanup can be observed but not alerted; a permanently undeletable key needs
  operator action.
- Withdrawal remains a visibility control; backups, external caches and search engines
  are out of scope.
- Demo authentication, in-memory rate limits, single-node SQLite and local media
  remain the deployment boundary.
