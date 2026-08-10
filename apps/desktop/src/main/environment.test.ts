import { describe, expect, it } from 'vitest';

import { resolveRuntimeMode } from './environment.js';

describe('resolveRuntimeMode', () => {
  it('detects development from NODE_ENV', () => {
    expect(resolveRuntimeMode({ NODE_ENV: 'development' })).toBe('development');
  });

  it('detects development from the renderer dev server url', () => {
    expect(resolveRuntimeMode({ ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(
      'development',
    );
  });

  it('treats production as the default', () => {
    expect(resolveRuntimeMode({})).toBe('production');
    expect(resolveRuntimeMode({ NODE_ENV: 'production' })).toBe('production');
  });

  it('never unlocks development behaviour for malformed input', () => {
    expect(resolveRuntimeMode({ NODE_ENV: '' })).toBe('production');
    expect(resolveRuntimeMode({ NODE_ENV: 'DEVELOPMENT' })).toBe('production');
    expect(resolveRuntimeMode({ NODE_ENV: undefined })).toBe('production');
    expect(resolveRuntimeMode({ ELECTRON_RENDERER_URL: '' })).toBe('production');
  });
});
