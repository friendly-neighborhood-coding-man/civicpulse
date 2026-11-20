import type { Db } from "../db/connection.ts";
import { all, one, run } from "../db/query.ts";
import { anonymizeUser, type PublicUser } from "./users.ts";
import { processMediaCleanup, queueMediaDeletion, withdrawReport } from "./takedown.ts";
import type { MediaScope } from "../services/media-store.ts";

/**
 * Account data export and deletion.
 *
 * Scope rules:
 * - export contains only rows the account owns or authored; never another
 *   account's identity, storage keys, precise coordinates or private drafts;
 * - deletion removes the account's content and identity, but keeps the
 *   anonymised user row because historical rows reference it. Published reports
 *   are withdrawn first (public visibility closes immediately), then the
 *   account's own files are queued through the same durable cleanup used by
 *   takedown.
 */

export type AccountExport = {
  exportedAt: string;
  account: {
    id: string;
    handle: string;
    displayName: string;
    role: PublicUser["role"];
    email: string | null;
    createdAt: string;
  };
  reports: Array<{
    publicId: string;
    state: string;
    title: string;
    description: string;
    originalDescription: string;
    category: string;
    areaLabel: string;
    landmark: string;
    createdAt: string;
    publishedAt: string | null;
    removedAt: string | null;
    removalReason: string | null;
  }>;
  evidence: Array<{
    id: string;
    reportPublicId: string;
    note: string;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
  }>;
  statusEvents: Array<{
    id: string;
    reportPublicId: string;
    kind: string;
    status: string;
    note: string;
    createdAt: string;
  }>;
  supports: Array<{ reportPublicId: string; createdAt: string }>;
  followups: Array<{
    id: string;
    reportPublicId: string;
    status: string;
    body: unknown;
    createdAt: string;
    reviewedAt: string | null;
  }>;
  notes: string[];
};

export function exportAccountData(
  db: Db,
  actor: PublicUser,
  now: Date = new Date(),
): AccountExport {
  const account = one<{
    id: string;
    handle: string;
    display_name: string;
    role: PublicUser["role"];
    email: string | null;
    created_at: string;
  }>(
    db,
    `SELECT id, handle, display_name, role, email, created_at
       FROM users WHERE id = ? AND deleted_at IS NULL`,
    [actor.id],
  );
  if (!account) throw new Error("account disappeared during export");

  const reports = all<{
    public_id: string;
    state: string;
    title: string;
    description: string;
    user_description: string;
    category: string;
    area_label: string;
    landmark: string;
    created_at: string;
    published_at: string | null;
    removed_at: string | null;
    removal_reason: string | null;
  }>(
    db,
    `SELECT public_id, state, title, description, user_description, category,
            area_label, landmark, created_at, published_at, removed_at, removal_reason
       FROM reports
      WHERE owner_id = ?
      ORDER BY created_at`,
    [actor.id],
  );

  const evidence = all<{
    id: string;
    public_id: string;
    note: string;
    status: string;
    created_at: string;
    reviewed_at: string | null;
  }>(
    db,
    `SELECT e.id, r.public_id, e.note, e.status, e.created_at, e.reviewed_at
       FROM evidence e
       JOIN reports r ON r.id = e.report_id
      WHERE e.user_id = ?
      ORDER BY e.created_at`,
    [actor.id],
  );

  const statusEvents = all<{
    id: string;
    public_id: string;
    kind: string;
    status: string;
    note: string;
    created_at: string;
  }>(
    db,
    `SELECT s.id, r.public_id, s.kind, s.status, s.note, s.created_at
       FROM status_events s
       JOIN reports r ON r.id = s.report_id
      WHERE s.created_by = ?
      ORDER BY s.created_at, s.rowid`,
    [actor.id],
  );

  const supports = all<{ public_id: string; created_at: string }>(
    db,
    `SELECT r.public_id, s.created_at
       FROM supports s
       JOIN reports r ON r.id = s.report_id
      WHERE s.user_id = ?
      ORDER BY s.created_at`,
    [actor.id],
  );

  const followups = all<{
    id: string;
    public_id: string;
    status: string;
    body_json: string;
    created_at: string;
    reviewed_at: string | null;
  }>(
    db,
    `SELECT f.id, r.public_id, f.status, f.body_json, f.created_at, f.reviewed_at
       FROM followups f
       JOIN reports r ON r.id = f.report_id
      WHERE f.requested_by = ?
      ORDER BY f.created_at`,
    [actor.id],
  );

  return {
    exportedAt: now.toISOString(),
    account: {
      id: account.id,
      handle: account.handle,
      displayName: account.display_name,
      role: account.role,
      email: account.email,
      createdAt: account.created_at,
    },
    reports: reports.map((row) => ({
      publicId: row.public_id,
      state: row.state,
      title: row.title,
      description: row.description,
      originalDescription: row.user_description,
      category: row.category,
      areaLabel: row.area_label,
      landmark: row.landmark,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      removedAt: row.removed_at,
      removalReason: row.removal_reason,
    })),
    evidence: evidence.map((row) => ({
      id: row.id,
      reportPublicId: row.public_id,
      note: row.note,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    })),
    statusEvents: statusEvents.map((row) => ({
      id: row.id,
      reportPublicId: row.public_id,
      kind: row.kind,
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
    })),
    supports: supports.map((row) => ({
      reportPublicId: row.public_id,
      createdAt: row.created_at,
    })),
    followups: followups.map((row) => {
      let body: unknown = null;
      try {
        body = JSON.parse(row.body_json);
      } catch {
        body = null;
      }
      return {
        id: row.id,
        reportPublicId: row.public_id,
        status: row.status,
        body,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
      };
    }),
    notes: [
      "This export contains only data owned or authored by this account.",
      "Password hashes, other accounts' identities and internal media storage keys are never exported.",
      "Reports are not sent to any agency by CivicPulse.",
    ],
  };
}

