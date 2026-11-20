"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Account deletion confirmation.
 *
 * Requires an explicit checkbox, and in password mode the current password.
 * The server enforces both; this UI never deletes anything by itself.
 */
export default function AccountDeletion({ requiresPassword }: { requiresPassword: boolean }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    if (!confirmed) {
      setError("삭제 범위를 확인하고 체크해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          ...(requiresPassword ? { password } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error?.message ?? "계정을 삭제하지 못했습니다.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("네트워크 오류로 계정을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 p-5">
      <h2 className="text-sm font-semibold text-danger">계정 삭제</h2>
      <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-ink-soft">
        <li>공개한 제보는 즉시 공개 중단되고, 공개 사진·원본·작업 사진과 근거 파일이 삭제 대기열에 들어갑니다. 실패한 삭제는 재시도됩니다.</li>
        <li>비공개 초안, 이 계정의 근거·지지·후속 초안·상태 기록이 삭제됩니다.</li>
        <li>작성자 표시는 탈퇴한 사용자로 익명화되며, 이메일과 비밀번호는 지워집니다.</li>
        <li>공개 중단된 제보의 기록(제목·본문·상태 이력)은 감사 목적으로 보존 기간(기본 90일) 뒤 삭제됩니다.</li>
        <li>외부 백업이나 캐시에 이미 복제된 사본은 이 앱에서 지울 수 없습니다.</li>
      </ul>
      {requiresPassword ? (
        <div className="mt-3">
          <label htmlFor="delete-password" className="text-[11px] font-medium text-ink-soft">
            현재 비밀번호
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          />
        </div>
      ) : null}
      <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-danger)]"
        />
        위 내용을 확인했고 계정을 삭제합니다.
      </label>
      {error ? (
        <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy || !confirmed}
        className="mt-3 inline-flex h-10 items-center rounded-full bg-danger px-4 text-sm font-semibold text-white transition disabled:opacity-50"
      >
        {busy ? "삭제 중…" : "계정 삭제"}
      </button>
    </div>
  );
}
