import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  addEvidence,
  addStatusEvent,
  getIssueDetail,
  listEvidenceQueue,
  listPublicIssues,
  reviewEvidence,
  supportIssue,
} from "@/lib/domain/community";
import { publishReport } from "@/lib/domain/publication";
import { createDraftReport } from "@/lib/domain/reports";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { publicTextReviewToken } from "@/lib/privacy/text";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-community-"));
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

async function publishedReport(
  db: ReturnType<typeof openDatabase>,
  owner: PublicUser = OWNER,
) {
  const image = await makeTestImage();
  const row = await createDraftReport(db, {
    actor: owner,
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
  await publishReport(db, owner, row.public_id, { masks: [SQUARE_MASK], ack: ackFor(row) });
  return row;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("support", () => {
  it("counts one support per account, not per tap", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    expect(supportIssue(db, NEIGHBOUR, row.public_id)).toEqual({
      supportCount: 1,
      alreadySupported: false,
    });
    const repeat = supportIssue(db, NEIGHBOUR, row.public_id);
    expect(repeat).toEqual({ supportCount: 1, alreadySupported: true });

    // A different account still adds to the count.
    expect(supportIssue(db, actor(2), row.public_id).supportCount).toBe(2);

    // The owner can support their own issue without duplicating.
    expect(supportIssue(db, OWNER, row.public_id).supportCount).toBe(3);
    db.close();
  });

  it("refuses to support an unpublished or unknown issue", async () => {
    const { db } = tempDb();
    const image = await makeTestImage();
    const draft = await createDraftReport(db, {
      actor: OWNER,
      input: {
        description: "아직 공개하지 않은 초안에 지지를 시도하는 테스트 설명입니다.",
        category: "sidewalk",
        areaId: "seoul-mapo",
        landmark: "OO초등학교 후문",
      },
      draft: {
        mode: "mock",
        title: "비공개 초안",
        description: "비공개",
        missingEvidence: [],
        suggestedSteps: [],
        channelId: "safetyreport",
        generatedAt: new Date().toISOString(),
        disclosure: "규칙 기반",
      },
      image,
    });

    expect(() => supportIssue(db, NEIGHBOUR, draft.public_id)).toThrow(ApiError);
    expect(() => supportIssue(db, NEIGHBOUR, "cp_notarealidid")).toThrow(ApiError);
    db.close();
  });
});

describe("moderated evidence", () => {
  it("keeps new evidence pending, invisible publicly, until a moderator approves it", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    const image = await makeTestImage();

    const { id, status } = await addEvidence(db, NEIGHBOUR, row.public_id, {
      note: "오늘 아침에도 같은 자리가 그대로였습니다.",
      ackNoSensitive: true,
      image,
    });
    expect(status).toBe("pending");
    expect(getIssueDetail(db, row.public_id, null).evidence).toHaveLength(0);
    expect(listEvidenceQueue(db)).toHaveLength(1);

    const approved = reviewEvidence(db, MODERATOR, id, "approved", undefined);
    expect(approved.status).toBe("approved");
    expect(approved.reviewed_by).toBe(MODERATOR.id);

    const publicView = getIssueDetail(db, row.public_id, null);
    expect(publicView.evidence).toHaveLength(1);
    expect(publicView.evidence[0]!.note).toContain("그대로");
    expect(publicView.evidence[0]!.photoUrl).toBe(`/api/public/evidence/${id}/photo`);

    // Reviewing twice is refused rather than silently overwriting the decision.
    expect(() => reviewEvidence(db, MODERATOR, id, "rejected", "중복")).toThrow(ApiError);
    db.close();
  });

  it("rejects evidence without the uploader's privacy confirmation", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    const image = await makeTestImage();

    await expect(
      addEvidence(db, NEIGHBOUR, row.public_id, {
        note: "확인 없이 올리는 근거입니다.",
        ackNoSensitive: false,
        image,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(listEvidenceQueue(db)).toHaveLength(0);
    db.close();
  });

  it("only moderators can review, and rejected evidence stays private", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    const image = await makeTestImage();
    const { id } = await addEvidence(db, NEIGHBOUR, row.public_id, {
      note: "검토 권한 테스트용 근거 사진입니다.",
      ackNoSensitive: true,
      image,
    });

    expect(() => reviewEvidence(db, OWNER, id, "approved", undefined)).toThrow(ApiError);
    expect(() => reviewEvidence(db, NEIGHBOUR, id, "approved", undefined)).toThrow(
      ApiError,
    );

    const rejected = reviewEvidence(db, MODERATOR, id, "rejected", "제보와 무관함");
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason).toBe("제보와 무관함");
    expect(getIssueDetail(db, row.public_id, null).evidence).toHaveLength(0);
    db.close();
  });
});

describe("status events", () => {
  it("keeps citizen claims and official status separate", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    addStatusEvent(
      db,
      OWNER,
      row.public_id,
      {
        kind: "user_claim",
        status: "unresolved",
        note: "아직 보수되지 않았습니다.",
      },
      new Date("2026-11-19T05:00:00.000Z"),
    );

    let detail = getIssueDetail(db, row.public_id, null);
    expect(detail.officialStatus).toBeNull();
    expect(detail.latestUserClaim?.status).toBe("unresolved");

    addStatusEvent(
      db,
      MODERATOR,
      row.public_id,
      {
        kind: "official_source",
        status: "in_progress",
        note: "구청에서 보수 일정을 안내했습니다.",
        sourceUrl: "https://www.safetyreport.go.kr/",
      },
      new Date("2026-11-19T06:00:00.000Z"),
    );

    detail = getIssueDetail(db, row.public_id, null);
    expect(detail.officialStatus).toBe("in_progress");
    expect(detail.officialCheckedAt).toBe("2026-11-19T06:00:00.000Z");
    // The citizen claim is still visible and still labelled separately.
    expect(detail.latestUserClaim?.status).toBe("unresolved");
    expect(detail.events.map((event) => event.kind)).toEqual([
      "user_claim",
      "official_source",
    ]);
    db.close();
  });

  it("enforces authorship and source rules", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    // A random citizen cannot headline their claim about someone else's report.
    expect(() =>
      addStatusEvent(db, NEIGHBOUR, row.public_id, {
        kind: "user_claim",
        status: "unresolved",
        note: "남의 제보에 주장을 남기는 시도입니다.",
      }),
    ).toThrow(ApiError);

    // Only moderators may add sourced or mock statuses.
    for (const kind of ["official_source", "moderator_claim", "mock"] as const) {
      expect(() =>
        addStatusEvent(db, OWNER, row.public_id, {
          kind,
          status: "resolved",
          note: "권한 없이 공식 상태를 기록하는 시도입니다.",
          sourceUrl: "https://www.safetyreport.go.kr/",
        }),
      ).toThrow(ApiError);
    }

    // An official-source status requires an https source on a registered portal.
    for (const sourceUrl of [
      undefined,
      "http://www.safetyreport.go.kr/",
      "https://example.com/notice/1",
    ]) {
      expect(() =>
        addStatusEvent(db, MODERATOR, row.public_id, {
          kind: "official_source",
          status: "resolved",
          note: "출처가 없거나 안전하지 않은 주소로 기록하는 시도입니다.",
          sourceUrl,
        }),
      ).toThrow(ApiError);
    }
    db.close();
  });
});

