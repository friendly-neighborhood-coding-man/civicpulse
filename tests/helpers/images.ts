import sharp from "sharp";

import type { ProcessedImage } from "@/lib/services/image";

/**
 * A real 400×300 JPEG with a red square in the middle, plus the WebP working
 * copy the intake pipeline would produce. Used to assert that redaction actually
 * changes the pixels it claims to change.
 */
export const TEST_IMAGE = {
  width: 400,
  height: 300,
  square: { left: 100, top: 100, width: 80, height: 80 },
};

export async function makeTestImage(): Promise<ProcessedImage> {
  const canvas = await sharp({
    create: { width: TEST_IMAGE.width, height: TEST_IMAGE.height, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const square = await sharp({
    create: { width: TEST_IMAGE.square.width, height: TEST_IMAGE.square.height, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();

  const original = await sharp(canvas)
    .composite([{ input: square, left: TEST_IMAGE.square.left, top: TEST_IMAGE.square.top }])
    .jpeg({ quality: 95 })
    .toBuffer();

  const working = await sharp(original).webp({ quality: 90 }).toBuffer();
  const meta = await sharp(working).metadata();

  return {
    format: "jpeg",
    mime: "image/jpeg",
    original,
    working,
    width: TEST_IMAGE.width,
    height: TEST_IMAGE.height,
    workingWidth: meta.width ?? TEST_IMAGE.width,
    workingHeight: meta.height ?? TEST_IMAGE.height,
    exifPresent: false,
  };
}

/**
 * A textured region for testing pixelate/blur.
 *
 * Pixelation of a *uniform* colour block legitimately keeps that colour, so a
 * single flat square cannot demonstrate pixellation. Alternating stripes make
 * block averaging visible, which is what the mode is supposed to do.
 */
export async function makeStripedTestImage(): Promise<{
  working: Buffer;
  x: number;
  y: number;
}> {
  const canvas = await sharp({
    create: { width: TEST_IMAGE.width, height: TEST_IMAGE.height, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const stripes = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
      ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 8}" y="0" width="8" height="80" fill="${i % 2 ? "#0000ff" : "#ff0000"}"/>`).join("")}
    </svg>`,
  );
  const jpeg = await sharp(canvas)
    .composite([
      { input: stripes, left: TEST_IMAGE.square.left, top: TEST_IMAGE.square.top },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
  const working = await sharp(jpeg).webp({ quality: 90 }).toBuffer();
  return { working, x: 140, y: 140 };
}

export async function pixelAt(
  image: Buffer,
  x: number,
  y: number,
): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return { r: data[index]!, g: data[index + 1]!, b: data[index + 2]! };
}

export const SQUARE_MASK = {
  x: TEST_IMAGE.square.left / TEST_IMAGE.width,
  y: TEST_IMAGE.square.top / TEST_IMAGE.height,
  w: TEST_IMAGE.square.width / TEST_IMAGE.width,
  h: TEST_IMAGE.square.height / TEST_IMAGE.height,
  mode: "solid" as const,
  source: "manual" as const,
};
