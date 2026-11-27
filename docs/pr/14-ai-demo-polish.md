> **Draft / self-review.** Simulation path verified; live provider **not** verified.
> No merge, deployment, real complaint, paid call or Toss integration is authorized.

Tracks [#1](https://github.com/friendly-neighborhood-coding-man/civicpulse/issues/1).

# 14 · AI demo polish and handoff

**Base:** `stack/13-ai-verification` (`e5e5ae8`)
**Head:** `stack/14-ai-demo-polish`
**Status:** Draft.

## Why

The assistant works, but a hackathon demo needs a phone-sized, reproducible path
and honest evidence. This branch adds the mobile browser project, a synthetic
screenshot run, a one-command demo launcher, and the final operator handoff.

## What changed

- `playwright.config.ts`: a `mobile-chromium` project (Pixel 5) that runs the AI
  spec at a phone viewport. The iPhone descriptors were avoided because they
  default to WebKit, which this repository's browser setup does not install.
- `playwright.demo.config.ts` + `e2e-demo/ai-demo.spec.ts`: a fresh simulation-mode
  server on port 3400 that captures five synthetic screenshots. Two are phone
  viewport captures (the full-page mobile panel exceeded 8192 px and made a poor
  asset); one is desktop.
- `scripts/demo-ai.sh` + `npm run demo:ai`: builds and starts a fresh
  simulation-mode demo on port 3500. No key, no network, no cost.
- `npm run e2e:demo`: regenerates the screenshots from the shipped samples.
- `docs/DEMO.md`: an AI walkthrough, an honest-failure demo, updated suite counts
  and a screenshot index. The old claim “No AI model” is replaced with the precise
  simulation/live distinction.
- `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/TOSS_READINESS.md`: AI
  operations, storage, limits, consent and Toss boundaries.
- `HANDOFF.md`: branches, PR recovery commands, verification, provider status,
  sample output, cost, remaining Devpost/Toss work.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` / `lint` / `test` | PASS — **208 tests / 31 files** |
| `npm run build` | PASS |
| `npm run e2e` | **21 passed** (19 desktop + 2 phone-sized AI) |
| `npm run e2e:password` | **4 passed** |
| `npm run e2e:fallback` | **1 passed** |
| `npm run e2e:demo` | **1 passed**, five PNGs written |

The screenshots were visually inspected: the phone form, the simulation badge
and provenance, the observations/interpretations, the draft preview, the apply
button and the optional clarification all render without overflow. The desktop
panel keeps its two-column layout.

## Limitations

- `LIVE_MODEL_NOT_VERIFIED`; no real provider output exists. The screenshots show
  the simulation badge, not live inference.
- Chromium only; Pixel 5 emulation, not a physical device.
- The demo observations are pre-written for the shipped samples.
- Screenshots are synthetic but still binary files in the repository (~1.3 MB).
- No merge, deployment or Toss integration.

## Next

Operator decisions: authorize a bounded live smoke test, choose a current model
and prices, review the Korean copy, and decide whether to deploy. No further
stacked stage is planned.
