// Visual review helper: drives a running dev server and writes screenshots to
// .local/screenshots (git-ignored). Usage:
//   node scripts/capture.mjs http://127.0.0.1:3200
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:3200";
const out = path.join(process.cwd(), ".local", "screenshots");
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

await page.goto(base);
await page.screenshot({ path: path.join(out, "home-desktop.png"), fullPage: true });

await page.locator("#identity").getByRole("button", { name: /김민지/ }).click();
await page.locator("#identity").getByText(/현재 세션:/).waitFor();

await page.goto(`${base}/reports/new`);
await page.getByRole("button", { name: "보도 파손" }).click();
await page.getByLabel("주변 지형지물 (선택)").fill("OO초등학교 후문");
await page
  .getByLabel("무엇이 문제인가요?")
  .fill("보도 블록이 들떠 있어 유모차와 자전거가 지나가기 위험합니다. 비가 오면 물이 고입니다.");
await page.screenshot({ path: path.join(out, "create-desktop.png"), fullPage: true });

await page.getByRole("button", { name: "비공개 초안 만들기" }).click();
await page.waitForURL(/\/reports\/cp_/);
// Wait for the authenticated image route to finish so the screenshot is honest.
await page.waitForLoadState("networkidle");
await page.locator('img[alt="제보 사진 (비공개)"]').waitFor({ state: "visible" });
await page.waitForFunction(() => {
  const img = document.querySelector('img[alt="제보 사진 (비공개)"]');
  return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
});
await page.screenshot({ path: path.join(out, "draft-desktop.png"), fullPage: true });

const draftUrl = page.url();

// Privacy editor: draw one mask, render the server preview, publish.
const surface = page.getByRole("group", { name: "사진 위에 가림 영역을 그리는 영역" });
await surface.scrollIntoViewIfNeeded();
const box = await surface.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "서버 미리보기 만들기" }).click();
  await page.getByAltText("공개될 가림 처리된 사진 미리보기").waitFor();
  await page.screenshot({ path: path.join(out, "privacy-desktop.png"), fullPage: true });
}

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  storageState: await context.storageState(),
});
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${base}/reports/new`);
await mobilePage.screenshot({ path: path.join(out, "create-mobile.png"), fullPage: true });
await mobilePage.goto(draftUrl);
await mobilePage.waitForLoadState("networkidle");
await mobilePage.screenshot({ path: path.join(out, "draft-mobile.png"), fullPage: true });

await page
  .getByLabel(/사진에서 얼굴·번호판 등 개인정보를 직접 확인/)
  .check();
await page.getByLabel(/이 제보를 공개하는 데 동의합니다/).check();
await page.getByRole("button", { name: "가림 처리 후 공개" }).click();
await page.getByText("공개됨", { exact: true }).waitFor();
await page.screenshot({ path: path.join(out, "published-owner.png"), fullPage: true });

await page.goto(`${base}/issues/${draftUrl.split("/").pop()}`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: path.join(out, "public-desktop.png"), fullPage: true });

await browser.close();
console.log(`screenshots written to ${path.relative(process.cwd(), out)}/`);
