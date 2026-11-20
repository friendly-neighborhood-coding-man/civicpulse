import { getFollowupCooldownDays, getFollowupWaitingDays } from "../config.ts";
import type { Db } from "../db/connection.ts";
import { all, one, run } from "../db/query.ts";
import { forbidden, notFound, conflict } from "../http/errors.ts";
import { internalId } from "../ids.ts";
import {
  generateFollowupDraft,
  renderFollowupText,
  type FollowupBody,
} from "../services/followup.ts";
import { getChannel, toPublicChannel } from "./channels.ts";
import {
  listApprovedEvidence,
  listStatusEvents,
} from "./community.ts";
import { getPublishedReportRow } from "./publication.ts";
import type { PublicUser } from "./users.ts";

export type FollowupStatus = "draft" | "approved" | "discarded";

export type FollowupRow = {
  id: string;
  report_id: string;
  requested_by: string;
  status: FollowupStatus;
  body_json: string;
  evidence_count: number;
  age_days: number;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  discarded_at: string | null;
};

export type FollowupView = {
  id: string;
  status: FollowupStatus;
  createdAt: string;
  reviewedAt: string | null;
  evidenceCount: number;
  ageDays: number;
  body: FollowupBody;
  text: string;
  /** Always true: the application never submits this document. */
  notSubmitted: true;
};

export type FollowupEligibility = {
  eligible: boolean;
  reasons: string[];
  waitingDays: number;
  cooldownDays: number;
  ageDays: number;
  approvedEvidenceCount: number;
  newEvidenceCount: number;
  latest: {
    id: string;
    status: FollowupStatus;
    createdAt: string;
    reviewedAt: string | null;
  } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((to.getTime() - from) / DAY_MS));
}

function getFollowupRow(db: Db, followupId: string): FollowupRow {
  const row = one<FollowupRow>(db, "SELECT * FROM followups WHERE id = ?", [followupId]);
  if (!row) throw notFound("후속 초안을 찾을 수 없습니다.");
  return row;
}

function latestFollowupRow(db: Db, reportId: string): FollowupRow | null {
  return (
    one<FollowupRow>(
      db,
      `SELECT * FROM followups
        WHERE report_id = ? AND status != 'discarded'
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1`,
      [reportId],
    ) ?? null
  );
}

function latestApprovedFollowupRow(db: Db, reportId: string): FollowupRow | null {
  return (
    one<FollowupRow>(
      db,
      `SELECT * FROM followups
        WHERE report_id = ? AND status = 'approved'
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1`,
      [reportId],
    ) ?? null
  );
}

function toView(row: FollowupRow): FollowupView {
  let body: FollowupBody;
  try {
    body = JSON.parse(row.body_json) as FollowupBody;
  } catch {
    throw new Error(`followup ${row.id} has unreadable body JSON`);
  }
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    evidenceCount: row.evidence_count,
    ageDays: row.age_days,
    body,
    text: renderFollowupText(body),
    notSubmitted: true,
  };
}

/**
 * Eligibility is a set of *observable* conditions, not a score:
 * enough elapsed time, at least one newly approved piece of evidence since the
 * last follow-up, no official resolution, no draft awaiting review, and respect
 * for the cooldown after an approved follow-up.
 */
export function getFollowupEligibility(
  db: Db,
  reportId: string,
  now: Date = new Date(),
): FollowupEligibility {
  const report = one<{ published_at: string | null }>(
    db,
    "SELECT published_at FROM reports WHERE id = ?",
    [reportId],
  );
  if (!report?.published_at) throw conflict("공개된 제보에만 후속 요청을 만들 수 있습니다.");

  const waitingDays = getFollowupWaitingDays();
  const cooldownDays = getFollowupCooldownDays();
  const ageDays = daysBetween(report.published_at, now);
  const reasons: string[] = [];

  const events = listStatusEvents(db, reportId);
  // Only a verified official-portal citation counts as resolution. A moderator's
  // unverified note must not silently disable the citizen's follow-up path.
  const officialResolved = [...events]
    .reverse()
    .find((event) => event.kind === "official_source" && event.status === "resolved");
  if (officialResolved) {
    reasons.push("공식 확인으로 해결된 제보입니다. 후속 요청이 필요하지 않습니다.");
  }

  if (ageDays < waitingDays) {
    reasons.push(
      `대기 기간이 지나지 않았습니다. 공개 후 ${ageDays}일 경과, 기준 ${waitingDays}일.`,
    );
  }

  const latest = latestFollowupRow(db, reportId);
  const approved = latestApprovedFollowupRow(db, reportId);
  const baselineIso =
    approved?.created_at ?? latest?.created_at ?? report.published_at;

  const evidence = listApprovedEvidence(db, reportId);
  const newEvidence = evidence.filter(
    (item) => new Date(item.createdAt).getTime() > new Date(baselineIso).getTime(),
  );

  if (newEvidence.length === 0) {
    reasons.push(
      "마지막 후속 요청 이후 새로 검토를 통과한 근거가 없습니다. 새 근거가 필요합니다.",
    );
  }

  if (latest?.status === "draft") {
    reasons.push("이미 검토를 기다리는 후속 초안이 있습니다. 먼저 검토해 주세요.");
  }

  if (approved) {
    const elapsed = daysBetween(approved.created_at, now);
    if (elapsed < cooldownDays) {
      reasons.push(
        `최근 후속 요청 후 ${elapsed}일이 지났습니다. ${cooldownDays}일 이후에 다시 만들 수 있습니다.`,
      );
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    waitingDays,
    cooldownDays,
    ageDays,
    approvedEvidenceCount: evidence.length,
    newEvidenceCount: newEvidence.length,
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          createdAt: latest.created_at,
          reviewedAt: latest.reviewed_at,
        }
      : null,
  };
}

