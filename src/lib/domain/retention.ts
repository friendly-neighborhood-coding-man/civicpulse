import type { Db } from "../db/connection.ts";
import { all, one, run } from "../db/query.ts";
import { getRetentionDays } from "../config.ts";
import type { MediaScope } from "../services/media-store.ts";
import { processMediaCleanup, queueMediaDeletion } from "./takedown.ts";

/**
 * Retention purge.
 *
 * The product keeps a removed report's row so the removal is auditable, but it
 * must not keep the citizen's text and private photos forever. After the
 * configured retention window a removed report is deleted in full: its text,
 * evidence, masks, status events, supports and follow-ups are removed by the
 * report-row cascade, and every remaining file is queued through the same
 * durable cleanup used by withdrawal, which outlives the row.
 *
 * Rejected evidence that never became public is also purged after the window:
 * it is personal material with no audit value once the moderation decision is
 * recorded.
 *
 * This is a bounded, idempotent job. It is triggered by a moderator-only
 * endpoint and reported by `/api/health`; there is no background scheduler in
 * this single-process deployment (documented in docs/DEPLOYMENT.md).
 */

export type RetentionResult = {
  retentionDays: number;
  cutoff: string;
  purgedReports: number;
  purgedEvidence: number;
  queuedFiles: number;
  cleanupPending: number;
};

function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function countRetentionEligible(
  db: Db,
  now: Date = new Date(),
  days: number = getRetentionDays(),
): { reports: number; evidence: number } {
  const cutoff = cutoffIso(now, days);
  return {
    reports:
      one<{ count: number }>(
        db,
        `SELECT COUNT(*) AS count FROM reports
          WHERE state = 'removed' AND removed_at IS NOT NULL AND removed_at <= ?`,
        [cutoff],
      )?.count ?? 0,
    evidence:
      one<{ count: number }>(
        db,
        `SELECT COUNT(*) AS count FROM evidence
          WHERE status = 'rejected' AND reviewed_at IS NOT NULL AND reviewed_at <= ?`,
        [cutoff],
      )?.count ?? 0,
  };
}

export async function runRetention(
  db: Db,
  options: {
    now?: Date;
    days?: number;
    removeFile?: (scope: MediaScope, key: string) => Promise<void>;
  } = {},
): Promise<RetentionResult> {
  const now = options.now ?? new Date();
  const days = options.days ?? getRetentionDays();
  const cutoff = cutoffIso(now, days);

  const removedReports = all<{ id: string; public_id: string }>(
    db,
    `SELECT id, public_id FROM reports
      WHERE state = 'removed' AND removed_at IS NOT NULL AND removed_at <= ?
      ORDER BY removed_at`,
    [cutoff],
  );

  let purgedReports = 0;
  for (const report of removedReports) {
    const media = all<{ scope: MediaScope; storage_key: string }>(
      db,
      `SELECT 'public' AS scope, storage_key FROM report_media WHERE report_id = ?
       UNION ALL
       SELECT 'private' AS scope, storage_key FROM report_media WHERE report_id = ?
       UNION ALL
       SELECT 'private' AS scope, storage_key FROM evidence WHERE report_id = ?`,
      [report.id, report.id, report.id],
    );
    queueMediaDeletion(db, report.id, media, now);
    // Cascades through evidence, masks, status events, supports, follow-ups and
    // report_media. media_cleanup deliberately has no FK, so the queued keys and
    // their errors survive this delete.
    run(db, "DELETE FROM reports WHERE id = ?", [report.id]);
    purgedReports += 1;
  }

  const rejected = all<{ id: string; report_id: string; storage_key: string }>(
    db,
    `SELECT id, report_id, storage_key FROM evidence
      WHERE status = 'rejected' AND reviewed_at IS NOT NULL AND reviewed_at <= ?`,
    [cutoff],
  );
  for (const item of rejected) {
    queueMediaDeletion(
      db,
      item.report_id,
      [{ scope: "private", storage_key: item.storage_key }],
      now,
    );
    run(db, "DELETE FROM evidence WHERE id = ?", [item.id]);
  }

  const cleanup = await processMediaCleanup(db, { removeFile: options.removeFile });

  return {
    retentionDays: days,
    cutoff,
    purgedReports,
    purgedEvidence: rejected.length,
    queuedFiles: cleanup.completed + cleanup.failed,
    cleanupPending: cleanup.pending,
  };
}
