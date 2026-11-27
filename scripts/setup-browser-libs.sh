#!/usr/bin/env bash
# Fetch the Chromium shared libraries and fonts that the sandbox image lacks.
#
# Works without root: downloads .deb packages with a private apt state dir and
# extracts them into ~/.cache/civicpulse-browser-libs (outside the repo, so the
# bundler never scans them). Safe to re-run.
set -euo pipefail

DEST="${CIVICPULSE_BROWSER_LIBS:-$HOME/.cache/civicpulse-browser-libs}"
WORK="${TMPDIR:-/tmp}/civicpulse-apt"

mkdir -p "$DEST" "$WORK/lists" "$WORK/archives" "$WORK/debs"

APT=(apt-get
  -o "Dir::State::lists=$WORK/lists"
  -o "Dir::Cache::archives=$WORK/archives"
  -o "Dir::Etc::sourceparts=-"
  -o "Dir::Etc::sourcelist=/etc/apt/sources.list.d/ubuntu.sources"
  -o "APT::Get::List-Cleanup=0")

"${APT[@]}" update

PACKAGES=(
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libasound2t64
  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libnspr4 libnss3
  libxkbcommon0 libcups2t64 libgbm1 libpango-1.0-0 libcairo2 libdrm2
  libxrender1 libxi6 libsm6 libice6 libxext6 libx11-xcb1 libxcb1
  libfontconfig1 libfreetype6 libexpat1 libxcb-dri3-0 libxcb-glx0
  libxcb-shm0 libxcb-sync1 libxcb-xfixes0
  # GTK/glib stack and pango dependencies. Some sandbox images no longer ship
  # libglib-2.0, which makes Chromium exit 127 before a page can open.
  libglib2.0-0t64 libpcre2-8-0 libffi8 libmount1 libselinux1 libblkid1
  libzstd1 liblzma5 libbz2-1.0 libgraphite2-3 libharfbuzz0b libthai0
  libdatrie1 libpangoft2-1.0-0 libpangocairo-1.0-0
  # Direct Chromium dependencies that a minimal image can also lack.
  libx11-6 libxau6 libxdmcp6 libdbus-1-3
)

(cd "$WORK/debs" && "${APT[@]}" download "${PACKAGES[@]}")
for deb in "$WORK"/debs/*.deb; do dpkg-deb -x "$deb" "$DEST"; done

# Fonts: Chromium aborts without a fontconfig directory.
FONT_POOL="http://archive.ubuntu.com/ubuntu"
curl -fsSL "$FONT_POOL/pool/main/f/fonts-dejavu/fonts-dejavu-core_2.37-8_all.deb" \
  -o "$WORK/fonts-dejavu-core.deb"
curl -fsSL "$FONT_POOL/pool/universe/f/fonts-nanum/fonts-nanum_20200506-1_all.deb" \
  -o "$WORK/fonts-nanum.deb"
for deb in "$WORK"/fonts-*.deb; do dpkg-deb -x "$deb" "$DEST"; done

echo "Browser libraries and fonts extracted to $DEST"
echo "Next: npm run e2e:install && npm run e2e"
