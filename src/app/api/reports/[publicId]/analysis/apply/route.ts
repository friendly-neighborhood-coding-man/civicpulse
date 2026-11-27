import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { applyAnalysis } from "@/lib/domain/analysis";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { applyAnalysisSchema } from "@/lib/validation/analysis";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Copy an analysis draft into the editable report. A body that the citizen has
 * already edited is never replaced without `overwrite: true`, which the client
 * only sends after showing the 409 explanation.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    // Cheap, idempotent, but still bounded: it writes a 2 000-character body.
    enforceRateLimit(`ai:apply:${user.id}`, { limit: 20, windowMs: 60_000 });
    const input = await readJson(request, applyAnalysisSchema);
    const report = applyAnalysis(getDb(), user, publicId, input.analysisId, {
      overwrite: input.overwrite,
    });
    return jsonOk({ report, published: false, submitted: false });
  });
}
