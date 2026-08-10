/**
 * Defensive readers for untrusted provider payloads.
 *
 * Provider schemas drift and vary by message version (`diamond_count` vs `diamondCount` vs
 * `gift.diamond_count`). These helpers read the first field that exists with a usable type,
 * so an adapter can express "any of these names" without `as any` casts or optional-chaining
 * pyramids (Blueprint §76: provider concerns stay in the adapter).
 */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}

/** Follows a dotted path, returning undefined at the first missing/invalid hop. */
function readPath(source: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return source[path];

  let current: unknown = source;
  for (const segment of path.split('.')) {
    const record = asRecord(current);
    if (record === undefined) return undefined;
    current = record[segment];
  }

  return current;
}

export function readString(
  source: Record<string, unknown> | undefined,
  ...paths: string[]
): string | undefined {
  if (source === undefined) return undefined;

  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    // Numeric ids arrive as numbers surprisingly often; accept them as identity strings.
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'bigint') return value.toString();
  }

  return undefined;
}

/**
 * Reads a string WITHOUT trimming.
 *
 * Used for user-authored content (comments) where the original text is part of the contract;
 * `readString` trims because ids and names must not carry stray whitespace.
 */
export function readRawString(
  source: Record<string, unknown> | undefined,
  ...paths: string[]
): string | undefined {
  if (source === undefined) return undefined;

  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'string') return value;
  }

  return undefined;
}

export function readNumber(
  source: Record<string, unknown> | undefined,
  ...paths: string[]
): number | undefined {
  if (source === undefined) return undefined;

  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return undefined;
}

export function readBoolean(
  source: Record<string, unknown> | undefined,
  ...paths: string[]
): boolean | undefined {
  if (source === undefined) return undefined;

  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'boolean') return value;
    // Providers encode flags as 0/1 or "true"/"false" depending on the message version.
    if (typeof value === 'number') return value !== 0;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  return undefined;
}

export function readRecord(
  source: Record<string, unknown> | undefined,
  ...paths: string[]
): Record<string, unknown> | undefined {
  if (source === undefined) return undefined;

  for (const path of paths) {
    const record = asRecord(readPath(source, path));
    if (record !== undefined) return record;
  }

  return undefined;
}

/** Non-negative integer, clamped — provider counts must never poison the engine with NaN. */
export function toCount(value: number | undefined, fallback = 0): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;

  return Math.max(0, Math.trunc(value));
}
