import { describe, expect, it } from "vitest";

import {
  getSchemaVersion,
  migrate,
  openDatabase,
} from "@/lib/db/connection";
import { all, run } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import { migrations } from "@/lib/db/migrations";

function freshDb() {
  return openDatabase(":memory:");
}

describe("database bootstrap", () => {
  it("applies all migrations and records the schema version", () => {
    const db = freshDb();
    const expected = Math.max(...migrations.map((m) => m.version));
    expect(getSchemaVersion(db)).toBe(expected);
    db.close();
  });

  it("is idempotent when migrating twice", () => {
    const db = freshDb();
    const before = getSchemaVersion(db);
    migrate(db);
    expect(getSchemaVersion(db)).toBe(before);
    const users = all<{ count: number }>(db, "SELECT COUNT(*) AS count FROM users");
    expect(users[0]?.count).toBe(DEMO_USERS.length);
    db.close();
  });

  it("seeds demo users once with stable ids", () => {
    const db = freshDb();
    const ids = all<{ id: string }>(db, "SELECT id FROM users ORDER BY id").map(
      (row) => row.id,
    );
    expect(ids).toEqual([...DEMO_USERS.map((u) => u.id)].sort());
    expect(new Set(ids).size).toBe(ids.length);
    db.close();
  });

  it("enforces foreign keys for report ownership", () => {
    const db = freshDb();
    expect(() =>
      run(
        db,
        `INSERT INTO reports (id, public_id, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          "rep_1",
          "cp_missingowner",
          "user-that-does-not-exist",
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      ),
    ).toThrow(/FOREIGN KEY/i);
    db.close();
  });

  it("rejects duplicate handles and invalid report states", () => {
    const db = freshDb();
    expect(() =>
      run(
        db,
        `INSERT INTO users (id, handle, display_name, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        ["dup", "minji", "중복", "citizen", new Date().toISOString()],
      ),
    ).toThrow(/UNIQUE/i);

    expect(() =>
      run(
        db,
        `INSERT INTO reports (id, public_id, owner_id, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          "rep_2",
          "cp_badstate",
          DEMO_USERS[0].id,
          "totally-public",
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      ),
    ).toThrow(/CHECK/i);
    db.close();
  });
});
