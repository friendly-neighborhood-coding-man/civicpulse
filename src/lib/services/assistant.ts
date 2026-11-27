import {
  categoryLabel,
  type ReportCategoryId,
} from "../domain/areas.ts";
import { channelForCategory } from "../domain/channels.ts";

/**
 * The deterministic, offline "assistant".
 *
 * It is a template engine, not a language model: it never invents an agency,
 * contact, URL, legal requirement or status. Every sentence either restates
 * something the citizen typed or is a fixed instruction. The UI labels it
 * `규칙 기반(모의)` and the report row stores `assistant_mode = 'mock'`.
 *
 * A future remote model must implement this same interface behind an explicit
 * budget and must keep the "no fabricated contacts" post-checks; see
 * docs/INTEGRATIONS.md.
 */

export type AssistantInput = {
  userDescription: string;
  category: ReportCategoryId;
  areaLabel: string;
  landmark?: string;
  now?: Date;
};

export type AssistantDraft = {
  mode: "mock";
  title: string;
  description: string;
  missingEvidence: string[];
  suggestedSteps: string[];
  channelId: string | null;
  generatedAt: string;
  disclosure: string;
};

const HEADLINE: Record<ReportCategoryId, string> = {
  sidewalk: "보도 파손 신고",
  streetlight: "가로등·시설 고장 신고",
  waste: "쓰레기 무단투기 신고",
  water: "누수·배수 문제 신고",
  signage: "불법 광고물 신고",
  accessibility: "보행 장애물 신고",
  other: "생활 불편 신고",
};

const CATEGORY_EVIDENCE: Record<ReportCategoryId, string[]> = {
  sidewalk: [
    "파손 부위의 크기를 가늠할 수 있는 가까운 사진",
    "보행자가 어떻게 우회하는지 보이는 사진",
  ],
  streetlight: [
    "어두운 상태에서 촬영한 야간 사진",
    "가로등에 표시된 관리 번호(있는 경우)",
  ],
  waste: [
    "투기 장소의 범위가 보이는 사진",
    "같은 장소에서 반복 발생했는지 여부",
  ],
  water: [
    "누수 지점과 주변 피해 범위",
    "물이 고이거나 흐르는 방향이 보이는 사진",
  ],
  signage: [
    "광고물 전체와 부착된 시설물이 함께 보이는 사진",
    "부착 위치를 알 수 있는 주변 배경",
  ],
  accessibility: [
    "통행이 막힌 범위와 남은 통로 폭을 알 수 있는 사진",
    "같은 장소에서 계속 반복되는지 여부",
  ],
  other: [
    "문제를 가장 명확하게 보여주는 사진",
    "주변 맥락(건물, 도로명 표지 등)이 보이는 사진",
  ],
};

function normalize(text: string, max: number): string {
  return text
    .normalize("NFC")
    // Strip control characters (including newlines) so the template stays intact.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function generateDraft(input: AssistantInput): AssistantDraft {
  const now = input.now ?? new Date();
  const body = normalize(input.userDescription, 1_500);
  const landmark = normalize(input.landmark ?? "", 80);
  const area = normalize(input.areaLabel, 80);
  const headline = HEADLINE[input.category];

  const title = normalize(
    landmark ? `${landmark} 인근 ${headline}` : `${area} ${headline}`,
    120,
  );

  const locationLine = landmark
    ? `${area}, ${landmark} 인근 (구역 단위 표시)`
    : `${area} (구역 단위 표시)`;

  const description = [
    "현황",
    body,
    "",
    "위치",
    locationLine,
    "",
    "요청",
    `${categoryLabel(input.category)} 문제이므로 현장 확인과 안전 조치를 검토해 주세요.`,
  ].join("\n");

  const missingEvidence = [
    "문제가 드러나는 현재 상태 사진(가까이, 그리고 주변 배경)",
    "발견한 시점과 그 이후 변화",
    ...CATEGORY_EVIDENCE[input.category],
  ];

  const suggestedSteps = [
    "사진에 얼굴·번호판 등 개인정보가 보이면 가림 처리합니다.",
    "위치를 구역 단위로 확인하고, 공개 범위를 직접 결정합니다.",
    "초안의 문장이 사실과 다르면 고칩니다.",
    "확인된 공식 창구에서 본인이 직접 접수합니다. 자동 제출은 없습니다.",
  ];

  return {
    mode: "mock",
    title,
    description,
    missingEvidence,
    suggestedSteps,
    channelId: channelForCategory(input.category)?.id ?? null,
    generatedAt: now.toISOString(),
    disclosure:
      "규칙 기반으로 만든 초안입니다. 공식 기관·연락처·처리 결과를 새로 만들지 않으며, 제출 전 작성자가 사실관계를 확인해야 합니다.",
  };
}
