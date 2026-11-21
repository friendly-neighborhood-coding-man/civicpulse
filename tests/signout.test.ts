import { describe, expect, it } from "vitest";

import { requestSignOut } from "@/lib/auth/signout";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sign-out response contract", () => {
  it("reports success only after a 2xx JSON ok response and sends DELETE", async () => {
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const result = await requestSignOut(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(200, { ok: true, data: { user: null } });
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe("/api/session");
    expect(calls[0]!.init.method).toBe("DELETE");
  });

  it("does not claim success on 429 and surfaces the server message", async () => {
    const result = await requestSignOut(async () =>
      jsonResponse(429, {
        ok: false,
        error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다." },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("요청이 너무 많습니다.");
      expect(result.message).not.toContain("성공");
    }
  });

  it("does not claim success on 500, even when the body is not JSON", async () => {
    const result = await requestSignOut(
      async () => new Response("<html>error</html>", { status: 500 }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("HTTP 500");
      expect(result.message).toContain("유지");
    }
  });

  it("treats a 200 response with ok:false as failure", async () => {
    const result = await requestSignOut(async () =>
      jsonResponse(200, {
        ok: false,
        error: { code: "INTERNAL", message: "세션을 지우지 못했습니다." },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("세션을 지우지 못했습니다.");
  });

  it("does not claim success on a network error", async () => {
    const result = await requestSignOut(async () => {
      throw new TypeError("fetch failed");
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("네트워크 오류");
      expect(result.message).toContain("유지");
    }
  });
});
