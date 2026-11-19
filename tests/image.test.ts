import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { processUpload } from "@/lib/services/image";

async function jpegFile(width = 640, height = 480, orientation?: number): Promise<File> {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 130, b: 140 },
    },
  });
  if (orientation) pipeline = pipeline.withMetadata({ orientation });
  const buffer = await pipeline.jpeg().toBuffer();
  return new File([new Uint8Array(buffer)], "photo.jpg", { type: "image/jpeg" });
}

describe("image intake", () => {
  it("accepts a JPEG and produces a metadata-free WebP working copy", async () => {
    const result = await processUpload(await jpegFile());
    expect(result.format).toBe("jpeg");
    expect(result.mime).toBe("image/jpeg");
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);

    const working = await sharp(result.working).metadata();
    expect(working.format).toBe("webp");
    expect(working.exif).toBeUndefined();
    expect(working.orientation).toBeUndefined();
    expect(working.width).toBeLessThanOrEqual(1600);
  });

  it("applies EXIF orientation and strips it from the working copy", async () => {
    const result = await processUpload(await jpegFile(640, 480, 6));
    expect(result.exifPresent).toBe(true);
    // Orientation 6 = rotate 90°, so the working copy swaps dimensions.
    expect(result.workingWidth).toBe(480);
    expect(result.workingHeight).toBe(640);
    const working = await sharp(result.working).metadata();
    expect(working.orientation).toBeUndefined();
  });

  it("rejects non-image bytes even when the client claims an image type", async () => {
    const fake = new File([new TextEncoder().encode("not an image")], "x.jpg", {
      type: "image/jpeg",
    });
    await expect(processUpload(fake)).rejects.toMatchObject({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects an empty file", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    await expect(processUpload(empty)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects files above the size limit before decoding", async () => {
    const huge = new File([new Uint8Array(9 * 1024 * 1024)], "huge.jpg", {
      type: "image/jpeg",
    });
    await expect(processUpload(huge)).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("rejects tiny, oversized and unsupported images", async () => {
    const tiny = new File(
      [new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } }).jpeg().toBuffer())],
      "tiny.jpg",
      { type: "image/jpeg" },
    );
    await expect(processUpload(tiny)).rejects.toMatchObject({ status: 422 });

    const wide = new File(
      [new Uint8Array(await sharp({ create: { width: 5000, height: 120, channels: 3, background: "#fff" } }).png().toBuffer())],
      "wide.png",
      { type: "image/png" },
    );
    await expect(processUpload(wide)).rejects.toMatchObject({ status: 422 });

    const gif = new File(
      [new Uint8Array(await sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } }).gif().toBuffer())],
      "anim.gif",
      { type: "image/gif" },
    );
    await expect(processUpload(gif)).rejects.toMatchObject({ status: 415 });
  });
});
