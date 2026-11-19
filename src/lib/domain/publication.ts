import type { Db } from "../db/connection.ts";
import { one, run, transaction, all } from "../db/query.ts";
import { conflict, notFound } from "../http/errors.ts";
import { internalId, isPublicId } from "../ids.ts";
import { MAX_MASKS, type MaskRect } from "../privacy/masks.ts";
import { applyRedaction } from "../services/redaction.ts";
import { newMediaKey, removeMedia, readMedia, writeMedia } from "../services/media-store.ts";
import { getMediaByRole, getOwnedReportRow, type ReportRow } from "./reports.ts";
import type { PublicUser } from "./users.ts";

export const CONSENT_VERSION = "privacy-v1";

export type PublishAck = {
  /** "I looked at the photo and hid what needed hiding." */
  privacyReviewed: boolean;
  /** "I agree to publish this report." */
  consent: boolean;
  /** Required when there are no masks at all. */
  noSensitiveContent: boolean;
};

export type PublishResult = {
  publicId: string;
  publicUrl: string;
  publishedAt: string;
  maskCount: number;
  photo: { width: number; height: number };
};

/**
 * Publish a redacted copy of a draft.
 *
 * Ordering matters for privacy:
 * 1. Validate ownership, state and *explicit* human acknowledgements.
 * 2. Build the public image server-side from the working copy, applying every
 *    confirmed mask and re-encoding without metadata.
 * 3. Write the public file, then record media + masks + state in one transaction.
 * 4. Only then does any public route become able to serve it.
 *
 * The original photo and the working copy stay private; nothing here sends a
 * report or notification anywhere.
 */
export async function publishReport(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  input: { masks: MaskRect[]; ack: PublishAck },
  now: Date = new Date(),
): Promise<PublishResult> {
  const row = getOwnedReportRow(db, actor, publicReportId);

  if (row.state !== "draft") {
    throw conflict("이미 공개된 제보입니다.");
  }
  if (!input.ack.privacyReviewed || !input.ack.consent) {
    throw conflict("사진 검토와 공개 동의를 모두 확인해야 합니다.");
  }
  if (input.masks.length > MAX_MASKS) {
    throw conflict("가림 영역이 너무 많습니다.");
  }
  if (input.masks.length === 0 && !input.ack.noSensitiveContent) {
    throw conflict(
      "가림 영역이 없습니다. 사진에 얼굴·번호판 등 개인정보가 없다는 확인이 필요합니다.",
    );
  }

  const working = getMediaByRole(db, row.id, "working");
  if (!working) throw conflict("공개할 사진을 찾을 수 없습니다.");

  const source = await readMedia("private", working.storage_key);
  const redacted = await applyRedaction(source, input.masks);

  const publicKey = newMediaKey("webp");
  await writeMedia("public", publicKey, redacted.data);

  const timestamp = now.toISOString();
  try {
    transaction(db, () => {
      const existing = one<{ id: string }>(
        db,
        "SELECT id FROM report_media WHERE report_id = ? AND role = 'public'",
        [row.id],
      );
      if (existing) {
        throw conflict("이미 공개된 사진이 있습니다.");
      }

      run(
        db,
        `INSERT INTO report_media
           (id, report_id, role, storage_key, mime, width, height, bytes, created_at)
         VALUES (?, ?, 'public', ?, 'image/webp', ?, ?, ?, ?)`,
        [
          internalId("med"),
          row.id,
          publicKey,
          redacted.width,
          redacted.height,
          redacted.data.byteLength,
          timestamp,
        ],
      );

      for (const mask of input.masks) {
        run(
          db,
          `INSERT INTO redaction_masks
             (id, report_id, x, y, w, h, mode, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            internalId("msk"),
            row.id,
            mask.x,
            mask.y,
            mask.w,
            mask.h,
            mask.mode,
            mask.source,
            timestamp,
          ],
        );
      }

      run(
        db,
        `UPDATE reports
            SET state = 'published',
                published_at = ?,
                privacy_reviewed_at = ?,
                consent_version = ?,
                updated_at = ?
          WHERE id = ?`,
        [timestamp, timestamp, CONSENT_VERSION, timestamp, row.id],
      );
    });
  } catch (error) {
    await removeMedia("public", publicKey);
    throw error;
  }

  return {
    publicId: row.public_id,
    publicUrl: `/issues/${row.public_id}`,
    publishedAt: timestamp,
    maskCount: input.masks.length,
    photo: { width: redacted.width, height: redacted.height },
  };
}

/* -------------------------------------------------------------------------- */
/* Public read surface                                                        */
/* -------------------------------------------------------------------------- */

export type PublicReport = {
  publicId: string;
  title: string;
  description: string;
  category: string;
  areaLabel: string;
  publishedAt: string;
  photoUrl: string;
  /** Verified guidance for the citizen's own follow-up; never a submission channel. */
  channelId: string | null;
  /** How many areas the owner confirmed hiding (transparency, not proof). */
  maskCount: number;
};

export function getPublishedReportRow(db: Db, publicReportId: string): ReportRow {
  if (!isPublicId(publicReportId, "cp")) throw notFound();
  const row = one<ReportRow>(
    db,
    "SELECT * FROM reports WHERE public_id = ? AND state = 'published'",
    [publicReportId],
  );
  if (!row) throw notFound();
  return row;
}

export function countMasks(db: Db, reportId: string): number {
  const row = one<{ count: number }>(
    db,
    "SELECT COUNT(*) AS count FROM redaction_masks WHERE report_id = ?",
    [reportId],
  );
  return row?.count ?? 0;
}

/**
 * Public projection. Deliberately narrower than the owner view:
 * no user id, no precise/rounded coordinates, no original description, no
 * storage keys, no media role information.
 */
export function toPublicReport(db: Db, row: ReportRow): PublicReport {
  if (row.state !== "published" || !row.published_at) throw notFound();
  return {
    publicId: row.public_id,
    title: row.title,
    description: row.description,
    category: row.category,
    areaLabel: row.area_label,
    publishedAt: row.published_at,
    photoUrl: `/api/public/reports/${row.public_id}/photo`,
    channelId: row.channel_id,
    maskCount: countMasks(db, row.id),
  };
}

export function getPublicReport(db: Db, publicReportId: string): PublicReport {
  return toPublicReport(db, getPublishedReportRow(db, publicReportId));
}

export function getPublicationMasks(db: Db, reportId: string) {
  return all<{
    x: number;
    y: number;
    w: number;
    h: number;
    mode: MaskRect["mode"];
    source: MaskRect["source"];
  }>(
    db,
    "SELECT x, y, w, h, mode, source FROM redaction_masks WHERE report_id = ? ORDER BY created_at",
    [reportId],
  );
}
