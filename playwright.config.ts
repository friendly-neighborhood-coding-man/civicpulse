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
    // Fresh synthetic data per run, then a production build/server: dev-only
    // aborted-stream noise made one run flaky, and `next start` matches what a
    // reviewer would run.
    command: `node -e "require('node:fs').rmSync('.local/e2e',{recursive:true,force:true})" && npm run build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      CIVICPULSE_DATA_DIR: ".local/e2e",
      CIVICPULSE_AI_MODE: "mock",
      // 0 so the demo can exercise the follow-up flow immediately; the shipped
      // default is 14 days and the UI always prints the configured value.
      CIVICPULSE_FOLLOWUP_WAITING_DAYS: "0",
      // The suite legitimately switches demo accounts many times in under a
      // minute; this only raises the demo switcher's own anti-abuse cap.
      CIVICPULSE_SESSION_SWITCH_LIMIT: "200",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The AI panel is the part a citizen will use on a phone. Running its spec
    // at a phone viewport catches overflow and unreachable controls without
    // doubling every desktop spec. Pixel 5 is a Chromium descriptor; the iPhone
    // descriptors default to WebKit, which this suite does not install.
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
      testMatch: /(ai-assist)\.spec\.ts/,
    },
  ],
});
