import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { getMediaByRole, getOwnedReportRow } from "@/lib/domain/reports";
import { assertSameOrigin, readJson, withApi } from "@/lib/http/api";
import { notFound } from "@/lib/http/errors";
import { masksSchema } from "@/lib/privacy/masks";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { readMedia } from "@/lib/services/media-store";
import { applyRedaction } from "@/lib/services/redaction";

type RouteContext = { params: Promise<{ publicId: string }> };

const previewSchema = z.object({ masks: masksSchema });

/**
 * Render the exact image that would be published, without storing it.
 *
 * The response is a binary WebP (`no-store`). The client shows it as the
 * privacy preview so the human reviews the *server* output rather than a CSS
 * approximation that could differ from what gets published.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`redaction:preview:${user.id}`, {
      limit: 20,
      windowMs: 60_000,
      message: "미리보기를 너무 자주 요청했습니다. 잠시 후 다시 시도해 주세요.",
    });

    const body = await readJson(request, previewSchema);
    const db = getDb();
    const row = getOwnedReportRow(db, user, publicId);
    const working = getMediaByRole(db, row.id, "working");
    if (!working) throw notFound("사진을 찾을 수 없습니다.");

    const source = await readMedia("private", working.storage_key);
    const result = await applyRedaction(source, body.masks);

    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        "content-type": "image/webp",
        "content-length": String(result.data.byteLength),
        "cache-control": "no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
        "x-preview-size": `${result.width}x${result.height}`,
      },
    });
  });
}
