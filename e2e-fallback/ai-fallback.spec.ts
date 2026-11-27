import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string) {
  await page.goto("/");
  const panel = page.locator("#identity");
  await panel.getByRole("button", { name: new RegExp(name) }).click();
  await expect(panel.getByText(/현재 세션:/)).toContainText(name);
}

test.describe("live mode without credentials", () => {
  test("exposes the configuration honestly and shows a labelled fallback", async ({
    page,
  }) => {
    await signIn(page, "김민지");

    const health = await page.request.get("/api/health");
    expect(health.status()).toBe(200);
    const body = (await health.json()) as {
      data: { ai: { mode: string; configured: boolean; externalTransfer: boolean } };
    };
    expect(body.data.ai).toMatchObject({
      mode: "live",
      configured: false,
      externalTransfer: true,
    });

    await page.goto("/reports/new");
    await page.getByRole("button", { name: "보도 파손" }).click();
    await page.getByLabel("구역").selectOption("seoul-mapo");
    await page.getByLabel("제보 유형").selectOption("sidewalk");
    await page.getByLabel("무엇이 문제인가요?").fill("여기 길이 깨져서 위험해요");

    // The form warns before the action that no key is configured.
    await expect(page.getByText(/서버에 AI API 키가 없어 실제 분석은 실행되지 않고/)).toBeVisible();
    await page.getByRole("button", { name: "AI로 제보 정리하기" }).click();

    await expect(page).toHaveURL(/\?ai=done$/);
    await expect(page.getByText("AI 사용 불가 · 대체 초안")).toBeVisible();
    await expect(
      page.getByText("AI 서비스가 설정되지 않았습니다(API 키 없음)."),
    ).toBeVisible();
    // Neither a live result nor a simulation may be presented as the analysis.
    await expect(page.getByText("실제 AI 분석")).toHaveCount(0);
    await expect(page.getByText("시뮬레이션 · 모델 미호출")).toHaveCount(0);
    await expect(page.getByText("사진에서 직접 보이는 것")).toHaveCount(0);
    await expect(page.getByText("대체 초안은 적용할 수 없습니다.")).toBeVisible();

    // The deterministic draft is still there and editable.
    await expect(page.getByLabel("제목", { exact: true })).not.toHaveValue("");
    await expect(page.getByLabel("제보 본문")).not.toHaveValue("");
    await expect(page.getByText("비공개 초안", { exact: true })).toBeVisible();
  });
});
