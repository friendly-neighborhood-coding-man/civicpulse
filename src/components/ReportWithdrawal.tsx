"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  publicId: string;
  audience: "owner" | "moderator";
};

/**
 * Two-step withdrawal. The first click only reveals the consequences; the
 * second performs the request. Wording deliberately avoids promising deletion:
 * the app removes public visibility, not every copy that may exist elsewhere.
 */
export default function ReportWithdrawal({ publicId, audience }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${publicId}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "공개를 중단하지 못했습니다.");
        return;
      }
      setDone(true);
      setConfirming(false);
      // Re-render from the server: the public page now 404s.
      router.refresh();
    } catch {
      setError("네트워크 오류로 공개를 중단하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p
        role="status"
        className="rounded-xl bg-accent-soft px-3 py-2 text-[11px] leading-relaxed text-accent-strong"
      >
        공개를 중단했습니다. 공개 페이지와 근거 사진은 더 이상 표시되지 않습니다.
        기록과 처리 이력은 감사 목적으로 남습니다.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface-muted/60 p-3">
      <p className="text-[11px] leading-relaxed text-muted">
        {audience === "owner"
          ? "공개를 중단하면 공개 페이지와 근거 사진이 즉시 보이지 않게 됩니다. 기록은 감사 목적으로 남으며, 검색엔진이나 외부 캐시에 이미 저장된 사본은 CivicPulse가 지울 수 없습니다."
          : "운영자 권한으로 공개를 중단합니다. 공개 페이지와 근거 사진이 즉시 보이지 않게 되며, 조치 기록이 남습니다."}
      </p>

      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-2 py-1 text-[11px] text-danger">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void withdraw()}
            className="inline-flex h-9 items-center rounded-full bg-danger px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "처리 중…" : "정말 공개 중단"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-xs font-semibold text-ink transition hover:border-line-strong disabled:opacity-50"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 inline-flex h-9 items-center rounded-full border border-danger/40 bg-surface px-4 text-xs font-semibold text-danger transition hover:bg-danger-soft"
        >
          {audience === "owner" ? "공개 중단" : "운영자: 공개 중단"}
        </button>
      )}
    </div>
  );
}
