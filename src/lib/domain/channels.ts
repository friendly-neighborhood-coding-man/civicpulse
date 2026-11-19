import type { ReportCategoryId } from "./areas.ts";

/**
 * Curated registry of official reporting routes.
 *
 * Rules for adding an entry:
 * 1. The operator and URL must be checked against an official source.
 * 2. Record the source URL and the date it was checked (`asOf`).
 * 3. Never store an email address or phone number as a "submit here" channel:
 *    these portals accept submissions only through their own web/app flow.
 * 4. If nothing is verified for a category, return `null` — the UI must say
 *    "확인된 공식 창구 없음" instead of guessing.
 *
 * This registry never dispatches anything. It only tells a human where to go.
 */

export type SubmissionMode = "web_portal" | "app_or_web";

export type OfficialChannel = {
  id: string;
  name: string;
  operator: string;
  url: string;
  submissionMode: SubmissionMode;
  requiresAccount: boolean;
  handles: ReportCategoryId[];
  whatToExpect: string;
  limitations: string;
  sourceUrl: string;
  sourceLabel: string;
  /** ISO date when a human last checked the URL and the claim above. */
  asOf: string;
  verified: true;
};

export const OFFICIAL_CHANNELS: OfficialChannel[] = [
  {
    id: "safetyreport",
    name: "안전신문고",
    operator: "행정안전부",
    url: "https://www.safetyreport.go.kr/",
    submissionMode: "app_or_web",
    requiresAccount: true,
    handles: ["sidewalk", "streetlight", "waste", "water", "signage"],
    whatToExpect:
      "안전신고(도로·시설물 파손 및 고장)와 생활불편(쓰레기·폐기물, 불법 광고물)을 접수합니다. 접수 후 담당 기관이 지정되어 처리 결과를 신고인에게 통보합니다.",
    limitations:
      "웹 또는 앱에서 본인이 직접 접수해야 하며 휴대전화 인증이 필요합니다. CivicPulse는 대신 접수하지 않습니다.",
    sourceUrl: "https://www.safetyreport.go.kr/",
    sourceLabel: "안전신문고 누리집(행정안전부)",
    asOf: "2026-11-19",
    verified: true,
  },
  {
    id: "epeople",
    name: "국민신문고",
    operator: "국민권익위원회",
    url: "https://www.epeople.go.kr/",
    submissionMode: "web_portal",
    requiresAccount: true,
    handles: ["other"],
    whatToExpect:
      "행정기관의 처분·제도로 인한 불편이나 특정 행위를 요구하는 일반 민원을 접수합니다. 접수 후 소관 기관이 지정되어 처리 결과를 통보합니다.",
    limitations:
      "본인이 직접 접수해야 하며 CivicPulse는 대신 제출하지 않습니다. 일반 민원 창구이므로 담당 부서는 접수 후에 정해지고, 긴급한 안전 위험은 112·119 등 긴급 창구를 이용해야 합니다.",
    sourceUrl: "https://www.epeople.go.kr/nep/gdnc/PttnUtilGdncContent.npaid",
    sourceLabel: "국민신문고 이용안내(민원 처리 절차)",
    asOf: "2026-11-19",
    verified: true,
  },
];

export function getChannel(id: string | null | undefined): OfficialChannel | null {
  if (!id) return null;
  return OFFICIAL_CHANNELS.find((channel) => channel.id === id) ?? null;
}

/**
 * Return a *verified* channel for a category, or null when nothing has been
 * verified. Never guess an agency or contact detail.
 */
export function channelForCategory(
  category: ReportCategoryId | string,
): OfficialChannel | null {
  return (
    OFFICIAL_CHANNELS.find((channel) =>
      channel.handles.includes(category as ReportCategoryId),
    ) ?? null
  );
}

/** Public projection: safe to serialize to the browser. */
export type PublicChannel = Omit<OfficialChannel, "handles">;

export function toPublicChannel(channel: OfficialChannel): PublicChannel {
  const { handles: _handles, ...rest } = channel;
  return rest;
}
