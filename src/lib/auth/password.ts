import crypto from "node:crypto";

/**
 * Password hashing for the optional password identity provider.
 *
 * scrypt with per-password random salt, no third-party dependency. The stored
 * format is self-describing so parameters can be raised later without breaking
 * existing accounts:
 *
 *   scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>
 *
 * Verification is constant-time in the hash comparison and returns `false` for
 * any malformed record instead of throwing, so a corrupted row cannot turn a
 * login attempt into a 500 or reveal which part failed.
 */

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; message: string };

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: "비밀번호가 너무 깁니다." };
  }
  if (!password.trim()) {
    return { ok: false, message: "비밀번호에 공백만 사용할 수 없습니다." };
  }
  return { ok: true };
}

function derive(password: string, salt: Buffer, keylen: number): Buffer {
  return crypto.scryptSync(password, salt, keylen, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEMORY,
  });
}

export function hashPassword(password: string): string {
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) throw new Error(policy.message);

  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = derive(password, salt, KEY_LENGTH);
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("hex"),
    hash.toString("hex"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored || !password) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number.parseInt(parts[1]!, 10);
  const r = Number.parseInt(parts[2]!, 10);
  const p = Number.parseInt(parts[3]!, 10);
  const saltHex = parts[4]!;
  const hashHex = parts[5]!;
  // Reject parameters that are absent or absurd rather than letting an
  // attacker-controlled row force a huge scrypt allocation.
  if (
    !Number.isFinite(n) ||
    !Number.isFinite(r) ||
    !Number.isFinite(p) ||
    n < 1024 ||
    n > 1_048_576 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 4 ||
    saltHex.length < 16 ||
    saltHex.length > 128 ||
    hashHex.length < 32 ||
    hashHex.length > 256
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

/** Generate a strong temporary password for operator provisioning. */
export function generatePassword(): string {
  // base64url of 18 random bytes -> 24 chars, comfortably above the minimum.
  return crypto.randomBytes(18).toString("base64url");
}
