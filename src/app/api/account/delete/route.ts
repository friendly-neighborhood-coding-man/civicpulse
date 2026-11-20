import { z } from "zod";

import { getAuthMode } from "@/lib/auth/mode";
import { verifyPassword } from "@/lib/auth/password";
import { clearSessionUser, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { deleteAccount } from "@/lib/domain/account";
import { getUserById } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const deleteSchema = z.object({
  confirm: z.literal(true),
  /** Required in password mode; ignored (and not stored) in demo mode. */
  password: z.string().max(200).optional(),
});

/**
 * Delete the signed-in account.
 *
 * Published reports are withdrawn first, drafts and this account's files are
 * queued through the durable cleanup, personal rows are removed and the user
 * row is anonymised. In password mode the current password must be re-entered;
 * in demo mode the explicit `confirm: true` body is the only confirmation, and
 * the UI says the account is synthetic.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const actor = await requireUser();
    enforceRateLimit(`account:delete:${actor.id}`, {
      limit: 3,
      windowMs: 60 * 60_000,
      message: "계정 삭제 요청이 너무 많습니다.",
    });

    const body = await readJson(request, deleteSchema);
    const db = getDb();

    if (getAuthMode() === "password") {
      const row = getUserById(db, actor.id);
      if (!body.password || !verifyPassword(body.password, row?.password_hash ?? null)) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "계정 삭제에는 현재 비밀번호가 필요합니다.",
        );
      }
    }

    const result = await deleteAccount(db, actor);
    await clearSessionUser();
    return jsonOk({ deletion: result, signedOut: true });
  });
}
