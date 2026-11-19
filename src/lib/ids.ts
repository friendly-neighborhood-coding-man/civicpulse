import crypto from "node:crypto";

// Ambiguous characters (0/o/1/l/i) are excluded so ids survive copy-paste.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function publicId(prefix: string, length = 10): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}

export function internalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Ids that appear in URLs are validated before any lookup. */
export function isPublicId(value: string, prefix: string): boolean {
  return new RegExp(`^${prefix}_[${ALPHABET}]{6,32}$`).test(value);
}
