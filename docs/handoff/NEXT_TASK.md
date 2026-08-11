# NEXT TASK

**Current phase:** Task 09 — Visual QA remediation  
**Visual owner:** ChatGPT / System Architect  
**Implementation owner:** Claude  
**Status:** BLOCKED — waiting for `DA-VISUAL-R3`

## QA round 2 result
Claude's R2 implementation remediation is accepted:

- DA-QA-001 CLOSED — per-asset headSocket path works.
- DA-QA-003 CLOSED — crown/badge scale and placement accepted.
- DA-QA-005 CLOSED — LOW Tier-4/Tier-5 coverage logic accepted.

The exact locked R2 artwork failed production QA:

- DA-QA-002 REOPENED — VIP male artwork still exposes baked source facial identity around the avatar opening.
- DA-QA-004 REOPENED — production sprites still contain source-sheet/tile contamination (confirmed on crowns / tier-5 FX and detached fragments on some VIP crops).

## Gate
`.dance/HANDOFF.json` has `claudeMayStart: false`.

Claude must STOP. Do not start Task 10 and do not attempt to repair artwork in renderer code.

## Next action owner
ChatGPT/System Architect will produce `DA-VISUAL-R3` with:

1. clean VIP male avatar sockets with no baked facial identity;
2. isolated transparent crown / gift-FX / VIP sprites with no tile bleed or detached fragments;
3. rebuilt WebP atlases + JSON metadata;
4. updated manifest and SHA256 lock;
5. same stable logical asset IDs wherever possible so PR #3 only needs a visual revision/package swap.

After R3 is locked, Claude will consume it on the existing branch `claude/task-09-asset-theme-visual-system`, run `pnpm validate`, push PR #3 and stop for final visual QA.
