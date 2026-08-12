# Task 10 — Auto Host & TTS

## Status

**READY FOR IMPLEMENTATION** after Task 09 / DA-VISUAL-R3 final QA.

Implementation branch:

`claude/task-10-auto-host-tts`

Task 11 must not start until Task 10 is reviewed and merged.

---

## 1. Goal

Build a deterministic Auto Host system that can react to LIVE/game events with overlays, reactions, spotlight and TTS without putting rules in React/Pixi/Electron glue code.

Canonical model:

```text
Normalized LIVE event / Game transition / Timer signal
        ↓
AutoHostTrigger
        ↓
Rule Engine
Trigger → Conditions → Cooldown → Actions
        ↓
AutoHostActionIntent[]
        ├─ visual action → StageEvent / theme semantic slot
        ├─ TTS action → Main-owned TtsQueueService
        └─ mini-game hook → typed hook only (no mini-game implementation yet)
```

Hard ownership rule:

- **Core Engine** evaluates business rules and emits action intents.
- **Electron Main/runtime** owns TTS queue, timers and side-effect orchestration.
- **STAGE** only renders Auto Host visual output and provides a dumb speech-output adapter.
- **CONTROL** only edits runtime config, previews and observes state.

No renderer owns canonical Auto Host rule/cooldown state.

---

## 2. Scope

Task 10 must implement:

1. typed Auto Host contracts + Zod boundary validation;
2. pure deterministic rule engine;
3. safe template renderer;
4. cooldown/rate-limit state;
5. default Vietnamese rule preset;
6. bounded priority TTS queue;
7. local Web Speech output through STAGE with typed IPC and completion acknowledgement;
8. reaction / command-bubble rendering using already-approved DA-VISUAL-R3 theme assets;
9. CONTROL Auto Host page/panel for runtime enable/config/status/test;
10. simulator/integration tests through the real event/core/runtime path.

Task 10 does **not** implement:

- posting comments/messages back to TikTok;
- cloud/OpenAI/Edge credential-based TTS;
- DJ/music reactive audio (Task 11);
- persistent settings migration/storage (Task 12);
- a full mini-game system;
- new production artwork;
- changes to gift scoring, queue priority, VIP or ranking rules.

Runtime Auto Host config may remain in-memory for Task 10. Task 12 will persist/migrate it.

---

## 3. Contracts

Add a dedicated contract module such as:

`packages/contracts/src/auto-host.ts`

Do not put these schemas directly inside renderer code.

### 3.1 Trigger kinds

At minimum support:

- `live:join`
- `live:follow`
- `live:share`
- `live:comment`
- `live:gift`
- `game:party-goal-complete`
- `game:rank-promotion`
- `game:command-accepted`
- `timer:reminder`

`game:*` triggers are produced from **actual Core transitions**, not reconstructed in a renderer.

A rank-promotion rule must fire only on the transition into the configured rank/VIP band, not every ranking refresh.

Party-goal complete must fire once for a completion transition, not on every later event while the goal remains complete.

### 3.2 Trigger context

Use canonical `platformUserId` / internal user id for identity. Nickname is display-only.

Context may expose a safe whitelist of template values, e.g.:

- `user.id`
- `user.nickname`
- `gift.name`
- `gift.diamonds`
- `gift.tierId`
- `rank.current`
- `rank.previous`
- `partyGoal.current`
- `partyGoal.target`
- `command.type`

Never expose raw provider payloads to rule templates.

### 3.3 Conditions

Conditions must be declarative data, not executable JavaScript.

Support only a bounded validated set needed by Task 10, for example:

- gift minimum diamonds;
- gift tier allow-list;
- comment contains/equals from a configured string list;
- accepted command type;
- rank range / Top-N;
- user currently has dancer / is VIP when available;
- session elapsed minimum when required.

**No `eval`, Function constructor, arbitrary expressions or unbounded user regex execution.**

### 3.4 Actions

Use a discriminated union. Required actions:

