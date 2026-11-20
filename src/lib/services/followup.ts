import type { PublicChannel } from "../domain/channels.ts";
import {
  KIND_LABEL,
  STATUS_LABEL,
  type StatusKind,
  type StatusValue,
} from "../validation/community.ts";

/**
 * Deterministic follow-up draft.
 *
 * This is a *template*: it restates what the citizen already recorded, separates
 * official information from citizen claims, and never invents an agency, contact
 * detail or processing result. It performs no network call and marks itself as
 * not submitted. A human must review and submit it through a verified channel.
 */

export type FollowupBody = {
  title: string;
  summary: string;
  currentSituation: string;
  requestedAction: string;
  official: {
    label: string;
    note: string;
    sourceUrl: string | null;
    /** Host the cited official-portal link actually points at. */
    sourceHost: string | null;
    checkedAt: string;
  } | null;
  claims: Array<{
    kind: StatusKind;
    label: string;
    note: string;
    createdAt: string;
  }>;
  evidence: Array<{ note: string; approvedAt: string }>;
  /**
   * Reported support at draft time. Context only: it is never presented as
   * evidence that the report is true, and it never makes a draft eligible.
   */
  communitySupport: {
    count: number;
    note: string;
    countsAsVerification: false;
  };
  channel: { name: string; operator: string; url: string } | null;
  attachments: string[];
  disclaimer: string;
  notSubmitted: true;
  mode: "mock";
};

export type FollowupInput = {
  title: string;
  areaLabel: string;
  publishedAt: string;
  ageDays: number;
  official: {
    status: StatusValue;
    note: string;
    sourceUrl: string | null;
    sourceHost: string | null;
    createdAt: string;
  } | null;
  claims: Array<{
    kind: StatusKind;
    status: StatusValue;
    note: string;
    createdAt: string;
  }>;
  evidence: Array<{ note: string; approvedAt: string }>;
  supportCount: number;
  channel: PublicChannel | null;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function generateFollowupDraft(input: FollowupInput): FollowupBody {
  const evidenceSummary =
    input.evidence.length === 0
      ? "새로 확인된 추가 근거는 없습니다."
      : `시민이 추가한 근거 ${input.evidence.length}건이 있습니다.`;

  return {
    title: `[후속 요청 초안] ${input.title}`,
    summary: [
      `${input.areaLabel}에서 ${formatDate(input.publishedAt)}에 공개된 시민 제보입니다.`,
      `공개 후 ${input.ageDays}일이 지났고, ${evidenceSummary}`,
      input.official
        ? `마지막으로 확인된 공식 출처 기록은 '${STATUS_LABEL[input.official.status]}'입니다. 정부 시스템과 자동 연동된 기록은 아닙니다.`
        : "아직 공식 포털 출처와 함께 확인된 상태가 없습니다.",
      input.supportCount > 0
        ? `공개 화면에서 지지 ${input.supportCount}명이 확인되었습니다. 이는 지역 관심의 표시이며, 제보 내용의 사실 여부를 판정하지 않습니다.`
        : "공개 화면에 아직 지지 표시는 없습니다. 지지 수는 사실 판정이 아닙니다.",
    ].join(" "),
    currentSituation: [
      `현황: ${input.title}`,
      input.official
        ? `공식 출처 확인(${formatDate(input.official.createdAt)}${
            input.official.sourceHost ? `, ${input.official.sourceHost}` : ""
          }): ${input.official.note}`
        : "공식 출처 확인: 아직 없습니다.",
      ...input.claims.map(
        (claim) =>
          `${KIND_LABEL[claim.kind] ?? KIND_LABEL.user_claim}(${formatDate(
            claim.createdAt,
          )}, 검증되지 않음): ${claim.note}`,
      ),
      ...input.evidence.map(
        (item) =>
          `추가 근거(검토 승인 ${formatDate(item.approvedAt)}): ${item.note}`,
      ),
    ].join("\n"),
    requestedAction: input.official
      ? "이전에 확인된 처리 일정과 현재 상태를 다시 확인해 주시고, 남은 조치가 있다면 처리 계획을 알려 주세요."
      : "해당 위치의 상태를 확인해 주시고, 접수 여부와 처리 계획을 알려 주세요.",
    official: input.official
      ? {
          label: STATUS_LABEL[input.official.status],
          note: input.official.note,
          sourceUrl: input.official.sourceUrl,
          sourceHost: input.official.sourceHost,
          checkedAt: input.official.createdAt,
        }
      : null,
    claims: input.claims.map((claim) => ({
      kind: claim.kind,
      // Fall back for drafts persisted before provenance kinds existed.
      label: KIND_LABEL[claim.kind] ?? KIND_LABEL.user_claim,
      note: claim.note,
      createdAt: claim.createdAt,
    })),
    evidence: input.evidence.map((item) => ({
      note: item.note,
      approvedAt: item.approvedAt,
    })),
    communitySupport: {
      count: input.supportCount,
      note:
        input.supportCount > 0
          ? `공개 화면에서 지지 ${input.supportCount}명이 확인되었습니다. 이는 제보 내용의 사실 여부나 정당성을 판정하지 않습니다.`
          : "공개 화면에 기록된 지지 표시가 없습니다.",
      countsAsVerification: false,
    },
    channel: input.channel
      ? {
          name: input.channel.name,
          operator: input.channel.operator,
          url: input.channel.url,
        }
      : null,
    attachments: [
      "공개된 가림 처리 사진 1장",
      ...(input.evidence.length > 0
        ? [`검토를 통과한 추가 근거 사진 ${input.evidence.length}장`]
        : []),
    ],
    disclaimer:
      "이 문서는 시민이 작성한 초안입니다. 공식 기관의 답변이 아니며, CivicPulse가 자동으로 전송하지 않습니다. 내용을 직접 확인하고 공식 창구에서 제출하세요.",
    notSubmitted: true,
    mode: "mock",
  };
}

/** Plain-text rendering for copy/paste. Deliberately contains no invented contacts. */
export function renderFollowupText(body: FollowupBody): string {
  return [
    body.title,
    "",
    body.summary,
    "",
    "[현재 상황]",
    body.currentSituation,
    "",
    "[요청 사항]",
    body.requestedAction,
    "",
    "[지역 관심]",
    body.communitySupport?.note ??
      "지지 정보가 기록되지 않은 초안입니다. 지지 수는 사실 판정이 아닙니다.",
    "",
    body.channel
      ? `[제출 창구] ${body.channel.name} (${body.channel.operator}) ${body.channel.url}`
      : "[제출 창구] 확인된 공식 창구가 없습니다. 직접 확인이 필요합니다.",
    "",
    "[첨부 안내]",
    ...body.attachments.map((item) => `- ${item}`),
    "",
    body.disclaimer,
  ].join("\n");
}
