import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { reviewEvidence } from "@/lib/domain/community";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { reviewEvidenceSchema } from "@/lib/validation/community";

type RouteContext = { params: Promise<{ evidenceId: string }> };

/** Approve or reject pending evidence. Moderator-only, audited by reviewed_by. */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { evidenceId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`moderation:${user.id}`, {
      limit: 60,
      windowMs: 10 * 60_000,
      message: "검토 요청이 너무 많습니다.",
    });

    const body = await readJson(request, reviewEvidenceSchema);
    const row = reviewEvidence(
      getDb(),
      user,
      evidenceId,
      body.decision,
      body.reason,
    );

    return jsonOk({
      evidence: { id: row.id, status: row.status, reviewedAt: row.reviewed_at },
    });
  });
}
