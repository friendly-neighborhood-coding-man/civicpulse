import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string) {
  await page.goto("/");
  await page.locator("#identity").getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.locator("#identity").getByText(/현재 세션:/)).toContainText(name);
}

const SAMPLE = path.join(process.cwd(), "public", "samples", "sidewalk.jpg");

async function createDraftViaApi(page: Page, baseURL: string, description: string) {
  const response = await page.request.post("/api/reports", {
    headers: { origin: baseURL },
    multipart: {
      photo: {
        name: "sample.jpg",
        mimeType: "image/jpeg",
        buffer: fs.readFileSync(SAMPLE),
      },
      description,
      category: "sidewalk",
      areaId: "seoul-mapo",
      landmark: "OO초등학교 후문",
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.data.report.publicId as string;
}

test.describe("privacy and publication", () => {
  test("mask, preview and publish a redacted report that anyone can read", async ({
    page,
    browser,
    baseURL,
  }) => {
    await signIn(page, "김민지");
    await page.goto("/reports/new");
    await page.getByRole("button", { name: "보도 파손" }).click();
    await page.getByLabel("구역").selectOption("seoul-mapo");
    await page.getByLabel("주변 지형지물 (선택)").fill("OO초등학교 후문");
    await page
      .getByLabel("무엇이 문제인가요?")
      .fill("보도 블록이 들떠 있어 유모차와 자전거가 지나가기 위험합니다.");
    await page.getByRole("button", { name: "비공개 초안 만들기" }).click();
    await page.waitForURL(/\/reports\/cp_[a-z0-9]{10}$/);
    const ownerUrl = page.url();
    const publicId = ownerUrl.split("/").pop()!;

    // Draw a mask on the photo itself.
    const surface = page.getByRole("group", {
      name: "사진 위에 가림 영역을 그리는 영역",
    });
    await expect(surface).toBeVisible();
    await surface.scrollIntoViewIfNeeded();
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.6, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(page.getByText(/가림 영역 1곳/)).toBeVisible();

    // The publish button stays disabled until a preview exists and consents are given.
    const publishButton = page.getByRole("button", { name: "가림 처리 후 공개" });
    await expect(publishButton).toBeDisabled();

    await page.getByRole("button", { name: "서버 미리보기 만들기" }).click();
    await expect(
      page.getByAltText("공개될 가림 처리된 사진 미리보기"),
    ).toBeVisible();
    await expect(publishButton).toBeDisabled();

    await page
      .getByLabel(/사진에서 얼굴·번호판 등 개인정보를 직접 확인/)
      .check();
    await page.getByLabel(/이 제보를 공개하는 데 동의합니다/).check();
    await expect(publishButton).toBeEnabled();

    await publishButton.click();
    await expect(page.getByText("공개됨", { exact: true })).toBeVisible();
    await expect(page.getByText("이 화면에서 수정할 수 없습니다")).toBeVisible();

    // Public page works in a browser with no session cookie at all.
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${baseURL}/issues/${publicId}`);
    await expect(publicPage.getByRole("heading", { level: 1 })).toContainText(
      "보도 파손",
    );
    await expect(publicPage.getByText(/시민 제보 · 공식 확인 아님/)).toBeVisible();
    await expect(publicPage.getByText(/가림 처리 1곳/)).toBeVisible();

    const image = publicPage.getByAltText("가림 처리된 제보 사진");
    await expect(image).toBeVisible();
    await expect
      .poll(async () =>
        image.evaluate((node) => (node instanceof HTMLImageElement ? node.naturalWidth : 0)),
      )
      .toBeGreaterThan(0);

    const publicApi = await publicPage.request.get(`/api/public/reports/${publicId}`);
    expect(publicApi.status()).toBe(200);
    const payload = await publicApi.json();
    expect(payload.data.report.maskCount).toBe(1);
    expect(JSON.stringify(payload)).not.toContain("demo-minji");
    expect(JSON.stringify(payload)).not.toContain("37.56");

    // The draft owner URL now shows the published state for the owner too.
    await page.goto(ownerUrl);
    await expect(page.getByText("공개됨", { exact: true })).toBeVisible();

    await publicContext.close();
  });

  test("rejects publication attempts that bypass the privacy gate", async ({
    page,
    baseURL,
  }) => {
    await signIn(page, "박준");
    const draftId = await createDraftViaApi(
      page,
      baseURL!,
      "공개 동의 없이 게시를 시도하면 거부되어야 하는 충분히 긴 설명입니다.",
    );

    const mask = { x: 0.2, y: 0.2, w: 0.3, h: 0.3, mode: "pixelate", source: "manual" };

    const noConsent = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: { masks: [mask], ack: { privacyReviewed: true, consent: false } },
    });
    expect(noConsent.status()).toBe(409);

    const noMasks = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [],
        ack: { privacyReviewed: true, consent: true, noSensitiveContent: false },
      },
    });
    expect(noMasks.status()).toBe(409);

    const badMask = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [{ ...mask, x: 0.95 }],
        ack: { privacyReviewed: true, consent: true },
      },
    });
    expect(badMask.status()).toBe(422);

    // Foreign origin is rejected even with valid consents.
    const foreign = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: { masks: [mask], ack: { privacyReviewed: true, consent: true } },
    });
    expect(foreign.status()).toBe(403);

    // A different user cannot publish it.
    await page.goto("/");
    await page.locator("#demo-identity").selectOption("demo-hana");
    await expect(page.locator("#demo-identity")).toHaveValue("demo-hana");
    const otherUser = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: { masks: [mask], ack: { privacyReviewed: true, consent: true } },
    });
    expect(otherUser.status()).toBe(404);

    // Still an unpublished draft.
    await page.goto(`/issues/${draftId}`);
    await expect(
      page.getByRole("heading", { name: "찾을 수 없는 페이지입니다" }),
    ).toBeVisible();
  });

  test("does not serve a draft photo or public route before publication", async ({
    page,
    baseURL,
  }) => {
    await signIn(page, "이하나");
    const draftId = await createDraftViaApi(
      page,
      baseURL!,
      "공개 전에는 사진과 공개 경로가 모두 보이지 않아야 합니다.",
    );

    const publicPhoto = await page.request.get(`/api/public/reports/${draftId}/photo`);
    expect(publicPhoto.status()).toBe(404);
    const publicJson = await page.request.get(`/api/public/reports/${draftId}`);
    expect(publicJson.status()).toBe(404);
  });
});
