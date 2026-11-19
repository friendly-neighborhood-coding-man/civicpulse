import type { Db } from "../db/connection.ts";
import { all, one } from "../db/query.ts";
import type { UserRecord, UserRole } from "../db/seed.ts";

/** Everything the UI is allowed to know about a user. */
export type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  role: UserRole;
};

export function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    role: row.role,
  };
}

export function getUserById(db: Db, id: string): UserRecord | undefined {
  return one<UserRecord>(db, "SELECT * FROM users WHERE id = ?", [id]);
}

export function listUsers(db: Db): PublicUser[] {
  return all<UserRecord>(
    db,
    "SELECT * FROM users ORDER BY role DESC, display_name ASC",
  ).map(toPublicUser);
}
