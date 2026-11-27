import { ANALYSIS_JSON_SCHEMA, ANALYSIS_JSON_SCHEMA_NAME } from "../json-schema.ts";
import { buildUserPayload, SYSTEM_INSTRUCTIONS } from "../prompt.ts";
import type { ReasoningEffort } from "../config.ts";
import {
  ProviderError,
  type AnalysisProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "./types.ts";

/**
 * OpenAI Responses API adapter (POST {baseUrl}/responses).
 *
 * Request shape follows developers.openai.com/api/docs (checked 2026-11-26):
 * an `input_image` part with a base64 data URL and `detail: "low"`, and
 * Structured Outputs via `text.format` with `type: "json_schema"`, `strict: true`.
 *
 * Cost and privacy posture of every request:
 * - exactly one image (the 512px metadata-free JPEG) and one short text part;
 * - `store: false`, so the response is not kept as application state (provider
 *   abuse-monitoring retention still applies — see docs/AI.md);
 * - bounded `max_output_tokens`; a caller-supplied AbortSignal enforces the
 *   timeout; no retries here (a retry is a new, separately limited request);
 * - the response body is read with a byte cap before parsing.
 *
 * Only `fetch` is used; no SDK dependency, no key in any log line.
 */

const MAX_RESPONSE_BYTES = 256 * 1024;

export type OpenAiOptions = {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerLabel: string;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  fetchImpl?: typeof fetch;
};

export function buildOpenAiRequestBody(
  request: ProviderRequest,
  options: Pick<OpenAiOptions, "model" | "reasoningEffort" | "maxOutputTokens">,
): Record<string, unknown> {
  return {
    model: options.model,
    store: false,
    max_output_tokens: options.maxOutputTokens,
    ...(options.reasoningEffort === "off" ? {} : { reasoning: { effort: options.reasoningEffort } }),
    instructions: SYSTEM_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildUserPayload(request) },
          {
            type: "input_image",
            image_url: `data:${request.image.mime};base64,${request.image.base64}`,
            detail: "low",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: ANALYSIS_JSON_SCHEMA_NAME,
        strict: true,
        schema: ANALYSIS_JSON_SCHEMA,
      },
    },
  };
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ProviderError("malformed", "response exceeded byte cap");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type OutputContent = { type?: unknown; text?: unknown; refusal?: unknown };
type OutputItem = { type?: unknown; content?: unknown };

/** Extract the single JSON text from a Responses API body, or throw a coded error. */
export function parseResponsesBody(body: unknown): ProviderResponse {
  if (!body || typeof body !== "object") throw new ProviderError("malformed", "body not an object");
  const record = body as Record<string, unknown>;

  if (record.status === "incomplete") {
    throw new ProviderError("incomplete", "response incomplete");
  }
  if (record.status !== undefined && record.status !== "completed") {
    throw new ProviderError("provider_error", `unexpected status`);
  }

  const output = Array.isArray(record.output) ? (record.output as OutputItem[]) : [];
  let text: string | null = null;
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content as OutputContent[]) {
      if (part?.type === "refusal") throw new ProviderError("refused", "model refused");
      if (part?.type === "output_text" && typeof part.text === "string") {
        if (text !== null) throw new ProviderError("malformed", "multiple text parts");
        text = part.text;
      }
    }
  }
  if (text === null) throw new ProviderError("malformed", "no output_text");

  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    throw new ProviderError("malformed", "output_text is not JSON");
  }

  const usage = (record.usage ?? {}) as Record<string, unknown>;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

  return {
    content,
    model: typeof record.model === "string" ? record.model.slice(0, 64) : null,
    usage: { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens) },
    simulatedObservations: false,
  };
}

export class OpenAiProvider implements AnalysisProvider {
  readonly mode = "live" as const;
  readonly external = true;
  readonly provider: string;
  readonly model: string;
  private readonly options: OpenAiOptions;

  constructor(options: OpenAiOptions) {
    this.options = options;
    this.provider = options.providerLabel;
    this.model = options.model;
  }

  async analyze(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${this.options.baseUrl}/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildOpenAiRequestBody(request, this.options)),
        signal,
        redirect: "error",
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderError("timeout", "request aborted");
      throw new ProviderError("network", error instanceof Error ? error.name : "fetch failed");
    }

    if (!response.ok) {
      // Drain without reading into logs: provider error bodies can echo input.
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("auth_failed", `HTTP ${response.status}`);
      }
      if (response.status === 429) throw new ProviderError("rate_limited", "HTTP 429");
      if (response.status === 408 || response.status === 504) {
        throw new ProviderError("timeout", `HTTP ${response.status}`);
      }
      throw new ProviderError("provider_error", `HTTP ${response.status}`);
    }

    let raw: string;
    try {
      raw = await readCapped(response);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal.aborted) throw new ProviderError("timeout", "body aborted");
      throw new ProviderError("network", "body read failed");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ProviderError("malformed", "body is not JSON");
    }
    return parseResponsesBody(body);
  }
}
