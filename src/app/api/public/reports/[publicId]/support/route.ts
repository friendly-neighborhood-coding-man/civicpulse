import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { supportIssue } from "@/lib/domain/community";
import { assertSameOrigin, jsonOk, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Express support for a published issue.
 *
 * The composite primary key makes this idempotent: a repeat tap returns the same
 * count with `alreadySupported: true` instead of inflating it.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`support:${user.id}`, {
      limit: 20,
      windowMs: 60_000,
      message: "지지 표시가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });

    const result = supportIssue(getDb(), user, publicId);
    return jsonOk({
      ...result,
      // Support is a civic gesture, never a judgement about whether it is true.
      countsAsVerification: false,
    });
  });
}
