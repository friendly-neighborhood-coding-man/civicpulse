import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Server-side runtime configuration.
 *
 * Everything here is resolved lazily so that importing this module (for
 * example during `next build`) never writes to disk.
 */

const PROJECT_ROOT = process.cwd();

export { LIMITS } from "./limits.ts";

export type AssistantMode = "mock" | "openai";

export function getDataDir(): string {
  return process.env.CIVICPULSE_DATA_DIR
    ? path.resolve(process.env.CIVICPULSE_DATA_DIR)
    : path.join(PROJECT_ROOT, ".local");
}

export function getDbPath(): string {
  if (process.env.CIVICPULSE_DB_PATH === ":memory:") return ":memory:";
  return process.env.CIVICPULSE_DB_PATH
    ? path.resolve(process.env.CIVICPULSE_DB_PATH)
    : path.join(getDataDir(), "data", "civicpulse.sqlite");
}

/** Originals live here and are only reachable through authenticated routes. */
export function getPrivateMediaDir(): string {
  return path.join(getDataDir(), "media", "private");
}

export function getPublicMediaDir(): string {
  return path.join(getDataDir(), "media", "public");
}

let cachedSecret: string | null = null;

/**
 * Session signing key.
 *
 * Order: explicit env var -> persisted local secret file -> freshly generated
 * secret file (mode 0600). The generated file lives under `.local/`, which is
 * git-ignored. It is a genuine server-side secret, not a committed default.
 */
export function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.CIVICPULSE_SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (fromEnv) {
    throw new Error(
      "CIVICPULSE_SESSION_SECRET is set but shorter than 32 characters. Generate one with: openssl rand -hex 32",
    );
  }

  const secretPath = path.join(getDataDir(), "session-secret");
  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) {
      cachedSecret = existing;
      return cachedSecret;
    }
  } catch {
    // Fall through and create it.
  }

  const secret = crypto.randomBytes(48).toString("hex");
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  cachedSecret = secret;
  return secret;
}

/**
 * The assistant is deterministic by default. A remote (paid) model is only
 * used when an operator explicitly opts in *and* provides a key; see
 * docs/INTEGRATIONS.md. No network call happens in mock mode.
 */
export function getAssistantMode(): AssistantMode {
  return process.env.CIVICPULSE_AI_MODE === "openai" ? "openai" : "mock";
}

/**
 * Illustrative demo waiting period before a follow-up can be drafted.
 *
 * The default is 14 days. `0` is allowed so an end-to-end demo can exercise the
 * flow immediately; it is a demo setting, not a recommendation, and the UI always
 * prints the configured value.
 */
export function getFollowupWaitingDays(): number {
  const parsed = Number.parseInt(process.env.CIVICPULSE_FOLLOWUP_WAITING_DAYS ?? "", 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.min(Math.max(parsed, 0), 90);
}

/** Cooldown that prevents repeated follow-up drafts for one report. */
export function getFollowupCooldownDays(): number {
  return 7;
}

/**
 * Days a removed report and rejected evidence are retained before purge.
 *
 * Default 90. Bounded to 1-3650 so a typo cannot disable retention or set a
 * window measured in decades. The purge itself is an explicit moderator job;
 * there is no background scheduler in this deployment.
 */
export function getRetentionDays(): number {
  const parsed = Number.parseInt(
    process.env.CIVICPULSE_RETENTION_DAYS ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(Math.max(parsed, 1), 3650);
}

/**
 * Demo identity switches allowed per minute in one process.
 *
 * This limits only the *demo* sign-in switcher, which is not authentication.
 * Scripted demos and the browser suite legitimately switch accounts many times
 * in under a minute, so the cap is configurable; it stays bounded (max 600) and
 * is never disabled by configuration.
 */
export function getSessionSwitchLimit(): number {
  const parsed = Number.parseInt(
    process.env.CIVICPULSE_SESSION_SWITCH_LIMIT ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 600);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
