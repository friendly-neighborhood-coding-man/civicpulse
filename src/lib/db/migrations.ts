import type { DatabaseSync } from "node:sqlite";

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
];
