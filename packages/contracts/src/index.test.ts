import { describe, expect, it } from 'vitest';

import { CONTRACTS_MODULE, CONTRACTS_SCHEMA_VERSION } from './index.js';

describe('@dance-arena/contracts skeleton', () => {
  it('exposes a stable contracts schema version', () => {
    expect(CONTRACTS_SCHEMA_VERSION).toBe(1);
  });

  it('describes itself as the contracts layer', () => {
    expect(CONTRACTS_MODULE).toEqual({
      id: '@dance-arena/contracts',
      layer: 'contracts',
      contractsSchemaVersion: CONTRACTS_SCHEMA_VERSION,
    });
  });
});
