import sharp from "sharp";

import type { MaskRect } from "../privacy/masks.ts";

export type RedactionResult = {
  data: Buffer;
  width: number;
  height: number;
};

const PUBLIC_MAX_SIDE = 1600;

/**
 * Apply the human-confirmed rectangles to a photo and re-encode it.
 *
 * The output is always a fresh WebP with no metadata, so EXIF/GPS cannot survive
 * publication. Masks are applied at the natural resolution of the working copy
 * (max 1600px), which is also the resolution of the published image — what the
 * citizen previewed is what gets published.
 *
 * LIMITATION: masking is manual/visual. Nothing here detects whether an
 * unmarked face or plate remains; the publish gate therefore requires an
 * explicit human confirmation instead of claiming automatic safety.
 */
export async function applyRedaction(
  input: Buffer,
  masks: ReadonlyArray<MaskRect>,
): Promise<RedactionResult> {
  const base = sharp(input, { failOn: "error" })
    .rotate()
    .resize({
      width: PUBLIC_MAX_SIDE,
      height: PUBLIC_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });

  const { data, info } = await base.webp({ quality: 82 }).toBuffer({
    resolveWithObject: true,
  });
  const width = info.width;
  const height = info.height;

  if (masks.length === 0) return { data, width, height };

  // Everything derived from the *freshly encoded* copy, so mask coordinates and
  // pixels refer to exactly the image that will be published.
  const overlays = await Promise.all(
    masks.map(async (mask) => {
      const left = Math.max(0, Math.min(width - 1, Math.round(mask.x * width)));
      const top = Math.max(0, Math.min(height - 1, Math.round(mask.y * height)));
      const regionWidth = Math.max(1, Math.min(width - left, Math.round(mask.w * width)));
      const regionHeight = Math.max(1, Math.min(height - top, Math.round(mask.h * height)));

      if (mask.mode === "solid") {
        return {
          input: Buffer.from(
            `<svg width="${regionWidth}" height="${regionHeight}" xmlns="http://www.w3.org/2000/svg">` +
              `<rect width="100%" height="100%" fill="#2f3437"/></svg>`,
          ),
          left,
          top,
        };
      }

      const region = await sharp(data)
        .extract({ left, top, width: regionWidth, height: regionHeight })
        .toBuffer();

      const processed =
        mask.mode === "blur"
          ? await sharp(region)
              .blur(Math.min(40, Math.max(6, Math.min(regionWidth, regionHeight) / 5)))
              .toBuffer()
          : await sharp(region)
              .resize(Math.max(1, Math.round(regionWidth / 12)), Math.max(1, Math.round(regionHeight / 12)), {
                fit: "fill",
              })
              .resize(regionWidth, regionHeight, { fit: "fill", kernel: "nearest" })
              .toBuffer();

      return { input: processed, left, top };
    }),
  );

  const output = await sharp(data)
    .composite(overlays)
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return { data: output.data, width: output.info.width, height: output.info.height };
}
