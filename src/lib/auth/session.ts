import { cookies } from "next/headers";

import { isSessionAllowedForMode } from "./mode.ts";
import { getSessionSecret, isProduction } from "../config.ts";
import type { Db } from "../db/connection.ts";
import { getDb } from "../db/connection.ts";
import { getUserById, type PublicUser, toPublicUser } from "../domain/users.ts";
import { forbidden, unauthenticated } from "../http/errors.ts";
import { signSession, verifySession } from "./token.ts";

export const SESSION_COOKIE = "cp_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Resolve the acting demo user from the signed cookie.
 *
 * The signature proves the server issued the identity; the database lookup
 * proves the user still exists. Invalid, tampered or expired cookies simply
 * resolve to "signed out" (no error surfaced to the browser).
 */
export async function getSessionUser(db: Db = getDb()): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const verified = verifySession(token, getSessionSecret());
  if (!verified.ok) return null;
  const user = getUserById(db, verified.payload.sub);
  if (!user || !isSessionAllowedForMode(user)) return null;
  return toPublicUser(user);
}

export async function setSessionUser(userId: string): Promise<void> {
  const store = await cookies();
  const token = signSession(userId, getSessionSecret());
  store.set(SESSION_COOKIE, token, cookieOptions());
}

export async function clearSessionUser(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

/** Throws a 401 ApiError when nobody is signed in. */
export async function requireUser(db: Db = getDb()): Promise<PublicUser> {
  const user = await getSessionUser(db);
  if (!user) throw unauthenticated();
  return user;
}

/** Throws a 403 ApiError unless the actor holds one of the given roles. */
export function requireRole(
  user: PublicUser,
  roles: ReadonlyArray<PublicUser["role"]>,
): void {
  if (!roles.includes(user.role)) {
    throw forbidden("이 작업에는 운영자 권한이 필요합니다.");
  }
}
