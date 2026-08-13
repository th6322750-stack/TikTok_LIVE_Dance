/**
 * CONTROL root (Blueprint §35–§37).
 *
 * Layout: sidebar + header + dashboard. Every action sends an intent through the preload bridge
 * and then waits for Main to publish the resulting canonical state — CONTROL never edits queue,
 * ranking or dancers locally.
 */

import type {
  AutoHostRuntimeState,
  DanceArenaControlBridge,
  StagePreset,
} from '@dance-arena/contracts';
import { useState, type JSX } from 'react';

import { AutoHostPanel } from './components/autoHostPanel.js';
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
  'Auto Host',
  'Simulator',
  'Session',
] as const;

export interface AppProps {
  /** Injected in tests; production reads `window.danceArena` from the preload whitelist. */
  readonly bridge?: DanceArenaControlBridge;
}

export function App({ bridge: bridgeOverride }: AppProps = {}): JSX.Element {
  const { state, bridge, applyAutoHostState } = useControlState(bridgeOverride);
  const [target, setTarget] = useState('');

  const send = (action: (available: DanceArenaControlBridge) => Promise<unknown>): void => {
    if (bridge === undefined) return;
    void action(bridge);
  };

  /** Auto Host mutations answer with the state Main kept; CONTROL renders that answer. */
  const sendAutoHost = (
    action: (available: DanceArenaControlBridge) => Promise<AutoHostRuntimeState>,
  ): void => {
    if (bridge === undefined) return;
    void action(bridge).then(applyAutoHostState);
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

          <AutoHostPanel
            config={state.autoHostConfig}
            status={state.autoHostStatus}
            onSetEnabled={(enabled) => sendAutoHost((api) => api.autoHost.setEnabled({ enabled }))}
            onSetTtsEnabled={(enabled) =>
              sendAutoHost((api) => api.autoHost.setTtsEnabled({ enabled }))
            }
            onVoiceChange={(patch) =>
              sendAutoHost((api) => api.autoHost.updateConfig({ tts: patch }))
            }
            onRulePatch={(patch) => sendAutoHost((api) => api.autoHost.updateRule(patch))}
            onTestTts={() => send((api) => api.autoHost.testTts({}))}
            onClearQueue={() => send((api) => api.autoHost.clearTtsQueue())}
          />

          <EventFeed feed={state.feed} />
        </div>
      </div>
    </div>
  );
}
