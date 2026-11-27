> **Draft / independent acceptance pending.** Simulation path verified locally
> (unit + Chromium). The live provider adapter is contract-tested but **no real
> API call has been made**. No merge, deployment, real complaint, paid call or
> Toss integration is authorized.

Tracks [#1](https://github.com/friendly-neighborhood-coding-man/civicpulse/issues/1).

# 12 · Multimodal reporting assistant

**Base:** `stack/11-auth-privacy-corrections` (`f26d09d`)
**Head:** `stack/12-multimodal-ai`
**Status:** Draft. No merge, deployment, real inference or paid service.

## Why

The product promise is: photo + approximate district + a short citizen
description → AI observations → optional clarification → an editable Korean
civic-report draft. Until now the "assistant" was a deterministic template that
never looked at the photo, and the UI said so.

This branch adds the real vertical slice without weakening any existing privacy,
authentication, moderation, withdrawal or follow-up behaviour. AI is optional:
the deterministic path is unchanged.

## What changed

### Contract and pipeline

- `src/lib/ai/schema.ts`: versioned `civicpulse.analysis.v1`. One multimodal
  call returns category, observations, interpretations, safety concerns,
  uncertainties, missing evidence, privacy warnings, next steps, at most one
  clarification question, and a four-field draft. Strict zod validation; an
  invalid response is never stored or rendered.
- `src/lib/domain/analysis.ts`: consent, durable limits, identical-input reuse,
  one provider call, validation, guardrails, explicit fallback, and draft apply.
- The citizen's description is copied verbatim by the server into `userFacts`;
  the location line is composed by the server from the selected district. The
  model never chooses an address, agency, contact or legal claim.

### Providers

- `SimulationProvider` (default): offline, never sends anything, and returns
  human-written observations only for the three shipped synthetic samples,
  matched by SHA-256. Any other photo gets **no** observations and an explicit
  "not analysed" uncertainty.
- `OpenAiProvider`: OpenAI Responses API via `fetch`, one `input_text` + one
  `input_image` (base64, `detail: "low"`), `store: false`, bounded
  `max_output_tokens`, Structured Outputs (`json_schema`, `strict`), 256 KiB
  response cap, typed failures for refusal/incomplete/malformed/auth/rate-limit.
- Mode `openai` without a key returns an explicit `missing_credentials`
  fallback; it never substitutes simulation and calls it a model result.

### UI

- `NewReportForm`: two explicit actions — the existing deterministic draft, and
  **AI로 제보 정리하기**, with a pre-action disclosure. In live mode an external
  transfer checkbox is required, and the server checks it again.
- `AnalysisPanel` on the owner's draft page: provenance badge, visible vs
  interpreted vs unknown sections, privacy warnings, missing evidence, model
  draft preview, apply, optional clarification answer, retry.
- Provenance is shown as data: `실제 AI 분석`, `시뮬레이션 · 모델 미호출`, or
  `AI 사용 불가 · 대체 초안` with a fixed reason.

### Database

Migration 10 adds `report_analyses` (result, provenance, failure code, guardrail
counts, tokens, latency, applied timestamp) and `reports.applied_analysis_id`.
No API key, prompt, image bytes, provider error body or citizen text is copied
into the analysis row beyond the citizen's own `userFacts`.

### Limits and cost

- Timeout, max output tokens, per-report attempts, per-user and global rolling
  24h live budgets, one image, no automatic retries, identical-input reuse.
- `npm run ai:usage` prints aggregate counts and an **estimate**; it never
  selects text or prompts. Unpriced: simulation/fallback cost nothing.

## Verification (run locally on this head)

- `npm run typecheck` PASS
- `npm run lint` PASS
- `npm test` PASS — **197 tests / 30 files** (48 new AI tests)
- `npm run build` PASS
- Chromium demo suite PASS — **19 tests** (2 new AI specs; the existing 17
  unchanged)
- Chromium password suite PASS — **3 tests**

New negative coverage: malformed/schema-invalid responses, guardrail rejection
(URL, phone, resident id, plate, road-name address, named agency, legal claim,
government action, prior report, incident, measurement, certainty, unhedged
interpretation), missing credentials, timeout, cross-user 404, duplicate-call
reuse, per-report and per-user limits, zero budget, published-report refusal,
apply conflict on citizen-edited text, overwrite confirmation, and a Chromium
cross-account read attempt.

## Limitations

- `LIVE_MODEL_NOT_VERIFIED`: no real provider call was made. Default model is
  `gpt-5-mini` (official page lists image input + Structured Outputs + Responses,
  and marks the snapshot deprecated); operators must set a current model.
- No image PII detector. Faces/plates depend on the model's advisory warnings and
  the existing human redaction step; absence of a warning is not proof of safety.
- Guardrails are a pattern matcher, Korean-centric and incomplete.
- Provider retention/training/residency is **not** asserted; `store: false` is
  not a zero-retention guarantee.
- Simulation does not analyse pixels at all (and says so).
- Rate limiting is per process in front of SQL daily limits.
- Cost figures are estimates from published prices, not measured spend.

## Next

`stack/13-ai-verification` (adversarial review, injection and cost tests) and
`stack/14-ai-demo-polish` (mobile demo, synthetic assets, handoff). No merge.
