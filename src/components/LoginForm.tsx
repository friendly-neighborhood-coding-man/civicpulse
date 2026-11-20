"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Email/password sign-in form for the password identity provider. */
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error?.message ?? "로그인하지 못했습니다.");
        return;
      }
      setPassword("");
      router.push("/reports");
      router.refresh();
    } catch {
      setError("네트워크 오류로 로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="text-xs font-medium text-ink-soft">
          이메일
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="text-xs font-medium text-ink-soft">
          비밀번호
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? "확인 중…" : "로그인"}
      </button>
      <p className="text-[11px] leading-relaxed text-muted">
        계정은 운영자가 발급합니다. 공개 회원가입과 이메일 비밀번호 재설정은
        제공하지 않습니다.
      </p>
    </form>
  );
}
