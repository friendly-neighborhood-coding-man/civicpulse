import type { Db } from "../db/connection.ts";
import { verifyPassword, hashPassword } from "../auth/password.ts";
import { findUserByEmail, toPublicUser, type PublicUser } from "./users.ts";

/**
 * Verify an email/password pair.
 *
 * Returns `null` for unknown email, wrong password and deleted accounts alike.
 * A throwaway scrypt hash is checked when the email is unknown so the response
 * time does not reveal whether an account exists.
 */
const DUMMY_HASH = hashPassword("dummy-password-not-usable-for-login");

export function authenticateWithPassword(
  db: Db,
  email: string,
  password: string,
): PublicUser | null {
  const user = findUserByEmail(db, email);
  const valid = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) return null;
  return toPublicUser(user);
}
