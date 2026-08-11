# NEXT TASK

**Current phase:** Task 09 — Asset, Theme & Visual System  
**Visual owner:** ChatGPT / System Architect  
**Implementation owner:** Claude (WAITING FOR HANDOFF)  
**Status:** VISUAL PREP IN PROGRESS

## Hard gate
Claude MUST NOT start Task 09 implementation until both are true:

1. `.dance/HANDOFF.json` has `visualSetupComplete: true`.
2. `.dance/DANCE_LOCK.json` has status `LOCKED` and identifies the active visual revision/assets.

Until then, missing artwork/spec is a visual-owner responsibility, not permission for Claude to invent it.

## ChatGPT visual-prep scope
- define the Task 09 visual system and asset IDs;
- render/prepare production LIVE assets;
- publish/update `.dance/ASSET_MANIFEST.json`;
- publish/update `.dance/VISUAL_CONTRACT.json`;
- resolve visual requests;
- lock the approved handoff revision.

## Claude read order after the gate opens
1. `docs/handoff/CLAUDE_READ_FIRST.md`
2. `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`
3. `docs/tasks/TASK_09_ASSET_THEME_VISUAL_SYSTEM.md`
4. `.dance/PROJECT_STATE.yaml`
5. `.dance/HANDOFF.json`
6. `.dance/DANCE_LOCK.json`
7. `.dance/VISUAL_CONTRACT.json`
8. `.dance/ASSET_MANIFEST.json`
9. production assets referenced by the manifest

## Claude Git action after handoff
Create branch `claude/task-09-asset-theme-visual-system`, consume the exact locked visual revision, implement Task 09 without redesigning approved assets, run validation, publish `.dance/implementation/IMPLEMENTATION_RECEIPT.json`, open a PR to `main`, then stop for ChatGPT visual QA.
