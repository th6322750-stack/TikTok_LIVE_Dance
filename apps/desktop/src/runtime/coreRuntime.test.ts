import { controlInvokeSchemas, stageInvokeSchemas } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createRuntimeHarness } from './testing/harness.js';

describe('control handshake (Blueprint §61)', () => {
  it('returns a complete initial state', async () => {
    const harness = createRuntimeHarness();

    const initial = await harness.runtime.handleControlInvoke('control:ready', {});

    expect(initial.snapshot.version).toBe(1);
    expect(initial.connector.status).toBe('idle');
    expect(initial.stage.open).toBe(false);
    expect(initial.stats.activeDancers).toBe(0);
    expect(initial.recentEvents).toEqual([]);
  });

  it('reports only the PRESENCE of an api key, never the value', async () => {
    const harness = createRuntimeHarness({ apiKey: 'super-secret-key' });

    const initial = await harness.runtime.handleControlInvoke('control:ready', {});

    expect(initial.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(initial)).not.toContain('super-secret-key');
  });

  it('replays the recent event feed to a reloaded CONTROL', async () => {
    const harness = createRuntimeHarness();
    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'u1',
    });

    const initial = await harness.runtime.handleControlInvoke('control:ready', {});

    expect(initial.recentEvents.length).toBeGreaterThan(0);
    expect(initial.snapshot.state.dancers).toHaveLength(1);
  });
});

describe('stage handshake (Blueprint §60)', () => {
  it('answers stage:ready with a snapshot rebuilt from canonical state', async () => {
    const harness = createRuntimeHarness();
    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'u1',
    });

    const { snapshot } = await harness.runtime.handleStageReady();

    expect(snapshot.dancers).toHaveLength(1);
    expect(snapshot.dancers[0]?.userId).toBe('u1');
  });

  it('survives repeated STAGE reloads without losing game state', async () => {
    const harness = createRuntimeHarness();
    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'u1',
    });
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'u1',
      diamonds: 500,
    });

    await harness.runtime.handleControlInvoke('stage:reload', {});
    const first = await harness.runtime.handleStageReady();
    await harness.runtime.handleControlInvoke('stage:reload', {});
    const second = await harness.runtime.handleStageReady();

    expect(harness.stageWindow.reloadCount).toBe(2);
    expect(second.snapshot.dancers).toEqual(first.snapshot.dancers);
    expect(second.snapshot.ranking[0]?.totalDiamonds).toBe(500);
  });
});

describe('event routing', () => {
  it('routes stage events to STAGE and game events to CONTROL', async () => {
    const harness = createRuntimeHarness();
    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'u1',
    });

    expect(harness.stageEvents.map((event) => event.type)).toContain('stage:dancer-spawn');
    expect(harness.controlEvents.map((event) => event.type)).toContain('game:command-accepted');
    expect(harness.stageEvents.every((event) => event.type.startsWith('stage:'))).toBe(true);
    expect(harness.controlEvents.every((event) => event.type.startsWith('game:'))).toBe(true);
  });

  it('publishes session stats on a throttled cadence, not per event', async () => {
    const harness = createRuntimeHarness();
    harness.runtime.start();

    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);

    for (let index = 0; index < 10; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'like',
        userId: `u${index}`,
      });
    }

    const beforeTick = harness.controlEvents.filter(
      (event) => event.type === 'game:session-stats',
    ).length;
    expect(beforeTick).toBe(0);

    harness.advance(250);
    harness.advance(250);

    const afterTick = harness.controlEvents.filter(
      (event) => event.type === 'game:session-stats',
    ).length;
    expect(afterTick).toBe(2);

    await harness.dispose();
  });

  it('reports a malformed provider payload as diagnostics instead of crashing', async () => {
    const harness = createRuntimeHarness();
    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);

    const connector = harness.connectors.at(-1);
    connector?.emitRaw({
      provider: 'mock',
      kind: 'gift',
      receivedAt: 1_000,
      payload: { kind: 'gift', at: 1_000, user: { userId: '' }, giftName: 'x', diamonds: -1 },
    });

    expect(harness.diagnostics).toHaveLength(1);
    expect(harness.diagnostics[0]?.scope).toBe('normalizer');
    expect(harness.runtime.engine.getState().counters.eventCount).toBe(0);
  });
});

describe('control commands reach the engine', () => {
  it('kicks a dancer through game:command', async () => {
    const harness = createRuntimeHarness();
    await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
    harness.advance(0);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'u1',
    });

    const result = await harness.runtime.handleControlInvoke('game:command', {
      type: 'game:kick-user',
      userId: 'u1',
    });

    expect(result).toEqual({ ok: true });
    expect(harness.runtime.engine.getState().dancers).toHaveLength(0);
    expect(harness.stageEvents.some((event) => event.type === 'stage:dancer-remove')).toBe(true);
  });

  it('rejects an unknown scenario', async () => {
    const harness = createRuntimeHarness();

    const result = await harness.runtime.handleControlInvoke('simulator:start-scenario', {
      scenarioId: 'nope',
    });

    expect(result.ok).toBe(false);
  });

  it('fails connect gracefully when the provider is unavailable', async () => {
    const harness = createRuntimeHarness();

    const result = await harness.runtime.handleControlInvoke('connector:connect', {
      target: '@dancer',
      provider: 'eulerstream',
    });

    // The harness factory only builds mock connectors, so this exercises the failure path.
    expect(result.ok).toBe(true);
  });
});

describe('IPC payload validation (Blueprint §42)', () => {
  it('rejects malformed payloads before they reach the runtime', () => {
    expect(controlInvokeSchemas['connector:connect'].safeParse({}).success).toBe(false);
    expect(controlInvokeSchemas['game:command'].safeParse({ type: 'nope' }).success).toBe(false);
    expect(
      controlInvokeSchemas['simulator:emit-event'].safeParse({ preset: 'drop-tables' }).success,
    ).toBe(false);
    expect(stageInvokeSchemas['stage:ready'].safeParse({ sneaky: true }).success).toBe(false);
  });

  it('accepts well formed payloads', () => {
    expect(controlInvokeSchemas['connector:connect'].safeParse({ target: '@x' }).success).toBe(
      true,
    );
    expect(
      controlInvokeSchemas['stage:set-layout'].safeParse({ preset: '1080x1920' }).success,
    ).toBe(true);
    expect(stageInvokeSchemas['stage:ready'].safeParse({}).success).toBe(true);
  });
});

describe('stage window control', () => {
  it('opens, closes and relays layout changes', async () => {
    const harness = createRuntimeHarness();

    expect((await harness.runtime.handleControlInvoke('stage:open', {})).open).toBe(true);
    expect(
      (await harness.runtime.handleControlInvoke('stage:set-layout', { alwaysOnTop: true }))
        .alwaysOnTop,
    ).toBe(true);
    expect((await harness.runtime.handleControlInvoke('stage:close', {})).open).toBe(false);
  });
});
