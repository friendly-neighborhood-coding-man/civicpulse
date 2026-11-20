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
} from "@/lib/domain/community";
import { getFollowupEligibility, requestFollowup } from "@/lib/domain/followup";
import { buildPublicTextReview, publishReport } from "@/lib/domain/publication";
import { createDraftReport } from "@/lib/domain/reports";
import { processMediaCleanup, withdrawReport } from "@/lib/domain/takedown";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { publicTextReviewToken } from "@/lib/privacy/text";
import { KIND_LABEL } from "@/lib/validation/community";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

/**
 * Regression cases for the independent review on PRs #8/#9.
 *
 * Each test below failed against `aed422f` before the correction:
 * 1. a curated portal host was presented as if the *case* had been verified,
 * 2. any historical `resolved` event blocked follow-ups forever,
 * 3. a failed post-withdrawal file delete was never retried,
 * 4. the text review token was described as server-issued/signed.
 */

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-review09-"));
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
const PUBLISHED_AT = new Date("2026-11-01T00:00:00.000Z");

async function publishedReport(db: ReturnType<typeof openDatabase>) {
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
      title: "OO초등학교 후문 인근 보도 파손 신고",
      description: "현황\n보도 블록이 들떠 있습니다.\n\n위치\n서울 마포구",
      missingEvidence: [],
      suggestedSteps: [],
      channelId: "safetyreport",
      generatedAt: PUBLISHED_AT.toISOString(),
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
    PUBLISHED_AT,
  );
  return row;
}

async function approvedEvidence(
  db: ReturnType<typeof openDatabase>,
  publicId: string,
  at: Date,
) {
  const image = await makeTestImage();
  const { id } = await addEvidence(
    db,
    NEIGHBOUR,
    publicId,
    {
      note: "오늘 아침에도 같은 자리가 그대로였습니다.",
      ackNoSensitive: true,
      image,
    },
    at,
  );
  reviewEvidence(db, MODERATOR, id, "approved", undefined, at);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("review correction 1: portal domain is not case verification", () => {
  it("keeps a cited official portal explicitly unverified at case level", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    // A moderator cites the portal *homepage* and records a resolution for this
    // particular report. The domain check passes; the case is still unverified.
    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "resolved",
        note: "포털에서 해결된 것으로 보인다고 기록했습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-02T00:00:00.000Z"),
    );

    const detail = getIssueDetail(db, row.public_id, null);
    expect(detail.officialStatus).toBe("resolved");
    // The public projection must state that only the domain was checked.
    expect(detail.officialCaseVerified).toBe(false);
    expect(detail.officialReference).toMatchObject({
      status: "resolved",
      caseVerified: false,
      verification: "domain_and_moderator_assertion",
    });

    // The visible label must not read "공식 확인".
    expect(KIND_LABEL.official_source).toBe("공식 포털 인용 · 운영자 입력");
    expect(KIND_LABEL.official_source).not.toContain("공식 출처 확인");
    db.close();
  });
});

describe("review correction 2: a later recurred status reopens follow-ups", () => {
  it("does not let an older resolved event block a later recurrence", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "resolved",
        note: "포털에 해결로 표시되어 있었습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-03T00:00:00.000Z"),
    );
    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "recurred",
        note: "같은 위치에서 다시 파손이 확인되었습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-10T00:00:00.000Z"),
    );
    await approvedEvidence(db, row.public_id, new Date("2026-11-11T00:00:00.000Z"));

    const eligibility = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reasons.join(" ")).not.toContain("해결");

    const { followup } = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(followup.text).toContain("재발");
    db.close();
  });
});

describe("review correction 2b: a resolution *claim* needs an explicit decision", () => {
  it("requires acknowledgement instead of silently disabling follow-ups", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "resolved",
        note: "포털에 해결로 표시되어 있었습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-03T00:00:00.000Z"),
    );
    await approvedEvidence(db, row.public_id, new Date("2026-11-05T00:00:00.000Z"));

    const blocked = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(blocked.requiresResolutionAcknowledgement).toBe(true);
    expect(blocked.resolutionRecorded).toMatchObject({
      status: "resolved",
      caseVerified: false,
    });
    expect(blocked.eligible).toBe(false);

    expect(() =>
      requestFollowup(db, OWNER, row.public_id, new Date("2026-11-20T00:00:00.000Z")),
    ).toThrow(ApiError);

    const acknowledged = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-20T00:00:00.000Z"),
      { acknowledgeRecordedResolution: true },
    );
    expect(acknowledged.eligible).toBe(true);

    const { followup } = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
      { acknowledgeRecordedResolution: true },
    );
    expect(followup.body.official?.label).toBe("해결됨");
    expect(followup.text).toContain("사건 확인 아님");
    db.close();
  });
});

describe("review correction 3: failed media deletion is retried", () => {
  it("queues a failed delete and completes it on reconciliation", async () => {
    const { db, dir } = tempDb();
    const row = await publishedReport(db);

    let failures = 1;
    const result = await withdrawReport(
      db,
      OWNER,
      row.public_id,
      {
        removeFile: async (scope, key) => {
          if (failures > 0) {
            failures -= 1;
            throw new Error("simulated EACCES");
          }
          await fs.promises.rm(
            path.join(dir, "media", scope === "public" ? "public" : "private", key),
            { force: true },
          );
        },
      },
      new Date("2026-11-20T00:00:00.000Z"),
    );

    expect(result.state).toBe("removed");
    expect(result.mediaDeleteFailures).toBeGreaterThan(0);
    expect(result.cleanupPending).toBeGreaterThan(0);

    const pendingRows = all<{ storage_key: string; last_error: string | null }>(
      db,
      "SELECT storage_key, last_error FROM media_cleanup WHERE completed_at IS NULL",
    );
    expect(pendingRows.length).toBeGreaterThan(0);
    expect(pendingRows[0]!.last_error).toContain("simulated EACCES");

    // The public route is already closed even though bytes remain.
    expect(() => getIssueDetail(db, row.public_id, null)).toThrow();

    const after = await processMediaCleanup(db);
    expect(after.failed).toBe(0);
    expect(after.completed).toBeGreaterThan(0);
    expect(
      one<{ count: number }>(
        db,
        "SELECT COUNT(*) AS count FROM media_cleanup WHERE completed_at IS NULL",
      )?.count,
    ).toBe(0);
    expect(fs.readdirSync(path.join(dir, "media", "public"))).toEqual([]);
    db.close();
  });

  it("retries pending cleanup even when the withdrawal request is repeated", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    await withdrawReport(
      db,
      OWNER,
      row.public_id,
      { removeFile: async () => Promise.reject(new Error("always fails")) },
      new Date("2026-11-20T00:00:00.000Z"),
    );

    const second = await withdrawReport(
      db,
      OWNER,
      row.public_id,
      {},
      new Date("2026-11-21T00:00:00.000Z"),
    );
    expect(second.state).toBe("removed");
    expect(second.cleanupPending).toBe(0);
    expect(
      one<{ count: number }>(
        db,
        "SELECT COUNT(*) AS count FROM media_cleanup WHERE completed_at IS NULL",
      )?.count,
    ).toBe(0);
    db.close();
  });
});

describe("review correction 4: the text token is described accurately", () => {
  it("declares the token as an unsigned content fingerprint", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    const review = buildPublicTextReview(row);

    expect(review.tokenKind).toBe("unsigned-content-fingerprint");
    expect(review.signed).toBe(false);
    expect(review.token).toMatch(/^text-v1-[0-9a-f]{8}$/);
    db.close();
  });
});
