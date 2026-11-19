import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { all, run, transaction } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";

const now = new Date().toISOString();

function insertReport(db: ReturnType<typeof openDatabase>, id: string, publicId: string) {
  run(
    db,
    `INSERT INTO reports (id, public_id, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, publicId, DEMO_USERS[0].id, now, now],
  );
}

describe("transactions", () => {
  it("commits all writes on success", () => {
    const db = openDatabase(":memory:");
    transaction(db, () => {
      insertReport(db, "rep_a", "cp_aaaaaaaaaa");
      insertReport(db, "rep_b", "cp_bbbbbbbbbb");
    });
    const count = all<{ count: number }>(db, "SELECT COUNT(*) AS count FROM reports");
    expect(count[0]?.count).toBe(2);
    db.close();
  });

  it("rolls back every write when one statement fails", () => {
    const db = openDatabase(":memory:");
    expect(() =>
      transaction(db, () => {
        insertReport(db, "rep_c", "cp_cccccccccc");
        insertReport(db, "rep_d", "cp_cccccccccc"); // duplicate public_id
      }),
    ).toThrow(/UNIQUE/i);

    const rows = all<{ id: string }>(db, "SELECT id FROM reports");
    expect(rows).toEqual([]);
    db.close();
  });
});
