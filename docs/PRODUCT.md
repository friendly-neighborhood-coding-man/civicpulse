# CivicPulse product contract (MVP)

## Users and goals
Citizen: document a local issue with minimal friction, decide whether to publish, see the documented progression, and prepare a reasoned follow-up.
Community member: find issues without exposing private citizen details, express support (not legal validation), add relevant, reviewable evidence.
Operator: moderate public reports and manage abuse/false positives before any real public pilot.

## MVP story
A citizen enters a short Korean report about a damaged sidewalk, uploads a **synthetic/sample** photo, and selects an approximate location. The app generates an editable title, factual description, suggested missing evidence and a draft. Official reporting destinations may only be shown with verified source URLs and clear as-of dates; if unknown, show "not verified" and a neutral draft that the citizen can copy.

After a human-reviewed redaction preview, the citizen may publish a **redacted copy** at approximate location. Other demo users support the issue or attach new synthetic evidence. A timeline clearly identifies citizen assertions vs mock official responses. At a configurable *illustrative* waiting period, if the issue is still unresolved and fresh evidence exists, the app prepares a follow-up draft for explicit human approval; it does **not** send it.

## Acceptance invariants
- No publication without affirmative opt-in and privacy preview.
- Server authorization must prevent access to private drafts and raw media; obscuring in UI is insufficient.
- Public issue cards never include original image bytes, EXIF or precise coordinates.
- No simulated government action presented as actual. Every mock, sample and generated text is labeled.
- No outbound real complaint / email / SMS or automated re-filing.
- Support counters prevent uncontrolled repeated action; represent *reported support*, not unique real-world individuals unless authenticated.
- Waiting thresholds are product settings for demonstration, not statements of Korean legal deadlines. Actual deadlines and channels must be source-verified per report type.
- AI cannot silently fabricate official contacts, statuses, source references or legal requirements.
- When AI is missing, unsafe, expensive or fails, deterministic mock/explicit fallback remains usable without lying.
- Handle missing files, oversized uploads, wrong formats, report edits and malicious content safely.

## Deferred or excluded
Real government API integrations and auto submission, Toss login/ads in live mode without credentials and platform approval, payment processing, production moderation at scale, automatic legal interpretation, and handling real citizen photos before privacy/security review.

## Product success signals
Time to a valid report draft, missing-evidence detection, opt-in conversion, report-to-follow-up continuity, user-comprehensible status, zero falsely claimed government submissions, correctness of redaction workflow.
