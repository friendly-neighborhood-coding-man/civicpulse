import type { Db } from "../db/connection.ts";
import { all, one, run, transaction } from "../db/query.ts";
import { badRequest, conflict, notFound } from "../http/errors.ts";
import { internalId, isPublicId, publicId } from "../ids.ts";
import type { AssistantDraft } from "../services/assistant.ts";
import { extensionFor, type ProcessedImage } from "../services/image.ts";
import { newMediaKey, removeMedia, writeMedia } from "../services/media-store.ts";
import type { UpdateDraftInput } from "../validation/report.ts";
import { approximateCoordinate, findArea } from "./areas.ts";
import { getChannel } from "./channels.ts";
import type { PublicUser } from "./users.ts";

export type ReportState = "draft" | "published" | "removed";

export type ReportRow = {
  id: string;
  public_id: string;
  owner_id: string;
  title: string;
  description: string;
  user_description: string;
  landmark: string;
  category: string;
  area_id: string;
  area_label: string;
  lat: number | null;
  lng: number | null;
  public_lat: number | null;
  public_lng: number | null;
  state: ReportState;
  assistant_mode: string | null;
  assistant_generated_at: string | null;
  missing_evidence: string;
  suggested_steps: string;
  channel_id: string | null;
  channel_checked_at: string | null;
  published_at: string | null;
  privacy_reviewed_at: string | null;
  consent_version: string | null;
  text_reviewed_at: string | null;
  text_review_version: string | null;
  text_findings: string;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaRow = {
  id: string;
  report_id: string;
  role: "original" | "working" | "public";
  storage_key: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
};

/**
 * Owner-facing projection.
 *
 * Deliberately excludes the storage keys and precise coordinates: even the
 * owner's browser does not need a filesystem path, and precise coordinates are
 * not part of the product surface yet.
 */
export type OwnerReport = {
  publicId: string;
  title: string;
  description: string;
  userDescription: string;
  landmark: string;
  category: string;
  areaId: string;
  areaLabel: string;
  state: ReportState;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  removedAt: string | null;
  removalReason: string | null;
  assistant: { mode: string; generatedAt: string } | null;
  missingEvidence: string[];
  suggestedSteps: string[];
  channelId: string | null;
  channelCheckedAt: string | null;
  photo: { url: string; width: number; height: number } | null;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function mediaFor(db: Db, reportId: string): Partial<Record<MediaRow["role"], MediaRow>> {
  const rows = all<MediaRow>(db, "SELECT * FROM report_media WHERE report_id = ?", [
    reportId,
  ]);
  const byRole: Partial<Record<MediaRow["role"], MediaRow>> = {};
  for (const row of rows) byRole[row.role] = row;
  return byRole;
}

export function toOwnerReport(row: ReportRow, media?: MediaRow): OwnerReport {
  return {
    publicId: row.public_id,
    title: row.title,
    description: row.description,
    userDescription: row.user_description,
    landmark: row.landmark,
    category: row.category,
    areaId: row.area_id,
    areaLabel: row.area_label,
    state: row.state,
    publishedAt: row.published_at,
    removedAt: row.removed_at,
    removalReason: row.removal_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assistant:
      row.assistant_mode && row.assistant_generated_at
        ? { mode: row.assistant_mode, generatedAt: row.assistant_generated_at }
        : null,
    missingEvidence: parseStringArray(row.missing_evidence),
    suggestedSteps: parseStringArray(row.suggested_steps),
    channelId: row.channel_id,
    channelCheckedAt: row.channel_checked_at,
    photo: media
      ? {
          url: `/api/reports/${row.public_id}/photo`,
          width: media.width,
          height: media.height,
        }
      : null,
  };
}

export type CreateReportOptions = {
  actor: PublicUser;
  input: { description: string; category: string; areaId: string; landmark: string };
  draft: AssistantDraft;
  image: ProcessedImage;
  now?: Date;
};

/**
 * Persist a private draft plus its two media rows.
 *
 * Files are written before the transaction and removed again if the database
 * write fails, so a failed request cannot leave an orphaned draft.
 * Drafts are private: nothing is published and no external call is made.
 */
export async function createDraftReport(
  db: Db,
  options: CreateReportOptions,
): Promise<ReportRow> {
  const area = findArea(options.input.areaId);
  if (!area) throw badRequest("알 수 없는 위치 구역입니다.");

  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const id = internalId("rep");
  const pid = publicId("cp");
  const originalKey = newMediaKey(extensionFor(options.image.format));
  const workingKey = newMediaKey("webp");

  await writeMedia("private", originalKey, options.image.original);
  await writeMedia("private", workingKey, options.image.working);

  try {
    return transaction(db, () => {
      run(
        db,
        `INSERT INTO reports (
           id, public_id, owner_id, title, description, user_description, landmark,
           category, area_id, area_label, lat, lng, public_lat, public_lng, state,
           assistant_mode, assistant_generated_at, missing_evidence, suggested_steps,
           channel_id, channel_checked_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          pid,
          options.actor.id,
          options.draft.title,
          options.draft.description,
          options.input.description,
          options.input.landmark,
          options.input.category,
          area.id,
          area.label,
          area.lat,
          area.lng,
          approximateCoordinate(area.lat),
          approximateCoordinate(area.lng),
          options.draft.mode,
          options.draft.generatedAt,
          JSON.stringify(options.draft.missingEvidence),
          JSON.stringify(options.draft.suggestedSteps),
          options.draft.channelId,
          getChannel(options.draft.channelId)?.asOf ?? null,
          timestamp,
          timestamp,
        ],
      );

      run(
        db,
        `INSERT INTO report_media
           (id, report_id, role, storage_key, mime, width, height, bytes, created_at)
         VALUES (?, ?, 'original', ?, ?, ?, ?, ?, ?)`,
        [
          internalId("med"),
          id,
          originalKey,
          options.image.mime,
          options.image.width,
          options.image.height,
          options.image.original.byteLength,
          timestamp,
        ],
      );
      run(
        db,
        `INSERT INTO report_media
           (id, report_id, role, storage_key, mime, width, height, bytes, created_at)
         VALUES (?, ?, 'working', ?, ?, ?, ?, ?, ?)`,
        [
          internalId("med"),
          id,
          workingKey,
          "image/webp",
          options.image.workingWidth,
          options.image.workingHeight,
          options.image.working.byteLength,
          timestamp,
        ],
      );

      const inserted = one<ReportRow>(db, "SELECT * FROM reports WHERE id = ?", [id]);
      if (!inserted) throw new Error("report insert did not return a row");
      return inserted;
    });
  } catch (error) {
    await Promise.allSettled([
      removeMedia("private", originalKey),
      removeMedia("private", workingKey),
    ]);
    throw error;
  }
}

/** Load a report by public id, returning 404 for anyone who is not the owner. */
export function getOwnedReportRow(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
): ReportRow {
  if (!isPublicId(publicReportId, "cp")) throw notFound();
  const row = one<ReportRow>(db, "SELECT * FROM reports WHERE public_id = ?", [
    publicReportId,
  ]);
  if (!row || row.owner_id !== actor.id) throw notFound();
  return row;
}

export function getOwnerReport(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
): OwnerReport {
  const row = getOwnedReportRow(db, actor, publicReportId);
  return toOwnerReport(row, mediaFor(db, row.id).working);
}

export function getWorkingMedia(db: Db, row: ReportRow): MediaRow | undefined {
  return mediaFor(db, row.id).working;
}

export function getMediaByRole(
  db: Db,
  reportId: string,
  role: MediaRow["role"],
): MediaRow | undefined {
  return one<MediaRow>(
    db,
    "SELECT * FROM report_media WHERE report_id = ? AND role = ?",
    [reportId, role],
  );
}

export function listOwnerReports(db: Db, actor: PublicUser): OwnerReport[] {
  const rows = all<ReportRow>(
    db,
    "SELECT * FROM reports WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50",
    [actor.id],
  );
  return rows.map((row) => toOwnerReport(row, mediaFor(db, row.id).working));
}

/**
 * Edit an existing *draft*. Published reports are immutable here; later stages
 * add an explicit revision flow rather than silently editing public text.
 */
export function updateDraftReport(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  patch: UpdateDraftInput,
  now: Date = new Date(),
): OwnerReport {
  const row = getOwnedReportRow(db, actor, publicReportId);
  if (row.state !== "draft") {
    throw conflict("이미 공개된 제보의 초안 문장은 이 화면에서 수정할 수 없습니다.");
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    updates.push("title = ?");
    params.push(patch.title);
  }
  if (patch.description !== undefined) {
    updates.push("description = ?");
    params.push(patch.description);
  }
  if (patch.landmark !== undefined) {
    updates.push("landmark = ?");
    params.push(patch.landmark);
  }
  if (updates.length === 0) return toOwnerReport(row, mediaFor(db, row.id).working);

  updates.push("updated_at = ?");
  params.push(now.toISOString());
  params.push(row.id);

  run(db, `UPDATE reports SET ${updates.join(", ")} WHERE id = ?`, params);
  const updated = one<ReportRow>(db, "SELECT * FROM reports WHERE id = ?", [row.id]);
  if (!updated) throw new Error("report disappeared during update");
  return toOwnerReport(updated, mediaFor(db, updated.id).working);
}
