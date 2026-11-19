# CivicPulse agent instructions

Applies to all coding agents, including Freebuff.

## Mission
Deliver a simple, genuinely functioning hackathon MVP with a path to Apps in Toss and a standalone demo. Prioritize demonstrable behavior and reliable, reusable code over impressive-looking but fake functionality.

## Non-negotiables
- Keep `main` untouched after the initial repository bootstrap. Work only on feature branches and **Draft stacked PRs**. NEVER merge, force-push, enable auto-merge, mark ready for review, or deploy a live public service without the operator.
- No real complaints or follow-up messages sent. No real recipient emails invented. No unverified governmental integration represented as working. Real-world handoff is user initiated and uses verified official sources; otherwise explicit MOCK.
- Use only synthetic/non-sensitive test data and demo photos; no production citizen data, secrets or personal research materials in public commits, tests, screenshots, logs or previews.
- Public sharing must be opt-in. Do not expose original photos, precise coordinates, EXIF data, face/plate identifiers, names, contact details or private report content. Automated redaction is fallible: require human preview and manual correction before publication. Never silently publish.
- Distinguish **official status**, **user-provided claim**, and **unverified/inferred status** in storage and UI. Do not display fabricated processing states.
- Community support is not truth or a vote on rights. No duplicate automated filing, brigading, harassment, or claims that public support guarantees response. Follow-ups require an appropriate time window, new relevant evidence and operator/user review.
- Do not store API keys in client code. Budget-limit external AI/API usage, use deterministic/mock mode when keys absent, and do not bill real API endpoints unless credentials and limits were explicitly provided.
- No hardcoded success verdicts. Tests must assert observed results. Failed tests remain failed until reproduced and fixed; never conceal failures. Do not label a feature complete based only on compile or mock success.

## Working autonomy
The operator may be offline. Continue through the work packages and review/fix loops **only while actions remain reversible, within this repo and free of external side effects**. Do not stop at an ordinary working checkpoint to ask for supervision. Respect hard stops for secrets, payments, production deployments, real users/complaints, platform account/app registration, changes to repo permissions/settings, or external spending.

For each stage:
1. Read current code and task scope; build the smallest complete vertical slice.
2. Exercise it (type/lint/unit/integration and real local E2E where possible). Never claim browser interaction without doing it.
3. Perform a **fresh-eyes review** against docs/REVIEW_CHECKLIST.md: data trust, false success, integration boundaries, persistence and dangerous defaults.
4. Fix findings, rerun focused and regression tests, and repeat review as long as substantive problems remain and bounded progress is possible.
5. Commit checkpoints, push the stage branch and open/update its Draft PR based on the immediately preceding branch. Record commands, observed results, precise limitations, links and next stage.
6. Continue to the next stage only after its own acceptance criteria pass. If blocked, log exact blocker, preserve working evidence, then work on an independent safe task; never fake a pass.

## Definition of done per stage
A real running happy-path scenario; corresponding negative cases; regression tests; documented unresolved limitations; no secrets, personal data or external effects; PR and commit refs; accurate status: VERIFIED / LIMITED / BLOCKED.

## Stack order
1. `stack/01-foundation` → base `main`
2. `stack/02-report-creation` → base `stack/01-foundation`
3. `stack/03-privacy` → base `stack/02-report-creation`
4. `stack/04-community` → base `stack/03-privacy`
5. `stack/05-followup` → base `stack/04-community`
6. `stack/06-delivery` → base `stack/05-followup`

Keep parent branches stable once children exist. To fix an ancestor, coordinate dependent rebases carefully and verify each diff again. Avoid unrelated rewrites.

Detailed acceptance checks: [docs/WORKFLOW.md](docs/WORKFLOW.md).
