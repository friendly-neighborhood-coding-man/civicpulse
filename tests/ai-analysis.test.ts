import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ProviderError, type AnalysisProvider } from "@/lib/ai/providers/types";
import type { AnalysisResult } from "@/lib/ai/schema";
import { openDatabase, type Db } from "@/lib/db/connection";
import { run } from "@/lib/db/query";
import { DEMO_USERS } from "@/lib/db/seed";
import {
  applyAnalysis,
  getLatestAnalysis,
  requestAnalysis,
} from "@/lib/domain/analysis";
import { createDraftReport, getOwnerReport, updateDraftReport } from "@/lib/domain/reports";
import { toPublicUser, type PublicUser } from "@/lib/domain/users";
import { ApiError } from "@/lib/http/errors";
import { generateDraft } from "@/lib/services/assistant";
import { makeTestImage } from "./helpers/images";
import { VALID_RESULT } from "./helpers/analysis";

const dirs: string[] = [];

function tempDb(): Db {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "civicpulse-analysis-"));
  dirs.push(dir);
  process.env.CIVICPULSE_DATA_DIR = dir;
  return openDatabase(path.join(dir, "test.sqlite"));
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

const INPUT = {
  description: "보도 블록이 들떠 있어서 유모차가 지나가기 위험합니다.",
  category: "sidewalk",
  areaId: "seoul-mapo",
  landmark: "OO초등학교 후문",
};

async function createReport(db: Db, owner: PublicUser) {
  const image = await makeTestImage();
  const draft = generateDraft({
    userDescription: INPUT.description,
    category: "sidewalk",
    areaLabel: "서울 마포구",
    landmark: INPUT.landmark,
  });
  return createDraftReport(db, { actor: owner, input: INPUT, draft, image });
}

function makeProvider(
  content: unknown = VALID_RESULT,
  overrides: Partial<AnalysisProvider> = {},
): { provider: AnalysisProvider; calls: () => number } {
  let count = 0;
  const provider: AnalysisProvider = {
    mode: "live",
    provider: "test-openai",
    model: "test-model",
    external: true,
    async analyze() {
      count += 1;
      return {
        content,
        model: "test-model",
        usage: { inputTokens: 120, outputTokens: 60 },
        simulatedObservations: false,
      };
    },
    ...overrides,
  };
  return { provider, calls: () => count };
}

const saved: Record<string, string | undefined> = {};
const LIMIT_KEYS = [
  "CIVICPULSE_AI_USER_DAILY_LIMIT",
  "CIVICPULSE_AI_DAILY_LIMIT",
  "CIVICPULSE_AI_PER_REPORT_LIMIT",
] as const;

function saveLimits() {
  for (const key of LIMIT_KEYS) saved[key] = process.env[key];
}

