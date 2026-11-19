import { describe, expect, it } from "vitest";

import {
  TEXT_FINDING_KINDS,
  TEXT_REVIEW_VERSION,
  scanPublicText,
  scanText,
  summarizeFindings,
  toTextReviewAudit,
} from "@/lib/privacy/text";

/**
 * Synthetic personal information only. These values are fabricated and are not
 * associated with any real person.
 */
const SYNTHETIC = {
  residentId: "900101-1234567",
  phone: "010-9876-5432",
  email: "minji.kim@example.com",
  plate: "12가3456",
  unit: "101동 1203호",
  name: "김민지님",
};

describe("public text privacy scan", () => {
  it("detects each synthetic personal-information shape", () => {
    const findings = scanText(
      "description",
      `연락처 ${SYNTHETIC.phone}, 메일 ${SYNTHETIC.email}, 주민번호 ${SYNTHETIC.residentId}, ` +
        `차량 ${SYNTHETIC.plate}, 주소 ${SYNTHETIC.unit}, 담당 ${SYNTHETIC.name}`,
    );
    const kinds = new Set(findings.map((finding) => finding.kind));
    expect(kinds).toEqual(new Set(TEXT_FINDING_KINDS));
    expect(findings.every((finding) => finding.field === "description")).toBe(true);
  });

  it("masks the matched value and never returns it verbatim", () => {
    const findings = scanText("title", `연락처 ${SYNTHETIC.phone}`);
    expect(findings).toHaveLength(1);
    const preview = findings[0]!.preview;
    expect(preview).not.toContain("9876");
    expect(preview).not.toContain("5432");
    expect(preview).toMatch(/^01•+32$/);
  });

  it("leaves ordinary civic descriptions alone", () => {
    const findings = scanPublicText({
      title: "OO초등학교 후문 인근 보도 파손 신고",
      description:
        "현황\n보도 블록이 들떠 있어 유모차가 지나가기 위험합니다.\n\n위치\n서울 마포구 (구역 단위 표시)",
    });
    expect(findings).toEqual([]);
  });

  it("reports each offset once when patterns overlap", () => {
    // A 13-digit resident id must not also be reported as a phone number.
    const findings = scanText("description", `주민번호 ${SYNTHETIC.residentId}`);
    expect(findings.map((finding) => finding.kind)).toEqual(["resident_id"]);
    for (let index = 1; index < findings.length; index += 1) {
      expect(findings[index]!.start).toBeGreaterThanOrEqual(findings[index - 1]!.end);
    }
  });

  it("scans title and body, and summarises without raw values", () => {
    const findings = scanPublicText({
      title: `연락처 ${SYNTHETIC.phone}`,
      description: `메일 ${SYNTHETIC.email}`,
    });
    const summary = summarizeFindings(findings);
    expect(summary.total).toBe(2);
    expect(summary.kinds.sort()).toEqual(["email", "phone"]);
    expect(summary.fields.sort()).toEqual(["description", "title"]);
    expect(summary.byKind.phone).toBe(1);

    const audit = toTextReviewAudit(findings);
    expect(audit.version).toBe(TEXT_REVIEW_VERSION);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("9876");
    expect(serialized).not.toContain("example.com");
    expect(serialized).toContain("phone");
  });
});
