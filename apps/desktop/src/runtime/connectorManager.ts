/**
 * ConnectorManager — owns the active LiveConnector and the raw → normalized boundary.
 *
 * It contains NO gameplay: it validates provider payloads through the normalizer and forwards the
 * resulting contract events to the engine (Blueprint §6, §9, §76).
 */

import {
  createNormalizerRegistry,
  MockConnector,
  type NormalizerRegistry,
  type Scheduler,
} from '@dance-arena/connectors';
import type {
  ConnectorConfig,
  ConnectorStatus,
  ConnectorStatusEvent,
  LiveConnector,
  LiveEvent,
  RawLiveEvent,
  Unsubscribe,
} from '@dance-arena/contracts';

export type ConnectorProvider = 'mock' | 'eulerstream';

export type ConnectorFactory = (provider: ConnectorProvider) => LiveConnector;

export interface ConnectorManagerOptions {
  readonly scheduler: Scheduler;
  readonly createConnector: ConnectorFactory;
  readonly normalizer?: NormalizerRegistry;
  /** Receives every successfully normalized event. */
  readonly onEvent: (event: LiveEvent) => void;
  readonly onStatus: (status: ConnectorStatusEvent) => void;
  /** Receives raw events too, for the session recorder / diagnostics. */
  readonly onRawEvent?: (raw: RawLiveEvent) => void;
  readonly onDropped?: (reason: string, detail: string | undefined) => void;
}

export class ConnectorManager {
  private connector: LiveConnector | undefined;
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly normalizer: NormalizerRegistry;
  private lastStatus: ConnectorStatusEvent;

  constructor(private readonly options: ConnectorManagerOptions) {
    this.normalizer = options.normalizer ?? createNormalizerRegistry();
    this.lastStatus = {
      provider: 'mock',
      status: 'idle',
      at: options.scheduler.now(),
    };
  }

  getStatus(): ConnectorStatusEvent {
    return this.lastStatus;
  }

  getConnector(): LiveConnector | undefined {
    return this.connector;
  }

  /** The mock connector, when it is the active one — used by the simulator. */
  getMockConnector(): MockConnector | undefined {
    return this.connector instanceof MockConnector ? this.connector : undefined;
  }

  async connect(provider: ConnectorProvider, config: ConnectorConfig): Promise<void> {
    await this.disconnect();

    const connector = this.options.createConnector(provider);
    this.connector = connector;

    this.subscriptions.push(
      connector.onEvent((raw) => {
        this.options.onRawEvent?.(raw);

        const result = this.normalizer.normalize(raw);
        if (!result.ok) {
          this.options.onDropped?.(result.reason, result.detail);
          return;
        }

        this.options.onEvent(result.event);
      }),
    );

    this.subscriptions.push(
      connector.onStatus((status) => {
        this.lastStatus = status;
        this.options.onStatus(status);
      }),
    );

    await connector.connect(config);
  }

  async disconnect(): Promise<void> {
    const connector = this.connector;
    if (connector === undefined) return;

    await connector.disconnect();

    for (const unsubscribe of this.subscriptions.splice(0, this.subscriptions.length)) {
      unsubscribe();
    }
    this.connector = undefined;
  }

  get currentStatus(): ConnectorStatus {
    return this.connector?.getStatus() ?? 'idle';
  }
}
