# Multimodal reporting assistant (stage 12)

> **Status:** simulation path **VERIFIED** locally (unit + Chromium).
> The live provider adapter is implemented and contract-tested against a stub,
> but **no real API call has been made**: `LIVE_MODEL_NOT_VERIFIED`.
> Do not describe live inference as working until an authorized smoke test
> succeeds and its sanitized output is recorded.

The assistant turns one private photo, an approximate district, and a short
citizen description into **structured observations** plus an **editable Korean
draft**. It never publishes, files or submits anything. AI is optional: the
deterministic path is unchanged and always available.

## One call, one versioned contract

`src/lib/ai/schema.ts` defines `civicpulse.analysis.v1`. One multimodal request
returns exactly that object; the server validates it with a strict zod schema
before anything is stored or shown.

| Field | Meaning |
| --- | --- |
| `observations` | What is directly visible in the photo |
| `interpretations` | The model's hedged reading ("…가능성이 있습니다") |
| `safetyConcerns` | Possible risks, always qualified |
| `uncertainties` | What cannot be known from the photo and text |
| `missingEvidence` | Evidence that would strengthen a report |
| `privacyWarnings` | What may need masking (faces, plates, names) |
| `clarificationQuestion` | At most one optional question, or `null` |
| `draft` | `title`, `summary`, `concern`, `requestedAction` |
| `category` | One of the app's issue kinds; **not** a legal classification |

The citizen's own words are **not** model output. They are copied verbatim by
the server into `userFacts` and into the draft summary as an attributed
quotation (`제보자는 "…"라고 설명했습니다`). The location line is composed by the
server from the district the citizen chose; the model never chooses an address.

## Pipeline

1. `POST /api/reports` creates the private draft exactly as before (no AI).
2. `POST /api/reports/{publicId}/analysis` (same-origin, authenticated, owner
   only, draft only):
   - checks consent when the provider is external;
   - enforces per-report attempts and rolling-24h per-user/global live budgets;
   - reuses the stored result for identical inputs unless `refresh: true`;
   - prepares the image (see privacy) and makes **one** provider call;
   - validates the JSON, runs deterministic guardrails, then stores provenance
     and the result.
3. `POST /api/reports/{publicId}/analysis/apply` copies the draft into the
   report, refusing to overwrite text the citizen already changed unless
   `overwrite: true` is explicitly confirmed.

A provider failure writes a `fallback` row with a fixed code and a draft built
only from the citizen's description. The private draft always survives.

## Providers

`src/lib/ai/providers/index.ts` selects one of:

| Selected | When | External transfer |
| --- | --- | --- |
| `SimulationProvider` | default; `CIVICPULSE_AI_MODE` is unset/`mock` | no |
| `OpenAiProvider` | mode `openai` **and** `OPENAI_API_KEY` present | yes |
| `null` → explicit `missing_credentials` fallback | mode `openai` without a key | no |

There is no silent substitution: a deployment configured for live inference
without a key records a fallback, not simulated observations labelled as a model
result. Simulation results are labelled `시뮬레이션 · 모델 미호출` and store
`mode = 'mock'`.

### Live adapter

OpenAI Responses API via `fetch` (no SDK dependency), request shape per the
official documentation checked on 2026-11-27:

- `POST {baseUrl}/responses`, `store: false`, bounded `max_output_tokens`;
- one `input_text` part containing JSON data, and one `input_image` part with a
  base64 data URL and `detail: "low"`;
- Structured Outputs via `text.format = { type: "json_schema", strict: true }`;
- the response body is read with a 256 KiB cap; refusals, `incomplete`,
  non-JSON and multiple text parts become typed failures.

Default model: `gpt-5-mini`. Its official model page lists image input,
structured outputs and the Responses endpoint, and marks the snapshot
**deprecated**; set `CIVICPULSE_AI_MODEL` to the operator's current choice before
a paid run. `reasoning.effort` is omitted unless
`CIVICPULSE_AI_REASONING_EFFORT` is set, so a non-reasoning model is not sent an
unsupported parameter.

## Privacy

- Only the **working copy** is read, and it is decoded and re-encoded as a
  ≤512 px JPEG. `sharp` drops EXIF unless asked to keep it, so GPS, camera
  serial, orientation metadata and the original bytes never reach the provider.
- The provider receives the district label (`서울 마포구`) and the citizen's
  text. It does **not** receive precise coordinates, the landmark, the original
  filename, the account email or the storage key.
- External transfer requires an explicit checkbox, checked again on the server.
  The alternative path (no AI) is always offered.
- No prompt, response body, image bytes or provider error body is logged. Logs
  contain only a report public id and a failure code.
- AI output is never published automatically. The existing human redaction
  preview and publication acknowledgement still gate every public report.
- AI privacy warnings are advisory. **Their absence is not proof of safety**,
  and the UI says so.

**Retention:** `store: false` means the response is not kept as application
state. It is **not** a zero-retention guarantee: the provider's own abuse-
monitoring retention may apply. The app makes no claim about zero retention,
training exclusion or data residency, and an operator must check the provider's
current terms before saying anything about them.

