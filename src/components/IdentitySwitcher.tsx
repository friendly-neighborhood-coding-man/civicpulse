"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PublicUser } from "@/lib/domain/users";

const ROLE_LABEL: Record<PublicUser["role"], string> = {
  citizen: "시민",
  moderator: "운영자",
};

type Props = {
  users: PublicUser[];
  currentUser: PublicUser | null;
  variant?: "compact" | "panel";
};

/**
 * Demo identity switcher. There are no passwords: this is a synthetic session
 * model used to exercise owner/other-user/moderator boundaries.
 */
export default function IdentitySwitcher({
  users,
  currentUser,
  variant = "compact",
}: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(request: () => Promise<Response>, pending: string) {
    setPendingId(pending);
    setError(null);
    try {
      const response = await request();
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error?.message ?? "데모 세션을 변경하지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류로 데모 세션을 변경하지 못했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  const choose = (userId: string) =>
    run(
      () =>
        fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      userId,
    );

  const signOut = () => run(() => fetch("/api/session", { method: "DELETE" }), "signout");

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="demo-identity">
          데모 사용자 선택
        </label>
        <select
          id="demo-identity"
          className="h-10 max-w-36 rounded-full border border-line bg-surface px-3 text-sm text-ink sm:max-w-none"
          value={currentUser?.id ?? ""}
          disabled={pendingId !== null}
          onChange={(event) => {
            if (event.target.value) void choose(event.target.value);
          }}
        >
          <option value="">데모 사용자 선택…</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} · {ROLE_LABEL[user.role]}
            </option>
          ))}
        </select>
        {currentUser ? (
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={pendingId !== null}
            className="h-10 shrink-0 rounded-full border border-line px-3 text-sm whitespace-nowrap text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            나가기
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="w-full text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {users.map((user) => {
          const isCurrent = currentUser?.id === user.id;
          const isPending = pendingId === user.id;
          return (
            <button
              key={user.id}
              type="button"
              aria-pressed={isCurrent}
              disabled={pendingId !== null}
              onClick={() => void choose(user.id)}
              className={[
                "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                isCurrent
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface hover:border-line-strong",
                pendingId !== null && !isPending ? "opacity-60" : "",
              ].join(" ")}
            >
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {user.displayName}
                </span>
                <span className="block text-xs text-muted">
                  @{user.handle} · {ROLE_LABEL[user.role]}
                </span>
              </span>
              <span
                className={[
                  "rounded-full px-2 py-1 text-[11px] font-semibold",
                  isCurrent
                    ? "bg-accent text-white"
                    : "bg-surface-muted text-muted",
                ].join(" ")}
              >
                {isPending ? "전환 중…" : isCurrent ? "사용 중" : "선택"}
              </span>
            </button>
          );
        })}
      </div>
      {currentUser ? (
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={pendingId !== null}
          className="text-sm font-medium text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
        >
          데모 세션 종료
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-muted">
        비밀번호 없는 데모 전용 세션입니다. 실제 인증 수단이 아니며, 합성
        데이터에만 사용됩니다.
      </p>
    </div>
  );
}
