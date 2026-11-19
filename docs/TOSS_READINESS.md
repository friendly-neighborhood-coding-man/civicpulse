# Toss readiness (Apps in Toss)

Status: **NOT_RUN**. No Toss SDK is installed, no Toss API is called, and no `.ait`
bundle has been built or uploaded. This document records what was verified from the
official developer center on 2026-11-19 and what remains before an integration.

## What is verified from official documentation

All links below are the official Apps in Toss developer center
(`developers-apps-in-toss.toss.im`). Statements are summaries of those pages, not of
anything this repository has executed.

| Topic | Official source | What it says |
|---|---|---|
| Developer center / SDK overview | <https://developers-apps-in-toss.toss.im/documentation> | Client SDK + server API split; features include user identification key, Toss login, Toss auth, in-app payment, share links. WebView projects should use SDK 3.x. |
| Getting started | <https://developers-apps-in-toss.toss.im/documentation/integration/getting-started> | SDK configures the in-app runtime; server APIs handle login/payment/push. **`iframe` cannot be used** and is rejected in review (YouTube embeds excepted). Avoid excessive bridge calls. |
| Share link | <https://developers-apps-in-toss.toss.im/documentation/common/growth/share/miniapp-share-link> | `getTossShareLink` converts an `intoss://<app>` deep link into a shareable link; OG image must be an absolute `https://` URL and is cached by external platforms. |
| Testing / deployment | <https://developers-apps-in-toss.toss.im/guide/operation/toss> | Upload an `.ait` bundle in the console; CI can use `npx ait deploy` with a console API key; `intoss://` works only after release, so pre-release tests use the generated test scheme/QR. |
| FAQ (app registration, design) | <https://developers-apps-in-toss.toss.im/guide/faq> | Registration order: console signup → workspace → business registration → app registration → review. TDS is recommended rather than mandatory; **dark mode is not supported** in mini apps today. |

## Current architecture vs. a mini app

| Area | Today | Required for Apps in Toss | Status |
|---|---|---|---|
| Client | Next.js App Router (React 19), server-rendered pages | A WebView-compatible client; iframe embedding is prohibited | NOT_RUN |
| Server | Node runtime with `node:sqlite` and `sharp` (native) | A real server or a runtime that supports these dependencies; no static-only bundle | NOT_RUN |
| Identity | HMAC-signed demo cookie over seeded synthetic users, labelled 모의 로그인 | Toss login / user identification key, with server-side token verification | NOT_RUN |
| Share | None (clipboard only in the follow-up panel) | `getTossShareLink` with `intoss://` deep link and an `https://` OG image | NOT_RUN |
| Deep link | None | `intoss://<appName>/...` routes; test scheme before release | NOT_RUN |
| Design | Custom Tailwind UI, light theme only | TDS recommended; light mode only | LIMITED (light-only matches; TDS not adopted) |
| Bundle | Next.js build output | `.ait` app bundle uploaded via console or `npx ait deploy` | NOT_RUN |
| Policy | Demo labels and safety copy in-app | Service open policy review, business registration, app review | NOT_RUN |

## Integration boundary in code

`src/lib/platform/bridge.ts` defines only the capabilities CivicPulse itself needs
(share, external open, clipboard, platform identity) and reports the honest status.

- `describePlatform()` returns the web runtime and limitations; the UI must not imply
  a Toss integration.
- `TOSS_ADAPTER_STATUS` records that no adapter exists, with a link to the official
  documentation.
- `shareText()` uses `navigator.share` → clipboard → explicit failure. There is no
  guessed Toss function name anywhere in the codebase.

When a real integration is attempted, add an adapter that implements the same
interface using the SDK **as documented**, and keep the web fallback for browsers.
Do not vendor a guessed SDK name, and do not bypass iframe restrictions.

## Pre-integration checklist

- [ ] Decide hosting for the Node server (sharp + `node:sqlite` cannot run in a static
      WebView bundle).
- [ ] Replace the demo session with Toss login or the user identification key, including
      server-side verification. Never trust a client-provided user id.
- [ ] Add real account deletion, retention and export policies before collecting any
      personal data.
- [ ] Add `https://` OG image and share link flow; test the deep link in the test scheme.
- [ ] Build and upload an `.ait` bundle in a sandbox workspace, not production.
- [ ] Review the service open policy and app review requirements with a human.
- [ ] Re-verify every URL above at integration time; policy and SDK versions change.

## Cost notes (unverified)

The application makes no paid API calls and has no external integration today, so the
measured operating cost of this repository is **KRW 0** beyond the machine it runs on.
A production deployment (managed Postgres/SQLite storage, image processing CPU, object
storage) has **not** been measured. The target of under KRW 50,000/month remains an
assumption to validate with real usage data, not a result.
