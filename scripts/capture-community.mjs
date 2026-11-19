/**
 * Visual capture for the stage 04 surfaces (community, moderation, feed).
 *
 * Seeds synthetic data through the real HTTP API, then screenshots the moderator
 * queue, the public issue and the feed. No real report is created or sent.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:3300";
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
if (!created.ok()) throw new Error(`create failed: ${created.status()}`);
const publicId = (await created.json()).data.report.publicId;

const published = await page.request.post(`${base}/api/reports/${publicId}/publish`, {
  headers: { origin: base, "content-type": "application/json" },
  data: {
    masks: [{ x: 0.18, y: 0.28, w: 0.34, h: 0.3, mode: "solid", source: "manual" }],
    ack: { privacyReviewed: true, consent: true, noSensitiveContent: false },
  },
});
if (!published.ok()) throw new Error(`publish failed: ${published.status()}`);

await switchUser("demo-hana");
await page.request.post(`${base}/api/public/reports/${publicId}/support`, {
  headers: { origin: base },
});
const evidence = await page.request.post(`${base}/api/public/reports/${publicId}/evidence`, {
  headers: { origin: base },
  multipart: {
    photo: { name: "evidence.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(sample) },
    note: "오늘 아침에도 같은 자리가 그대로였습니다. 유모차가 돌아서 지나갔습니다.",
    ackNoSensitive: "true",
  },
});
if (!evidence.ok()) throw new Error(`evidence failed: ${evidence.status()}`);

await switchUser("demo-ops");
await page.goto(`${base}/moderation`);
await page.getByAltText("검토 대기 중인 근거 사진").waitFor();
await page.screenshot({ path: path.join(out, "moderation-queue.png"), fullPage: true });

await page.getByRole("button", { name: "승인" }).click();
await page.getByText(/검토를 기다리는 근거가 없습니다/).waitFor();

await page.goto(`${base}/issues/${publicId}`);
await page.getByLabel("공식 상태", { exact: true }).selectOption("in_progress");
await page.getByLabel("공식 상태 출처").fill("https://www.safetyreport.go.kr/");
await page.getByLabel("공식 상태 설명").fill("구청에서 보수 일정을 안내했습니다.");
await page.getByRole("button", { name: "공식 상태 기록" }).click();
await page.getByText(/공식 상태로 기록했습니다/).waitFor();

const anon = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const anonPage = await anon.newPage();
await anonPage.goto(`${base}/issues/${publicId}`);
await anonPage.waitForLoadState("networkidle");
await anonPage.screenshot({ path: path.join(out, "issue-community.png"), fullPage: true });

await anonPage.goto(`${base}/issues`);
await anonPage.waitForLoadState("networkidle");
await anonPage.screenshot({ path: path.join(out, "feed.png"), fullPage: true });

await browser.close();
console.log("captured", publicId);
