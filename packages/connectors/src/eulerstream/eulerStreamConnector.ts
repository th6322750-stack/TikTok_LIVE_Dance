/**
 * EulerStreamConnector (Blueprint §6–§8).
 *
 * Responsibility, and nothing beyond it:
 *   connect / authenticate / listen / heartbeat / reconnect / parse transport frame / emit raw.
 *
 * It has no idea what a gift is worth, who is VIP or what a queue is. Diamonds, ranking and stage
 * effects are the Core Engine's business (Blueprint §6).
 *
 * LIFECYCLE SAFETY
 * - Every socket carries a generation number. Callbacks from a superseded socket are ignored, so a
 *   late `close` from an old socket can never mutate the state of the current one.
 * - `error` followed by `close` schedules exactly ONE reconnect (`reconnectPending`).
 * - The initial `connect()` promise is always settled — including when the socket closes or errors
 *   before it ever opened.
 * - Documented terminal close codes (invalid auth, no permission, not live, stream ended) stop the
 *   loop instead of retrying forever.
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
import { createWebSocketUrl, SchemaVersion } from '@eulerstream/euler-websocket-sdk';

import { Emitter } from '../support/emitter.js';
import type { Scheduler } from '../support/scheduler.js';
import { computeBackoffDelay } from './backoff.js';
import { describeCloseCode, isTerminalCloseCode } from './closeCodes.js';
import { decodeFrame, isTransportOnlyKind } from './frames.js';
import {
  createWebSocketTransport,
  redactUrl,
  type Transport,
  type TransportConnection,
} from './transport.js';

export const DEFAULT_EULERSTREAM_ENDPOINT = 'wss://ws.eulerstream.com';

/**
 * Gateway mode is PINNED rather than inherited from provider defaults, so a change of defaults
 * upstream cannot silently alter the frame shape we parse.
 */
export const EULERSTREAM_FEATURES = {
  /** Bundled frames (`{timestamp, messages[]}`) — the gateway default; handled by `decodeFrame`. */
  bundleEvents: true,
  /** We want the full gateway feature set, not raw pass-through. */
  rawMessages: false,
  /** Let the gateway accept `@handle`, plain handle and profile-url forms. */
  normalizeUniqueId: true,
  /** Protobuf schema version our normalizer was written against. */
  schemaVersion: SchemaVersion.v2,
} as const;

export interface EulerStreamConnectorOptions {
  readonly scheduler: Scheduler;
  readonly transport?: Transport;
  /** Injected entropy for reconnect jitter; defaults to Math.random. */
  readonly random?: () => number;
  /** 0 disables the app-level heartbeat (the gateway has its own inactivity timeout). */
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
  /** Incremented per socket; stale callbacks compare against it and bail. */
  private generation = 0;
  /** Guards against `error` and `close` both scheduling a reconnect for the same socket. */
  private reconnectPending = false;
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
    this.generation += 1; // orphan every in-flight socket callback
    this.clearReconnect();
    this.stopHeartbeat();

    this.setStatus('disconnecting');
    this.connection?.close();
    this.connection = undefined;

    this.settleConnect(new Error('disconnected before the connection was established'));
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

  /** Official SDK URL construction, with every feature flag pinned explicitly. */
  private buildUrl(config: ConnectorConfig): string {
    const url = createWebSocketUrl({
      uniqueId: config.target,
      ...(config.apiKey === undefined || config.apiKey.length === 0
        ? {}
        : { apiKey: config.apiKey }),
      features: { ...EULERSTREAM_FEATURES },
    });

    if (config.endpoint === undefined) return url;

    // Custom gateway (self-hosted / test): keep the officially built query string.
    const official = new URL(url);
    const override = new URL(config.endpoint);
    override.search = official.search;
    return override.toString();
  }

