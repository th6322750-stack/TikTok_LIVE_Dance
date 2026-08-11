/**
 * MockConnector (Blueprint §6, §53).
 *
 * Implements the same `LiveConnector` interface as the real provider so simulator traffic travels
 * the identical path: Connector → Normalizer → Core Engine. Nothing here may shortcut to STAGE.
 */

import type {
  ConnectorConfig,
  ConnectorStatus,
  ConnectorStatusEvent,
  LiveConnector,
  RawLiveEvent,
  Unsubscribe,
} from '@dance-arena/contracts';

import type { MockPayload } from '../normalizer/mock.js';
import { Emitter } from '../support/emitter.js';
import type { Scheduler } from '../support/scheduler.js';

export interface MockConnectorOptions {
  readonly scheduler: Scheduler;
  /** Simulated connect latency, so CONTROL can exercise the `connecting → connected` transition. */
  readonly connectDelayMs?: number;
}

export class MockConnector implements LiveConnector {
  readonly provider = 'mock';

  private status: ConnectorStatus = 'idle';
  private target: string | undefined;
  private viewerCount = 0;

  private readonly events = new Emitter<RawLiveEvent>();
  private readonly statuses = new Emitter<ConnectorStatusEvent>();

  constructor(private readonly options: MockConnectorOptions) {}

  connect(config: ConnectorConfig): Promise<void> {
    this.target = config.target;
    this.setStatus('connecting');

    const delay = this.options.connectDelayMs ?? 0;

    // Without a configured latency, connect completes immediately. Scheduling a 0ms task instead
    // would deadlock any caller that awaits connect() while driving a virtual-time scheduler.
    if (delay <= 0) {
      this.setStatus('connected');
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.options.scheduler.schedule(delay, () => {
        this.setStatus('connected');
        resolve();
      });
    });
  }

  disconnect(): Promise<void> {
    this.setStatus('disconnecting');
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

  /**
   * Injects a synthetic provider payload.
   *
   * The payload is the MOCK PROVIDER's shape — it still has to pass the normalizer before the
   * engine sees it, which is the whole point of routing the simulator through a connector.
   */
  emit(payload: MockPayload): void {
    if (this.status !== 'connected') return;

    this.events.emit({
      provider: 'mock',
      kind: payload.kind,
      receivedAt: this.options.scheduler.now(),
      payload,
    });
  }

  /** Emits a payload regardless of connection state — used by unit tests only. */
  emitRaw(raw: RawLiveEvent): void {
    this.events.emit(raw);
  }

  setViewerCount(viewerCount: number): void {
    this.viewerCount = viewerCount;
    this.publishStatus();
  }

  private setStatus(status: ConnectorStatus): void {
    this.status = status;
    this.publishStatus();
  }

  private publishStatus(): void {
    this.statuses.emit({
      provider: 'mock',
      status: this.status,
      at: this.options.scheduler.now(),
      ...(this.target === undefined ? {} : { target: this.target }),
      ...(this.viewerCount > 0 ? { room: { viewerCount: this.viewerCount } } : {}),
    });
  }
}
