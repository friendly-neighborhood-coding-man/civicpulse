import { getAssistantMode } from "@/lib/config";
import { getDb, getSchemaVersion } from "@/lib/db/connection";
import { jsonError, jsonOk } from "@/lib/http/api";
import { ApiError } from "@/lib/http/errors";

export async function GET() {
  try {
    const db = getDb();
    const version = getSchemaVersion(db);
    return jsonOk({
      status: "ok",
      schemaVersion: version,
      assistantMode: getAssistantMode(),
      demoMode: true,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] database unavailable", error);
    return jsonError(
      new ApiError(503, "INTERNAL", "데이터베이스에 연결할 수 없습니다."),
    );
  }
}
