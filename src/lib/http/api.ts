import { ZodError, type ZodType, type output } from "zod";

import { ApiError } from "./errors.ts";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};

const JSON_LIMIT_BYTES = 256 * 1024;

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify({ ok: true, data } satisfies ApiSuccess<T>), {
    ...init,
    headers,
  });
}

export function jsonError(error: unknown): Response {
  const apiError = toApiError(error);
  if (apiError.code === "INTERNAL") {
    console.error("[api] unhandled error", error);
  }
  const body: ApiFailure = {
    ok: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  };
  return new Response(JSON.stringify(body), {
    status: apiError.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(422, "VALIDATION_FAILED", "입력값을 확인해 주세요.", {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return new ApiError(500, "INTERNAL", "처리 중 문제가 발생했습니다.");
}

/** Wrap a route handler body so thrown errors become safe JSON responses. */
export async function withApi(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return jsonError(error);
  }
}

export async function readJson<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<output<S>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "application/json 요청만 처리합니다.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > JSON_LIMIT_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.");
  }
  const text = await request.text();
  if (text.length > JSON_LIMIT_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "JSON 형식이 올바르지 않습니다.");
  }
  return schema.parse(parsed);
}

export async function readFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "multipart/form-data 요청만 처리합니다.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "업로드 용량이 너무 큽니다.");
  }
  try {
    return await request.formData();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "요청 본문을 읽을 수 없습니다.");
  }
}

/**
 * Cookie-authenticated mutations require a same-origin `Origin` header.
 *
 * This is a pragmatic CSRF guard for a same-origin SPA-style app; it does not
 * replace per-request CSRF tokens in a future multi-origin deployment.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    throw new ApiError(
      403,
      "FORBIDDEN_ORIGIN",
      "요청 출처를 확인할 수 없습니다.",
    );
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "FORBIDDEN_ORIGIN", "요청 출처가 올바르지 않습니다.");
  }
  if (originHost.toLowerCase() !== host.toLowerCase()) {
    throw new ApiError(403, "FORBIDDEN_ORIGIN", "허용되지 않은 요청 출처입니다.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "FORBIDDEN_ORIGIN", "허용되지 않은 요청 출처입니다.");
  }
}
