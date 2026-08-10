# @dance-arena/contracts

Shared contracts: normalized event schemas, game state types and typed IPC channel definitions.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §9–§12, §30, §38–§41
**Layer:** `contracts`
**Depends on:** nothing (leaf of the dependency graph)

## Responsibility

- Normalized event schemas (`GiftEvent`, `CommentEvent`, …) and their Zod validators.
- Game state / stage event types shared by Main, CONTROL and STAGE.
- Typed IPC channel names and payload types.

## Boundaries

- No runtime behaviour beyond validation helpers.
- No Node built-ins, Electron, React or PixiJS — every layer depends on this package.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
