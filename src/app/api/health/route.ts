import { describeAiConfig } from "@/lib/ai/config";
import { getAuthMode } from "@/lib/auth/mode";
import { getAssistantMode } from "@/lib/config";
import { getDb, getSchemaVersion } from "@/lib/db/connection";
import { countRetentionEligible } from "@/lib/domain/retention";
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
    const retentionDue = countRetentionEligible(db);
    const authMode = getAuthMode();
    return jsonOk({
      status: "ok",
      schemaVersion: version,
      assistantMode: getAssistantMode(),
      // Safe provider summary: mode, provider name, model and whether a key is
      // present. Never the key itself.
      ai: describeAiConfig(),
      authMode,
      // Derived from the configured provider, never hardcoded: a password
      // deployment must not describe itself as a demo.
      demoMode: authMode === "demo",
      mediaCleanupPending,
      // Rows the retention job would remove now; 0 is the healthy steady state.
      retentionEligible: retentionDue,
      time: new Date().toISOString(),
    });
  } catch (error) {
    // Includes an invalid auth mode as well as database failures; the generic
    // message stays accurate for both.
    console.error("[health] status check failed", error);
    return jsonError(new ApiError(503, "INTERNAL", "상태를 확인할 수 없습니다."));
  }
}
