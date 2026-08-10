import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { SETTINGS_MODULE } from './index.js';

describe('@dance-arena/settings skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(SETTINGS_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a platform-layer module', () => {
    expect(SETTINGS_MODULE.id).toBe('@dance-arena/settings');
    expect(SETTINGS_MODULE.layer).toBe('platform');
  });
});
