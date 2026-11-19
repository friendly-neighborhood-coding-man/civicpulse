# CivicPulse — handoff

Latest verified commit: `c1a9782` on `stack/06-delivery` (all six branches pushed).

Date: 2026-11-19. Repository: <https://github.com/friendly-neighborhood-coding-man/civicpulse>.
All work is synthetic: no real report was submitted, no email/SMS sent, no government
contact fabricated, no deployment or repository setting changed.

## Stack (all branches pushed; **no Pull Request exists yet**)

| Stage | Branch | Base | Verified head |
|---|---|---|---|
| 01 Foundation | `stack/01-foundation` | `main` | `2c8fe47` |
| 02 Report creation | `stack/02-report-creation` | `stack/01-foundation` | `3ad88fc` |
| 03 Privacy & publication | `stack/03-privacy` | `stack/02-report-creation` | `568614f` |
| 04 Community & tracking | `stack/04-community` | `stack/03-privacy` | `3221194` |
| 05 Follow-up workflow | `stack/05-followup` | `stack/04-community` | `b1cd7c7` |
| 06 Demo & Toss readiness | `stack/06-delivery` | `stack/05-followup` | `c1a9782` |

**Why no Draft PRs:** the sandbox has no authenticated GitHub CLI or token, so PRs could
not be opened. Branches are pushed and each PR body is written out, ready to submit:

```bash
gh pr create --draft --base main                 --head stack/01-foundation --title "01 · Foundation"            --body-file docs/pr/01-foundation.md
gh pr create --draft --base stack/01-foundation  --head stack/02-report-creation --title "02 · Report Creation"   --body-file docs/pr/02-report-creation.md
gh pr create --draft --base stack/02-report-creation --head stack/03-privacy      --title "03 · Privacy Protection" --body-file docs/pr/03-privacy.md
gh pr create --draft --base stack/03-privacy      --head stack/04-community      --title "04 · Community & Tracking" --body-file docs/pr/04-community.md
gh pr create --draft --base stack/04-community    --head stack/05-followup       --title "05 · Follow-up Workflow" --body-file docs/pr/05-followup.md
gh pr create --draft --base stack/05-followup     --head stack/06-delivery       --title "06 · Demo & Toss Readiness" --body-file docs/pr/06-delivery.md
```

Branch comparison pages: `https://github.com/friendly-neighborhood-coding-man/civicpulse/compare/main...stack/01-foundation`
(and the equivalent for each child branch).

## What works (VERIFIED in this environment)

- Next.js 16 / React 19 / TypeScript strict / Tailwind v4 app with SQLite migrations v1–v5.
- Demo identity switching (모의 로그인, httpOnly HMAC cookie) with owner/moderator boundaries.
- Report creation: multipart upload → sharp validation → metadata-free working copy →
  deterministic Korean draft → editable owner page; unknown/oversized/animated files rejected.
- Privacy: manual mask editor on the real photo (solid default, blur, pixellate), server
  preview of the exact publish output, two acknowledgements (+ “nothing sensitive” when no
  masks), redacted re-encode published to a separate public scope; drafts 404 publicly.
- Community: idempotent support per account; evidence held `pending` in private storage and
  served only after moderator approval; moderator-only queue; append-only timeline with
  official (moderator + https source), citizen claim (owner only) and mock kinds kept apart;
  public feed `/issues`.
- Follow-up: observable eligibility (waiting period, newly approved evidence, no official
  resolution, no pending draft, 7-day cooldown), deterministic draft with verified channel
  only, human approval/discard, and **no submission path** anywhere.
- Platform boundary: `src/lib/platform/bridge.ts` reports “웹 데모 · Toss 미연동” and contains
  no invented Toss API. `docs/TOSS_READINESS.md` records the official docs reviewed.
- Docs: `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/TOSS_READINESS.md`, per-PR bodies.

## Checks actually run (latest on stage 06)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors, 0 warnings) |
| `npm test` (Vitest) | PASS — 98 tests / 16 files |
| `npm run build` | PASS — Next production build |
| `npm run e2e` (Playwright, Chromium, `next start` on :3100, fresh `.local/e2e`) | PASS — 14 tests |
| Visual review | Screenshots inspected for home, create, draft, privacy editor, public issue, feed, moderation queue, follow-up draft/approved (desktop; earlier mobile 390px for create/draft) |

