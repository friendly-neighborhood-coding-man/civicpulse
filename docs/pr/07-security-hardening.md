# 07 · Security hardening: public text and status provenance

**Base:** `stack/06-delivery` **Head:** `stack/07-security-hardening`
**Status:** Draft. No merge, no deployment, no real submission.

## Why

Two acceptance blockers were reproducible on the stage-06 head (`280b590`):

1. **P0-A — public text was never reviewed.** `publishReport` gated only the photo.
   `title`/`description` were copied into the public projection verbatim, so a phone
   number, email or resident-id-shaped string in a private draft became public with
   no review step and no record.
2. **P0-B — HTTPS was treated as provenance.** `addStatusEvent` accepted any
   `https://` URL as `kind = 'official'` from a moderator. The timeline, feed,
   follow-up draft and status panel then presented it as 공식 확인. A link to
   `https://example.com` was indistinguishable from an official portal citation.

Two smaller defects found during the review are included:

3. `/api/public/evidence/[id]/photo` checked only evidence status, not the parent
   report state, so approved evidence photos would survive any future takedown.
4. `reviewEvidence` and `approveFollowup` ignored the `UPDATE ... WHERE status = ...`
   change count, so two concurrent reviewers could both report success.

## What changed

- New `src/lib/privacy/text.ts`: deterministic, explicitly fallible scan of the exact
  public fields, masked previews, aggregate-only audit.
- Publication gate: `textReviewed` + a server-issued `textToken` bound to the current
  title/body; a second acknowledgement when candidates exist. Editing the draft
  invalidates the old token. Findings are shown with the exact public text and a link
  back to the editor.
- Evidence notes run the same scan and are rejected with an editable message.
- Migration v6 rebuilds `status_events` with four provenance kinds and `source_host` /
  `source_checked_at`. Legacy `official` rows are reclassified by the new rule.
- New `src/lib/domain/official-sources.ts` validates hosts against the curated channel
  registry (exact/subdomain, no userinfo, https only) and documents that tier-1
  authenticated integration does not exist.
- Only `official_source` drives `officialStatus`, the feed status and the follow-up
  "resolved" rule. Unverified moderator notes appear separately and are labelled in
  drafts.
- Public media is `no-store`; evidence photos check the parent report state.

## Verification (observed)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 113 tests / 19 files at this stage |
| `npm run build` | PASS |
| `npm run e2e` | PASS — 15 Chromium tests |

Adversarial cases asserted: `https://example.com`, lookalike suffix domains,
userinfo links, `http://`, `javascript:`, resident-id/phone/email in text, stale
`textToken`, citizen-submitted official status, foreign origin, cross-user publish.

## Remaining risks

- Text detection is heuristic; false negatives are expected. The control is explicit
  human review, not the scanner.
- Official provenance is a domain check plus a moderator assertion; page content is
  not verified and no government API exists.
- Demo authentication and in-memory rate limiting are unchanged.

## Not implemented

No takedown/retention (stage 08), no real auth, no notifications, no edit-after-publish,
no deployment.
