import { getDb } from "@/lib/db/connection";
import { getEvidenceRow } from "@/lib/domain/community";
import { jsonError } from "@/lib/http/api";
import { notFound } from "@/lib/http/errors";
import { readMedia } from "@/lib/services/media-store";

type RouteContext = { params: Promise<{ evidenceId: string }> };

/**
 * Serve approved evidence only.
 *
 * Pending or rejected uploads live in the private scope and 404 here, so an id
 * guess reveals neither the photo nor its existence.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { evidenceId } = await context.params;
    const db = getDb();
    const row = getEvidenceRow(db, evidenceId);
    if (row.status !== "approved") throw notFound("공개된 근거를 찾을 수 없습니다.");

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
        "cache-control": "public, max-age=60",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
