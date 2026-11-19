"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { KIND_LABEL, STATUS_LABEL, STATUS_VALUES, type StatusValue } from "@/lib/validation/community";

type Props = {
  publicId: string;
  supportCount: number;
  supportedByMe: boolean;
  signedIn: boolean;
  isOwner: boolean;
  isModerator: boolean;
};

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; details?: { issues?: Array<{ message: string }> } } }
    | null;
  return (
    body?.error?.details?.issues?.[0]?.message ??
    body?.error?.message ??
    fallback
  );
}

export default function IssueEngagement({
  publicId,
  supportCount,
  supportedByMe,
  signedIn,
  isOwner,
  isModerator,
}: Props) {
  const router = useRouter();
  const [count, setCount] = useState(supportCount);
  const [supported, setSupported] = useState(supportedByMe);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);

  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceMessage, setEvidenceMessage] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [claimStatus, setClaimStatus] = useState<StatusValue>("unresolved");
  const [claimNote, setClaimNote] = useState("");
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const [officialStatus, setOfficialStatus] = useState<StatusValue>("acknowledged");
  const [officialNote, setOfficialNote] = useState("");
  const [officialSource, setOfficialSource] = useState("");
  const [officialMessage, setOfficialMessage] = useState<string | null>(null);

  async function support() {
    setSupportBusy(true);
    setSupportMessage(null);
    try {
      const response = await fetch(`/api/public/reports/${publicId}/support`, {
        method: "POST",
      });
      if (!response.ok) {
        setSupportMessage(await readError(response, "지지 표시를 남기지 못했습니다."));
        return;
      }
      const body = (await response.json()) as {
        supportCount: number;
        alreadySupported: boolean;
      };
      setCount(body.supportCount);
      setSupported(true);
      setSupportMessage(
        body.alreadySupported
          ? "이미 지지한 기록입니다. 한 사람은 한 번만 집계됩니다."
          : "지지했습니다. 이 숫자는 사실 판정이 아닙니다.",
      );
    } catch {
      setSupportMessage("네트워크 오류로 지지를 남기지 못했습니다.");
    } finally {
      setSupportBusy(false);
    }
  }

  async function submitEvidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvidenceError(null);
    setEvidenceMessage(null);
    if (!file) {
      setEvidenceError("사진을 첨부해 주세요.");
      return;
    }
    if (!ack) {
      setEvidenceError("사진에 개인정보가 없다는 확인이 필요합니다.");
      return;
    }
    setEvidenceBusy(true);
    try {
      const form = new FormData();
      form.set("note", note);
      form.set("ackNoSensitive", "true");
      form.set("photo", file);
      const response = await fetch(`/api/public/reports/${publicId}/evidence`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        setEvidenceError(await readError(response, "추가 근거를 올리지 못했습니다."));
        return;
      }
      setEvidenceMessage(
        "접수했습니다. 운영자 검토 후에만 공개되며, 그 전에는 다른 사람에게 보이지 않습니다.",
      );
      setNote("");
      setFile(null);
      setAck(false);
      router.refresh();
    } catch {
      setEvidenceError("네트워크 오류로 추가 근거를 올리지 못했습니다.");
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function postStatus(input: {
    kind: "user_claim" | "official";
    status: StatusValue;
    note: string;
    sourceUrl?: string;
  }): Promise<string | null> {
    const response = await fetch(`/api/reports/${publicId}/status-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return readError(response, "상태를 기록하지 못했습니다.");
    router.refresh();
    return null;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">이웃과 함께하기</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          지지 표시는 함께 살펴보자는 뜻이며, 제보 내용이 사실이라는 판정이
          아닙니다. 한 사람은 한 번만 집계됩니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void support()}
            disabled={!signedIn || supportBusy || supported}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-45"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <path
                d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-.5V5a1.5 1.5 0 0 1 3 0v5.5m0-.5a1.5 1.5 0 0 1 3 0V14c0 3.3-2.7 6-6 6s-6-2.7-6-6v-3a1.5 1.5 0 0 1 3 0v.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {supported ? "지지함" : "지지하기"}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
              {count}
            </span>
          </button>
          {!signedIn ? (
            <span className="text-[11px] text-muted">
              지지하려면 상단에서 모의 사용자를 선택하세요.
            </span>
          ) : null}
        </div>
        {supportMessage ? (
          <p aria-live="polite" className="mt-2 text-[11px] text-ink-soft">
            {supportMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">추가 근거 보내기</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          사진과 설명을 보내면 운영자가 개인정보가 없는지 확인한 뒤 공개합니다.
          자동 가림은 적용되지 않으므로, 얼굴·번호판이 없는 사진만 올려 주세요.
        </p>
        {signedIn ? (
          <form onSubmit={(event) => void submitEvidence(event)} className="mt-4 space-y-3">
            <div>
              <label htmlFor="evidence-photo" className="text-[11px] font-medium text-ink-soft">
                사진
              </label>
              <input
                id="evidence-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-ink"
              />
            </div>
            <div>
              <label htmlFor="evidence-note" className="text-[11px] font-medium text-ink-soft">
                설명 (5자 이상)
              </label>
              <textarea
                id="evidence-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            <label className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
              <input
                type="checkbox"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              사진에 얼굴·번호판 등 개인정보가 없다는 것을 확인했습니다.
            </label>
            {evidenceError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
                {evidenceError}
              </p>
            ) : null}
            {evidenceMessage ? (
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-strong">
                {evidenceMessage}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={evidenceBusy}
              className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-line-strong disabled:opacity-50"
            >
              {evidenceBusy ? "보내는 중…" : "검토 요청하기"}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-[11px] text-muted">
            추가 근거는 모의 사용자로 로그인한 뒤 보낼 수 있습니다.
          </p>
        )}
      </section>

      {isOwner ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">내 진행 상황 기록</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            작성자 본인의 관찰은 &lsquo;{KIND_LABEL.user_claim}&rsquo;으로만
            표시되며, 공식 확인과 섞이지 않습니다.
          </p>
          <div className="mt-3 space-y-3">
            <select
              aria-label="진행 상황"
              value={claimStatus}
              onChange={(event) => setClaimStatus(event.target.value as StatusValue)}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            >
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
            <textarea
              aria-label="진행 상황 설명"
              value={claimNote}
              onChange={(event) => setClaimNote(event.target.value)}
              rows={2}
              maxLength={600}
              placeholder="예: 아직 보수되지 않았습니다. (5자 이상)"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            {claimMessage ? (
              <p className="text-[11px] text-ink-soft">{claimMessage}</p>
            ) : null}
            <button
              type="button"
              onClick={() =>
                void (async () => {
                  const error = await postStatus({
                    kind: "user_claim",
                    status: claimStatus,
                    note: claimNote,
                  });
                  setClaimMessage(error ?? "기록했습니다. 공식 확인과는 별도로 표시됩니다.");
                  if (!error) setClaimNote("");
                })()
              }
              className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-line-strong"
            >
              시민 주장으로 기록
            </button>
          </div>
        </section>
      ) : null}

      {isModerator ? (
        <section className="rounded-2xl border border-warn/30 bg-warn-soft/40 p-5">
          <h2 className="text-sm font-semibold text-ink">운영자: 공식 상태 기록</h2>
          <p className="mt-2 text-xs leading-relaxed text-warn">
            공식 상태는 출처 주소가 있어야 기록됩니다. 확인한 사실만 입력하고,
            확인하지 못한 내용은 기록하지 마세요.
          </p>
          <div className="mt-3 space-y-3">
            <select
              aria-label="공식 상태"
              value={officialStatus}
              onChange={(event) => setOfficialStatus(event.target.value as StatusValue)}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            >
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
            <input
              aria-label="공식 상태 출처"
              value={officialSource}
              onChange={(event) => setOfficialSource(event.target.value)}
              placeholder="https:// 로 시작하는 출처 주소"
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            />
            <textarea
              aria-label="공식 상태 설명"
              value={officialNote}
              onChange={(event) => setOfficialNote(event.target.value)}
              rows={2}
              maxLength={600}
              placeholder="공식 답변 요지 (5자 이상)"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            {officialMessage ? (
              <p className="text-[11px] text-ink-soft">{officialMessage}</p>
            ) : null}
            <button
              type="button"
              onClick={() =>
                void (async () => {
                  const error = await postStatus({
                    kind: "official",
                    status: officialStatus,
                    note: officialNote,
                    sourceUrl: officialSource,
                  });
                  setOfficialMessage(error ?? "공식 상태로 기록했습니다.");
                  if (!error) {
                    setOfficialNote("");
                    setOfficialSource("");
                  }
                })()
              }
              className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white transition hover:opacity-90"
            >
              공식 상태 기록
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
