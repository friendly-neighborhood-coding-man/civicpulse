import { getAuthMode, type AuthMode } from "../auth/mode.ts";
import type { Db } from "../db/connection.ts";
import { listDemoUsers, type PublicUser } from "./users.ts";

/**
 * The only identity data `GET /api/session` may return.
 *
 * In `password` mode there is deliberately no account directory: an
 * unauthenticated caller learns `user: null` and nothing else. Returned `user`
 * is the acting account's own safe projection, never somebody else's.
 *
 * In `demo` mode the switcher needs the predefined synthetic identities, so the
 * server returns exactly those (and only rows that still exist). Password
 * accounts are never included, even if a deployment is switched back to demo.
 */
export type SessionView = {
  user: PublicUser | null;
  users: PublicUser[];
  demo: boolean;
};

export function buildSessionView(
  db: Db,
  user: PublicUser | null,
  mode: AuthMode = getAuthMode(),
): SessionView {
  const demo = mode === "demo";
  return {
    user,
    users: demo ? listDemoUsers(db) : [],
    demo,
  };
}
