# @dance-arena/licensing

Machine identity, signature verification, trial and entitlement resolution.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §46–§48
**Layer:** `platform`
**Depends on:** `@dance-arena/contracts`

## Responsibility

- Resolves `LicenseState` and entitlements.
- Runs a license watcher whose lifecycle is independent of the LIVE connection.

## Boundaries

- License lifecycle must never be tied to connector connect/disconnect.
- No secrets in logs or diagnostics bundles.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
