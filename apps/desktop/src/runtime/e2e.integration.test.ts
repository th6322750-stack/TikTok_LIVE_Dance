/**
 * Task 08 — end-to-end vertical slice.
 *
 * Drives the REAL composition root:
 *
 *   Simulator / EulerStream → Connector → Normalizer → Core Engine → IPC sinks → CONTROL / STAGE
 *
 * Nothing is stubbed between the connector boundary and the renderer payloads. The only test
 * doubles are the platform edges: transport, scheduler, clock, stage window.
 */

import { EulerStreamConnector, type ManualScheduler } from '@dance-arena/connectors';
import { createFakeTransport } from '@dance-arena/connectors/testing';
import type { ControlEvent, LiveConnector, StageEvent } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { createRuntimeHarness, type RuntimeHarness } from './testing/harness.js';
import { createStageConsumer, type StageConsumer } from './testing/stageConsumer.js';

/** A STAGE consumer fed from the runtime's stage sink, exactly as Main feeds the STAGE window. */
function withStage(_harness: RuntimeHarness): StageConsumer {
  return createStageConsumer();
}

/** Feeds every stage event the runtime has emitted so far into the consumer. */
function drainStage(harness: RuntimeHarness, stage: StageConsumer, from = 0): number {
  const events: StageEvent[] = harness.stageEvents;
  for (let index = from; index < events.length; index += 1) {
    const event = events[index];
    if (event !== undefined) stage.applyEvent(event);
  }
  return events.length;
}

const controlEventsOf = (harness: RuntimeHarness, type: ControlEvent['type']): ControlEvent[] =>
  harness.controlEvents.filter((event) => event.type === type);

async function connectedHarness(): Promise<RuntimeHarness> {
  const harness = createRuntimeHarness();
  await harness.runtime.handleControlInvoke('connector:connect', { target: '@sim' });
  return harness;
}

describe('Flow 1 — join (Blueprint §69)', () => {
  it('turns a GO comment into a dancer on STAGE', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
      nickname: 'Mai Anh',
    });

    drainStage(harness, stage);

    // Canonical state
    const state = harness.runtime.engine.getState();
    expect(state.dancers).toHaveLength(1);
    expect(state.dancers[0]?.userId).toBe('viewer-1');
    expect(state.dancers[0]?.slotId).toBe('normal-01');

    // STAGE received a spawn carrying everything DancerView needs
    const dancer = stage.dancerFor('viewer-1');
    expect(dancer).toBeDefined();
    expect(dancer?.nickname).toBe('Mai Anh');
    expect(dancer?.position.x).toBeGreaterThanOrEqual(0);
    expect(dancer?.position.x).toBeLessThanOrEqual(1);

    // CONTROL saw the accepted command and the queue update
    expect(controlEventsOf(harness, 'game:command-accepted')).toHaveLength(1);
    expect(controlEventsOf(harness, 'game:queue-updated').length).toBeGreaterThan(0);
  });

  it('queues the overflow once every dancer slot is taken', async () => {
    const harness = await connectedHarness();

    for (let index = 0; index < 33; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'comment-go',
        userId: `viewer-${index}`,
      });
    }

    const state = harness.runtime.engine.getState();
    expect(state.dancers).toHaveLength(30);
    expect(state.queue).toHaveLength(3);
    expect(harness.runtime.engine.getConfig().maxQueueSize).toBe(200);
  });

  it('honours a max-dancers change from CONTROL (1..30)', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('game:command', {
      type: 'game:set-max-dancers',
      maxDancers: 2,
    });

    for (let index = 0; index < 5; index += 1) {
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'comment-go',
        userId: `viewer-${index}`,
      });
    }

    expect(harness.runtime.engine.getState().dancers).toHaveLength(2);
    expect(harness.runtime.engine.getState().queue).toHaveLength(3);
  });
});

