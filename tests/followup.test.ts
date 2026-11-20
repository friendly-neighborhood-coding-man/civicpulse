import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  addEvidence,
  addStatusEvent,
  reviewEvidence,
  supportIssue,
} from "@/lib/domain/community";
import {
  approveFollowup,
  discardFollowup,
  getFollowupEligibility,
  requestFollowup,
} from "@/lib/domain/followup";
import { publishReport } from "@/lib/domain/publication";
import { createDraftReport } from "@/lib/domain/reports";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { publicTextReviewToken } from "@/lib/privacy/text";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-followup-"));
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

function ackFor(row: { title: string; description: string }) {
  return {
    privacyReviewed: true,
    consent: true,
    noSensitiveContent: false,
    textReviewed: true,
    textFindingsReviewed: false,
    textToken: publicTextReviewToken(row),
  };
}
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
  await publishReport(db, OWNER, row.public_id, { masks: [SQUARE_MASK], ack: ackFor(row) }, PUBLISHED_AT);
  return row;
}

async function approvedEvidence(
  db: ReturnType<typeof openDatabase>,
  publicId: string,
  uploadedAt: Date,
  note = "오늘 아침에도 같은 자리가 그대로였습니다.",
) {
  const image = await makeTestImage();
  const { id } = await addEvidence(
    db,
    NEIGHBOUR,
    publicId,
    { note, ackNoSensitive: true, image },
    uploadedAt,
  );
  return reviewEvidence(db, MODERATOR, id, "approved", undefined, uploadedAt);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("follow-up eligibility", () => {
  it("waits for the configured waiting period", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    const early = getFollowupEligibility(db, row.id, new Date("2026-11-05T00:00:00.000Z"));
    expect(early.eligible).toBe(false);
    expect(early.ageDays).toBe(4);
    expect(early.ageDays).toBeLessThan(early.waitingDays);
    expect(early.reasons.join(" ")).toContain("대기 기간");

    expect(() =>
      requestFollowup(db, OWNER, row.public_id, new Date("2026-11-05T00:00:00.000Z")),
    ).toThrow(ApiError);
    db.close();
  });

  it("requires newly approved evidence since the last follow-up", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    const noEvidence = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(noEvidence.eligible).toBe(false);
    expect(noEvidence.reasons.join(" ")).toContain("근거");
    db.close();
  });

  it("refuses when the issue is officially resolved", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));
    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "resolved",
        note: "보수 완료 안내를 받았습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-10T00:00:00.000Z"),
    );

    const eligibility = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons.join(" ")).toContain("해결");
    db.close();
  });
});

