import { defineConfig, devices } from "@playwright/test";

const PORT = Number.parseInt(process.env.E2E_PORT ?? "3100", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Fresh synthetic data per run: removes the e2e-only data dir first.
    command: `node -e "require('node:fs').rmSync('.local/e2e',{recursive:true,force:true})" && npx next dev --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      CIVICPULSE_DATA_DIR: ".local/e2e",
      CIVICPULSE_AI_MODE: "mock",
      CIVICPULSE_FOLLOWUP_WAITING_DAYS: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
