/**
 * Hard limits that protect the process from oversized or malicious input.
 *
 * Deliberately free of Node imports: client components need the numeric limits
 * (for maxLength, counters) without pulling `node:fs` into the browser bundle.
 */
export const LIMITS = {
  uploadMaxBytes: 8 * 1024 * 1024,
  imageMaxPixels: 24_000_000,
  imageMinSide: 32,
  maxImageSide: 4096,
  maxDescriptionLength: 2_000,
  maxTitleLength: 120,
  maxMasks: 40,
  maxEvidenceNoteLength: 500,
  maxDraftLength: 6_000,
} as const;
