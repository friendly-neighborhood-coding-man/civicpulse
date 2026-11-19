import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { listEvidenceQueue } from "@/lib/domain/community";
import { jsonError, jsonOk } from "@/lib/http/api";
import { forbidden } from "@/lib/http/errors";

/** Pending evidence, visible to moderators only. */
export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "moderator") throw forbidden("운영자만 볼 수 있습니다.");
    return jsonOk({ queue: listEvidenceQueue(getDb()) });
  } catch (error) {
    return jsonError(error);
  }
}
