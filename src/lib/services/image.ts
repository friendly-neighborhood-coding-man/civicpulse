import sharp, { type Metadata, type OutputInfo } from "sharp";

import { LIMITS } from "../config.ts";
import { ApiError } from "../http/errors.ts";

export type SupportedFormat = "jpeg" | "png" | "webp";

export type ProcessedImage = {
  format: SupportedFormat;
  /** MIME type derived from the decoded bytes, never from the client. */
  mime: string;
  original: Buffer;
  /** Re-encoded, metadata-free, max 1600px copy used inside the app. */
  working: Buffer;
  width: number;
  height: number;
  workingWidth: number;
  workingHeight: number;
  /** True when the upload carried EXIF (including possible GPS). */
  exifPresent: boolean;
};

const MIME: Record<SupportedFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXTENSION: Record<SupportedFormat, "jpg" | "png" | "webp"> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export function extensionFor(format: SupportedFormat): "jpg" | "png" | "webp" {
  return EXTENSION[format];
}

/**
 * Validate and normalise an uploaded photo.
 *
 * - Decodes with sharp so the real format is known (client MIME is ignored).
 * - Rejects unsupported formats, animated images and oversized dimensions.
 * - Produces a metadata-free working copy; the original stays private and is
 *   never served to any client.
 */
export async function processUpload(file: File): Promise<ProcessedImage> {
  if (file.size === 0) {
    throw new ApiError(400, "BAD_REQUEST", "빈 파일입니다. 사진을 다시 선택해 주세요.");
  }
  if (file.size > LIMITS.uploadMaxBytes) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `사진은 ${Math.floor(LIMITS.uploadMaxBytes / (1024 * 1024))}MB 이하만 업로드할 수 있습니다.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > LIMITS.uploadMaxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "사진 용량이 너무 큽니다.");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: LIMITS.imageMaxPixels,
    }).metadata();
  } catch {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "사진을 읽을 수 없습니다. JPEG, PNG, WebP 이미지를 사용해 주세요.",
    );
  }

  const format = metadata.format;
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
    );
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "움직이는 이미지는 업로드할 수 없습니다.",
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < LIMITS.imageMinSide || height < LIMITS.imageMinSide) {
    throw new ApiError(422, "VALIDATION_FAILED", "사진이 너무 작습니다.");
  }
  if (width > LIMITS.maxImageSide || height > LIMITS.maxImageSide) {
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      `사진 한 변은 ${LIMITS.maxImageSide}px 이하여야 합니다.`,
    );
  }
  if (width * height > LIMITS.imageMaxPixels) {
    throw new ApiError(422, "VALIDATION_FAILED", "사진 해상도가 너무 높습니다.");
  }

  let working: { data: Buffer; info: OutputInfo };
  try {
    working = await sharp(buffer, { failOn: "error" })
      // rotate() applies EXIF orientation, then all metadata is dropped.
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ApiError(422, "VALIDATION_FAILED", "사진을 처리하지 못했습니다.");
  }

  return {
    format,
    mime: MIME[format],
    original: buffer,
    working: working.data,
    width,
    height,
    workingWidth: working.info.width,
    workingHeight: working.info.height,
    exifPresent: Boolean(metadata.exif),
  };
}
