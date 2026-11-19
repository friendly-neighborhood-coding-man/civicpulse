import { z } from "zod";

import { LIMITS } from "../config.ts";
import { REPORT_CATEGORY_IDS } from "../domain/areas.ts";

const descriptionField = z
  .string()
  .trim()
  .min(10, "설명은 10자 이상 입력해 주세요.")
  .max(
    LIMITS.maxDescriptionLength,
    `설명은 ${LIMITS.maxDescriptionLength}자 이하로 입력해 주세요.`,
  );

const landmarkField = z
  .string()
  .trim()
  .max(80, "주변 지형지는 80자 이하로 입력해 주세요.");

const titleField = z
  .string()
  .trim()
  .min(5, "제목은 5자 이상 입력해 주세요.")
  .max(LIMITS.maxTitleLength, `제목은 ${LIMITS.maxTitleLength}자 이하로 입력해 주세요.`);

export const createReportSchema = z.object({
  description: descriptionField,
  category: z.enum(REPORT_CATEGORY_IDS, {
    message: "제보 유형을 선택해 주세요.",
  }),
  areaId: z.string().trim().min(1, "위치 구역을 선택해 주세요.").max(64),
  landmark: landmarkField.default(""),
});

export type CreateReportInput = z.output<typeof createReportSchema>;

/**
 * PATCH body. Fields stay truly optional — no defaults — so a partial update
 * can never silently blank a field the client did not send.
 */
export const updateDraftSchema = z
  .object({
    title: titleField.optional(),
    description: descriptionField.optional(),
    landmark: landmarkField.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: "수정할 항목이 없습니다." },
  );

export type UpdateDraftInput = z.output<typeof updateDraftSchema>;
