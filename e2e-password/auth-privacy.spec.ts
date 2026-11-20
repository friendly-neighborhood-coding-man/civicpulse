import { expect, test, type Page } from "@playwright/test";

const CITIZEN = {
  email: "citizen@example.org",
  password: "e2e-password-123",
  displayName: "테스트 시민",
};
const OTHER = { email: "other@example.org", displayName: "다른 사용자" };

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(CITIZEN.email);
  await page.getByLabel("비밀번호").fill(CITIZEN.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/reports$/);
}

test.describe("password-mode session privacy", () => {
  test("unauthenticated session and pages expose no account directory", async ({
    page,
    request,
  }) => {
    const response = await request.get("/api/session");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.demo).toBe(false);
    expect(body.data.user).toBeNull();
    expect(body.data.users).toEqual([]);

    const serialized = JSON.stringify(body);
    for (const marker of [
      CITIZEN.email,
      CITIZEN.displayName,
      OTHER.email,
      OTHER.displayName,
      "demo-minji",
      "demo-ops",
      "moderator",
    ]) {
      expect(serialized).not.toContain(marker);
    }

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "계정 세션" })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(OTHER.displayName);
    expect(html).not.toContain(OTHER.email);
    expect(html).not.toContain("데모 사용자 선택");

    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const healthBody = await health.json();
    expect(healthBody.data.demoMode).toBe(false);
    expect(healthBody.data.authMode).toBe("password");
  });

  test("login returns only the acting account and logout clears the session", async ({
    page,
    context,
    baseURL,
  }) => {
    await login(page);

    const session = await context.request.get("/api/session");
    const body = await session.json();
    expect(body.data.demo).toBe(false);
    expect(body.data.user.displayName).toBe(CITIZEN.displayName);
    expect(body.data.user.role).toBe("citizen");
    expect(body.data.users).toEqual([]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(OTHER.displayName);
    expect(serialized).not.toContain(OTHER.email);
    expect(serialized).not.toContain("demo-ops");

    const before = await context.cookies();
    expect(before.find((cookie) => cookie.name === "cp_session")).toBeTruthy();

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("link", { name: "로그인", exact: true }).first(),
    ).toBeVisible();

    const after = await context.request.get("/api/session");
    expect((await after.json()).data.user).toBeNull();

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "cp_session");
    // The browser may either drop the expired cookie or keep it with a past
    // expiry; a live cookie after a confirmed sign-out would be the failure.
    expect(
      sessionCookie === undefined || sessionCookie.expires * 1000 <= Date.now(),
    ).toBe(true);

    // Sign-out is a safety action and is intentionally exempt from the
    // per-minute limiter: repeated sign-outs must not return 429 while leaving a
    // session cookie behind.
    for (let index = 0; index < 35; index += 1) {
      const repeat = await context.request.delete("/api/session", {
        headers: { origin: baseURL! },
      });
      expect(repeat.status()).toBe(200);
    }
  });

  test("failed logout is reported and keeps the session usable", async ({
    page,
    context,
  }) => {
    await login(page);

    await page.route("**/api/session", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "INTERNAL",
            message: "로그아웃 처리 중 문제가 발생했습니다.",
          },
        }),
      });
    });
    await page.getByRole("button", { name: "로그아웃" }).click();
    const headerAlert = page.locator("header").getByRole("alert");
    await expect(headerAlert).toContainText(
      "로그아웃 처리 중 문제가 발생했습니다.",
    );
    await expect(page).toHaveURL(/\/reports$/);
    let session = await context.request.get("/api/session");
    expect((await session.json()).data.user.displayName).toBe(
      CITIZEN.displayName,
    );

    await page.unroute("**/api/session");
    await page.route("**/api/session", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(headerAlert).toContainText("네트워크 오류");
    session = await context.request.get("/api/session");
    expect((await session.json()).data.user.displayName).toBe(
      CITIZEN.displayName,
    );

    // A later successful attempt does end the session.
    await page.unroute("**/api/session");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/$/);
    const after = await context.request.get("/api/session");
    expect((await after.json()).data.user).toBeNull();
  });
});
