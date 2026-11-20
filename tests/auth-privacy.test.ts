import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { DEMO_USERS } from "@/lib/db/seed";
import { buildSessionView } from "@/lib/domain/session-view";
import {
  createPasswordUser,
  getUserById,
  toPublicUser,
} from "@/lib/domain/users";

const dirs: string[] = [];
const originalMode = process.env.CIVICPULSE_AUTH_MODE;

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-session-"));
  dirs.push(dir);
  process.env.CIVICPULSE_DATA_DIR = dir;
  return openDatabase(path.join(dir, "test.sqlite"));
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  if (originalMode === undefined) delete process.env.CIVICPULSE_AUTH_MODE;
  else process.env.CIVICPULSE_AUTH_MODE = originalMode;
});

describe("session view", () => {
  it("returns no account directory at all in password mode", () => {
    const db = tempDb();
    const citizen = createPasswordUser(db, {
      email: "citizen@example.org",
      password: "a-long-demo-password",
      displayName: "테스트 시민",
    });
    const other = createPasswordUser(db, {
      email: "other@example.org",
      password: "a-long-demo-password",
      displayName: "다른 사용자",
      role: "moderator",
    });

    const view = buildSessionView(db, null, "password");
    expect(view).toEqual({ user: null, users: [], demo: false });

    const serialized = JSON.stringify(view);
    for (const marker of [
      citizen.id,
      other.id,
      "테스트 시민",
      "다른 사용자",
      "citizen@example.org",
      "other@example.org",
      "moderator",
      ...DEMO_USERS.map((user) => user.id),
    ]) {
      expect(serialized).not.toContain(marker);
    }
    db.close();
  });

  it("returns only the acting account's own projection when signed in", () => {
    const db = tempDb();
    const citizen = createPasswordUser(db, {
      email: "citizen@example.org",
      password: "a-long-demo-password",
      displayName: "테스트 시민",
    });
    const other = createPasswordUser(db, {
      email: "other@example.org",
      password: "a-long-demo-password",
      displayName: "다른 사용자",
      role: "moderator",
    });

    const actor = toPublicUser(getUserById(db, citizen.id)!);
    const view = buildSessionView(db, actor, "password");
    expect(view.user).toEqual(actor);
    expect(view.users).toEqual([]);
    expect(view.demo).toBe(false);

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(other.id);
    expect(serialized).not.toContain(other.displayName);
    expect(serialized).not.toContain(other.handle);
    // Only the acting user's own role is disclosed.
    expect(serialized).not.toContain("moderator");
    db.close();
  });

  it("exposes only the fixed synthetic identities in demo mode", () => {
    const db = tempDb();
    const other = createPasswordUser(db, {
      email: "other@example.org",
      password: "a-long-demo-password",
      displayName: "다른 사용자",
    });

    const view = buildSessionView(db, null, "demo");
    expect(view.demo).toBe(true);
    expect(view.users.map((user) => user.id)).toEqual(
      DEMO_USERS.map((user) => user.id),
    );

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(other.id);
    expect(serialized).not.toContain("other@example.org");
    expect(serialized).not.toContain("다른 사용자");
    db.close();
  });

  it("reads the configured mode by default and keeps password mode closed", () => {
    const db = tempDb();
    process.env.CIVICPULSE_AUTH_MODE = "password";
    expect(buildSessionView(db, null)).toEqual({
      user: null,
      users: [],
      demo: false,
    });
    db.close();
  });
});
