/**
 * EulerStreamConnector (Blueprint §6–§8).
 *
 * Responsibility, and nothing beyond it:
 *   connect / authenticate / listen / heartbeat / reconnect / parse transport frame / emit raw.
 *
 * It has no idea what a gift is worth, who is VIP or what a queue is. Diamonds, ranking and stage
 * effects are the Core Engine's business (Blueprint §6).
 *
 * SECURITY: the API key is used to build the connection url and is never logged, never included
 * in a status event and never sent to a renderer (Blueprint §45).
 */

import type {
  ConnectorConfig,
  ConnectorStatus,
  ConnectorStatusEvent,
  LiveConnector,
  RawLiveEvent,
  Unsubscribe,
} from '@dance-arena/contracts';

import { Emitter } from '../support/emitter.js';
import type { Scheduler } from '../support/scheduler.js';
import { computeBackoffDelay } from './backoff.js';
import {
  createWebSocketTransport,
  redactUrl,
  type Transport,
  type TransportConnection,
} from './transport.js';

export const DEFAULT_EULERSTREAM_ENDPOINT = 'wss://ws.eulerstream.com';

export interface EulerStreamConnectorOptions {
  readonly scheduler: Scheduler;
  readonly transport?: Transport;
  /** Injected entropy for reconnect jitter; defaults to Math.random. */
  readonly random?: () => number;
  /** 0 disables the heartbeat. */
  readonly heartbeatIntervalMs?: number;
  readonly maxReconnectAttempts?: number;
  /** Structured logger; receives redacted messages only. */
  readonly log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export class EulerStreamConnector implements LiveConnector {
  readonly provider = 'eulerstream';

  private status: ConnectorStatus = 'idle';
  private connection: TransportConnection | undefined;
  private config: ConnectorConfig | undefined;
  private attempt = 0;
  private intentionalDisconnect = false;
  private cancelReconnect: (() => void) | undefined;
  private cancelHeartbeat: (() => void) | undefined;
  private openResolvers: { resolve: () => void; reject: (error: Error) => void } | undefined;

  private readonly events = new Emitter<RawLiveEvent>();
  private readonly statuses = new Emitter<ConnectorStatusEvent>();
  private readonly transport: Transport;
  private readonly random: () => number;

  constructor(private readonly options: EulerStreamConnectorOptions) {
    this.transport = options.transport ?? createWebSocketTransport();
    this.random = options.random ?? Math.random;
  }

  connect(config: ConnectorConfig): Promise<void> {
    this.config = config;
    this.intentionalDisconnect = false;
    this.attempt = 0;

    return new Promise<void>((resolve, reject) => {
      this.openResolvers = { resolve, reject };
      this.openSocket();
    });
  }

  disconnect(): Promise<void> {
    // Intentional disconnect must NEVER trigger the reconnect loop (Task 07 requirement).
    this.intentionalDisconnect = true;
    this.cancelReconnect?.();
    this.cancelReconnect = undefined;
    this.stopHeartbeat();

    this.setStatus('disconnecting');
    this.connection?.close();
    this.connection = undefined;
    this.setStatus('idle');

    return Promise.resolve();
  }

  onEvent(callback: (event: RawLiveEvent) => void): Unsubscribe {
    return this.events.on(callback);
  }

  onStatus(callback: (status: ConnectorStatusEvent) => void): Unsubscribe {
    return this.statuses.on(callback);
  }

  getStatus(): ConnectorStatus {
    return this.status;
  }

  /** Reconnect attempts performed since the last successful connect. */
  get reconnectAttempts(): number {
    return this.attempt;
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────

  private buildUrl(config: ConnectorConfig): string {
    const endpoint = config.endpoint ?? DEFAULT_EULERSTREAM_ENDPOINT;
    const url = new URL(endpoint);

    url.searchParams.set('uniqueId', config.target.replace(/^@/, ''));
    if (config.apiKey !== undefined && config.apiKey.length > 0) {
      url.searchParams.set('apiKey', config.apiKey);
    }

    return url.toString();
  }

  private openSocket(): void {
    const config = this.config;
    if (config === undefined) return;

    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const url = this.buildUrl(config);
    this.log('info', `connecting to ${redactUrl(url)}`);

    try {
      this.connection = this.transport.connect(url, {
        onOpen: () => this.handleOpen(),
        onMessage: (data) => this.handleMessage(data),
        onClose: (code, reason) => this.handleClose(code, reason),
        onError: (message) => this.handleError(message),
      });
    } catch (error) {
      this.handleError(error instanceof Error ? error.message : 'transport failed to open');
    }
  }

  private handleOpen(): void {
    this.attempt = 0;
    this.setStatus('connected');
    this.startHeartbeat();

    this.openResolvers?.resolve();
    this.openResolvers = undefined;
  }

  private handleMessage(data: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(data);
    } catch {
      // A frame we cannot parse is a provider concern, not a crash (Task 07: no crash on garbage).
      this.log('warn', 'dropped unparseable transport frame');
      return;
    }

    const kind = readKind(parsed);
    if (kind === undefined) {
      this.log('warn', 'dropped transport frame without a message type');
      return;
    }

    // Heartbeat/ack frames stay inside the connector.
    if (kind === 'pong' || kind === 'ping' || kind === 'ack') return;

    this.events.emit({
      provider: 'eulerstream',
      kind,
      receivedAt: this.options.scheduler.now(),
      payload: readPayload(parsed),
    });
  }

  private handleClose(code: number, reason: string): void {
    this.stopHeartbeat();
    this.connection = undefined;

    if (this.intentionalDisconnect) return;

    this.log('warn', `connection closed (${code}) ${reason}`);
    this.scheduleReconnect(`closed: ${code}`);
  }

  private handleError(message: string): void {
    this.stopHeartbeat();

    if (this.openResolvers !== undefined && this.attempt === 0) {
      // Surface the first failure to the caller; later failures live in the reconnect loop.
      this.openResolvers.reject(new Error(message));
      this.openResolvers = undefined;
    }

    if (this.intentionalDisconnect) return;

    this.setStatus('error', { reason: message });
    this.scheduleReconnect(message);
  }

  private scheduleReconnect(reason: string): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? Number.POSITIVE_INFINITY;

    if (this.attempt >= maxAttempts) {
      this.setStatus('error', { reason: `giving up after ${this.attempt} attempts` });
      return;
    }

    const delay = computeBackoffDelay({ attempt: this.attempt, random: this.random() });
    this.attempt += 1;

    this.setStatus('reconnecting', { reason, attempt: this.attempt, nextRetryInMs: delay });

    this.cancelReconnect = this.options.scheduler.schedule(delay, () => {
      this.cancelReconnect = undefined;
      if (this.intentionalDisconnect) return;

      this.openSocket();
    });
  }

