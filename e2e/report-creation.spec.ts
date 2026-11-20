import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string) {
  await page.goto("/");
  const panel = page.locator("#identity");
  await panel.getByRole("button", { name: new RegExp(name) }).click();
  await expect(panel.getByText(/현재 세션:/)).toContainText(name);
}

test.describe("report creation", () => {
  test("creates, edits and re-reads a real draft from synthetic input", async ({
    page,
  }) => {
    await signIn(page, "김민지");
    await page.goto("/reports/new");

    // The sample photos are synthetic illustrations shipped with the app.
    await page.getByRole("button", { name: "쓰레기 투기" }).click();
    await expect(page.getByAltText("업로드할 사진 미리보기")).toBeVisible();

    await page.getByLabel("구역").selectOption("busan-haeundae");
    await page.getByLabel("주변 지형지물 (선택)").fill("시장 입구");
    await page.getByLabel("제보 유형").selectOption("waste");
    await page
      .getByLabel("무엇이 문제인가요?")
      .fill("시장 입구 옆에 생활 쓰레기 봉투가 일주일째 쌓여 있고 악취가 납니다.");

    await page.getByRole("button", { name: "비공개 초안 만들기" }).click();

    await expect(page).toHaveURL(/\/reports\/cp_[a-z0-9]{10}$/);
    await expect(page.getByText("비공개 초안", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("시장 입구");
    await expect(page.getByText("안전신문고", { exact: true })).toBeVisible();
    await expect(page.getByText("공식 창구 · 출처 확인")).toBeVisible();
    await expect(page.getByText("실제 외부 전송")).toHaveCount(0);
    // The uploaded synthetic image is served through the authenticated route.
    await expect(page.getByAltText("제보 사진 (비공개)")).toBeVisible();

    const url = page.url();
    // Exact: the privacy flow also exposes a region labelled "공개될 제목과 본문".
    const titleInput = page.getByLabel("제목", { exact: true });
    await expect(titleInput).not.toHaveValue("");

    await titleInput.fill("시장 입구 쓰레기 무단투기 (확인 필요)");
    await page.getByRole("button", { name: "변경 저장" }).click();
    await expect(page.getByRole("button", { name: "저장됨" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue(
      "시장 입구 쓰레기 무단투기 (확인 필요)",
    );
    await expect(page.getByText("검증되지 않음")).toHaveCount(0);

    // A different demo user must not be able to read this draft.
    await page.goto("/");
    await page.locator("#demo-identity").selectOption("demo-jun");
    await expect(page.locator("#identity")).toContainText("박준");
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "찾을 수 없는 페이지입니다" }),
    ).toBeVisible();
  });

  test("rejects invalid reports at the API boundary", async ({ page, baseURL }) => {
    await signIn(page, "박준");

    const shortDescription = await page.request.post("/api/reports", {
      headers: { origin: baseURL! },
      multipart: {
        photo: {
          name: "sample.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        },
        description: "짧음",
        category: "sidewalk",
        areaId: "seoul-mapo",
        landmark: "",
      },
    });
    expect(shortDescription.status()).toBe(422);
    expect((await shortDescription.json()).error.code).toBe("VALIDATION_FAILED");

    const noPhoto = await page.request.post("/api/reports", {
      headers: { origin: baseURL! },
      multipart: {
        description: "사진 없이 제출하면 거부되어야 하는 충분히 긴 설명입니다.",
        category: "sidewalk",
        areaId: "seoul-mapo",
        landmark: "",
      },
    });
    expect(noPhoto.status()).toBe(400);

    const textFile = await page.request.post("/api/reports", {
      headers: { origin: baseURL! },
      multipart: {
        photo: {
          name: "notes.txt",
          mimeType: "image/jpeg",
          buffer: Buffer.from("definitely not an image"),
        },
        description: "텍스트 파일을 사진으로 위장한 요청이며 거부되어야 합니다.",
        category: "sidewalk",
        areaId: "seoul-mapo",
        landmark: "",
      },
    });
    expect(textFile.status()).toBe(415);

    const foreign = await page.request.post("/api/reports", {
      headers: { origin: "https://evil.example" },
      multipart: {
        description: "외부 출처에서 보낸 요청이며 거부되어야 합니다.",
        category: "sidewalk",
        areaId: "seoul-mapo",
        landmark: "",
      },
    });
    expect(foreign.status()).toBe(403);
  });

  test("does not let a signed-out visitor read a draft", async ({ page, request }) => {
    const response = await request.get("/api/reports", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");

    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { name: "내 제보를 보려면 데모 사용자를 선택하세요" }),
    ).toBeVisible();
  });
});