describe('Flow 2 — gift (Blueprint §70)', () => {
  it('credits diamonds, updates ranking and emits a tiered effect', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    harness.advance(1_000);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 500,
    });

    drainStage(harness, stage);

    const state = harness.runtime.engine.getState();
    expect(state.users['viewer-1']?.totalDiamonds).toBe(500);
    expect(state.counters.totalDiamonds).toBe(500);
    expect(state.ranking.entries[0]).toMatchObject({ rank: 1, userId: 'viewer-1' });

    // Tier resolved in the engine (Blueprint §26) — STAGE only animates it.
    expect(stage.giftEffects).toHaveLength(1);
    expect(stage.giftEffects[0]).toMatchObject({
      tierId: 'tier-4',
      effectPreset: 'aurora',
      diamonds: 500,
      userId: 'viewer-1',
    });
    expect(stage.ranking[0]?.userId).toBe('viewer-1');

    // CONTROL was told about the ranking change
    expect(controlEventsOf(harness, 'game:ranking-updated').length).toBeGreaterThan(0);
  });

  it('maps each default tier band to its effect preset', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    const cases: [number, string][] = [
      [5, 'tier-1'],
      [25, 'tier-2'],
      [99, 'tier-3'],
      [500, 'tier-4'],
      [1_500, 'tier-5'],
    ];

    for (const [diamonds, tierId] of cases) {
      harness.advance(1_000);
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'gift',
        userId: `tier-${diamonds}`,
        diamonds,
      });
      drainStage(harness, stage);

      expect(stage.giftEffects.at(-1)?.tierId).toBe(tierId);
    }
  });

  it('promotes a top supporter into the VIP zone', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    harness.advance(1_000);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 1_500,
    });

    drainStage(harness, stage);

    expect(harness.runtime.engine.getState().vip.userIds).toContain('viewer-1');
    expect(stage.dancerFor('viewer-1')?.zone).toBe('vip');
  });

  it('drives the party goal to completion and announces it', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    harness.runtime.engine.updateConfig({
      partyGoal: { enabled: true, target: 1_000, growthFactor: 1 },
    });

    for (let index = 0; index < 3; index += 1) {
      harness.advance(1_000);
      await harness.runtime.handleControlInvoke('simulator:emit-event', {
        preset: 'gift',
        userId: `supporter-${index}`,
        diamonds: 500,
      });
    }

    drainStage(harness, stage);

    expect(harness.runtime.engine.getState().partyGoal.completedCount).toBeGreaterThanOrEqual(1);
    expect(stage.announcements).toContain('PARTY GOAL COMPLETED!');
  });
});

describe('gift streak regression (Blueprint §13)', () => {
  it('credits x1 to x4 as four repeats, never 1+2+3+4', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    const connector = harness.connectors.at(-1);
    expect(connector).toBeDefined();

    const user = {
      userId: 'streaker',
      handle: 'streaker',
      displayName: 'Streaker',
      avatar: 'https://cdn.test/s.webp',
    };

    for (let repeat = 1; repeat <= 4; repeat += 1) {
      harness.advance(200);
      connector?.emit({
        kind: 'gift',
        at: harness.scheduler.now(),
        user,
        giftId: 'rose',
        giftName: 'Rose',
        diamonds: 25,
        repeatCount: repeat,
        streak: repeat < 4,
        streakEnded: repeat === 4,
        transactionId: 'combo-1',
      });
    }

    drainStage(harness, stage);

    // 4 x 25 = 100. The naive sum would be (1+2+3+4) x 25 = 250.
    expect(harness.runtime.engine.getState().users.streaker?.totalDiamonds).toBe(100);
    expect(harness.runtime.engine.getState().counters.totalDiamonds).toBe(100);
    expect(stage.giftEffects).toHaveLength(4);
    expect(stage.giftEffects.map((effect) => effect.diamonds)).toEqual([25, 25, 25, 25]);
  });

  it('ignores a re-delivered repeat count', async () => {
    const harness = await connectedHarness();
    const connector = harness.connectors.at(-1);

    const user = { userId: 'dup', handle: 'dup', displayName: 'Dup', avatar: '' };
    const send = (repeatCount: number, streakEnded: boolean): void => {
      connector?.emit({
        kind: 'gift',
        at: harness.scheduler.now(),
        user,
        giftId: 'rose',
        giftName: 'Rose',
        diamonds: 10,
        repeatCount,
        streak: !streakEnded,
        streakEnded,
        transactionId: 'combo-dup',
      });
    };

    send(1, false);
    harness.advance(100);
    send(2, false);
    harness.advance(100);
    send(2, false);
    harness.advance(100);
    send(1, false);

    expect(harness.runtime.engine.getState().users.dup?.totalDiamonds).toBe(20);
  });
});

