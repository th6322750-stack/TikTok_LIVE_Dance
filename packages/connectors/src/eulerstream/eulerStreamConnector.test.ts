import type { ConnectorStatusEvent, RawLiveEvent } from '@dance-arena/contracts';
import { RECONNECT_BACKOFF_MS } from '@dance-arena/contracts';
import { describe, expect, it } from 'vitest';

import { ManualScheduler } from '../support/scheduler.js';
import { computeBackoffDelay } from './backoff.js';
import { EULERSTREAM_FEATURES, EulerStreamConnector } from './eulerStreamConnector.js';
import { createFakeTransport } from './testing/fakeTransport.js';
import { redactUrl, REDACTED } from './transport.js';

const API_KEY = 'super-secret-euler-key';

function setup(options: { heartbeatIntervalMs?: number; maxReconnectAttempts?: number } = {}) {
  const scheduler = new ManualScheduler(1_000);
  const transport = createFakeTransport();
  const statuses: ConnectorStatusEvent[] = [];
  const events: RawLiveEvent[] = [];
  const logs: string[] = [];

  const connector = new EulerStreamConnector({
    scheduler,
    transport,
    // Fixed entropy keeps the jitter deterministic; 0.5 maps to no jitter.
    random: () => 0.5,
    log: (level, message) => logs.push(`${level}:${message}`),
    ...options,
  });

  connector.onStatus((status) => statuses.push(status));
  connector.onEvent((event) => events.push(event));

  return { connector, transport, scheduler, statuses, events, logs };
}

