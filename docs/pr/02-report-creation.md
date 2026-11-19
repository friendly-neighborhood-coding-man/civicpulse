# PR 02 — Report Creation

- **Base:** `stack/01-foundation`
- **Head:** `stack/02-report-creation`
- **Head SHA (verified):** see branch head after push (`git rev-parse stack/02-report-creation`)
- **Status:** Draft (PR creation blocked in the agent sandbox; see “Recovery”)

## Scope

Turn a synthetic photo + approximate area + text into a **private, editable draft**
with a deterministic assistant draft, evidence checklist and verified-channel guidance.
Nothing is published and nothing is submitted anywhere.

Implemented:

- `POST /api/reports` (multipart) with owner-only draft creation and two stored media
  rows (`original` private, metadata-free `working` WebP).
- `GET /api/reports`, `GET/PATCH /api/reports/[publicId]`, owner-only photo route.
- Sharp-based intake: real format detection, size/pixel/side limits, animated-image
  rejection, EXIF orientation applied and stripped from the working copy.
- Deterministic `generateDraft` (template engine, `assistant_mode = 'mock'`) that never
  invents agencies, contacts, URLs or statuses.
- Curated channel registry with official sources and check dates (안전신문고, 국민신문고),
  and an explicit “확인된 공식 창구 없음” state.
- Pages: `/reports/new`, `/reports`, `/reports/[publicId]`, Korean 404; responsive
  layout verified at 390×844 and 1280×1000.

## Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | |
| Lint | `npm run lint` | PASS | |
| Unit/integration | `npm test` | PASS | 58 tests (31 new in this stage) |
| Production build | `npm run build` | PASS | |
| Browser E2E | `npm run e2e` | PASS | 7 Chromium tests (3 new) |
| Visual review | `node scripts/capture.mjs` | PASS | desktop + 390px mobile screenshots inspected |

## Observed happy path

Sign in as 김민지 → `/reports/new` → choose synthetic “쓰레기 투기” sample → area
`busan-haeundae`, landmark `시장 입구`, category `waste`, 10+ char description →
draft page with generated title `시장 입구 인근 쓰레기 무단투기 신고`, 안전신문고 card,
private badge, authenticated photo. Editing the title and reloading shows the saved
title; the database row and both media files exist on disk.

## Negative cases observed

- Description < 10 chars → 422 `VALIDATION_FAILED` (no files written).
- Missing photo → 400; text file spoofing `image/jpeg` → 415 (sharp decode fails).
- Foreign `Origin` → 403.
- Another demo user opening the draft URL → Korean 404 (no existence leak); the
  owner’s own photo endpoint returns 200 while another user’s would 404.
- Signed-out `/api/reports` → 401.
- Unit tests: tampered/oversized/oversized-dimension/animated uploads rejected; media
  files removed when the DB insert fails; published reports cannot be edited as drafts.

## Fresh-eyes review (self-review — no independent reviewer agent was available)

Findings fixed before commit:

1. **PATCH could blank fields.** `landmark.default("")` inside the update schema made
   `{}` valid and would have reset the landmark on title-only edits. Fixed by removing
   defaults from the update schema; regression test added.
2. **Layout defects on 390px.** Header wrapped onto two rows, `<legend>` overlapped card
   borders, and Korean headings broke mid-word. Fixed with nowrap header layout, sr-only
   legends + visible headings, and `word-break: keep-all`; re-captured screenshots.
3. **Misleading home strip** claimed “제보 저장됨” based on list length; removed.

Remaining risks recorded below.

## Safety and privacy

- Drafts are private; raw originals are never served over HTTP (no route reads the
  `original` role).
- Public coordinates are rounded to 2 decimals and precise coordinates are not
  returned by any API.
- No external network call is made while creating a draft (the sample images ship with
  the app; the assistant is offline).
- Synthetic sample images only; they are illustrations, not photographs of real places.

## Known limitations / blockers

- **No independent reviewer agent** was available in this environment; review above is
  self-review.
- Upload buffering: multipart bodies are read into memory before size validation on the
  decoded file; a deployment must cap request size at the proxy.
- No interactive map or precise address selection: district-level centroids only, clearly
  labelled as approximate.
- Remote model adapter is not implemented; `CIVICPULSE_AI_MODE=openai` has no effect yet
  (documented as BLOCKED pending authorization and budget).
- Draft deletion/revision history is not implemented.

## Next stack step

`stack/03-privacy` on top of this branch: face/plate redaction preview with manual mask
correction, EXIF removal proof, explicit consent, and server-side public/private media
separation.

## Recovery (PR creation)

```bash
gh pr create --draft --base stack/01-foundation --head stack/02-report-creation \
  --title "02 · Report Creation" --body-file docs/pr/02-report-creation.md
```
