import type { Db } from "../db/connection.ts";
import { all, one, run } from "../db/query.ts";
import type { UserRecord, UserRole } from "../db/seed.ts";
import { hashPassword } from "../auth/password.ts";
import { internalId } from "../ids.ts";

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

/**
 * Resolve a live account. Deleted accounts keep their row as a foreign-key
 * anchor but never resolve, so an old signed cookie stops working immediately.
 */
export function getUserById(db: Db, id: string): UserRecord | undefined {
  return one<UserRecord>(
    db,
    "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
}

export function listUsers(db: Db): PublicUser[] {
  return all<UserRecord>(
    db,
    `SELECT * FROM users
      WHERE deleted_at IS NULL
      ORDER BY role DESC, display_name ASC`,
  ).map(toPublicUser);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Password-provider lookup. Demo accounts (NULL email) never match. */
export function findUserByEmail(db: Db, email: string): UserRecord | undefined {
  return one<UserRecord>(
    db,
    `SELECT * FROM users
      WHERE email = ? AND deleted_at IS NULL`,
    [normalizeEmail(email)],
  );
}

export type CreatePasswordUserInput = {
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
  handle?: string;
};

/**
 * Provision a password account. There is no public registration endpoint: an
 * operator runs `npm run user:create`, which keeps account creation an explicit
 * administrative action in a small deployment.
 */
export function createPasswordUser(
  db: Db,
  input: CreatePasswordUserInput,
  now: Date = new Date(),
): PublicUser {
  const email = normalizeEmail(input.email);
  if (!email.includes("@") || email.length > 254) {
    throw new Error("A valid email address is required.");
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 40) {
    throw new Error("Display name must be 2-40 characters.");
  }
  if (findUserByEmail(db, email)) {
    throw new Error("An account with that email already exists.");
  }

  const id = internalId("usr");
  const handleBase =
    input.handle?.trim() ||
    email.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 24) ||
    "user";
  let handle = handleBase;
  let suffix = 1;
  while (one(db, "SELECT id FROM users WHERE handle = ?", [handle])) {
    handle = `${handleBase}${suffix}`;
    suffix += 1;
  }

  run(
    db,
    `INSERT INTO users
       (id, handle, display_name, role, created_at, email, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      handle,
      displayName,
      input.role ?? "citizen",
      now.toISOString(),
      email,
      hashPassword(input.password),
    ],
  );

  const created = one<UserRecord>(db, "SELECT * FROM users WHERE id = ?", [id]);
  if (!created) throw new Error("User insert did not return a row.");
  return toPublicUser(created);
}

/**
 * Delete the personal fields of an account while keeping the row so historical
 * foreign keys (status events, moderation records) stay valid.
 *
 * The caller is responsible for deleting or withdrawing the account's content
 * first; this function only anonymises identity.
 */
export function anonymizeUser(
  db: Db,
  userId: string,
  now: Date = new Date(),
): void {
  const suffix = userId.slice(-6).replace(/[^a-zA-Z0-9]/g, "") || "deleted";
  run(
    db,
    `UPDATE users
        SET handle = ?,
            display_name = ?,
            email = NULL,
            password_hash = NULL,
            deleted_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [`deleted-${suffix}`, "탈퇴한 사용자", now.toISOString(), userId],
  );
}