describe('STAGE reload (Blueprint §60)', () => {
  it('restores the scene from a snapshot without touching canonical state', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    harness.advance(500);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-2',
    });
    harness.advance(500);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-2',
      diamonds: 500,
    });

    drainStage(harness, stage);
    expect(stage.dancers.size).toBe(2);

    const sessionBefore = harness.runtime.engine.getState().session.sessionId;

    // The STAGE window reloads: the renderer loses everything it held.
    stage.simulateReload();
    expect(stage.dancers.size).toBe(0);

    await harness.runtime.handleControlInvoke('stage:reload', {});
    const { snapshot } = await harness.runtime.handleStageReady();
    stage.applySnapshot(snapshot);

    expect(stage.dancers.size).toBe(2);
    expect(stage.dancerFor('viewer-2')?.rank).toBe(1);
    expect(stage.ranking[0]?.totalDiamonds).toBe(500);

    // Canonical state untouched by the reload.
    const state = harness.runtime.engine.getState();
    expect(state.session.sessionId).toBe(sessionBefore);
    expect(state.users['viewer-2']?.totalDiamonds).toBe(500);
  });

  it('keeps rendering incremental events after the reload handshake', async () => {
    const harness = await connectedHarness();
    const stage = withStage(harness);

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    const cursor = drainStage(harness, stage);

    stage.simulateReload();
    const { snapshot } = await harness.runtime.handleStageReady();
    stage.applySnapshot(snapshot);

    harness.advance(500);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-2',
    });

    // Only the events emitted AFTER the snapshot are replayed — exactly what the STAGE window
    // receives once its handshake completes.
    drainStage(harness, stage, cursor);

    expect(stage.dancers.size).toBe(2);
  });
});

describe('CONTROL reload (Blueprint §61)', () => {
  it('does not disconnect LIVE or reset the engine', async () => {
    const harness = await connectedHarness();

    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'comment-go',
      userId: 'viewer-1',
    });
    harness.advance(500);
    await harness.runtime.handleControlInvoke('simulator:emit-event', {
      preset: 'gift',
      userId: 'viewer-1',
      diamonds: 250,
    });

    const before = harness.runtime.engine.getState();

    // CONTROL reloads and re-runs its handshake.
    const initial = await harness.runtime.handleControlInvoke('control:ready', {});

    expect(initial.connector.status).toBe('connected');
    expect(initial.snapshot.state.session.sessionId).toBe(before.session.sessionId);
    expect(initial.snapshot.state.dancers).toHaveLength(1);
    expect(initial.snapshot.state.users['viewer-1']?.totalDiamonds).toBe(250);
    expect(initial.stats.activeDancers).toBe(1);
    expect(harness.runtime.engine.getState().counters.eventCount).toBe(before.counters.eventCount);
  });
});

