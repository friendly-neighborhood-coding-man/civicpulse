import type { Db } from "../db/connection.ts";
import { all, one, run, transaction } from "../db/query.ts";
import { conflict, forbidden, notFound } from "../http/errors.ts";
import { isPublicId } from "../ids.ts";
import { removeMedia } from "../services/media-store.ts";
import type { ReportRow } from "./reports.ts";
import type { PublicUser } from "./users.ts";

export type RemovalReason = "owner_withdrawn" | "moderator_takedown";

export type WithdrawalResult = {
  publicId: string;
  state: "removed";
  removedAt: string;
  requestedBy: RemovalReason;
  /** Public routes stop serving the report and its evidence immediately. */
  publicVisibility: "none";
  /** Files actually removed from the local media store. */
  mediaDeleted: number;
  mediaDeleteFailures: number;
};

/**
 * Withdraw or take down a published report.
 *
 * Ordering:
 * 1. Authorise (owner or moderator) and reject non-published states.
 * 2. In one transaction, mark the report removed and delete its public media
 *    row, so no route can resolve a public image afterwards.
 * 3. After commit, delete the public image and every evidence image from disk.
 *
 * The report row, masks, timeline and withdrawal metadata are kept as the
 * record of what was published and why it stopped being public. This is a
 * *visibility* control, not a permanent deletion; see docs/ARCHITECTURE.md for
 * the remaining retention and cache limitations.
 *
 * Idempotent: withdrawing an already-removed report returns its current state
 * without touching media again.
 */
export async function withdrawReport(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  input: { reason?: string } = {},
  now: Date = new Date(),
): Promise<WithdrawalResult> {
  if (!isPublicId(publicReportId, "cp")) throw notFound();
  const row = one<ReportRow>(db, "SELECT * FROM reports WHERE public_id = ?", [
    publicReportId,
  ]);
  if (!row) throw notFound();

  const isOwner = row.owner_id === actor.id;
  const isModerator = actor.role === "moderator";
  if (!isOwner && !isModerator) {
    throw forbidden("작성자 또는 운영자만 공개를 중단할 수 있습니다.");
  }

  if (row.state === "removed") {
    return {
      publicId: row.public_id,
      state: "removed",
      removedAt: row.removed_at ?? now.toISOString(),
      requestedBy: isModerator && !isOwner ? "moderator_takedown" : "owner_withdrawn",
      publicVisibility: "none",
      mediaDeleted: 0,
      mediaDeleteFailures: 0,
    };
  }
  if (row.state !== "published") {
    throw conflict("공개된 제보만 공개를 중단할 수 있습니다.");
  }

  const requestedBy: RemovalReason =
    isModerator && !isOwner ? "moderator_takedown" : "owner_withdrawn";
  // Stored for humans: the machine-readable actor is `requestedBy` in the
  // response, not an English enum rendered into the owner's page.
  const defaultReason =
    requestedBy === "moderator_takedown"
      ? "운영자 조치로 공개 중단"
      : "작성자 요청으로 공개 중단";
  const timestamp = now.toISOString();
  const publicMedia = all<{ storage_key: string }>(
    db,
    "SELECT storage_key FROM report_media WHERE report_id = ? AND role = 'public'",
    [row.id],
  );
  const evidence = all<{ storage_key: string }>(
    db,
    "SELECT storage_key FROM evidence WHERE report_id = ?",
    [row.id],
  );

  transaction(db, () => {
    run(
      db,
      `UPDATE reports
          SET state = 'removed',
              removed_at = ?,
              removed_by = ?,
              removal_reason = ?,
              updated_at = ?
        WHERE id = ? AND state = 'published'`,
      [
        timestamp,
        actor.id,
        input.reason?.trim() || defaultReason,
        timestamp,
        row.id,
      ],
    );
    run(db, "DELETE FROM report_media WHERE report_id = ? AND role = 'public'", [
      row.id,
    ]);
  });

  // Delete bytes only after the database says the report is private again. A
  // failure here leaves an unreachable file, which is safer than deleting a
  // file that a still-public row references.
  let mediaDeleted = 0;
  let mediaDeleteFailures = 0;
  for (const item of publicMedia) {
    try {
      await removeMedia("public", item.storage_key);
      mediaDeleted += 1;
    } catch (error) {
      mediaDeleteFailures += 1;
      console.error("[takedown] public media delete failed", {
        report: row.public_id,
        error,
      });
    }
  }
  for (const item of evidence) {
    try {
      await removeMedia("private", item.storage_key);
      mediaDeleted += 1;
    } catch (error) {
      mediaDeleteFailures += 1;
      console.error("[takedown] evidence media delete failed", {
        report: row.public_id,
        error,
      });
    }
  }

  // The private original/working copies are intentionally retained: they are
  // not publicly reachable and are the evidence trail for the removal decision.
  return {
    publicId: row.public_id,
    state: "removed",
    removedAt: timestamp,
    requestedBy,
    publicVisibility: "none",
    mediaDeleted,
    mediaDeleteFailures,
  };
}
