import { describe, expect, it } from "vitest";

import {
  ANALYSIS_LIMITS,
  ANALYSIS_SCHEMA_VERSION,
  analysisResultSchema,
} from "@/lib/ai/schema";
import { VALID_RESULT } from "./helpers/analysis";

describe("analysis schema", () => {
  it("accepts a complete, in-range result", () => {
    expect(analysisResultSchema.parse(VALID_RESULT)).toEqual(VALID_RESULT);
    expect(ANALYSIS_SCHEMA_VERSION).toBe("civicpulse.analysis.v1");
  });

  it("rejects a missing field instead of defaulting it", () => {
    const { draft: _draft, ...withoutDraft } = VALID_RESULT;
    expect(analysisResultSchema.safeParse(withoutDraft).success).toBe(false);
  });

  it("rejects unknown fields so a provider cannot smuggle data through", () => {
    const withExtra = {
      ...VALID_RESULT,
      governmentContact: "https://example.go.kr",
    };
    expect(analysisResultSchema.safeParse(withExtra).success).toBe(false);
    const badDraft = {
      ...VALID_RESULT,
      draft: { ...VALID_RESULT.draft, legalBasis: "도로법 제3조" },
    };
    expect(analysisResultSchema.safeParse(badDraft).success).toBe(false);
  });

  it("rejects an unknown category and an over-long string", () => {
    expect(
      analysisResultSchema.safeParse({ ...VALID_RESULT, category: "pothole" }).success,
    ).toBe(false);
    expect(
      analysisResultSchema.safeParse({
        ...VALID_RESULT,
        observations: ["가".repeat(ANALYSIS_LIMITS.maxItemLength + 1)],
      }).success,
    ).toBe(false);
    expect(
      analysisResultSchema.safeParse({
        ...VALID_RESULT,
        draft: { ...VALID_RESULT.draft, title: "짧" },
      }).success,
    ).toBe(false);
  });

  it("caps the number of list items", () => {
    const tooMany = Array.from(
      { length: ANALYSIS_LIMITS.maxObservations + 1 },
      (_, index) => `관찰 ${index}`,
    );
    expect(
      analysisResultSchema.safeParse({ ...VALID_RESULT, observations: tooMany }).success,
    ).toBe(false);
  });
});
