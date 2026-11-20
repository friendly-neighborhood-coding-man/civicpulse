import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { listPendingMediaCleanup, processMediaCleanup } from "@/lib/domain/takedown";
import { forbidden } from "@/lib/http/errors";
import { assertSameOrigin, jsonOk, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Retry media deletions that failed after a withdrawal.
 *
 * A withdrawal closes the public routes transactionally, then deletes bytes.
 * When a delete fails, the durable queue row keeps the obligation; this endpoint
 * is the manual/ops reconciliation hook (bounded, idempotent, moderator-only).
 * Unauthorised callers learn nothing about pending reports or storage keys.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "moderator") {
      throw forbidden("미디어 정리는 운영자만 실행할 수 있습니다.");
    }
    enforceRateLimit(`media-cleanup:${user.id}`, {
      limit: 12,
      windowMs: 10 * 60_000,
      message: "정리 요청이 너무 많습니다.",
    });

    const db = getDb();
    const result = await processMediaCleanup(db, { limit: 100 });
    return jsonOk({
      cleanup: result,
      // Only counts and storage-scope totals, never report content or keys.
      pendingScopes: listPendingMediaCleanup(db, 100).reduce(
        (counts, row) => {
          counts[row.scope] += 1;
          return counts;
        },
        { public: 0, private: 0 },
      ),
    });
  });
}
