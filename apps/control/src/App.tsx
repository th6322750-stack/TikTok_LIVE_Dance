import { CONTRACTS_SCHEMA_VERSION } from '@dance-arena/contracts';
import { type JSX } from 'react';

/**
 * CONTROL root component — Task 00 skeleton.
 *
 * Blueprint §35/§36: CONTROL renders canonical state and sends commands; it never owns game state
 * and contains no business logic. The real panels (Dashboard, Live, Queue, Ranking, Simulator, …)
 * arrive in Task 05.
 */
export function App(): JSX.Element {
  return (
    <main className="control-shell">
      <h1>Dance Arena V2 — CONTROL</h1>
      <p>
        Workspace skeleton (Task 00). Contracts schema version{' '}
        <strong>{CONTRACTS_SCHEMA_VERSION}</strong>.
      </p>
      <p className="control-note">
        Canonical game state lives in the Core Engine. This window only displays state and sends
        commands to Main.
      </p>
    </main>
  );
}