describe("public aggregation", () => {
  it("lists only published issues with counts and official status", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    supportIssue(db, NEIGHBOUR, row.public_id);
    addStatusEvent(db, MODERATOR, row.public_id, {
      kind: "official_source",
      status: "acknowledged",
      note: "접수 확인을 받았습니다.",
      sourceUrl: "https://www.epeople.go.kr/",
    });

    const feed = listPublicIssues(db);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      publicId: row.public_id,
      supportCount: 1,
      officialStatus: "acknowledged",
    });
    db.close();
  });

  it("never exposes the owner id in the public issue detail", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    const detail = getIssueDetail(db, row.public_id, NEIGHBOUR);
    expect(detail.supportedByMe).toBe(false);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(OWNER.id);
    expect(serialized).not.toContain(row.user_description);
    expect(serialized).not.toContain("37.56");
    expect(serialized).not.toContain(".webp");
    db.close();
  });
});

describe("official-looking sources", () => {
  it("never turns an unrelated https URL into an official status", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);

    // The moderator may keep the link, but only as an unverified note.
    const note = addStatusEvent(db, MODERATOR, row.public_id, {
      kind: "moderator_claim",
      status: "resolved",
      note: "담당 부서와 통화했다고 전달받았습니다. 서면 확인은 없습니다.",
      sourceUrl: "https://example.com/notice/1",
    });
    expect(note.kind).toBe("moderator_claim");
    expect(note.source_host).toBe("example.com");
    expect(note.source_checked_at).toBeNull();

    let detail = getIssueDetail(db, row.public_id, null);
    expect(detail.officialStatus).toBeNull();
    expect(detail.latestModeratorClaim?.status).toBe("resolved");
    expect(detail.events.map((event) => event.kind)).toEqual(["moderator_claim"]);

    // Claiming any of these as an official source is refused outright.
    for (const sourceUrl of [
      "https://example.com/notice/1",
      "https://www.safetyreport.go.kr.evil.example/",
      "https://www.safetyreport.go.kr@evil.example/",
      "https://evil.example/?ref=safetyreport.go.kr",
    ]) {
      expect(() =>
        addStatusEvent(db, MODERATOR, row.public_id, {
          kind: "official_source",
          status: "resolved",
          note: "공식 출처로 기록하려는 시도입니다.",
          sourceUrl,
        }),
      ).toThrow(ApiError);
    }

    // A registered portal host becomes an official source with its as-of date.
    const official = addStatusEvent(db, MODERATOR, row.public_id, {
      kind: "official_source",
      status: "acknowledged",
      note: "안전신문고 접수 확인 화면을 확인했습니다.",
      sourceUrl: "https://www.safetyreport.go.kr/",
    });
    expect(official.source_host).toBe("www.safetyreport.go.kr");
    expect(official.source_checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    detail = getIssueDetail(db, row.public_id, null);
    expect(detail.officialStatus).toBe("acknowledged");
    expect(detail.officialSourceHost).toBe("www.safetyreport.go.kr");
    // The unverified note remains visible and separate.
    expect(detail.latestModeratorClaim?.status).toBe("resolved");
    db.close();
  });

  it("refuses evidence notes that contain synthetic personal information", async () => {
    const { db } = tempDb();
    const row = await publishedReport(db);
    const image = await makeTestImage();

    await expect(
      addEvidence(db, NEIGHBOUR, row.public_id, {
        note: "연락처 010-9876-5432 로 연락 주세요.",
        ackNoSensitive: true,
        image,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(listEvidenceQueue(db)).toHaveLength(0);

    const accepted = await addEvidence(db, NEIGHBOUR, row.public_id, {
      note: "오늘 아침에도 같은 자리가 그대로였습니다.",
      ackNoSensitive: true,
      image,
    });
    expect(accepted.status).toBe("pending");
    db.close();
  });
});
