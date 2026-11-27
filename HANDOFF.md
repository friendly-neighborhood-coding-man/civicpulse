# CivicPulse — handoff (multimodal AI mission)

Latest verified head: **`stack/14-ai-demo-polish`**, at the commit containing this
file (`git log -1`). Date: **2026-11-27**.
Repository: <https://github.com/friendly-neighborhood-coding-man/civicpulse>.

Everything in this work is synthetic. No real complaint was created or sent, no
email/SMS was sent, no government contact was invented as working, nothing was
deployed, no repository setting was changed, no Toss SDK was added, and **no paid
API call was made**. The AI provider is simulated by default and the live adapter
is **not verified** (`LIVE_MODEL_NOT_VERIFIED`).

## Branches

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
| 11 Auth privacy corrections | `stack/11-auth-privacy-corrections` | `stack/10-identity-and-retention` | `f26d09d` |
| 12 Multimodal AI | `stack/12-multimodal-ai` | `stack/11-auth-privacy-corrections` | `fc9e9c1` |
| 13 AI verification | `stack/13-ai-verification` | `stack/12-multimodal-ai` | `e5e5ae8` |
| 14 AI demo polish | `stack/14-ai-demo-polish` | `stack/13-ai-verification` | this commit |

All four new branches are pushed. `stack/12-multimodal-ai` also contains the
preliminary homepage copy fix (`ad20258`): official status is described as a cited
portal, not a verified case.

### Draft PRs

Draft PRs **#2–#12** exist on the remote and are unmerged. PR #12 tracks stage 11.
No PR was opened for stages 12–14 because this sandbox has no `gh` binary and no
GitHub authentication. The bodies are committed.

Open them with the GitHub compare links (choose **Create draft pull request**):

- <https://github.com/friendly-neighborhood-coding-man/civicpulse/compare/stack/11-auth-privacy-corrections...stack/12-multimodal-ai?expand=1>
- <https://github.com/friendly-neighborhood-coding-man/civicpulse/compare/stack/12-multimodal-ai...stack/13-ai-verification?expand=1>
- <https://github.com/friendly-neighborhood-coding-man/civicpulse/compare/stack/13-ai-verification...stack/14-ai-demo-polish?expand=1>

Or, once `gh` is installed and authenticated:

```bash
gh pr create --draft \
  --base stack/11-auth-privacy-corrections --head stack/12-multimodal-ai \
  --title "12 · Multimodal Reporting Assistant" \
  --body-file docs/pr/12-multimodal-ai.md

gh pr create --draft \
  --base stack/12-multimodal-ai --head stack/13-ai-verification \
  --title "13 · AI Verification" \
  --body-file docs/pr/13-ai-verification.md

gh pr create --draft \
  --base stack/13-ai-verification --head stack/14-ai-demo-polish \
  --title "14 · AI Demo Polish" \
  --body-file docs/pr/14-ai-demo-polish.md
```

## What the AI work actually does

A citizen can upload a photo, pick an approximate district, type a short
description, and press **AI로 제보 정리하기**. The server creates the private
draft first (the existing deterministic path), then makes **one** provider call
that returns a versioned JSON object: category, visible observations, hedged
interpretations, safety concerns, uncertainties, missing evidence, privacy
warnings, next steps, at most one optional clarification question, and a
four-field Korean draft.

Nothing is published or filed. The result is validated with a strict schema, then
filtered by deterministic guardrails, then stored with its provenance. The
citizen must explicitly **apply** the draft; text they already edited is never
silently replaced. The deterministic path remains available without AI.

Key files:

- `src/lib/ai/` — schema, prompt, guardrails, image preparation, config, providers.
- `src/lib/domain/analysis.ts` — consent, limits, cache, provider call, fallback, apply.
- `src/app/api/reports/[publicId]/analysis/` — analysis and apply routes.
- `src/components/AnalysisPanel.tsx`, `NewReportForm.tsx` — UI.
- Migration 10 — `report_analyses` + `reports.applied_analysis_id`.
- `docs/AI.md` — the full design, privacy, cost and operator notes.

## Provider and model

- Adapter: **OpenAI Responses API** over `fetch` (no SDK dependency).
- Default model: **`gpt-5-mini`**. Its official model page lists image input,
  structured outputs and the Responses endpoint, and marks the snapshot
  **deprecated**; set `CIVICPULSE_AI_MODEL` to a current vision model before a paid
  run.
