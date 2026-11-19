import fs from "node:fs";
import path from "node:path";

import { getDataDir, getDbPath, getPrivateMediaDir, getPublicMediaDir, isProduction } from "../src/lib/config.ts";

if (isProduction()) {
  console.error("Refusing to reset data with NODE_ENV=production.");
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  console.error(
    "This deletes the local SQLite database and demo media under the data directory.\n" +
      "Re-run with --yes to confirm: npm run db:reset -- --yes",
  );
  process.exit(1);
}

const targets = [getDbPath(), `${getDbPath()}-wal`, `${getDbPath()}-shm`];
for (const file of targets) {
  if (file === ":memory:") continue;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`removed ${path.relative(process.cwd(), file)}`);
  }
}

for (const dir of [getPrivateMediaDir(), getPublicMediaDir()]) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${path.relative(process.cwd(), dir)}/`);
  }
}

console.log(`Data directory kept: ${path.relative(process.cwd(), getDataDir())}/`);
