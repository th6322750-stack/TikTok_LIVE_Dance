# @dance-arena/assets

Asset registry and manifest metadata resolution.

**Blueprint:** `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md` §32–§34, §65
**Layer:** `platform`
**Depends on:** `@dance-arena/contracts`

## Responsibility

- Resolves `AssetDefinition` entries from theme manifests.
- Owns avatar/texture cache policy metadata.

## Boundaries

- No hard-coded asset paths in gameplay or renderer logic — resolution happens here.
- No PixiJS imports; STAGE turns asset descriptors into textures.

## Status

Task 00 skeleton: public entry point only. Real implementation lands in the task that owns this module (see `docs/tasks/B_TASK_INDEX.md`).
