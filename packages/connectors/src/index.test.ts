import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { CONNECTORS_MODULE } from './index.js';

describe('@dance-arena/connectors skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(CONNECTORS_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a platform-layer module', () => {
    expect(CONNECTORS_MODULE.id).toBe('@dance-arena/connectors');
    expect(CONNECTORS_MODULE.layer).toBe('platform');
  });
});
