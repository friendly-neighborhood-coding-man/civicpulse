import { OFFICIAL_CHANNELS } from "./channels.ts";

/**
 * Provenance of an "official" status record.
 *
 * Three of the four trust tiers in the product contract are representable here:
 *
 * 1. `official_source` — a human moderator recorded a status and cited a page
 *    on a *verified official portal domain* from the channel registry. The
 *    domain is checkable; the page content is still a human assertion.
 * 2. `moderator_claim` — a moderator recorded a status with no source, or with
 *    a source outside the registry. Shown as an unverified operator note.
 * 3. `user_claim` / `mock` — the citizen's own observation, or demo data.
 *
 * The missing tier — an *authenticated* official record fetched from a
 * government API with a verifiable response — does not exist in this product,
 * so no code path may create one and no UI may imply one. If such an adapter is
 * ever added it must carry its own provenance value, not reuse
 * `official_source`.
 */
export const AUTHENTICATED_OFFICIAL_INTEGRATION = false;

export type OfficialSourceRegistryEntry = {
  channelId: string;
  channelName: string;
  /** Lowercase hostname without a trailing dot; may be a bare `www.` variant. */
  host: string;
  label: string;
  /** ISO date a human last checked the portal. */
  asOf: string;
};

function normalizedHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return null;
  }
}

function buildRegistry(): OfficialSourceRegistryEntry[] {
  const entries: OfficialSourceRegistryEntry[] = [];
  const seen = new Set<string>();
  for (const channel of OFFICIAL_CHANNELS) {
    for (const url of [channel.url, channel.sourceUrl]) {
      const host = normalizedHost(url);
      if (!host) continue;
      // `www.x.go.kr` and `x.go.kr` are the same portal for provenance purposes.
      const hosts = host.startsWith("www.") ? [host, host.slice(4)] : [host];
      for (const candidate of hosts) {
        const key = `${channel.id}:${candidate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          channelId: channel.id,
          channelName: channel.name,
          host: candidate,
          label: `${channel.name} (${channel.operator})`,
          asOf: channel.asOf,
        });
      }
    }
  }
  return entries;
}

export const OFFICIAL_SOURCE_REGISTRY: OfficialSourceRegistryEntry[] = buildRegistry();

export function findOfficialRegistryEntry(
  host: string,
): OfficialSourceRegistryEntry | null {
  const normalized = host.toLowerCase().replace(/\.+$/, "");
  return (
    OFFICIAL_SOURCE_REGISTRY.find(
      (entry) =>
        normalized === entry.host || normalized.endsWith(`.${entry.host}`),
    ) ?? null
  );
}

export type SourceRejection =
  | "missing"
  | "invalid_url"
  | "not_https"
  | "embedded_credentials"
  | "unregistered_host";

export type SourceUrlCheck =
  | {
      ok: true;
      url: string;
      host: string;
      registry: OfficialSourceRegistryEntry;
    }
  | { ok: false; reason: SourceRejection; host: string | null };

/**
 * Parse an https URL. Deliberately strict about userinfo: embeds like
 * `https://www.safetyreport.go.kr@evil.example/` are a classic way to make a
 * link look official while pointing elsewhere.
 */
function parseHttpsUrl(
  raw: string,
): { ok: true; url: string; host: string } | { ok: false; reason: SourceRejection } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "missing" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "embedded_credentials" };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) return { ok: false, reason: "invalid_url" };

  return { ok: true, url: parsed.toString(), host };
}

/**
 * Check a URL cited as the source of an official status.
 *
 * HTTPS alone proves nothing: any site can serve TLS. Only hosts that appear in
 * the curated channel registry may back an `official_source` record.
 */
export function checkOfficialSourceUrl(raw: string): SourceUrlCheck {
  const parsed = parseHttpsUrl(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, host: null };

  const registry = findOfficialRegistryEntry(parsed.host);
  if (!registry) {
    return { ok: false, reason: "unregistered_host", host: parsed.host };
  }

  return { ok: true, url: parsed.url, host: parsed.host, registry };
}

/**
 * Accept any https URL as a *supporting* link on an unverified moderator note.
 * The host is recorded so the UI can show where the link actually points.
 */
export function parseSupportingSourceUrl(
  raw: string | undefined,
): { ok: true; url: string; host: string } | { ok: false; reason: SourceRejection } {
  if (!raw || !raw.trim()) return { ok: false, reason: "missing" };
  return parseHttpsUrl(raw);
}

export const OFFICIAL_SOURCE_REJECTION_MESSAGE: Record<SourceRejection, string> = {
  missing: "공식 출처 확인에는 출처 주소가 필요합니다.",
  invalid_url: "출처 주소 형식이 올바르지 않습니다.",
  not_https: "출처 주소는 https:// 로 시작해야 합니다.",
  embedded_credentials:
    "출처 주소에 사용자 정보(@)를 넣을 수 없습니다. 실제 주소를 그대로 입력해 주세요.",
  unregistered_host:
    "확인된 공식 포털 도메인이 아닙니다. 공식 출처로 기록하려면 등록된 포털 주소를 사용하고, 그 밖의 자료는 '운영자 기록(미검증)'으로 남겨 주세요.",
};

/** Hosts a moderator may cite for an `official_source` record. */
export function listOfficialSourceHosts(): Array<{
  host: string;
  label: string;
  asOf: string;
}> {
  const seen = new Set<string>();
  const hosts: Array<{ host: string; label: string; asOf: string }> = [];
  for (const entry of OFFICIAL_SOURCE_REGISTRY) {
    if (seen.has(entry.host)) continue;
    seen.add(entry.host);
    hosts.push({ host: entry.host, label: entry.label, asOf: entry.asOf });
  }
  return hosts;
}
