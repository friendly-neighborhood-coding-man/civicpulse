import { describe, expect, it } from "vitest";

import {
  MAX_MASKS,
  MIN_MASK_SIDE,
  boxesToMasks,
  masksSchema,
  rectFromPoints,
} from "@/lib/privacy/masks";

describe("mask geometry", () => {
  it("normalises a drag regardless of direction", () => {
    const forward = rectFromPoints({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }, "pixelate");
    const backward = rectFromPoints({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.3 }, "pixelate");
    expect(forward).toEqual(backward);
    expect(forward).toMatchObject({ x: 0.2, y: 0.3, w: 0.4, h: 0.4, mode: "pixelate" });
  });

  it("ignores accidental micro-drags", () => {
    expect(
      rectFromPoints({ x: 0.5, y: 0.5 }, { x: 0.5 + MIN_MASK_SIDE / 2, y: 0.5 }, "blur"),
    ).toBeNull();
  });

  it("clamps a drag that leaves the image", () => {
    const rect = rectFromPoints({ x: 0.8, y: 0.8 }, { x: 1.4, y: 1.3 }, "solid");
    expect(rect).not.toBeNull();
    expect(rect!.x + rect!.w).toBeLessThanOrEqual(1);
    expect(rect!.y + rect!.h).toBeLessThanOrEqual(1);
  });
});

describe("mask validation", () => {
  it("accepts valid masks", () => {
    expect(
      masksSchema.safeParse([
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2, mode: "pixelate", source: "manual" },
      ]).success,
    ).toBe(true);
  });

  it("rejects out-of-bounds, tiny and unknown-mode masks", () => {
    const base = { x: 0.1, y: 0.1, w: 0.2, h: 0.2, mode: "pixelate", source: "manual" };
    expect(masksSchema.safeParse([{ ...base, x: 0.9, w: 0.3 }]).success).toBe(false);
    expect(masksSchema.safeParse([{ ...base, w: 0.001 }]).success).toBe(false);
    expect(masksSchema.safeParse([{ ...base, mode: "invert" }]).success).toBe(false);
    expect(masksSchema.safeParse([{ ...base, x: -0.1 }]).success).toBe(false);
  });

  it("caps the number of masks", () => {
    const mask = { x: 0.1, y: 0.1, w: 0.2, h: 0.2, mode: "blur", source: "manual" };
    const tooMany = Array.from({ length: MAX_MASKS + 1 }, () => mask);
    expect(masksSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("automatic detection mapping", () => {
  it("converts pixel boxes into padded normalised masks", () => {
    const masks = boxesToMasks([{ x: 100, y: 50, width: 40, height: 40 }], 400, 300, 0.1);
    expect(masks).toHaveLength(1);
    const mask = masks[0]!;
    expect(mask.mode).toBe("pixelate");
    expect(mask.source).toBe("auto");
    expect(mask.x).toBeCloseTo(0.24, 2);
    expect(mask.y).toBeCloseTo(0.1533, 2);
    expect(mask.x + mask.w).toBeLessThanOrEqual(1);
  });

  it("drops degenerate boxes and survives zero-size images", () => {
    expect(boxesToMasks([{ x: 0, y: 0, width: 0, height: 10 }], 400, 300)).toEqual([]);
    expect(boxesToMasks([{ x: 0, y: 0, width: 10, height: 10 }], 0, 0)).toEqual([]);
  });

  it("does not produce masks when detection returns nothing", () => {
    expect(boxesToMasks([], 400, 300)).toEqual([]);
  });
});
