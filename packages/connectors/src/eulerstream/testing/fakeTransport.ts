/**
 * Fake WebSocket transport.
 *
 * Gives tests full control over open/message/close/error so the connector's status machine and
 * reconnect schedule can be verified deterministically, with no network and no real timers.
 */

import type { Transport, TransportConnection, TransportHandlers } from '../transport.js';

export interface FakeSocket {
  readonly url: string;
  readonly sent: string[];
  closed: boolean;
  open(): void;
  message(frame: unknown): void;
  rawMessage(data: string): void;
  serverClose(code?: number, reason?: string): void;
  error(message?: string): void;
}

export interface FakeTransport extends Transport {
  readonly sockets: FakeSocket[];
  readonly lastSocket: () => FakeSocket | undefined;
  /** Makes the next `connect()` call throw, simulating an immediate transport failure. */
  failNextConnect(message?: string): void;
}

export function createFakeTransport(): FakeTransport {
  const sockets: FakeSocket[] = [];
  let failNext: string | undefined;

  const transport: FakeTransport = {
    sockets,
    lastSocket: () => sockets.at(-1),
    failNextConnect(message = 'transport unavailable') {
      failNext = message;
    },

    connect(url: string, handlers: TransportHandlers): TransportConnection {
      if (failNext !== undefined) {
        const message = failNext;
        failNext = undefined;
        throw new Error(message);
      }

      const socket: FakeSocket = {
        url,
        sent: [],
        closed: false,
        open: () => handlers.onOpen(),
        message: (frame: unknown) => handlers.onMessage(JSON.stringify(frame)),
        rawMessage: (data: string) => handlers.onMessage(data),
        serverClose: (code = 1006, reason = 'abnormal') => handlers.onClose(code, reason),
        error: (message = 'socket error') => handlers.onError(message),
      };

      sockets.push(socket);

      return {
        send: (data: string) => socket.sent.push(data),
        close: () => {
          socket.closed = true;
        },
      };
    },
  };

  return transport;
}
