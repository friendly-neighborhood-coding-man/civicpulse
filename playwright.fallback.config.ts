import { defineConfig, devices } from "@playwright/test";

/**
 * Desktop suite for the "live mode configured, no key" deployment.
 *
 * This is the configuration that must never silently substitute simulation for
 * a real model. The server is started with `CIVICPULSE_AI_MODE=openai` and an
 * explicitly empty `OPENAI_API_KEY`, and a zero live budget as a second guard,
 * so no paid request is possible from this suite.
 *
 * Synthetic demo identities and data only; separate port and data directory.
 */
const PORT = Number.parseInt(process.env.E2E_FALLBACK_PORT ?? "3300", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_DIR = ".local/e2e-fallback";

export default defineConfig({
  testDir: "./e2e-fallback",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node -e "require('node:fs').rmSync('${DATA_DIR}',{recursive:true,force:true})" && npm run build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      CIVICPULSE_DATA_DIR: DATA_DIR,
      CIVICPULSE_AI_MODE: "openai",
      // Explicitly empty: an inherited key must not turn this into a paid run.
      OPENAI_API_KEY: "",
      // Belt and braces: even if a key were present, no live call is allowed.
      CIVICPULSE_AI_DAILY_LIMIT: "0",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