- `SHOW_ANNOUNCEMENT`
- `TTS`
- `START_SPOTLIGHT`
- `SHOW_EFFECT`
- `SHOW_REACTION`
- `SHOW_BUBBLE`
- `START_MINIGAME_HOOK`

`START_MINIGAME_HOOK` only emits a typed hook/intention; it must not invent Task 14/minigame gameplay.

For `SHOW_REACTION` / `SHOW_BUBBLE`, rules use semantic variants, not production file paths.

Examples:

- reaction: `happy | love | wow | fire | party`
- bubble: `go | join | vip`

STAGE/theme resolves those semantic variants to DA-VISUAL-R3 assets.

### 3.5 Rule

A rule must include at least:

- stable `ruleId`;
- enabled flag;
- trigger kind;
- conditions;
- cooldown config;
- ordered actions;
- deterministic priority/order metadata.

Rules with equal priority execute in stable `ruleId` order.

---

## 4. Pure AutoHostRuleEngine

Implement in Core Engine or another package that obeys the same pure dependency rules.

It must not import:

- Electron;
- React;
- PixiJS;
- Node built-ins;
- Web Speech APIs.

Inject clock/ID dependencies where necessary.

Suggested API shape:

```ts
interface AutoHostRuleEngine {
  evaluate(trigger: AutoHostTrigger): AutoHostEvaluation;
  updateConfig(config: AutoHostConfig): void;
  resetSession(): void;
  getState(): AutoHostEngineState;
}
```

`evaluate()` returns intents; it does not play sound or touch renderers.

### Cooldown

Support:

- global rule cooldown;
- optional per-user cooldown;
- cooldown group if useful for several rules sharing the same anti-spam budget.

Cooldown timestamps must use injected time for deterministic tests.

### Template renderer

Templates may use only an explicit variable whitelist.

Requirements:

- no code execution;
- unknown token degrades safely;
- Unicode normalization;
- collapse repeated whitespace;
- strip/control invalid control characters;
- bounded output length;
- plain text only, no SSML in Task 10.

Raw user comment text must **not be spoken by default**. Default TTS uses safe templates with nickname/gift/rank fields. Do not add a default rule that reads arbitrary comments aloud.

---

## 5. Default Vietnamese preset

Ship a practical default preset as data, not `if` chains.

Recommended behavior:

### Join
- visual welcome/`join` bubble only;
- no TTS for every join by default to avoid spam.

### Accepted GO/JOIN command
- show `go`/`join` bubble near the relevant dancer/user when possible;
- no raw comment TTS.

### Follow
- announcement;
- normal-priority TTS such as `Cảm ơn {user.nickname} đã follow!`;
- per-user/global cooldown.

### Share
- announcement;
- normal-priority TTS;
- global cooldown to prevent share spam.

### Gift
- small gift: announcement only or low/normal TTS according to rule data;
- high-value gift / high tier: high/critical TTS + celebration announcement + optional spotlight.

Do **not** duplicate the existing GiftEngine gift FX by default. Auto Host must not create a second gift score/effect just because it also thanks the sender.

### Party goal completed
- celebration announcement;
- high-priority TTS;
- optional semantic celebration effect;
- fire exactly once per completion transition.

### Rank promotion / VIP promotion
- celebration announcement;
- `vip` bubble where applicable;
- high-priority TTS for important promotion;
- optional spotlight.

### Timer reminder
Default around 120 seconds while a session is active, e.g. an announcement/TTS reminding viewers to type `GO`.

Timer scheduling belongs to Main/runtime. Core only receives a typed `timer:reminder` trigger.

---

## 6. TTS Queue architecture

### Ownership

**Main owns the queue.**

Do not keep the authoritative queue in CONTROL or STAGE.

CONTROL reload must not clear the TTS queue.

STAGE reload may interrupt the currently spoken utterance, but must not corrupt queue state.

### Required provider abstraction

```ts
interface TtsProvider {
  speak(request: TtsSpeakRequest): Promise<TtsSpeakResult>;
  cancel?(requestId?: string): Promise<void> | void;
  isAvailable(): boolean;
}
```

Task 10 must not hard-code credentials.

