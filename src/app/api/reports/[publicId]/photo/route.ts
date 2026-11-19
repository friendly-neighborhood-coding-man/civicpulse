import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getOwnedReportRow, getWorkingMedia } from "@/lib/domain/reports";
import { jsonError } from "@/lib/http/api";
import { notFound } from "@/lib/http/errors";
import { readMedia } from "@/lib/services/media-store";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Authenticated, owner-only access to the working copy of a photo.
 *
 * Raw originals are never served over HTTP. Responses are `no-store` and
 * `nosniff`; the media key is generated server-side and never exposed.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { publicId } = await context.params;
    const user = await requireUser();
    const db = getDb();
    const row = getOwnedReportRow(db, user, publicId);
    const media = getWorkingMedia(db, row);
    if (!media) throw notFound("사진을 찾을 수 없습니다.");

    let bytes: Buffer;
    try {
      bytes = await readMedia("private", media.storage_key);
    } catch (error) {
      console.error("[media] working copy missing on disk", {
        report: row.public_id,
        error,
      });
      throw notFound("사진 파일을 찾을 수 없습니다.");
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": media.mime,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