describe('connection lifecycle (Blueprint §7)', () => {
  it('moves idle → connecting → connected', async () => {
    const { connector, transport, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer', apiKey: API_KEY });
    expect(connector.getStatus()).toBe('connecting');

    transport.lastSocket()?.open();
    await connecting;

    expect(connector.getStatus()).toBe('connected');
    expect(statuses.map((status) => status.status)).toEqual(['connecting', 'connected']);
  });

  it('passes the target through and lets the gateway normalize it', async () => {
    const { connector, transport } = setup();

    const connecting = connector.connect({ target: '@dancer', apiKey: API_KEY });
    transport.lastSocket()?.open();
    await connecting;

    const url = new URL(transport.lastSocket()?.url ?? '');

    // `features.normalizeUniqueId=true` is pinned, so `@dancer` / `dancer` / a profile url are all
    // accepted by the gateway. Stripping client-side would fight the documented behaviour.
    expect(url.searchParams.get('uniqueId')).toBe('@dancer');
    expect(url.searchParams.get('features.normalizeUniqueId')).toBe('true');
  });

  it('emits raw events without interpreting them', async () => {
    const { connector, transport, events } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.message({ type: 'gift', data: { userId: 'u1', diamondCount: 500 } });

    expect(events).toHaveLength(1);
    expect(events[0]?.provider).toBe('eulerstream');
    expect(events[0]?.kind).toBe('gift');
    // Raw payload passes through untouched — no scoring, no ranking in the connector.
    expect(events[0]?.payload).toEqual({ userId: 'u1', diamondCount: 500 });
  });

  it('swallows heartbeat frames instead of forwarding them as events', async () => {
    const { connector, transport, events } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.message({ type: 'pong' });
    transport.lastSocket()?.message({ type: 'ping' });

    expect(events).toHaveLength(0);
  });

  it('does not crash on malformed frames', async () => {
    const { connector, transport, events, logs } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.rawMessage('this is not json {{{');
    transport.lastSocket()?.message({ noTypeField: true });

    expect(events).toHaveLength(0);
    expect(connector.getStatus()).toBe('connected');
    expect(logs.some((line) => line.startsWith('warn:'))).toBe(true);
  });

  it('sends heartbeats while connected', async () => {
    const { connector, transport, scheduler } = setup({ heartbeatIntervalMs: 10_000 });

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    scheduler.advance(10_000);
    scheduler.advance(10_000);

    expect(transport.lastSocket()?.sent).toEqual([
      JSON.stringify({ type: 'ping' }),
      JSON.stringify({ type: 'ping' }),
    ]);
  });
});

describe('reconnect strategy (Blueprint §8)', () => {
  it('follows the 1/2/4/8/15/30s schedule and then holds', async () => {
    const { connector, transport, scheduler, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    const delays: number[] = [];

    // Every retry keeps failing, so the backoff must escalate. (A SUCCESSFUL reconnect resets the
    // schedule — that is covered by the next test.)
    for (let attempt = 0; attempt < 7; attempt += 1) {
      transport.lastSocket()?.serverClose();

      const reconnecting = statuses.filter((status) => status.status === 'reconnecting').at(-1);
      expect(reconnecting?.nextRetryInMs).toBeDefined();
      delays.push(reconnecting?.nextRetryInMs ?? -1);

      scheduler.advance(reconnecting?.nextRetryInMs ?? 0);
    }

    // random = 0.5 → zero jitter → exactly the documented schedule, held at 30s.
    expect(delays).toEqual([...RECONNECT_BACKOFF_MS, 30_000]);
  });

  it('applies jitter within ±20%', () => {
    for (let attempt = 0; attempt < RECONNECT_BACKOFF_MS.length; attempt += 1) {
      const base = RECONNECT_BACKOFF_MS[attempt] ?? 30_000;

      expect(computeBackoffDelay({ attempt, random: 0 })).toBeCloseTo(base * 0.8, -1);
      expect(computeBackoffDelay({ attempt, random: 0.999 })).toBeLessThanOrEqual(base * 1.2);
      expect(computeBackoffDelay({ attempt, random: 0.5 })).toBe(base);
    }
  });

  it('reconnects after an unexpected close and resets the attempt counter on success', async () => {
    const { connector, transport, scheduler } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.serverClose();
    expect(connector.getStatus()).toBe('reconnecting');
    expect(connector.reconnectAttempts).toBe(1);

    scheduler.advance(1_000);
    expect(transport.sockets).toHaveLength(2);

    transport.lastSocket()?.open();
    expect(connector.getStatus()).toBe('connected');
    expect(connector.reconnectAttempts).toBe(0);
  });

  it('never reconnects after an intentional disconnect', async () => {
    const { connector, transport, scheduler, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    await connector.disconnect();
    transport.lastSocket()?.serverClose();
    scheduler.advance(60_000);

    expect(transport.sockets).toHaveLength(1);
    expect(connector.getStatus()).toBe('idle');
    expect(statuses.some((status) => status.status === 'reconnecting')).toBe(false);
  });

  it('gives up after the configured attempt limit', async () => {
    const { connector, transport, scheduler, statuses } = setup({ maxReconnectAttempts: 2 });

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      transport.lastSocket()?.serverClose();
      scheduler.advance(60_000);
    }

    const last = statuses.at(-1);
    expect(last?.status).toBe('error');
    expect(last?.reason).toContain('giving up');
  });

  it('rejects the initial connect when the transport cannot open', async () => {
    const { connector, transport } = setup();
    transport.failNextConnect('dns failure');

    await expect(connector.connect({ target: '@dancer' })).rejects.toThrow('dns failure');
  });
});

describe('reconnect lifecycle safety (review blocker 2)', () => {
  it('schedules exactly ONE reconnect when error is followed by close', async () => {
    const { connector, transport, scheduler, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    // The usual failure sequence: the socket errors, then closes.
    transport.lastSocket()?.error('network down');
    transport.lastSocket()?.serverClose(1006, 'abnormal');

    expect(statuses.filter((status) => status.status === 'reconnecting')).toHaveLength(1);
    expect(connector.reconnectAttempts).toBe(1);

    // Only one socket may be created when the timer fires.
    scheduler.advance(60_000);
    expect(transport.sockets).toHaveLength(2);
  });

  it('settles the initial connect promise when the socket closes before opening', async () => {
    const { connector, transport } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.serverClose(1006, 'abnormal');

    // Without this the caller would await forever.
    await expect(connecting).rejects.toThrow();
  });

  it('settles the initial connect promise on a terminal close before opening', async () => {
    const { connector, transport } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.serverClose(4401, 'invalid auth');

    await expect(connecting).rejects.toThrow(/auth/i);
  });

  it('settles the initial connect promise when disconnect is called first', async () => {
    const { connector } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    await connector.disconnect();

    await expect(connecting).rejects.toThrow();
  });

  it('ignores callbacks from a superseded socket', async () => {
    const { connector, transport, scheduler, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    const staleSocket = transport.lastSocket();

    staleSocket?.serverClose();
    scheduler.advance(1_000);
    transport.lastSocket()?.open();
    expect(connector.getStatus()).toBe('connected');

    const statusCountBefore = statuses.length;
    const socketCountBefore = transport.sockets.length;

    // The old socket fires late: it must not disturb the live connection.
    staleSocket?.serverClose(1006, 'late close');
    staleSocket?.error('late error');
    scheduler.advance(60_000);

    expect(connector.getStatus()).toBe('connected');
    expect(statuses).toHaveLength(statusCountBefore);
    expect(transport.sockets).toHaveLength(socketCountBefore);
  });
});

describe('terminal close codes (review blocker 2)', () => {
  it.each([
    [4401, 'invalid auth'],
    [4403, 'no permission'],
    [4404, 'not live'],
    [4400, 'invalid options'],
    [4005, 'stream ended'],
  ])('does not reconnect after close code %i (%s)', async (code) => {
    const { connector, transport, scheduler, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.serverClose(code, 'terminal');
    scheduler.advance(120_000);

    expect(transport.sockets).toHaveLength(1);
    expect(connector.getStatus()).toBe('error');
    expect(statuses.some((status) => status.status === 'reconnecting')).toBe(false);
  });

  it('reports the documented reason for a terminal close', async () => {
    const { connector, transport, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.serverClose(4404, '');

    expect(statuses.at(-1)?.reason).toMatch(/not live/i);
  });

  it.each([
    [4006, 'no messages timeout'],
    [4500, 'tiktok closed connection'],
    [4555, 'max lifetime exceeded'],
    [1011, 'internal server error'],
  ])('still reconnects after transient close code %i (%s)', async (code) => {
    const { connector, transport, scheduler } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.serverClose(code, 'transient');
    scheduler.advance(60_000);

    expect(transport.sockets).toHaveLength(2);
  });

  it('treats an unknown close code as transient rather than giving up', async () => {
    const { connector, transport, scheduler } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.serverClose(4999, 'never seen before');
    scheduler.advance(60_000);

    expect(transport.sockets).toHaveLength(2);
  });
});

describe('gateway mode is pinned (review blocker 1)', () => {
  it('builds the official url with every feature flag set explicitly', async () => {
    const { connector, transport } = setup();

    const connecting = connector.connect({ target: '@dancer', apiKey: API_KEY });
    transport.lastSocket()?.open();
    await connecting;

    const url = new URL(transport.lastSocket()?.url ?? '');

    expect(url.searchParams.get('features.bundleEvents')).toBe('true');
    expect(url.searchParams.get('features.rawMessages')).toBe('false');
    expect(url.searchParams.get('features.normalizeUniqueId')).toBe('true');
    expect(url.searchParams.get('features.schemaVersion')).toBe('v2');
    expect(EULERSTREAM_FEATURES.bundleEvents).toBe(true);
  });

  it('emits every message of a bundled frame in order', async () => {
    const { connector, transport, events } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.message({
      timestamp: 1_700_000_000_000,
      messages: [
        { type: 'WebcastChatMessage', data: { user: { userId: '1' }, comment: 'GO' } },
        { type: 'WebcastGiftMessage', data: { user: { userId: '1' }, diamondCount: 10 } },
        { type: 'WebcastLikeMessage', data: { user: { userId: '1' }, likeCount: 3 } },
      ],
    });

    expect(events.map((event) => event.kind)).toEqual([
      'WebcastChatMessage',
      'WebcastGiftMessage',
      'WebcastLikeMessage',
    ]);
  });

  it('skips transport-only frames inside a bundle', async () => {
    const { connector, transport, events } = setup();

    const connecting = connector.connect({ target: '@dancer' });
    transport.lastSocket()?.open();
    await connecting;

    transport.lastSocket()?.message({
      messages: [
        { type: 'ping', data: {} },
        { type: 'WebcastChatMessage', data: { user: { userId: '1' }, comment: 'hi' } },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('WebcastChatMessage');
  });
});

describe('credential handling (Blueprint §45)', () => {
  it('never puts the api key in a status event', async () => {
    const { connector, transport, statuses } = setup();

    const connecting = connector.connect({ target: '@dancer', apiKey: API_KEY });
    transport.lastSocket()?.open();
    await connecting;
    transport.lastSocket()?.serverClose();

    expect(JSON.stringify(statuses)).not.toContain(API_KEY);
  });

  it('never logs the api key', async () => {
    const { connector, transport, logs } = setup();

    const connecting = connector.connect({ target: '@dancer', apiKey: API_KEY });
    transport.lastSocket()?.open();
    await connecting;

    expect(logs.join('\n')).not.toContain(API_KEY);
    expect(logs.some((line) => line.includes(REDACTED))).toBe(true);
  });

  it('redacts credential-like query parameters', () => {
    const redacted = redactUrl(`wss://ws.example.com/live?uniqueId=dancer&apiKey=${API_KEY}`);

    expect(redacted).not.toContain(API_KEY);
    expect(redacted).toContain('uniqueId=dancer');
    // Plain marker: url encoding must not obscure the fact that a value was removed.
    expect(redacted).toContain(REDACTED);
  });

  it('redacts an unparseable url rather than echoing it', () => {
    expect(redactUrl(`not a url ${API_KEY}`)).toBe('REDACTED-URL');
  });
});
