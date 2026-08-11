# NEXT TASK

**Current phase:** Task 09 — Visual R2 remediation on PR #3  
**Visual owner:** ChatGPT / System Architect  
**Implementation owner:** Claude  
**Status:** READY — `DA-VISUAL-R2` LOCKED

## Gate status
Visual R2 is authoritative:

- `.dance/HANDOFF.json`: `visualSetupComplete: true`
- `.dance/DANCE_LOCK.json`: `status: LOCKED`, `visualRevision: DA-VISUAL-R2`
- `.dance/VISUAL_CONTRACT.json`: `status: APPROVED_LOCKED`
- `.dance/ASSET_MANIFEST.json`: `status: APPROVED_LOCKED`

## Required binary package
Claude must have locally:

`DA-VISUAL-R2-production.zip`

SHA256:

`42b2b47554def73a6fd611fa6cf449106e01cb0f432b582f2e1f59f1961c3559`

Expected size: `35,870,901` bytes.  
Expected extraction root: `assets/production/DA-VISUAL-R2`.

## Task 09 PR #3 remediation
Do not start a new Task 09 implementation from scratch. Continue branch:

`claude/task-09-asset-theme-visual-system`

1. Merge/rebase the latest `main` visual-owner metadata into the branch without rewriting the existing 01→09 history unnecessarily.
2. Verify R2 ZIP SHA256 before extraction.
3. Replace R1 production runtime assets with R2 and update theme revision/path to `DA-VISUAL-R2`.
4. Consume exact per-asset `headSocket.normalized` metadata.
5. Apply crown width `0.44 × body width` and rank badge width `0.27 × body width`.
6. LOW mode with `largeTakeovers=true`: Tier 4 coverage must be at least `0.82 × stage width`; Tier 5 at least `1.00 × stage width`.
7. Keep dedicated DJ artwork deferred to Task 11.
8. Mark `DA-REQ-001` CONSUMED after integration.
9. Run `pnpm validate`, update implementation receipt, push PR #3, then STOP for ChatGPT visual QA round 2.

## Prohibited
- No visual redesign.
- No global head-socket fallback when per-asset geometry exists.
- No R1 asset substitution after R2 is consumed.
- No Task 10 work before Task 09 visual QA closes.
