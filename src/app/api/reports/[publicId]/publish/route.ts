import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { publishReport } from "@/lib/domain/publication";
import { getOwnerReport, getOwnedReportRow } from "@/lib/domain/reports";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { masksSchema } from "@/lib/privacy/masks";
import { enforceRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ publicId: string }> };

const publishSchema = z.object({
  masks: masksSchema,
  ack: z.object({
    privacyReviewed: z.boolean(),
    consent: z.boolean(),
    noSensitiveContent: z.boolean().default(false),
    // The public page copies the draft text, so it needs its own acknowledgement.
    textReviewed: z.boolean(),
    textFindingsReviewed: z.boolean().default(false),
    // Server-issued token of the text the publisher actually reviewed.
    textToken: z.string().trim().min(8).max(80),
  }),
});

/**
 * Publish a redacted copy. Requires explicit acknowledgements; never dispatches
 * anything to an agency.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`reports:publish:${user.id}`, {
      limit: 10,
      windowMs: 10 * 60_000,
      message: "공개 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });

    const body = await readJson(request, publishSchema);
    const db = getDb();
    const row = getOwnedReportRow(db, user, publicId);

    const result = await publishReport(db, user, publicId, {
      masks: body.masks,
      ack: body.ack,
    });

    return jsonOk({
      publication: result,
      report: getOwnerReport(db, user, row.public_id),
      // Stated explicitly in the payload so no client can imply auto-submission.
      submitted: false,
    });
  });
}
