import { describe, expect, it } from "vitest";

import {
  TOSS_ADAPTER_STATUS,
  describePlatform,
  shareText,
} from "@/lib/platform/bridge";

describe("platform boundary", () => {
  it("reports the web runtime honestly", () => {
    const platform = describePlatform();
    expect(platform.capabilities.runtime).toBe("web");
    expect(platform.capabilities.platformIdentity).toBe(false);
    expect(platform.capabilities.shareText).toBe(false);
    expect(platform.label).toContain("웹");
    expect(platform.limitations.join(" ")).toContain("Toss");
  });

  it("does not claim a Toss adapter exists", () => {
    expect(TOSS_ADAPTER_STATUS.implemented).toBe(false);
    expect(TOSS_ADAPTER_STATUS.documentation).toContain("developers-apps-in-toss");
  });

  it("fails with a reason when no browser sharing exists", async () => {
    const result = await shareText("공유할 내용");
    expect(result.shared).toBe(false);
    if (!result.shared) expect(result.reason.length).toBeGreaterThan(0);
  });
});
