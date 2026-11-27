import { expect, test, type Page } from "@playwright/test";

/**
 * Produces the screenshots used in docs/DEMO.md and the handoff. Everything is
 * synthetic: the three shipped sample illustrations and the demo identities.
 * The panel explicitly says the simulation called no model.
 */

async function signIn(page: Page, name: string) {
  await page.goto("/");
  const panel = page.locator("#identity");
  await panel.getByRole("button", { name: new RegExp(name) }).click();
  await expect(panel.getByText(/현재 세션:/)).toContainText(name);
}

test("capture the synthetic AI journey on a phone viewport", async ({ page }) => {
  await signIn(page, "김민지");
  await page.goto("/reports/new");
  await page.getByRole("button", { name: "보도 파손" }).click();
  await expect(page.getByAltText("업로드할 사진 미리보기")).toBeVisible();
  await page.getByLabel("구역").selectOption("seoul-mapo");
  await page.getByLabel("주변 지형지물 (선택)").fill("OO초등학교 후문");
  await page.getByLabel("제보 유형").selectOption("sidewalk");
  await page.getByLabel("무엇이 문제인가요?").fill("여기 길이 깨져서 위험해요");

  await page.screenshot({
    path: "docs/screenshots/ai-01-input-mobile.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "AI로 제보 정리하기" }).click();
  await expect(page.getByText("시뮬레이션 · 모델 미호출")).toBeVisible();
  await expect(page.getByText("사진에서 직접 보이는 것")).toBeVisible();

  // Viewport captures, not one over-tall full-page image: the panel is the
  // part worth reviewing, and full-page mobile exceeds 8192px.
  await page.locator("#ai-heading").scrollIntoViewIfNeeded();
  // Clear the sticky header so the provenance badge is not hidden.
  await page.evaluate(() => window.scrollBy(0, -96));
  await page.screenshot({
    path: "docs/screenshots/ai-02-analysis-mobile.png",
    fullPage: false,
  });
  await page.getByText("AI 초안 미리보기").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/ai-05-draft-preview-mobile.png",
    fullPage: false,
  });

  await page.getByRole("button", { name: "이 초안을 편집기에 적용" }).click();
  await expect(page.getByText("적용되었습니다. 아래에서 확인하세요.")).toBeVisible();
  await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
    "보도블록 파손 의심 구간 점검 요청",
  );

  await page.screenshot({
    path: "docs/screenshots/ai-03-draft-mobile.png",
    fullPage: false,
  });

  // Same synthetic draft at desktop width, for the deck and docs.
  const draftUrl = page.url();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(draftUrl);
  await expect(page.getByText("AI 초안 미리보기")).toBeVisible();
  await page.getByText("AI 초안 미리보기").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/ai-04-analysis-desktop.png",
    fullPage: false,
  });
});
