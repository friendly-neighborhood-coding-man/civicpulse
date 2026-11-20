import type { DatabaseSync } from "node:sqlite";

import { run } from "./query.ts";

export type UserRole = "citizen" | "moderator";

export type UserRecord = {
  id: string;
  handle: string;
  display_name: string;
  role: UserRole;
  created_at: string;
  /** Password provider only; demo accounts keep these NULL. */
  email?: string | null;
  password_hash?: string | null;
  /** Set on account deletion; the row stays as an anonymised foreign-key anchor. */
  deleted_at?: string | null;
};

/**
 * Demo identities. There are no passwords: this is a synthetic demo session
 * model, explicitly labelled as such in the UI and docs. It exists so that
 * authorization boundaries (owner vs. other user vs. moderator) can be
 * exercised and tested without collecting real accounts.
 */
export const DEMO_USERS = [
  { id: "demo-minji", handle: "minji", displayName: "김민지", role: "citizen" },
  { id: "demo-jun", handle: "jun", displayName: "박준", role: "citizen" },
  { id: "demo-hana", handle: "hana", displayName: "이하나", role: "citizen" },
  { id: "demo-ops", handle: "ops", displayName: "데모 운영자", role: "moderator" },
] as const satisfies ReadonlyArray<{
  id: string;
  handle: string;
  displayName: string;
  role: UserRole;
}>;

export function ensureDemoUsers(db: DatabaseSync, now = new Date()): void {
  const createdAt = now.toISOString();
  for (const user of DEMO_USERS) {
    run(
      db,
      `INSERT INTO users (id, handle, display_name, role, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [user.id, user.handle, user.displayName, user.role, createdAt],
    );
  }
}
