import { requireUser } from "@/lib/auth/session";
import { LIMITS } from "@/lib/config";
import { getDb } from "@/lib/db/connection";
import { addEvidence } from "@/lib/domain/community";
import { assertSameOrigin, jsonOk, readFormData, withApi } from "@/lib/http/api";
import { badRequest } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { processUpload } from "@/lib/services/image";
import { addEvidenceSchema } from "@/lib/validation/community";

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * Submit additional evidence.
 *
 * It is stored as pending and stays invisible publicly until a moderator
 * approves it. No automatic redaction is claimed here: the uploader must
 * confirm they checked the photo, and the moderator reviews it before release.
 */
export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    assertSameOrigin(request);
    const { publicId } = await context.params;
    const user = await requireUser();
    enforceRateLimit(`evidence:${user.id}`, {
      limit: 3,
      windowMs: 60 * 60_000,
      message: "추가 근거는 시간당 3건까지 올릴 수 있습니다.",
    });

    const form = await readFormData(request, LIMITS.uploadMaxBytes + 1024 * 1024);
    const input = addEvidenceSchema.parse({
      note: String(form.get("note") ?? ""),
      ackNoSensitive: form.get("ackNoSensitive") === "true",
    });

    const file = form.get("photo");
    if (!(file instanceof File)) throw badRequest("사진을 첨부해 주세요.");

    const image = await processUpload(file);
    const result = await addEvidence(getDb(), user, publicId, { ...input, image });

    return jsonOk(
      {
        evidence: result,
        // Stated in the payload: this is not visible to the public yet.
        visibility: "pending_moderation",
        submittedToAgency: false,
      },
      { status: 202 },
    );
  });
}
