# NEXT TASK

**Current phase:** Task 09 — Visual R3 final remediation on PR #3  
**Visual owner:** ChatGPT / System Architect  
**Implementation owner:** Claude  
**Status:** READY — `DA-VISUAL-R3` LOCKED

## R3 gate
`DA-VISUAL-R3` is the only approved production visual revision for Task 09.

Required local package:

`DA-VISUAL-R3-production.zip`

SHA256:

`3f10c2c8b75b163a7b168336a3524a6ce092cf2f06e9d6019e7d40fae73391d0`

Expected size: `40,297,364` bytes.  
Expected extraction root: `assets/production/DA-VISUAL-R3`.

## QA state before Claude action
Already CLOSED and accepted — do not retune:

- `DA-QA-001` — per-asset headSocket implementation.
- `DA-QA-003` — crown `0.44x` / badge `0.27x` scale and placement.
- `DA-QA-005` — LOW takeover coverage (`tier4 >= 0.82`, `tier5 >= 1.00`).

R3 artwork fixes ready for final integration QA:

- `DA-QA-002` — five VIP male bodies now have clean transparent avatar sockets and no baked facial identity.
- `DA-QA-004` — source/tile bleed removed; transparent hidden RGB zeroed; affected FX isolated; dancer edge fragments removed; all 7 atlases rebuilt with 4px transparent frame padding.

## Claude action
Continue the existing branch:

`claude/task-09-asset-theme-visual-system`

1. Merge latest `origin/main` into the branch without rewriting Task 09 history.
2. If owner-owned `.dance/**` files conflict, preserve the latest R3 version from `main`.
3. Verify the R3 ZIP SHA256 **before extraction**. If it differs, STOP.
4. Remove `assets/production/DA-VISUAL-R2` and extract R3 to `assets/production/DA-VISUAL-R3`.
5. Verify `104/104` individual assets and `7/7` runtime atlases against the R3 manifest.
6. Update the implementation revision/root from R2 to R3. Asset IDs remain unchanged.
7. Preserve runtime JSON frame coordinates exactly; R3 atlases include 4px transparent padding.
8. Consume the updated R3 per-asset VIP male `headSocket.normalized` values.
9. Do **not** retune crown/badge scale, effect coverage, queue/gameplay, or other already-accepted implementation behavior.
10. Update `.dance/implementation/IMPLEMENTATION_RECEIPT.json` to R3.
11. Run `pnpm validate`.
12. Push PR #3 and STOP for final ChatGPT visual QA.

## Prohibited
- No Task 10.
- No visual redesign/recolor/crop.
- No local replacement art.
- No global head socket.
- No Core Engine gameplay changes for the R3 swap.
