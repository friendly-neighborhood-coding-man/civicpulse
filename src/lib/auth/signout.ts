/**
 * Sign-out is a destructive-ish safety action: the browser must not pretend the
 * session ended when the server refused or the network failed, because a still
 * valid session cookie would remain in the browser.
 *
 * Kept as a small pure helper so the success/failure contract can be unit tested
 * without a DOM. A successful response is the only path that reports success.
 */

export type SignOutFetcher = (input: string, init: RequestInit) => Promise<Response>;

export type SignOutResult =
  | { ok: true }
  | { ok: false; message: string };

type SignOutBody = {
  ok?: boolean;
  error?: { message?: string };
};

export async function requestSignOut(
  fetcher: SignOutFetcher,
): Promise<SignOutResult> {
  try {
    const response = await fetcher("/api/session", { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as SignOutBody | null;
    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        message:
          body?.error?.message ??
          `로그아웃하지 못했습니다. (HTTP ${response.status}) 세션이 유지되었을 수 있습니다.`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "네트워크 오류로 로그아웃하지 못했습니다. 세션이 유지되었을 수 있습니다.",
    };
  }
}
