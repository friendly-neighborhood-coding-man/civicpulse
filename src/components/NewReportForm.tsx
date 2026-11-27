"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { AiConfigSummary } from "@/lib/ai/config";
import type { ReportCategoryId } from "@/lib/domain/areas";

type AreaOption = { id: string; label: string };

type Sample = { id: string; path: string; label: string };

const SAMPLES: Sample[] = [
  { id: "sidewalk", path: "/samples/sidewalk.jpg", label: "보도 파손" },
  { id: "streetlight", path: "/samples/streetlight.jpg", label: "가로등 고장" },
  { id: "waste", path: "/samples/waste.jpg", label: "쓰레기 투기" },
];

type Props = {
  areas: AreaOption[];
  categories: ReadonlyArray<{ id: ReportCategoryId; label: string; description: string }>;
  /** Safe provider summary; never contains a key. */
  ai: AiConfigSummary;
};

export default function NewReportForm({ areas, categories, ai }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [category, setCategory] = useState<ReportCategoryId>("sidewalk");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [landmark, setLandmark] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "ai">(null);
  const [liveConsent, setLiveConsent] = useState(false);

  function adoptFile(next: File, sourceSampleId: string | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setSampleId(sourceSampleId);
    setError(null);
  }

  async function chooseSample(sample: Sample) {
    setError(null);
    try {
      const response = await fetch(sample.path);
      if (!response.ok) throw new Error("sample fetch failed");
      const blob = await response.blob();
      adoptFile(
        new File([blob], `sample-${sample.id}.jpg`, { type: "image/jpeg" }),
        sample.id,
      );
    } catch {
      setError("샘플 사진을 불러오지 못했습니다. 직접 사진을 선택해 주세요.");
    }
  }

  /** Create the private draft. AI is never part of this step. */
  async function createDraft(): Promise<{ publicId: string } | null> {
    setError(null);
    if (!file) {
      setError("사진을 첨부해 주세요.");
      return null;
    }
    if (description.trim().length < 10) {
      setError("설명은 10자 이상 입력해 주세요.");
      return null;
    }

    const form = new FormData();
    form.set("photo", file, file.name);
    form.set("description", description);
    form.set("category", category);
    form.set("areaId", areaId);
    form.set("landmark", landmark);

    const response = await fetch("/api/reports", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as
      | {
          ok: boolean;
          data?: { report: { publicId: string } };
          error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
        }
      | null;

    if (!response.ok || !body?.ok || !body.data) {
      const issue = body?.error?.details?.issues?.[0]?.message;
      setError(issue ?? body?.error?.message ?? "초안을 만들지 못했습니다.");
      return null;
    }
    return body.data.report;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("draft");
    try {
      const created = await createDraft();
      if (created) router.push(`/reports/${created.publicId}`);
    } catch {
      setError("네트워크 오류로 초안을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Create the draft first, then ask for one analysis. A failed analysis never
   * costs the citizen the draft: they land on it with an explanation and can
   * retry, edit, or publish without AI.
   */
  async function submitWithAi() {
    if (ai.mode === "live" && !liveConsent) {
      setError("사진과 설명을 외부 AI 서비스로 전송하려면 동의가 필요합니다.");
      return;
    }
    setBusy("ai");
    let created: { publicId: string } | null = null;
    let analysed = false;
    try {
      created = await createDraft();
      if (!created) return;
      const response = await fetch(`/api/reports/${created.publicId}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent: liveConsent, clarificationAnswer: null }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      analysed = response.ok && body?.ok === true;
    } catch {
      // Navigate anyway when the draft exists; explain when it does not.
      analysed = false;
      if (!created) setError("네트워크 오류로 초안을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
    if (created) {
      router.push(`/reports/${created.publicId}${analysed ? "?ai=done" : "?ai=failed"}`);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="card p-6">
        <legend className="sr-only">1. 사진</legend>
        <h2 className="text-sm font-semibold text-ink">1. 사진</h2>
        <p className="mt-1 text-xs text-muted">
          사진은 비공개로 저장되며, 공개 여부는 다음 단계에서 직접 결정합니다.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label
              htmlFor="photo"
              className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 text-sm font-medium text-ink transition hover:border-accent"
            >
              내 사진 선택
            </label>
            <input
              ref={fileInput}
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) adoptFile(selected, null);
              }}
            />
            <p className="mt-2 truncate text-xs text-muted">
              {file && !sampleId ? file.name : "JPEG · PNG · WebP, 최대 8MB"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted">또는 합성 샘플 사용</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => void chooseSample(sample)}
                  aria-pressed={sampleId === sample.id}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    sampleId === sample.id
                      ? "border-accent bg-accent-soft text-accent-strong"
                      : "border-line bg-surface text-ink-soft hover:border-line-strong",
                  ].join(" ")}
                >
                  {sample.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              샘플은 실제 장소가 아닌 합성 이미지입니다.
            </p>
          </div>
        </div>

        {previewUrl ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface-muted">
            {/* Blob preview: next/image cannot optimise a client-side object URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="업로드할 사진 미리보기"
              className="max-h-72 w-full object-cover"
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="card p-6">
        <legend className="sr-only">2. 위치</legend>
        <h2 className="text-sm font-semibold text-ink">2. 위치</h2>
        <p className="mt-1 text-xs text-muted">
          구역 단위로만 저장합니다. 정확한 좌표는 공개 화면에 사용하지 않습니다.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="areaId" className="text-xs font-medium text-muted">
              구역
            </label>
            <select
              id="areaId"
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            >
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="landmark" className="text-xs font-medium text-muted">
              주변 지형지물 (선택)
            </label>
            <input
              id="landmark"
              value={landmark}
              maxLength={80}
              onChange={(event) => setLandmark(event.target.value)}
              placeholder="예: OO초등학교 후문 앞"
              className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="card p-6">
        <legend className="sr-only">3. 설명</legend>
        <h2 className="text-sm font-semibold text-ink">3. 설명</h2>
        <div className="mt-3">
          <label htmlFor="category" className="text-xs font-medium text-muted">
            제보 유형
          </label>
          <select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ReportCategoryId)}
            className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink sm:max-w-sm"
          >
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {item.description}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="description" className="text-xs font-medium text-muted">
            무엇이 문제인가요?
          </label>
          <textarea
            id="description"
            value={description}
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="예: 보도 블록이 들떠 있어서 유모차나 자전거가 지나가기 위험합니다. 비가 오면 물이 고입니다."
            className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted/70"
          />
          <p className="mt-1 text-right text-[11px] text-muted" aria-live="polite">
            {description.length} / 2000
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-xs leading-relaxed text-ink-soft">
          <p className="font-medium text-ink">
            {ai.mode === "live"
              ? "AI로 정리하기를 누르면 사진과 설명이 외부 AI 서비스로 전송됩니다."
              : "지금은 시뮬레이션 모드이며 사진은 외부로 전송되지 않습니다."}
          </p>
          <p className="mt-1">
            {ai.mode === "live"
              ? `메타데이터를 제거하고 줄인 사진 사본만 ${ai.provider ?? "외부 AI 서비스"}${ai.model ? ` (${ai.model})` : ""}에 보냅니다. 원본 파일과 정확한 좌표는 보내지 않습니다.`
              : "실제 언어 모델을 호출하지 않고 규칙 기반 초안을 만듭니다. 합성 샘플 사진에 한해 미리 작성된 관찰을 보여줍니다."}
          </p>
          <p className="mt-1">
            AI는 참고용이며 법적 판단이 아닙니다. 결과는 저장 전에 직접
            수정할 수 있고, 공개·접수는 별도 단계에서 본인이 결정합니다.
          </p>
          {ai.mode === "live" ? (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-ink-soft">
              <input
                type="checkbox"
                checked={liveConsent}
                onChange={(event) => setLiveConsent(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                사진과 설명을 외부 AI 서비스로 전송하는 것에 동의합니다. (선택)
                동의하지 않으면 AI 없이 초안을 만들 수 있습니다.
              </span>
            </label>
          ) : null}
          {ai.mode === "live" && !ai.configured ? (
            <p className="mt-2 text-[11px] text-danger">
              서버에 AI API 키가 없어 실제 분석은 실행되지 않고 대체 초안이
              만들어집니다.
            </p>
          ) : null}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy !== null}
          className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:border-line-strong disabled:opacity-60"
        >
          {busy === "draft" ? "초안 만드는 중…" : "비공개 초안 만들기"}
        </button>
        <button
          type="button"
          onClick={() => void submitWithAi()}
          disabled={busy !== null}
          className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {busy === "ai" ? "AI가 사진을 보고 정리하는 중…" : "AI로 제보 정리하기"}
        </button>
        <span className="text-xs text-muted">
          어느 쪽이든 비공개 초안으로 저장되며, 공개·접수는 별도로 직접
          결정합니다.
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        AI를 건너뛰어도 모든 기능을 그대로 사용할 수 있습니다.
      </p>
    </form>
  );
}
