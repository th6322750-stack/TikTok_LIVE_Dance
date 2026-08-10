/**
 * CONTROL panels — presentation only (Blueprint §35–§37).
 *
 * Every component renders what it is given and calls a callback on interaction. None of them
 * derive gameplay: no sorting by score, no VIP decisions, no queue mutation.
 */

import type {
  ConnectorStatusEvent,
  EventLogEntry,
  QueueEntry,
  RankingState,
  StageWindowState,
} from '@dance-arena/contracts';
import type { JSX } from 'react';

import type { ControlViewState } from '../state/controlStore.js';
import {
  activeDancerCount,
  nicknameOf,
  sessionDiamonds,
  topSupporterLabel,
} from '../state/controlStore.js';

export function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="card" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <span className="card-label">{label}</span>
      <span className="card-value">{value}</span>
    </div>
  );
}

export function Header({
  connector,
  apiKeyConfigured,
}: {
  connector: ConnectorStatusEvent | undefined;
  apiKeyConfigured: boolean;
}): JSX.Element {
  const status = connector?.status ?? 'idle';

  return (
    <header className="header">
      <div>
        <span className="header-title">Dance Arena V2 — CONTROL</span>
        <span className={`status status-${status}`} data-testid="connector-status">
          {status}
        </span>
      </div>
      <div className="header-meta">
        <span data-testid="viewer-count">
          {connector?.room?.viewerCount === undefined
            ? 'viewers —'
            : `viewers ${connector.room.viewerCount}`}
        </span>
        <span>{connector?.target ?? 'no account'}</span>
        <span data-testid="api-key-state">
          {apiKeyConfigured ? 'API key configured' : 'API key missing'}
        </span>
      </div>
    </header>
  );
}

export function Dashboard({ state }: { state: ControlViewState }): JSX.Element {
  const counters = state.stats?.counters ?? state.snapshot?.state.counters;
  const partyGoal = state.stats?.partyGoal ?? state.snapshot?.state.partyGoal;

  return (
    <section className="cards">
      <StatCard label="Live status" value={state.connector?.status ?? 'idle'} />
      <StatCard label="Session" value={state.stats?.session.status ?? 'idle'} />
      <StatCard label="Active dancers" value={String(activeDancerCount(state))} />
      <StatCard label="Queue" value={String(state.queue.length)} />
      <StatCard label="Session diamonds" value={String(sessionDiamonds(state))} />
      <StatCard label="Top supporter" value={topSupporterLabel(state)} />
      <StatCard label="Gifts" value={String(counters?.giftCount ?? 0)} />
      <StatCard
        label="Party goal"
        value={partyGoal === undefined ? '—' : `${partyGoal.current}/${partyGoal.target}`}
      />
    </section>
  );
}

export function QueuePanel({
  queue,
  state,
  onKick,
}: {
  queue: readonly QueueEntry[];
  state: ControlViewState;
  onKick: (userId: string) => void;
}): JSX.Element {
  return (
    <section className="panel">
      <h2>Queue ({queue.length})</h2>
      {queue.length === 0 ? (
        <p className="empty">Queue is empty.</p>
      ) : (
        <ol className="list" data-testid="queue-list">
          {queue.map((entry) => (
            <li key={entry.id}>
              <span>{nicknameOf(state, entry.userId)}</span>
              <span className="muted">{entry.diamondsWhileWaiting}💎</span>
              <button type="button" onClick={() => onKick(entry.userId)}>
                Kick
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function RankingPanel({
  ranking,
  state,
}: {
  ranking: RankingState;
  state: ControlViewState;
}): JSX.Element {
  return (
    <section className="panel">
      <h2>Top 10</h2>
      {ranking.entries.length === 0 ? (
        <p className="empty">No supporters yet.</p>
      ) : (
        <ol className="list" data-testid="ranking-list">
          {ranking.entries.map((entry) => (
            <li key={entry.userId}>
              <span className="rank">#{entry.rank}</span>
              <span>{nicknameOf(state, entry.userId)}</span>
              <span className="muted">{entry.totalDiamonds}💎</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function EventFeed({ feed }: { feed: readonly EventLogEntry[] }): JSX.Element {
  return (
    <section className="panel">
      <h2>Event feed</h2>
      <ul className="feed" data-testid="event-feed">
        {feed.map((entry) => (
          <li key={entry.id} className={`feed-${entry.level}`}>
            <span className="muted">{entry.kind}</span>
            <span>{entry.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StageControls({
  stageWindow,
  onOpen,
  onClose,
  onReload,
  onPreset,
}: {
  stageWindow: StageWindowState;
  onOpen: () => void;
  onClose: () => void;
  onReload: () => void;
  onPreset: (preset: '720x1280' | '1080x1920') => void;
}): JSX.Element {
  return (
    <section className="panel">
      <h2>Stage</h2>
      <p className="muted" data-testid="stage-window-state">
        {stageWindow.open ? 'open' : 'closed'}
      </p>
      <div className="actions">
        <button type="button" onClick={onOpen}>
          Open stage
        </button>
        <button type="button" onClick={onClose}>
          Close stage
        </button>
        <button type="button" onClick={onReload}>
          Reload stage
        </button>
        <button type="button" onClick={() => onPreset('720x1280')}>
          720×1280
        </button>
        <button type="button" onClick={() => onPreset('1080x1920')}>
          1080×1920
        </button>
      </div>
    </section>
  );
}

export function ConnectionPanel({
  target,
  onTargetChange,
  onConnect,
  onDisconnect,
}: {
  target: string;
  onTargetChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}): JSX.Element {
  return (
    <section className="panel">
      <h2>LIVE connection</h2>
      <div className="actions">
        <input
          aria-label="TikTok account"
          value={target}
          onChange={(event) => onTargetChange(event.target.value)}
          placeholder="@account"
        />
        <button type="button" onClick={onConnect}>
          Connect
        </button>
        <button type="button" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </section>
  );
}

export function SimulatorPanel({
  onEmitGo,
  onEmitGift,
  onScenario,
  onStop,
}: {
  onEmitGo: () => void;
  onEmitGift: (diamonds: number) => void;
  onScenario: (scenarioId: string) => void;
  onStop: () => void;
}): JSX.Element {
  return (
    <section className="panel">
      <h2>Simulator</h2>
      <div className="actions">
        <button type="button" onClick={onEmitGo}>
          Send GO
        </button>
        {[1, 25, 99, 500, 1500].map((diamonds) => (
          <button key={diamonds} type="button" onClick={() => onEmitGift(diamonds)}>
            Gift {diamonds}💎
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" onClick={() => onScenario('join-and-gift')}>
          Scenario: join + gift
        </button>
        <button type="button" onClick={() => onScenario('gift-streak')}>
          Scenario: streak
        </button>
        <button type="button" onClick={onStop}>
          Stop simulator
        </button>
      </div>
    </section>
  );
}

export function SessionControls({
  onClearStage,
  onResetRanking,
  onResetSession,
}: {
  onClearStage: () => void;
  onResetRanking: () => void;
  onResetSession: () => void;
}): JSX.Element {
  return (
    <section className="panel">
      <h2>Session</h2>
      <div className="actions">
        <button type="button" onClick={onClearStage}>
          Clear stage
        </button>
        <button type="button" onClick={onResetRanking}>
          Reset ranking
        </button>
        <button type="button" onClick={onResetSession}>
          Reset session
        </button>
      </div>
    </section>
  );
}
