> **Draft / self-review only.** No independent reviewer agent was available in
> this environment, so this is labelled **self-review**, not independent
> acceptance. No merge, deployment, real complaint or paid API call is
> authorized.

Tracks [#1](https://github.com/friendly-neighborhood-coding-man/civicpulse/issues/1).

# 13 · AI verification and adversarial review

**Base:** `stack/12-multimodal-ai` (`fc9e9c1`)
**Head:** `stack/13-ai-verification`
**Status:** Draft. Simulation verified; live provider **not** verified.

## What this branch is

A review-and-fix pass over the stage-12 assistant. It adds adversarial tests for
the failure modes the product must survive, a dedicated browser suite for the
"live configured, no key" deployment, a password-mode AI test, and the fixes
those tests exposed.

## Review matrix

| Attack / risk | Test | Observed outcome |
| --- | --- | --- |
| Prompt injection in the description | `tests/ai-adversarial.test.ts` | Model text with a fabricated agency/contact/URL is rejected; the fixed fallback action is stored; the model sentence is absent from storage |
| Injection via image text | Not testable here | No OCR pipeline; documented limitation. Image text is treated as scene content by instruction only |
| Fabricated government contact | unit guardrail + adversarial | `url`/`contact`/`agency` rules; whole draft rejected, not partially cleaned |
| AI legal assertion | unit + adversarial | `legal` rule rejects the draft; no statute reaches the report |
| Unsupported certainty | unit + adversarial | `certainty` and `unhedged_interpretation` rules; list item dropped, draft rejected |
| Privacy-sensitive image content | simulation fixtures + guardrail `plate` | Advisory privacy warnings; a model-supplied plate is dropped; no image PII detector (documented) |
| Unauthorized cross-user access | unit + two browser suites | 404 on read, analysis and apply; a guessed analysis id from another report is also 404 |
| Duplicate model invocation | `tests/ai-analysis.test.ts` | Identical inputs reuse the stored result; provider called once; `refresh` is the only bypass |
| Provider outage | unit + adversarial | Typed `timeout`/`network`/`provider_error` fallbacks; a later retry succeeds without `refresh` |
| Unbounded retry / cost | unit | Per-report attempts, per-user and global 24h live limits, zero-budget shortcut; no provider call after the limit |
| Draft editing after AI | browser (demo + password) | Citizen edit is saved, survives reload, and blocks a silent re-apply until overwrite is confirmed |
| Silent simulation substitution | `e2e-fallback/ai-fallback.spec.ts` | Live mode without a key shows `AI 사용 불가 · 대체 초안`; no live or simulation label, no observations, draft still usable |
| Provenance in telemetry | adversarial + `/api/health` | `mode`, `provider`, `model`, `externalTransfer`, `simulatedObservations` stored per row; health reports `configured` |

## Findings and fixes

1. **Consent was demanded when no transfer could happen.** In live mode without a
   key, the new-report form required the external-transfer checkbox even though
   the server returns a `missing_credentials` fallback before any network call.
   Consent is now required only when a provider is actually configured; the
   disclosure text says the key is missing. Found by the fallback browser suite.
2. **The fallback repeated its failure reason.** It appeared both in the
   provenance notice and in the "확인되지 않은 것" list. The list now contains
   only the "photo not analysed" statement.
3. **The identical-input cache ignored the prompt and schema version.** A prompt
   change could have reused an old result. The fingerprint now includes
   `ANALYSIS_SCHEMA_VERSION`, `PROMPT_VERSION`, the area label and the provider
   identity.
4. **Guardrail negation was evaluated per sentence.** "이미 접수되었으므로 추가
   조치는 없습니다" was exempted by its final `없습니다`. Negation is now checked
   only in the words immediately around the matched claim.
5. **The provenance card labelled analysis creation time as "적용 시각".** It now
   uses `appliedAt`.
6. **Small UI defects:** duplicate React list keys for repeated facts, and
   `분석 -ms` for fallbacks with no latency.

## Verification (run on this head)

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | **208 tests / 31 files** PASS |
| `npm run build` | PASS |
| `npm run e2e` (demo Chromium) | **19 tests** PASS |
| `npm run e2e:password` (password Chromium) | **4 tests** PASS |
| `npm run e2e:fallback` (live-without-key Chromium) | **1 test** PASS |

## Live-provider smoke test

**BLOCKED — `LIVE_MODEL_NOT_VERIFIED`.** `OPENAI_API_KEY` is not present in this
environment and no spending authorization exists. No real request was made, so
there is no measured cost and no sanitized real-provider output.

To run it later (only with authorization and a provider-side spending limit):

1. Set `CIVICPULSE_AI_MODE=openai`, `OPENAI_API_KEY`, `CIVICPULSE_AI_MODEL`, and
   `CIVICPULSE_AI_DAILY_LIMIT=1`, `CIVICPULSE_AI_USER_DAILY_LIMIT=1`,
   `CIVICPULSE_AI_PER_REPORT_LIMIT=1`.
2. Use a synthetic sample photo and one short description; tick consent.
3. Record the panel's provenance, the observation text, and `npm run ai:usage`
   output. Then set the mode back to `mock`.

## Residual risks (not fixed)

- Guardrails are deterministic Korean-centric patterns; novel phrasing can pass.
- No image OCR, face or plate detector. Human redaction remains mandatory.
- Provider retention/training/residency is unknown and not asserted.
- Rate limiting is per process in front of SQL daily limits.
- A simulation result for an unknown photo has no visual observations, by design.
- The guardrail for "prior report" cannot distinguish a true history the citizen
  omitted from a fabrication; it drops the statement rather than guessing.
- Browser coverage is Chromium only.

## Next

`stack/14-ai-demo-polish`: mobile viewport journey, reproducible demo script,
synthetic screenshots, final handoff. No merge.
