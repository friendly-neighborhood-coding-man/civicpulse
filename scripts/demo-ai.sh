#!/usr/bin/env bash
# Reproducible synthetic demo for the AI reporting assistant.
#
# Starts a production build against a fresh data directory in simulation mode.
# No model is called, nothing is sent anywhere, and no real complaint exists.
# Override the port with CIVICPULSE_DEMO_PORT (default 3500).
set -euo pipefail
cd "$(dirname "$0")/.."

DATA_DIR="${CIVICPULSE_DEMO_DATA_DIR:-.local/demo-ai}"
PORT="${CIVICPULSE_DEMO_PORT:-3500}"

node -e "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true })" "$DATA_DIR"
npm run build

cat <<TXT

Synthetic AI demo: http://127.0.0.1:$PORT

  1. Choose 김민지 in the header.
  2. Open 새 제보 → 보도 파손 sample → 서울 마포구 → "여기 길이 깨져서 위험해요".
  3. Press "AI로 제보 정리하기".
  4. Read the badge "시뮬레이션 · 모델 미호출" and the observations.
  5. Apply the draft, edit one sentence, save.

The demo is in simulation mode (CIVICPULSE_AI_MODE=mock). The observations are
pre-written for the shipped sample; nothing is inferred at runtime.

TXT

exec env \
  CIVICPULSE_DATA_DIR="$DATA_DIR" \
  CIVICPULSE_AI_MODE=mock \
  CIVICPULSE_FOLLOWUP_WAITING_DAYS=0 \
  npx next start --hostname 127.0.0.1 --port "$PORT"