- Request: one `input_text` part (JSON data), one `input_image` part (base64,
  `detail: "low"`), `store: false`, bounded `max_output_tokens`, Structured Outputs
  (`json_schema`, `strict`), 256 KiB response cap, caller timeout.
- Modes: `CIVICPULSE_AI_MODE=mock` (default simulation) or `openai`. Live mode
  without `OPENAI_API_KEY` records an explicit `missing_credentials` fallback.

### Mock vs. real verification

| Path | Status |
|---|---|
| Simulation (default) | **VERIFIED** in unit tests and Chromium; observations are human-written for the three shipped samples and labelled `시뮬레이션 · 모델 미호출` |
| Live adapter | **CONTRACT-TESTED ONLY** with a stub `fetch`; `LIVE_MODEL_NOT_VERIFIED` |
| Live without key | **VERIFIED** in Chromium: explicit `AI 사용 불가 · 대체 초안`, no observations, no simulation label |
| Real provider call | **NONE.** `OPENAI_API_KEY` is absent; no spend authorized |

### Operator smoke test (only with authorization and a spending limit)

1. Set `CIVICPULSE_AI_MODE=openai`, `OPENAI_API_KEY`, a current
   `CIVICPULSE_AI_MODEL`, `CIVICPULSE_AI_DAILY_LIMIT=1`,
   `CIVICPULSE_AI_USER_DAILY_LIMIT=1`, `CIVICPULSE_AI_PER_REPORT_LIMIT=1`.
2. Use a synthetic sample photo and one short description; tick the external
   transfer consent.
3. Record the panel's provenance (must say **실제 AI 분석**), the sanitized
   observation text, and `npm run ai:usage`.
4. Set the mode back to `mock`.

Until that succeeds, every public statement must keep the simulation/live
distinction and must not claim real inference.

## Example structured output (synthetic)

For `public/samples/sidewalk.jpg` in simulation mode:

```json
{
  "category": "sidewalk",
  "categoryConfidence": "medium",
  "observations": [
    "격자 모양 줄눈이 있는 보도 포장면이 보입니다.",
    "왼쪽 아래 포장면에 어두운 색의 갈라진 형태가 보입니다.",
    "그 옆에 주변과 색이 다른 밝은 판과 회색 판이 놓여 있습니다.",
    "오른쪽에 주황색 말뚝(볼라드) 하나가 서 있습니다."
  ],
  "interpretations": [
    "보도블록이 깨지거나 들떠 있을 가능성이 있습니다.",
    "색이 다른 판은 임시로 덮어 둔 보수 자재일 수 있습니다."
  ],
  "uncertainties": [
    "실제 사고나 피해가 있었는지는 확인되지 않았습니다.",
    "문제가 언제부터 있었는지는 사진만으로 알 수 없습니다.",
    "정확한 위치는 구역 단위로만 기록되어 있습니다."
  ],
  "clarificationQuestion": "문제가 있는 부분이 사람들이 주로 걷는 길 한가운데에 있나요, 가장자리에 있나요?",
  "draft": {
    "title": "보도블록 파손 의심 구간 점검 요청",
    "summary": "사진에는 보도 포장면 일부가 갈라지고 색이 다른 판이 놓여 있는 모습이 보입니다. 제보자는 \"여기 길이 깨져서 위험해요\"라고 설명했습니다.",
    "concern": "보행 중 걸려 넘어질 우려가 있어 보입니다. 실제 사고 발생 여부는 확인되지 않았습니다.",
    "requestedAction": "관할 기관에서 현장을 확인하고, 필요하면 파손된 보도블록을 보수해 주시기 바랍니다."
  }
}
```

This is a **pre-written fixture**, not model output. The provenance stored with it
is `mode = 'mock'`, `simulatedObservations = true`.

With live mode and no key, the stored fallback has `status = 'fallback'`,
`failure.code = 'missing_credentials'`, no observations, and the deterministic
request sentence only. It cannot be applied from the panel.

## Verification (run on this head)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | **208 tests / 31 files** PASS |
| `npm run build` | PASS |
| `npm run e2e` | **21 passed** — 19 desktop + 2 phone-sized AI |
| `npm run e2e:password` | **4 passed** |
| `npm run e2e:fallback` | **1 passed** |
| `npm run e2e:demo` | **1 passed**; five synthetic PNGs |

