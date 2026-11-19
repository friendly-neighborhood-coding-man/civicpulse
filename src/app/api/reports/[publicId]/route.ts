import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getChannel, toPublicChannel } from "@/lib/domain/channels";
import { getOwnerReport, updateDraftReport } from "@/lib/domain/reports";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { updateDraftSchema } from "@/lib/validation/report";

type RouteContext = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return withApi(async () => {
    const { publicId } = await context.params;
    const user = await requireUser();
    const report = getOwnerReport(getDb(), user, publicId);
    const channel = getChannel(report.channelId);
    return jsonOk({
      report,
      channel: channel ? toPublicChannel(channel) : null,
    });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`reports:update:${user.id}`, {
      limit: 30,
      windowMs: 60_000,
    });
    const patch = await readJson(request, updateDraftSchema);
    const report = updateDraftReport(getDb(), user, publicId, patch);
    return jsonOk({ report });
  });
}
