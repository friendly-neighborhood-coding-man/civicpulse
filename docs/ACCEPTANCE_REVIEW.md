# Acceptance review — 2026-11-19

Independent acceptance review of the six-stage CivicPulse stack, followed by two
corrective work packages. **Review independence: self-review.** No independent
reviewer agent was available in this environment and the GitHub PR comments could not
be read (no authenticated `gh`), so every finding below was reproduced directly
against the code and a running app.

## 1. Verified starting state

- `stack/06-delivery` local and remote head: `280b590`.
- `c1a9782` is the **parent** of `280b590` (docs commit), not a divergent or newer
  head. `HANDOFF.md` had recorded both, which caused the apparent discrepancy.
- `origin/main` is `9dbfa5a` and was not touched.
- No Pull Request exists for any branch; `gh auth status` is unauthenticated and no
  token is present. PR bodies live in `docs/pr/`.

## 2. Confirmed defects, root cause and correction

| # | Defect | Root cause | Correction | Regression test |
|---|---|---|---|---|
| P0-A | Private draft title/body copied to the public page without review | Publish gate only checked photo acknowledgements | Content-bound review token + heuristic scan + explicit findings decision; audit stores no values | `text-privacy.test.ts`, publication text-gate tests, privacy E2E |
| P0-B | Any HTTPS URL accepted as an "official" status | `kind = 'official'` required only `https://` and moderator role | Migration v6 provenance kinds; registry host check; only `official_source` shown as official | `official-sources.test.ts`, community adversarial tests, community E2E |
| — | Evidence photos survive report takedown | Evidence photo route ignored parent report state | Route joins the report and requires `state = 'published'` | takedown E2E |
| — | Concurrent moderators can both "succeed" on one review | `UPDATE ... WHERE status = 'pending'` change count ignored | Check `changes === 1`, else conflict | community tests (double review refused) |
| — | A checked "text reviewed" box could approve later edits | Boolean acknowledgement not bound to content | Server token over exact title/body; stale token → 409 | publication stale-token test, privacy E2E |
| P1-A | Follow-up drafts ignored community support | No support data passed to the generator | Snapshot count, explicit "interest not truth" wording; eligibility unchanged | follow-up support test |
| P1-B | Evidence approved after the previous follow-up was excluded | Compared upload `created_at` | Compare `reviewed_at` against previous follow-up review time | follow-up chronology test |
| P1-C | No withdrawal/takedown path | `removed` state unreachable; no route or UI | Transactional state change + media cleanup + owner/moderator UI | `takedown.test.ts`, takedown E2E |

## 3. Verification executed

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | |
| `npm run lint` | PASS | 0 errors/warnings |
| `npm test` | PASS | 118 tests / 20 files |
| `npm run build` | PASS | production build |
| `npm run e2e` | PASS | 16 Chromium tests on `next start` |
| Visual review | DONE | 1280px + 390px privacy panel, public provenance, withdrawn owner page |

Failures observed during the work, and how they were handled (none were suppressed):

1. Follow-up text printed "시민 주장" for a moderator note → renderer used a hardcoded
   label. Fixed to use the event's provenance label; test asserts 미검증.
2. Unit-address text ("101동 1203호") was classified as a plate → pattern ordering.
   Address pattern now runs first; test asserts all six kinds.
3. E2E `getByLabel("제목")` became ambiguous after adding the public-text region →
   locator made exact; real label semantics unchanged.
4. An official-source request missing `sourceUrl` returns 422 (structural validation)
   rather than 400; the test now asserts 422 and keeps 400 for domain-rule failures.
5. E2E feed assertion matched identical titles from other tests → assert by issue URL.
6. Withdrawal success message unmounted on refresh → assert the persisted removed
   state instead.
7. Visual review exposed the internal `owner_withdrawn` enum rendered as the reason →
   a human-readable default reason is stored; custom moderator reasons preserved.

## 4. Findings resolved vs open

**Resolved:** P0-A, P0-B, P1-A, P1-B, P1-C, evidence-photo lifecycle, duplicate review
race, stale text acknowledgement, internal enum in owner UI.

**Open (documented, not silently accepted):**

- Heuristic text scan false negatives/positives; human review is the only control.
- Official provenance verifies a domain, not the cited page; no authenticated API.
- Withdrawal is not erasure: backups, external caches, search engines, screenshots.
- No scheduled retention purge; removed reports keep private originals and audit rows.
- Demo auth, in-memory rate limits, single-node SQLite, local media disk.
- No published-text revision flow; no pagination; no notifications; no account
  deletion/export.
- Toss integration remains unimplemented and unclaimed.

## 5. Architecture assessment

**Localized defects (fixed here):** publication trust model, evidence authorization
gap, review idempotency, evidence timestamp semantics.

**Systemic, deferred, and requiring a decision before a pilot:**

1. *Identity* — the signed demo cookie is not authentication. Every authorization
   rule is correct against the acting user, but the acting user is chosen from a
   dropdown. Real identity is a prerequisite for any public deployment.
2. *Storage* — SQLite and local files make the app single-node. Moving to a managed
   database and object storage is a boundary change, not a refactor, and the public
   media route must keep its `no-store`/visibility checks.
3. *Retention* — withdrawal now exists, but retention is policy-free. A purge job,
   legal-hold concept and backup story are still missing.
4. *Moderation* — one moderator role with no audit console beyond pending evidence;
   takedown has no separate review or appeal.
5. *Public text* — no revision flow means a correction requires withdrawal. A
   revision model with history is the next structural improvement.

The codebase remains modular enough to absorb these: domain functions own the rules,
routes are thin, public projections are explicit, and migrations are append-only.

## 6. Technical debt (ordered)

1. Real authentication + session rotation; per-user data export/deletion.
2. Durable rate limiting and abuse controls; public pagination.
3. Published revision flow (title/body/photo) with history and re-review.
4. Retention scheduler and media lifecycle (pending/rejected/removed).
5. Content verification for official sources (store the checked page, not just host).
6. Replace `FaceDetector` experiment with a documented manual-only workflow or a
   server-side detector with consent and cost limits.

## 7. Recommended next stage

`stack/09-identity-and-retention`: real authentication boundary, per-user deletion and
export, retention scheduler, and a published-text revision flow with re-review. That
package addresses the systemic risks that block any real pilot; Toss work should wait
until it lands.
