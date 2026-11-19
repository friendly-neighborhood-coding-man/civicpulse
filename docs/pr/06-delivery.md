# PR 06 — Demo & Toss Readiness

- **Base:** `stack/05-followup`
- **Head:** `stack/06-delivery`
- **Status:** Draft (PR creation blocked in the agent sandbox; see “Recovery”)

## Scope

A handoff-quality demo of the standalone web app plus an explicit, non-speculative Toss
integration boundary. No SDK is installed, no app is registered, nothing is deployed.

Implemented:

- `src/lib/platform/bridge.ts`: platform capability description (share, external open,
  clipboard, platform identity), a web implementation, an honest
  `TOSS_ADAPTER_STATUS = { implemented: false }`, and `shareText()` with
  `navigator.share` → clipboard → explicit failure. No guessed Toss API names.
- Footer now states “웹 데모 · Toss 미연동” so the UI cannot imply an integration.
- `docs/TOSS_READINESS.md`: official-documentation summary with links and dates, an
  architecture gap table (runtime, identity, share/deep link, design, bundle, policy),
  a pre-integration checklist, and unverified cost notes.
- `docs/DEMO.md`: run commands, identities, a fifteen-minute walkthrough, the claims a
  presenter must not make, and failure cases worth showing.
- `docs/HANDOFF` content lives in the root `HANDOFF.md` (stack, SHAs, verification,
  limitations, next actions).
- Capture scripts for all stages (`scripts/capture*.mjs`) documented for visual review.

## Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | |
| Lint | `npm run lint` | PASS | |
| Unit/integration | `npm test` | PASS | 98 tests (3 new platform tests) |
| Production build | `npm run build` | PASS | |
| Browser E2E | `npm run e2e` | PASS | 14 Chromium tests, unchanged and still green |

## Toss-specific verification status

| Item | Status | Why |
|---|---|---|
| Official docs reviewed | VERIFIED | Developer center pages read on 2026-11-19 (links in `docs/TOSS_READINESS.md`) |
| SDK integration | NOT_RUN | Not implemented; would require official SDK adoption, no invented APIs |
| `.ait` bundle build/upload | NOT_RUN | Requires a Toss workspace, business registration and console access |
| Toss login / identification key | NOT_RUN | Demo cookie identity only; must be replaced before any real user |
| Share link (`intoss://`) | NOT_RUN | Only a browser share fallback exists |
| TDS design adoption | LIMITED | Light-only custom UI; TDS not adopted |

## Known limitations

- The application requires a Node server (`sharp`, `node:sqlite`); it is not a static
  WebView bundle, and no hosting decision has been made.
- No account deletion/export, retention policy or real authentication; this is a demo
  with synthetic identities and must not collect real personal data.
- No deployment, no domain, no CI beyond the repository workflow, no monitoring.

## Recovery (PR creation)

```bash
gh pr create --draft --base stack/05-followup --head stack/06-delivery \
  --title "06 · Demo & Toss Readiness" --body-file docs/pr/06-delivery.md
```
