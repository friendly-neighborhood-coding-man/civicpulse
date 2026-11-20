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

async function uploadEvidence(page: Page, publicId: string, baseURL: string) {
  const response = await page.request.post(`/api/public/reports/${publicId}/evidence`, {
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
  });
  expect(response.status()).toBe(202);
  return (await response.json()).data.evidence.id as string;
}

test.describe("community and tracking", () => {
  test("support, moderated evidence and a source-labelled timeline", async ({
    page,
    browser,
    baseURL,
  }) => {
    await switchUser(page, "demo-minji");
    const publicId = await publishIssue(page, baseURL!);

    // Signed-out visitors see why they cannot support yet.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`${baseURL}/issues/${publicId}`);
    await expect(anonPage.getByRole("button", { name: /지지하기/ })).toBeDisabled();
    await expect(
      anonPage.getByText("지지하려면 상단에서 모의 사용자를 선택하세요."),
    ).toBeVisible();

    // A neighbour supports it; repeat support cannot inflate the count.
    await switchUser(page, "demo-hana");
    await page.goto(`/issues/${publicId}`);
    await page.getByRole("button", { name: /지지하기/ }).click();
    await expect(page.getByRole("button", { name: /지지함/ })).toBeDisabled();
    await page.reload();
    await expect(page.getByText(/지지 1명/)).toBeVisible();

    const supportAgain = await page.request.post(
      `/api/public/reports/${publicId}/support`,
      { headers: { origin: baseURL! } },
    );
    expect(supportAgain.status()).toBe(200);
    expect((await supportAgain.json()).data).toMatchObject({
      supportCount: 1,
      alreadySupported: true,
    });

    // Evidence is accepted as pending and is not published yet.
    const evidenceId = await uploadEvidence(page, publicId, baseURL!);
    await page.goto(`/issues/${publicId}`);
    await expect(page.getByText(/아직 공개된 추가 근거가 없습니다/)).toBeVisible();

    const pendingPhoto = await anonPage.request.get(
      `/api/public/evidence/${evidenceId}/photo`,
    );
    expect(pendingPhoto.status()).toBe(404);

    // A citizen cannot reach the moderation queue.
    await page.goto("/moderation");
    await expect(page.getByText("접근할 수 없습니다")).toBeVisible();

    // The moderator reviews it with the photo visible, then approves it.
    await switchUser(page, "demo-ops");
    await page.goto("/moderation");
    await expect(page.getByText("추가 근거 검토")).toBeVisible();
    await expect(page.getByAltText("검토 대기 중인 근거 사진")).toBeVisible();
    await page.getByRole("button", { name: "승인" }).click();
    await expect(page.getByText(/검토를 기다리는 근거가 없습니다/)).toBeVisible();

    // Approved evidence is now public, including its photo.
    await anonPage.reload();
    await expect(anonPage.getByAltText("이웃이 추가한 근거 사진")).toBeVisible();
    await expect(anonPage.getByText(/오늘 아침에도 같은 자리/)).toBeVisible();
    const approvedPhoto = await anonPage.request.get(
      `/api/public/evidence/${evidenceId}/photo`,
    );
    expect(approvedPhoto.status()).toBe(200);
    expect(approvedPhoto.headers()["content-type"]).toBe("image/webp");

    // Moderator records an official status with a source.
    await page.goto(`/issues/${publicId}`);
    await page.getByLabel("기록 종류").selectOption("official_source");
    await page.getByLabel("기록할 상태").selectOption("in_progress");
    await page.getByLabel("출처 주소").fill("https://www.safetyreport.go.kr/");
    await page.getByLabel("기록 내용").fill("구청에서 보수 일정을 안내했습니다.");
    await page.getByRole("button", { name: "상태 기록" }).click();
    await expect(page.getByText(/공식 출처 기록으로 남겼습니다/)).toBeVisible();

    // Owner records a separate claim; it never becomes an official status.
    await switchUser(page, "demo-minji");
    await page.goto(`/issues/${publicId}`);
    await page.getByLabel("진행 상황", { exact: true }).selectOption("unresolved");
    await page
      .getByLabel("진행 상황 설명")
      .fill("아직 보수되지 않았습니다.");
    await page.getByRole("button", { name: "시민 주장으로 기록" }).click();
    await expect(page.getByText(/공식 확인과는 별도로 표시됩니다/)).toBeVisible();

    await anonPage.reload();
    const statusPanel = anonPage.locator("section", { hasText: "이 기록의 상태" }).first();
    await expect(statusPanel.getByText("처리 중")).toBeVisible();
    await expect(statusPanel.getByText("미해결")).toBeVisible();
    await expect(
      statusPanel.getByText("공식 포털 인용", { exact: true }),
    ).toBeVisible();
    await expect(statusPanel.getByText("안 됨 (도메인만 확인)")).toBeVisible();
    await expect(
      statusPanel.getByText("운영자 기록(미검증)", { exact: true }),
    ).toBeVisible();
    await expect(statusPanel.getByText("시민 주장", { exact: true })).toBeVisible();
    await expect(anonPage.getByText("구청에서 보수 일정을 안내했습니다.")).toBeVisible();
    await expect(anonPage.getByRole("link", { name: /포털 열기/ }).first()).toHaveAttribute(
      "href",
      "https://www.safetyreport.go.kr/",
    );

    // The feed lists the issue with its support count and official status.
    await anonPage.goto(`${baseURL}/issues`);
    await expect(anonPage.getByText(/지지 1명/)).toBeVisible();
    await expect(anonPage.getByText(/포털 인용 · 처리 중/)).toBeVisible();

    await anon.close();
  });

  test("rejects abuse and unauthorized status changes", async ({
    page,
    browser,
    baseURL,
  }) => {
    await switchUser(page, "demo-jun");
    const publicId = await publishIssue(page, baseURL!);

    // Foreign origin is refused for support.
    const foreign = await page.request.post(
      `/api/public/reports/${publicId}/support`,
      { headers: { origin: "https://evil.example" } },
    );
    expect(foreign.status()).toBe(403);

    // Evidence without the privacy confirmation is refused, nothing is queued.
    const noAck = await page.request.post(
      `/api/public/reports/${publicId}/evidence`,
      {
        headers: { origin: baseURL! },
        multipart: {
          photo: {
            name: "evidence.jpg",
            mimeType: "image/jpeg",
            buffer: fs.readFileSync(SAMPLE),
          },
          note: "개인정보 확인 없이 올리는 근거입니다.",
        },
      },
    );
    expect(noAck.status()).toBe(400);

    // A citizen cannot record an official status, and mock needs a moderator.
    const official = await page.request.post(
      `/api/reports/${publicId}/status-events`,
      {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: {
          kind: "official_source",
          status: "resolved",
          note: "권한 없이 공식 상태를 기록하는 시도입니다.",
          sourceUrl: "https://www.safetyreport.go.kr/",
        },
      },
    );
    expect(official.status()).toBe(403);

    // An official status without an https source is refused for the moderator.
    await switchUser(page, "demo-ops");
    const noSource = await page.request.post(
      `/api/reports/${publicId}/status-events`,
      {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: {
          kind: "official_source",
          status: "resolved",
          note: "출처 없이 공식 상태를 기록하는 시도입니다.",
        },
      },
    );
    // Missing required fields are structural validation failures (422);
    // domain rules such as an unregistered host are 400 below.
    expect(noSource.status()).toBe(422);

    // HTTPS alone is not provenance: an unrelated domain is refused as an
    // official source even for a moderator.
    const unrelated = await page.request.post(
      `/api/reports/${publicId}/status-events`,
      {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: {
          kind: "official_source",
          status: "resolved",
          note: "관련 없는 출처로 공식 상태를 기록하는 시도입니다.",
          sourceUrl: "https://example.com/notice/1",
        },
      },
    );
    expect(unrelated.status()).toBe(400);

    // The same link is allowed only as an unverified moderator note.
    const unverified = await page.request.post(
      `/api/reports/${publicId}/status-events`,
      {
        headers: { origin: baseURL!, "content-type": "application/json" },
        data: {
          kind: "moderator_claim",
          status: "resolved",
          note: "담당자와 통화했다고 전달받았습니다. 서면 확인은 없습니다.",
          sourceUrl: "https://example.com/notice/1",
        },
      },
    );
    expect(unverified.status()).toBe(201);
    expect((await unverified.json()).data.event.kind).toBe("moderator_claim");

    // A signed-out visitor cannot support.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    const signedOut = await anonPage.request.post(
      `/api/public/reports/${publicId}/support`,
      { headers: { origin: baseURL! } },
    );
    expect(signedOut.status()).toBe(401);
    await anon.close();
  });
});
