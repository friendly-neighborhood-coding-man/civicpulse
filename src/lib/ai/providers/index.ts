import {
  getAiMaxOutputTokens,
  getOpenAiBaseUrl,
  getOpenAiModel,
  getReasoningEffort,
  hasOpenAiKey,
  isLiveAiConfigured,
  providerLabel,
} from "../config.ts";
import { OpenAiProvider } from "./openai.ts";
import { SimulationProvider } from "./simulation.ts";
import type { AnalysisProvider } from "./types.ts";

/**
 * Pick the provider for one analysis request.
 *
 * - `CIVICPULSE_AI_MODE=openai` with a key  -> live OpenAI Responses adapter.
 * - `CIVICPULSE_AI_MODE=openai` without a key -> `null`. The caller records an
 *   explicit `missing_credentials` fallback. It must **not** quietly run the
 *   simulation instead, because the UI would then label simulated observations
 *   as if they came from the configured model.
 * - anything else -> the offline simulation, labelled as such everywhere.
 *
 * Explicit and test-injectable: callers may pass their own provider.
 */
export function selectProvider(): AnalysisProvider | null {
  if (isLiveAiConfigured()) {
    if (!hasOpenAiKey()) return null;
    return new OpenAiProvider({
      apiKey: process.env.OPENAI_API_KEY!.trim(),
      model: getOpenAiModel(),
      baseUrl: getOpenAiBaseUrl(),
      providerLabel: providerLabel(),
      reasoningEffort: getReasoningEffort(),
      maxOutputTokens: getAiMaxOutputTokens(),
    });
  }
  return new SimulationProvider();
}
