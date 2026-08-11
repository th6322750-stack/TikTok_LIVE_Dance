# NEXT TASK

**Current phase:** Task 09 — Asset, Theme & Visual System  
**Visual owner:** ChatGPT / System Architect  
**Implementation owner:** Claude  
**Status:** READY — `DA-VISUAL-R1` LOCKED

## Gate status
The visual gate is OPEN:

- `.dance/HANDOFF.json`: `visualSetupComplete: true`
- `.dance/DANCE_LOCK.json`: `status: LOCKED`, `locked: true`
- `.dance/ASSET_MANIFEST.json`: `status: APPROVED_LOCKED`

## Required binary package
Before coding, Claude must have this exact file locally:

`DA-VISUAL-R1-production.zip`

Expected SHA256:

`e297760bb8f1d5d6b7b28cb98f0dc08bccdeceb350511d3fed1b60c2676ebef1`

Expected size: `40,076,049` bytes.  
Expected extraction root: `assets/production/DA-VISUAL-R1`.

If the package is not present in the local repo, STOP and request it from the owner. Do not recreate or substitute artwork.

## Claude read order
1. `docs/handoff/CLAUDE_READ_FIRST.md`
2. `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`
3. `docs/tasks/TASK_09_ASSET_THEME_VISUAL_SYSTEM.md`
4. `.dance/PROJECT_STATE.yaml`
5. `.dance/HANDOFF.json`
6. `.dance/DANCE_LOCK.json`
7. `.dance/VISUAL_CONTRACT.json`
8. `.dance/ASSET_MANIFEST.json`
9. extract and inspect the locked production package

## Required Git action
1. Sync `main`.
2. Create branch `claude/task-09-asset-theme-visual-system`.
3. Verify package SHA256 before extraction.
4. Extract it under `assets/production/DA-VISUAL-R1` without redesigning assets.
5. Implement manifest-driven AssetService / Theme Registry / AvatarCache / Pixi visual integration / effect scheduling / performance modes according to Task 09.
6. Use `headSocket` and pivot geometry from the locked manifest.
7. Run validation and visual state tests.
8. Publish `.dance/implementation/IMPLEMENTATION_RECEIPT.json` with the exact consumed visual revision/package SHA.
9. Open PR to `main` and STOP for ChatGPT visual QA.

## Prohibited
- No visual redesign.
- No replacing locked art with placeholders as final output.
- No hard-coded source-sheet coordinates.
- No Core Engine gameplay changes merely to fit a theme.
- No Task 10 work before Task 09 visual QA closes.
