# @dance-arena/logging

Structured logging, levels, redaction and log sinks for diagnostics.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §55–§56
**Layer:** `platform`
**Depends on:** `@dance-arena/contracts`

## Responsibility

- Level-based structured logging (DEBUG/INFO/WARN/ERROR) with pluggable sinks.
- Redacts sensitive fields before anything is written or exported.

## Boundaries

- No unbounded raw-event logging.
- No secrets written in clear text.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
