# Stacked PR execution & review protocol

## Branches
| Stage | Draft PR base | Goal and acceptance probe |
|---|---|---|
| 01 foundation | `main` | App starts; responsive home, demo mode, data interfaces, tests; no secret required |
| 02 report creation | `stack/01-foundation` | Synthetic image/location/description → editable draft; missing/invalid input tests; no invented contacts |
| 03 privacy | `stack/02-report-creation` | Automatic face/plate redaction where actually supported, editable/manual masks, explicit consent; server-side private/public data distinction; adversarial false-negative test |
| 04 community | `stack/03-privacy` | Opt-in public feed, support with abuse guard, additional evidence moderation, clear source-labeled timeline; persistence and cross-user authorization tests |
| 05 follow-up | `stack/04-community` | Eligible only after configurable waiting period, unresolved status, relevant new evidence, explicit user approval; never automatically dispatched; repeat/duplicate boundary tests |
| 06 delivery | `stack/05-followup` | Standalone web demo, documented Toss adaptation/SDK compatibility, smoke E2E and hackathon handoff; no publishing or app registration |

## Review loop (repeat within each stage)
IMPLEMENT → RUN (real observed tests) → FRESH-EYES REVIEW → PATCH → RE-RUN → REVIEW. 
Use multiple review/fix passes if necessary. A stage is not accepted merely because one passing demo exists.

## PR evidence format
- Summary / changed components
- Parent branch and head SHA
- Exact verification commands and outcomes (PASS, FAIL, NOT_RUN)
- Happy-path E2E and a negative test with observed artifacts; label mocked behavior explicitly
- Fresh-eyes findings: severity, reproduction, fix commit, retest outcome
- Remaining risks, limitations, security/privacy concerns
- What is still NOT implemented; cost and user-data assumptions
- Next task and whether safe to proceed without operator

## Guardrails for overnight operation
- Treat time as an opportunity, not a deadline: maximize *verified* stages, not number of PRs.
- Do not sacrifice regression tests or change assertions to make tests pass.
- No real external service, personal-data processing, spending, production publishing, merging or changing GitHub repository settings.
- If tests require credentials, hardware, OS support, platform approval or network access, explicitly report BLOCKED or NOT_RUN and use a clearly labeled simulated path. Avoid repeated expensive retries.
- If an issue invalidates a fundamental assumption, stop depending on it and document architectural alternatives rather than piling on speculative patches.
- Preserve safe checkpoints and continue only on tasks whose dependencies are actually met.
- Final status: links to Draft PR stack, last working SHA, features VERIFIED, risks and next actions for human review.

## Engineering expectations
Prefer simple typed modular code, validated inputs, small cohesive modules, migration-friendly persistent models, basic auth for user-owned data (or strictly single-user in-memory mock), and dependency/version pinning where practical. Add CI when the chosen stack and test commands exist. Do not invent a test result or automatic browser screenshot.
