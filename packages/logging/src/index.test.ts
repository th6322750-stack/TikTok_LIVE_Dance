import { describe, expect, it } from 'vitest';

import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';

import { LOGGING_MODULE } from './index.js';

describe('@dance-arena/logging skeleton', () => {
  it('resolves the workspace dependency on @dance-arena/contracts', () => {
    expect(LOGGING_MODULE.contractsSchemaVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });

  it('declares itself as a platform-layer module', () => {
    expect(LOGGING_MODULE.id).toBe('@dance-arena/logging');
    expect(LOGGING_MODULE.layer).toBe('platform');
  });
});
