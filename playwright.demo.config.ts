import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshot/demo configuration.
 *
 * Runs only `e2e-demo/`, on a phone-sized viewport, against a fresh synthetic
 * data directory. It writes PNGs under `docs/screenshots/` using the three
 * shipped sample photos and demo identities — never real citizen data.
 */
const PORT = Number.parseInt(process.env.E2E_DEMO_PORT ?? "3400", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_DIR = ".local/e2e-demo";

export default defineConfig({
  testDir: "./e2e-demo",
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
      CIVICPULSE_AI_MODE: "mock",
      CIVICPULSE_FOLLOWUP_WAITING_DAYS: "0",
      CIVICPULSE_SESSION_SWITCH_LIMIT: "200",
    },
  },
  // Pixel 5 is a Chromium phone descriptor; iPhone descriptors default to
  // WebKit, which this repository's browser setup does not install.
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 5"] } }],
});
