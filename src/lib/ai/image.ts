import sharp from "sharp";

/**
 * The only image bytes that may leave the server for analysis.
 *
 * Input is the private *working* copy (already EXIF-free, orientation applied,
 * max 1600px). It is decoded again and re-encoded as a small JPEG without any
 * metadata (sharp drops metadata unless `withMetadata` is called), so no GPS,
 * camera serial or original file bytes reach a provider. 512px matches the
 * provider's low-detail budget; larger images would cost more without changing
 * a low-detail analysis.
 */

export const MODEL_IMAGE_MAX_SIDE = 512;

export type ModelImage = {
  mime: "image/jpeg";
  base64: string;
  width: number;
  height: number;
  bytes: number;
};

export async function prepareModelImage(working: Buffer): Promise<ModelImage> {
  const { data, info } = await sharp(working, { failOn: "error" })
    .resize({
      width: MODEL_IMAGE_MAX_SIDE,
      height: MODEL_IMAGE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    mime: "image/jpeg",
    base64: data.toString("base64"),
    width: info.width,
    height: info.height,
    bytes: data.byteLength,
  };
}
