# @dance-arena/settings

Settings load/validate/migrate/export with a versioned config schema.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §43–§45
**Layer:** `platform`
**Depends on:** `@dance-arena/contracts`

## Responsibility

- Loads, validates and migrates the versioned settings document (`configVersion`).
- Keeps secrets out of the exportable settings document.

## Boundaries

- No gameplay logic.
- No plaintext secrets in exported/diagnostic output.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
