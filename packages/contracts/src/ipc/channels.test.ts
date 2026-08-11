import { describe, expect, it } from 'vitest';

import { ConnectorStatusEventSchema } from '../connector.js';
import { StageEventSchema, StageSnapshotSchema } from '../stage/events.js';
import {
  CONTROL_INVOKE_CHANNELS,
  CONTROL_PUSH_CHANNELS,
  controlInvokeSchemas,
  STAGE_INVOKE_CHANNELS,
  STAGE_PUSH_CHANNELS,
  type ControlInvokeChannel,
} from './channels.js';

const NAMESPACES = [
  'app:',
  'connector:',
  'game:',
  'stage:',
  'settings:',
  'assets:',
  'license:',
  'diagnostics:',
  'simulator:',
  'control:',
];

describe('IPC channel naming', () => {
  it('namespaces every channel (Blueprint §38)', () => {
    const channels = [
      ...CONTROL_INVOKE_CHANNELS,
      ...CONTROL_PUSH_CHANNELS,
      ...STAGE_INVOKE_CHANNELS,
      ...STAGE_PUSH_CHANNELS,
    ];

    expect(channels.length).toBeGreaterThan(0);
    for (const channel of channels) {
      expect(NAMESPACES.some((namespace) => channel.startsWith(namespace))).toBe(true);
    }
  });

  it('exposes a request schema for every CONTROL invoke channel', () => {
    for (const channel of CONTROL_INVOKE_CHANNELS) {
      expect(controlInvokeSchemas[channel]).toBeDefined();
    }
  });
});

describe('IPC request validation', () => {
  it('accepts a well formed connect request without a credential', () => {
    const schema = controlInvokeSchemas['connector:connect'];

    expect(schema.parse({ target: '@dancer' })).toEqual({ target: '@dancer' });
  });

  it('drops an apiKey a renderer tries to smuggle through the connect request', () => {
    const parsed = controlInvokeSchemas['connector:connect'].parse({
      target: '@dancer',
      apiKey: 'super-secret',
    });

    expect(parsed).not.toHaveProperty('apiKey');
  });

  it('rejects a connect request with an empty target', () => {
    expect(controlInvokeSchemas['connector:connect'].safeParse({ target: '' }).success).toBe(false);
  });

  it('rejects unknown keys on empty-payload channels', () => {
    const channel: ControlInvokeChannel = 'control:ready';

    expect(controlInvokeSchemas[channel].safeParse({}).success).toBe(true);
    expect(controlInvokeSchemas[channel].safeParse({ evil: true }).success).toBe(false);
  });

  it('rejects a malformed control command', () => {
    const schema = controlInvokeSchemas['game:command'];

    expect(schema.safeParse({ type: 'game:kick-user', userId: 'u1' }).success).toBe(true);
    expect(schema.safeParse({ type: 'game:kick-user' }).success).toBe(false);
    expect(schema.safeParse({ type: 'game:drop-database' }).success).toBe(false);
  });

  it('enforces the 1..30 dancer bound from Blueprint §64', () => {
    const schema = controlInvokeSchemas['game:command'];

    expect(schema.safeParse({ type: 'game:set-max-dancers', maxDancers: 30 }).success).toBe(true);
    expect(schema.safeParse({ type: 'game:set-max-dancers', maxDancers: 31 }).success).toBe(false);
    expect(schema.safeParse({ type: 'game:set-max-dancers', maxDancers: 0 }).success).toBe(false);
  });
});

describe('stage payload roundtrip', () => {
  const snapshot = {
    version: 1 as const,
    generatedAt: 1_700_000_000_000,
    sessionId: 'session-1',
    dancers: [
      {
        dancerId: 'dancer-1',
        userId: 'user-1',
        slotId: 'normal-01',
        zone: 'normal' as const,
        costumeId: 'default',
        position: { x: 0.5, y: 0.6 },
        status: 'active' as const,
        nickname: 'Dancer One',
        rank: 1,
      },
    ],
    ranking: [{ rank: 1, userId: 'user-1', nickname: 'Dancer One', totalDiamonds: 500 }],
    partyGoal: { enabled: true, current: 500, target: 1000, completedCount: 0 },
  };

  it('roundtrips a stage snapshot through JSON', () => {
    const parsed = StageSnapshotSchema.parse(snapshot);
    const roundtripped = StageSnapshotSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundtripped).toEqual(parsed);
  });

  it('roundtrips a stage event and discriminates on type', () => {
    const event = StageEventSchema.parse({
      type: 'stage:gift-effect',
      at: 1_700_000_000_500,
      userId: 'user-1',
      giftName: 'Universe',
      diamonds: 1500,
      tierId: 'tier-5',
      effectPreset: 'mega-cosmic',
      durationMs: 8000,
      priority: 5,
    });

    expect(event.type).toBe('stage:gift-effect');
    expect(StageEventSchema.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });

  it('rejects a normalized position outside 0..1', () => {
    const result = StageEventSchema.safeParse({
      type: 'stage:dancer-move',
      at: 1,
      dancerId: 'dancer-1',
      slotId: 'normal-02',
      zone: 'normal',
      position: { x: 1.4, y: 0.2 },
    });

    expect(result.success).toBe(false);
  });
});

describe('connector status payload', () => {
  it('carries room stats without turning them into a gameplay event', () => {
    const parsed = ConnectorStatusEventSchema.parse({
      provider: 'eulerstream',
      status: 'connected',
      at: 1_700_000_000_000,
      target: '@dancer',
      room: { viewerCount: 1200 },
    });

    expect(parsed.room?.viewerCount).toBe(1200);
  });

  it('rejects an unknown status value', () => {
    expect(
      ConnectorStatusEventSchema.safeParse({
        provider: 'eulerstream',
        status: 'kinda-connected',
        at: 1,
      }).success,
    ).toBe(false);
  });
});
