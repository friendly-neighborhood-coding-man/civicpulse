import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getDbPath } from "../config.ts";
import { migrations } from "./migrations.ts";
import { ensureDemoUsers } from "./seed.ts";

export type Db = DatabaseSync;

/**
 * One connection per process. Next.js may evaluate this module more than once
 * (dev HMR, multiple server entrypoints), so the handle is cached on globalThis.
 */
const globalForDb = globalThis as typeof globalThis & {
  __civicpulseDb?: DatabaseSync;
};

export function getDb(): Db {
  const existing = globalForDb.__civicpulseDb;
  if (existing) return existing;
  const db = openDatabase(getDbPath());
  globalForDb.__civicpulseDb = db;
  return db;
}

export function openDatabase(dbPath: string): Db {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (dbPath !== ":memory:") {
    // WAL keeps read/write concurrency sane for a single-node demo server.
    db.exec("PRAGMA journal_mode = WAL");
  }
  migrate(db);
  ensureDemoUsers(db);
  return db;
}

export function getSchemaVersion(db: Db): number {
  const row = db.prepare("PRAGMA user_version").get() as
    | { user_version?: number }
    | undefined;
  return row?.user_version ?? 0;
}

export function migrate(db: Db): void {
  const current = getSchemaVersion(db);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      // user_version cannot be parameterised; the value is a trusted integer.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
}

/** Reset the cached handle. Test-only helper. */
export function closeDatabaseForTests(): void {
  const db = globalForDb.__civicpulseDb;
  if (db) {
    db.close();
    globalForDb.__civicpulseDb = undefined;
  }
}
