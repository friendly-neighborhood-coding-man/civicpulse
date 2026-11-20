import type { DatabaseSync } from "node:sqlite";

import {
  checkOfficialSourceUrl,
  parseSupportingSourceUrl,
} from "../domain/official-sources.ts";

export type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};

/**
 * Append-only migration list. Each entry runs exactly once per database, inside
 * a transaction, keyed by SQLite's `user_version`.
 *
 * Rules:
 * - Never edit a released migration; append a new one.
 * - Destructive changes need an explicit, documented data migration.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "foundation: users and report core",
    up(db) {
      db.exec(`
        CREATE TABLE users (
          id            TEXT PRIMARY KEY,
          handle        TEXT NOT NULL UNIQUE,
          display_name  TEXT NOT NULL,
          role          TEXT NOT NULL CHECK (role IN ('citizen', 'moderator')),
          created_at    TEXT NOT NULL
        );

        CREATE TABLE reports (
          id            TEXT PRIMARY KEY,
          public_id     TEXT NOT NULL UNIQUE,
          owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title         TEXT NOT NULL DEFAULT '',
          description   TEXT NOT NULL DEFAULT '',
          category      TEXT NOT NULL DEFAULT 'other',
          area_label    TEXT NOT NULL DEFAULT '',
          -- Precise coordinates are private and never serialized publicly.
          lat           REAL,
          lng           REAL,
          -- Rounded coordinates are the only ones allowed in public views.
          public_lat    REAL,
          public_lng    REAL,
          state         TEXT NOT NULL DEFAULT 'draft'
                        CHECK (state IN ('draft', 'published', 'removed')),
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE INDEX reports_owner_idx ON reports(owner_id);
        CREATE INDEX reports_state_idx ON reports(state, updated_at DESC);
      `);
    },
  },
  {
    version: 2,
    name: "report creation: user input, assistant output and private media",
    up(db) {
      db.exec(`
        -- The text the citizen originally typed is kept separately from the
        -- editable draft so a later reviewer can see what the assistant changed.
        ALTER TABLE reports ADD COLUMN user_description TEXT NOT NULL DEFAULT '';
        ALTER TABLE reports ADD COLUMN landmark TEXT NOT NULL DEFAULT '';
        ALTER TABLE reports ADD COLUMN area_id TEXT NOT NULL DEFAULT '';

        ALTER TABLE reports ADD COLUMN assistant_mode TEXT;
        ALTER TABLE reports ADD COLUMN assistant_generated_at TEXT;
        ALTER TABLE reports ADD COLUMN missing_evidence TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE reports ADD COLUMN suggested_steps TEXT NOT NULL DEFAULT '[]';

        ALTER TABLE reports ADD COLUMN channel_id TEXT;
        ALTER TABLE reports ADD COLUMN channel_checked_at TEXT;

        CREATE TABLE report_media (
          id           TEXT PRIMARY KEY,
          report_id    TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          role         TEXT NOT NULL CHECK (role IN ('original', 'working', 'public')),
          storage_key  TEXT NOT NULL UNIQUE,
          mime         TEXT NOT NULL,
          width        INTEGER NOT NULL,
          height       INTEGER NOT NULL,
          bytes        INTEGER NOT NULL,
          created_at   TEXT NOT NULL
        );

        CREATE INDEX report_media_report_idx ON report_media(report_id, role);
      `);
    },
  },
  {
    version: 3,
    name: "privacy: publication consent and redaction audit trail",
    up(db) {
      db.exec(`
        ALTER TABLE reports ADD COLUMN published_at TEXT;
        ALTER TABLE reports ADD COLUMN privacy_reviewed_at TEXT;
        ALTER TABLE reports ADD COLUMN consent_version TEXT;

        -- One row per rectangle the human confirmed before publication. Kept as
        -- an audit trail of what was hidden, never rendered to the public.
        CREATE TABLE redaction_masks (
          id          TEXT PRIMARY KEY,
          report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          x           REAL NOT NULL CHECK (x >= 0 AND x < 1),
          y           REAL NOT NULL CHECK (y >= 0 AND y < 1),
          w           REAL NOT NULL CHECK (w > 0 AND w <= 1),
          h           REAL NOT NULL CHECK (h > 0 AND h <= 1),
          mode        TEXT NOT NULL CHECK (mode IN ('pixelate', 'blur', 'solid')),
          source      TEXT NOT NULL CHECK (source IN ('manual', 'auto')),
          created_at  TEXT NOT NULL
        );

        CREATE INDEX redaction_masks_report_idx ON redaction_masks(report_id);
      `);
    },
  },
  {
    version: 4,
    name: "community: support, moderated evidence and status events",
    up(db) {
      db.exec(`
        -- One row per citizen per issue. The primary key is the abuse guard:
        -- repeated taps can never inflate a count.
        CREATE TABLE supports (
          report_id  TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (report_id, user_id)
        );

        CREATE TABLE evidence (
          id                TEXT PRIMARY KEY,
          report_id         TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          user_id           TEXT NOT NULL REFERENCES users(id),
          storage_key       TEXT NOT NULL,
          mime              TEXT NOT NULL,
          width             INTEGER NOT NULL,
          height            INTEGER NOT NULL,
          note              TEXT NOT NULL,
          status            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
          reviewed_by       TEXT REFERENCES users(id),
          reviewed_at       TEXT,
          rejection_reason  TEXT,
          created_at        TEXT NOT NULL
        );
        CREATE INDEX evidence_report_idx ON evidence(report_id, status, created_at);
        CREATE INDEX evidence_queue_idx ON evidence(status, created_at);

        -- Citizen claims and official updates are separate rows with separate
        -- authorship rules; the UI never merges them into one ambiguous status.
        CREATE TABLE status_events (
          id          TEXT PRIMARY KEY,
          report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          kind        TEXT NOT NULL CHECK (kind IN ('official', 'user_claim', 'mock')),
          status      TEXT NOT NULL CHECK (status IN
                        ('open','acknowledged','in_progress','resolved','unresolved','recurred')),
          note        TEXT NOT NULL,
          source_url  TEXT,
          created_by  TEXT NOT NULL REFERENCES users(id),
          created_at  TEXT NOT NULL
        );
        CREATE INDEX status_events_report_idx ON status_events(report_id, created_at);
      `);
    },
  },
  {
    version: 5,
    name: "follow-up drafts with human approval",
    up(db) {
      db.exec(`
        -- A follow-up is a *draft for a human to submit themselves*. There is
        -- no 'sent' state: the application never transmits it anywhere.
        CREATE TABLE followups (
          id             TEXT PRIMARY KEY,
          report_id      TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          requested_by   TEXT NOT NULL REFERENCES users(id),
          status         TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'discarded')),
          body_json      TEXT NOT NULL,
          evidence_count INTEGER NOT NULL,
          age_days       INTEGER NOT NULL,
          created_at     TEXT NOT NULL,
          reviewed_by    TEXT REFERENCES users(id),
          reviewed_at    TEXT,
          discarded_at   TEXT
        );
        CREATE INDEX followups_report_idx ON followups(report_id, created_at);
        CREATE INDEX followups_status_idx ON followups(status, created_at);
      `);
    },
  },
  {
    version: 6,
    name: "trust: public text review and official-source provenance",
    up(db) {
      db.exec(`
        -- Text copied from a private draft into the public page requires its own
        -- review. These columns record that a human read the public text and how
        -- many heuristic candidates were shown (counts/kinds only, never values).
        ALTER TABLE reports ADD COLUMN text_reviewed_at TEXT;
        ALTER TABLE reports ADD COLUMN text_review_version TEXT;
        ALTER TABLE reports ADD COLUMN text_findings TEXT NOT NULL DEFAULT '[]';

        -- Status provenance is rebuilt because the previous CHECK constraint
        -- conflated "moderator typed a URL" with "official government record".
        CREATE TABLE status_events_v2 (
          id                TEXT PRIMARY KEY,
          report_id         TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          kind              TEXT NOT NULL CHECK (kind IN
                              ('official_source','moderator_claim','user_claim','mock')),
          status            TEXT NOT NULL CHECK (status IN
                              ('open','acknowledged','in_progress','resolved','unresolved','recurred')),
          note              TEXT NOT NULL,
          source_url        TEXT,
          -- Verified portal host (for official_source) or the real host of a
          -- supporting link, so the UI can show where a link actually points.
          source_host       TEXT,
          -- Registry as-of date: when the cited portal was last checked.
          source_checked_at TEXT,
          created_by        TEXT NOT NULL REFERENCES users(id),
          created_at        TEXT NOT NULL
        );
      `);

      // Reclassify existing rows with the same rule the write path now uses.
      // A legacy 'official' row whose source is not a verified portal becomes a
      // moderator claim: the old UI overstated it, and this migration must not
      // preserve that overstatement.
      const legacy = db
        .prepare(
          `SELECT id, report_id, kind, status, note, source_url, created_by, created_at
             FROM status_events
            ORDER BY created_at, rowid`,
        )
        .all() as unknown as Array<{
        id: string;
        report_id: string;
        kind: string;
        status: string;
        note: string;
        source_url: string | null;
        created_by: string;
        created_at: string;
      }>;

      const insert = db.prepare(
        `INSERT INTO status_events_v2
           (id, report_id, kind, status, note, source_url, source_host, source_checked_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const row of legacy) {
        let kind = row.kind;
        let sourceUrl = row.source_url;
        let sourceHost: string | null = null;
        let sourceCheckedAt: string | null = null;

        if (row.kind === "official") {
          const checked = sourceUrl ? checkOfficialSourceUrl(sourceUrl) : null;
          if (checked?.ok) {
            kind = "official_source";
            sourceUrl = checked.url;
            sourceHost = checked.host;
            sourceCheckedAt = checked.registry.asOf;
          } else {
            kind = "moderator_claim";
            const supporting = parseSupportingSourceUrl(sourceUrl ?? undefined);
            sourceHost = supporting.ok ? supporting.host : null;
            sourceCheckedAt = null;
          }
        } else {
          // Citizen claims and mock rows never carry a source link.
          sourceUrl = null;
        }

        insert.run(
          row.id,
          row.report_id,
          kind,
          row.status,
          row.note,
          sourceUrl,
          sourceHost,
          sourceCheckedAt,
          row.created_by,
          row.created_at,
        );
      }

      db.exec(`
        DROP TABLE status_events;
        ALTER TABLE status_events_v2 RENAME TO status_events;
        CREATE INDEX status_events_report_idx ON status_events(report_id, created_at);
      `);
    },
  },
  {
    version: 7,
    name: "follow-up support snapshot and public withdrawal",
    up(db) {
      db.exec(`
        -- Support at draft time. Follow-up eligibility never depends on it; the
        -- draft only reports community interest as context.
        ALTER TABLE followups ADD COLUMN support_count INTEGER NOT NULL DEFAULT 0;

        -- Withdrawal/takedown keeps the row (and its audit trail) but removes the
        -- report from every public surface.
        ALTER TABLE reports ADD COLUMN removed_at TEXT;
        ALTER TABLE reports ADD COLUMN removed_by TEXT REFERENCES users(id);
        ALTER TABLE reports ADD COLUMN removal_reason TEXT;
      `);
    },
  },
  {
    version: 8,
    name: "durable media cleanup queue",
    up(db) {
      db.exec(`
        -- A filesystem delete can fail after the report is already private.
        -- The obligation is stored here so a retry is possible after a restart,
        -- instead of being lost by the idempotent "already removed" path.
        -- Only storage keys are stored: no report text, notes or personal data.
        CREATE TABLE media_cleanup (
          id           TEXT PRIMARY KEY,
          report_id    TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          scope        TEXT NOT NULL CHECK (scope IN ('public','private')),
          storage_key  TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          attempts     INTEGER NOT NULL DEFAULT 0,
          last_error   TEXT,
          completed_at TEXT,
          UNIQUE (scope, storage_key)
        );
        CREATE INDEX media_cleanup_pending_idx
          ON media_cleanup(completed_at, created_at);
      `);
    },
  },
  {
    version: 9,
    name: "real identity, account deletion and retention purge",
    up(db) {
      db.exec(`
        -- Password identity is additive: demo accounts keep NULL email/hash and
        -- the standalone demo stays password-free by default.
        ALTER TABLE users ADD COLUMN email TEXT;
        ALTER TABLE users ADD COLUMN password_hash TEXT;
        ALTER TABLE users ADD COLUMN deleted_at TEXT;
        CREATE UNIQUE INDEX users_email_idx ON users(email) WHERE email IS NOT NULL;

        -- Retention deletes a report row after queueing its files. The queue must
        -- outlive that row, so the cascade FK is removed (keys only, no content).
        CREATE TABLE media_cleanup_v2 (
          id           TEXT PRIMARY KEY,
          report_id    TEXT NOT NULL,
          scope        TEXT NOT NULL CHECK (scope IN ('public','private')),
          storage_key  TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          attempts     INTEGER NOT NULL DEFAULT 0,
          last_error   TEXT,
          completed_at TEXT,
          UNIQUE (scope, storage_key)
        );
        INSERT INTO media_cleanup_v2
          (id, report_id, scope, storage_key, created_at, attempts, last_error, completed_at)
        SELECT id, report_id, scope, storage_key, created_at, attempts, last_error, completed_at
          FROM media_cleanup;
        DROP TABLE media_cleanup;
        ALTER TABLE media_cleanup_v2 RENAME TO media_cleanup;
        CREATE INDEX media_cleanup_pending_idx
          ON media_cleanup(completed_at, created_at);
      `);
    },
  },
];
