import { describe, expect, it } from "vitest";

import { generateDraft } from "@/lib/services/assistant";

const base = {
  userDescription: "보도 블록이 들떠 있어서 유모차가 지나가기 위험합니다.",
  category: "sidewalk" as const,
  areaLabel: "서울 마포구",
  landmark: "OO초등학교 후문",
  now: new Date("2026-11-19T03:00:00.000Z"),
};

describe("deterministic assistant", () => {
  it("is deterministic for the same input", () => {
    expect(generateDraft(base)).toEqual(generateDraft(base));
  });

  it("restates the citizen's description instead of inventing facts", () => {
    const draft = generateDraft(base);
    expect(draft.description).toContain(base.userDescription);
    expect(draft.description).toContain("현황");
    expect(draft.description).toContain("위치");
    expect(draft.description).toContain("요청");
    expect(draft.title).toContain("OO초등학교 후문");
  });

  it("does not fabricate contacts, links or phone numbers", () => {
    const draft = generateDraft(base);
    const text = [draft.title, draft.description, ...draft.suggestedSteps, draft.disclosure].join(
      "\n",
    );
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/0\d{1,2}-\d{3,4}-\d{4}/);
    expect(text).not.toMatch(/담당자|공무원 이름/);
  });

  it("declares its own limited nature", () => {
    const draft = generateDraft(base);
    expect(draft.mode).toBe("mock");
    expect(draft.disclosure).toContain("규칙 기반");
    expect(draft.disclosure).toContain("확인해야");
    expect(draft.generatedAt).toBe("2026-11-19T03:00:00.000Z");
  });

  it("maps categories to verified channels only", () => {
    expect(generateDraft(base).channelId).toBe("safetyreport");
    expect(generateDraft({ ...base, category: "waste" }).channelId).toBe("safetyreport");
    expect(generateDraft({ ...base, category: "other" }).channelId).toBe("epeople");
  });

  it("adds category-specific evidence suggestions without duplicating them", () => {
    const sidewalk = generateDraft(base).missingEvidence;
    const light = generateDraft({ ...base, category: "streetlight" }).missingEvidence;
    expect(new Set(sidewalk).size).toBe(sidewalk.length);
    expect(sidewalk.join(" ")).toContain("파손 부위");
    expect(light.join(" ")).toContain("야간");
    expect(sidewalk).not.toEqual(light);
  });

  it("collapses control characters and enforces length caps", () => {
    const draft = generateDraft({
      ...base,
      userDescription: `  첫 줄\n\n둘째 줄\u0007 ${"가".repeat(4000)}  `,
      landmark: "  ".repeat(200),
    });
    expect(draft.description).not.toMatch(/[\u0000-\u0008]/);
    expect(draft.description.length).toBeLessThan(2_500);
    expect(draft.title.length).toBeLessThanOrEqual(120);
    expect(draft.title).not.toContain("OO초등학교");
  });

  it("falls back to the area label when no landmark is given", () => {
    const draft = generateDraft({ ...base, landmark: "" });
    expect(draft.title).toContain("서울 마포구");
    expect(draft.description).toContain("구역 단위 표시");
  });
});
