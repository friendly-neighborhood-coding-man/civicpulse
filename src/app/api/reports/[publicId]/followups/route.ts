import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getFollowupForOwner, requestFollowup } from "@/lib/domain/followup";
import { assertSameOrigin, jsonOk, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ publicId: string }> };

/** Owner-only view of follow-up eligibility and drafts for one published issue. */
export async function GET(_request: Request, context: RouteContext) {
  return withApi(async () => {
    const { publicId } = await context.params;
    const user = await requireUser();
    const db = getDb();
    const data = getFollowupForOwner(db, user, publicId);
    return jsonOk({ ...data, submittedToAgency: false });
  });
}

/**
 * Create a deterministic follow-up draft.
 *
 * This never sends anything. It refuses when the waiting period, new-evidence or
 * cooldown conditions are not met, and returns the reasons so the UI can explain.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`followup:${user.id}`, {
      limit: 5,
      windowMs: 10 * 60_000,
      message: "후속 초안 요청이 너무 많습니다.",
    });

    const result = requestFollowup(getDb(), user, publicId);
    return jsonOk({ ...result, submittedToAgency: false }, { status: 201 });
  });
}
