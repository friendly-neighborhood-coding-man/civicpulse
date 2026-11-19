"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ModerationQueueItem } from "@/lib/domain/community";

type Props = { queue: ModerationQueueItem[] };

export default function ModerationQueue({ queue }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  async function review(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/moderation/evidence/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: reason[id]?.trim() || undefined }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "검토 결과를 저장하지 못했습니다.");
        return;
      }
      setMessage(
        decision === "approved"
          ? "공개로 승인했습니다. 이제 누구나 볼 수 있습니다."
          : "반려했습니다. 사진은 공개되지 않습니다.",
      );
      router.refresh();
    } catch {
      setError("네트워크 오류로 검토 결과를 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface-muted p-6 text-xs leading-relaxed text-muted">
        검토를 기다리는 근거가 없습니다. 새 근거가 올라오면 여기에 표시됩니다.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {message ? (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-strong">{message}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <ul className="space-y-4">
        {queue.map((item) => (
          <li key={item.id} className="card overflow-hidden sm:flex">
            {/* eslint-disable-next-line @next/next/no-img-element -- moderator-only private route */}
            <img
              src={item.photoUrl}
              alt="검토 대기 중인 근거 사진"
              className="h-48 w-full bg-surface-muted object-cover sm:h-auto sm:w-56"
            />
            <div className="flex-1 p-5">
              <p className="text-[11px] text-muted">
                {item.reportTitle} · {new Date(item.createdAt).toLocaleString("ko-KR")}
              </p>
              <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-ink-soft">
                {item.note}
              </p>
              <p className="mt-2 text-[11px] text-warn">
                얼굴·번호판 등 개인정보가 없는지 직접 확인한 뒤 승인하세요. 자동
                가림은 적용되지 않았습니다.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/issues/${item.reportPublicId}`}
                  className="text-[11px] font-medium text-accent-strong underline underline-offset-4"
                >
                  공개 제보 보기 ↗
                </Link>
                <input
                  aria-label="반려 사유"
                  value={reason[item.id] ?? ""}
                  onChange={(event) =>
                    setReason((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  maxLength={200}
                  placeholder="반려 사유 (선택)"
                  className="h-9 min-w-40 flex-1 rounded-full border border-line bg-surface px-3 text-xs text-ink"
                />
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void review(item.id, "approved")}
                  className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-xs font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                >
                  승인
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void review(item.id, "rejected")}
                  className="inline-flex h-9 items-center rounded-full border border-line px-4 text-xs font-semibold text-ink transition hover:border-line-strong disabled:opacity-50"
                >
                  반려
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
