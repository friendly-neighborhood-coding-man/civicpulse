import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getEvidenceRow } from "@/lib/domain/community";
import { jsonError } from "@/lib/http/api";
import { forbidden, notFound } from "@/lib/http/errors";
import { readMedia } from "@/lib/services/media-store";

type RouteContext = { params: Promise<{ evidenceId: string }> };

/** Moderator preview of a photo, including pending items, with no public cache. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    if (user.role !== "moderator") throw forbidden("운영자만 볼 수 있습니다.");

    const { evidenceId } = await context.params;
    const row = getEvidenceRow(getDb(), evidenceId);

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
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
