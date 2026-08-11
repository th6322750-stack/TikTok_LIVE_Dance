/**
 * Blocker 1 regression — bundled production frames.
 *
 * Fixtures follow the official `ClientMessageBundle` shape (`{timestamp, messages[]}`) that the
 * gateway sends with its default `features.bundleEvents=true`.
 */

import { describe, expect, it } from 'vitest';

import { decodeFrame, isTransportOnlyKind } from './frames.js';

const chat = (comment: string): unknown => ({
  type: 'WebcastChatMessage',
  data: { user: { userId: '111', nickname: 'Fan' }, comment },
});

const gift = (): unknown => ({
  type: 'WebcastGiftMessage',
  data: { user: { userId: '111', nickname: 'Fan' }, giftName: 'Rose', diamondCount: 1 },
});

describe('bundled frames (features.bundleEvents=true)', () => {
  it('decodes every message in a bundle, in order', () => {
    const frame = decodeFrame(
      JSON.stringify({
        timestamp: 1_700_000_000_000,
        messages: [chat('GO'), gift(), chat('nice')],
      }),
    );

    expect(frame.errors).toEqual([]);
    expect(frame.timestamp).toBe(1_700_000_000_000);
    expect(frame.messages.map((message) => message.kind)).toEqual([
      'WebcastChatMessage',
      'WebcastGiftMessage',
      'WebcastChatMessage',
    ]);
  });

  it('does not drop messages after the first', () => {
    const frame = decodeFrame(JSON.stringify({ messages: [chat('a'), chat('b'), chat('c')] }));

    expect(frame.messages).toHaveLength(3);
  });

  it('unwraps the message payload rather than passing the envelope', () => {
    const frame = decodeFrame(JSON.stringify({ messages: [chat('GO')] }));

    expect(frame.messages[0]?.payload).toMatchObject({ comment: 'GO' });
    expect(frame.messages[0]?.payload).not.toHaveProperty('type');
  });

  it('handles an empty bundle without error', () => {
    const frame = decodeFrame(JSON.stringify({ timestamp: 1, messages: [] }));

    expect(frame.messages).toEqual([]);
    expect(frame.errors).toEqual([]);
  });

  it('skips a malformed bundle entry but keeps the rest', () => {
    const frame = decodeFrame(JSON.stringify({ messages: [chat('GO'), { noType: true }, gift()] }));

    expect(frame.messages).toHaveLength(2);
    expect(frame.errors).toHaveLength(1);
    expect(frame.errors[0]).toContain('message type');
  });

  it('accepts the nested data.messages variant', () => {
    const frame = decodeFrame(JSON.stringify({ data: { timestamp: 7, messages: [chat('GO')] } }));

    expect(frame.messages).toHaveLength(1);
    expect(frame.timestamp).toBe(7);
  });
});

describe('single frames (features.bundleEvents=false)', () => {
  it('still decodes an unbundled message', () => {
    const frame = decodeFrame(JSON.stringify(chat('GO')));

    expect(frame.messages).toHaveLength(1);
    expect(frame.messages[0]?.kind).toBe('WebcastChatMessage');
  });
});

describe('robustness', () => {
  it('never throws on garbage input', () => {
    expect(decodeFrame('not json {{{').errors).toHaveLength(1);
    expect(decodeFrame('[]').errors).toHaveLength(1);
    expect(decodeFrame('null').errors).toHaveLength(1);
    expect(decodeFrame('"a string"').errors).toHaveLength(1);
    expect(decodeFrame(JSON.stringify({ nothing: 'useful' })).errors).toHaveLength(1);
  });

  it('classifies transport-only frames', () => {
    expect(isTransportOnlyKind('ping')).toBe(true);
    expect(isTransportOnlyKind('pong')).toBe(true);
    expect(isTransportOnlyKind('WebcastChatMessage')).toBe(false);
  });
});
