import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('CONTROL App skeleton', () => {
  it('renders the CONTROL shell', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Dance Arena V2 — CONTROL');
  });

  it('reads the contracts schema version from @dance-arena/contracts', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain(String(CONTRACTS_SCHEMA_VERSION));
  });
});