function restoreLimits() {
  for (const key of LIMIT_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

afterEach(() => {
  restoreLimits();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("analysis domain", () => {
  it("records live provenance, structured observations and verbatim citizen facts", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider } = makeProvider();

    const { analysis, reused } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });

    expect(reused).toBe(false);
    expect(analysis.status).toBe("completed");
    expect(analysis.provenance).toMatchObject({
      mode: "live",
      provider: "test-openai",
      model: "test-model",
      externalTransfer: true,
      simulatedObservations: false,
      inputTokens: 120,
      outputTokens: 60,
    });
    expect(analysis.result.observations).toEqual(VALID_RESULT.observations);
    expect(analysis.userFacts[0]).toBe(INPUT.description);
    expect(analysis.failure).toBeNull();
    expect(analysis.proposedDescription).toContain("현황");
    expect(analysis.proposedDescription).toContain("서울 마포구, OO초등학교 후문 인근");

    // The draft body itself is untouched until the citizen applies the result.
    expect(getOwnerReport(db, owner, report.public_id).title).toBe(report.title);
    db.close();
  });

  it("reuses an identical request and only calls the provider again on refresh", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider, calls } = makeProvider();

    const first = await requestAnalysis(db, owner, report.public_id, { provider, consent: true });
    const second = await requestAnalysis(db, owner, report.public_id, { provider, consent: true });
    expect(second.reused).toBe(true);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(calls()).toBe(1);

    const third = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
      refresh: true,
    });
    expect(third.reused).toBe(false);
    expect(third.analysis.id).not.toBe(first.analysis.id);
    expect(calls()).toBe(2);

    const rows = db
      .prepare("SELECT COUNT(*) AS count FROM report_analyses WHERE report_id = ?")
      .get(report.id) as { count: number };
    expect(rows.count).toBe(2);
    db.close();
  });

  it("requires explicit consent before sending an image to an external provider", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider, calls } = makeProvider();

    await expect(
      requestAnalysis(db, owner, report.public_id, { provider }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls()).toBe(0);
    const rows = db
      .prepare("SELECT COUNT(*) AS count FROM report_analyses WHERE report_id = ?")
      .get(report.id) as { count: number };
    expect(rows.count).toBe(0);
    db.close();
  });

  it("falls back without credentials and keeps the rule-based draft usable", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);

    const { analysis } = await requestAnalysis(db, owner, report.public_id, { provider: null });
    expect(analysis.status).toBe("fallback");
    expect(analysis.failure?.code).toBe("missing_credentials");
    expect(analysis.provenance.mode).toBe("fallback");
    expect(analysis.provenance.externalTransfer).toBe(false);
    expect(analysis.result.observations).toEqual([]);
    expect(analysis.result.uncertainties.join(" ")).toContain(
      "사진에서 확인된 내용은 정리되지 않았습니다",
    );

    const reread = getOwnerReport(db, owner, report.public_id);
    expect(reread.state).toBe("draft");
    expect(reread.title).toBe(report.title);
    expect(getLatestAnalysis(db, owner, report.public_id)?.status).toBe("fallback");
    db.close();
  });

  it("records a timeout fallback without fabricating observations", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider } = makeProvider(undefined, {
      async analyze() {
        throw new ProviderError("timeout", "deadline exceeded");
      },
    });

    const { analysis } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });
    expect(analysis.status).toBe("fallback");
    expect(analysis.failure?.code).toBe("timeout");
    expect(analysis.result.observations).toEqual([]);
    expect(JSON.stringify(analysis)).not.toContain("deadline exceeded");
    db.close();
  });

  it("rejects a malformed response and never stores it", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider } = makeProvider({ category: "sidewalk", observations: "not an array" });

    const { analysis } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });
    expect(analysis.failure?.code).toBe("schema_invalid");
    expect(analysis.result.observations).toEqual([]);
    const stored = db
      .prepare("SELECT result_json FROM report_analyses WHERE report_id = ?")
      .all(report.id) as Array<{ result_json: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.result_json).not.toContain("not an array");
    db.close();
  });

  it("rejects and does not persist text that breaks a guardrail", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const injected: AnalysisResult = {
      ...VALID_RESULT,
      draft: {
        ...VALID_RESULT.draft,
        summary: "자세한 내용은 https://evil.example 에서 확인하세요.",
      },
    };
    const { provider } = makeProvider(injected);

    const { analysis } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });
    expect(analysis.status).toBe("fallback");
    expect(analysis.failure?.code).toBe("guardrail_rejected");
    expect(analysis.guardrail.rules).toContain("url");

    const stored = db
      .prepare("SELECT result_json FROM report_analyses WHERE report_id = ?")
      .all(report.id) as Array<{ result_json: string }>;
    expect(stored[0]!.result_json).not.toContain("evil.example");
    db.close();
  });

  it("keeps the question and answer for an answered clarification", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const asked = makeProvider({
      ...VALID_RESULT,
      clarificationQuestion: "문제가 있는 부분이 길 한가운데에 있나요?",
    });

    const first = await requestAnalysis(db, owner, report.public_id, {
      provider: asked.provider,
      consent: true,
    });
    expect(first.analysis.result.clarificationQuestion).not.toBeNull();

    const answered = makeProvider(VALID_RESULT);
    const second = await requestAnalysis(db, owner, report.public_id, {
      provider: answered.provider,
      consent: true,
      clarificationAnswer: "가장자리에 있어요",
    });
    expect(second.analysis.clarification).toEqual({
      question: "문제가 있는 부분이 길 한가운데에 있나요?",
      answer: "가장자리에 있어요",
    });
    expect(second.analysis.userFacts).toContain("가장자리에 있어요");
    db.close();
  });

  it("enforces the per-report attempt limit and the per-user daily limit", async () => {
    saveLimits();
    const db = tempDb();
    const owner = actor(0);
    const first = await createReport(db, owner);
    const second = await createReport(db, owner);
    const { provider } = makeProvider();

    process.env.CIVICPULSE_AI_PER_REPORT_LIMIT = "2";
    await requestAnalysis(db, owner, first.public_id, { provider, consent: true, refresh: true });
    await requestAnalysis(db, owner, first.public_id, { provider, consent: true, refresh: true });
    await expect(
      requestAnalysis(db, owner, first.public_id, { provider, consent: true, refresh: true }),
    ).rejects.toMatchObject({ status: 429 });

    process.env.CIVICPULSE_AI_PER_REPORT_LIMIT = "5";
    process.env.CIVICPULSE_AI_USER_DAILY_LIMIT = "2";
    // Two live rows already exist for this owner; the next call is blocked.
    await expect(
      requestAnalysis(db, owner, second.public_id, { provider, consent: true }),
    ).rejects.toMatchObject({ status: 429 });
    db.close();
  });

  it("honours a zero global live budget without calling the provider", async () => {
    saveLimits();
    process.env.CIVICPULSE_AI_DAILY_LIMIT = "0";
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider, calls } = makeProvider();

    await expect(
      requestAnalysis(db, owner, report.public_id, { provider, consent: true }),
    ).rejects.toMatchObject({ status: 429 });
    expect(calls()).toBe(0);
    db.close();
  });

  it("refuses analysis and application after publication", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider } = makeProvider();
    const { analysis } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });

    run(db, "UPDATE reports SET state = 'published' WHERE id = ?", [report.id]);
    await expect(
      requestAnalysis(db, owner, report.public_id, { provider, consent: true }),
    ).rejects.toMatchObject({ status: 409 });
    expect(() => applyAnalysis(db, owner, report.public_id, analysis.id)).toThrow(ApiError);
    db.close();
  });

  it("never analyses or applies another user's report", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider } = makeProvider();
    const { analysis } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });

    await expect(
      requestAnalysis(db, actor(1), report.public_id, { provider, consent: true }),
    ).rejects.toMatchObject({ status: 404 });
    expect(() => applyAnalysis(db, actor(1), report.public_id, analysis.id)).toThrow(ApiError);
    expect(() => getLatestAnalysis(db, actor(1), report.public_id)).toThrow(ApiError);
    db.close();
  });

  it("applies the draft, and asks before replacing text the citizen edited", async () => {
    const db = tempDb();
    const owner = actor(0);
    const report = await createReport(db, owner);
    const { provider } = makeProvider();
    const { analysis } = await requestAnalysis(db, owner, report.public_id, {
      provider,
      consent: true,
    });

    const applied = applyAnalysis(db, owner, report.public_id, analysis.id);
    expect(applied.title).toBe(VALID_RESULT.draft.title);
    expect(applied.description).toContain("현황");
    expect(applied.description).toContain("요청");
    expect(applied.description).toContain("서울 마포구, OO초등학교 후문 인근 (구역 단위 표시)");
    expect(applied.appliedAnalysisId).toBe(analysis.id);

    // Re-applying the same text is not an edit and needs no confirmation.
    expect(() => applyAnalysis(db, owner, report.public_id, analysis.id)).not.toThrow();

    updateDraftReport(db, owner, report.public_id, {
      title: "내가 직접 고친 제목입니다",
      description: "내가 직접 고친 본문이며 열 자 이상입니다.",
    });

    try {
      applyAnalysis(db, owner, report.public_id, analysis.id);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).details).toMatchObject({ reason: "ALREADY_EDITED" });
    }

    const overwritten = applyAnalysis(db, owner, report.public_id, analysis.id, {
      overwrite: true,
    });
    expect(overwritten.description).toContain("현황");
    db.close();
  });
});
