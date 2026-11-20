import { z } from "zod";

import {
  clearSessionUser,
  getSessionUser,
  setSessionUser,
} from "@/lib/auth/session";
import { isDemoAuthMode } from "@/lib/auth/mode";
import { getSessionSwitchLimit } from "@/lib/config";
import { getDb } from "@/lib/db/connection";
import { DEMO_USERS } from "@/lib/db/seed";
import { listUsers } from "@/lib/domain/users";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { ApiError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const switchSchema = z.object({ userId: z.string().min(1).max(64) });

const DEMO_IDS = new Set<string>(DEMO_USERS.map((user) => user.id));

export async function GET() {
  return withApi(async () => {
    const db = getDb();
    const user = await getSessionUser(db);
    return jsonOk({ user, users: listUsers(db), demo: true });
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    // The demo switcher is not authentication. In password mode it is not merely
    // hidden: it is refused, so knowing a demo id cannot grant a session.
    if (!isDemoAuthMode()) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "데모 사용자 전환은 이 배포에서 사용할 수 없습니다.",
      );
    }
    enforceRateLimit("session:switch", {
      limit: getSessionSwitchLimit(),
      windowMs: 60_000,
    });
    const body = await readJson(request, switchSchema);
    if (!DEMO_IDS.has(body.userId)) {
      throw new ApiError(404, "NOT_FOUND", "존재하지 않는 데모 사용자입니다.");
    }
    await setSessionUser(body.userId);
    const db = getDb();
    return jsonOk({ user: await getSessionUser(db) });
  });
}

export async function DELETE(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    enforceRateLimit("session:signout", { limit: 30, windowMs: 60_000 });
    await clearSessionUser();
    return jsonOk({ user: null });
  });
}
