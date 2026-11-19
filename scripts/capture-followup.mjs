/**
 * Visual capture for the stage 05 follow-up panel (draft and approved).
 * Seeds synthetic data through the real HTTP API; nothing is submitted anywhere.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:3400";
const out = path.join(process.cwd(), ".local", "screenshots");
fs.mkdirSync(out, { recursive: true });

const sample = path.join(process.cwd(), "public", "samples", "sidewalk.jpg");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

async function switchUser(id) {
  await page.goto(`${base}/`);
  await page.locator("#demo-identity").selectOption(id);
  await page.waitForFunction(
    (userId) => document.querySelector("#demo-identity")?.value === userId,
    id,
  );
}

await switchUser("demo-minji");
const created = await page.request.post(`${base}/api/reports`, {
  headers: { origin: base },
  multipart: {
    photo: { name: "sample.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(sample) },
    description: "보도 블록이 들떠 있어 유모차와 자전거가 지나가기 위험합니다.",
    category: "sidewalk",
    areaId: "seoul-mapo",
    landmark: "OO초등학교 후문",
  },
});
const publicId = (await created.json()).data.report.publicId;
await page.request.post(`${base}/api/reports/${publicId}/publish`, {
  headers: { origin: base, "content-type": "application/json" },
  data: {
    masks: [{ x: 0.18, y: 0.28, w: 0.34, h: 0.3, mode: "solid", source: "manual" }],
    ack: { privacyReviewed: true, consent: true, noSensitiveContent: false },
  },
});

await switchUser("demo-hana");
const uploaded = await page.request.post(`${base}/api/public/reports/${publicId}/evidence`, {
  headers: { origin: base },
  multipart: {
    photo: { name: "evidence.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(sample) },
    note: "보수 공사가 시작되지 않았고 임시 덮개만 놓여 있습니다.",
    ackNoSensitive: "true",
  },
});
const evidenceId = (await uploaded.json()).data.evidence.id;

await switchUser("demo-ops");
await page.request.post(`${base}/api/moderation/evidence/${evidenceId}`, {
  headers: { origin: base, "content-type": "application/json" },
  data: { decision: "approved" },
});
await page.request.post(`${base}/api/reports/${publicId}/status-events`, {
  headers: { origin: base, "content-type": "application/json" },
  data: {
    kind: "official",
    status: "acknowledged",
    note: "담당 부서 접수 확인을 받았습니다.",
    sourceUrl: "https://www.safetyreport.go.kr/",
  },
});

await switchUser("demo-minji");
await page.goto(`${base}/reports/${publicId}`);
await page.getByRole("button", { name: "후속 요청 초안 만들기" }).click();
await page.getByText("검토 대기").waitFor();
await page.screenshot({ path: path.join(out, "followup-draft.png"), fullPage: true });

await page.getByRole("button", { name: "검토 완료로 표시" }).click();
await page.getByText("검토 완료", { exact: true }).waitFor();
await page.screenshot({ path: path.join(out, "followup-approved.png"), fullPage: true });

await browser.close();
console.log("captured", publicId);
