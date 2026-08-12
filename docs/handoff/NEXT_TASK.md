# NEXT TASK

**Current phase:** Task 10 — Auto Host & TTS  
**Previous task:** Task 09 — DONE, PR #3 merged with `DA-VISUAL-R3`  
**Status:** READY FOR IMPLEMENTATION

## Source of truth

Claude must sync latest `origin/main` and read, in order:

1. `.dance/HANDOFF.json`
2. `docs/tasks/TASK_10_AUTO_HOST_TTS.md`
3. `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`
4. `.dance/DANCE_LOCK.json`
5. `.dance/VISUAL_CONTRACT.json`
6. `.dance/ASSET_MANIFEST.json`
7. `docs/status/PROJECT_STATUS.md`

GitHub/repository state is authoritative over chat history.

## Branch

Create from latest `main`:

`claude/task-10-auto-host-tts`

Do not branch from the old Task 09 branch.

## Architecture gate

Task 10 uses this ownership split:

```text
Normalized LIVE / Game transition / Timer trigger
              ↓
       Core AutoHostRuleEngine
              ↓
       AutoHostActionIntent[]
        ├─ visual → STAGE
        └─ TTS → Main TtsQueueService
                    ↓
              STAGE Web Speech adapter
```

- Core owns deterministic rule/cooldown/template logic.
- Main owns timers and bounded TTS queue.
- STAGE only renders and speaks one typed utterance at a time.
- CONTROL configures/observes runtime state.

## Must implement

- declarative `Trigger → Conditions → Cooldown → Actions` rule engine;
- triggers for join/follow/share/comment/gift, party-goal complete, rank promotion, accepted command and timer reminder;
- announcements, TTS, spotlight, visual effect, R3 reaction, R3 command bubble and mini-game hook intents;
- safe template renderer with whitelisted variables;
- default Vietnamese host rules;
- bounded priority/deduplicating TTS queue;
- no-credential local Web Speech adapter in STAGE with completion/error acknowledgement;
- CONTROL Auto Host runtime UI (toggle, TTS test, rule/template/cooldown controls, queue metrics);
- simulator/full-pipeline integration and reload/spam regression coverage.

## Non-negotiable

- Never post a message/comment back to TikTok.
- Never speak arbitrary raw comment text in the default preset.
- No cloud TTS secret/credential.
- No `eval` or arbitrary executable rule expression.
- Auto Host cannot change gift score/ranking/queue/VIP state.
- Do not duplicate existing GiftEngine gift FX by default.
- Do not modify/recolor/redraw `DA-VISUAL-R3` assets.
- Core must not import Electron/Node/React/Pixi/Web Speech.
- Runtime config persistence is deferred to Task 12; document this limitation.

## Required validation

Before reporting complete:

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

## PR

Title:

`Task 10: Auto Host & TTS`

After opening the PR and getting CI green, STOP and wait for ChatGPT review.

**Do not start Task 11.**
