import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { all, one, run } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  CONSENT_VERSION,
  getPublicReport,
  getPublicationMasks,
  publishReport,
  toPublicReport,
} from "@/lib/domain/publication";
import { createDraftReport, getOwnerReport } from "@/lib/domain/reports";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { SQUARE_MASK, makeTestImage } from "./helpers/images";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-publish-"));
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

async function draft(db: ReturnType<typeof openDatabase>, owner = actor(0)) {
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

const ACK = { privacyReviewed: true, consent: true, noSensitiveContent: false };

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("publication gate", () => {
  it("refuses to publish without both explicit acknowledgements", async () => {
    const { db } = tempDb();
    const row = await draft(db);

    for (const ack of [
      { ...ACK, privacyReviewed: false },
      { ...ACK, consent: false },
      { privacyReviewed: false, consent: false, noSensitiveContent: false },
    ]) {
      await expect(
        publishReport(db, actor(0), row.public_id, { masks: [SQUARE_MASK], ack }),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect(getOwnerReport(db, actor(0), row.public_id).state).toBe("draft");
    db.close();
  });

  it("requires an explicit 'nothing to hide' confirmation when there are no masks", async () => {
    const { db } = tempDb();
    const row = await draft(db);
    await expect(
      publishReport(db, actor(0), row.public_id, { masks: [], ack: ACK }),
    ).rejects.toMatchObject({ status: 409 });

    const result = await publishReport(db, actor(0), row.public_id, {
      masks: [],
      ack: { ...ACK, noSensitiveContent: true },
    });
    expect(result.maskCount).toBe(0);
    db.close();
  });

  it("refuses a non-owner and a malformed id", async () => {
    const { db } = tempDb();
    const row = await draft(db);
    await expect(
      publishReport(db, actor(1), row.public_id, { masks: [SQUARE_MASK], ack: ACK }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      publishReport(db, actor(0), "cp_'; DROP TABLE reports;--", {
        masks: [SQUARE_MASK],
        ack: ACK,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    db.close();
  });

  it("publishes a redacted copy, records consent and keeps originals private", async () => {
    const { db, dir } = tempDb();
    const row = await draft(db);

    const result = await publishReport(
      db,
      actor(0),
      row.public_id,
      { masks: [SQUARE_MASK], ack: ACK },
      new Date("2026-11-19T05:00:00.000Z"),
    );

    expect(result.publicUrl).toBe(`/issues/${row.public_id}`);
    expect(result.maskCount).toBe(1);

    const stored = one<{
      state: string;
      published_at: string;
      privacy_reviewed_at: string;
      consent_version: string;
    }>(db, "SELECT state, published_at, privacy_reviewed_at, consent_version FROM reports WHERE id = ?", [row.id]);
    expect(stored).toMatchObject({
      state: "published",
      published_at: "2026-11-19T05:00:00.000Z",
      privacy_reviewed_at: "2026-11-19T05:00:00.000Z",
      consent_version: CONSENT_VERSION,
    });

    const masks = getPublicationMasks(db, row.id);
    expect(masks).toEqual([SQUARE_MASK]);

    const publicMedia = all<{ storage_key: string; role: string }>(
      db,
      "SELECT storage_key, role FROM report_media WHERE report_id = ?",
      [row.id],
    );
    expect(publicMedia.map((media) => media.role).sort()).toEqual([
      "original",
      "public",
      "working",
    ]);

    const publicFiles = fs.readdirSync(path.join(dir, "media", "public"));
    const privateFiles = fs.readdirSync(path.join(dir, "media", "private"));
    expect(publicFiles).toHaveLength(1);
    expect(privateFiles).toHaveLength(2);
    // The published file is the redacted WebP, not the original upload.
    expect(publicFiles[0]).toMatch(/\.webp$/);
    expect(privateFiles.some((file) => file.endsWith(".jpg"))).toBe(true);

    // Publishing twice is refused.
    await expect(
      publishReport(db, actor(0), row.public_id, { masks: [SQUARE_MASK], ack: ACK }),
    ).rejects.toMatchObject({ status: 409 });

    // Owner edits are frozen after publication.
    expect(getOwnerReport(db, actor(0), row.public_id).state).toBe("published");
    db.close();
  });

  it("exposes only a narrow public projection", async () => {
    const { db } = tempDb();
    const row = await draft(db);
    await publishReport(db, actor(0), row.public_id, { masks: [SQUARE_MASK], ack: ACK });

    const publicReport = getPublicReport(db, row.public_id);
    expect(publicReport.title).toContain("보도 파손");
    expect(publicReport.areaLabel).toBe("서울 마포구");
    expect(publicReport.maskCount).toBe(1);
    expect(publicReport.photoUrl).toBe(`/api/public/reports/${row.public_id}/photo`);

    const serialized = JSON.stringify(publicReport);
    expect(serialized).not.toContain("demo-minji");
    expect(serialized).not.toContain("37.56");
    expect(serialized).not.toContain(row.user_description);
    expect(serialized).not.toContain(row.id);
    expect(serialized).not.toContain(".webp");
    expect(Object.keys(publicReport).sort()).toEqual([
      "areaLabel",
      "category",
      "channelId",
      "description",
      "maskCount",
      "photoUrl",
      "publicId",
      "publishedAt",
      "title",
    ]);
  });

  it("never exposes a draft through the public surface", async () => {
    const { db } = tempDb();
    const row = await draft(db);

    expect(() => getPublicReport(db, row.public_id)).toThrow(ApiError);
    try {
      getPublicReport(db, row.public_id);
    } catch (error) {
      expect((error as ApiError).status).toBe(404);
    }
    expect(() => toPublicReport(db, row)).toThrow(ApiError);

    // A removed report is also invisible.
    run(db, "UPDATE reports SET state = 'removed' WHERE id = ?", [row.id]);
    expect(() => getPublicReport(db, row.public_id)).toThrow(ApiError);
    db.close();
  });

  it("rolls back state and removes the public file when the insert fails", async () => {
    const { db, dir } = tempDb();
    const row = await draft(db);
    // Force the media insert to fail by pre-creating a conflicting public row.
    run(
      db,
      `INSERT INTO report_media (id, report_id, role, storage_key, mime, width, height, bytes, created_at)
       VALUES (?, ?, 'public', ?, 'image/webp', 1, 1, 1, ?)`,
      ["med_existing", row.id, "00000000-0000-4000-8000-000000000000.webp", new Date().toISOString()],
    );

    await expect(
      publishReport(db, actor(0), row.public_id, { masks: [SQUARE_MASK], ack: ACK }),
    ).rejects.toBeInstanceOf(ApiError);

    const state = one<{ state: string }>(db, "SELECT state FROM reports WHERE id = ?", [row.id]);
    expect(state?.state).toBe("draft");
    const masks = all(db, "SELECT id FROM redaction_masks WHERE report_id = ?", [row.id]);
    expect(masks).toHaveLength(0);
    // The newly written (unreferenced) file is cleaned up; the pre-seeded row's
    // file never existed in the first place.
    const publicFiles = fs.readdirSync(path.join(dir, "media", "public"));
    expect(publicFiles).toHaveLength(0);
    db.close();
  });
});
