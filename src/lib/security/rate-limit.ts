import { ApiError } from "../http/errors.ts";

type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as typeof globalThis & {
  __civicpulseRateLimits?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForLimiter.__civicpulseRateLimits) {
    globalForLimiter.__civicpulseRateLimits = new Map();
  }
  return globalForLimiter.__civicpulseRateLimits;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Single-process fixed-window limiter.
 *
 * LIMITATION: state is per process and resets on restart; it is a
 * defence-in-depth measure, not a distributed abuse control. Durable rules
 * (one support per user per report, ownership checks) are enforced in SQL.
 */
export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  const now = options.now ?? Date.now();
  const map = buckets();

  if (map.size > 5_000) {
    for (const [existingKey, bucket] of map) {
      if (bucket.resetAt <= now) map.delete(existingKey);
    }
  }

  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: current.resetAt - now,
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: options.limit - current.count,
    retryAfterMs: 0,
  };
}

export function enforceRateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: number; message?: string },
): void {
  const result = consumeRateLimit(key, options);
  if (!result.allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      options.message ?? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      { retryAfterMs: result.retryAfterMs },
    );
  }
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets().clear();
}
