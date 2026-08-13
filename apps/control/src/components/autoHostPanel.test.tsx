// @vitest-environment jsdom

/**
 * CONTROL Auto Host panel tests (Task 10 §9).
 *
 * Driven through the same typed preload whitelist production uses, so what these assert is the
 * IPC contract the operator's clicks produce — not internal component state.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../App.js';
import { createFakeBridge, type FakeBridge } from '../testing/fakeBridge.js';

afterEach(cleanup);

async function mounted(): Promise<FakeBridge> {
  const fake = createFakeBridge();
  render(<App bridge={fake.bridge} />);

  await waitFor(() =>
    expect(fake.calls.some((call) => call.method === 'autoHost.getState')).toBe(true),
  );
  await waitFor(() => expect(screen.queryByTestId('autohost-rules')).not.toBeNull());

  return fake;
}

const payloadsFor = (fake: FakeBridge, method: string): unknown[] =>
  fake.calls.filter((call) => call.method === method).map((call) => call.payload);

describe('Auto Host panel', () => {
  it('fetches the runtime state from Main instead of inventing one', async () => {
    const fake = createFakeBridge();
    render(<App bridge={fake.bridge} />);

    expect(screen.getByTestId('autohost-loading')).toBeDefined();

    await waitFor(() => expect(screen.queryByTestId('autohost-rules')).not.toBeNull());
    expect(fake.calls.some((call) => call.method === 'autoHost.getState')).toBe(true);
  });

  it('lists the default rules with their enabled state', async () => {
    await mounted();

    expect(screen.getByTestId('autohost-rule-follow-thanks')).toBeDefined();
    expect(screen.getByTestId('autohost-rule-join-welcome-bubble')).toBeDefined();
  });

  it('toggles Auto Host through the typed bridge', async () => {
    const fake = await mounted();

    fireEvent.click(screen.getByLabelText('Auto Host enabled'));

    await waitFor(() =>
      expect(payloadsFor(fake, 'autoHost.setEnabled')).toEqual([{ enabled: false }]),
    );
  });

  it('toggles TTS through the typed bridge', async () => {
    const fake = await mounted();

    fireEvent.click(screen.getByLabelText('TTS enabled'));

    await waitFor(() =>
      expect(payloadsFor(fake, 'autoHost.setTtsEnabled')).toEqual([{ enabled: false }]),
    );
  });

  it('sends voice settings as a bounded config patch', async () => {
    const fake = await mounted();

    fireEvent.change(screen.getByLabelText('Speech rate'), { target: { value: '1.4' } });

    await waitFor(() =>
      expect(payloadsFor(fake, 'autoHost.updateConfig')).toEqual([{ tts: { rate: 1.4 } }]),
    );
  });

  it('requests a test utterance and a queue clear', async () => {
    const fake = await mounted();

    fireEvent.click(screen.getByText('Test TTS'));
    fireEvent.click(screen.getByText('Clear TTS queue'));

    await waitFor(() => {
      expect(fake.calls.some((call) => call.method === 'autoHost.testTts')).toBe(true);
      expect(fake.calls.some((call) => call.method === 'autoHost.clearTtsQueue')).toBe(true);
    });
  });

  it('toggles a single rule', async () => {
    const fake = await mounted();

    fireEvent.click(screen.getByLabelText('Enable follow-thanks'));

    await waitFor(() =>
      expect(payloadsFor(fake, 'autoHost.updateRule')).toEqual([
        { ruleId: 'follow-thanks', enabled: false },
      ]),
    );
  });

  it('saves an edited template and cooldown as one bounded rule patch', async () => {
    const fake = await mounted();

    fireEvent.change(screen.getByLabelText('TTS template for follow-thanks'), {
      target: { value: 'Xin cảm ơn {user.nickname}' },
    });
    fireEvent.change(screen.getByLabelText('Cooldown ms for follow-thanks'), {
      target: { value: '9000' },
    });

    const row = screen.getByTestId('autohost-rule-follow-thanks');
    fireEvent.click(row.querySelector('button') as HTMLButtonElement);

    await waitFor(() => {
      const [patch] = payloadsFor(fake, 'autoHost.updateRule');
      expect(patch).toMatchObject({
        ruleId: 'follow-thanks',
        cooldown: { globalMs: 9_000 },
        templates: { tts: 'Xin cảm ơn {user.nickname}' },
      });
    });
  });

  it('offers no way to edit conditions, triggers or the action list', async () => {
    await mounted();
    const row = screen.getByTestId('autohost-rule-follow-thanks');

    expect(row.textContent).not.toContain('conditions');
    expect(row.querySelector('textarea')).toBeNull();
    expect(screen.queryByLabelText('Conditions for follow-thanks')).toBeNull();
  });

  it('renders the queue metrics Main published', async () => {
    const fake = await mounted();

    fake.pushAutoHostStatus({
      at: 2_000,
      enabled: true,
      ttsEnabled: true,
      ttsAvailable: true,
      pending: 3,
      current: {
        requestId: 'tts-1',
        ruleId: 'follow-thanks',
        priority: 'normal',
        text: 'Cảm ơn Mai đã follow!',
        enqueuedAt: 1_900,
        expiresAt: 21_900,
      },
      metrics: {
        enqueued: 12,
        spoken: 7,
        suppressed: 3,
        dropped: 2,
        expired: 1,
        unavailable: 0,
        errors: 4,
        interrupted: 0,
      },
      engine: {
        enabled: true,
        ruleCount: 2,
        enabledRuleCount: 2,
        activeCooldowns: 1,
        evaluated: 20,
        matched: 12,
        intents: 30,
      },
      recentActions: [],
    });

    await waitFor(() => {
      expect(screen.getByTestId('autohost-queue-state').textContent).toContain('pending 3');
      expect(screen.getByTestId('autohost-queue-state').textContent).toContain('Cảm ơn Mai');
    });

    const metrics = screen.getByTestId('autohost-metrics').textContent ?? '';
    expect(metrics).toContain('spoken 7');
    expect(metrics).toContain('suppressed 3');
    expect(metrics).toContain('dropped 2');
    expect(metrics).toContain('errors 4');

    expect(screen.getByTestId('autohost-speech-state').textContent).toContain('ready');
  });

  it('surfaces why speech is unavailable', async () => {
    await mounted();

    expect(screen.getByTestId('autohost-speech-state').textContent).toContain('stage not ready');
  });

  it('documents that Task 10 settings are runtime-only', async () => {
    await mounted();

    expect(screen.getByTestId('autohost-persistence-note').textContent).toContain('Task 12');
  });
});
