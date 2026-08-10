# @dance-arena/core-engine

Canonical game state and gameplay rules. Pure TypeScript domain layer.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §14–§27
**Layer:** `domain`
**Depends on:** `@dance-arena/contracts`

## Responsibility

- Owns the canonical `GameState` (session, users, queue, dancers, ranking, VIP, party goal).
- Applies normalized events and validated commands; emits control/stage events.
- Deterministic and unit-testable in isolation.

## Boundaries

- No Electron, React or PixiJS imports.
- No I/O, no Node built-ins, no timers hidden inside domain logic — time is passed in.
- Never accepts raw provider payloads; only normalized contracts.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
