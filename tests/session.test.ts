import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "@/lib/auth/token";

const SECRET = "unit-test-secret-".padEnd(64, "s");

describe("session token", () => {
  it("round-trips a signed user id", () => {
    const token = signSession("demo-minji", SECRET);
    const result = verifySession(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe("demo-minji");
      expect(result.payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it("rejects a token signed with another secret", () => {
    const token = signSession("demo-minji", SECRET);
    const result = verifySession(token, `${SECRET}-different`);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload", () => {
    const token = signSession("demo-minji", SECRET);
    const [, payload, signature] = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload!, "base64url").toString("utf8"),
    ) as { sub: string; exp: number };
    const forged = Buffer.from(
      JSON.stringify({ ...decoded, sub: "demo-ops" }),
      "utf8",
    ).toString("base64url");
    const result = verifySession(`v1.${forged}.${signature}`, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects expired tokens", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = signSession("demo-minji", SECRET, {
      ttlSeconds: 60,
      now: issued,
    });
    expect(verifySession(token, SECRET, issued).ok).toBe(true);
    const later = new Date(issued.getTime() + 61_000);
    expect(verifySession(token, SECRET, later)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects malformed and unknown-version tokens", () => {
    expect(verifySession("nonsense", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifySession("v2.abc.def", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