  private startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 0;
    if (interval <= 0) return;

    const tick = (): void => {
      this.cancelHeartbeat = this.options.scheduler.schedule(interval, () => {
        if (this.status !== 'connected') return;

        try {
          this.connection?.send(JSON.stringify({ type: 'ping' }));
        } catch {
          this.log('warn', 'heartbeat send failed');
        }
        tick();
      });
    };

    tick();
  }

  private stopHeartbeat(): void {
    this.cancelHeartbeat?.();
    this.cancelHeartbeat = undefined;
  }

  private setStatus(
    status: ConnectorStatus,
    extra: { reason?: string; attempt?: number; nextRetryInMs?: number } = {},
  ): void {
    this.status = status;

    this.statuses.emit({
      provider: 'eulerstream',
      status,
      at: this.options.scheduler.now(),
      ...(this.config === undefined ? {} : { target: this.config.target }),
      ...(extra.reason === undefined ? {} : { reason: extra.reason }),
      ...(extra.attempt === undefined ? {} : { attempt: extra.attempt }),
      ...(extra.nextRetryInMs === undefined ? {} : { nextRetryInMs: extra.nextRetryInMs }),
    });
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.options.log?.(level, message);
  }
}

/** Message kind under any of the field names providers use. */
function readKind(frame: unknown): string | undefined {
  if (typeof frame !== 'object' || frame === null) return undefined;

  const record = frame as Record<string, unknown>;
  for (const key of ['type', 'event', 'eventType', 'name', 'method']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return undefined;
}

/** The payload envelope, tolerating providers that nest it or send it flat. */
function readPayload(frame: unknown): unknown {
  if (typeof frame !== 'object' || frame === null) return frame;

  const record = frame as Record<string, unknown>;
  for (const key of ['data', 'payload', 'body']) {
    const value = record[key];
    if (typeof value === 'object' && value !== null) return value;
  }

  return frame;
}
