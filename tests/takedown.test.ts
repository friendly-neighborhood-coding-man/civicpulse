import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { all, one } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  addEvidence,
  addStatusEvent,
  getIssueDetail,
  reviewEvidence,
  supportIssue,
} from "@/lib/domain/community";
import { getFollowupEligibility } from "@/lib/domain/followup";
import { getPublicReport, publishReport } from "@/lib/domain/publication";
import { createDraftReport } from "@/lib/domain/reports";
import { withdrawReport } from "@/lib/domain/takedown";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { publicTextReviewToken } from "@/lib/privacy/text";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-takedown-"));
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

function expectStatus(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    return;
  }
  throw new Error(`expected an ApiError with status ${status}`);
}

async function createDraft(db: ReturnType<typeof openDatabase>) {
  const image = await makeTestImage();
  return createDraftReport(db, {
    actor: OWNER,
    input: {
      description: "보도 블록이 들떠 있어서 유모차가 지나가기 위험합니다.",
      category: "sidewalk",
      areaId: "seoul-mapo",
      landmark: "OO초등학교 후문",
    },
    draft: {
      mode: "mock",
      title: "OO초등학교 후문 인근 보도 파손 신고",
      description: "현황\n보도 블록이 들떠 있습니다.\n\n위치\n서울 마포구",
      missingEvidence: [],
      suggestedSteps: [],
      channelId: "safetyreport",
      generatedAt: new Date().toISOString(),
      disclosure: "규칙 기반",
    },
    image,
  });
}

async function publishedReport(db: ReturnType<typeof openDatabase>) {
  const row = await createDraft(db);
  await publishReport(db, OWNER, row.public_id, {
    masks: [SQUARE_MASK],
    ack: {
      privacyReviewed: true,
      consent: true,
      noSensitiveContent: false,
      textReviewed: true,
      textFindingsReviewed: false,
      textToken: publicTextReviewToken(row),
    },
  });
  return row;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("withdrawal and takedown", () => {
  it("hides the report, its evidence and its public media from every public surface", async () => {
    const { db, dir } = tempDb();
    const row = await publishedReport(db);

    const image = await makeTestImage();
    const evidence = await addEvidence(db, NEIGHBOUR, row.public_id, {
      note: "오늘 아침에도 같은 자리가 그대로였습니다.",
      ackNoSensitive: true,
      image,
    });
    reviewEvidence(db, MODERATOR, evidence.id, "approved", undefined);
    supportIssue(db, NEIGHBOUR, row.public_id);
    addStatusEvent(db, OWNER, row.public_id, {
      kind: "user_claim",
      status: "unresolved",
      note: "아직 보수되지 않았습니다.",
    });

    expect(fs.readdirSync(path.join(dir, "media", "public"))).toHaveLength(1);
    expect(fs.readdirSync(path.join(dir, "media", "private"))).toHaveLength(3);

    const result = await withdrawReport(db, OWNER, row.public_id);
    expect(result).toMatchObject({
      publicId: row.public_id,
      state: "removed",
      requestedBy: "owner_withdrawn",
      publicVisibility: "none",
    });
    expect(result.mediaDeleted).toBeGreaterThanOrEqual(2);

    // Every public read surface is closed.
    expectStatus(() => getPublicReport(db, row.public_id), 404);
    expectStatus(() => getIssueDetail(db, row.public_id, null), 404);
    expectStatus(() => supportIssue(db, NEIGHBOUR, row.public_id), 404);
    expectStatus(
      () =>
        addStatusEvent(db, OWNER, row.public_id, {
          kind: "user_claim",
          status: "unresolved",
          note: "공개 중단 후에는 기록할 수 없어야 합니다.",
        }),
      404,
    );
    expect(() => getFollowupEligibility(db, row.id, new Date())).toThrow(ApiError);

    // Public copy and every evidence byte are gone; the audit record remains.
    expect(fs.readdirSync(path.join(dir, "media", "public"))).toEqual([]);
    expect(fs.readdirSync(path.join(dir, "media", "private"))).toHaveLength(2);
    expect(
      all(db, "SELECT id FROM report_media WHERE report_id = ? AND role = 'public'", [
        row.id,
      ]),
    ).toHaveLength(0);

    const stored = one<{
      state: string;
      removed_at: string | null;
      removed_by: string | null;
      removal_reason: string | null;
    }>(
      db,
      "SELECT state, removed_at, removed_by, removal_reason FROM reports WHERE id = ?",
      [row.id],
    );
    expect(stored?.state).toBe("removed");
    expect(stored?.removed_by).toBe(OWNER.id);
    expect(stored?.removal_reason).toBe("작성자 요청으로 공개 중단");
    expect(stored?.removed_at).toBeTruthy();
    db.close();
  });

  it("allows a moderator takedown but not another citizen", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    await expect(withdrawReport(db, NEIGHBOUR, row.public_id)).rejects.toMatchObject({
      status: 403,
    });

    const result = await withdrawReport(db, MODERATOR, row.public_id, {
      reason: "개인정보 노출 신고가 접수되었습니다.",
    });
    expect(result.requestedBy).toBe("moderator_takedown");

    const stored = one<{ removed_by: string; removal_reason: string }>(
      db,
      "SELECT removed_by, removal_reason FROM reports WHERE id = ?",
      [row.id],
    );
    expect(stored?.removed_by).toBe(MODERATOR.id);
    expect(stored?.removal_reason).toBe("개인정보 노출 신고가 접수되었습니다.");
    db.close();
  });

  it("refuses unpublished reports, unknown ids, and repeats idempotently", async () => {
    const { db } = tempDb();
    const draftRow = await createDraft(db);

    await expect(withdrawReport(db, OWNER, draftRow.public_id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(withdrawReport(db, OWNER, "cp_doesnotexist")).rejects.toMatchObject({
      status: 404,
    });

    const row = await publishedReport(db);
    const first = await withdrawReport(db, OWNER, row.public_id);
    const second = await withdrawReport(db, OWNER, row.public_id);
    expect(second.removedAt).toBe(first.removedAt);
    expect(second.mediaDeleted).toBe(0);
    db.close();
  });
});