describe("follow-up drafts", () => {
  it("creates a deterministic draft that separates sources and never submits", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));
    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "acknowledged",
        note: "접수 확인을 받았습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-03T00:00:00.000Z"),
    );
    addStatusEvent(
      db,
      OWNER,
      row.public_id,
      {
        kind: "user_claim",
        status: "unresolved",
        note: "아직 보수되지 않았습니다.",
      },
      new Date("2026-11-04T00:00:00.000Z"),
    );

    const { followup, eligibility } = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );

    expect(followup.status).toBe("draft");
    expect(followup.notSubmitted).toBe(true);
    expect(followup.body.mode).toBe("mock");
    expect(followup.body.official?.label).toBe("접수 확인");
    expect(followup.body.claims).toHaveLength(1);
    expect(followup.body.evidence).toHaveLength(1);
    expect(followup.body.channel).toMatchObject({
      name: "안전신문고",
      url: "https://www.safetyreport.go.kr/",
    });
    expect(followup.text).toContain("공식 포털 인용");
    // The cited portal domain must never be described as case verification.
    expect(followup.text).toContain("사건 확인 아님");
    expect(followup.text).toContain("시민 주장");
    expect(followup.text).toContain("CivicPulse가 자동으로 전송하지 않습니다");
    // No invented contact details: only the registry URL, no email or phone.
    expect(followup.text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(followup.text).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}/);

    // A draft now blocks another request until it is reviewed.
    expect(eligibility.eligible).toBe(false);
    expect(() =>
      requestFollowup(db, OWNER, row.public_id, new Date("2026-11-20T00:00:00.000Z")),
    ).toThrow(ApiError);

    // The same input produces the same body: the generator is deterministic.
    discardFollowup(db, OWNER, followup.id);
    const again = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(again.followup.body).toEqual(followup.body);
    db.close();
  });

  it("only the report owner can create or review drafts", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));

    expect(() =>
      requestFollowup(db, NEIGHBOUR, row.public_id, new Date("2026-11-20T00:00:00.000Z")),
    ).toThrow(ApiError);

    const { followup } = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(() =>
      approveFollowup(db, NEIGHBOUR, followup.id, new Date("2026-11-21T00:00:00.000Z")),
    ).toThrow(ApiError);
    expect(() =>
      discardFollowup(db, NEIGHBOUR, followup.id, new Date("2026-11-21T00:00:00.000Z")),
    ).toThrow(ApiError);
    db.close();
  });

  it("records human approval once and enforces the cooldown", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));

    const { followup } = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    const approved = approveFollowup(
      db,
      OWNER,
      followup.id,
      new Date("2026-11-20T01:00:00.000Z"),
    );
    expect(approved.status).toBe("approved");
    expect(approved.reviewedAt).toBe("2026-11-20T01:00:00.000Z");

    expect(() =>
      approveFollowup(db, OWNER, followup.id, new Date("2026-11-20T02:00:00.000Z")),
    ).toThrow(ApiError);

    // Cooldown: one day later, even with nothing else wrong, it is too soon.
    await approvedEvidence(db, row.public_id, new Date("2026-11-21T00:00:00.000Z"));
    const cooling = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-21T01:00:00.000Z"),
    );
    expect(cooling.eligible).toBe(false);
    expect(cooling.reasons.join(" ")).toContain("최근 후속 요청 후 1일");

    // After the cooldown, with new approved evidence, it is possible again.
    await approvedEvidence(
      db,
      row.public_id,
      new Date("2026-11-27T00:00:00.000Z"),
      "보수 공사가 시작되지 않았고 임시 덮개만 놓여 있습니다.",
    );
    const afterCooldown = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-28T00:00:00.000Z"),
    );
    expect(afterCooldown.eligible).toBe(true);
    db.close();
  });

  it("does not treat an unverified moderator note as an official resolution", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));

    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "moderator_claim",
        status: "resolved",
        note: "담당자가 처리했다고 구두로 전달했습니다.",
        sourceUrl: "https://example.com/notice/1",
      },
      new Date("2026-11-10T00:00:00.000Z"),
    );

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
    // Carried into the draft only as an unverified note, never as an official
    // status.
    expect(followup.body.official).toBeNull();
    expect(
      followup.body.claims.some((claim) => claim.kind === "moderator_claim"),
    ).toBe(true);
    expect(followup.text).toContain("운영자 기록 · 미검증");
    db.close();
  });

  it("reports support as context without letting popularity create a follow-up", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    supportIssue(db, NEIGHBOUR, row.public_id);
    supportIssue(db, actor(2), row.public_id);
    // A repeat tap by the same account must not inflate the count.
    expect(supportIssue(db, NEIGHBOUR, row.public_id).supportCount).toBe(2);

    // Support alone is never an eligibility condition.
    const popular = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(popular.eligible).toBe(false);
    expect(popular.reasons.join(" ")).toContain("근거");
    expect(() =>
      requestFollowup(db, OWNER, row.public_id, new Date("2026-11-20T00:00:00.000Z")),
    ).toThrow(ApiError);

    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));
    const { followup } = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    expect(followup.supportCount).toBe(2);
    expect(followup.body.communitySupport).toEqual({
      count: 2,
      note: expect.stringContaining("지지 2명"),
      countsAsVerification: false,
    });
    expect(followup.text).toContain("[지역 관심]");
    expect(followup.text).toContain("사실 여부나 정당성을 판정하지 않습니다");
    db.close();
  });

  it("counts evidence by approval time, not upload time", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    await approvedEvidence(db, row.public_id, new Date("2026-11-02T00:00:00.000Z"));

    const first = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-20T00:00:00.000Z"),
    );
    approveFollowup(db, OWNER, first.followup.id, new Date("2026-11-20T01:00:00.000Z"));

    // Uploaded *before* the previous follow-up, approved *after* it: it became
    // available only afterwards, so it is new material.
    const image = await makeTestImage();
    const { id } = await addEvidence(
      db,
      NEIGHBOUR,
      row.public_id,
      {
        note: "보수 공사가 시작되지 않았고 임시 덮개만 놓여 있습니다.",
        ackNoSensitive: true,
        image,
      },
      new Date("2026-11-19T00:00:00.000Z"),
    );
    reviewEvidence(
      db,
      MODERATOR,
      id,
      "approved",
      undefined,
      new Date("2026-11-27T00:00:00.000Z"),
    );

    const eligibility = getFollowupEligibility(
      db,
      row.id,
      new Date("2026-11-28T00:00:00.000Z"),
    );
    expect(eligibility.newEvidenceCount).toBe(1);
    expect(eligibility.eligible).toBe(true);

    const second = requestFollowup(
      db,
      OWNER,
      row.public_id,
      new Date("2026-11-28T00:00:00.000Z"),
    );
    expect(second.followup.body.evidence).toHaveLength(1);
    expect(second.followup.body.evidence[0]!.approvedAt).toContain("2026-11-27");
    expect(second.followup.text).toContain("검토 승인");
    db.close();
  });
});
