# @dance-arena/connectors

LiveConnector implementations (EulerStream, Mock, Replay) and their transport handling.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §6–§8
**Layer:** `platform`
**Depends on:** `@dance-arena/contracts`

## Responsibility

- Implements `LiveConnector`: connect, disconnect, status state machine, reconnect/backoff.
- Parses provider transport messages and emits raw live events.

## Boundaries

- No ranking, VIP, queue, party goal, dancer or any other gameplay logic.
- No direct writes to game state — raw events go to the normalizer.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
