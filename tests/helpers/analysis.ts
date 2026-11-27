import type { AnalysisResult } from "@/lib/ai/schema";

/** A schema-valid model result used across the AI tests. */
export const VALID_RESULT: AnalysisResult = {
  category: "sidewalk",
  categoryConfidence: "medium",
  imageQuality: { clarity: "clear", note: "보도 표면이 밝게 보입니다." },
  imageMatchesDescription: "consistent",
  observations: ["격자 모양 줄눈이 있는 보도 포장면이 보입니다."],
  interpretations: ["보도블록이 깨지거나 들떠 있을 가능성이 있습니다."],
  safetyConcerns: ["보행자가 걸려 넘어질 우려가 있습니다."],
  uncertainties: ["실제 사고 발생 여부는 확인되지 않았습니다."],
  missingEvidence: ["파손 부위를 가까이에서 찍은 사진"],
  privacyWarnings: [],
  nextSteps: ["공개 전에 사진의 개인정보를 확인합니다."],
  clarificationQuestion: null,
  draft: {
    title: "보도블록 파손 점검 요청",
    summary: "보도 포장면에 갈라진 부분이 보입니다.",
    concern: "보행자가 걸려 넘어질 우려가 있습니다.",
    requestedAction: "관할 기관에서 현장을 확인해 주시기 바랍니다.",
  },
};
