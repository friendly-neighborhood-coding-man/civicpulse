"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { PublicTextReview } from "@/lib/domain/publication";
import {
  MAX_MASKS,
  MODE_LABEL,
  MASK_MODES,
  boxesToMasks,
  rectFromPoints,
  type MaskMode,
  type MaskRect,
} from "@/lib/privacy/masks";
import { TEXT_FINDING_LABEL } from "@/lib/privacy/text";

type Props = {
  publicId: string;
  photoUrl: string;
  photoWidth: number;
  photoHeight: number;
  /** Server-computed review of the exact text that will be published. */
  textReview: PublicTextReview;
};

type FaceDetectorLike = {
  detect: (image: HTMLImageElement) => Promise<
    Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>
  >;
};

const MODE_HINT: Record<MaskMode, string> = {
  pixelate: "작은 블록으로 뭉갭니다",
  blur: "흐리게 처리합니다",
  solid: "단색으로 완전히 덮습니다",
};

export default function PrivacyPublishFlow({
  publicId,
  photoUrl,
  photoWidth,
  photoHeight,
  textReview,
}: Props) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Solid is the safest default: pixellation can leave a uniform-colour area
  // looking unchanged, which is exactly the false-negative a human must catch.
  const [mode, setMode] = useState<MaskMode>("solid");
  const [masks, setMasks] = useState<MaskRect[]>([]);
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [ack, setAck] = useState({
    privacyReviewed: false,
    consent: false,
    noSensitiveContent: false,
  });
  // Text acknowledgements are bound to the exact content the server showed. When
  // an edit changes the token, these no longer match and the boxes un-check.
  const [reviewedTextToken, setReviewedTextToken] = useState<string | null>(null);
  const [reviewedFindingsToken, setReviewedFindingsToken] = useState<string | null>(
    null,
  );
  const textReviewed = reviewedTextToken === textReview.token;
  const findingsReviewed = reviewedFindingsToken === textReview.token;

  const signature = JSON.stringify(masks);
  const previewIsStale = Boolean(previewUrl) && previewSignature !== signature;

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function addMask(mask: MaskRect | null) {
    if (!mask) return;
    if (masks.length >= MAX_MASKS) {
      setError(`가림 영역은 최대 ${MAX_MASKS}개까지 지정할 수 있습니다.`);
      return;
    }
    setError(null);
    setMasks((current) => [...current, mask]);
  }

  async function runAutoDetect() {
    setAutoMessage(null);
    const detectorCtor = (
      window as unknown as { FaceDetector?: new (options?: unknown) => FaceDetectorLike }
    ).FaceDetector;
    if (typeof detectorCtor !== "function") {
      setAutoMessage(
        "이 브라우저에서는 자동 얼굴 감지를 사용할 수 없습니다. 얼굴·번호판을 직접 확인해 사각형으로 가려 주세요.",
      );
      return;
    }
    const image = imageRef.current;
    if (!image || !image.naturalWidth) {
      setAutoMessage("사진을 먼저 불러와 주세요.");
      return;
    }
    try {
      const detector = new detectorCtor({ maxDetectedFaces: 10, fastMode: true });
      const faces = await detector.detect(image);
      const mapped = boxesToMasks(
        faces.map((face) => ({
          x: face.boundingBox.x,
          y: face.boundingBox.y,
          width: face.boundingBox.width,
          height: face.boundingBox.height,
        })),
        image.naturalWidth,
        image.naturalHeight,
      );
      if (mapped.length === 0) {
        setAutoMessage(
          "자동 감지에서 얼굴을 찾지 못했습니다. 자동 감지는 놓칠 수 있으므로 직접 확인해 주세요. 번호판은 자동 감지 대상이 아닙니다.",
        );
        return;
      }
      setMasks((current) => [...current, ...mapped].slice(0, MAX_MASKS));
      setAutoMessage(
        `${mapped.length}개 영역을 후보로 추가했습니다. 자동 감지는 보조 수단입니다. 반드시 직접 확인하고 수정하세요.`,
      );
    } catch {
      setAutoMessage("자동 감지에 실패했습니다. 직접 가림을 표시해 주세요.");
    }
  }

  async function renderPreview() {
    setError(null);
    setRendering(true);
    try {
      const response = await fetch(`/api/reports/${publicId}/redaction/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ masks }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string; details?: { issues?: Array<{ message: string }> } } }
          | null;
        setError(
          body?.error?.details?.issues?.[0]?.message ??
            body?.error?.message ??
            "미리보기를 만들지 못했습니다.",
        );
        return;
      }
      const blob = await response.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewSignature(signature);
    } catch {
      setError("네트워크 오류로 미리보기를 만들지 못했습니다.");
    } finally {
      setRendering(false);
    }
  }

  async function publish() {
    setError(null);
    if (!previewUrl || previewIsStale) {
      setError("현재 가림 설정으로 미리보기를 먼저 만들어 주세요.");
      return;
    }
    setPublishing(true);
    try {
      const response = await fetch(`/api/reports/${publicId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          masks,
          ack: {
            ...ack,
            textReviewed,
            textFindingsReviewed: findingsReviewed,
            textToken: textReview.token,
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error?.message ?? "공개하지 못했습니다.");
        return;
      }
      // Re-render from the server so the published state comes from the database.
      router.refresh();
    } catch {
      setError("네트워크 오류로 공개하지 못했습니다.");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish =
    ack.privacyReviewed &&
    ack.consent &&
    (masks.length > 0 || ack.noSensitiveContent) &&
    textReviewed &&
    (textReview.findings.length === 0 || findingsReviewed) &&
    Boolean(previewUrl) &&
    !previewIsStale &&
    !publishing;

  return (
    <section className="card p-6" aria-labelledby="privacy-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="privacy-heading" className="text-lg font-semibold text-ink">
            공개 전 개인정보 검토
          </h2>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted">
            사진에서 얼굴·번호판 등 개인정보를 직접 확인하고 가려 주세요. 자동
            처리는 보조 수단이며, 사람의 확인 없이는 공개할 수 없습니다.
          </p>
        </div>
        <span className="rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">
          수동 확인 필수
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {MASK_MODES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              mode === option
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-line bg-surface text-ink-soft hover:border-line-strong",
            ].join(" ")}
            title={MODE_HINT[option]}
          >
            {MODE_LABEL[option]}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            addMask({
              x: 0.35,
              y: 0.35,
              w: 0.3,
              h: 0.3,
              mode,
              source: "manual",
            })
          }
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-line-strong"
        >
          가운데 영역 추가
        </button>
        <button
          type="button"
          onClick={() => void runAutoDetect()}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-line-strong"
        >
          실험적 얼굴 자동 감지
        </button>
        {masks.length > 0 ? (
          <button
            type="button"
            onClick={() => setMasks([])}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-line-strong hover:text-ink"
          >
            전체 지우기
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        사진 위를 드래그해 가릴 영역을 그리세요. 터치도 지원합니다. 가림 표시는
        공개하기 전까지 저장되지 않습니다. 모자이크·블러는 단색 영역에서 효과가
        거의 없을 수 있으니, 확실히 가리려면 &lsquo;가리기&rsquo;를 사용하세요.
      </p>

      {autoMessage ? (
        <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          {autoMessage}
        </p>
      ) : null}

      {/*
        The drawing surface must hug the image exactly: masks are stored as
        fractions of the image, so a letterboxed container would misalign them.
      */}
      <div className="mt-4 flex justify-center overflow-hidden rounded-xl border border-line bg-surface-muted">
        <div
          ref={frameRef}
          className="relative touch-none select-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = pointFromEvent(event);
            if (point) setDrag({ start: point, current: point });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            const point = pointFromEvent(event);
            if (point) setDrag({ start: drag.start, current: point });
          }}
          onPointerUp={() => {
            if (drag) addMask(rectFromPoints(drag.start, drag.current, mode));
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
          role="group"
          aria-label="사진 위에 가림 영역을 그리는 영역"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private route */}
          <img
            ref={imageRef}
            src={photoUrl}
            width={photoWidth}
            height={photoHeight}
            alt="공개 전 사진 (가림 영역 편집)"
            className="block max-h-[520px] w-auto max-w-full"
            draggable={false}
          />

          {masks.map((mask, index) => (
            <div
              key={`${mask.x}-${mask.y}-${index}`}
              className="absolute border border-white/80 bg-ink/70"
              style={{
                left: `${mask.x * 100}%`,
                top: `${mask.y * 100}%`,
                width: `${mask.w * 100}%`,
                height: `${mask.h * 100}%`,
              }}
            >
              <span className="absolute -top-0.5 left-0.5 rounded bg-white/90 px-1 text-[9px] font-semibold text-ink">
                {MODE_LABEL[mask.mode]}
                {mask.source === "auto" ? " · 자동" : ""}
              </span>
              <button
                type="button"
                aria-label={`${index + 1}번 가림 영역 삭제`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setMasks((current) => current.filter((_, i) => i !== index));
                  setDrag(null);
                }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-ink shadow"
              >
                ×
              </button>
            </div>
          ))}

          {drag ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/20"
              style={{
                left: `${Math.min(drag.start.x, drag.current.x) * 100}%`,
                top: `${Math.min(drag.start.y, drag.current.y) * 100}%`,
                width: `${Math.abs(drag.current.x - drag.start.x) * 100}%`,
                height: `${Math.abs(drag.current.y - drag.start.y) * 100}%`,
              }}
            />
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted" aria-live="polite">
        가림 영역 {masks.length}곳 ·{" "}
        {masks.length === 0
          ? "아직 지정하지 않았습니다."
          : "공개되는 사진에는 이 영역만 가려집니다."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void renderPreview()}
          disabled={rendering}
          className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-line-strong disabled:opacity-50"
        >
          {rendering ? "미리보기 만드는 중…" : "서버 미리보기 만들기"}
        </button>
        <span className="text-[11px] text-muted">
          실제로 공개될 이미지를 서버에서 생성해 보여줍니다.
        </span>
      </div>

      {previewUrl ? (
        <figure className={previewIsStale ? "mt-4 opacity-60" : "mt-4"}>
          <figcaption className="text-[11px] font-medium text-muted">
            공개될 이미지 (서버 생성){previewIsStale ? " · 가림 설정이 바뀌었습니다. 다시 만들어 주세요." : ""}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={previewUrl}
            alt="공개될 가림 처리된 사진 미리보기"
            className="mt-1 max-h-[420px] w-full rounded-xl border border-line object-contain"
          />
        </figure>
      ) : null}

      <section
        aria-labelledby="public-text-heading"
        className="mt-6 rounded-2xl border border-line bg-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="public-text-heading" className="text-sm font-semibold text-ink">
            공개될 제목과 본문
          </h3>
          <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[10px] text-muted">
            사진과 별도 검토
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          아래 글이 초안에서 그대로 복사되어 누구나 볼 수 있게 됩니다. 이름·연락처·상세
          주소가 들어 있지 않은지 직접 읽어 주세요.
        </p>
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface-muted/60 p-3">
          <p className="text-sm font-semibold text-ink">
            {textReview.title || "제목 없음"}
          </p>
          <p className="text-xs leading-relaxed whitespace-pre-line text-ink-soft">
            {textReview.description}
          </p>
          <p className="text-[11px] text-muted">위치 표시: 구역 단위</p>
        </div>

        {textReview.findings.length > 0 ? (
          <div className="mt-3 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2">
            <p className="text-[11px] font-semibold text-warn">
              개인정보로 보일 수 있는 표현 {textReview.findings.length}곳을 찾았습니다.
            </p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-warn">
              {textReview.findings.map((finding, index) => (
                <li key={`${finding.field}-${finding.start}-${index}`}>
                  {TEXT_FINDING_LABEL[finding.kind]} · {finding.preview} ·{" "}
                  {finding.field === "title" ? "제목" : "본문"}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-warn">
              고치려면 위 초안 편집에서 본문을 수정하고 저장한 뒤 다시 확인하세요.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            정해진 형식(전화번호·이메일 등)으로 찾을 수 있는 항목은 없었습니다. 발견되지
            않았다는 것이 개인정보가 없다는 뜻은 아닙니다.
          </p>
        )}

        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          {textReview.limitation}
        </p>

        <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink-soft">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={textReviewed}
              onChange={(event) =>
                setReviewedTextToken(event.target.checked ? textReview.token : null)
              }
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
            />
            공개될 제목과 본문을 직접 읽었습니다.
          </label>
          {textReview.findings.length > 0 ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={findingsReviewed}
                onChange={(event) =>
                  setReviewedFindingsToken(
                    event.target.checked ? textReview.token : null,
                  )
                }
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              표시된 개인정보 의심 항목을 확인했고, 공개해도 되는 내용입니다.
            </label>
          ) : null}
        </div>
      </section>

      <fieldset className="mt-6 rounded-2xl border border-line bg-surface-muted/60 p-4">
        <legend className="sr-only">공개 동의</legend>
        <h3 className="text-sm font-semibold text-ink">공개 확인</h3>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-ink-soft">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={ack.privacyReviewed}
              onChange={(event) =>
                setAck((current) => ({ ...current, privacyReviewed: event.target.checked }))
              }
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
            />
            사진에서 얼굴·번호판 등 개인정보를 직접 확인했고, 필요한 부분을
            가렸습니다.
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={ack.consent}
              onChange={(event) =>
                setAck((current) => ({ ...current, consent: event.target.checked }))
              }
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
            />
            이 제보를 공개하는 데 동의합니다. 위치는 구역 단위로만 표시됩니다.
          </label>
          {masks.length === 0 ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={ack.noSensitiveContent}
                onChange={(event) =>
                  setAck((current) => ({
                    ...current,
                    noSensitiveContent: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              사진에 가릴 얼굴·번호판 등 개인정보가 없다는 것을 확인했습니다.
            </label>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void publish()}
            disabled={!canPublish}
            className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-40"
          >
            {publishing ? "공개 처리 중…" : "가림 처리 후 공개"}
          </button>
          <span className="text-[11px] text-muted">
            공개해도 어떤 기관에도 자동으로 전송되지 않습니다.
          </span>
        </div>
      </fieldset>
    </section>
  );
}
