#!/usr/bin/env bash
# Run Playwright browser tests.
#
# The sandbox image lacks a few shared libraries Chromium needs (libnspr4,
# libnss3, libatk*, libxkbcommon, libXrender...) and has no fontconfig
# configuration, which makes Chromium abort with "SkFontMgr_FontConfigInterface
# Not implemented". `scripts/setup-browser-libs.sh` extracts both the libraries
# and a couple of fonts (DejaVu + NanumGothic) into ~/.cache without root.
#
# Those files deliberately live OUTSIDE the repository: Turbopack scans the
# project directory, and extracted Debian docs contain symlinks that break it.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${CIVICPULSE_BROWSER_LIBS:-$HOME/.cache/civicpulse-browser-libs}"
LIBS="$DEST/usr/lib/x86_64-linux-gnu"
FONTS="$DEST/usr/share/fonts"

if [ ! -f "$FONTS/truetype/dejavu/DejaVuSans.ttf" ]; then
  echo "Browser libraries/fonts are missing. Run: npm run e2e:libs" >&2
  exit 1
fi

export LD_LIBRARY_PATH="$LIBS:$LIBS/nss:${LD_LIBRARY_PATH:-}"

CONF="${TMPDIR:-/tmp}/civicpulse-fonts.conf"
cat > "$CONF" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$FONTS</dir>
  <cachedir>${TMPDIR:-/tmp}/civicpulse-fontconfig-cache</cachedir>
  <alias>
    <family>sans-serif</family>
    <prefer><family>DejaVu Sans</family><family>NanumGothic</family></prefer>
  </alias>
  <alias><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
</fontconfig>
EOF
export FONTCONFIG_FILE="$CONF"

exec npx playwright test "$@"
