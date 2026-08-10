import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { LICENSING_MODULE } from './index.js';

describe('@dance-arena/licensing skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(LICENSING_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a platform-layer module', () => {
    expect(LICENSING_MODULE.id).toBe('@dance-arena/licensing');
    expect(LICENSING_MODULE.layer).toBe('platform');
  });
});
