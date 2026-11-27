import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string) {
  await page.goto("/");
  const panel = page.locator("#identity");
  await panel.getByRole("button", { name: new RegExp(name) }).click();
  await expect(panel.getByText(/현재 세션:/)).toContainText(name);
}

test.describe("AI reporting assistant", () => {
  test("prepares a labelled simulation draft, applies it, and keeps it editable", async ({
    page,
    baseURL,
  }) => {
    await signIn(page, "김민지");
    await page.goto("/reports/new");

    // A synthetic illustration shipped with the app; not a real place.
    await page.getByRole("button", { name: "보도 파손" }).click();
    await expect(page.getByAltText("업로드할 사진 미리보기")).toBeVisible();
    await page.getByLabel("구역").selectOption("seoul-mapo");
    await page.getByLabel("주변 지형지물 (선택)").fill("OO초등학교 후문");
    await page.getByLabel("제보 유형").selectOption("sidewalk");
    await page
      .getByLabel("무엇이 문제인가요?")
      .fill("여기 길이 깨져서 위험해요");

    // The simulation is clearly disclosed before the button is pressed.
    await expect(page.getByText(/시뮬레이션 모드이며 사진은 외부로 전송되지 않습니다/)).toBeVisible();
    await page.getByRole("button", { name: "AI로 제보 정리하기" }).click();

    await expect(page).toHaveURL(/\/reports\/cp_[a-z0-9]{10}\?ai=done$/);
    // Provenance is explicit: no model was called.
    await expect(page.getByText("시뮬레이션 · 모델 미호출")).toBeVisible();
    await expect(page.getByText("사진에서 직접 보이는 것")).toBeVisible();
    await expect(
      page.getByText("격자 모양 줄눈이 있는 보도 포장면이 보입니다."),
    ).toBeVisible();
    await expect(page.getByText("확인되지 않은 것")).toBeVisible();
    // The sample photo's human-written observations are shown, not invented ones.
    await expect(page.getByText("보도블록 파손 의심 구간 점검 요청")).toBeVisible();

    // A short description yields one optional clarification question.
    await expect(
      page.getByText("문제가 있는 부분이 사람들이 주로 걷는 길 한가운데에 있나요, 가장자리에 있나요?"),
    ).toBeVisible();

    // Applying is an explicit action; the draft is unchanged until then.
    await page.getByRole("button", { name: "이 초안을 편집기에 적용" }).click();
    await expect(page.getByText("적용되었습니다. 아래에서 확인하세요.")).toBeVisible();

    const titleInput = page.getByLabel("제목", { exact: true });
    await expect(titleInput).toHaveValue("보도블록 파손 의심 구간 점검 요청");
    await expect(page.getByLabel("제보 본문")).toHaveValue(/현황/);

    // The citizen's own correction wins and survives a reload.
    await titleInput.fill("보도블록 파손 점검 요청 (직접 수정)");
    await page.getByRole("button", { name: "변경 저장" }).click();
    await expect(page.getByRole("button", { name: "저장됨" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "보도블록 파손 점검 요청 (직접 수정)",
    );

    // Still private: AI never publishes or submits anything.
    await expect(page.getByText("비공개 초안", { exact: true })).toBeVisible();
    await expect(page.getByText("공개 페이지 보기")).toHaveCount(0);

    const draftUrl = page.url();
    await signIn(page, "박준");
    await page.goto(draftUrl);
    await expect(
      page.getByRole("heading", { name: "찾을 수 없는 페이지입니다" }),
    ).toBeVisible();

    const publicId = draftUrl.split("/reports/")[1]!.split("?")[0]!;
    const foreign = await page.request.post(`/api/reports/${publicId}/analysis`, {
      headers: { origin: baseURL! },
      data: { consent: true },
    });
    expect(foreign.status()).toBe(404);
    expect((await foreign.json()).error.code).toBe("NOT_FOUND");
  });

  test("the deterministic path still works without AI", async ({ page }) => {
    await signIn(page, "이하나");
    await page.goto("/reports/new");
    await page.getByRole("button", { name: "쓰레기 투기" }).click();
    await page.getByLabel("구역").selectOption("busan-haeundae");
    await page.getByLabel("제보 유형").selectOption("waste");
    await page
      .getByLabel("무엇이 문제인가요?")
      .fill("시장 입구 옆에 생활 쓰레기 봉투가 계속 쌓여 있고 악취가 납니다.");

    await page.getByRole("button", { name: "비공개 초안 만들기" }).click();
    await expect(page).toHaveURL(/\/reports\/cp_[a-z0-9]{10}$/);
    await expect(page.getByRole("heading", { name: "AI 관찰과 초안" })).toBeVisible();
    await expect(page.getByText("AI로 정리하기")).toBeVisible();
    await expect(page.getByText("시뮬레이션 · 모델 미호출")).toHaveCount(0);
  });
});
