/**
 * Heuristic personal-information scan for text that is about to become public.
 *
 * WHY THIS EXISTS
 * The photo redactor only protects pixels. Report titles, bodies and evidence
 * notes are copied from a private draft into the public surface, and a citizen
 * can easily paste a phone number, an email address or a resident registration
 * number into them. This module gives the publisher an *explicit* review step
 * with concrete candidates to look at.
 *
 * WHAT THIS IS NOT
 * This is a small deterministic pattern matcher, not a classifier and not a
 * guarantee. It misses names without honorifics, addresses written unusually,
 * obfuscated numbers (e.g. "공일공"), and anything it has no pattern for. It can
 * also produce false positives (e.g. "학부모님"). Therefore:
 *   - a finding never blocks publication by itself; it requires an explicit
 *     human acknowledgement that the item was reviewed,
 *   - no finding is ever described as "safe" or "clean",
 *   - nothing here writes the matched value to storage or logs.
 */

export const TEXT_REVIEW_VERSION = "text-v1";

export type TextField = "title" | "description" | "note";

export const TEXT_FINDING_KINDS = [
  "resident_id",
  "phone",
  "email",
  "plate",
  "unit_address",
  "name_hint",
] as const;

export type TextFindingKind = (typeof TEXT_FINDING_KINDS)[number];

export type TextFinding = {
  field: TextField;
  kind: TextFindingKind;
  /** Offsets into the original field value, so a UI can highlight it. */
  start: number;
  end: number;
  /** Masked rendering: safe to show in a preview, log or test snapshot. */
  preview: string;
};

export type TextFindingSummary = {
  total: number;
  kinds: TextFindingKind[];
  byKind: Partial<Record<TextFindingKind, number>>;
  fields: TextField[];
};

export const TEXT_FINDING_LABEL: Record<TextFindingKind, string> = {
  resident_id: "주민등록번호 형태",
  phone: "전화번호 형태",
  email: "이메일 주소 형태",
  plate: "차량 번호판 형태",
  unit_address: "동·호수 상세 주소 형태",
  name_hint: "이름으로 보이는 표현",
};

/**
 * Ordered by specificity: earlier patterns win overlapping ranges, so a
 * resident-id-shaped 13-digit number is not also reported as a phone number.
 */
const PATTERNS: ReadonlyArray<{ kind: TextFindingKind; pattern: RegExp }> = [
  { kind: "resident_id", pattern: /\b\d{6}[- ]?[1-8]\d{6}\b/g },
  { kind: "email", pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: "phone", pattern: /(?:\+?82[-\s]?)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g },
  // Address units run before plates: "101동 1203" also fits the plate shape, and
  // an address is the more meaningful warning for a civic report.
  // No trailing \b here: JavaScript's \b is ASCII-only, so `동\b` and `님\b`
  // would never match after a Hangul syllable.
  { kind: "unit_address", pattern: /\d{1,4}\s?(?:동|호)/g },
  { kind: "plate", pattern: /\b\d{2,3}[가-힣]\s?\d{4}\b/g },
  { kind: "name_hint", pattern: /[가-힣]{2,4}\s?(?:씨|님)/g },
];

const MAX_FINDINGS_PER_FIELD = 20;

/** Keep the shape of the value while hiding the value itself. */
function maskMatch(raw: string): string {
  const compact = raw.trim();
  if (compact.length <= 2) return "•".repeat(compact.length);
  const head = compact.slice(0, 2);
  const tail = compact.slice(-2);
  return `${head}${"•".repeat(Math.max(1, compact.length - 4))}${tail}`;
}

function scanField(field: TextField, value: string): TextFinding[] {
  if (!value) return [];
  const accepted: TextFinding[] = [];

  for (const { kind, pattern } of PATTERNS) {
    // Fresh lastIndex per field: the regexes are stateful (`g`).
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end === start) continue;
      const overlaps = accepted.some(
        (existing) => start < existing.end && end > existing.start,
      );
      if (overlaps) continue;
      accepted.push({
        field,
        kind,
        start,
        end,
        preview: maskMatch(match[0]),
      });
      if (accepted.length >= MAX_FINDINGS_PER_FIELD) break;
    }
    if (accepted.length >= MAX_FINDINGS_PER_FIELD) break;
  }

  return accepted.sort((a, b) => a.start - b.start);
}

export function scanText(field: TextField, value: string): TextFinding[] {
  return scanField(field, value);
}

/** The fields that are actually copied into the public report projection. */
export function scanPublicText(input: {
  title: string;
  description: string;
}): TextFinding[] {
  return [
    ...scanField("title", input.title),
    ...scanField("description", input.description),
  ];
}

export function summarizeFindings(findings: TextFinding[]): TextFindingSummary {
  const byKind: Partial<Record<TextFindingKind, number>> = {};
  const fields = new Set<TextField>();
  for (const finding of findings) {
    byKind[finding.kind] = (byKind[finding.kind] ?? 0) + 1;
    fields.add(finding.field);
  }
  return {
    total: findings.length,
    kinds: Object.keys(byKind) as TextFindingKind[],
    byKind,
    fields: [...fields],
  };
}

/**
 * Audit record persisted at publication time.
 *
 * Intentionally stores only kinds/counts/fields: the audit trail must not
 * become a second copy of the personal data it is supposed to help remove.
 */
export function toTextReviewAudit(findings: TextFinding[]): {
  version: string;
  total: number;
  byKind: Partial<Record<TextFindingKind, number>>;
  fields: TextField[];
} {
  const summary = summarizeFindings(findings);
  return {
    version: TEXT_REVIEW_VERSION,
    total: summary.total,
    byKind: summary.byKind,
    fields: summary.fields,
  };
}

/**
 * Stable content fingerprint for one exact public text.
 *
 * WHAT IT IS: a deterministic 32-bit FNV-1a hash of `version\0title\0description`.
 * The publish acknowledgement is bound to this value, so a checkbox ticked for
 * an earlier version of the draft cannot authorise a later edit.
 *
 * WHAT IT IS NOT: it is **not** server-issued, **not** signed or MACed, and it
 * is **not** proof that a human read anything. It is computed from text the
 * client already has, so anyone can compute it too; its only guarantee is
 * accidental-staleness detection. (Forging it gains nothing, because the server
 * recomputes it from the stored draft and the real control is the stored
 * `text_reviewed_at` acknowledgement.)
 *
 * If tamper evidence is ever required, replace this with an HMAC over the text
 * using a server-held key, and change `TEXT_REVIEW_TOKEN_KIND` accordingly.
 */
export function publicTextFingerprint(input: {
  title: string;
  description: string;
}): string {
  const payload = `${TEXT_REVIEW_VERSION}\u0000${input.title}\u0000${input.description}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${TEXT_REVIEW_VERSION}-${hash.toString(16).padStart(8, "0")}`;
}

/** Backwards-compatible alias; the value is a fingerprint, not a signed token. */
export const publicTextReviewToken = publicTextFingerprint;

export const TEXT_REVIEW_TOKEN_KIND = "unsigned-content-fingerprint" as const;

/** Kept explicit so no caller can describe this as a tamper-proof token. */
export const TEXT_REVIEW_TOKEN_IS_SIGNED = false;

export const TEXT_PRIVACY_LIMITATION =
  "자동 검사는 전화번호·이메일 등 정해진 형태만 찾는 보조 수단입니다. 이름, 주소, 손으로 쓴 숫자는 놓칠 수 있으므로 공개할 글을 직접 읽고 확인해야 합니다.";
