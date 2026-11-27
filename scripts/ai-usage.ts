/**
 * Aggregate AI usage and cost estimate.
 *
 * Prints only counts and token totals per provenance mode. It never selects
 * report text, user facts, prompts, image hashes or storage keys, so its output
 * is safe to paste into a commit or an operator log.
 *
 * The USD figure is an ESTIMATE from the configured per-million-token prices,
 * not a provider invoice. It cannot include provider-side charges the app does
 * not know about (for example failed requests that were still billed).
 */

import { getPriceAssumptions } from "../src/lib/ai/config.ts";
import { getDb } from "../src/lib/db/connection.ts";
import { all } from "../src/lib/db/query.ts";

type ModeRow = {
  mode: string;
  count: number;
  input_tokens: number | null;
  output_tokens: number | null;
  failures: number;
  avg_latency_ms: number | null;
};

const db = getDb();
const modes = all<ModeRow>(
  db,
  `SELECT mode,
          COUNT(*) AS count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(CASE WHEN failure_code IS NOT NULL THEN 1 ELSE 0 END) AS failures,
          AVG(latency_ms) AS avg_latency_ms
     FROM report_analyses
    GROUP BY mode
    ORDER BY mode`,
);

const prices = getPriceAssumptions();
let inputTokens = 0;
let outputTokens = 0;
let liveCalls = 0;
for (const row of modes) {
  inputTokens += row.input_tokens ?? 0;
  outputTokens += row.output_tokens ?? 0;
  if (row.mode === "live") liveCalls += row.count;
}

const estimateUsd =
  (inputTokens / 1_000_000) * prices.inputPerMTokUsd +
  (outputTokens / 1_000_000) * prices.outputPerMTokUsd;

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      modes: modes.map((row) => ({
        mode: row.mode,
        analyses: row.count,
        failed: row.failures,
        inputTokens: row.input_tokens ?? 0,
        outputTokens: row.output_tokens ?? 0,
        avgLatencyMs:
          row.avg_latency_ms === null ? null : Math.round(row.avg_latency_ms),
      })),
      totals: { liveCalls, inputTokens, outputTokens },
      estimate: {
        kind: "estimate-from-configured-prices-not-billing",
        usd: Number(estimateUsd.toFixed(6)),
        prices,
      },
      note:
        "Simulation and fallback rows cost nothing. Token fields are null when the provider did not report usage.",
    },
    null,
    2,
  ),
);
