// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App.js';
import { createFakeBridge, EMPTY_SNAPSHOT, EMPTY_STATS } from './testing/fakeBridge.js';

afterEach(cleanup);

describe('CONTROL shell', () => {
  it('renders the layout and performs the ready handshake', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);

    expect(screen.getByText('Dance Arena V2 — CONTROL')).toBeDefined();
    await waitFor(() => expect(fake.calls.some((call) => call.method === 'ready')).toBe(true));
  });

  it('warns when the desktop bridge is unavailable', () => {
    render(<App />);

    expect(screen.getByTestId('bridge-warning')).toBeDefined();
  });

  it('renders values from the snapshot rather than computing them', async () => {
    const fake = createFakeBridge({
      connector: {
        provider: 'mock',
        status: 'connected',
        at: 1,
        target: '@dancer',
        room: { viewerCount: 1_234 },
      },
      apiKeyConfigured: true,
      stats: {
        ...EMPTY_STATS,
        activeDancers: 3,
        queueLength: 2,
        counters: { ...EMPTY_STATS.counters, totalDiamonds: 4_500, giftCount: 9 },
        topSupporter: { rank: 1, userId: 'u1', totalDiamonds: 4_000 },
      },
      snapshot: {
        ...EMPTY_SNAPSHOT,
        state: {
          ...EMPTY_SNAPSHOT.state,
          users: {
            u1: {
              id: 'u1',
              nickname: 'Top Fan',
              totalDiamonds: 4_000,
              giftCount: 5,
              follow: true,
              lastSeenAt: 10,
            },
          },
          queue: [
            { id: 'q1', userId: 'u1', joinedAt: 5, priorityScore: 1, diamondsWhileWaiting: 40 },
          ],
          ranking: { updatedAt: 10, entries: [{ rank: 1, userId: 'u1', totalDiamonds: 4_000 }] },
        },
      },
    });

    render(<App bridge={fake.bridge} />);

    await waitFor(() =>
      expect(screen.getByTestId('connector-status').textContent).toBe('connected'),
    );
    expect(screen.getByTestId('viewer-count').textContent).toContain('1234');
    expect(screen.getByTestId('api-key-state').textContent).toContain('configured');
    expect(screen.getByTestId('stat-active-dancers').textContent).toContain('3');
    expect(screen.getByTestId('stat-session-diamonds').textContent).toContain('4500');
    expect(screen.getByTestId('stat-top-supporter').textContent).toContain('Top Fan');
    expect(screen.getByTestId('ranking-list').textContent).toContain('Top Fan');
    expect(screen.getByTestId('queue-list').textContent).toContain('Top Fan');
  });

  it('applies incremental events pushed from Main', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);
    await waitFor(() => expect(fake.calls.some((call) => call.method === 'ready')).toBe(true));

    fake.pushConnectorStatus({ provider: 'eulerstream', status: 'reconnecting', at: 2_000 });
    fake.pushGameEvent({
      type: 'game:event-log',
      entry: { id: 'log-1', at: 2_100, level: 'info', kind: 'gift', message: 'Top Fan sent 500💎' },
    });

    await waitFor(() =>
      expect(screen.getByTestId('connector-status').textContent).toBe('reconnecting'),
    );
    expect(screen.getByTestId('event-feed').textContent).toContain('Top Fan sent 500💎');
  });

  it('shows a diagnostics error banner', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);
    await waitFor(() => expect(fake.calls.some((call) => call.method === 'ready')).toBe(true));

    fake.pushDiagnostics({ at: 1, scope: 'normalizer', message: 'Dropped malformed payload' });

    await waitFor(() =>
      expect(screen.getByTestId('last-error').textContent).toContain('Dropped malformed payload'),
    );
  });
});

describe('CONTROL emits typed commands (never local mutations)', () => {
  it('sends the connect intent with the entered target', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);

    fireEvent.change(screen.getByLabelText('TikTok account'), { target: { value: '@dancer' } });
    fireEvent.click(screen.getByText('Connect'));

    await waitFor(() =>
      expect(fake.calls).toContainEqual({ method: 'connect', payload: { target: '@dancer' } }),
    );
  });

  it.each([
    ['Clear stage', { type: 'game:clear-stage' }],
    ['Reset ranking', { type: 'game:reset-ranking' }],
    ['Reset session', { type: 'game:reset-session' }],
  ])('maps the %s button to the matching typed command', async (label, expected) => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);

    fireEvent.click(screen.getByText(label));

    await waitFor(() =>
      expect(fake.calls).toContainEqual({ method: 'sendCommand', payload: expected }),
    );
  });

  it('kicks a queued user by id, not by nickname', async () => {
    const fake = createFakeBridge({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        state: {
          ...EMPTY_SNAPSHOT.state,
          users: {
            u7: {
              id: 'u7',
              nickname: 'Duplicate Name',
              totalDiamonds: 0,
              giftCount: 0,
              follow: false,
              lastSeenAt: 1,
            },
          },
          queue: [
            { id: 'q7', userId: 'u7', joinedAt: 1, priorityScore: 0, diamondsWhileWaiting: 0 },
          ],
        },
      },
    });

    render(<App bridge={fake.bridge} />);
    await waitFor(() => expect(screen.getByTestId('queue-list')).toBeDefined());

    fireEvent.click(screen.getByText('Kick'));

    await waitFor(() =>
      expect(fake.calls).toContainEqual({
        method: 'sendCommand',
        payload: { type: 'game:kick-user', userId: 'u7' },
      }),
    );
  });

  it('drives the stage window through the bridge', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);

    fireEvent.click(screen.getByText('Open stage'));
    fireEvent.click(screen.getByText('Reload stage'));
    fireEvent.click(screen.getByText('1080×1920'));

    await waitFor(() => {
      expect(fake.calls).toContainEqual({ method: 'stage.open' });
      expect(fake.calls).toContainEqual({ method: 'stage.reload' });
      expect(fake.calls).toContainEqual({
        method: 'stage.setLayout',
        payload: { preset: '1080x1920' },
      });
    });
  });

  it('routes simulator actions through IPC, never straight to STAGE', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);

    fireEvent.click(screen.getByText('Send GO'));
    fireEvent.click(screen.getByText('Gift 500💎'));
    fireEvent.click(screen.getByText('Scenario: streak'));

    await waitFor(() => {
      expect(fake.calls).toContainEqual({
        method: 'simulator.emit',
        payload: { preset: 'comment-go' },
      });
      expect(fake.calls).toContainEqual({
        method: 'simulator.emit',
        payload: { preset: 'gift', diamonds: 500 },
      });
      expect(fake.calls).toContainEqual({
        method: 'simulator.startScenario',
        payload: { scenarioId: 'gift-streak' },
      });
    });
  });

  it('does nothing when no bridge is present', () => {
    render(<App />);

    fireEvent.click(screen.getByText('Clear stage'));

    expect(screen.getByTestId('bridge-warning')).toBeDefined();
  });
});
