#!/usr/bin/env bash
# Password-provider browser suite. Reuses the shared Chromium/font setup in
# e2e.sh, but selects playwright.password.config.ts for its own server and data.
set -euo pipefail
cd "$(dirname "$0")/.."

export PLAYWRIGHT_CONFIG="playwright.password.config.ts"
exec bash scripts/e2e.sh "$@"