describe('real connector path with fixture transport (Task 08, credential-free)', () => {
  /**
   * The runtime reaches `connector.connect()` a microtask after the invoke starts, so the socket
   * does not exist synchronously. Yield until the transport has created it, then open it.
   */
  async function openSocketWhenReady(
    transport: ReturnType<typeof createFakeTransport>,
  ): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const socket = transport.lastSocket();
      if (socket !== undefined) {
        socket.open();
        return;
      }
      await Promise.resolve();
    }

    throw new Error('transport socket was never created');
  }

  function eulerHarness(): {
    harness: RuntimeHarness;
    transport: ReturnType<typeof createFakeTransport>;
  } {
    const transport = createFakeTransport();

    const harness = createRuntimeHarness({
      apiKey: 'test-key',
      createConnector: (provider, scheduler: ManualScheduler): LiveConnector | undefined =>
        provider === 'eulerstream'
          ? new EulerStreamConnector({ scheduler, transport, random: () => 0.5 })
          : undefined,
    });

    return { harness, transport };
  }

  it('runs provider payloads through the same pipeline as the simulator', async () => {
    const { harness, transport } = eulerHarness();
    const stage = withStage(harness);

    const connecting = harness.runtime.handleControlInvoke('connector:connect', {
      target: '@dancer',
      provider: 'eulerstream',
    });
    await openSocketWhenReady(transport);
    await connecting;

    const user = { userId: '77001', uniqueId: 'real_fan', nickname: 'Real Fan' };

    transport.lastSocket()?.message({ type: 'chat', data: { user, comment: 'GO' } });
    transport.lastSocket()?.message({
      type: 'gift',
      data: {
        user,
        giftId: 'galaxy',
        giftName: 'Galaxy',
        diamondCount: 500,
        repeatCount: 1,
        repeatEnd: true,
        giftType: 1,
        msgId: 'real-tx-1',
      },
    });

    drainStage(harness, stage);

    const state = harness.runtime.engine.getState();
    expect(state.dancers).toHaveLength(1);
    expect(state.users['77001']?.totalDiamonds).toBe(500);
    expect(state.users['77001']?.nickname).toBe('Real Fan');
    expect(stage.dancerFor('77001')).toBeDefined();
    expect(stage.giftEffects[0]?.tierId).toBe('tier-4');
  });

  it('delivers a BUNDLED production frame through normalizer → engine in order', async () => {
    const { harness, transport } = eulerHarness();
    const stage = withStage(harness);

    const connecting = harness.runtime.handleControlInvoke('connector:connect', {
      target: '@dancer',
      provider: 'eulerstream',
    });
    await openSocketWhenReady(transport);
    await connecting;

    const user = { userId: '88001', uniqueId: 'bundle_fan', nickname: 'Bundle Fan' };

    // One WebSocket frame, four messages — the default gateway shape (bundleEvents=true).
    // The GO must be processed before the gift, otherwise the gift would land on a user who is
    // not on stage yet.
    transport.lastSocket()?.message({
      timestamp: 1_700_000_000_000,
      messages: [
        { type: 'WebcastMemberMessage', data: { user } },
        { type: 'WebcastChatMessage', data: { user, comment: 'GO' } },
        {
          type: 'WebcastGiftMessage',
          data: {
            user,
            giftName: 'Galaxy',
            diamondCount: 500,
            repeatCount: 1,
            repeatEnd: true,
            giftType: 1,
            msgId: 'bundle-tx-1',
          },
        },
        { type: 'WebcastLikeMessage', data: { user, likeCount: 4 } },
      ],
    });

    drainStage(harness, stage);

    const state = harness.runtime.engine.getState();
    expect(state.counters.eventCount).toBe(4);
    expect(state.counters.joinCount).toBe(1);
    expect(state.counters.likeCount).toBe(4);

    // Ordering proof: the dancer exists AND the gift effect is attached to that dancer.
    const dancer = stage.dancerFor('88001');
    expect(dancer).toBeDefined();
    expect(state.users['88001']?.totalDiamonds).toBe(500);
    expect(stage.giftEffects[0]?.dancerId).toBe(dancer?.dancerId);
  });

  it('survives a short reconnect without resetting the canonical session', async () => {
    const { harness, transport } = eulerHarness();

    const connecting = harness.runtime.handleControlInvoke('connector:connect', {
      target: '@dancer',
      provider: 'eulerstream',
    });
    await openSocketWhenReady(transport);
    await connecting;

    const user = { userId: '77002', uniqueId: 'fan2', nickname: 'Fan Two' };
    transport.lastSocket()?.message({ type: 'chat', data: { user, comment: 'GO' } });
    transport.lastSocket()?.message({
      type: 'gift',
      data: { user, giftName: 'Rose', diamondCount: 100, repeatCount: 1, msgId: 'tx-a' },
    });

    const before = harness.runtime.engine.getState();
    expect(before.dancers).toHaveLength(1);

    // Connection drops and comes back.
    transport.lastSocket()?.serverClose();
    harness.advance(1_200);
    transport.lastSocket()?.open();

    const after = harness.runtime.engine.getState();
    expect(after.session.sessionId).toBe(before.session.sessionId);
    expect(after.dancers).toHaveLength(1);
    expect(after.users['77002']?.totalDiamonds).toBe(100);

    // A reconnect status reached CONTROL, and the session came back up.
    expect(harness.connectorStatuses.some((status) => status.status === 'reconnecting')).toBe(true);
    expect(
      harness.connectorStatuses.filter((status) => status.status === 'connected').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('drops a malformed provider frame into diagnostics without breaking the session', async () => {
    const { harness, transport } = eulerHarness();

    const connecting = harness.runtime.handleControlInvoke('connector:connect', {
      target: '@dancer',
      provider: 'eulerstream',
    });
    await openSocketWhenReady(transport);
    await connecting;

    // No stable user id: must never be merged by nickname.
    transport
      .lastSocket()
      ?.message({ type: 'chat', data: { user: { nickname: 'Ghost' }, comment: 'GO' } });

    expect(harness.diagnostics).toHaveLength(1);
    expect(harness.runtime.engine.getState().dancers).toHaveLength(0);
    expect(harness.runtime.engine.getState().counters.eventCount).toBe(0);
  });
});
