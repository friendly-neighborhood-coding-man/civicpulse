import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { approveFollowup, discardFollowup } from "@/lib/domain/followup";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ followupId: string }> };

const actionSchema = z.object({ action: z.enum(["approve", "discard"]) });

/**
 * Human review of a follow-up draft.
 *
 * "approve" records that a person read and accepted the draft. It does not send
 * it anywhere; the response says so explicitly.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { followupId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`followup-review:${user.id}`, {
      limit: 20,
      windowMs: 10 * 60_000,
      message: "검토 요청이 너무 많습니다.",
    });

    const { action } = await readJson(request, actionSchema);
    const db = getDb();
    const followup =
      action === "approve"
        ? approveFollowup(db, user, followupId)
        : discardFollowup(db, user, followupId);

    return jsonOk({ followup, submittedToAgency: false });
  });
}
