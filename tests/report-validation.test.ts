import { describe, expect, it } from "vitest";

import { createReportSchema, updateDraftSchema } from "@/lib/validation/report";

const valid = {
  description: "보도 블록이 들떠 있어서 유모차가 지나가기 위험합니다.",
  category: "sidewalk",
  areaId: "seoul-mapo",
  landmark: "",
};

describe("report input validation", () => {
  it("accepts a complete report and defaults the landmark", () => {
    const parsed = createReportSchema.parse({ ...valid, landmark: undefined });
    expect(parsed).toEqual({ ...valid, landmark: "" });
  });

  it("trims text before checking length", () => {
    const parsed = createReportSchema.parse({
      ...valid,
      description: `   ${valid.description}   `,
    });
    expect(parsed.description).toBe(valid.description);
    expect(createReportSchema.safeParse({ ...valid, description: "   짧음   " }).success).toBe(
      false,
    );
  });

  it("rejects unknown categories, missing areas and oversized text", () => {
    expect(createReportSchema.safeParse({ ...valid, category: "traffic" }).success).toBe(
      false,
    );
    expect(createReportSchema.safeParse({ ...valid, areaId: "  " }).success).toBe(false);
    expect(
      createReportSchema.safeParse({ ...valid, description: "가".repeat(2_001) }).success,
    ).toBe(false);
    expect(
      createReportSchema.safeParse({ ...valid, landmark: "가".repeat(81) }).success,
    ).toBe(false);
  });

  it("rejects database-hostile category values", () => {
    for (const category of ["sidewalk'; DROP TABLE reports;--", "", "SIDEWALK"]) {
      expect(createReportSchema.safeParse({ ...valid, category }).success).toBe(false);
    }
  });

  it("requires at least one editable field on update", () => {
    expect(updateDraftSchema.safeParse({}).success).toBe(false);
    expect(updateDraftSchema.safeParse({ title: "충분히 긴 제목" }).success).toBe(true);
    expect(updateDraftSchema.safeParse({ title: "짧" }).success).toBe(false);
  });
});
