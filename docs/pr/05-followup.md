# PR 05 — Follow-up Workflow

- **Base:** `stack/04-community`
- **Head:** `stack/05-followup`
- **Status:** Draft (PR creation blocked in the agent sandbox; see “Recovery”)

## Scope

A follow-up request that a human reviews and submits themselves. The application
still never transmits anything.

Implemented:

- **Eligibility** from observable conditions, each with its own explanation:
  configured waiting period (`CIVICPULSE_FOLLOWUP_WAITING_DAYS`, default 14, `0`
  allowed for demos), at least one newly approved piece of evidence since publication
  or the last follow-up, no official `resolved` status, no draft already awaiting
  review, and a 7-day cooldown after an approved follow-up.
- **Deterministic draft** (`assistant_mode=mock` path): restates the issue, the official
  status with its source, the owner's claims labelled “시민 주장”, and the approved
  evidence; requests a concrete action; names the verified channel from the curated
  registry (or says none is verified). No agency, email or phone number is invented.
- **Human approval**: the owner reads the draft and marks it reviewed (recorded with
  reviewer and timestamp). A draft can be discarded, which frees the next request.
- **Hard non-submission**: there is no `sent` state, the API returns
  `submittedToAgency: false`, and the UI states that submission happens on the official
  site. Nothing in this stage performs an outbound request.
- The draft is produced server-side and rendered into the owner page; the panel
  refreshes from the API after each action, so state is always read back from SQLite.

## Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | |
| Lint | `npm run lint` | PASS | |
| Unit/integration | `npm test` | PASS | 95 tests (6 new) |
| Production build | `npm run build` | PASS | |
| Browser E2E | `npm run e2e` | PASS | 14 Chromium tests (2 new) |
| Visual review | `node scripts/capture-followup.mjs` | PASS | draft and approved states inspected |

## Observed happy path (browser)

김민지 publishes a report → 이하나 uploads evidence and the moderator approves it →
데모 운영자 records an official `acknowledged` status with an https source → 김민지 opens
the owner page, sees “공개 후 경과 0일 / 기준 0일”, “검토된 추가 근거 1건” → creates the
draft → reads the labelled text and the 안전신문고 link → “검토 완료로 표시” → the panel
shows “검토 완료 · 아직 어떤 기관에도 전송되지 않았습니다” with “안전신문고에서 직접
제출 ↗” → reload keeps the approved state.

## Negative cases observed

- Before the waiting period → ineligible, reason names the elapsed and required days.
- No newly approved evidence → ineligible; the create button is absent and the API
  returns 409 with the reasons.
- Official `resolved` → ineligible (“해결된 제보”).
- A draft already pending → 409 until it is reviewed or discarded.
- Approved follow-up inside the cooldown → ineligible with the remaining period.
- Another citizen reading or creating follow-ups → 403.
- Another citizen approving or discarding a draft → 403.
- Approving twice → 409; discarding an approved draft → 409.
- The draft text contains no email address or phone number (asserted in the unit test).

## Reviews, findings and corrections

**Self-review (no independent reviewer agent available in this environment).**

1. **Lint/hook finding:** the first panel implementation fetched on mount, which both
   flashed a loading state and tripped `react-hooks/set-state-in-effect`. Fixed by
   loading eligibility on the server and passing it as the initial prop; the client
   only refetches after an explicit action.
2. **Test-only weakness avoided:** the eligibility test originally asserted the literal
   default of 14 days, which would break under a different environment. It now asserts
   the relationship between elapsed and required days.
3. **Rate-limit correction:** the E2E suite exposed that 5 drafts per 10 minutes is a UX
   limit rather than an abuse guard for a demo with four accounts. Raised to 20 per
   account per 10 minutes and documented as a guard, not a workflow limit.
4. **Source discipline:** the draft can only name a channel from the curated registry.
   `tests/followup.test.ts` asserts the text contains no email/phone pattern, and the
   channel object is passed through the existing verified projection.

## Known limitations

- The draft is a deterministic template; there is no model-generated language and no
  claim of one. `CIVICPULSE_AI_MODE=openai` remains unimplemented.
- There is no copy-download, PDF export, attachment packaging or submit tracking; the
  citizen copies the text and submits it on the official site.
- Waiting period and cooldown are configuration, not legal policy; the UI prints the
  configured numbers so a reviewer can see them.
- Follow-ups are private to the owner; moderators cannot review them yet.
- Submission itself is unverifiable by design (no integration, no scraping).

## Recovery (PR creation)

```bash
gh pr create --draft --base stack/04-community --head stack/05-followup \
  --title "05 · Follow-up Workflow" --body-file docs/pr/05-followup.md
```
