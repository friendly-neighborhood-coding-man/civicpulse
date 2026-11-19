import { z } from "zod";

import { LIMITS } from "../limits.ts";

export const STATUS_VALUES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "unresolved",
  "recurred",
] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

export const STATUS_LABEL: Record<StatusValue, string> = {
  open: "접수·진행 전",
  acknowledged: "접수 확인",
  in_progress: "처리 중",
  resolved: "해결됨",
  unresolved: "미해결",
  recurred: "재발",
};

export const STATUS_KINDS = ["official", "user_claim", "mock"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const KIND_LABEL: Record<StatusKind, string> = {
  official: "공식 확인",
  user_claim: "시민 주장",
  mock: "모의 데이터",
};

export const evidenceNoteSchema = z
  .string()
  .trim()
  .min(5, "설명은 5자 이상 입력해 주세요.")
  .max(LIMITS.maxEvidenceNoteLength, `설명은 ${LIMITS.maxEvidenceNoteLength}자 이하로 입력해 주세요.`);

/**
 * Additional evidence is *never* auto-published: it requires the uploader to
 * confirm they checked for personal information and a moderator to approve it.
 */
export const addEvidenceSchema = z.object({
  note: evidenceNoteSchema,
  ackNoSensitive: z.boolean(),
});

export const reviewEvidenceSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(200).optional(),
});

export const statusEventSchema = z.object({
  kind: z.enum(STATUS_KINDS),
  status: z.enum(STATUS_VALUES),
  note: z
    .string()
    .trim()
    .min(5, "내용은 5자 이상 입력해 주세요.")
    .max(600, "내용은 600자 이하로 입력해 주세요."),
  sourceUrl: z
    .string()
    .trim()
    .url("출처 주소는 https:// 로 시작해야 합니다.")
    .max(500)
    .optional(),
});
