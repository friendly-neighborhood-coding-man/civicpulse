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
        note: "보수 공사가 시작되지 않았고 임시 덮개만 놓여 있습니다.",
        ackNoSensitive: "true",
      },
    },
  );
  expect(uploaded.status()).toBe(202);
  return (await uploaded.json()).data.evidence.id as string;
}

async function approveEvidence(page: Page, evidenceId: string, baseURL: string) {
  const reviewed = await page.request.post(`/api/moderation/evidence/${evidenceId}`, {
    headers: { origin: baseURL, "content-type": "application/json" },
    data: { decision: "approved" },
  });
  expect(reviewed.status()).toBe(200);
}

test.describe("follow-up workflow", () => {
  test("drafts, reviews and never submits a follow-up request", async ({
    page,
    baseURL,
  }) => {
    await switchUser(page, "demo-minji");
    const publicId = await publishIssue(page, baseURL!);

    // A neighbour's approved evidence is what makes a follow-up meaningful.
    await switchUser(page, "demo-hana");
    const evidenceId = await uploadEvidence(page, publicId, baseURL!);
    await switchUser(page, "demo-ops");
    await approveEvidence(page, evidenceId, baseURL!);

    await switchUser(page, "demo-minji");
    await page.goto(`/reports/${publicId}`);
    await expect(page.getByRole("heading", { name: "후속 요청 준비" })).toBeVisible();
    await expect(page.getByText(/검토된 추가 근거/)).toBeVisible();
    await expect(page.getByText(/이번 요청의 새 근거/)).toBeVisible();
    await expect(page.getByText("1건").first()).toBeVisible();

    await page.getByRole("button", { name: "후속 요청 초안 만들기" }).click();
    await expect(page.getByText("검토 대기")).toBeVisible();
    await expect(page.getByText(/\[후속 요청 초안\]/)).toBeVisible();
    await expect(page.getByText(/안전신문고/).first()).toBeVisible();
    await expect(
      page.getByText(/CivicPulse가 자동으로 전송하지 않습니다/),
    ).toBeVisible();

    await page.getByRole("button", { name: "검토 완료로 표시" }).click();
    await expect(page.getByText("검토 완료", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/아직 어떤 기관에도 전송되지/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /안전신문고에서 직접 제출/ }),
    ).toHaveAttribute("href", "https://www.safetyreport.go.kr/");

    // The approval survives a reload: it is persisted, not a toast.
    await page.reload();
    await expect(page.getByText("검토 완료", { exact: true })).toBeVisible();

    // Another citizen can neither read nor create follow-ups for this report.
    await switchUser(page, "demo-hana");
    const foreignRead = await page.request.get(`/api/reports/${publicId}/followups`);
    expect(foreignRead.status()).toBe(403);
    const foreignCreate = await page.request.post(
      `/api/reports/${publicId}/followups`,
      { headers: { origin: baseURL! } },
    );
    expect(foreignCreate.status()).toBe(403);
  });

  test("treats a recorded resolution as a claim, not a permanent block", async ({
    page,
    baseURL,
  }) => {
    await switchUser(page, "demo-minji");
    const publicId = await publishIssue(page, baseURL!);

    // A neighbour's approved evidence exists, so only the resolution claim is
    // left between the owner and a follow-up draft. Use a distinct uploader:
    // the real per-account limit is 3 evidence uploads per hour.
    await switchUser(page, "demo-jun");
    const evidenceId = await uploadEvidence(page, publicId, baseURL!);
    await switchUser(page, "demo-ops");
    await approveEvidence(page, evidenceId, baseURL!);

    // A moderator cites the portal *homepage* and records "resolved". The host
    // is valid; the case is not verified. The UI must say so.
    await page.goto(`/issues/${publicId}`);
    await page.getByLabel("기록 종류").selectOption("official_source");
    await page.getByLabel("기록할 상태").selectOption("resolved");
    await page.getByLabel("출처 주소").fill("https://www.safetyreport.go.kr/");
    await page.getByLabel("기록 내용").fill("포털에 해결로 표시되어 있었습니다.");
    await page.getByRole("button", { name: "상태 기록" }).click();
    await expect(page.getByText(/공식 포털 인용/).first()).toBeVisible();

    await switchUser(page, "demo-minji");
    await page.goto(`/reports/${publicId}`);
    await expect(
      page.getByText(/사건 해결이 확인된 것은 아닙니다/).first(),
    ).toBeVisible();

    // Creating without the acknowledgement is refused by the route, not the UI.
    const refused = await page.request.post(`/api/reports/${publicId}/followups`, {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: { acknowledgeRecordedResolution: false },
    });
    expect(refused.status()).toBe(409);
    expect(JSON.stringify(await refused.json())).toContain("해결");

    // The owner decides explicitly, then the draft is created.
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "후속 요청 초안 만들기" }).click();
    await expect(page.getByText("검토 대기")).toBeVisible();
    await expect(page.getByText(/사건 확인 아님/).first()).toBeVisible();
  });

  test("explains why a follow-up is not possible yet", async ({ page, baseURL }) => {
    await switchUser(page, "demo-jun");
    const publicId = await publishIssue(page, baseURL!);

    await page.goto(`/reports/${publicId}`);
    await expect(page.getByText("아직 초안을 만들 수 없습니다")).toBeVisible();
    await expect(
      page.getByText(/새로 검토를 통과한 근거가 없습니다/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "후속 요청 초안 만들기" }),
    ).toHaveCount(0);

    // Creating a draft while ineligible is refused with the reasons.
    const refused = await page.request.post(`/api/reports/${publicId}/followups`, {
      headers: { origin: baseURL! },
    });
    expect(refused.status()).toBe(409);
    const payload = await refused.json();
    expect(JSON.stringify(payload)).toContain("근거");
  });
});
