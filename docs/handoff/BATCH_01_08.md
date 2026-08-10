# Claude Batch Handoff — Tasks 01 → 08

**Mode:** sequential batch execution  
**Start:** Task 01  
**Stop:** immediately after Task 08  
**Task 09:** DO NOT START — waiting for production visual assets from ChatGPT/System Architect.

## Objective
Implement the complete non-asset vertical slice from contracts through real TikTok/EulerStream gameplay integration.

Tasks, in order:
1. `TASK_01_CONTRACTS_AND_SCHEMAS.md`
2. `TASK_02_CORE_GAME_ENGINE.md`
3. `TASK_03_SIMULATOR_AND_REPLAY.md`
4. `TASK_04_ELECTRON_SHELL_TYPED_IPC.md`
5. `TASK_05_CONTROL_MINIMAL.md`
6. `TASK_06_STAGE_PIXI_MINIMAL.md`
7. `TASK_07_EULERSTREAM_CONNECTOR_NORMALIZER.md`
8. `TASK_08_E2E_GAMEPLAY_INTEGRATION.md`

## Mandatory reading
Before Task 01 read:
- `docs/handoff/CLAUDE_READ_FIRST.md`
- `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`
- `docs/tasks/B_TASK_INDEX.md`
- this file

Before each task, re-read that task's `docs/tasks/TASK_XX_*.md` file.

## Batch execution rule
You may continue from Task 01 through Task 08 without waiting for a chat response, **only if the current task validation is green**.

For every task:
1. Start from latest `main` plus already completed batch work.
2. Keep scope aligned to the current task.
3. Implement.
4. Run task validation and `pnpm validate` where applicable.
5. Update tests/docs/status.
6. Create a clearly named commit checkpoint: `Task XX: <name>`.
7. If using separate PRs, merge/land in order before starting dependent work. If repository permissions/workflow make that inefficient, one batch branch is allowed, but commits MUST remain one-task-per-checkpoint and the final PR must preserve the 01→08 history clearly.
8. If a task fails validation, stop advancing, fix it first.

## Preferred Git strategy for this batch
Use one integration branch:

`claude/batch-01-08-core-vertical-slice`

Create one commit per task:
- `Task 01: contracts and schemas`
- `Task 02: core game engine`
- ...
- `Task 08: end-to-end gameplay integration`

Open/update one PR into `main` when the batch is complete. The PR body must contain a section for each task with validation results.

This batch strategy is an explicit owner override of the earlier one-task-one-PR default for Tasks 01–08 only.

## Non-negotiable architecture
- Canonical game state belongs to Core Engine.
- CONTROL is presentation + commands only.
- STAGE is renderer only.
- Core Engine must not import Electron, React, PixiJS or Node built-ins.
- Connector does not implement gameplay.
- Raw provider data never goes directly to STAGE.
- External data is validated/normalized at boundaries.
- User identity must never use nickname.
- IPC is typed and only exposed through preload whitelist.
- Renderer has no direct Node/Electron access.
- Simulator must use the real pipeline, not direct STAGE injection.
- STAGE supports initial snapshot + incremental events.

## Required vertical slice at Task 08
The following must work end-to-end:

### Offline
Simulator → MockConnector → Normalizer → Core Engine → IPC → CONTROL/STAGE.

Scenario:
1. simulated user comments `GO`;
2. user enters queue / dancer spawns;
3. STAGE renders dancer;
4. simulated gift updates diamond total;
5. ranking changes;
6. gift effect event reaches STAGE;
7. CONTROL reflects canonical state.

### Real connector
EulerStream → Normalizer → same Core Engine pipeline.

Must support at minimum:
- connect/disconnect/status;
- reconnect strategy;
- comment;
- gift including streak/dedup safety;
- follow;
- share;
- join/like where provider payload supports it;
- normalized user identity/avatar/nickname;
- no gameplay logic in connector.

## Task 08 acceptance gate
Before declaring batch complete:
- `pnpm install --frozen-lockfile` PASS
- `pnpm format:check` PASS
- `pnpm lint` PASS
- `pnpm arch:check` PASS
- `pnpm typecheck` PASS
- `pnpm test` PASS
- `pnpm build` PASS
- offline vertical slice PASS
- STAGE reload restores render state from snapshot
- CONTROL reload does not disconnect LIVE/core state
- basic connector reconnect test PASS
- gift streak double-count regression test PASS

If a real TikTok/EulerStream credential is unavailable in the dev environment, provide fixture/mock transport integration tests and clearly mark **real credential smoke test pending owner**, but do not weaken the connector implementation.

## Explicit stop condition
After Task 08:
- update `docs/status/PROJECT_STATUS.md`;
- open the batch PR;
- report test results and known limitations;
- STOP.

Do **not** implement Task 09 visuals/themes/assets. ChatGPT/System Architect will create and land the production asset pack first.
