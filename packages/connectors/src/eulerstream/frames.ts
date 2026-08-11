/**
 * EulerStream frame decoding.
 *
 * The gateway defaults to `features.bundleEvents=true`, so a single WebSocket frame carries a
 * BUNDLE of messages:
 *
 *   { timestamp, messages: [ { type, data }, { type, data }, … ] }   // ClientMessageBundle
 *
 * Reading only a top-level `{type,data}` would silently drop every message after the first on the
 * default production gateway. Both shapes are therefore supported, and bundle order is preserved
 * because gameplay depends on it (a GO must be processed before the gift that follows it).
 */

import type { ClientMessageBundle } from '@eulerstream/euler-websocket-sdk';

/** Compile-time check that our reader matches the SDK's published bundle shape. */
type BundleShapeCheck = ClientMessageBundle extends { timestamp: number; messages: unknown[] }
  ? true
  : never;
const _bundleShapeMatchesSdk: BundleShapeCheck = true;
void _bundleShapeMatchesSdk;

export interface DecodedFrameMessage {
  /** Provider message type, e.g. `WebcastChatMessage`. */
  readonly kind: string;
  /** Untrusted message body — only the normalizer may interpret it. */
  readonly payload: unknown;
}

export interface DecodedFrame {
  readonly messages: DecodedFrameMessage[];
  /** Frame-level problems worth logging; never thrown, never fatal. */
  readonly errors: string[];
  /** Bundle timestamp when the gateway supplied one. */
  readonly timestamp?: number;
}

/** Frames the connector consumes itself instead of forwarding. */
const TRANSPORT_ONLY_KINDS = new Set(['ping', 'pong', 'ack', 'heartbeat']);

export function isTransportOnlyKind(kind: string): boolean {
  return TRANSPORT_ONLY_KINDS.has(kind);
}

/**
 * Parses one raw WebSocket frame.
 *
 * Never throws: a malformed frame is a provider concern and must not take the connector down.
 */
export function decodeFrame(data: string): DecodedFrame {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return { messages: [], errors: ['frame is not valid JSON'] };
  }

  return decodeParsedFrame(parsed);
}

export function decodeParsedFrame(parsed: unknown): DecodedFrame {
  const record = asRecord(parsed);
  if (record === undefined) return { messages: [], errors: ['frame is not an object'] };

  const bundle = readBundle(record);
  if (bundle !== undefined) {
    const messages: DecodedFrameMessage[] = [];
    const errors: string[] = [];

    // Order is preserved: index i of the bundle reaches the engine before index i+1.
    for (const [index, entry] of bundle.messages.entries()) {
      const message = readMessage(entry);
      if (message === undefined) {
        errors.push(`bundle message ${index} has no message type`);
        continue;
      }
      messages.push(message);
    }

    return {
      messages,
      errors,
      ...(typeof bundle.timestamp === 'number' ? { timestamp: bundle.timestamp } : {}),
    };
  }

  const single = readMessage(record);
  if (single !== undefined) return { messages: [single], errors: [] };

  return { messages: [], errors: ['frame has neither a message bundle nor a message type'] };
}

/** A bundle we can iterate: `messages` is always present, `timestamp` only when supplied. */
interface ReadableBundle {
  readonly messages: readonly unknown[];
  readonly timestamp?: number;
}

/** Accepts `{messages:[…]}` and the nested `{data:{messages:[…]}}` variant. */
function readBundle(record: Record<string, unknown>): ReadableBundle | undefined {
  if (Array.isArray(record.messages)) {
    return {
      messages: record.messages,
      ...(typeof record.timestamp === 'number' ? { timestamp: record.timestamp } : {}),
    };
  }

  const nested = asRecord(record.data);
  if (nested !== undefined && Array.isArray(nested.messages)) {
    return {
      messages: nested.messages,
      ...(typeof nested.timestamp === 'number'
        ? { timestamp: nested.timestamp }
        : typeof record.timestamp === 'number'
          ? { timestamp: record.timestamp }
          : {}),
    };
  }

  return undefined;
}

function readMessage(value: unknown): DecodedFrameMessage | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;

  const kind = readKind(record);
  if (kind === undefined) return undefined;

  return { kind, payload: readPayload(record) };
}

/** Message type under any of the field names the gateway and its examples use. */
function readKind(record: Record<string, unknown>): string | undefined {
  for (const key of ['type', 'event', 'eventType', 'name', 'method']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return undefined;
}

/** The message body, tolerating gateways that nest it or send it flat. */
function readPayload(record: Record<string, unknown>): unknown {
  for (const key of ['data', 'payload', 'body']) {
    const value = record[key];
    if (typeof value === 'object' && value !== null) return value;
  }

  return record;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}