export type AccountDeletionResult = {
  reportsWithdrawn: number;
  reportsDeleted: number;
  evidenceDeleted: number;
  supportsDeleted: number;
  statusEventsDeleted: number;
  followupsDeleted: number;
  filesQueued: number;
  cleanupPending: number;
};

export async function deleteAccount(
  db: Db,
  actor: PublicUser,
  now: Date = new Date(),
): Promise<AccountDeletionResult> {
  const owned = all<{ id: string; public_id: string; state: string }>(
    db,
    "SELECT id, public_id, state FROM reports WHERE owner_id = ?",
    [actor.id],
  );

  let reportsWithdrawn = 0;
  let reportsDeleted = 0;
  let filesQueued = 0;

  for (const report of owned) {
    if (report.state === "published") {
      // Closes every public route immediately and queues its files.
      await withdrawReport(db, actor, report.public_id, {}, now);
      reportsWithdrawn += 1;
      continue;
    }

    const media = all<{ scope: MediaScope; storage_key: string }>(
      db,
      `SELECT 'public' AS scope, storage_key FROM report_media
        WHERE report_id = ? AND role = 'public'
       UNION ALL
       SELECT 'private' AS scope, storage_key FROM report_media
        WHERE report_id = ? AND role IN ('original','working')
       UNION ALL
       SELECT 'private' AS scope, storage_key FROM evidence WHERE report_id = ?`,
      [report.id, report.id, report.id],
    );
    filesQueued += queueMediaDeletion(db, report.id, media, now);
    // The report row is the personal content: remove it (dependants cascade).
    run(db, "DELETE FROM reports WHERE id = ? AND owner_id = ?", [
      report.id,
      actor.id,
    ]);
    reportsDeleted += 1;
  }

  // Evidence this account added to other people's reports, and the files.
  const foreignEvidence = all<{ id: string; report_id: string; storage_key: string }>(
    db,
    "SELECT id, report_id, storage_key FROM evidence WHERE user_id = ?",
    [actor.id],
  );
  for (const item of foreignEvidence) {
    filesQueued += queueMediaDeletion(
      db,
      item.report_id,
      [{ scope: "private", storage_key: item.storage_key }],
      now,
    );
    run(db, "DELETE FROM evidence WHERE id = ?", [item.id]);
  }

  const supportsDeleted = run(db, "DELETE FROM supports WHERE user_id = ?", [
    actor.id,
  ]).changes;
  const statusEventsDeleted = run(
    db,
    "DELETE FROM status_events WHERE created_by = ?",
    [actor.id],
  ).changes;
  const followupsDeleted = run(
    db,
    "DELETE FROM followups WHERE requested_by = ?",
    [actor.id],
  ).changes;

  anonymizeUser(db, actor.id, now);

  await processMediaCleanup(db);
  const queued = one<{ count: number }>(
    db,
    "SELECT COUNT(*) AS count FROM media_cleanup WHERE completed_at IS NULL",
  )?.count;

  return {
    reportsWithdrawn,
    reportsDeleted,
    evidenceDeleted: foreignEvidence.length,
    supportsDeleted,
    statusEventsDeleted,
    followupsDeleted,
    filesQueued,
    cleanupPending: queued ?? 0,
  };
}
