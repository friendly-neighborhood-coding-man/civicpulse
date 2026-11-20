import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { runRetention } from "@/lib/domain/retention";
import { forbidden } from "@/lib/http/errors";
import { assertSameOrigin, jsonOk, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Run the retention purge now.
 *
 * Deletes removed reports and rejected evidence older than
 * CIVICPULSE_RETENTION_DAYS, then processes the durable media queue. Bounded,
 * idempotent and moderator-only. No content or storage keys are returned.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "moderator") {
      throw forbidden("보존 기간 정리는 운영자만 실행할 수 있습니다.");
    }
    enforceRateLimit(`retention:${user.id}`, {
      limit: 2,
      windowMs: 60 * 60_000,
      message: "보존 기간 정리는 한 시간에 두 번까지 실행할 수 있습니다.",
    });

    const result = await runRetention(getDb());
    return jsonOk({ retention: result, submittedToAgency: false });
  });
}
