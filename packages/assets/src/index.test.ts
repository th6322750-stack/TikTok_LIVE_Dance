import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { ASSETS_MODULE } from './index.js';

describe('@dance-arena/assets skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(ASSETS_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a platform-layer module', () => {
    expect(ASSETS_MODULE.id).toBe('@dance-arena/assets');
    expect(ASSETS_MODULE.layer).toBe('platform');
  });
});
