# Apps in Toss compatibility

Status: **NOT IMPLEMENTED / BLOCKED on platform access.** No Toss SDK is installed, no
app is registered, and no Toss login, payment or review flow is claimed to work.
This document records what the current code already does right, what is missing, and
the exact boundary a future integration must cross.

## Why it is blocked

Apps in Toss requires an app registration in the Toss console, an app key, and (for
login) Toss user authentication. Those credentials and the console access are not
available in this environment, and the product contract forbids representing an
unverified governmental or platform integration as working. Adding an SDK without a
registered app would produce a build that cannot authenticate anyone.

## What is compatible today

| Area | Current state | Notes |
|---|---|---|
| Web UI | Mobile-first React/Next pages, 390px layout reviewed | No fixed-width desktop assumptions |
| Navigation | Same-origin links, no popups, no external redirects for core flow | External official portals open with `rel="noopener noreferrer nofollow"` |
| Data/API | Same-origin JSON + multipart API, cookie session | Works in a WebView that permits first-party cookies |
| Auth | Pluggable `getAuthMode()` (`demo` / `password`) | The seam for a future `toss` provider |
| Payments | Not used at all | No Toss payment integration exists |
| Backend | Node 22+, SQLite, local media | Requires a hosted HTTPS origin reachable from the WebView |

## What a real adapter must add (not done)

1. **Provider value.** Add `toss` to `AuthMode` and implement a session exchange that
   verifies a Toss-issued identity token server-side. Never trust a user id sent by the
   client.
2. **Identity mapping.** Store a stable, non-reversible platform user key (hash it) and
   create a local account on first sign-in. Do not store Toss profile data beyond a
   display name the user expects to see.
3. **App registration.** Obtain the app key and register the exact production origin
   and callback. These are operator steps and cannot be fabricated.
4. **WebView verification.** Test file upload (`<input type=file>`), cookie
   persistence, back-button behaviour and external link handling inside the Toss app.
   None of this has been run.
5. **Review constraints.** Toss review requires a working app, privacy policy and
   clearly-labelled demo data. The existing "데모 · 합성 데이터" badge and the
   no-real-submission disclaimers are compatible with that requirement, but the
   retention policy and operator identity must be real before review.
6. **Deployment.** A single Node origin with a persistent volume (see
   [DEPLOYMENT.md](DEPLOYMENT.md)). Serverless/edge hosting is not supported by the
   current stack.

## Explicit non-claims

- No real Toss login, payment, push or review submission exists.
- No government API or automated complaint submission exists.
- The demo identity switcher is not authentication and is disabled in password mode.
