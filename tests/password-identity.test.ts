import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getAuthMode, isSessionAllowedForMode } from "@/lib/auth/mode";
import {
  checkPasswordPolicy,
  generatePassword,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import { openDatabase } from "@/lib/db/connection";
import { authenticateWithPassword } from "@/lib/domain/auth";
import {
  anonymizeUser,
  createPasswordUser,
  findUserByEmail,
  getUserById,
} from "@/lib/domain/users";

const dirs: string[] = [];
const originalMode = process.env.CIVICPULSE_AUTH_MODE;

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-identity-"));
  dirs.push(dir);
  process.env.CIVICPULSE_DATA_DIR = dir;
  return openDatabase(path.join(dir, "test.sqlite"));
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  if (originalMode === undefined) delete process.env.CIVICPULSE_AUTH_MODE;
  else process.env.CIVICPULSE_AUTH_MODE = originalMode;
});

describe("password hashing", () => {
  it("round-trips a password and rejects the wrong one", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(verifyPassword("wrong password", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
  });

  it("salts each hash so equal passwords do not collide", () => {
    const a = hashPassword("same-password-123");
    const b = hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password-123", a)).toBe(true);
    expect(verifyPassword("same-password-123", b)).toBe(true);
  });

  it("returns false for malformed or absurd stored records instead of throwing", () => {
    for (const stored of [
      "plaintext",
      "scrypt$notanumber$8$1$aa$bb",
      "scrypt$16384$8$1$zz$zz",
      "scrypt$999999999$8$1$0011223344556677$aabbccdd",
      "scrypt$16384$8$1$00$",
    ]) {
      expect(verifyPassword("whatever-password", stored)).toBe(false);
    }
  });

  it("enforces the minimum password policy", () => {
    expect(checkPasswordPolicy("short").ok).toBe(false);
    expect(checkPasswordPolicy("           ").ok).toBe(false);
    expect(checkPasswordPolicy("long-enough-password").ok).toBe(true);
    expect(() => hashPassword("short")).toThrow();
    expect(generatePassword().length).toBeGreaterThanOrEqual(20);
  });
});

describe("password accounts", () => {
  it("provisions an account, finds it by normalised email and excludes it after deletion", () => {
    const db = tempDb();
    const user = createPasswordUser(db, {
      email: "  Citizen@Example.ORG ",
      password: "a-long-demo-password",
      displayName: "김시민",
    });
    expect(user.role).toBe("citizen");

    const row = findUserByEmail(db, "citizen@example.org");
    expect(row?.id).toBe(user.id);
    expect(row?.password_hash).toMatch(/^scrypt\$/);
    expect(getUserById(db, user.id)?.email).toBe("citizen@example.org");

    expect(() =>
      createPasswordUser(db, {
        email: "citizen@example.org",
        password: "another-long-password",
        displayName: "다른 이름",
      }),
    ).toThrow(/already exists/);

    anonymizeUser(db, user.id);
    expect(findUserByEmail(db, "citizen@example.org")).toBeUndefined();
    expect(getUserById(db, user.id)).toBeUndefined();
    // The row remains as a foreign-key anchor, with personal fields cleared.
    const tombstone = db
      .prepare("SELECT handle, display_name, email, password_hash, deleted_at FROM users WHERE id = ?")
      .get(user.id) as {
      handle: string;
      display_name: string;
      email: string | null;
      password_hash: string | null;
      deleted_at: string | null;
    };
    expect(tombstone.display_name).toBe("탈퇴한 사용자");
    expect(tombstone.handle.startsWith("deleted-")).toBe(true);
    expect(tombstone.email).toBeNull();
    expect(tombstone.password_hash).toBeNull();
    expect(tombstone.deleted_at).toBeTruthy();
    db.close();
  });
});

describe("password sign-in", () => {
  it("returns the user only for a live account with the right password", () => {
    const db = tempDb();
    const created = createPasswordUser(db, {
      email: "login@example.org",
      password: "a-long-demo-password",
      displayName: "로그인 사용자",
    });

    expect(
      authenticateWithPassword(db, "LOGIN@example.org", "a-long-demo-password")?.id,
    ).toBe(created.id);
    expect(authenticateWithPassword(db, "login@example.org", "wrong-password")).toBeNull();
    expect(authenticateWithPassword(db, "nobody@example.org", "a-long-demo-password")).toBeNull();

    anonymizeUser(db, created.id);
    expect(
      authenticateWithPassword(db, "login@example.org", "a-long-demo-password"),
    ).toBeNull();
    db.close();
  });
});

describe("auth mode", () => {
  it("defaults to demo, accepts password, and fails loudly on an unknown mode", () => {
    delete process.env.CIVICPULSE_AUTH_MODE;
    expect(getAuthMode()).toBe("demo");

    process.env.CIVICPULSE_AUTH_MODE = "password";
    expect(getAuthMode()).toBe("password");

    process.env.CIVICPULSE_AUTH_MODE = "oidc";
    expect(() => getAuthMode()).toThrow(/Unsupported/);
  });

  it("stops honouring password-less demo sessions in password mode", () => {
    // A stale demo cookie must not survive a switch to real accounts.
    expect(isSessionAllowedForMode({ email: null }, "password")).toBe(false);
    expect(isSessionAllowedForMode({}, "password")).toBe(false);
    expect(isSessionAllowedForMode({ email: "a@example.org" }, "password")).toBe(true);
    expect(isSessionAllowedForMode({ email: null }, "demo")).toBe(true);
  });
});
