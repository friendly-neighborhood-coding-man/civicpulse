import { z } from "zod";

import { ANALYSIS_LIMITS } from "../ai/schema.ts";

/**
 * Analysis request body. Every field is bounded here; the domain re-cleans the
 * answer so control characters cannot reach a prompt or the audit row.
 */
export const requestAnalysisSchema = z
  .object({
    clarificationAnswer: z
      .string()
      .trim()
      .max(
        ANALYSIS_LIMITS.maxClarificationAnswer,
        `추가 설명은 ${ANALYSIS_LIMITS.maxClarificationAnswer}자 이하로 입력해 주세요.`,
      )
      .nullable()
      .optional(),
    /** Explicit authorisation to send the image to an external provider. */
    consent: z.boolean().optional(),
    /** Bypass the identical-input cache when the citizen explicitly retries. */
    refresh: z.boolean().optional(),
  })
  .strict();

export type RequestAnalysisInput = z.output<typeof requestAnalysisSchema>;

export const applyAnalysisSchema = z
  .object({
    analysisId: z.string().trim().min(1).max(64),
    /** Confirmed after the server reported that the body was already edited. */
    overwrite: z.boolean().optional(),
  })
  .strict();
