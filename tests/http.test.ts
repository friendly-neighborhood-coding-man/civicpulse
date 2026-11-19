import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  assertSameOrigin,
  jsonError,
  jsonOk,
  readJson,
  withApi,
} from "@/lib/http/api";
import { ApiError } from "@/lib/http/errors";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("same-origin guard", () => {
  it("accepts a matching origin and host", () => {
    const request = new Request("http://localhost:3000/api/session", {
      method: "POST",
      headers: headers({
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "sec-fetch-site": "same-origin",
      }),
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects a foreign origin", () => {
    const request = new Request("http://localhost:3000/api/session", {
      method: "POST",
      headers: headers({
        origin: "https://evil.example",
        host: "localhost:3000",
      }),
    });
    expect(() => assertSameOrigin(request)).toThrow(ApiError);
    try {
      assertSameOrigin(request);
    } catch (error) {
      expect((error as ApiError).code).toBe("FORBIDDEN_ORIGIN");
      expect((error as ApiError).status).toBe(403);
    }
  });

  it("rejects missing origin", () => {
    const request = new Request("http://localhost:3000/api/session", {
      method: "POST",
      headers: headers({ host: "localhost:3000" }),
    });
    expect(() => assertSameOrigin(request)).toThrow(/출처/);
  });

  it("rejects a cross-site fetch even when the origin header matches", () => {
    const request = new Request("http://localhost:3000/api/session", {
      method: "POST",
      headers: headers({
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "sec-fetch-site": "cross-site",
      }),
    });
    expect(() => assertSameOrigin(request)).toThrow(/출처/);
  });
});

describe("JSON body parsing", () => {
  const schema = z.object({ name: z.string().min(2) });

  it("parses valid JSON", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify({ name: "민지" }),
    });
    await expect(readJson(request, schema)).resolves.toEqual({ name: "민지" });
  });

  it("rejects non-JSON content types with 415", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: headers({ "content-type": "text/plain" }),
      body: "hello",
    });
    await expect(readJson(request, schema)).rejects.toMatchObject({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("rejects invalid JSON with 400", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: "{not json",
    });
    await expect(readJson(request, schema)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("response envelopes", () => {
  it("marks success responses as non-cacheable", async () => {
    const response = jsonOk({ hello: "world" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { hello: "world" },
    });
  });

  it("maps validation failures to 422 with field details", async () => {
    const parsed = z
      .object({ name: z.string().min(2, "2자 이상 입력해 주세요.") })
      .safeParse({ name: "x" });
    expect(parsed.success).toBe(false);
    const response = jsonError(parsed.error);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.issues[0].path).toBe("name");
  });

  it("never leaks internal error messages", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await withApi(async () => {
      throw new Error("database password=hunter2 exploded");
    });
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text).error.message).toBe("처리 중 문제가 발생했습니다.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
