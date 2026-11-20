/**
 * Run the retention purge from a scheduler (cron, systemd timer, platform job).
 *
 *   npm run retention
 *
 * Uses the same domain function as the moderator endpoint, so a scheduled run
 * and a manual run have identical behaviour. Prints counts only; no content.
 */
import { getDb } from "../src/lib/db/connection.ts";
import { runRetention } from "../src/lib/domain/retention.ts";

async function main(): Promise<void> {
  const result = await runRetention(getDb());
  console.log(JSON.stringify({ retention: result }, null, 2));
}

void main();