Implement a local no-credential output path using the browser Web Speech API in STAGE (`speechSynthesis` / `SpeechSynthesisUtterance`) behind a typed adapter.

Main still owns queue selection. STAGE is only the speech device:

```text
Main TtsQueueService
  ↓ typed IPC: play one utterance
STAGE TtsSpeakerAdapter
  ↓ Web Speech
system audio
  ↓ completion/error ack
Main TtsQueueService
  ↓ next item
```

If Web Speech is unavailable, return a typed unavailable/error result and continue safely. Visual Auto Host actions must still work.

### Queue rules

Use configurable values with safe defaults; suggested Task 10 defaults:

- max queued: `20`;
- max spoken text: `180` characters;
- duplicate window: around `8s`;
- stale-item TTL: bounded (e.g. 15–30s depending priority);
- one utterance at a time;
- stable FIFO within the same priority.

Priority enum should be semantic, e.g.:

- `critical`
- `high`
- `normal`
- `low`

Default order:

```text
high-value gift / major goal
> important rank/social action
> ordinary follow/share response
> comment/reaction response
> generic reminder
```

When full, do not grow unbounded. Prefer dropping the oldest/least-important queued item according to a deterministic policy and increment metrics.

Duplicate suppression key must not incorrectly merge two different users. Include source rule + canonical user + normalized text or equivalent stable context.

### Interrupt policy

Support a bounded policy such as:

- `never`
- `lower-priority-only`

If the current provider cannot cancel cleanly, degrade to `never` rather than corrupting state.

### Reload/disconnect

- CONTROL reload: no effect on queue.
- STAGE reload: current utterance becomes interrupted; retry at most once if still within TTL, otherwise drop with reason.
- session reset/disconnect: clear stale host/TTS work so old thanks are not spoken minutes later.
- short connector reconnect without session reset must not reset canonical Core state.

---

## 7. Typed IPC

Extend the existing namespaced IPC contract with an `autohost:` namespace.

At minimum provide typed/validated flows for:

### CONTROL → Main

- get Auto Host runtime state/config;
- update Auto Host runtime config;
- enable/disable Auto Host;
- enable/disable TTS;
- test/preview a safe TTS phrase;
- clear pending TTS queue.

### Main → CONTROL

Push summary/status updates such as:

- enabled/TTS enabled;
- active/current utterance;
- pending queue size;
- spoken count;
- duplicate-suppressed count;
- dropped/stale/error count;
- last matched rule / recent actions if useful.

Throttle UI-only metrics; do not push at audio-frame rate.

### Main ↔ STAGE TTS bridge

Typed play/cancel/result messages. Validate every inbound payload in Main exactly like existing IPC.

Do not expose raw `ipcRenderer`.

---

## 8. STAGE visual integration

Use DA-VISUAL-R3 exactly as locked by Task 09.

Do not modify/recolor/redraw production assets.

Add renderer support for Auto Host semantic visuals, including:

- reaction overlay;
- command bubble (`go`, `join`, `vip`);
- existing `stage:announcement`;
- existing spotlight events;
- semantic `SHOW_EFFECT` without changing score/ranking.

Reaction/bubble lifetimes must be bounded and self-cleaning; repeated events must not leak Pixi display objects.

If a semantic theme slot is unresolved, warn/degrade visibly using existing theme/registry behavior; do not invent a replacement asset.

---

## 9. CONTROL UX

Implement a functional Auto Host screen/panel, not final commercial polish.

Minimum controls:

- master Auto Host toggle;
- TTS toggle;
- default language `vi-VN`;
- rate/pitch/volume runtime controls if supported by the local provider;
- test TTS button;
- clear TTS queue button;
- list of default rules with enabled state;
- editable safe text templates/cooldowns for the default rules;
- queue/current-item status;
- suppression/drop/error counters.

Do not build a general-purpose scripting editor in Task 10.

Task 10 config may be runtime-only. Clearly label/document that persistence is completed in Task 12.

---

## 10. Safety / product rules

Hard requirements:

