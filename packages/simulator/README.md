# @dance-arena/simulator

Synthetic and replay event sources that drive the real pipeline through MockConnector.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §53–§54
**Layer:** `platform`
**Depends on:** `@dance-arena/contracts`, `@dance-arena/connectors`

## Responsibility

- Generates synthetic live events and replays recorded sessions.
- Always feeds MockConnector → Normalizer → Core Engine — never STAGE directly.

## Boundaries

- Never bypasses the normalizer or the Core Engine to fake stage output.
- No gameplay rules of its own.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
