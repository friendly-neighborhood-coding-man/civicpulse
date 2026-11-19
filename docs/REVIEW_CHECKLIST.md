# Fresh-eyes review checklist

Use this checklist at least twice per stage, especially after fixing defects.

## Real functionality
- Can a user exercise the feature end to end on the running app? What exact steps were executed?
- Does any UI report success without checking the actual returned result?
- Are failures, empty/loading states, stale state, restart and concurrent actions handled?
- Do automated tests assert actual state transitions and reject invalid input?

## Security/privacy
- Can one user access another user's draft/raw photo/publication controls?
- Do public API replies or client bundles reveal secrets, raw media, precise coordinates or EXIF?
- Is publication default-private and gated by explicit preview/consent?
- Do automatic redaction misses require human confirmation and correction?
- Can untrusted strings, media, links or model outputs lead to injection, SSRF, unsafe HTML or unwanted outbound requests?
- Are abuse controls sufficient for support counts, public posts and evidence uploads?

## Accuracy & civic integrity
- Are official agency names, inboxes, links and requirements verified, cited and current, or clearly marked unknown?
- Are user claims and official status kept strictly separate?
- Does the waiting rule reflect a demo choice rather than fabricated statutory time?
- Are follow-up drafts non-dispatched without explicit human action, with new evidence and duplication review?
- Are legal outcomes and repairs never claimed from social support or mock data?

## Architecture & cost
- Could another agent add the next stage without rewriting the previous one?
- Do data boundaries and local/mock services have clean interfaces?
- Are storage/image and AI requests bounded by size, rate, frequency and budget?
- Would a reset, failed database write or process restart silently lose or fabricate user state?
- Are third-party licenses, model data handling and Toss constraints correctly documented?

## Final truthfulness
- Mark each claim VERIFIED / LIMITED / BLOCKED / NOT_RUN using observed evidence.
- Include reproductions for unresolved failures and avoid celebratory but misleading 100% pass claims.
