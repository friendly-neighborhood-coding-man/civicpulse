import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { applyRedaction } from "@/lib/services/redaction";
import {
  SQUARE_MASK,
  TEST_IMAGE,
  makeStripedTestImage,
  makeTestImage,
  pixelAt,
} from "./helpers/images";

async function source() {
  const image = await makeTestImage();
  return image.working;
}

describe("server-side redaction", () => {
  it("changes the pixels inside a mask and leaves the rest untouched", async () => {
    const input = await source();
    const redBefore = await pixelAt(input, 140, 140);
    expect(redBefore.r).toBeGreaterThan(180);
    expect(redBefore.g).toBeLessThan(80);

    const result = await applyRedaction(input, [SQUARE_MASK]);

    const redAfter = await pixelAt(result.data, 140, 140);
    // Solid mode paints an opaque neutral colour over the area.
    expect(redAfter.r).toBeLessThan(100);
    expect(Math.abs(redAfter.r - redAfter.g)).toBeLessThan(30);

    const outsideAfter = await pixelAt(result.data, 20, 20);
    expect(outsideAfter.r).toBeGreaterThan(220);
    expect(outsideAfter.g).toBeGreaterThan(220);
    expect(outsideAfter.b).toBeGreaterThan(220);

    expect(result.width).toBe(TEST_IMAGE.width);
    expect(result.height).toBe(TEST_IMAGE.height);
  });

  it("pixelate and blur average a textured region", async () => {
    const { working, x, y } = await makeStripedTestImage();
    const before = await pixelAt(working, x, y);

    for (const mode of ["pixelate", "blur"] as const) {
      const result = await applyRedaction(working, [{ ...SQUARE_MASK, mode }]);
      const after = await pixelAt(result.data, x, y);
      const changed =
        Math.abs(after.r - before.r) + Math.abs(after.g - before.g) > 20;
      expect(changed, `${mode} left the striped region unchanged`).toBe(true);
    }
  });

  it("documents that pixelation does not change a uniform-colour region", async () => {
    // This is a real limitation, not a bug: pixelation averages blocks, so a
    // flat red area stays red. The UI therefore offers solid/blur modes and
    // requires a human to choose; it never claims pixelation is sufficient.
    const input = await source();
    const result = await applyRedaction(input, [{ ...SQUARE_MASK, mode: "pixelate" }]);
    const pixel = await pixelAt(result.data, 140, 140);
    expect(pixel.r).toBeGreaterThan(200);
    expect(pixel.g).toBeLessThan(40);
  });

  it("only touches the rectangles it was given", async () => {
    const input = await source();
    const result = await applyRedaction(input, [
      { x: 0, y: 0, w: 0.1, h: 0.1, mode: "solid", source: "manual" },
    ]);
    // The red square was not masked, so it survives.
    const pixel = await pixelAt(result.data, 140, 140);
    expect(pixel.r).toBeGreaterThan(180);
    expect(pixel.g).toBeLessThan(90);
  });

  it("produces a metadata-free WebP even with no masks", async () => {
    const input = await source();
    const result = await applyRedaction(input, []);
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.width).toBe(TEST_IMAGE.width);
  });

  it("clamps masks that run to the edge without throwing", async () => {
    const input = await source();
    const result = await applyRedaction(input, [
      { x: 0.99, y: 0.99, w: 0.05, h: 0.05, mode: "blur", source: "manual" },
    ]);
    expect(result.data.byteLength).toBeGreaterThan(0);
  });
});
