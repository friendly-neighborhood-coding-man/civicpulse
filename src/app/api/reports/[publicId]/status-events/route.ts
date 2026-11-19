import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { addStatusEvent, toPublicStatusEvent } from "@/lib/domain/community";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { statusEventSchema } from "@/lib/validation/community";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Append a status event to a published issue.
 *
 * Citizens (here: the report owner) can only record their own claim; official
 * and mock statuses require a moderator, and official ones require an https
 * source. Nothing here contacts an agency.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`status:${user.id}`, {
      limit: 10,
      windowMs: 10 * 60_000,
      message: "상태 기록이 너무 많습니다.",
    });

    const body = await readJson(request, statusEventSchema);
    const event = addStatusEvent(getDb(), user, publicId, body);

    return jsonOk(
      { event: toPublicStatusEvent(event), submittedToAgency: false },
      { status: 201 },
    );
  });
}
