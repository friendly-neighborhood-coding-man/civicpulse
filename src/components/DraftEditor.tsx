"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  publicId: string;
  initialTitle: string;
  initialDescription: string;
  initialLandmark: string;
  updatedAt: string;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default function DraftEditor({
  publicId,
  initialTitle,
  initialDescription,
  initialLandmark,
  updatedAt,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [landmark, setLandmark] = useState(initialLandmark);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== initialTitle ||
    description !== initialDescription ||
    landmark !== initialLandmark;

  async function save() {
    setError(null);
    if (title.trim().length < 5) {
      setError("제목은 5자 이상 입력해 주세요.");
      return;
    }
    if (description.trim().length < 10) {
      setError("본문은 10자 이상 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/reports/${publicId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, landmark }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            ok: boolean;
            data?: { report: { updatedAt: string } };
            error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
          }
        | null;

      if (!response.ok || !body?.ok || !body.data) {
        const issue = body?.error?.details?.issues?.[0]?.message;
        setError(issue ?? body?.error?.message ?? "저장하지 못했습니다.");
        return;
      }
      // Reflect the server's timestamp, not the local clock.
      setSavedAt(body.data.report.updatedAt);
      router.refresh();
    } catch {
      setError("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="title" className="text-xs font-medium text-muted">
          제목
        </label>
        <input
          id="title"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink"
        />
      </div>

      <div>
        <label htmlFor="draft-description" className="text-xs font-medium text-muted">
          제보 본문
        </label>
        <textarea
          id="draft-description"
          value={description}
          rows={12}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink"
        />
        <p className="mt-1 text-right text-[11px] text-muted">
          {description.length} / 2000
        </p>
      </div>

      <div>
        <label htmlFor="draft-landmark" className="text-xs font-medium text-muted">
          주변 지형지물
        </label>
        <input
          id="draft-landmark"
          value={landmark}
          maxLength={80}
          onChange={(event) => setLandmark(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-40"
        >
          {saving ? "저장 중…" : dirty ? "변경 저장" : "저장됨"}
        </button>
        <span className="text-xs text-muted" aria-live="polite">
          마지막 저장: {formatTime(savedAt)}
        </span>
      </div>
    </div>
  );
}
