import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Tests must never touch the developer database or the repo's `.local/` folder.
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-test-"));
process.env.CIVICPULSE_DATA_DIR = testDir;
process.env.CIVICPULSE_DB_PATH = path.join(testDir, "test.sqlite");
process.env.CIVICPULSE_SESSION_SECRET = "test-only-secret-".padEnd(64, "x");
process.env.CIVICPULSE_AI_MODE = "mock";
