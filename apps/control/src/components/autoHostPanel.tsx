/**
 * CONTROL Auto Host panel (Task 10 §9).
 *
 * Presentation only, like every other CONTROL panel: it renders the runtime state Main published
 * and calls a typed bridge method on interaction. It never evaluates a rule, never decides a
 * cooldown and never holds the TTS queue — a CONTROL reload therefore changes nothing about what
 * the host is doing.
 *
 * Task 10 deliberately ships no scripting editor: an operator may toggle rules, retune cooldowns
 * and reword the safe templates, nothing more.
 */

import type {
  AutoHostConfig,
  AutoHostRule,
  AutoHostRulePatch,
  AutoHostStatus,
  TtsVoiceSettings,
} from '@dance-arena/contracts';
import { useState, type JSX } from 'react';

export interface AutoHostPanelProps {
  readonly config: AutoHostConfig | undefined;
  readonly status: AutoHostStatus | undefined;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onSetTtsEnabled: (enabled: boolean) => void;
  readonly onVoiceChange: (patch: Partial<TtsVoiceSettings>) => void;
  readonly onRulePatch: (patch: AutoHostRulePatch) => void;
  readonly onTestTts: () => void;
  readonly onClearQueue: () => void;
}

/** First announcement / TTS template of a rule — the only two an operator may reword. */
function templatesOf(rule: AutoHostRule): { announcement?: string; tts?: string } {
  const announcement = rule.actions.find((action) => action.type === 'SHOW_ANNOUNCEMENT');
  const tts = rule.actions.find((action) => action.type === 'TTS');

  return {
    ...(announcement === undefined ? {} : { announcement: announcement.template }),
    ...(tts === undefined ? {} : { tts: tts.template }),
  };
}

function RuleRow({
  rule,
  onRulePatch,
}: {
  rule: AutoHostRule;
  onRulePatch: (patch: AutoHostRulePatch) => void;
}): JSX.Element {
  const templates = templatesOf(rule);
  const [announcement, setAnnouncement] = useState(templates.announcement ?? '');
  const [tts, setTts] = useState(templates.tts ?? '');
  const [cooldown, setCooldown] = useState(String(rule.cooldown.globalMs));

  const save = (): void => {
    onRulePatch({
      ruleId: rule.ruleId,
      cooldown: { globalMs: Number.parseInt(cooldown, 10) || 0 },
      templates: {
        ...(templates.announcement === undefined ? {} : { announcement }),
        ...(templates.tts === undefined ? {} : { tts }),
      },
    });
  };

  return (
    <li data-testid={`autohost-rule-${rule.ruleId}`}>
      <label>
        <input
          type="checkbox"
          checked={rule.enabled}
          aria-label={`Enable ${rule.ruleId}`}
          onChange={(event) => onRulePatch({ ruleId: rule.ruleId, enabled: event.target.checked })}
        />
        <span>{rule.ruleId}</span>
      </label>

      <span className="muted">{rule.trigger}</span>

      {templates.announcement !== undefined && (
        <input
          aria-label={`Announcement template for ${rule.ruleId}`}
          value={announcement}
          onChange={(event) => setAnnouncement(event.target.value)}
        />
      )}

      {templates.tts !== undefined && (
        <input
          aria-label={`TTS template for ${rule.ruleId}`}
          value={tts}
          onChange={(event) => setTts(event.target.value)}
        />
      )}

      <input
        aria-label={`Cooldown ms for ${rule.ruleId}`}
        inputMode="numeric"
        value={cooldown}
        onChange={(event) => setCooldown(event.target.value)}
      />

      <button type="button" onClick={save}>
        Save
      </button>
    </li>
  );
}

export function AutoHostPanel({
  config,
  status,
  onSetEnabled,
  onSetTtsEnabled,
  onVoiceChange,
  onRulePatch,
  onTestTts,
  onClearQueue,
}: AutoHostPanelProps): JSX.Element {
  if (config === undefined) {
    return (
      <section className="panel">
        <h2>Auto Host</h2>
        <p className="empty" data-testid="autohost-loading">
          Waiting for Auto Host runtime state…
        </p>
      </section>
    );
  }

  const metrics = status?.metrics;

  return (
    <section className="panel">
      <h2>Auto Host &amp; TTS</h2>

      <div className="actions">
        <label>
          <input
            type="checkbox"
            checked={config.enabled}
            aria-label="Auto Host enabled"
            onChange={(event) => onSetEnabled(event.target.checked)}
          />
          <span>Auto Host</span>
        </label>

        <label>
          <input
            type="checkbox"
            checked={config.tts.enabled}
            aria-label="TTS enabled"
            onChange={(event) => onSetTtsEnabled(event.target.checked)}
          />
          <span>TTS ({config.tts.lang})</span>
        </label>

        <button type="button" onClick={onTestTts}>
          Test TTS
        </button>
        <button type="button" onClick={onClearQueue}>
          Clear TTS queue
        </button>
      </div>

      <div className="actions">
        <label>
          Rate
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            aria-label="Speech rate"
            value={config.tts.rate}
            onChange={(event) => onVoiceChange({ rate: Number(event.target.value) })}
          />
        </label>
        <label>
          Pitch
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            aria-label="Speech pitch"
            value={config.tts.pitch}
            onChange={(event) => onVoiceChange({ pitch: Number(event.target.value) })}
          />
        </label>
        <label>
          Volume
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            aria-label="Speech volume"
            value={config.tts.volume}
            onChange={(event) => onVoiceChange({ volume: Number(event.target.value) })}
          />
        </label>
      </div>

      <p className="muted" data-testid="autohost-speech-state">
        {status?.ttsAvailable === true
          ? 'Local speech device ready'
          : `Speech unavailable — ${status?.ttsUnavailableReason ?? 'no STAGE speech device'}`}
      </p>

      <p className="muted" data-testid="autohost-queue-state">
        {`pending ${status?.pending ?? 0} · speaking ${status?.current?.text ?? '—'}`}
      </p>

      <p className="muted" data-testid="autohost-metrics">
        {`spoken ${metrics?.spoken ?? 0} · suppressed ${metrics?.suppressed ?? 0} · dropped ${
          metrics?.dropped ?? 0
        } · expired ${metrics?.expired ?? 0} · errors ${metrics?.errors ?? 0}`}
      </p>

      <p className="muted" data-testid="autohost-persistence-note">
        Runtime only — Auto Host settings reset when the app restarts. Persistence lands in Task 12.
      </p>

      <ol className="list" data-testid="autohost-rules">
        {config.rules.map((rule) => (
          <RuleRow key={rule.ruleId} rule={rule} onRulePatch={onRulePatch} />
        ))}
      </ol>
    </section>
  );
}
