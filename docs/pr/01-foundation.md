# PR 01 — Foundation

- **Base:** `main`
- **Head:** `stack/01-foundation`
- **Head SHA (verified):** `2c8fe47`
- **Status:** Draft (PR creation blocked in the agent sandbox; see “Recovery”)

## Scope

Stage 01 vertical slice only: app shell, demo identity, persistence, API conventions,
tests and CI. Report creation, AI draft, redaction, publication, community and
follow-ups are explicitly **not** part of this PR and are labelled “다음 단계” in the UI.

## Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | strict TS |
| Lint | `npm run lint` | PASS | eslint 10 + next/core-web-vitals |
| Unit/integration | `npm test` | PASS | 27 tests (observed; later stages raise this) |
| Production build | `npm run build` | PASS | all routes dynamic |
| Browser E2E | `npm run e2e` | PASS | 4 Chromium tests |

## Observed happy path

Home renders the scope/limits, the demo identity switcher sets an httpOnly signed
cookie, the choice survives reload, and sign-out clears it. `/api/health` reports
schema v1 and `assistantMode: mock`.

## Negative cases observed

- `Origin: https://evil.example` on `POST /api/session` → 403 `FORBIDDEN_ORIGIN`.
- Unknown demo user → 404; malformed JSON shape → 422 `VALIDATION_FAILED`.
- Tampered/expired session token → treated as signed out (unit tests).
- Internal exception text never reaches the client (unit test asserts the secret
  string is absent from the 500 body).

## Safety and privacy

No external effects, no real data, no secrets committed, no government claims.
Session secret is generated locally under `.local/` (mode 0600) when not provided.

## Known limitations

- Demo identity is not authentication: anyone reaching the app can act as any demo user.
- Rate limiting is per process.
- No interactive map; no report creation yet (later stages).
- Sandbox playwright setup needed a root-free library/font extraction script
  (`npm run e2e:libs`) because the image lacked Chromium’s shared libraries and fontconfig.

## Recovery (PR creation)

The sandbox had no authenticated GitHub CLI, so the branch was pushed but the Draft PR
was not created. From a machine with repository access:

```bash
gh pr create --draft --base main --head stack/01-foundation \
  --title "01 · Foundation" --body-file docs/pr/01-foundation.md
```
