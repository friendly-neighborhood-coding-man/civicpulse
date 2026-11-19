import { expect, test } from "@playwright/test";

test.describe("foundation", () => {
  test("home renders the honest demo scope and health reports real state", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "동네의 문제를",
    );
    await expect(page.getByText("데모 · 합성 데이터")).toBeVisible();
    await expect(page.getByText("실제 신고 전송 없음")).toBeVisible();
    await expect(page.getByText("이 프로토타입이 하지 않는 일")).toBeVisible();

    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body.ok).toBe(true);
    expect(body.data.demoMode).toBe(true);
    expect(body.data.assistantMode).toBe("mock");
    expect(body.data.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(Object.keys(body.data)).not.toContain("secret");
  });

  test("demo identity switch persists across reload and signs out", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const panel = page.locator("#identity");

    await panel.getByRole("button", { name: /김민지/ }).click();
    await expect(panel.getByText(/현재 세션:/)).toContainText("김민지");

    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === "cp_session");
    expect(session).toBeTruthy();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");

    await page.reload();
    await expect(page.locator("#identity").getByText(/현재 세션:/)).toContainText(
      "김민지",
    );

    await page
      .locator("#identity")
      .getByRole("button", { name: "데모 세션 종료" })
      .click();
    await expect(page.locator("#identity").getByText(/현재 세션:/)).toHaveCount(0);
  });

  test("foreign-origin session mutation is rejected", async ({
    request,
    baseURL,
  }) => {
    const response = await request.post("/api/session", {
      data: { userId: "demo-minji" },
      headers: { origin: "https://evil.example" },
    });
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN_ORIGIN");

    const sameOrigin = await request.post("/api/session", {
      data: { userId: "demo-minji" },
      headers: { origin: baseURL! },
    });
    expect(sameOrigin.status()).toBe(200);
  });

  test("unknown demo user and malformed payloads are rejected", async ({
    request,
    baseURL,
  }) => {
    const unknown = await request.post("/api/session", {
      data: { userId: "demo-intruder" },
      headers: { origin: baseURL! },
    });
    expect(unknown.status()).toBe(404);

    const malformed = await request.post("/api/session", {
      data: { nope: true },
      headers: { origin: baseURL! },
    });
    expect(malformed.status()).toBe(422);
    const body = await malformed.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });
});
