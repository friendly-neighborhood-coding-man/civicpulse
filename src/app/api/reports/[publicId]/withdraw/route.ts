import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { withdrawReport } from "@/lib/domain/takedown";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ publicId: string }> };

const withdrawSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

/**
 * Withdraw a published report (owner) or take it down (moderator).
 *
 * This is a visibility control, not permanent deletion: the public page, the
 * public photo and all evidence photos stop being served immediately, while the
 * report row and audit metadata stay. Nothing is sent to any agency.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`reports:withdraw:${user.id}`, {
      limit: 10,
      windowMs: 10 * 60_000,
      message: "공개 중단 요청이 너무 많습니다.",
    });

    const body = await readJson(request, withdrawSchema);
    const withdrawal = await withdrawReport(getDb(), user, publicId, body);

    return jsonOk({
      withdrawal,
      // Explicit: nothing outside the app is contacted.
      submittedToAgency: false,
    });
  });
}
