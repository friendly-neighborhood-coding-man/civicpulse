import { getDb } from "@/lib/db/connection";
import { getPublishedReportRow } from "@/lib/domain/publication";
import { getMediaByRole } from "@/lib/domain/reports";
import { jsonError } from "@/lib/http/api";
import { notFound } from "@/lib/http/errors";
import { readMedia } from "@/lib/services/media-store";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Serve the redacted public copy only.
 *
 * There is no code path here that can read the `original` or `working` role,
 * and the file is read from the public storage scope.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { publicId } = await context.params;
    const db = getDb();
    const row = getPublishedReportRow(db, publicId);
    const media = getMediaByRole(db, row.id, "public");
    if (!media) throw notFound("공개 사진을 찾을 수 없습니다.");

    let bytes: Buffer;
    try {
      bytes = await readMedia("public", media.storage_key);
    } catch (error) {
      console.error("[media] public copy missing on disk", {
        report: row.public_id,
        error,
      });
      throw notFound("공개 사진 파일을 찾을 수 없습니다.");
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": media.mime,
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
