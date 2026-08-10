import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { SIMULATOR_MODULE } from './index.js';

describe('@dance-arena/simulator skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(SIMULATOR_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a platform-layer module', () => {
    expect(SIMULATOR_MODULE.id).toBe('@dance-arena/simulator');
    expect(SIMULATOR_MODULE.layer).toBe('platform');
  });
});
