/**
 * Errors that are safe to expose to API clients.
 *
 * Anything else that reaches the API boundary is logged server-side and
 * returned as a generic 500, so internal details never leak to the browser.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_FAILED"
  | "BLOCKED"
  | "INTERNAL";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function notFound(message = "요청한 항목을 찾을 수 없습니다."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function forbidden(message = "권한이 없습니다."): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function unauthenticated(
  message = "데모 사용자를 먼저 선택해 주세요.",
): ApiError {
  return new ApiError(401, "UNAUTHENTICATED", message);
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, "CONFLICT", message, details);
}
