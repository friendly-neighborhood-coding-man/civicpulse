# CivicPulse

**From one report to collective action.**

CivicPulse is an experimental, community-powered civic issue reporting and tracking app. It helps people prepare a report from a photo, approximate location and short description; optionally share the issue; collect supporting evidence; follow the outcome; and prepare a **human-reviewed** follow-up if a problem remains unresolved.

## Scope and status

- **Status:** hackathon prototype; not an official government service.
- **Primary distribution target:** Apps in Toss (Toss Mini App), subject to developer-platform policy and review.
- **Demo:** a responsive standalone web experience that works without Toss-specific APIs.
- **Initial geography:** South Korea; official reporting channels must be checked against authoritative sources and are not assumed to support email.
- **Data:** synthetic reports and non-sensitive demo images until privacy, consent, moderation and operational review are complete.
- **Outbound actions:** NEVER send real complaints, emails or notifications automatically; keep submissions as user-reviewed drafts or verified portal handoffs.
- **Budget target:** up to KRW 50,000/month in an eventual small pilot, not a promise that costs stay within that limit.

## Why it exists

Submitting a civic issue is only the beginning. People may have difficulty choosing the right channel, satisfying evidence requirements, understanding official responses, and coordinating non-duplicative community follow-up.

CivicPulse aims to reduce that friction while distinguishing citizen claims, official decisions and verified repairs.

## MVP flow

1. Add photo, approximate location and a short description.
2. Review an AI-assisted, **editable** report draft and verified official submission guidance; disclose uncertainty.
3. Opt in to public sharing only after privacy review (face/plate redaction, metadata removal, manual correction).
4. Let other citizens follow, support and contribute evidence to one issue.
5. Track *user-reported*, *officially confirmed* and *unverified* status separately.
6. When an applicable waiting period has passed **and substantive new evidence exists**, prepare a reviewable follow-up; never auto-send.

## Current implementation (stage 02 — report creation)

Working today on `stack/02-report-creation`:

- responsive Next.js 16 shell with an honest description of scope and safety boundaries;
- demo identity switching (signed httpOnly cookie) with seeded citizen/moderator identities;
- SQLite persistence with versioned migrations, foreign keys and WAL;
- **private report drafts** from a photo, a district-level location and a short description,
  with a deterministic, offline draft assistant, an editable draft, an evidence checklist
  and source-checked official channel guidance;
- server-side image intake with sharp: real format detection, size/pixel limits,
  animated-image rejection, EXIF orientation applied and metadata stripped from the
  working copy; originals stay private and are never served over HTTP;
- owner-only access to drafts and photos (other users get a 404, not a 403);
- JSON API conventions: zod validation, same-origin mutation guard, safe error envelope,
  in-process rate limiting;
- Vitest suite (58 tests) over real SQLite and sharp, plus Playwright tests (7) in real Chromium.

Not implemented yet: automatic face/plate redaction, publication, community support and
follow-ups. The UI marks these as upcoming rather than simulating them.

### Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # typecheck + lint + unit tests
npm run build
npm test
```

Browser E2E (optional, needs a one-off download and sandbox libraries):

```bash
npm run e2e:libs     # extracts Chromium's missing .so files + fonts into ~/.cache (no root)
npm run e2e:install  # downloads Chromium
npm run e2e          # Playwright suites in e2e/
```

Reset local demo data: `npm run db:reset -- --yes`.

Optional visual capture for review: `node scripts/capture.mjs http://127.0.0.1:3000`
(writes desktop and mobile screenshots to `.local/screenshots/`).

### Documentation

- [Product contract](docs/PRODUCT.md)
- [Stack workflow and acceptance checks](docs/WORKFLOW.md)
- [Review checklist](docs/REVIEW_CHECKLIST.md)
- [Architecture and verification matrix](docs/ARCHITECTURE.md)
- [Agent instructions](AGENTS.md)

## Engineering process

Development uses stacked **Draft** PRs and repeated implement → execute → review → fix → verify cycles. See [AGENTS.md](AGENTS.md), [Product scope](docs/PRODUCT.md), [Stack workflow](docs/WORKFLOW.md) and [Review checklist](docs/REVIEW_CHECKLIST.md).

No production safety or official affiliation claims are implied by a successful demo.
