import { z } from "zod";

export const MASK_MODES = ["pixelate", "blur", "solid"] as const;
export type MaskMode = (typeof MASK_MODES)[number];

export const MAX_MASKS = 40;
/** A mask smaller than this fraction of the photo is almost certainly a mis-drag. */
export const MIN_MASK_SIDE = 0.02;

export type MaskRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: MaskMode;
  source: "manual" | "auto";
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export const maskSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    w: z.number().finite().min(MIN_MASK_SIDE).max(1),
    h: z.number().finite().min(MIN_MASK_SIDE).max(1),
    mode: z.enum(MASK_MODES),
    source: z.enum(["manual", "auto"]).default("manual"),
  })
  .refine((mask) => mask.x + mask.w <= 1.0001 && mask.y + mask.h <= 1.0001, {
    message: "가림 영역이 사진 범위를 벗어났습니다.",
  });

export const masksSchema = z
  .array(maskSchema)
  .max(MAX_MASKS, `가림 영역은 최대 ${MAX_MASKS}개까지 지정할 수 있습니다.`);

/** Normalise a drag between two points into a clamped, rounded rectangle. */
export function rectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  mode: MaskMode,
  source: MaskRect["source"] = "manual",
): MaskRect | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  if (w < MIN_MASK_SIDE || h < MIN_MASK_SIDE) return null;
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));
  return {
    x: round(clampedX),
    y: round(clampedY),
    w: round(Math.min(w, 1 - clampedX)),
    h: round(Math.min(h, 1 - clampedY)),
    mode,
    source,
  };
}

/**
 * Convert detector bounding boxes (pixels) into padded, normalised masks.
 *
 * Automatic detection is a *hint* only: the UI asks the human to review and
 * correct every rectangle, and the publish gate never treats detection as
 * sufficient proof that nothing sensitive remains.
 */
export function boxesToMasks(
  boxes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
  imageWidth: number,
  imageHeight: number,
  padding = 0.08,
): MaskRect[] {
  if (imageWidth <= 0 || imageHeight <= 0) return [];
  const masks: MaskRect[] = [];
  for (const box of boxes) {
    if (box.width <= 0 || box.height <= 0) continue;
    const x = box.x / imageWidth;
    const y = box.y / imageHeight;
    const w = box.width / imageWidth;
    const h = box.height / imageHeight;
    const padX = w * padding;
    const padY = h * padding;
    const left = Math.max(0, x - padX);
    const top = Math.max(0, y - padY);
    const right = Math.min(1, x + w + padX);
    const bottom = Math.min(1, y + h + padY);
    if (right - left < MIN_MASK_SIDE || bottom - top < MIN_MASK_SIDE) continue;
    masks.push({
      x: round(left),
      y: round(top),
      w: round(right - left),
      h: round(bottom - top),
      mode: "pixelate",
      source: "auto",
    });
  }
  return masks.slice(0, MAX_MASKS);
}

export const MODE_LABEL: Record<MaskMode, string> = {
  pixelate: "모자이크",
  blur: "블러",
  solid: "가리기",
};
