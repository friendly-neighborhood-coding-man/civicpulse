import { getDb, getSchemaVersion } from "../src/lib/db/connection.ts";
import { all } from "../src/lib/db/query.ts";
import { DEMO_USERS } from "../src/lib/db/seed.ts";

const db = getDb();
const schemaVersion = getSchemaVersion(db);
const userCount = all<{ count: number }>(db, "SELECT COUNT(*) AS count FROM users")[0]
  ?.count;
const reportCount = all<{ count: number }>(
  db,
  "SELECT COUNT(*) AS count FROM reports",
)[0]?.count;

console.log(
  JSON.stringify(
    {
      schemaVersion,
      demoUsers: DEMO_USERS.length,
      usersInDb: userCount,
      reportsInDb: reportCount,
      note: "Demo identities only. No real data or reports are created.",
    },
    null,
    2,
  ),
);
