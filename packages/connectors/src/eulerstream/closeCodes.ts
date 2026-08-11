/**
 * Close-code policy (Blueprint §7/§8).
 *
 * Codes and messages come from the official SDK, so this stays in step with the gateway instead of
 * hard-coding numbers we guessed.
 *
 * TERMINAL means retrying cannot help: bad credentials, no permission, the streamer is not live,
 * the stream ended, or we closed the socket ourselves. Reconnecting on those would loop forever
 * and hammer the provider. Everything else is transient and goes through the backoff schedule.
 */

import { ClientCloseCode, CloseMessageMap } from '@eulerstream/euler-websocket-sdk';

const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set<number>([
  ClientCloseCode.NORMAL, // we asked for the close
  ClientCloseCode.INVALID_OPTIONS, // bad uniqueId / JWT — config problem
  ClientCloseCode.INVALID_AUTH, // bad API key
  ClientCloseCode.NO_PERMISSION, // key has no access to this creator
  ClientCloseCode.NOT_LIVE, // streamer is not live
  ClientCloseCode.STREAM_END, // the stream ended
]);

/**
 * Transient codes worth calling out explicitly. Anything not listed anywhere is treated as
 * transient too, so an unknown future code degrades to "retry with backoff" rather than
 * "give up silently".
 */
const TRANSIENT_CLOSE_CODES: ReadonlySet<number> = new Set<number>([
  ClientCloseCode.INTERNAL_SERVER_ERROR,
  ClientCloseCode.WEBCAST_FETCH_ERROR,
  ClientCloseCode.ROOM_INFO_FETCH_ERROR,
  ClientCloseCode.TIKTOK_CLOSED_CONNECTION,
  ClientCloseCode.TOO_MANY_CONNECTIONS,
  ClientCloseCode.NO_MESSAGES_TIMEOUT,
  ClientCloseCode.MAX_LIFETIME_EXCEEDED, // 8h lifetime: reconnecting starts a fresh window
]);

export function isTerminalCloseCode(code: number): boolean {
  return TERMINAL_CLOSE_CODES.has(code);
}

export function isKnownCloseCode(code: number): boolean {
  return TERMINAL_CLOSE_CODES.has(code) || TRANSIENT_CLOSE_CODES.has(code);
}

/** Human readable, credential-free description for status events and logs. */
export function describeCloseCode(code: number, fallbackReason = ''): string {
  const documented = (CloseMessageMap as Record<number, string | undefined>)[code];
  if (documented !== undefined && documented.length > 0) return documented;

  return fallbackReason.length > 0 ? fallbackReason : `connection closed (${code})`;
}

export { ClientCloseCode };
