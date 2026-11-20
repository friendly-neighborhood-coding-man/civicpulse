import { z } from "zod";

import { getAuthMode } from "@/lib/auth/mode";
import { setSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { authenticateWithPassword } from "@/lib/domain/auth";
import { ApiError } from "@/lib/http/errors";
import { assertSameOrigin, jsonOk, readJson, withApi } from "@/lib/http/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

/**
 * Password sign-in for the optional password provider.
 *
 * There is no registration endpoint and no password reset by email: an operator
 * provisions accounts (`npm run user:create`). Failures are deliberately
 * generic, rate limited per email and per process, and never reveal whether an
 * address exists.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    if (getAuthMode() !== "password") {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "이 배포는 비밀번호 로그인을 사용하지 않습니다.",
      );
    }

    const body = await readJson(request, loginSchema);
    const email = body.email.trim().toLowerCase();
    enforceRateLimit(`login:email:${email}`, {
      limit: 5,
      windowMs: 15 * 60_000,
      message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });
    enforceRateLimit("login:process", {
      limit: 60,
      windowMs: 5 * 60_000,
      message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    });

    const user = authenticateWithPassword(getDb(), email, body.password);
    if (!user) {
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
    }

    await setSessionUser(user.id);
    return jsonOk({ user });
  });
}
