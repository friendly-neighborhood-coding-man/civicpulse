# PR 04 — Community & Tracking

- **Base:** `stack/03-privacy`
- **Head:** `stack/04-community`
- **Status:** Draft (PR creation blocked in the agent sandbox; see “Recovery”)

## Scope

Participation and tracking, still without any outbound submission.

Implemented:

- **Support**: one row per account per issue (`PRIMARY KEY (report_id, user_id)`),
  so repeated taps are idempotent and cannot inflate the count. The API returns
  `countsAsVerification: false` and the UI says support is not a truth judgement.
- **Additional evidence**: photo + note, stored as `pending` in private storage and
  served only through a route that checks `status = 'approved'`. The uploader must
  confirm the photo has no faces/plates; a moderator must approve it before anyone
  else can see it. Rejection keeps the file private.
- **Moderation queue** at `/moderation` (moderator role only, enforced in the domain
  layer as well as the page): the reviewer sees the actual pending photo, can approve
  or reject with a reason; decisions record `reviewed_by`/`reviewed_at`.
- **Source-labelled timeline**: `status_events` with three kinds — `official` (moderator
  only, https source required), `user_claim` (report owner only), `mock` (moderator only,
  visibly “모의 데이터”). Official and citizen statuses are shown separately and never
  merged into one ambiguous badge.
- **Public feed** at `/issues`: published issues only, with support counts and the latest
  official status (or “공식 확인 없음”).
- Public issue page now aggregates support, approved evidence and the timeline; the
  public projection still excludes owner id, coordinates and original description.

## Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | |
| Lint | `npm run lint` | PASS | |
| Unit/integration | `npm test` | PASS | 89 tests (9 new) |
| Production build | `npm run build` | PASS | |
| Browser E2E | `npm run e2e` | PASS | 12 Chromium tests (2 new) |
| Visual review | `node scripts/capture-community.mjs` | PASS | moderator queue, public issue, feed inspected |

## Observed happy path (browser)

김민지 publishes a redacted report → 이하나 supports it (“지지 1명”), repeat support via
the API returns `alreadySupported: true` with the count unchanged → 이하나 uploads
evidence with the privacy confirmation (“검토 대기”) → anonymous visitor sees no evidence
and the pending photo 404s → 데모 운영자 opens `/moderation`, sees the pending photo,
approves it → anonymous visitor now sees the evidence photo (200, `image/webp`) →
moderator records an official `in_progress` status with the 안전신문고 source → 김민지
records a separate `unresolved` citizen claim → the public page shows “공식 확인 · 처리 중”
and “시민 주장 · 미해결” in separate rows and in the timeline → `/issues` lists the issue
with “공식 · 처리 중” and “지지 1명”.

## Negative cases observed

- Signed-out support → 401; the button is disabled with an explanation.
- Foreign `Origin` on support/evidence/status → 403 (`FORBIDDEN_ORIGIN`).
- Evidence without the privacy confirmation → 400, and nothing enters the queue.
- Evidence photo before approval → 404 (id guessing reveals nothing).
- Citizen opening `/moderation` → “접근할 수 없습니다”; review API → 403.
- Citizen recording `official`/`mock` → 403; official without an https source → 400.
- Owner recording a claim on someone else’s report → 403.
- Reviewing an already-reviewed item → 409 instead of overwriting the decision.

## Reviews, findings and corrections

**Self-review (no independent reviewer agent available in this environment).**

1. **Real defect found while testing:** status events written in the same millisecond had
   an unstable order. Fixed with `ORDER BY created_at, rowid` and a test that pins both
   timestamps.
2. **Build defect:** importing `LIMITS` from `config.ts` pulled `node:fs` into a client
   chunk and broke the Turbopack build of `/issues/[publicId]`. Fixed by moving the
   limits to `src/lib/limits.ts` (Node-free) and re-exporting them from `config.ts`.
3. **Abuse surface:** evidence upload is rate limited to 3/hour/account, support to 20/min,
   moderation to 60/10min; the composite key is the real guard against inflation.
4. **Trust boundary:** the public issue page needs ownership to choose which UI to render.
   The owner id is read server-side and never added to the public projection or HTML.

## Known limitations

- Evidence moderation is manual and depends on a human noticing personal information;
  there is no automatic redaction for evidence photos (stated in the UI).
- Evidence files live in the private scope and are served when approved; a takedown after
  approval keeps the bytes on disk (no delete flow yet).
- No notifications, comments, or per-issue subscriptions (not in scope for the MVP).
- Support counts are demo-account counts, not verified residents.

## Next stack step

`stack/05-followup` on top of this branch: waiting-period and new-evidence eligibility,
a deterministic follow-up draft, explicit human approval, and a hard “not submitted” state.

## Recovery (PR creation)

```bash
gh pr create --draft --base stack/03-privacy --head stack/04-community \
  --title "04 · Community & Tracking" --body-file docs/pr/04-community.md
```
