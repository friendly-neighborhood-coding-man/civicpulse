# PR 03 — Privacy Protection

- **Base:** `stack/02-report-creation`
- **Head:** `stack/03-privacy`
- **Status:** Draft (PR creation blocked in the agent sandbox; see “Recovery”)

## Scope

Redaction, explicit consent and the server-side separation between private drafts
and public issues. Still no outbound submission of any kind.

Implemented:

- Manual mask editor on the real photo: drag/touch rectangles, three modes
  (solid, blur, pixellate), delete, clear, and a keyboard-usable “가운데 영역 추가”.
- Server-rendered preview (`POST …/redaction/preview`) so the citizen reviews the
  exact image that will be published, not a CSS approximation.
- Publication gate (`POST …/publish`): ownership, draft state, both acknowledgements,
  a separate “nothing sensitive in this photo” confirmation when no masks exist, and
  a preview that must match the current mask set.
- Redacted public derivative is re-encoded server-side from the working copy with
  every mask applied and no metadata; originals and working copies stay private.
- Audit trail: each mask is stored in `redaction_masks` with mode/source/timestamp,
  consent version and review timestamp are stored on the report.
- New public surfaces: `/issues/[publicId]`, `/api/public/reports/[publicId]` and
  `/api/public/reports/[publicId]/photo` with a deliberately narrow projection.
- Owner page becomes read-only after publication; `/reports` lists public links.

## Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | |
| Lint | `npm run lint` | PASS | |
| Unit/integration | `npm test` | PASS | 80 tests (22 new) |
| Production build | `npm run build` | PASS | |
| Browser E2E | `npm run e2e` | PASS | 10 Chromium tests (3 new) |
| Visual review | `node scripts/capture.mjs` | PASS | mask editor, preview and public page inspected |

## Observed happy path (browser)

김민지 → create draft from the synthetic sidewalk sample → drag a mask over the photo
(“가림 영역 1곳”) → “서버 미리보기 만들기” shows the server-generated image → both
acknowledgements → “가림 처리 후 공개” → badge “공개됨”, body becomes read-only →
`/issues/<id>` renders in a **fresh browser context with no cookies**, including the
redacted photo (naturalWidth > 0), the area label, “가림 처리 1곳”, and the
official-channel card sourced from 안전신문고.

## Negative cases observed

- Publish without the privacy or consent acknowledgement → 409, still a draft.
- Publish with zero masks and no “nothing sensitive” confirmation → 409.
- Mask out of bounds → 422 at the schema boundary.
- Foreign `Origin` → 403. Another user publishing → 404.
- Draft photo and public JSON/photo routes → 404 before publication.
- Draft route projection unit test asserts the public payload contains no owner id,
  no coordinates, no original description and no storage keys.
- Transaction failure during publish removes the newly written public file and leaves
  the report as a draft with no masks recorded.

## Adversarial false-negative test (the important one)

`tests/redaction.test.ts` includes a test asserting that **pixelating a
uniform-colour region leaves the original colour intact**, and documents it as a real
limitation rather than hiding it. Consequences implemented:

- solid (opaque fill) is the default mode;
- the UI states that pixellate/blur can be ineffective on flat areas;
- the publish gate never treats any mode or the experimental detector as proof —
  it requires a human acknowledgement of visual review.

Automatic face detection is optional and only runs if the browser exposes the Shape
Detection API (`FaceDetector`). It is labelled “실험적 자동 감지” and was **NOT_RUN**
in this environment (headless Chromium does not expose it); the mapping logic is unit
tested. Plate detection is **not implemented** and the UI says so.

## Fresh-eyes review (self-review — no independent reviewer agent available)

1. **Mask alignment bug found by review.** Masks were positioned against a letterboxed
   container while the server applied them to the image, so a non-matching aspect ratio
   would shift every rectangle. Fixed by making the drawing surface hug the image box
   exactly and passing the real pixel dimensions.
2. **Unsafe default.** Default mode was pixellate; a flat-colour mask looks unchanged
   in the preview. Default changed to solid and the hint added.
3. **Editable-looking published page.** After publication the owner page still showed
   an editor that the API rejects. Now the body renders read-only with an explanation.

## Known limitations

- Redaction is manual/visual. No face or plate detector is verified in this build.
- A published issue cannot be edited or replaced yet; there is no takedown flow.
- Public photos are served with `Cache-Control: public, max-age=60`; a takedown would
  not clear third-party caches.
- Masks are only stored on publication; leaving the page loses unsaved rectangles.
- `node:sqlite`/sharp require a Node runtime, so this is not Workers-deployable as-is.

## Next stack step

`stack/04-community` on top of this branch: public feed, one-support-per-user with
abuse guards, moderated additional evidence, and a source-labelled timeline.

## Recovery (PR creation)

```bash
gh pr create --draft --base stack/02-report-creation --head stack/03-privacy \
  --title "03 · Privacy Protection" --body-file docs/pr/03-privacy.md
```