## Guardrails

`src/lib/ai/guardrails.ts` runs on every validated response, independent of what
the instructions said. A list item that breaks a rule is dropped and counted in
aggregate (`removedItems`, rule ids). A **draft** field that breaks a rule
rejects the whole analysis: the draft is what a citizen would copy into an
official portal, so it is never shown partially cleaned.

Rules: `url`, `contact` (phone/email/resident id), `plate`, `address`
(road-name/lot/unit), `agency` (named agency, department, emergency number),
`legal` (statute, fine, penalty, legal duty), `government_action` (filed,
received, repaired, answered), `prior_report`, `incident`, `measurement`,
`certainty`, `unhedged_interpretation`.

Exceptions: facts the citizen stated themselves may be restated (their own
measurement, injury, or a named agency they mentioned). Unknowns and evidence
requests may name an incident when they explicitly say it is unconfirmed.

**Limitation:** this is a pattern matcher, not a truth classifier. It reduces
but cannot eliminate fabricated or overconfident text. Every AI sentence stays
editable and labelled.

## Prompt injection

Citizen text is passed as a JSON **data** field, never concatenated into the
instructions. The instructions say that neither that field nor text visible in
the photo can change the rules. That reduces injection; what actually contains
it is the schema (no URL/agency/legal fields exist), the guardrails, and the
fact that model output cannot select a database row, an external URL or an
authorization decision. Injection tests live in `tests/ai-analysis.test.ts` and
`tests/ai-provider.test.ts`.

## Cost and abuse controls

All values are read and clamped at call time; a typo cannot disable a limit.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CIVICPULSE_AI_TIMEOUT_MS` | 25 000 | Abort deadline for one call |
| `CIVICPULSE_AI_MAX_OUTPUT_TOKENS` | 2 500 | Includes reasoning tokens |
| `CIVICPULSE_AI_DAILY_LIMIT` | 100 | Live calls/day, all users (0 disables) |
| `CIVICPULSE_AI_USER_DAILY_LIMIT` | 10 | Live calls/day, one account |
| `CIVICPULSE_AI_PER_REPORT_LIMIT` | 5 | Attempts per report, all modes |
| `CIVICPULSE_AI_PRICE_INPUT_PER_MTOK` | 0.25 | **Estimate** input USD/1M |
| `CIVICPULSE_AI_PRICE_OUTPUT_PER_MTOK` | 2 | **Estimate** output USD/1M |

- One image per analysis, resized before transmission, bounded output tokens,
  one timeout, no automatic retries (a retry is a new, separately limited
  request), and an identical-input cache to stop double-tap calls.
- The route adds a per-process 8/min guard; the durable per-report and daily
  limits are SQL counts, so they survive a restart.
- `npm run ai:usage` prints aggregate counts, token totals and an **estimate**
  only. It never selects report text, prompts or hashes.

### Estimated cost (not measured)

At the placeholder list prices above, one analysis of roughly 1 500 input + 600
output tokens is about **$0.0016** (≈ 2 KRW at 1 400 KRW/USD). A 100-analysis
pilot is therefore on the order of a few hundred won. These are estimates from
published prices, not an invoice, and the image-token count varies by model and
detail level. Measure with `npm run ai:usage` after a real call.

## Operator smoke test (only with an authorized budget)

1. Set `CIVICPULSE_AI_MODE=openai`, `OPENAI_API_KEY`, `CIVICPULSE_AI_MODEL`, a
   spending limit on the provider account, `CIVICPULSE_AI_DAILY_LIMIT=1`,
   `CIVICPULSE_AI_USER_DAILY_LIMIT=1`, `CIVICPULSE_AI_PER_REPORT_LIMIT=1`.
2. Start the app and use a synthetic sample photo; tick the external-transfer
   consent box; run one analysis.
3. Confirm the panel says **실제 AI 분석**, the model name is the configured one,
   the observations are plausible and contain no invented address/agency/legal
   claim.
4. Run `npm run ai:usage` and record the counts, tokens and estimate.
5. Set the mode back to `mock` afterwards.

If any of these cannot be done, the honest status remains
`LIVE_MODEL_NOT_VERIFIED`.

## Known limitations

- No image PII detector; faces/plates depend on the model's `privacyWarnings`
  plus the existing human redaction step.
- No provider-side moderation endpoint is called; a refusal becomes a fallback.
- The guardrail pattern list is Korean-centric and incomplete.
- Simulation returns observations only for the three shipped sample photos, and
  says so for every other image.
- The fallback draft is deliberately generic: it is the deterministic template,
  not an analysis.
- No streaming; the panel waits for one bounded request.
- Rate limiting is per process in front of SQL daily limits; a multi-instance
  deployment would need a shared limiter.

## Apps in Toss boundary

The analysis endpoints are ordinary authenticated JSON APIs, so a future Toss
WebView can call them. That frontend must: obtain an authorized session over
HTTPS, upload the photo with `multipart/form-data`, show the external-transfer
consent itself, and keep the "open the verified official channel" navigation in
the host app. No Toss SDK is installed or called here; see
`docs/TOSS_READINESS.md`.
