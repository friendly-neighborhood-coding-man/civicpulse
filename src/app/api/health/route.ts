import { getAssistantMode } from "@/lib/config";
import { getDb, getSchemaVersion } from "@/lib/db/connection";
import { countPendingMediaCleanup } from "@/lib/domain/takedown";
import { jsonError, jsonOk } from "@/lib/http/api";
import { ApiError } from "@/lib/http/errors";

export async function GET() {
  try {
    const db = getDb();
    const version = getSchemaVersion(db);
    // Observable retention signal: files whose deletion after withdrawal has
    // not succeeded yet. Zero is the healthy value; a non-zero value means the
    // public route is already closed but bytes still await retry.
    const mediaCleanupPending = countPendingMediaCleanup(db);
    return jsonOk({
      status: "ok",
      schemaVersion: version,
      assistantMode: getAssistantMode(),
      demoMode: true,
      mediaCleanupPending,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] database unavailable", error);
    return jsonError(
      new ApiError(503, "INTERNAL", "데이터베이스에 연결할 수 없습니다."),
    );
  }
}