New AI coverage includes: strict schema/extra-field/oversize rejection, injection-
derived fabricated contacts, legal assertions, certainty, plate and address drops,
missing credentials, timeout/network/schema/guardrail fallbacks, consent, duplicate
invocation reuse, per-report and per-user budgets, zero budget, published-report
refusal, cross-user and cross-report 404s, citizen-edit overwrite protection,
unbounded clarification input, and the no-key fallback UI.

## Privacy and security review findings

1. Account enumeration and logout/deletion defects from the stage-11 review are
   fixed and covered (`docs/pr/11-auth-privacy-corrections.md`).
2. Only the metadata-free 512 px working copy is sent; originals, GPS, exact
   coordinates, landmark, account identity and storage keys are not.
3. Consent is required only when an external transfer can actually happen; the
   server re-checks it and returns 400 without it.
4. Model output is untrusted: strict schema, no URL/agency/legal fields, and
   deterministic guardrails that reject a whole draft rather than partially
   cleaning it. Model text cannot choose a database row, URL or authorization.
5. Prompt injection is reduced by passing citizen text as JSON data and contained
   by schema/guardrails; no image OCR pipeline exists, so injection via image text
   is not testable here.
6. No key, prompt, image bytes or provider error body is logged or stored. The
   fallback deliberately quotes the citizen's own words, which is their text, not
   model output.
7. `store: false` is **not** a zero-retention guarantee; provider retention,
   training and residency are unknown and not claimed.

## Cost

No paid call was made, so measured spend is **KRW 0**. Estimate at the configured
list prices ($0.25 input / $2 output per 1M tokens) for ~1 500 input + 600 output
tokens:

```
1500/1e6 * 0.25 + 600/1e6 * 2 = $0.001575  ≈ $0.0016 ≈ 2 KRW
```

A 100-analysis pilot is on the order of a few hundred won. This is an **estimate**,
not an invoice; image tokens vary by model/detail. `npm run ai:usage` prints
aggregate counts, tokens and the same estimate.

## Demo and screenshots

```bash
npm ci
npm run demo:ai     # fresh simulation-mode demo, http://127.0.0.1:3500
```

Follow `docs/DEMO.md` §3. Screenshots (synthetic, simulation-labelled) are in
`docs/screenshots/`:

- `ai-01-input-mobile.png`
- `ai-02-analysis-mobile.png`
- `ai-05-draft-preview-mobile.png`
- `ai-03-draft-mobile.png`
- `ai-04-analysis-desktop.png`

Regenerate with `npm run e2e:demo`. They must not be presented as live inference.

## Remaining work before Devpost submission

1. **Authorize and run one live smoke test** with a spending limit; record the
   sanitized output and measured tokens/cost. Until then the submission must say
   `LIVE_MODEL_NOT_VERIFIED`.
2. Choose a **current, non-deprecated vision model** and update the price
   assumptions from the provider's pricing page.
3. Have a Korean speaker review the AI prompt, labels, fallback copy and the
   generated draft style.
4. Record a 2–3 minute demo video using `npm run demo:ai`; state simulation vs
   live explicitly.
5. Decide hosting (Node + `sharp` + `node:sqlite`), TLS, backups and retention
   operations. None of this is authorized or done.
6. If judges require live inference, fund a bounded key for the demo window and
   keep the daily/user/per-report limits at 1.
7. Optional: a real (non-personal) photo test to measure latency and cost.

## Remaining work before a real Apps in Toss deployment

- App registration, business/open-policy review and a Toss developer account.
- Toss login/session verification server-side; never trust a client user id.
- Test multipart upload from the Toss WebView to the HTTPS Node backend.
- Keep the external-transfer consent UI and the no-AI alternative in the mini app.
- Preserve provenance labels; never relabel a simulation as AI.
- Keep navigation to the verified official channel user-initiated.
- Add a real SDK adapter only from official documentation; the repository
  currently contains no Toss SDK call.
- Build and upload an `.ait` bundle in a sandbox workspace, not production.

## Known limitations

- Live provider unverified; default model deprecated; cost estimated only.
- Guardrails are pattern-based, Korean-centric, and can miss novel phrasing or
  false-positive.
- No image PII/OCR/moderation; human redaction remains mandatory.
- Simulation does not analyse pixels; only the three shipped samples have
  observations.
- Fallback drafts are the deterministic template, not an analysis.
- Per-process rate limiting in front of SQL daily limits; single-node SQLite and
  local filesystem media remain the deployment boundary.
- Chromium only; Pixel 5 emulation, not a physical device.
- Published text has no revision flow; retention still needs an external scheduler.
