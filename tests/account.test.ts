import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { all, one } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import { deleteAccount, exportAccountData } from "@/lib/domain/account";
import {
  addEvidence,
  addStatusEvent,
  getIssueDetail,
  supportIssue,
} from "@/lib/domain/community";
import { getPublicReport, publishReport } from "@/lib/domain/publication";
import { createDraftReport } from "@/lib/domain/reports";
import { getFollowupEligibility } from "@/lib/domain/followup";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { publicTextReviewToken } from "@/lib/privacy/text";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-account-"));
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

async function draft(db: ReturnType<typeof openDatabase>, owner: PublicUser) {
  const image = await makeTestImage();
  return createDraftReport(db, {
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
}

async function published(db: ReturnType<typeof openDatabase>, owner: PublicUser) {
  const row = await draft(db, owner);
  await publishReport(db, owner, row.public_id, {
    masks: [SQUARE_MASK],
    ack: ackFor(row),
  });
  return row;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("account export", () => {
  it("includes only the account's own data and no internal identifiers", async () => {
    const { db } = tempDb();
    const ownPublic = await published(db, OWNER);
    const ownDraft = await draft(db, OWNER);
    const neighbourPublic = await published(db, NEIGHBOUR);

    await addEvidence(db, OWNER, neighbourPublic.public_id, {
      note: "제가 확인한 추가 근거입니다.",
      ackNoSensitive: true,
      image: await makeTestImage(),
    });
    supportIssue(db, OWNER, neighbourPublic.public_id);
    addStatusEvent(db, OWNER, ownPublic.public_id, {
      kind: "user_claim",
      status: "unresolved",
      note: "아직 보수되지 않았습니다.",
    });

    const exported = exportAccountData(db, OWNER);
    expect(exported.account.id).toBe(OWNER.id);
    // The account's published report and its private draft, nothing else.
    expect(exported.reports.map((row) => row.publicId).sort()).toEqual(
      [ownPublic.public_id, ownDraft.public_id].sort(),
    );
    expect(exported.evidence).toHaveLength(1);
    expect(exported.evidence[0]!.reportPublicId).toBe(neighbourPublic.public_id);
    expect(exported.supports).toHaveLength(1);
    expect(exported.statusEvents).toHaveLength(1);

    const serialized = JSON.stringify(exported);
    // Other accounts, password material and storage keys never leave the server.
    expect(serialized).not.toContain(NEIGHBOUR.id);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain(".webp");
    expect(serialized).not.toContain("storage_key");
    db.close();
  });
});

describe("account deletion", () => {
  it("withdraws published reports, removes drafts and personal rows, and anonymises", async () => {
    const { db, dir } = tempDb();
    const ownPublic = await published(db, OWNER);
    const ownDraft = await draft(db, OWNER);
    const neighbourPublic = await published(db, NEIGHBOUR);
    await addEvidence(db, OWNER, neighbourPublic.public_id, {
      note: "삭제되어야 하는 제 근거입니다.",
      ackNoSensitive: true,
      image: await makeTestImage(),
    });
    supportIssue(db, OWNER, neighbourPublic.public_id);
    addStatusEvent(db, OWNER, ownPublic.public_id, {
      kind: "user_claim",
      status: "unresolved",
      note: "삭제되어야 하는 제 기록입니다.",
    });

    expect(fs.readdirSync(path.join(dir, "media", "private")).length).toBeGreaterThan(0);

    const result = await deleteAccount(db, OWNER);
    expect(result.reportsWithdrawn).toBe(1);
    expect(result.reportsDeleted).toBe(1);
    expect(result.cleanupPending).toBe(0);

    // Public content and every owned row are gone or private.
    expect(() => getPublicReport(db, ownPublic.public_id)).toThrow(ApiError);
    expect(
      one(db, "SELECT id FROM reports WHERE public_id = ?", [ownDraft.public_id]),
    ).toBeUndefined();
    expect(
      all(db, "SELECT id FROM evidence WHERE user_id = ?", [OWNER.id]),
    ).toHaveLength(0);
    expect(
      all(db, "SELECT report_id FROM supports WHERE user_id = ?", [OWNER.id]),
    ).toHaveLength(0);
    expect(
      all(db, "SELECT id FROM status_events WHERE created_by = ?", [OWNER.id]),
    ).toHaveLength(0);

    // The other account's published report is untouched.
    expect(() => getPublicReport(db, neighbourPublic.public_id)).not.toThrow();
    expect(getIssueDetail(db, neighbourPublic.public_id, null).evidence).toHaveLength(0);

    // Identity is anonymised; a stale session can no longer resolve.
    expect(one(db, "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL", [OWNER.id]))
      .toBeUndefined();
    const tombstone = one<{ display_name: string; email: string | null }>(
      db,
      "SELECT display_name, email FROM users WHERE id = ?",
      [OWNER.id],
    );
    expect(tombstone?.display_name).toBe("탈퇴한 사용자");
    expect(tombstone?.email).toBeNull();

    // Follow-up creation is impossible after deletion (public report removed).
    expect(() => getFollowupEligibility(db, ownPublic.id)).toThrow(ApiError);
    db.close();
  });
});
