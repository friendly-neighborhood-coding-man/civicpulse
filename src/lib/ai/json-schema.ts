import { REPORT_CATEGORY_IDS } from "../domain/areas.ts";
import { ANALYSIS_LIMITS as L, ANALYSIS_SCHEMA_VERSION } from "./schema.ts";

/**
 * JSON Schema sent to the provider for Structured Outputs (strict mode).
 *
 * It mirrors `analysisResultSchema`. Strict mode requires every property to be
 * listed in `required` and `additionalProperties: false` on every object;
 * optional values are expressed as `null`. String length keywords are not
 * relied on (support is not documented for strict mode), so lengths are stated
 * in the descriptions and enforced by the server-side zod parse instead.
 */

function list(maxItems: number, description: string) {
  return {
    type: "array",
    maxItems,
    description,
    items: { type: "string" },
  } as const;
}

export const ANALYSIS_JSON_SCHEMA_NAME = ANALYSIS_SCHEMA_VERSION.replace(/\./g, "_");

export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "categoryConfidence",
    "imageQuality",
    "imageMatchesDescription",
    "observations",
    "interpretations",
    "safetyConcerns",
    "uncertainties",
    "missingEvidence",
    "privacyWarnings",
    "nextSteps",
    "clarificationQuestion",
    "draft",
  ],
  properties: {
    category: {
      type: "string",
      enum: [...REPORT_CATEGORY_IDS],
      description: "Closest issue kind. Use 'other' when unsure.",
    },
    categoryConfidence: { type: "string", enum: ["low", "medium", "high"] },
    imageQuality: {
      type: "object",
      additionalProperties: false,
      required: ["clarity", "note"],
      properties: {
        clarity: { type: "string", enum: ["clear", "limited", "unusable"] },
        note: { type: "string", description: `Korean, <= ${L.maxNoteLength} chars.` },
      },
    },
    imageMatchesDescription: {
      type: "string",
      enum: ["consistent", "partly", "inconsistent", "unclear"],
    },
    observations: list(
      L.maxObservations,
      `Only what is directly visible. Korean, each <= ${L.maxItemLength} chars.`,
    ),
    interpretations: list(
      L.maxInterpretations,
      "Hedged readings of the observations (가능성/보입니다). Korean.",
    ),
    safetyConcerns: list(
      L.maxSafetyConcerns,
      "Possible safety concerns, always qualified. Korean.",
    ),
    uncertainties: list(
      L.maxUncertainties,
      "What cannot be confirmed from the photo and text. Korean.",
    ),
    missingEvidence: list(
      L.maxMissingEvidence,
      "Evidence that would make the report more useful. Korean.",
    ),
    privacyWarnings: list(
      L.maxPrivacyWarnings,
      "Visible faces, licence plates, house numbers, names or documents to mask. Korean.",
    ),
    nextSteps: list(L.maxNextSteps, "Practical steps for the citizen. Korean."),
    clarificationQuestion: {
      type: ["string", "null"],
      description: `One short Korean question, or null when not needed. <= ${L.maxQuestionLength} chars.`,
    },
    draft: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "concern", "requestedAction"],
      properties: {
        title: { type: "string", description: `Korean, 5-${L.maxTitleLength} chars.` },
        summary: {
          type: "string",
          description: `Neutral factual description. Korean, <= ${L.maxSummaryLength} chars.`,
        },
        concern: {
          type: "string",
          description: `Qualified possible impact, or empty. Korean, <= ${L.maxConcernLength} chars.`,
        },
        requestedAction: {
          type: "string",
          description: `Inspection or repair request. Korean, <= ${L.maxActionLength} chars.`,
        },
      },
    },
  },
} as const;