  private openSocket(): void {
    const config = this.config;
    if (config === undefined) return;

    this.generation += 1;
    const generation = this.generation;

    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const url = this.buildUrl(config);
    this.log('info', `connecting to ${redactUrl(url)}`);

    try {
      this.connection = this.transport.connect(url, {
        onOpen: () => this.handleOpen(generation),
        onMessage: (data) => this.handleMessage(generation, data),
        onClose: (code, reason) => this.handleClose(generation, code, reason),
        onError: (message) => this.handleError(generation, message),
      });
    } catch (error) {
      this.handleError(
        generation,
        error instanceof Error ? error.message : 'transport failed to open',
      );
    }
  }

  /** True when the callback belongs to the socket we currently care about. */
  private isCurrent(generation: number): boolean {
    return generation === this.generation && !this.intentionalDisconnect;
  }

  private handleOpen(generation: number): void {
    if (!this.isCurrent(generation)) return;

    this.attempt = 0;
    this.reconnectPending = false;
    this.setStatus('connected');
    this.startHeartbeat();

    this.openResolvers?.resolve();
    this.openResolvers = undefined;
  }

  private handleMessage(generation: number, data: string): void {
    if (!this.isCurrent(generation)) return;

    const frame = decodeFrame(data);

    for (const error of frame.errors) this.log('warn', `dropped frame: ${error}`);

    const receivedAt = this.options.scheduler.now();

    // Bundle order is preserved so the engine sees events in the order TikTok produced them.
    for (const message of frame.messages) {
      if (isTransportOnlyKind(message.kind)) continue;

      this.events.emit({
        provider: 'eulerstream',
        kind: message.kind,
        receivedAt,
        payload: message.payload,
      });
    }
  }

  private handleClose(generation: number, code: number, reason: string): void {
    if (!this.isCurrent(generation)) return;

    this.stopHeartbeat();
    this.connection = undefined;

    const description = describeCloseCode(code, reason);

    if (isTerminalCloseCode(code)) {
      this.log('warn', `connection closed permanently: ${description}`);
      this.setStatus('error', { reason: description });
      this.settleConnect(new Error(description));
      return;
    }

    this.log('warn', `connection closed: ${description}`);
    this.scheduleReconnect(description);

    // The first attempt never opened: settle the caller now and let the retry loop continue in
    // the background, reporting progress through status events.
    this.settleConnect(new Error(description));
  }

  private handleError(generation: number, message: string): void {
    if (!this.isCurrent(generation)) return;

    this.stopHeartbeat();

    this.setStatus('error', { reason: message });
    this.scheduleReconnect(message);
    this.settleConnect(new Error(message));
  }

  /**
   * Schedules at most one reconnect per dropped socket. `error` immediately followed by `close`
   * is the normal browser/Node sequence and must not produce two pending timers.
   */
  private scheduleReconnect(reason: string): void {
    if (this.intentionalDisconnect || this.reconnectPending) return;

    const maxAttempts = this.options.maxReconnectAttempts ?? Number.POSITIVE_INFINITY;

    if (this.attempt >= maxAttempts) {
      const message = `giving up after ${this.attempt} attempts`;
      this.setStatus('error', { reason: message });
      this.settleConnect(new Error(message));
      return;
    }

    const delay = computeBackoffDelay({ attempt: this.attempt, random: this.random() });
    this.attempt += 1;
    this.reconnectPending = true;

    this.setStatus('reconnecting', { reason, attempt: this.attempt, nextRetryInMs: delay });

    this.cancelReconnect = this.options.scheduler.schedule(delay, () => {
      this.cancelReconnect = undefined;
      this.reconnectPending = false;
      if (this.intentionalDisconnect) return;

      this.openSocket();
    });
  }

  private clearReconnect(): void {
    this.cancelReconnect?.();
    this.cancelReconnect = undefined;
    this.reconnectPending = false;
  }

  /** Rejects a still-pending `connect()` so no caller is left awaiting forever. */
  private settleConnect(error: Error): void {
    if (this.openResolvers === undefined) return;

    const { reject } = this.openResolvers;
    this.openResolvers = undefined;
    reject(error);
  }

  private startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 0;
    if (interval <= 0) return;

    const generation = this.generation;

    const tick = (): void => {
      this.cancelHeartbeat = this.options.scheduler.schedule(interval, () => {
        if (!this.isCurrent(generation) || this.status !== 'connected') return;

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
