/**
 * External-url allowlist (review follow-up).
 *
 * A popup request originates in the renderer, so its url is untrusted input. Only web schemes may
 * reach `shell.openExternal`; anything else would let a compromised renderer ask the OS to open a
 * local file or a custom protocol handler.
 */

import { describe, expect, it } from 'vitest';

import { isSafeExternalUrl } from './windowManager.js';

describe('isSafeExternalUrl', () => {
  it.each(['https://tiktok.com/@dancer', 'http://localhost:5273/docs'])('allows %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(true);
  });

  it.each([
    'file:///C:/Windows/System32/cmd.exe',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ms-msdt:/id',
    'smb://attacker/share',
    'not a url at all',
    '',
  ])('blocks %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });
});
