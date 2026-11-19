import { getDb } from "@/lib/db/connection";
import { getEvidenceRow } from "@/lib/domain/community";
import { one } from "@/lib/db/query";
import { jsonError } from "@/lib/http/api";
import { notFound } from "@/lib/http/errors";
import { readMedia } from "@/lib/services/media-store";

type RouteContext = { params: Promise<{ evidenceId: string }> };

/**
 * Serve approved evidence only, and only while its report is still public.
 *
 * Pending or rejected uploads live in the private scope and 404 here, so an id
 * guess reveals neither the photo nor its existence. The parent-report state is
 * checked as well: approved evidence must not outlive a withdrawal or takedown.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { evidenceId } = await context.params;
    const db = getDb();
    const row = getEvidenceRow(db, evidenceId);
    if (row.status !== "approved") throw notFound("공개된 근거를 찾을 수 없습니다.");

    const report = one<{ state: string }>(db, "SELECT state FROM reports WHERE id = ?", [
      row.report_id,
    ]);
    if (report?.state !== "published") throw notFound("공개된 근거를 찾을 수 없습니다.");

    let bytes: Buffer;
    try {
      bytes = await readMedia("private", row.storage_key);
    } catch (error) {
      console.error("[media] evidence file missing on disk", { evidence: row.id, error });
      throw notFound("근거 사진 파일을 찾을 수 없습니다.");
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": row.mime,
        "content-length": String(bytes.byteLength),
        // A withdrawal must take effect immediately, so public media is not
        // cacheable by shared caches in this demo.
        "cache-control": "no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
