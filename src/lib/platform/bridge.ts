/**
 * Platform boundary.
 *
 * CivicPulse is a web application today. Apps in Toss (Toss Mini App) is the
 * intended future platform, but **no Toss SDK is installed or called in this
 * repository**. This module exists so the UI can ask for platform capabilities
 * without hard-coding a runtime, and so a real adapter can be added later behind
 * one interface.
 *
 * It deliberately defines only capabilities CivicPulse itself needs. It does not
 * mirror or guess any Toss SDK API: adopting the real SDK requires following the
 * official developer center documentation (see docs/TOSS_READINESS.md).
 */

export type PlatformCapabilities = {
  runtime: "web" | "toss";
  /** Share text through the host platform's share sheet. */
  shareText: boolean;
  /** Open a link outside the current surface. */
  openExternal: boolean;
  /** Native clipboard write. */
  clipboard: boolean;
  /** Whether a platform identity is available without our demo session. */
  platformIdentity: boolean;
};

export type PlatformDescription = {
  capabilities: PlatformCapabilities;
  /** Human-readable, shown in the UI so nobody assumes a Toss integration. */
  label: string;
  limitations: string[];
};

const WEB: PlatformDescription = {
  capabilities: {
    runtime: "web",
    shareText: false,
    openExternal: true,
    clipboard: true,
    platformIdentity: false,
  },
  label: "웹 데모",
  limitations: [
    "Toss 미니앱 SDK가 연결되어 있지 않습니다. 공유·로그인은 브라우저 기능만 사용합니다.",
    "데모 사용자 전환은 실제 로그인이 아니라 합성 세션입니다.",
  ],
};

/** A Toss adapter is intentionally absent; this documents the gap. */
export const TOSS_ADAPTER_STATUS = {
  implemented: false,
  reason:
    "앱인토스 SDK 연동은 공식 개발자센터 문서를 따른 별도 작업이 필요합니다. 이 저장소는 SDK를 포함하지 않으며 어떤 Toss API도 호출하지 않습니다.",
  documentation: "https://developers-apps-in-toss.toss.im/documentation",
} as const;

export function describePlatform(): PlatformDescription {
  // A future Toss adapter would be selected here based on the host runtime.
  return WEB;
}

export type ShareResult =
  | { shared: true; via: "share" | "clipboard" }
  | { shared: false; reason: string };

/**
 * Share text with progressive fallback.
 *
 * There is no Toss path yet, and this function never pretends there is: it uses
 * `navigator.share` when the browser exposes it, then the clipboard, then fails
 * with a reason the caller must show.
 */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator === "undefined") {
    return { shared: false, reason: "이 환경에서는 공유를 사용할 수 없습니다." };
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return { shared: true, via: "share" };
    } catch {
      // A cancelled share is not an error worth blocking on; fall through.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { shared: true, via: "clipboard" };
    } catch {
      // Fall through to the explicit failure below.
    }
  }

  return { shared: false, reason: "공유와 클립보드를 사용할 수 없습니다." };
}
