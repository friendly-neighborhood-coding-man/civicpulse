"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
};

export default function NewReportForm({ areas, categories }: Props) {
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
  const [submitting, setSubmitting] = useState(false);

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("사진을 첨부해 주세요.");
      return;
    }
    if (description.trim().length < 10) {
      setError("설명은 10자 이상 입력해 주세요.");
      return;
    }

    const form = new FormData();
    form.set("photo", file, file.name);
    form.set("description", description);
    form.set("category", category);
    form.set("areaId", areaId);
    form.set("landmark", landmark);

    setSubmitting(true);
    try {
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
        return;
      }
      router.push(`/reports/${body.data.report.publicId}`);
    } catch {
      setError("네트워크 오류로 초안을 만들지 못했습니다.");
    } finally {
      setSubmitting(false);
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
          다음 단계에서 규칙 기반 보조 초안이 만들어집니다. 기관·연락처·처리
          결과를 새로 만들지 않으며, 제출 전 직접 수정할 수 있습니다.
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
          disabled={submitting}
          className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {submitting ? "초안 만드는 중…" : "비공개 초안 만들기"}
        </button>
        <span className="text-xs text-muted">
          공개되지 않습니다. 다음 단계에서 검토 후 결정합니다.
        </span>
      </div>
    </form>
  );
}
