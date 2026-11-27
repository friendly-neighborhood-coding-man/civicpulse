import { describe, expect, it } from "vitest";

import { applyGuardrails, checkText } from "@/lib/ai/guardrails";
import type { AnalysisResult } from "@/lib/ai/schema";
import { VALID_RESULT } from "./helpers/analysis";

const USER_TEXT = "여기 길이 깨져서 위험해요";

function withResult(patch: Partial<AnalysisResult>): AnalysisResult {
  return { ...VALID_RESULT, ...patch };
}

describe("analysis guardrails", () => {
  it("drops invented links from a list item and counts it", () => {
    const outcome = applyGuardrails(
      withResult({
        observations: ["현장 안내는 https://example.go.kr 에서 확인했습니다."],
      }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.observations).toEqual([]);
    expect(outcome.report.rules).toContain("url");
    expect(outcome.report.removedItems).toBe(1);
  });

  it("drops invented phone numbers and resident-id shapes", () => {
    const outcome = applyGuardrails(
      withResult({
        observations: ["02-1234-5678로 문의했습니다.", "주민번호 900101-1234567"],
      }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.observations).toEqual([]);
    expect(outcome.report.rules).toContain("contact");
  });

  it("drops a named agency the citizen never mentioned", () => {
    const outcome = applyGuardrails(
      withResult({ observations: ["마포구청에서 처리했습니다."] }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.observations).toEqual([]);
    expect(outcome.report.rules).toContain("agency");
  });

  it("allows an agency name that the citizen themselves wrote", () => {
    const userText = "마포구청에 문의했는데 아직 답이 없어요";
    const outcome = applyGuardrails(
      withResult({
        draft: {
          ...VALID_RESULT.draft,
          summary: '제보자는 "마포구청"에 문의했다고 설명했습니다.',
        },
      }),
      userText,
    );
    expect(outcome.ok).toBe(true);
  });

  it("rejects the whole analysis when the draft asserts a legal violation", () => {
    const outcome = applyGuardrails(
      withResult({
        draft: {
          ...VALID_RESULT.draft,
          summary: "이 시설물은 도로법 제3조를 위반했습니다.",
        },
      }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.report.rules).toContain("legal");
  });

  it("rejects a draft that claims the complaint was already filed or fixed", () => {
    const outcome = applyGuardrails(
      withResult({
        draft: {
          ...VALID_RESULT.draft,
          requestedAction: "이미 접수되었으므로 추가 조치는 없습니다.",
        },
      }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.report.rules).toContain("government_action");
  });

  it("rejects an invented measurement but keeps one the citizen stated", () => {
    const invented = applyGuardrails(
      withResult({
        draft: { ...VALID_RESULT.draft, summary: "약 30cm 정도 파인 곳이 있습니다." },
      }),
      USER_TEXT,
    );
    expect(invented.ok).toBe(false);

    const stated = applyGuardrails(
      withResult({
        observations: ["약 30cm 정도 파인 곳이 보입니다."],
      }),
      "폭이 30cm 정도로 파여 있어요",
    );
    expect(stated.ok).toBe(true);
  });

  it("rejects an incident the citizen never mentioned, but allows an explicit unknown", () => {
    const invented = applyGuardrails(
      withResult({ observations: ["자전거가 넘어져 다친 사람이 있습니다."] }),
      USER_TEXT,
    );
    expect(invented.ok).toBe(true);
    if (!invented.ok) return;
    expect(invented.result.observations).toEqual([]);

    const stated = applyGuardrails(
      withResult({ observations: ["자전거가 넘어져 다친 사람이 있습니다."] }),
      "자전거가 넘어져 다친 사람이 있어요",
    );
    expect(stated.ok).toBe(true);
    if (!stated.ok) return;
    expect(stated.result.observations).toHaveLength(1);

    // An uncertainty may name the possibility; it must not be dropped when
    // explicitly qualified as unknown.
    const unknown = applyGuardrails(
      withResult({ uncertainties: ["사고 발생 여부는 확인되지 않았습니다."] }),
      USER_TEXT,
    );
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.result.uncertainties).toHaveLength(1);
  });

  it("drops an interpretation that is stated as fact rather than a possibility", () => {
    const outcome = applyGuardrails(
      withResult({ interpretations: ["보도블록이 파손되었습니다."] }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.interpretations).toEqual([]);
    expect(outcome.report.rules).toContain("unhedged_interpretation");
  });

  it("drops a fabricated prior-report history", () => {
    const outcome = applyGuardrails(
      withResult({ observations: ["이전에 여러 차례 신고한 적이 있습니다."] }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.observations).toEqual([]);
    expect(outcome.report.rules).toContain("prior_report");
  });

  it("drops a road-name address the citizen did not provide", () => {
    const outcome = applyGuardrails(
      withResult({ observations: ["망원로 12 앞 보도입니다."] }),
      USER_TEXT,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.observations).toEqual([]);
    expect(outcome.report.rules).toContain("address");
  });

  it("drops a licence plate and rejects unsupported certainty in the draft", () => {
    const plate = applyGuardrails(
      withResult({ observations: ["차량 12가 3456이 통행을 막고 있습니다."] }),
      USER_TEXT,
    );
    expect(plate.ok).toBe(true);
    if (!plate.ok) return;
    expect(plate.result.observations).toEqual([]);
    expect(plate.report.rules).toContain("plate");

    const certain = applyGuardrails(
      withResult({
        draft: { ...VALID_RESULT.draft, concern: "확실히 위험합니다." },
      }),
      USER_TEXT,
    );
    expect(certain.ok).toBe(false);
    if (certain.ok) return;
    expect(certain.report.rules).toContain("certainty");
  });

  it("never mentions the offending values in the report", () => {
    const outcome = applyGuardrails(
      withResult({ observations: ["02-9876-5432 또는 https://evil.example"] }),
      USER_TEXT,
    );
    expect(JSON.stringify(outcome.report)).not.toContain("9876");
    expect(JSON.stringify(outcome.report)).not.toContain("evil.example");
  });

  it("checks a single field without mutating it", () => {
    expect(
      checkText("마포구청에서 처리했습니다.", "observation", {
        userText: USER_TEXT,
        userNumbers: new Set(),
      }),
    ).toBe("agency");
    expect(
      checkText("보도블록이 들떠 있을 가능성이 있습니다.", "interpretation", {
        userText: USER_TEXT,
        userNumbers: new Set(),
      }),
    ).toBeNull();
  });
});
