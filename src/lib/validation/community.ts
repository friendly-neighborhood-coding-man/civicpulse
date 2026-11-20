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

/**
 * Provenance kinds. These are deliberately *not* interchangeable:
 *
 * - `official_source`: a human moderator cited a page on a verified official
 *   portal *domain*. This does not verify the specific case, its receipt or its
 *   resolution: the product has no government API and never fetches the page.
 *   The UI therefore says "portal citation", never "officially confirmed".
 * - `moderator_claim`: a moderator recorded something with no source or with an
 *   unverified source. Never rendered as government confirmation.
 * - `user_claim`: the report owner's own observation.
 * - `mock`: explicitly simulated demo data.
 *
 * There is no `authenticated` kind because no authenticated official
 * integration exists. Adding one later must add a new provenance value.
 */
export const STATUS_KINDS = [
  "official_source",
  "moderator_claim",
  "user_claim",
  "mock",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const KIND_LABEL: Record<StatusKind, string> = {
  official_source: "공식 포털 인용 · 운영자 입력",
  moderator_claim: "운영자 기록 · 미검증",
  user_claim: "시민 주장",
  mock: "모의 데이터",
};

export const KIND_HINT: Record<StatusKind, string> = {
  official_source:
    "등록된 공식 포털(안전신문고·국민신문고)의 주소를 인용해 기록합니다. 도메인만 확인하며, 해당 사건의 접수·처리·해결 여부나 인용한 페이지의 내용은 확인하지 않습니다. 정부 시스템과 자동 연동도 없습니다.",
  moderator_claim:
    "공식 포털 밖의 자료이거나 출처가 없을 때 사용합니다. 공개 화면에서 미검증 운영자 기록으로 표시됩니다.",
  user_claim: "제보 작성자 본인의 관찰입니다. 사실 확인으로 표시되지 않습니다.",
  mock: "화면 시연용 모의 기록입니다. 실제 기관의 답변이 아닙니다.",
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

export const statusEventSchema = z
  .object({
    kind: z.enum(STATUS_KINDS, { message: "기록 종류를 선택해 주세요." }),
    status: z.enum(STATUS_VALUES),
    note: z
      .string()
      .trim()
      .min(5, "내용은 5자 이상 입력해 주세요.")
      .max(600, "내용은 600자 이하로 입력해 주세요."),
    sourceUrl: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "official_source" && !value.sourceUrl) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "공식 포털 인용에는 출처 주소가 필요합니다.",
      });
    }
    if (
      (value.kind === "user_claim" || value.kind === "mock") &&
      value.sourceUrl
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "이 기록 종류에는 출처 주소를 붙일 수 없습니다.",
      });
    }
  });
