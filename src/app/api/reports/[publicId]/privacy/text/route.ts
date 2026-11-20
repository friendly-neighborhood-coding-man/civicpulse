import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { buildPublicTextReview } from "@/lib/domain/publication";
import { getOwnedReportRow } from "@/lib/domain/reports";
import { jsonOk, withApi } from "@/lib/http/api";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Owner-only review of the exact title/body that would become public.
 *
 * Findings contain masked previews and offsets, never the matched value. The
 * token must be echoed back when publishing, which binds the publisher's
 * acknowledgement to this exact content.
 */
export async function GET(_request: Request, context: RouteContext) {
  return withApi(async () => {
    const { publicId } = await context.params;
    const user = await requireUser();
    const row = getOwnedReportRow(getDb(), user, publicId);
    return jsonOk({
      textReview: buildPublicTextReview(row),
      visibility: "owner_only",
      submittedToAgency: false,
    });
  });
}
