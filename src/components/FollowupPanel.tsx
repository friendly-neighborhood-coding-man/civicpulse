"use client";

import { useCallback, useState } from "react";

import type { FollowupEligibility, FollowupView } from "@/lib/domain/followup";

type Channel = { name: string; operator: string; url: string } | null;

type Payload = {
  eligibility: FollowupEligibility;
  followups: FollowupView[];
  channel: Channel;
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export default function FollowupPanel({
  publicId,
  initial,
}: {
  publicId: string;
  initial: Payload;
}) {
  const [data, setData] = useState<Payload>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A recorded "resolved" is a claim, not verified case resolution. It must be
  // acknowledged explicitly instead of silently blocking the citizen.
  const [resolutionAck, setResolutionAck] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/reports/${publicId}/followups`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "후속 요청 상태를 불러오지 못했습니다.");
        return;
      }
      const body = (await response.json()) as { data: Payload };
      setData(body.data);
    } catch {
      setError("네트워크 오류로 후속 요청 상태를 불러오지 못했습니다.");
    }
  }, [publicId]);

  async function act(action: "create" | "approve" | "discard", followupId?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response =
        action === "create"
          ? await fetch(`/api/reports/${publicId}/followups`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                acknowledgeRecordedResolution: resolutionAck,
              }),
            })
          : await fetch(`/api/followups/${followupId}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action }),
            });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string; details?: { reasons?: string[] } } }
          | null;
        const reasons = body?.error?.details?.reasons?.join(" ");
        setError(reasons ?? body?.error?.message ?? "요청을 처리하지 못했습니다.");
        return;
      }

      setNotice(
        action === "create"
          ? "초안을 만들었습니다. 내용을 읽고 검토해 주세요. 아직 전송되지 않았습니다."
          : action === "approve"
            ? "검토 완료로 표시했습니다. 제출은 확인된 공식 창구에서 직접 해 주세요."
            : "초안을 버렸습니다. 필요한 근거가 쌓이면 다시 만들 수 있습니다.",
      );
      await load();
    } catch {
      setError("네트워크 오류로 요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("초안을 클립보드에 복사했습니다. 공식 창구에서 직접 붙여넣어 제출하세요.");
    } catch {
      setError("클립보드에 복사하지 못했습니다. 직접 선택해 복사해 주세요.");
    }
  }

  const active =
    data?.followups.find((item) => item.status !== "discarded") ?? null;
  const latestDiscarded = data?.followups.find((item) => item.status === "discarded");
  // The resolution gate is the only remaining blocker: the citizen can decide
  // to proceed by acknowledging it. Other blockers need real changes first.
  const onlyResolutionGate =
    data.eligibility.requiresResolutionAcknowledgement &&
    data.eligibility.reasons.length === 1;

  return (
    <section className="card mt-6 p-6" aria-labelledby="followup-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="followup-heading" className="text-lg font-semibold text-ink">
            후속 요청 준비
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            대기 기간과 새 근거가 충분하면 후속 요청 초안을 만듭니다. 초안은
            사람이 읽고 검토한 뒤, 확인된 공식 창구에서 직접 제출합니다.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-muted">
          자동 전송 없음
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p aria-live="polite" className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-strong">
          {notice}
        </p>
      ) : null}

      <>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface-muted/60 px-3 py-2">
              <dt className="text-[11px] text-muted">공개 후 경과</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {data.eligibility.ageDays}일 / 기준 {data.eligibility.waitingDays}일
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/60 px-3 py-2">
              <dt className="text-[11px] text-muted">검토된 추가 근거</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {data.eligibility.approvedEvidenceCount}건
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/60 px-3 py-2">
              <dt className="text-[11px] text-muted">이번 요청의 새 근거</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {data.eligibility.newEvidenceCount}건
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/60 px-3 py-2">
              <dt className="text-[11px] text-muted">재요청 쿨다운</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {data.eligibility.cooldownDays}일
              </dd>
            </div>
          </dl>

          {active ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={
                    active.status === "approved"
                      ? "rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-strong"
                      : "rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn"
                  }
                >
                  {active.status === "approved" ? "검토 완료" : "검토 대기"}
                </span>
                <span className="text-[11px] text-muted">
                  만든 시각 {formatDateTime(active.createdAt)}
                  {active.reviewedAt ? ` · 검토 ${formatDateTime(active.reviewedAt)}` : ""}
                </span>
              </div>

              {active.status === "approved" ? (
                <div className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/60 px-3 py-2 text-[11px] leading-relaxed text-accent-strong">
                  사람 검토를 마쳤습니다. <strong>아직 어떤 기관에도 전송되지
                  않았습니다.</strong> 아래 내용을 확인된 공식 창구에서 직접
                  제출하세요.
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  내용을 읽고 사실과 표현을 고친 뒤 &lsquo;검토 완료&rsquo;를
                  눌러 주세요. 초안을 버리고 새 근거를 기다릴 수도 있습니다.
                </p>
              )}

              <pre className="mt-3 max-h-96 overflow-auto rounded-xl border border-line bg-surface-muted/50 p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-soft">
                {active.text}
              </pre>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {active.status === "draft" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("approve", active.id)}
                      className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                    >
                      검토 완료로 표시
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("discard", active.id)}
                      className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink transition hover:border-line-strong disabled:opacity-50"
                    >
                      초안 버리기
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyText(active.text)}
                  className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink transition hover:border-line-strong"
                >
                  초안 복사
                </button>
                {data.channel ? (
                  <a
                    href={data.channel.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    {data.channel.name}에서 직접 제출 ↗
                  </a>
                ) : (
                  <span className="text-[11px] text-warn">
                    확인된 공식 창구가 없습니다. 직접 확인이 필요합니다.
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                CivicPulse는 이 문서를 전송하거나 접수하지 않습니다. 제출은
                본인이 공식 창구에서 직접 합니다.
              </p>
            </div>
          ) : (
            <div className="mt-5">
              {data.eligibility.eligible ? (
                <div className="rounded-xl border border-line bg-surface-muted/60 p-4">
                  <p className="text-xs leading-relaxed text-ink-soft">
                    조건을 모두 충족했습니다. 초안을 만들면 기록된 공식 상태·시민
                    주장·근거를 정리해 보여줍니다. 초안은 자동 전송되지 않습니다.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act("create")}
                    className="mt-3 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                  >
                    {busy ? "만드는 중…" : "후속 요청 초안 만들기"}
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted/60 p-4">
                  <p className="text-xs font-semibold text-ink">
                    아직 초안을 만들 수 없습니다
                  </p>
                  <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted">
                    {data.eligibility.reasons.map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {data.eligibility.requiresResolutionAcknowledgement ? (
                    <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
                      <input
                        type="checkbox"
                        checked={resolutionAck}
                        onChange={(event) => setResolutionAck(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                      />
                      <span>
                        운영자가 &lsquo;해결됨&rsquo;으로 기록한 것은 확인했습니다.
                        이는 공식 포털 도메인을 인용한 기록일 뿐 사건 해결이
                        확인된 것은 아니며, 재발·미해결 상태를 직접 확인했으므로
                        후속 요청을 준비하겠습니다.
                      </span>
                    </label>
                  ) : null}
                  {onlyResolutionGate ? (
                    <button
                      type="button"
                      disabled={busy || !resolutionAck}
                      onClick={() => void act("create")}
                      className="mt-3 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                    >
                      {busy ? "만드는 중…" : "후속 요청 초안 만들기"}
                    </button>
                  ) : null}
                  {latestDiscarded ? (
                    <p className="mt-2 text-[11px] text-muted">
                      이전 초안은 {formatDateTime(latestDiscarded.createdAt)}에
                      버렸습니다.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </>
    </section>
  );
}
