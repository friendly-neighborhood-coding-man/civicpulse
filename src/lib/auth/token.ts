import crypto from "node:crypto";

export type SessionPayload = {
  /** User id (seeded demo identity). */
  sub: string;
  /** Expiry, epoch seconds. */
  exp: number;
};

const VERSION = "v1";

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function sign(secret: string, body: string): string {
  return base64url(crypto.createHmac("sha256", secret).update(body).digest());
}

/**
 * Compact signed token: `v1.<base64url(json)>.<hmac>`.
 *
 * This is *not* a general-purpose JWT and deliberately does not verify device
 * metadata; it only proves the server issued the payload with its own secret.
 */
export function signSession(
  userId: string,
  secret: string,
  opts: { ttlSeconds?: number; now?: Date } = {},
): string {
  const ttl = opts.ttlSeconds ?? 60 * 60 * 24 * 30;
  const now = opts.now ?? new Date();
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(now.getTime() / 1000) + ttl,
  };
  const body = `${VERSION}.${base64url(Buffer.from(JSON.stringify(payload), "utf8"))}`;
  return `${body}.${sign(secret, body)}`;
}

export type VerifyResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "invalid_payload" };

export function verifySession(
  token: string,
  secret: string,
  now: Date = new Date(),
): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    return { ok: false, reason: "malformed" };
  }
  const body = `${parts[0]}.${parts[1]}`;
  const provided = Buffer.from(parts[2]!, "utf8");
  const expected = Buffer.from(sign(secret, body), "utf8");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as SessionPayload).sub !== "string" ||
    (payload as SessionPayload).sub.length === 0 ||
    typeof (payload as SessionPayload).exp !== "number" ||
    !Number.isFinite((payload as SessionPayload).exp)
  ) {
    return { ok: false, reason: "invalid_payload" };
  }

  if ((payload as SessionPayload).exp * 1000 <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload: payload as SessionPayload };
}