E2E scenarios that were actually executed in Chromium: honest home/health; identity switch
and sign-out; foreign-origin rejection; unknown user/malformed payload; create → edit →
reload; invalid upload/fields; signed-out draft 404; mask → preview → publish → anonymous
public read; publish without consent/masks refused; other user/foreign origin refused;
support idempotency; pending evidence 404 → moderator approval → public evidence; citizen
blocked from moderation and official statuses; follow-up draft → approval persisted, no
submission, ineligible reasons.

## Review, fixes, re-review

No independent reviewer agent was available (`code-reviewer-multi-prompt` spawn failed), so
every review below is an **adversarial self-review** with real code and observed behavior.

Corrections made after review/testing:

1. Mask alignment: letterboxed container → surface hugs the image; masks use image fractions.
2. Unsafe default: pixellate → solid, plus a documented false-negative test showing
   pixellation can leave a flat colour unchanged.
3. Published page looked editable → read-only body with explanation.
4. Status timeline ordering was unstable within one millisecond → `ORDER BY created_at, rowid`.
5. Client bundle pulled `node:fs` through `config.ts` → limits moved to `lib/limits.ts`.
6. Follow-up panel fetched on mount (lint + flash) → server-loaded initial data, refetch only
   after actions.
7. Test relied on the 14-day default → now asserts the relationship, not the constant.
8. 5 drafts/10 min was a UX limit, not an abuse guard → raised to 20 and documented.
9. E2E dev server occasionally aborted a response stream → E2E runs against a production
   `next start` build with a fresh data dir (deterministic, faster).

## Mocked vs real

| Thing | Status |
|---|---|
| Draft/follow-up text | **Mock/deterministic** template (`CIVICPULSE_AI_MODE=mock`); no model call |
| Identity | **Mock** seeded users + signed demo cookie; explicitly labelled |
| Official channels | **Real, verified** registry (안전신문고, 국민신문고) with source URL + `asOf 2026-11-19`; no submission |
| Face/plate detection | **Not real**: browser `FaceDetector` is optional and was unavailable in headless Chromium (NOT_RUN); plate detection not implemented; manual masking is the path |
| Evidence redaction | **Manual**: uploader confirmation + human moderator review; no automatic detection |
| Submission | **Does not exist** by design |
| Toss SDK | **Not integrated**; official docs reviewed, no API called |
| Payments/email/SMS/analytics | None |

## Unresolved defects and risks

- Node-only dependencies (`sharp`, `node:sqlite`) mean no static/edge/Workers deployment as-is.
- No takedown/edit flow for published issues; public photos are cacheable for 60 s.
- Evidence files are stored in the private scope and served when approved; rejected bytes are
  not deleted, and there is no retention policy.
- No real authentication, account deletion, export, rate-limit persistence across restarts
  (in-memory limiter), or monitoring.
- Public pages are server-rendered per request; large feeds would need pagination.
- `hackathon` defaults: waiting period 14 days, cooldown 7; `0` is allowed for demos.
- `docs/INTEGRATIONS.md` (from stage 01) intentionally stays a template; no paid service is wired.

## Cost

No paid API, no cloud resource, no deployment was used: measured spend for this work is
**KRW 0**. A future hosting estimate (< KRW 50,000/month) is an **assumption**, not a
measurement — validate with a real host, storage and image-processing usage.

## Recommended next actions

1. Create the six Draft PRs with the commands above and review the diffs in stack order.
2. Walk the demo using `docs/DEMO.md`; check the claims the presenter must not make.
3. Decide hosting for a Node server and a real database before any Toss work.
4. Replace the demo session with real authentication (Toss login/identification key when the
   platform work starts), then implement deletion/retention/export.
5. Add a takedown flow (state `removed` exists but no UI) and a media deletion policy.
6. Only then adopt the Toss SDK following `docs/TOSS_READINESS.md`; re-verify every policy and
   documentation URL at that time.
