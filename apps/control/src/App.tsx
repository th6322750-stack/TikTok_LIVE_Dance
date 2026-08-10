/**
 * CONTROL root (Blueprint §35–§37).
 *
 * Layout: sidebar + header + dashboard. Every action sends an intent through the preload bridge
 * and then waits for Main to publish the resulting canonical state — CONTROL never edits queue,
 * ranking or dancers locally.
 */

import type { DanceArenaControlBridge, StagePreset } from '@dance-arena/contracts';
import { useState, type JSX } from 'react';

import {
  ConnectionPanel,
  Dashboard,
  EventFeed,
  Header,
  QueuePanel,
  RankingPanel,
  SessionControls,
  SimulatorPanel,
  StageControls,
} from './components/panels.js';
import { useControlState } from './state/useControlState.js';

const SECTIONS = [
  'Dashboard',
  'Live',
  'Stage',
  'Queue',
  'Ranking',
  'Simulator',
  'Session',
] as const;

export interface AppProps {
  /** Injected in tests; production reads `window.danceArena` from the preload whitelist. */
  readonly bridge?: DanceArenaControlBridge;
}

export function App({ bridge: bridgeOverride }: AppProps = {}): JSX.Element {
  const { state, bridge } = useControlState(bridgeOverride);
  const [target, setTarget] = useState('');

  const send = (action: (available: DanceArenaControlBridge) => Promise<unknown>): void => {
    if (bridge === undefined) return;
    void action(bridge);
  };

  return (
    <div className="shell">
      <nav className="sidebar">
        <span className="brand">Dance Arena</span>
        <ul>
          {SECTIONS.map((section) => (
            <li key={section}>{section}</li>
          ))}
        </ul>
      </nav>

      <div className="main">
        <Header connector={state.connector} apiKeyConfigured={state.apiKeyConfigured} />

        {!state.bridgeAvailable && (
          <p className="warning" data-testid="bridge-warning">
            Desktop bridge unavailable — read-only view. Launch through the Electron shell.
          </p>
        )}

        {state.lastError !== undefined && (
          <p className="warning" data-testid="last-error">
            {state.lastError}
          </p>
        )}

        <Dashboard state={state} />

        <div className="grid">
          <ConnectionPanel
            target={target}
            onTargetChange={setTarget}
            onConnect={() => send((api) => api.connect({ target: target.trim() || '@demo' }))}
            onDisconnect={() => send((api) => api.disconnect())}
          />

          <StageControls
            stageWindow={state.stageWindow}
            onOpen={() => send((api) => api.stage.open())}
            onClose={() => send((api) => api.stage.close())}
            onReload={() => send((api) => api.stage.reload())}
            onPreset={(preset: StagePreset) => send((api) => api.stage.setLayout({ preset }))}
          />

          <SimulatorPanel
            onEmitGo={() => send((api) => api.simulator.emit({ preset: 'comment-go' }))}
            onEmitGift={(diamonds) =>
              send((api) => api.simulator.emit({ preset: 'gift', diamonds }))
            }
            onScenario={(scenarioId) => send((api) => api.simulator.startScenario({ scenarioId }))}
            onStop={() => send((api) => api.simulator.stop())}
          />

          <SessionControls
            onClearStage={() => send((api) => api.sendCommand({ type: 'game:clear-stage' }))}
            onResetRanking={() => send((api) => api.sendCommand({ type: 'game:reset-ranking' }))}
            onResetSession={() => send((api) => api.sendCommand({ type: 'game:reset-session' }))}
          />

          <QueuePanel
            queue={state.queue}
            state={state}
            onKick={(userId) => send((api) => api.sendCommand({ type: 'game:kick-user', userId }))}
          />

          <RankingPanel ranking={state.ranking} state={state} />

          <EventFeed feed={state.feed} />
        </div>
      </div>
    </div>
  );
}
