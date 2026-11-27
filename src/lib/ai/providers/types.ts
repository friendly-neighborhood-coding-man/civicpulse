import type { ModelImage } from "../image.ts";
import type { PromptInput } from "../prompt.ts";
import type { FailureCode } from "../schema.ts";

/**
 * The seam between report creation and any model vendor.
 *
 * A provider returns *unvalidated* content. Validation, guardrails, fallback and
 * persistence live in one place (`domain/analysis.ts`) so a new provider cannot
 * skip them.
 */

export type ProviderRequest = PromptInput & {
  image: ModelImage;
  /** SHA-256 of the uploaded bytes; used only to recognise shipped fixtures. */
  uploadSha256: string;
};

export type ProviderResponse = {
  content: unknown;
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  /** True when a scripted fixture, not a model, produced the observations. */
  simulatedObservations: boolean;
};

export interface AnalysisProvider {
  readonly mode: "live" | "mock";
  readonly provider: string;
  readonly model: string | null;
  /** Whether calling `analyze` sends the image off this server. */
  readonly external: boolean;
  analyze(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse>;
}

/** A failure with a fixed code; `message` is for server logs, never the UI. */
export class ProviderError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ProviderError";
  }
}
