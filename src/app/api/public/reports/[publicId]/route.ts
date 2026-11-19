import { getDb } from "@/lib/db/connection";
import { getPublicReport } from "@/lib/domain/publication";
import { jsonError, jsonOk } from "@/lib/http/api";

type RouteContext = { params: Promise<{ publicId: string }> };

/** Public read surface. Only published reports are visible, and only the narrow projection. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { publicId } = await context.params;
    const report = getPublicReport(getDb(), publicId);
    return jsonOk({ report });
  } catch (error) {
    return jsonError(error);
  }
}
