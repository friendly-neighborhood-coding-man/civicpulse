import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_OFFICIAL_INTEGRATION,
  checkOfficialSourceUrl,
  findOfficialRegistryEntry,
  listOfficialSourceHosts,
} from "@/lib/domain/official-sources";

describe("official source provenance", () => {
  it("accepts only registered official-portal hosts", () => {
    for (const url of [
      "https://www.safetyreport.go.kr/",
      "https://safetyreport.go.kr/",
      "https://www.safetyreport.go.kr/safetyReport/safetyReportMain.do",
      "https://www.epeople.go.kr/",
      "https://www.epeople.go.kr/nep/gdnc/PttnUtilGdncContent.npaid",
    ]) {
      const checked = checkOfficialSourceUrl(url);
      expect(checked.ok, url).toBe(true);
      if (checked.ok) {
        expect(checked.registry.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("rejects unrelated, lookalike, and unsafe URLs", () => {
    const cases: Array<[string, string]> = [
      ["https://example.com/notice/1", "unregistered_host"],
      ["https://news.example.co.kr/article/1", "unregistered_host"],
      // Suffix attacks: the official domain appears, but is not the host.
      ["https://www.safetyreport.go.kr.evil.example/", "unregistered_host"],
      ["https://evilsafetyreport.go.kr/", "unregistered_host"],
      ["https://evil.example/www.safetyreport.go.kr", "unregistered_host"],
      // Userinfo makes a link look official while pointing elsewhere.
      ["https://www.safetyreport.go.kr@evil.example/", "embedded_credentials"],
      ["https://user:pass@www.epeople.go.kr/", "embedded_credentials"],
      ["http://www.safetyreport.go.kr/", "not_https"],
      ["javascript:alert(1)", "not_https"],
      ["www.safetyreport.go.kr", "invalid_url"],
      ["", "missing"],
    ];

    for (const [url, reason] of cases) {
      const checked = checkOfficialSourceUrl(url);
      expect(checked.ok, url).toBe(false);
      if (!checked.ok) expect(checked.reason, url).toBe(reason);
    }
  });

  it("matches subdomains of a registered host but not the reverse", () => {
    expect(findOfficialRegistryEntry("www.safetyreport.go.kr")?.channelId).toBe(
      "safetyreport",
    );
    expect(findOfficialRegistryEntry("m.safetyreport.go.kr")?.channelId).toBe(
      "safetyreport",
    );
    expect(findOfficialRegistryEntry("safetyreport.go.kr.evil.example")).toBeNull();
  });

  it("documents that no authenticated official integration exists", () => {
    // The product has no government API. If this ever flips to true, the UI and
    // provenance model must change together, not just this constant.
    expect(AUTHENTICATED_OFFICIAL_INTEGRATION).toBe(false);
    const hosts = listOfficialSourceHosts();
    expect(hosts.map((entry) => entry.host)).toEqual(
      expect.arrayContaining(["safetyreport.go.kr", "epeople.go.kr"]),
    );
  });
});
