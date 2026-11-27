import { expect, test, type Page } from "@playwright/test";

const CITIZEN = { email: "citizen@example.org", password: "e2e-password-123" };
const OTHER = { email: "other@example.org", password: "e2e-password-123" };

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/reports$/);
}

test.describe("AI assistant under password sessions", () => {
  test("works for the signed-in account and stays private to it", async ({
    page,
    baseURL,
  }) => {
    await login(page, CITIZEN);
    await page.goto("/reports/new");
    await page.getByRole("button", { name: "보도 파손" }).click();
    await page.getByLabel("구역").selectOption("seoul-mapo");
    await page.getByLabel("제보 유형").selectOption("sidewalk");
    await page.getByLabel("무엇이 문제인가요?").fill("여기 길이 깨져서 위험해요");

    await page.getByRole("button", { name: "AI로 제보 정리하기" }).click();
    await expect(page).toHaveURL(/\/reports\/cp_[a-z0-9]{10}\?ai=done$/);
    await expect(page.getByText("시뮬레이션 · 모델 미호출")).toBeVisible();
    await expect(
      page.getByText("격자 모양 줄눈이 있는 보도 포장면이 보입니다."),
    ).toBeVisible();

    const draftUrl = page.url();
    const publicId = draftUrl.split("/reports/")[1]!.split("?")[0]!;

    // A different password account must not read or analyse this draft.
    const signOut = await page.request.delete("/api/session", {
      headers: { origin: baseURL! },
    });
    expect(signOut.status()).toBe(200);
    await login(page, OTHER);
    await page.goto(draftUrl);
    await expect(
      page.getByRole("heading", { name: "찾을 수 없는 페이지입니다" }),
    ).toBeVisible();
    const foreign = await page.request.post(`/api/reports/${publicId}/analysis`, {
      headers: { origin: baseURL! },
      data: { consent: true },
    });
    expect(foreign.status()).toBe(404);
  });
});
