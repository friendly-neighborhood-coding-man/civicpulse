import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const SAMPLE = path.join(process.cwd(), "public", "samples", "sidewalk.jpg");

async function switchUser(page: Page, userId: string) {
  await page.goto("/");
  await page.locator("#demo-identity").selectOption(userId);
  await expect(page.locator("#demo-identity")).toHaveValue(userId);
}

async function publishIssue(page: Page, baseURL: string): Promise<string> {
  const created = await page.request.post("/api/reports", {
    headers: { origin: baseURL },
    multipart: {
      photo: {
        name: "sample.jpg",
        mimeType: "image/jpeg",
        buffer: fs.readFileSync(SAMPLE),
      },
      description: "보도 블록이 들떠 있어 유모차가 지나가기 위험합니다.",
      category: "sidewalk",
      areaId: "seoul-mapo",
      landmark: "OO초등학교 후문",
    },
  });
  expect(created.status()).toBe(201);
  const draftId = (await created.json()).data.report.publicId as string;

  const review = await page.request.get(`/api/reports/${draftId}/privacy/text`);
  expect(review.status()).toBe(200);
  const textToken = (await review.json()).data.textReview.token as string;

  const published = await page.request.post(`/api/reports/${draftId}/publish`, {
    headers: { origin: baseURL, "content-type": "application/json" },
    data: {
      masks: [{ x: 0.2, y: 0.2, w: 0.3, h: 0.3, mode: "solid", source: "manual" }],
      ack: {
        privacyReviewed: true,
        consent: true,
        noSensitiveContent: false,
        textReviewed: true,
        textToken,
      },
    },
  });
  expect(published.status()).toBe(200);
  return draftId;
}

async function addApprovedEvidence(page: Page, publicId: string, baseURL: string) {
  await switchUser(page, "demo-hana");
  const uploaded = await page.request.post(
    `/api/public/reports/${publicId}/evidence`,
    {
      headers: { origin: baseURL },
      multipart: {
        photo: {
          name: "evidence.jpg",
          mimeType: "image/jpeg",
          buffer: fs.readFileSync(SAMPLE),
        },
        note: "오늘 아침에도 같은 자리가 그대로였습니다.",
        ackNoSensitive: "true",
      },
    },
  );
  expect(uploaded.status()).toBe(202);
  const evidenceId = (await uploaded.json()).data.evidence.id as string;

  await switchUser(page, "demo-ops");
  const reviewed = await page.request.post(`/api/moderation/evidence/${evidenceId}`, {
    headers: { origin: baseURL, "content-type": "application/json" },
    data: { decision: "approved" },
  });
  expect(reviewed.status()).toBe(200);
  return evidenceId;
}

test.describe("withdrawal and takedown", () => {
  test("owner withdrawal removes the public page, evidence photo and feed entry", async ({
    page,
    browser,
    baseURL,
  }) => {
    await switchUser(page, "demo-minji");
    const publicId = await publishIssue(page, baseURL!);
    const evidenceId = await addApprovedEvidence(page, publicId, baseURL!);

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`${baseURL}/issues/${publicId}`);
    await expect(anonPage.getByRole("heading", { level: 1 })).toContainText("보도 파손");
    const approvedPhoto = await anonPage.request.get(
      `/api/public/evidence/${evidenceId}/photo`,
    );
    expect(approvedPhoto.status()).toBe(200);

    // Owner sees a two-step withdrawal control and confirms.
    await switchUser(page, "demo-minji");
    await page.goto(`/reports/${publicId}`);
    await page.getByRole("button", { name: "공개 중단", exact: true }).click();
    await page.getByRole("button", { name: "정말 공개 중단" }).click();
    await expect(page.getByText("공개 중단됨")).toBeVisible();
    await expect(page.getByText("공개가 중단된 기록")).toBeVisible();
    await expect(
      page.getByText(/공개 페이지와 근거 사진은 더 이상 표시되지 않습니다/).first(),
    ).toBeVisible();

    // The public app surface is closed, including the evidence photo.
    await anonPage.goto(`${baseURL}/issues/${publicId}`);
    await expect(
      anonPage.getByRole("heading", { name: "찾을 수 없는 페이지입니다" }),
    ).toBeVisible();
    const reportApi = await anonPage.request.get(`/api/public/reports/${publicId}`);
    expect(reportApi.status()).toBe(404);
    const reportPhoto = await anonPage.request.get(
      `/api/public/reports/${publicId}/photo`,
    );
    expect(reportPhoto.status()).toBe(404);
    const evidencePhoto = await anonPage.request.get(
      `/api/public/evidence/${evidenceId}/photo`,
    );
    expect(evidencePhoto.status()).toBe(404);

    // The feed no longer lists it.
    await anonPage.goto(`${baseURL}/issues`);
    await expect(
      anonPage.getByRole("heading", { name: "이웃이 공개한 기록" }),
    ).toBeVisible();
    // Identify this issue by id: other tests legitimately create issues with the
    // same generated title.
    await expect(anonPage.locator(`a[href="/issues/${publicId}"]`)).toHaveCount(0);

    await anon.close();
  });
});
