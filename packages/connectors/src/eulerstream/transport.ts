/// <reference lib="dom" />

/**
 * WebSocket transport port.
 *
 * The connector never touches a WebSocket constructor directly: the transport is injected, which
 * makes connect/close/error/reconnect paths testable without a network, and keeps the provider
 * connector free of any assumption about which runtime supplies `WebSocket`.
 */

export interface TransportHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(code: number, reason: string): void;
  onError(message: string): void;
}

export interface TransportConnection {
  send(data: string): void;
  close(): void;
}

export interface Transport {
  connect(url: string, handlers: TransportHandlers): TransportConnection;
}

/**
 * Transport backed by the host `WebSocket` (Electron Main / Node 22+).
 *
 * SECURITY: the url carries the API key as a query parameter, so it is never logged here or
 * anywhere else — only `redactUrl()` output may be logged (Blueprint §45, Task 07 security).
 */
export function createWebSocketTransport(): Transport {
  return {
    connect(url, handlers) {
      const socket = new WebSocket(url);

      socket.addEventListener('open', () => handlers.onOpen());
      socket.addEventListener('message', (event: MessageEvent) => {
        handlers.onMessage(typeof event.data === 'string' ? event.data : String(event.data));
      });
      socket.addEventListener('close', (event: CloseEvent) => {
        handlers.onClose(event.code, event.reason);
      });
      socket.addEventListener('error', () => handlers.onError('websocket error'));

      return {
        send: (data: string) => socket.send(data),
        close: () => socket.close(),
      };
    },
  };
}

/** Marker written in place of a credential. Plain text so url encoding cannot obscure it. */
export const REDACTED = 'REDACTED';

/** Strips credentials from a url so it can appear in logs and status events. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/key|token|secret|password|auth/i.test(key)) parsed.searchParams.set(key, REDACTED);
    }
    return parsed.toString();
  } catch {
    // Not a parseable url: never risk echoing raw credentials back.
    return 'REDACTED-URL';
  }
}