export function requestFollowup(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  now: Date = new Date(),
): { followup: FollowupView; eligibility: FollowupEligibility } {
  const report = getPublishedReportRow(db, publicReportId);
  if (report.owner_id !== actor.id) {
    throw forbidden("후속 요청은 제보 작성자만 만들 수 있습니다.");
  }

  const eligibility = getFollowupEligibility(db, report.id, now);
  if (!eligibility.eligible) {
    throw conflict(eligibility.reasons.join(" "), { reasons: eligibility.reasons });
  }

  const events = listStatusEvents(db, report.id);
  const official = [...events]
    .reverse()
    .find((event) => event.kind === "official_source");
  // Unverified moderator notes are included, but labelled as such: omitting them
  // would hide context, and calling them official would be a false claim.
  const claims = events
    .filter(
      (event) => event.kind === "user_claim" || event.kind === "moderator_claim",
    )
    .map((event) => ({
      kind: event.kind,
      status: event.status,
      note: event.note,
      createdAt: event.created_at,
    }));
  const evidence = listApprovedEvidence(db, report.id).filter(
    (item) =>
      new Date(item.createdAt).getTime() >
      new Date(
        latestApprovedFollowupRow(db, report.id)?.created_at ?? report.published_at!,
      ).getTime(),
  );

  const channel = getChannel(report.channel_id);
  const body = generateFollowupDraft({
    title: report.title,
    areaLabel: report.area_label,
    publishedAt: report.published_at!,
    ageDays: eligibility.ageDays,
    official: official
      ? {
          status: official.status,
          note: official.note,
          sourceUrl: official.source_url,
          sourceHost: official.source_host,
          createdAt: official.created_at,
        }
      : null,
    claims,
    evidence: evidence.map((item) => ({ note: item.note, createdAt: item.createdAt })),
    channel: channel ? toPublicChannel(channel) : null,
  });

  const id = internalId("fup");
  run(
    db,
    `INSERT INTO followups
       (id, report_id, requested_by, status, body_json, evidence_count, age_days, created_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`,
    [
      id,
      report.id,
      actor.id,
      JSON.stringify(body),
      evidence.length,
      eligibility.ageDays,
      now.toISOString(),
    ],
  );

  return {
    followup: toView(getFollowupRow(db, id)),
    eligibility: getFollowupEligibility(db, report.id, now),
  };
}

function assertOwnerOfFollowup(db: Db, actor: PublicUser, row: FollowupRow): void {
  const report = one<{ owner_id: string }>(
    db,
    "SELECT owner_id FROM reports WHERE id = ?",
    [row.report_id],
  );
  if (!report || report.owner_id !== actor.id) {
    throw forbidden("작성자만 후속 초안을 검토할 수 있습니다.");
  }
}

export function approveFollowup(
  db: Db,
  actor: PublicUser,
  followupId: string,
  now: Date = new Date(),
): FollowupView {
  const row = getFollowupRow(db, followupId);
  assertOwnerOfFollowup(db, actor, row);
  if (row.status !== "draft") throw conflict("검토 대기 중인 초안이 아닙니다.");

  run(
    db,
    `UPDATE followups
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?
      WHERE id = ? AND status = 'draft'`,
    [actor.id, now.toISOString(), followupId],
  );
  return toView(getFollowupRow(db, followupId));
}

export function discardFollowup(
  db: Db,
  actor: PublicUser,
  followupId: string,
  now: Date = new Date(),
): FollowupView {
  const row = getFollowupRow(db, followupId);
  assertOwnerOfFollowup(db, actor, row);
  if (row.status === "approved") throw conflict("이미 검토를 마친 초안은 버릴 수 없습니다.");
  if (row.status === "discarded") return toView(row);

  run(
    db,
    `UPDATE followups SET status = 'discarded', discarded_at = ? WHERE id = ?`,
    [now.toISOString(), followupId],
  );
  return toView(getFollowupRow(db, followupId));
}

export function listFollowups(db: Db, reportId: string): FollowupView[] {
  return all<FollowupRow>(
    db,
    "SELECT * FROM followups WHERE report_id = ? ORDER BY created_at DESC, rowid DESC",
    [reportId],
  ).map(toView);
}

export function getFollowupForOwner(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  now: Date = new Date(),
): {
  eligibility: FollowupEligibility;
  followups: FollowupView[];
  channel: ReturnType<typeof toPublicChannel> | null;
} {
  const report = getPublishedReportRow(db, publicReportId);
  if (report.owner_id !== actor.id) throw forbidden("작성자만 볼 수 있습니다.");
  const channel = getChannel(report.channel_id);
  return {
    eligibility: getFollowupEligibility(db, report.id, now),
    followups: listFollowups(db, report.id),
    channel: channel ? toPublicChannel(channel) : null,
  };
}
