/**
 * Server-only AI configuration.
 *
 * Every value is read from the environment at call time and clamped, so a typo
 * cannot disable a limit or raise it without bound. The API key is read only by
 * the provider adapter and is never returned by any function here.
 */

// Vision + Structured Outputs + Responses API, confirmed on the official model
// page (developers.openai.com/api/docs/models/gpt-5-mini, 2026-11-27). The
// page marks this snapshot deprecated and suggests a newer model, so an
// operator should set CIVICPULSE_AI_MODEL to their current choice before a
// paid run. No newer or unverified model id is assumed here.
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export type ReasoningEffort = "none" | "low" | "medium" | "off";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** `openai` = live provider; anything else = offline simulation. */
export function isLiveAiConfigured(): boolean {
  return process.env.CIVICPULSE_AI_MODE === "openai";
}

export function hasOpenAiKey(): boolean {
  return (process.env.OPENAI_API_KEY ?? "").trim().length > 0;
}

export function getOpenAiModel(): string {
  const model = (process.env.CIVICPULSE_AI_MODEL ?? "").trim();
  return /^[a-zA-Z0-9._:-]{1,64}$/.test(model) ? model : DEFAULT_OPENAI_MODEL;
}

/**
 * Operator override for an OpenAI-compatible endpoint (used by the local stub
 * in the browser suite). Only http(s) origins are accepted; anything else falls
 * back to the official endpoint. A model response can never set this.
 */
export function getOpenAiBaseUrl(): string {
  const raw = (process.env.CIVICPULSE_AI_BASE_URL ?? "").trim();
  if (!raw) return DEFAULT_OPENAI_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_OPENAI_BASE_URL;
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_OPENAI_BASE_URL;
  }
}

/**
 * Omitted by default: a reasoning parameter sent to a non-reasoning model is an
 * error, so an operator must opt in after choosing a reasoning-capable model.
 */
export function getReasoningEffort(): ReasoningEffort {
  const value = process.env.CIVICPULSE_AI_REASONING_EFFORT;
  return value === "none" || value === "low" || value === "medium" ? value : "off";
}

export function getAiTimeoutMs(): number {
  return intEnv("CIVICPULSE_AI_TIMEOUT_MS", 25_000, 3_000, 60_000);
}

/** Includes reasoning tokens for reasoning models. */
export function getAiMaxOutputTokens(): number {
  return intEnv("CIVICPULSE_AI_MAX_OUTPUT_TOKENS", 2_500, 600, 6_000);
}

/** Live (external) analyses across all users per rolling 24 hours. */
export function getAiGlobalDailyLimit(): number {
  return intEnv("CIVICPULSE_AI_DAILY_LIMIT", 100, 0, 5_000);
}

/** Live (external) analyses per user per rolling 24 hours. */
export function getAiUserDailyLimit(): number {
  return intEnv("CIVICPULSE_AI_USER_DAILY_LIMIT", 10, 0, 200);
}

/** Provider attempts per report, across all modes (cached replies excluded). */
export function getAiPerReportLimit(): number {
  return intEnv("CIVICPULSE_AI_PER_REPORT_LIMIT", 5, 1, 20);
}

/**
 * Published list prices (USD per 1M tokens) used only for *estimates* in the
 * usage script. Operators must update them from the provider's pricing page;
 * they are never presented as measured spend.
 */
export function getPriceAssumptions(): { inputPerMTokUsd: number; outputPerMTokUsd: number; checkedAt: string } {
  const input = Number.parseFloat(process.env.CIVICPULSE_AI_PRICE_INPUT_PER_MTOK ?? "");
  const output = Number.parseFloat(process.env.CIVICPULSE_AI_PRICE_OUTPUT_PER_MTOK ?? "");
  return {
    // gpt-5-mini list prices from the official model page (2026-11-27).
    // ESTIMATES only: not billing data. Operators must re-check the pricing
    // page and may override both values by environment variable.
    inputPerMTokUsd: Number.isFinite(input) && input >= 0 ? input : 0.25,
    outputPerMTokUsd: Number.isFinite(output) && output >= 0 ? output : 2,
    checkedAt: "2026-11-27",
  };
}

/** Safe summary for health checks and the UI. Never includes the key. */
export type AiConfigSummary = {
  mode: "live" | "simulation";
  provider: string | null;
  model: string | null;
  configured: boolean;
  externalTransfer: boolean;
};

export function describeAiConfig(): AiConfigSummary {
  if (!isLiveAiConfigured()) {
    return { mode: "simulation", provider: null, model: null, configured: true, externalTransfer: false };
  }
  return {
    mode: "live",
    provider: providerLabel(),
    model: getOpenAiModel(),
    configured: hasOpenAiKey(),
    externalTransfer: true,
  };
}

/** "openai" for the official endpoint; otherwise names the host explicitly. */
export function providerLabel(): string {
  const base = getOpenAiBaseUrl();
  if (base === DEFAULT_OPENAI_BASE_URL) return "openai";
  return `openai-compatible:${new URL(base).host}`;
}
