# DA-VISUAL-R3 — Neon Kawaii Arena

Production visual revision for Task 09 final QA.

- logical assets: 104 (same stable IDs as R2)
- visual revision: DA-VISUAL-R3
- per-asset dancer head sockets
- VIP male bodies: original facial identity removed; clean avatar sockets
- detached source-sheet fragments removed from dancer silhouettes
- hidden RGB under transparent pixels zeroed across source sprites
- contaminated gift/FX crops isolated to their intended sprite
- runtime atlases rebuilt with 4px transparent frame padding to prevent sampling bleed
- crown target scale: 0.44 body width
- rank badge target scale: 0.27 body width
- LOW mode: tier-4 coverage >= 0.82 stage width; tier-5 coverage >= 1.00 stage width when largeTakeovers=true
- runtime format: lossless WebP + JSON frame metadata
