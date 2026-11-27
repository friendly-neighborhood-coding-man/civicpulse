"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AiConfigSummary } from "@/lib/ai/config";
import type { AnalysisView } from "@/lib/ai/schema";
import { categoryLabel } from "@/lib/domain/areas";

type Props = {
  publicId: string;
  initial: AnalysisView | null;
  ai: AiConfigSummary;
  notice: string | null;
};

type ApiBody = {
  ok: boolean;
  data?: { analysis: AnalysisView; reused?: boolean };
  error?: { message?: string; details?: { reason?: string } };
};

function ProvenanceBadge({ view }: { view: AnalysisView }) {
  const { provenance } = view;
  if (view.status === "fallback") {
    return (
      <span className="rounded-full border border-danger/30 bg-danger-soft px-2 py-1 text-[10px] font-semibold text-danger">
        AI 사용 불가 · 대체 초안
      </span>
    );
  }
  if (provenance.mode === "live") {
    return (
      <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent-strong">
        실제 AI 분석
      </span>
    );
  }
  return (
    <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-1 text-[10px] font-semibold text-warn">
      시뮬레이션 · 모델 미호출
    </span>
  );
}

function ProvenanceText({ view }: { view: AnalysisView }) {
  const { provenance } = view;
  if (view.status === "fallback") {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger-soft/50 px-4 py-3 text-xs leading-relaxed text-ink-soft">
        <p className="font-medium text-danger">AI 분석을 사용하지 못했습니다.</p>
        <p className="mt-1">{view.failure?.message}</p>
        <p className="mt-1">
          아래 초안은 시민이 쓴 설명만으로 만든 대체 초안입니다. 사진에서 확인된
          내용은 포함되지 않았습니다.
        </p>
      </div>
    );
  }
  if (provenance.mode === "live") {
    return (
      <p className="text-xs leading-relaxed text-ink-soft">
        {provenance.provider ?? "외부 AI 서비스"}
        {provenance.model ? ` · ${provenance.model}` : ""}에 사진과 설명을 보내
        받은 결과입니다. 이 서비스의 보관·학습 정책은 운영자가 확인해야 하며,
        CivicPulse는 특정 보관 기간을 보장하지 않습니다.
      </p>
    );
  }
  return (
    <div className="text-xs leading-relaxed text-ink-soft">
      <p>
        실제 언어 모델을 호출하지 않았습니다. 서버는 시뮬레이션 모드이며, 사진은
        어디로도 전송되지 않았습니다.
      </p>
      {provenance.simulatedObservations ? (
        <p className="mt-1">
          관찰 문장은 함께 제공되는 합성 샘플 사진에 대해 사람이 미리 작성해 둔
          것입니다.
        </p>
      ) : (
        <p className="mt-1">
          이 사진은 시뮬레이션에서 분석하지 않았으므로 사진에 대한 관찰은
          비어 있습니다.
        </p>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AnalysisPanel({ publicId, initial, ai, notice }: Props) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisView | null>(initial);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "needsOverwrite" | "applied">("idle");

  const needsConsent = ai.mode === "live" && ai.configured && !analysis;

  async function run(options: { refresh?: boolean; withAnswer?: boolean } = {}) {
    setError(null);
    if (needsConsent && !consent) {
      setError("사진과 설명을 외부 AI 서비스로 전송하려면 동의가 필요합니다.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/reports/${publicId}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consent,
          refresh: options.refresh ?? false,
          clarificationAnswer: options.withAnswer ? answer.trim() : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok || !body.data) {
        setError(body?.error?.message ?? "AI 분석을 완료하지 못했습니다.");
        return;
      }
      setAnalysis(body.data.analysis);
      setApplyState("idle");
      if (options.withAnswer) setAnswer("");
    } catch {
      setError("네트워크 오류로 AI 분석을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function apply(overwrite: boolean) {
    if (!analysis) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/reports/${publicId}/analysis/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId: analysis.id, overwrite }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; error?: { message?: string; details?: { reason?: string } } }
        | null;
      if (response.status === 409 && body?.error?.details?.reason === "ALREADY_EDITED") {
        setApplyState("needsOverwrite");
        return;
      }
      if (!response.ok || !body?.ok) {
        setError(body?.error?.message ?? "초안을 적용하지 못했습니다.");
        return;
      }
      setApplyState("applied");
      router.refresh();
    } catch {
      setError("네트워크 오류로 초안을 적용하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const pendingQuestion =
    analysis?.status === "completed" ? analysis.result.clarificationQuestion : null;

  return (
    <section className="card p-6" aria-labelledby="ai-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="ai-heading" className="text-lg font-semibold text-ink">
            AI 관찰과 초안
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            AI는 참고용입니다. 법적 판단도, 공식 확인도 아니며, 개인정보 경고가
            없다고 안전한 사진이라는 뜻은 아닙니다.
          </p>
        </div>
        {analysis ? <ProvenanceBadge view={analysis} /> : null}
      </div>

      {notice ? (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {notice}
        </p>
      ) : null}

      {!analysis ? (
        <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 py-4">
          <p className="text-xs leading-relaxed text-ink-soft">
            {ai.mode === "live"
              ? "사진과 설명을 외부 AI 서비스로 보내 관찰과 초안을 만들 수 있습니다. 원본 파일이나 정확한 좌표는 보내지 않고, 메타데이터를 제거한 작은 사본만 사용합니다."
              : "지금은 시뮬레이션 모드입니다. 실제 모델을 호출하지 않고, 합성 샘플 사진에 대해서만 미리 작성된 관찰을 보여줍니다."}
          </p>
          {ai.mode === "live" && !ai.configured ? (
            <p className="mt-2 text-xs leading-relaxed text-danger">
              서버에 AI API 키가 없어 실제 분석은 실행되지 않습니다. 분석을
              누르면 규칙 기반 대체 초안이 만들어집니다.
            </p>
          ) : null}
          {needsConsent ? (
            <label className="mt-3 flex items-start gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5"
              />
              사진과 설명이 외부 AI 서비스로 전송되는 것에 동의합니다. 이 단계는
              선택 사항이며, 동의하지 않아도 초안을 직접 작성할 수 있습니다.
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="mt-3 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "분석 중…" : "AI로 정리하기"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <ProvenanceText view={analysis} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
              <p className="text-[11px] text-muted">AI가 제안한 유형(법적 분류 아님)</p>
              <p className="mt-0.5 text-sm font-medium text-ink">
                {categoryLabel(analysis.result.category)} · 확신도{" "}
                {analysis.result.categoryConfidence === "high"
                  ? "높음"
                  : analysis.result.categoryConfidence === "medium"
                    ? "보통"
                    : "낮음"}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
              <p className="text-[11px] text-muted">사진 품질 / 설명과의 일치</p>
              <p className="mt-0.5 text-sm font-medium text-ink">
                {analysis.result.imageQuality.clarity === "clear"
                  ? "선명함"
                  : analysis.result.imageQuality.clarity === "limited"
                    ? "제한적"
                    : "사용 어려움"}
                {" · "}
                {analysis.result.imageMatchesDescription === "consistent"
                  ? "일치"
                  : analysis.result.imageMatchesDescription === "partly"
                    ? "부분 일치"
                    : analysis.result.imageMatchesDescription === "inconsistent"
                      ? "불일치"
                      : "판단 어려움"}
              </p>
              {analysis.result.imageQuality.note ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {analysis.result.imageQuality.note}
                </p>
              ) : null}
            </div>
          </div>

          <List title="사진에서 직접 보이는 것" items={analysis.result.observations} />
          <List title="AI의 해석(단정 아님)" items={analysis.result.interpretations} />
          <List title="안전 우려(가능성)" items={analysis.result.safetyConcerns} />
          <List title="확인되지 않은 것" items={analysis.result.uncertainties} />
          <List title="개인정보 검토가 필요한 부분" items={analysis.result.privacyWarnings} />
          <List title="추가로 있으면 좋은 근거" items={analysis.result.missingEvidence} />
          <List title="다음 단계" items={analysis.result.nextSteps} />

          {analysis.userFacts.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold text-ink">내가 쓴 설명(서버가 그대로 옮김)</h3>
              <blockquote className="mt-2 rounded-xl border border-line bg-surface-muted px-4 py-3 text-xs leading-relaxed text-ink-soft">
                {analysis.userFacts.map((fact) => (
                  <p key={fact}>{fact}</p>
                ))}
              </blockquote>
            </div>
          ) : null}

          {analysis.guardrail.removedItems > 0 ? (
            <p className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-[11px] text-muted">
              확인되지 않은 연락처·법률 표현 등 {analysis.guardrail.removedItems}개
              항목을 자동으로 제외했습니다.
            </p>
          ) : null}

          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="text-xs font-semibold text-ink">AI 초안 미리보기</h3>
            <p className="mt-1 text-[11px] text-muted">
              적용한 뒤 편집기에서 자유롭게 고칠 수 있습니다. 적용 전에는 현재
              본문이 바뀌지 않습니다.
            </p>
            <dl className="mt-3 space-y-2 text-xs leading-relaxed">
              <div>
                <dt className="text-muted">제목</dt>
                <dd className="font-medium text-ink">{analysis.result.draft.title}</dd>
              </div>
              <div>
                <dt className="text-muted">현황</dt>
                <dd className="whitespace-pre-line text-ink-soft">{analysis.result.draft.summary}</dd>
              </div>
              {analysis.result.draft.concern ? (
                <div>
                  <dt className="text-muted">우려되는 점</dt>
                  <dd className="whitespace-pre-line text-ink-soft">
                    {analysis.result.draft.concern}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">요청</dt>
                <dd className="whitespace-pre-line text-ink-soft">
                  {analysis.result.draft.requestedAction}
                </dd>
              </div>
            </dl>

            {analysis.status === "completed" ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void apply(false)}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-60"
                >
                  {busy ? "적용 중…" : "이 초안을 편집기에 적용"}
                </button>
                {applyState === "applied" ? (
                  <span className="text-xs text-accent-strong">적용되었습니다. 아래에서 확인하세요.</span>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-muted">
                대체 초안은 적용할 수 없습니다. 현재 초안을 직접 수정해 주세요.
              </p>
            )}

            {applyState === "needsOverwrite" ? (
              <div className="mt-3 rounded-xl bg-warn-soft px-3 py-3 text-xs text-ink-soft">
                <p>
                  이미 직접 수정한 본문이 있습니다. AI 초안으로 덮어쓰면 그 수정이
                  사라집니다.
                </p>
                <button
                  type="button"
                  onClick={() => void apply(true)}
                  disabled={busy}
                  className="mt-2 inline-flex h-9 items-center rounded-full bg-danger px-4 text-xs font-semibold text-white disabled:opacity-60"
                >
                  수정 내용을 지우고 AI 초안 적용
                </button>
              </div>
            ) : null}
          </div>

          {analysis.clarification ? (
            <div className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
              <p className="font-medium text-ink">이전 질문</p>
              <p className="mt-1">{analysis.clarification.question}</p>
              <p className="mt-1 text-muted">답변: {analysis.clarification.answer}</p>
            </div>
          ) : null}

          {pendingQuestion ? (
            <div className="rounded-xl border border-accent/25 bg-accent-soft/50 px-4 py-3">
              <label htmlFor="clarification" className="text-xs font-semibold text-ink">
                한 가지만 더 알려 주세요
              </label>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{pendingQuestion}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="clarification"
                  value={answer}
                  maxLength={200}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="선택 사항입니다"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
                />
                <button
                  type="button"
                  onClick={() => void run({ withAnswer: true })}
                  disabled={busy || answer.trim().length === 0}
                  className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  답변하고 다시 분석
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                답하지 않아도 됩니다. 질문을 건너뛰고 현재 초안을 그대로 쓸 수
                있습니다.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void run({ refresh: true })}
              disabled={busy}
              className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-4 text-xs font-medium text-ink-soft transition hover:border-line-strong disabled:opacity-50"
            >
              {busy ? "분석 중…" : "다시 분석"}
            </button>
            {!needsConsent && ai.mode === "live" ? (
              <label className="flex items-center gap-1.5 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                다시 분석 시 외부 전송에 동의
              </label>
            ) : null}
            <span className="text-[11px] text-muted">
              {analysis.provenance.latencyMs !== null
                ? `분석 ${analysis.provenance.latencyMs}ms`
                : "지연 시간 기록 없음"}
              {analysis.provenance.inputTokens !== null
                ? ` · 입력 ${analysis.provenance.inputTokens} 토큰`
                : ""}
              {analysis.provenance.outputTokens !== null
                ? ` · 출력 ${analysis.provenance.outputTokens} 토큰`
                : ""}
            </span>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
