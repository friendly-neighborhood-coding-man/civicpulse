import { describeAiConfig } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getLatestAnalysis, requestAnalysis } from "@/lib/domain/analysis";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { requestAnalysisSchema } from "@/lib/validation/analysis";

type RouteContext = { params: Promise<{ publicId: string }> };

/** Latest stored analysis for one owned draft, or `null`. */
export async function GET(_request: Request, context: RouteContext) {
  return withApi(async () => {
    const { publicId } = await context.params;
    const user = await requireUser();
    const analysis = getLatestAnalysis(getDb(), user, publicId);
    return jsonOk({ analysis, ai: describeAiConfig() });
  });
}

/**
 * One citizen-initiated analysis.
 *
 * Same-origin, authenticated, owner-checked and rate limited before any work.
 * The response always describes what actually happened: a live model result, a
 * labelled simulation, or a deterministic fallback with a fixed failure code.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    // Coarse per-process guard in front of the durable per-report and daily
    // limits enforced in the domain; a real call is slow, so 8/min is ample.
    enforceRateLimit(`ai:analyze:${user.id}`, {
      limit: 8,
      windowMs: 60_000,
      message: "AI 분석 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    });
    const input = await readJson(request, requestAnalysisSchema);
    const result = await requestAnalysis(getDb(), user, publicId, input);
    return jsonOk(
      {
        analysis: result.analysis,
        reused: result.reused,
        ai: describeAiConfig(),
        published: false,
        submitted: false,
      },
      { status: result.reused ? 200 : 201 },
    );
  });
}
