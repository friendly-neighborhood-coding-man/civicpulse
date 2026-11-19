import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  enforceRateLimit,
  resetRateLimits,
} from "@/lib/security/rate-limit";

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("allows exactly the configured number of actions per window", () => {
    const now = 1_700_000_000_000;
    const options = { limit: 2, windowMs: 60_000, now };
    expect(consumeRateLimit("user:a", options)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(consumeRateLimit("user:a", options)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    const blocked = consumeRateLimit("user:a", options);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
  });

  it("is scoped per key and resets after the window", () => {
    const now = 1_700_000_000_000;
    const options = { limit: 1, windowMs: 1_000, now };
    expect(consumeRateLimit("user:a", options).allowed).toBe(true);
    expect(consumeRateLimit("user:b", options).allowed).toBe(true);
    expect(consumeRateLimit("user:a", options).allowed).toBe(false);
    expect(
      consumeRateLimit("user:a", { ...options, now: now + 1_001 }).allowed,
    ).toBe(true);
  });

  it("throws a 429 ApiError when enforced", () => {
    const now = 1_700_000_000_000;
    const options = { limit: 1, windowMs: 1_000, now };
    enforceRateLimit("support:rep_1", options);
    expect(() => enforceRateLimit("support:rep_1", options)).toThrowError(
      expect.objectContaining({ status: 429, code: "RATE_LIMITED" }),
    );
  });
});