1. Auto Host creates only internal overlay/audio/actions.
2. **Never post a comment/message to TikTok.**
3. No outbound chat endpoint is added in Task 10.
4. No raw provider payload reaches templates/renderers.
5. No cloud TTS secret in renderer or settings document.
6. No `eval` / arbitrary JS rule conditions.
7. No raw arbitrary comment TTS in the default preset.
8. Sanitize and bound display/TTS text.
9. Auto Host cannot directly mutate gift score, queue priority, ranking or VIP state.
10. `SHOW_EFFECT` is visual-only and must not masquerade as a GiftEvent.

---

## 11. Tests — required

Add strong automated coverage.

### Rule engine

- trigger match / non-match;
- condition combinations;
- stable deterministic rule ordering;
- global cooldown;
- per-user cooldown;
- same event after cooldown fires again;
- disabled Auto Host produces no action;
- disabled individual rule produces no action;
- safe template variable replacement;
- unknown/malicious template input cannot execute code;
- bounded/sanitized output;
- rank promotion fires only on real transition;
- party goal complete fires once per transition.

### TTS queue

- priority ordering;
- FIFO within same priority;
- duplicate suppression;
- different users are not accidentally deduplicated;
- max queue bound under burst spam;
- deterministic drop policy;
- stale TTL handling;
- clear/reset behavior;
- provider unavailable/error continues without deadlock;
- no overlapping `speak` calls;
- optional lower-priority interruption behavior;
- STAGE reload interruption does not grow/replay queue unbounded.

### Integration

Use Simulator/MockConnector through the real normalized-event/Core path.

Required scenarios:

1. simulated follow → matched rule → announcement + TTS intent;
2. simulated high-value gift → GiftEngine still credits exactly once; Auto Host thanks sender without adding a second gift score;
3. replayed duplicate gift transaction → no duplicate Auto Host thanks caused by the duplicate gift;
4. burst of 100+ social events → queue remains bounded;
5. party-goal completion → one celebration;
6. rank promotion → one promotion reaction;
7. accepted GO command → semantic bubble resolves from DA-VISUAL-R3;
8. CONTROL reload does not reset queue/config runtime;
9. STAGE reload recovers without canonical Core reset;
10. Auto Host off → existing gameplay still behaves exactly as before.

### Architecture/security

- Core Auto Host module rejects imports of Electron/Node/React/Pixi through existing architecture checks;
- raw `ipcRenderer` remains unavailable;
- no TikTok outbound/post-comment path added;
- DA-VISUAL-R3 manifest remains unchanged by Claude.

---

## 12. Validation gate

Before PR:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm arch:check
pnpm typecheck
pnpm test
pnpm build
pnpm validate
```

All must PASS.

---

## 13. Git / PR

Branch:

`claude/task-10-auto-host-tts`

Preferred commit:

`Task 10: Auto Host and TTS`

Small review-fix commits are allowed later; do not mix Task 11.

PR title:

`Task 10: Auto Host & TTS`

PR body must include:

- Architecture summary
- Contracts/rules implemented
- Default Vietnamese preset
- TTS queue policy
- Web Speech adapter behavior/fallback
- CONTROL UX
- STAGE reaction/bubble integration
- Tests and final validation
- Runtime-only settings limitation
- Security/product compliance (explicitly state no TikTok outbound comments)
- Known limitations
- Review notes for ChatGPT

After PR is open and CI is green: **STOP for ChatGPT review. Do not begin Task 11.**

---

## 14. Definition of Done

Task 10 is ready for review when all of the following are true:

- Simulator/live-domain events deterministically match declarative Auto Host rules;
- visual actions reach STAGE via typed events and use R3 semantic theme assets;
- TTS actions enter a bounded, priority, duplicate-suppressing queue owned outside renderers;
- local Web Speech output works when available and fails gracefully when unavailable;
- CONTROL can enable/disable/configure/test the runtime Auto Host system;
- no TikTok comment is posted;
- gameplay scoring/ranking/queue behavior remains unchanged;
- reload and spam scenarios are bounded;
- full `pnpm validate` and CI pass;
- PR is opened and Claude stops before Task 11.
