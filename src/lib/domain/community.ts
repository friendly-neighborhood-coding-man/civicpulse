import type { Db } from "../db/connection.ts";
import { all, one, run } from "../db/query.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.ts";
import { internalId } from "../ids.ts";
import type { ProcessedImage } from "../services/image.ts";
import { newMediaKey, writeMedia } from "../services/media-store.ts";
import type {
  StatusKind,
  StatusValue,
} from "../validation/community.ts";
import {
  getPublicReport,
  getPublishedReportRow,
  type PublicReport,
} from "./publication.ts";
import type { PublicUser } from "./users.ts";

export type EvidenceStatus = "pending" | "approved" | "rejected";

export type EvidenceRow = {
  id: string;
  report_id: string;
  user_id: string;
  storage_key: string;
  mime: string;
  width: number;
  height: number;
  note: string;
  status: EvidenceStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type StatusEventRow = {
  id: string;
  report_id: string;
  kind: StatusKind;
  status: StatusValue;
  note: string;
  source_url: string | null;
  created_by: string;
  created_at: string;
};

export type PublicEvidence = {
  id: string;
  note: string;
  photoUrl: string;
  createdAt: string;
};

export type PublicStatusEvent = {
  id: string;
  kind: StatusKind;
  status: StatusValue;
  note: string;
  sourceUrl: string | null;
  createdAt: string;
};

export type IssueDetail = PublicReport & {
  supportCount: number;
  supportedByMe: boolean;
  evidence: PublicEvidence[];
  events: PublicStatusEvent[];
  /** Latest moderator-verified status, separate from any citizen claim. */
  officialStatus: StatusValue | null;
  officialCheckedAt: string | null;
  /** Latest status the reporter claims (never treated as verified). */
  latestUserClaim: PublicStatusEvent | null;
};

export type FeedItem = {
  publicId: string;
  title: string;
  areaLabel: string;
  category: string;
  publishedAt: string;
  photoUrl: string;
  supportCount: number;
  officialStatus: StatusValue | null;
};

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Record support for a published issue.
 *
 * `INSERT OR IGNORE` plus the composite primary key makes repeat taps harmless
 * and keeps the public count a count of *demo accounts*, not of taps. Support is
 * explicitly not a truth judgement, which the UI states next to the number.
 */
export function supportIssue(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  now: Date = new Date(),
): { supportCount: number; alreadySupported: boolean } {
  const row = getPublishedReportRow(db, publicReportId);
  const result = run(
    db,
    "INSERT OR IGNORE INTO supports (report_id, user_id, created_at) VALUES (?, ?, ?)",
    [row.id, actor.id, now.toISOString()],
  );
  return {
    supportCount: getSupportCount(db, row.id),
    alreadySupported: result.changes === 0,
  };
}

export function getSupportCount(db: Db, reportId: string): number {
  const row = one<{ count: number }>(
    db,
    "SELECT COUNT(*) AS count FROM supports WHERE report_id = ?",
    [reportId],
  );
  return row?.count ?? 0;
}

export function hasSupported(db: Db, reportId: string, userId: string): boolean {
  return Boolean(
    one<{ report_id: string }>(
      db,
      "SELECT report_id FROM supports WHERE report_id = ? AND user_id = ?",
      [reportId, userId],
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

export type AddEvidenceInput = {
  note: string;
  ackNoSensitive: boolean;
  image: ProcessedImage;
};

/**
 * Store new evidence as *pending*.
 *
 * Files live in the private media scope and are only readable through a route
 * that checks `status = 'approved'`, so a pending upload cannot leak even by
 * guessing its id. A human moderator approves before anything becomes public.
 */
export async function addEvidence(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  input: AddEvidenceInput,
  now: Date = new Date(),
): Promise<{ id: string; status: EvidenceStatus }> {
  const row = getPublishedReportRow(db, publicReportId);
  if (!input.ackNoSensitive) {
    throw badRequest("사진에 개인정보가 없다는 확인이 필요합니다.");
  }
  if (!input.image.working.byteLength) {
    throw badRequest("사진을 처리하지 못했습니다.");
  }

  const key = newMediaKey("webp");
  await writeMedia("private", key, input.image.working);

  const id = internalId("evd");
  run(
    db,
    `INSERT INTO evidence
       (id, report_id, user_id, storage_key, mime, width, height, note, status, created_at)
     VALUES (?, ?, ?, ?, 'image/webp', ?, ?, ?, 'pending', ?)`,
    [
      id,
      row.id,
      actor.id,
      key,
      input.image.workingWidth,
      input.image.workingHeight,
      input.note,
      now.toISOString(),
    ],
  );

  return { id, status: "pending" };
}

export function getEvidenceRow(db: Db, evidenceId: string): EvidenceRow {
  const row = one<EvidenceRow>(db, "SELECT * FROM evidence WHERE id = ?", [evidenceId]);
  if (!row) throw notFound("근거를 찾을 수 없습니다.");
  return row;
}

export function listApprovedEvidence(db: Db, reportId: string): PublicEvidence[] {
  return all<EvidenceRow>(
    db,
    "SELECT * FROM evidence WHERE report_id = ? AND status = 'approved' ORDER BY created_at",
    [reportId],
  ).map((row) => ({
    id: row.id,
    note: row.note,
    photoUrl: `/api/public/evidence/${row.id}/photo`,
    createdAt: row.created_at,
  }));
}

export type ModerationQueueItem = {
  id: string;
  reportPublicId: string;
  reportTitle: string;
  note: string;
  status: EvidenceStatus;
  createdAt: string;
  photoUrl: string;
};

export function listEvidenceQueue(db: Db): ModerationQueueItem[] {
  return all<{
    id: string;
    public_id: string;
    title: string;
    note: string;
    status: EvidenceStatus;
    created_at: string;
  }>(
    db,
    `SELECT e.id, r.public_id, r.title, e.note, e.status, e.created_at
       FROM evidence e
       JOIN reports r ON r.id = e.report_id
      WHERE e.status = 'pending'
      ORDER BY e.created_at ASC
      LIMIT 50`,
  ).map((row) => ({
    id: row.id,
    reportPublicId: row.public_id,
    reportTitle: row.title,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    photoUrl: `/api/moderation/evidence/${row.id}/photo`,
  }));
}

export function reviewEvidence(
  db: Db,
  moderator: PublicUser,
  evidenceId: string,
  decision: "approved" | "rejected",
  reason: string | undefined,
  now: Date = new Date(),
): EvidenceRow {
  if (moderator.role !== "moderator") {
    throw forbidden("근거 검토는 운영자만 할 수 있습니다.");
  }
  const row = getEvidenceRow(db, evidenceId);
  if (row.status !== "pending") {
    throw conflict("이미 검토된 근거입니다.");
  }
  run(
    db,
    `UPDATE evidence
        SET status = ?, reviewed_by = ?, reviewed_at = ?, rejection_reason = ?
      WHERE id = ? AND status = 'pending'`,
    [decision, moderator.id, now.toISOString(), decision === "rejected" ? reason ?? null : null, evidenceId],
  );
  return getEvidenceRow(db, evidenceId);
}

/* -------------------------------------------------------------------------- */
/* Status events                                                              */
/* -------------------------------------------------------------------------- */

export function addStatusEvent(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  input: { kind: StatusKind; status: StatusValue; note: string; sourceUrl?: string },
  now: Date = new Date(),
): StatusEventRow {
  const row = getPublishedReportRow(db, publicReportId);

  if (input.kind === "user_claim" && row.owner_id !== actor.id) {
    throw forbidden("진행 상황에 대한 시민 주장은 제보 작성자만 기록할 수 있습니다.");
  }
  if ((input.kind === "official" || input.kind === "mock") && actor.role !== "moderator") {
    throw forbidden("공식·모의 상태는 운영자만 기록할 수 있습니다.");
  }
  if (input.kind === "official") {
    if (!input.sourceUrl) {
      throw badRequest("공식 상태에는 출처 주소가 필요합니다.");
    }
    if (!input.sourceUrl.startsWith("https://")) {
      throw badRequest("출처 주소는 https:// 로 시작해야 합니다.");
    }
  }

  const id = internalId("sts");
  run(
    db,
    `INSERT INTO status_events
       (id, report_id, kind, status, note, source_url, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      row.id,
      input.kind,
      input.status,
      input.note,
      input.sourceUrl ?? null,
      actor.id,
      now.toISOString(),
    ],
  );

  const inserted = one<StatusEventRow>(db, "SELECT * FROM status_events WHERE id = ?", [id]);
  if (!inserted) throw new Error("status event insert did not return a row");
  return inserted;
}

export function listStatusEvents(db: Db, reportId: string): StatusEventRow[] {
  return all<StatusEventRow>(
    db,
    // rowid breaks ties so two events written in the same millisecond still have
    // a stable, insertion-ordered timeline.
    "SELECT * FROM status_events WHERE report_id = ? ORDER BY created_at, rowid",
    [reportId],
  );
}

/* -------------------------------------------------------------------------- */
/* Public aggregation                                                         */
/* -------------------------------------------------------------------------- */

export function toPublicStatusEvent(row: StatusEventRow): PublicStatusEvent {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    note: row.note,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  };
}

export function getIssueDetail(
  db: Db,
  publicReportId: string,
  viewer: PublicUser | null,
): IssueDetail {
  const row = getPublishedReportRow(db, publicReportId);
  const base = getPublicReport(db, publicReportId);
  const events = listStatusEvents(db, row.id).map(toPublicStatusEvent);
  const official = [...events].reverse().find((event) => event.kind === "official") ?? null;
  const claim =
    [...events].reverse().find((event) => event.kind === "user_claim") ?? null;

  return {
    ...base,
    supportCount: getSupportCount(db, row.id),
    supportedByMe: viewer ? hasSupported(db, row.id, viewer.id) : false,
    evidence: listApprovedEvidence(db, row.id),
    events,
    officialStatus: official?.status ?? null,
    officialCheckedAt: official?.createdAt ?? null,
    latestUserClaim: claim,
  };
}

export function listPublicIssues(db: Db, limit = 30): FeedItem[] {
  return all<{
    public_id: string;
    title: string;
    area_label: string;
    category: string;
    published_at: string;
    support_count: number;
    official_status: string | null;
  }>(
    db,
    `SELECT r.public_id,
            r.title,
            r.area_label,
            r.category,
            r.published_at,
            (SELECT COUNT(*) FROM supports s WHERE s.report_id = r.id) AS support_count,
            (SELECT e.status FROM status_events e
              WHERE e.report_id = r.id AND e.kind = 'official'
              ORDER BY e.created_at DESC LIMIT 1) AS official_status
       FROM reports r
      WHERE r.state = 'published'
      ORDER BY r.published_at DESC
      LIMIT ?`,
    [limit],
  ).map((row) => ({
    publicId: row.public_id,
    title: row.title,
    areaLabel: row.area_label,
    category: row.category,
    publishedAt: row.published_at,
    photoUrl: `/api/public/reports/${row.public_id}/photo`,
    supportCount: row.support_count,
    officialStatus: (row.official_status as StatusValue | null) ?? null,
  }));
}
