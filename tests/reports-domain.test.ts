import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/connection";
import { run } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  createDraftReport,
  getOwnerReport,
  listOwnerReports,
  updateDraftReport,
} from "@/lib/domain/reports";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { generateDraft } from "@/lib/services/assistant";
import type { ProcessedImage } from "@/lib/services/image";

const dirs: string[] = [];

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-reports-"));
  dirs.push(dir);
  process.env.CIVICPULSE_DATA_DIR = dir;
  return {
    db: openDatabase(path.join(dir, "test.sqlite")),
    file: path.join(dir, "test.sqlite"),
    dir,
  };
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

const image: ProcessedImage = {
  format: "jpeg",
  mime: "image/jpeg",
  original: Buffer.from("original-bytes"),
  working: Buffer.from("working-bytes"),
  width: 640,
  height: 480,
  workingWidth: 640,
  workingHeight: 480,
  exifPresent: false,
};

const input = {
  description: "보도 블록이 들떠 있어서 유모차가 지나가기 위험합니다.",
  category: "sidewalk",
  areaId: "seoul-mapo",
  landmark: "OO초등학교 후문",
};

async function createReport(db: ReturnType<typeof openDatabase>, owner: PublicUser) {
  const draft = generateDraft({
    userDescription: input.description,
    category: "sidewalk",
    areaLabel: "서울 마포구",
    landmark: input.landmark,
  });
  return createDraftReport(db, { actor: owner, input, draft, image });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("reports domain", () => {
  it("creates a private draft with media rows and rounded public coordinates", async () => {
    const { db } = tempDb();
    const row = await createReport(db, actor(0));

    expect(row.state).toBe("draft");
    expect(row.owner_id).toBe(DEMO_USERS[0].id);
    expect(row.assistant_mode).toBe("mock");
    expect(row.channel_id).toBe("safetyreport");
    expect(row.public_id).toMatch(/^cp_[a-z0-9]{10}$/);

    // Precise and public coordinates are stored separately.
    expect(row.lat).toBeCloseTo(37.5663, 4);
    expect(row.public_lat).toBeCloseTo(37.57, 2);
    expect(row.public_lat).not.toBe(row.lat);

    const media = db
      .prepare("SELECT role, mime FROM report_media WHERE report_id = ? ORDER BY role")
      .all(row.id) as Array<{ role: string; mime: string }>;
    expect(media).toEqual([
      { role: "original", mime: "image/jpeg" },
      { role: "working", mime: "image/webp" },
    ]);
    db.close();
  });

  it("never returns another user's draft", async () => {
    const { db } = tempDb();
    const row = await createReport(db, actor(0));

    expect(() => getOwnerReport(db, actor(1), row.public_id)).toThrow(ApiError);
    try {
      getOwnerReport(db, actor(1), row.public_id);
    } catch (error) {
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).code).toBe("NOT_FOUND");
    }
    db.close();
  });

  it("rejects malformed public ids without touching the database", () => {
    const { db } = tempDb();
    expect(() => getOwnerReport(db, actor(0), "not-an-id")).toThrow(ApiError);
    expect(() => getOwnerReport(db, actor(0), "cp_'; DROP TABLE reports;--")).toThrow(
      ApiError,
    );
    db.close();
  });

  it("persists edits and reports the server-side timestamp", async () => {
    const { db } = tempDb();
    const row = await createReport(db, actor(0));
    const later = new Date(Date.now() + 60_000);

    const updated = updateDraftReport(
      db,
      actor(0),
      row.public_id,
      { title: "수정된 제목입니다", description: "수정된 본문이며 열 자 이상입니다." },
      later,
    );
    expect(updated.title).toBe("수정된 제목입니다");
    expect(updated.updatedAt).toBe(later.toISOString());
    expect(updated.userDescription).toBe(input.description);

    const reread = getOwnerReport(db, actor(0), row.public_id);
    expect(reread.title).toBe("수정된 제목입니다");
    db.close();
  });

  it("refuses to edit a report that is no longer a draft", async () => {
    const { db } = tempDb();
    const row = await createReport(db, actor(0));
    run(db, "UPDATE reports SET state = 'published' WHERE id = ?", [row.id]);

    try {
      updateDraftReport(db, actor(0), row.public_id, { title: "공개 후 수정" });
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
    }
    db.close();
  });

  it("lists only the actor's reports, newest first, and survives a reopen", async () => {
    const { db, file } = tempDb();
    const first = await createReport(db, actor(0));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createReport(db, actor(1));

    expect(listOwnerReports(db, actor(0)).map((r) => r.publicId)).toEqual([
      first.public_id,
    ]);
    db.close();

    const reopened = openDatabase(file);
    const after = listOwnerReports(reopened, actor(0));
    expect(after).toHaveLength(1);
    expect(after[0]?.title).toBe(first.title);
    reopened.close();
  });

  it("removes written media when the database insert fails", async () => {
    const { db, dir } = tempDb();
    const mediaDir = path.join(dir, "media", "private");
    const before = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).length : 0;

    await expect(
      createDraftReport(db, {
        actor: actor(0),
        input: { ...input, areaId: "unknown-area" },
        draft: generateDraft({
          userDescription: input.description,
          category: "sidewalk",
          areaLabel: "알 수 없음",
        }),
        image,
      }),
    ).rejects.toBeInstanceOf(ApiError);

    const after = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).length : 0;
    expect(after).toBe(before);
    db.close();
  });
});
