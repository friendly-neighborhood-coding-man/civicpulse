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

/** Unsigned content fingerprint binding the publish acknowledgement to exact text. */
async function fetchTextToken(page: Page, publicId: string): Promise<string> {
  const response = await page.request.get(`/api/reports/${publicId}/privacy/text`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.data.textReview.token as string;
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
    // The public text has its own, separate acknowledgement.
    await expect(publishButton).toBeDisabled();
    await page.getByLabel(/공개될 제목과 본문을 직접 읽었습니다/).check();
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
    const textToken = await fetchTextToken(page, draftId);

    const mask = { x: 0.2, y: 0.2, w: 0.3, h: 0.3, mode: "pixelate", source: "manual" };

    const noConsent = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [mask],
        ack: {
          privacyReviewed: true,
          consent: false,
          textReviewed: true,
          textToken,
        },
      },
    });
    expect(noConsent.status()).toBe(409);

    const noMasks = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [],
        ack: {
          privacyReviewed: true,
          consent: true,
          noSensitiveContent: false,
          textReviewed: true,
          textToken,
        },
      },
    });
    expect(noMasks.status()).toBe(409);

    const badMask = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [{ ...mask, x: 0.95 }],
        ack: {
          privacyReviewed: true,
          consent: true,
          textReviewed: true,
          textToken,
        },
      },
    });
    expect(badMask.status()).toBe(422);

    // Foreign origin is rejected even with valid consents.
    const foreign = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: {
        masks: [mask],
        ack: {
          privacyReviewed: true,
          consent: true,
          textReviewed: true,
          textToken,
        },
      },
    });
    expect(foreign.status()).toBe(403);

    // A different user cannot publish it.
    await page.goto("/");
    await page.locator("#demo-identity").selectOption("demo-hana");
    await expect(page.locator("#demo-identity")).toHaveValue("demo-hana");
    const otherUser = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [mask],
        ack: {
          privacyReviewed: true,
          consent: true,
          textReviewed: true,
          textToken,
        },
      },
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

  test("requires reviewing the public text and flags synthetic personal information", async ({
    page,
    baseURL,
  }) => {
    await signIn(page, "박준");
    const draftId = await createDraftViaApi(
      page,
      baseURL!,
      "연락처 010-9876-5432 로 연락 주세요. 보도 블록이 들떠 있어 위험합니다.",
    );
    const mask = { x: 0.2, y: 0.2, w: 0.3, h: 0.3, mode: "solid", source: "manual" };
    const firstToken = await fetchTextToken(page, draftId);
    let token = firstToken;
    const publish = (ack: Record<string, boolean>) =>
      page.request.post(`/api/reports/${draftId}/publish`, {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: { masks: [mask], ack: { ...ack, textToken: token } },
      });

    // Photo acknowledgements alone cannot publish copied text.
    const noTextReview = await publish({
      privacyReviewed: true,
      consent: true,
      textReviewed: false,
    });
    expect(noTextReview.status()).toBe(409);
    expect(JSON.stringify(await noTextReview.json())).toContain("제목과 본문");

    // The heuristic scan finds the synthetic phone number and demands a decision.
    const unacknowledged = await publish({
      privacyReviewed: true,
      consent: true,
      textReviewed: true,
      textFindingsReviewed: false,
    });
    expect(unacknowledged.status()).toBe(409);
    const failure = await unacknowledged.json();
    expect(failure.error.details.textFindings.total).toBeGreaterThan(0);
    expect(failure.error.details.textFindings.kinds).toContain("phone");
    // The response never echoes the matched value.
    expect(JSON.stringify(failure)).not.toContain("9876");

    // The owner sees the finding in the review UI and can correct the text.
    await page.goto(`/reports/${draftId}`);
    await expect(page.getByText(/개인정보로 보일 수 있는 표현/)).toBeVisible();
    await expect(page.getByLabel(/표시된 개인정보 의심 항목을 확인/)).toBeVisible();
    await page
      .getByLabel("제보 본문")
      .fill("현황\n보도 블록이 들떠 있습니다.\n\n위치\n서울 마포구");
    await page.getByRole("button", { name: "변경 저장" }).click();
    await expect(
      page.getByText(/정해진 형식\(전화번호·이메일 등\)으로 찾을 수 있는 항목은 없었습니다/),
    ).toBeVisible();

    // The acknowledgement from the old text is rejected after the edit.
    token = await fetchTextToken(page, draftId);
    expect(token).not.toBe(firstToken);
    const stale = await page.request.post(`/api/reports/${draftId}/publish`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {
        masks: [mask],
        ack: {
          privacyReviewed: true,
          consent: true,
          textReviewed: true,
          textToken: firstToken,
        },
      },
    });
    expect(stale.status()).toBe(409);

    // With clean text and the current token, reading it is enough.
    const published = await publish({
      privacyReviewed: true,
      consent: true,
      textReviewed: true,
    });
    expect(published.status()).toBe(200);
  });
});
