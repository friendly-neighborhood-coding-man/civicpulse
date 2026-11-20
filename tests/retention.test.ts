import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { all, one } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  addEvidence,
  reviewEvidence,
  supportIssue,
} from "@/lib/domain/community";
import { getPublicReport, publishReport } from "@/lib/domain/publication";
import { createDraftReport } from "@/lib/domain/reports";
import { countRetentionEligible, runRetention } from "@/lib/domain/retention";
import { withdrawReport } from "@/lib/domain/takedown";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { publicTextReviewToken } from "@/lib/privacy/text";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-retention-"));
  dirs.push(dir);
  process.env.CIVICPULSE_DATA_DIR = dir;
  return { db: openDatabase(path.join(dir, "test.sqlite")), dir };
}

function actor(index: number): PublicUser {
  const user = DEMO_USERS[index]!;
  return toPublicUser({
    id: user.id,
    handle: user.handle,
    display_name: user.displayName,
    role: user.role,
    created_at: new Date().toISOString(),
  });
}

const OWNER = actor(0);
const NEIGHBOUR = actor(1);
const MODERATOR = actor(3);

async function published(db: ReturnType<typeof openDatabase>) {
  const image = await makeTestImage();
  const row = await createDraftReport(db, {
    actor: OWNER,
    input: {
      description: "보도 블록이 들떠 있어서 유모차가 지나가기 위험합니다.",
      category: "sidewalk",
      areaId: "seoul-mapo",
      landmark: "OO초등학교 후문",
    },
    draft: {
      mode: "mock",
      title: "보도 파손 신고",
      description: "현황\n보도 블록이 들떠 있습니다.",
      missingEvidence: [],
      suggestedSteps: [],
      channelId: "safetyreport",
      generatedAt: "2026-01-01T00:00:00.000Z",
      disclosure: "규칙 기반",
    },
    image,
  });
  await publishReport(
    db,
    OWNER,
    row.public_id,
    {
      masks: [SQUARE_MASK],
      ack: {
        privacyReviewed: true,
        consent: true,
        noSensitiveContent: false,
        textReviewed: true,
        textFindingsReviewed: false,
        textToken: publicTextReviewToken(row),
      },
    },
    new Date("2026-01-01T00:00:00.000Z"),
  );
  return row;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("retention purge", () => {
  it("deletes a long-removed report and its private files but keeps published reports", async () => {
    const { db, dir } = tempDb();
    const removed = await published(db);
    supportIssue(db, NEIGHBOUR, removed.public_id);
    await withdrawReport(
      db,
      OWNER,
      removed.public_id,
      {},
      new Date("2026-01-02T00:00:00.000Z"),
    );
    const live = await published(db);

    const privateBefore = fs.readdirSync(path.join(dir, "media", "private")).length;
    expect(privateBefore).toBeGreaterThanOrEqual(2);
    expect(
      countRetentionEligible(db, new Date("2026-04-01T00:00:00.000Z"), 30),
    ).toEqual({ reports: 1, evidence: 0 });

    const result = await runRetention(db, {
      now: new Date("2026-04-01T00:00:00.000Z"),
      days: 30,
    });
    expect(result.purgedReports).toBe(1);
    expect(result.cleanupPending).toBe(0);

    // The removed report's row, supports and audit text are gone.
    expect(one(db, "SELECT id FROM reports WHERE id = ?", [removed.id])).toBeUndefined();
    expect(
      all(db, "SELECT report_id FROM supports WHERE report_id = ?", [removed.id]),
    ).toHaveLength(0);
    // Its private originals were deleted through the queue.
    expect(fs.readdirSync(path.join(dir, "media", "private"))).toHaveLength(
      privateBefore - 2,
    );

    // A published report inside the window is untouched.
    expect(() => getPublicReport(db, live.public_id)).not.toThrow();
    db.close();
  });

  it("purges rejected evidence after the window but never approved evidence", async () => {
    const { db, dir } = tempDb();
    const row = await published(db);

    const rejectedImage = await makeTestImage();
    const rejected = await addEvidence(
      db,
      NEIGHBOUR,
      row.public_id,
      { note: "반려될 근거 사진입니다.", ackNoSensitive: true, image: rejectedImage },
      new Date("2026-01-03T00:00:00.000Z"),
    );
    reviewEvidence(
      db,
      MODERATOR,
      rejected.id,
      "rejected",
      "제보와 무관함",
      new Date("2026-01-04T00:00:00.000Z"),
    );
    const approvedImage = await makeTestImage();
    const approved = await addEvidence(
      db,
      NEIGHBOUR,
      row.public_id,
      { note: "승인되어 남아야 하는 근거입니다.", ackNoSensitive: true, image: approvedImage },
      new Date("2026-01-03T00:00:00.000Z"),
    );
    reviewEvidence(
      db,
      MODERATOR,
      approved.id,
      "approved",
      undefined,
      new Date("2026-01-04T00:00:00.000Z"),
    );

    const before = fs.readdirSync(path.join(dir, "media", "private")).length;
    const result = await runRetention(db, {
      now: new Date("2026-04-01T00:00:00.000Z"),
      days: 30,
    });
    expect(result.purgedEvidence).toBe(1);
    expect(one(db, "SELECT id FROM evidence WHERE id = ?", [rejected.id])).toBeUndefined();
    expect(one(db, "SELECT id FROM evidence WHERE id = ?", [approved.id])).toBeTruthy();
    expect(fs.readdirSync(path.join(dir, "media", "private"))).toHaveLength(before - 1);
    db.close();
  });

  it("does nothing inside the retention window", async () => {
    const { db } = tempDb();
    const row = await published(db);
    await withdrawReport(db, OWNER, row.public_id, {}, new Date("2026-03-01T00:00:00.000Z"));

    const result = await runRetention(db, {
      now: new Date("2026-03-05T00:00:00.000Z"),
      days: 30,
    });
    expect(result.purgedReports).toBe(0);
    expect(one(db, "SELECT id FROM reports WHERE id = ?", [row.id])).toBeTruthy();
    db.close();
  });
});
