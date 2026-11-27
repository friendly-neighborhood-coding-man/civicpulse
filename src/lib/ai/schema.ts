import { z } from "zod";

import { REPORT_CATEGORY_IDS } from "../domain/areas.ts";

/**
 * The versioned contract between CivicPulse and any analysis provider.
 *
 * One multimodal call returns exactly this object. It is validated on the server
 * before anything is stored or shown; a response that does not parse is treated
 * as a provider failure and never rendered.
 *
 * The four kinds of statement are kept in separate fields on purpose:
 *   observations     — what is directly visible in the photo
 *   interpretations  — the model's hedged reading of what it sees
 *   (user facts)     — copied verbatim from the citizen by the server, never by
 *                      the model, so they cannot be paraphrased into something new
 *   uncertainties    — what cannot be known from the photo and text
 *
 * Deliberately free of Node imports: the report page renders these types.
 */

export const ANALYSIS_SCHEMA_VERSION = "civicpulse.analysis.v1";

export const ANALYSIS_LIMITS = {
  /** Characters of citizen text that reach the model. */
  maxCitizenText: 1_000,
  maxClarificationAnswer: 200,
  maxItemLength: 200,
  maxNoteLength: 200,
  maxQuestionLength: 160,
  maxTitleLength: 80,
  maxSummaryLength: 700,
  maxConcernLength: 400,
  maxActionLength: 400,
  maxObservations: 6,
  maxInterpretations: 4,
  maxSafetyConcerns: 4,
  maxUncertainties: 6,
  maxMissingEvidence: 5,
  maxPrivacyWarnings: 4,
  maxNextSteps: 4,
} as const;

const L = ANALYSIS_LIMITS;

const item = z.string().trim().min(1).max(L.maxItemLength);

export const analysisResultSchema = z
  .object({
    category: z.enum(REPORT_CATEGORY_IDS),
    categoryConfidence: z.enum(["low", "medium", "high"]),
    imageQuality: z
      .object({
        clarity: z.enum(["clear", "limited", "unusable"]),
        note: z.string().trim().max(L.maxNoteLength),
      })
      .strict(),
    imageMatchesDescription: z.enum(["consistent", "partly", "inconsistent", "unclear"]),
    observations: z.array(item).max(L.maxObservations),
    interpretations: z.array(item).max(L.maxInterpretations),
    safetyConcerns: z.array(item).max(L.maxSafetyConcerns),
    uncertainties: z.array(item).max(L.maxUncertainties),
    missingEvidence: z.array(item).max(L.maxMissingEvidence),
    privacyWarnings: z.array(item).max(L.maxPrivacyWarnings),
    nextSteps: z.array(item).max(L.maxNextSteps),
    clarificationQuestion: z.string().trim().min(1).max(L.maxQuestionLength).nullable(),
    draft: z
      .object({
        title: z.string().trim().min(5).max(L.maxTitleLength),
        summary: z.string().trim().min(10).max(L.maxSummaryLength),
        concern: z.string().trim().max(L.maxConcernLength),
        requestedAction: z.string().trim().min(5).max(L.maxActionLength),
      })
      .strict(),
  })
  .strict();

export type AnalysisResult = z.output<typeof analysisResultSchema>;

export type AnalysisMode = "live" | "mock" | "fallback";

export const FAILURE_CODES = [
  "missing_credentials",
  "budget_exhausted",
  "timeout",
  "network",
  "rate_limited",
  "auth_failed",
  "provider_error",
  "refused",
  "incomplete",
  "malformed",
  "schema_invalid",
  "guardrail_rejected",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

/** Citizen-facing explanation; never includes provider error text. */
export const FAILURE_LABEL: Record<FailureCode, string> = {
  missing_credentials: "AI 서비스가 설정되지 않았습니다(API 키 없음).",
  budget_exhausted: "오늘 사용할 수 있는 AI 분석 한도를 모두 사용했습니다.",
  timeout: "AI 서비스 응답 시간이 초과되었습니다.",
  network: "AI 서비스에 연결하지 못했습니다.",
  rate_limited: "AI 서비스가 요청을 일시적으로 제한했습니다.",
  auth_failed: "AI 서비스 인증에 실패했습니다(운영자 설정 확인 필요).",
  provider_error: "AI 서비스에서 오류가 발생했습니다.",
  refused: "AI 서비스가 이 요청의 분석을 거절했습니다.",
  incomplete: "AI 응답이 길이 제한으로 끝까지 생성되지 않았습니다.",
  malformed: "AI 응답 형식이 올바르지 않아 사용하지 않았습니다.",
  schema_invalid: "AI 응답이 약속된 구조와 달라 사용하지 않았습니다.",
  guardrail_rejected:
    "AI 초안에 확인되지 않은 연락처·법률 판단·처리 결과 같은 내용이 있어 사용하지 않았습니다.",
};

export type GuardrailReport = {
  /** Number of list items removed because they broke a content rule. */
  removedItems: number;
  /** Rule ids that fired; never the offending text itself. */
  rules: string[];
};

/**
 * What the owner's browser receives. No storage keys, no fingerprint, no raw
 * provider payload.
 */
export type AnalysisView = {
  id: string;
  schemaVersion: string;
  status: "completed" | "fallback";
  createdAt: string;
  appliedAt: string | null;
  result: AnalysisResult;
  /** Verbatim citizen statements, copied by the server. */
  userFacts: string[];
  clarification: { question: string; answer: string } | null;
  provenance: {
    mode: AnalysisMode;
    provider: string | null;
    model: string | null;
    /** True only when the image actually left this server for a provider. */
    externalTransfer: boolean;
    /** True when a scripted simulation fixture produced the observations. */
    simulatedObservations: boolean;
    latencyMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  failure: { code: FailureCode; message: string } | null;
  guardrail: GuardrailReport;
  /** Server-composed report body built from the draft fields. */
  proposedDescription: string;
};
