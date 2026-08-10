import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { CORE_ENGINE_MODULE } from './index.js';

describe('@dance-arena/core-engine skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(CORE_ENGINE_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a domain-layer module', () => {
    expect(CORE_ENGINE_MODULE.id).toBe('@dance-arena/core-engine');
    expect(CORE_ENGINE_MODULE.layer).toBe('domain');
  });
});
