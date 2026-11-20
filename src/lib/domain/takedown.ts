import type { Db } from "../db/connection.ts";
import { all, one, run, transaction } from "../db/query.ts";
import { conflict, forbidden, notFound } from "../http/errors.ts";
import { internalId, isPublicId } from "../ids.ts";
import { removeMedia, type MediaScope } from "../services/media-store.ts";
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
  /** Files actually removed from the local media store in this call. */
  mediaDeleted: number;
  mediaDeleteFailures: number;
  /** Durable cleanup rows still pending after this call (0 when clean). */
  cleanupPending: number;
};

export type MediaCleanupRow = {
  id: string;
  report_id: string;
  scope: MediaScope;
  storage_key: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
  completed_at: string | null;
};

type RemoveFile = (scope: MediaScope, key: string) => Promise<void>;

export type CleanupResult = {
  completed: number;
  failed: number;
  pending: number;
};

const MAX_ERROR_LENGTH = 300;

/** Pending cleanup rows, oldest first. */
export function listPendingMediaCleanup(
  db: Db,
  limit = 100,
  reportId?: string,
): MediaCleanupRow[] {
  return reportId
    ? all<MediaCleanupRow>(
        db,
        `SELECT * FROM media_cleanup
          WHERE completed_at IS NULL AND report_id = ?
          ORDER BY created_at, rowid
          LIMIT ?`,
        [reportId, limit],
      )
    : all<MediaCleanupRow>(
        db,
        `SELECT * FROM media_cleanup
          WHERE completed_at IS NULL
          ORDER BY created_at, rowid
          LIMIT ?`,
        [limit],
      );
}

export function countPendingMediaCleanup(db: Db): number {
  return (
    one<{ count: number }>(
      db,
      "SELECT COUNT(*) AS count FROM media_cleanup WHERE completed_at IS NULL",
    )?.count ?? 0
  );
}

/**
 * Attempt every pending deletion once.
 *
 * Extracted from the request path so it can be retried after a failure: a
 * filesystem delete can fail for reasons the request cannot fix (permissions,
 * transient I/O, a mounted volume). Before this queue existed, the idempotent
 * `state === 'removed'` early return meant such a file was orphaned forever
 * while the public route had already stopped serving it.
 *
 * The queue is durable in SQLite and holds only storage keys (never personal
 * data), so a restart does not lose the obligation. Attempts and the last error
 * stay observable; bytes are retried until one succeeds.
 */
export async function processMediaCleanup(
  db: Db,
  options: { limit?: number; removeFile?: RemoveFile; reportId?: string } = {},
): Promise<CleanupResult> {
  const rows = listPendingMediaCleanup(
    db,
    options.limit ?? 50,
    options.reportId,
  );
  const remove = options.removeFile ?? removeMedia;
  let completed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await remove(row.scope, row.storage_key);
      run(
        db,
        `UPDATE media_cleanup
            SET completed_at = ?, last_error = NULL, attempts = attempts + 1
          WHERE id = ? AND completed_at IS NULL`,
        [new Date().toISOString(), row.id],
      );
      completed += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : String(error);
      run(
        db,
        `UPDATE media_cleanup
            SET attempts = attempts + 1, last_error = ?
          WHERE id = ? AND completed_at IS NULL`,
        [message.slice(0, MAX_ERROR_LENGTH), row.id],
      );
      console.error("[takedown] media cleanup retry failed", {
        report: row.report_id,
        scope: row.scope,
        attempts: row.attempts + 1,
        error: message,
      });
    }
  }

  return {
    completed,
    failed,
    pending: options.reportId
      ? listPendingMediaCleanup(db, Number.MAX_SAFE_INTEGER, options.reportId).length
      : countPendingMediaCleanup(db),
  };
}

function enqueueMediaCleanup(
  db: Db,
  reportId: string,
  items: Array<{ scope: MediaScope; storage_key: string }>,
  now: Date,
): void {
  for (const item of items) {
    // UNIQUE(scope, storage_key) makes a repeat withdrawal a no-op.
    run(
      db,
      `INSERT OR IGNORE INTO media_cleanup
         (id, report_id, scope, storage_key, created_at, attempts)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [internalId("mcl"), reportId, item.scope, item.storage_key, now.toISOString()],
    );
  }
}

/**
 * Withdraw or take down a published report.
 *
 * Ordering:
 * 1. Authorise (owner or moderator) and reject non-published states.
 * 2. In one transaction, mark the report removed, delete its public media row
 *    and enqueue every public/evidence file for deletion, so no route can
 *    resolve an image and the deletion obligation survives a crash.
 * 3. After commit, attempt the deletions. Failures stay queued, are observable
 *    (`cleanupPending`, `attempts`, `last_error`) and are retried by later
 *    withdrawals and by `processMediaCleanup`.
 *
 * The report row, masks, timeline and withdrawal metadata are kept as the
 * record of what was published and why it stopped being public. This is a
 * *visibility* control, not a permanent deletion; see docs/ARCHITECTURE.md for
 * the remaining retention and cache limitations.
 *
 * Idempotent: withdrawing an already-removed report returns its current state
 * and retries any pending cleanup instead of silently skipping it.
 */
export async function withdrawReport(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  input: { reason?: string; removeFile?: RemoveFile } = {},
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
    // A previous attempt may have left files behind. Retrying here is the whole
    // point: the early return used to make that failure permanent.
    const retried = await processMediaCleanup(db, {
      removeFile: input.removeFile,
      reportId: row.id,
    });
    // Report how the removal originally happened, not who asked again.
    const originallyByOwner = !row.removed_by || row.removed_by === row.owner_id;
    return {
      publicId: row.public_id,
      state: "removed",
      removedAt: row.removed_at ?? now.toISOString(),
      requestedBy: originallyByOwner ? "owner_withdrawn" : "moderator_takedown",
      publicVisibility: "none",
      mediaDeleted: retried.completed,
      mediaDeleteFailures: retried.failed,
      cleanupPending: retried.pending,
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
    enqueueMediaCleanup(
      db,
      row.id,
      [
        ...publicMedia.map((item) => ({
          scope: "public" as const,
          storage_key: item.storage_key,
        })),
        ...evidence.map((item) => ({
          scope: "private" as const,
          storage_key: item.storage_key,
        })),
      ],
      now,
    );
  });

  // Delete bytes only after the database says the report is private again. A
  // failure here leaves an unreachable file with a durable retry record, which
  // is safer than deleting a file a still-public row references.
  const result = await processMediaCleanup(db, {
    removeFile: input.removeFile,
    reportId: row.id,
  });

  // The private original/working copies are intentionally retained: they are
  // not publicly reachable and are the evidence trail for the removal decision.
  return {
    publicId: row.public_id,
    state: "removed",
    removedAt: timestamp,
    requestedBy,
    publicVisibility: "none",
    mediaDeleted: result.completed,
    mediaDeleteFailures: result.failed,
    cleanupPending: result.pending,
  };
}
