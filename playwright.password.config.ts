import { defineConfig, devices } from "@playwright/test";

/**
 * Password-provider browser suite.
 *
 * The demo suite (`playwright.config.ts`) must keep exercising the standalone
 * password-less demo, so password-specific behaviour gets its own server on its
 * own port and data directory. Accounts and passwords below are synthetic test
 * fixtures created only inside `.local/e2e-password`; they are not secrets and
 * never touch a real deployment.
 */
const PORT = Number.parseInt(process.env.E2E_PASSWORD_PORT ?? "3200", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_DIR = ".local/e2e-password";
const PASSWORD = "e2e-password-123";

export default defineConfig({
  testDir: "./e2e-password",
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
    command: [
      `node -e "require('node:fs').rmSync('${DATA_DIR}',{recursive:true,force:true})"`,
      "npm run build",
      `printf '${PASSWORD}\\n' | node scripts/create-user.ts --email citizen@example.org --name '테스트 시민' --password-stdin`,
      `printf '${PASSWORD}\\n' | node scripts/create-user.ts --email other@example.org --name '다른 사용자' --password-stdin`,
      `npx next start --hostname 127.0.0.1 --port ${PORT}`,
    ].join(" && "),
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      CIVICPULSE_DATA_DIR: DATA_DIR,
      CIVICPULSE_AUTH_MODE: "password",
      CIVICPULSE_AI_MODE: "mock",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
