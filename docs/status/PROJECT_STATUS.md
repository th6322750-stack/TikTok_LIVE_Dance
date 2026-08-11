# Dance Arena V2 — Project Status

Kiến trúc: **A — approved**  
Execution plan: **B — approved**

| Task | Tên | Trạng thái |
|---|---|---|
| 00 | Bootstrap monorepo | DONE — PR #1 merged |
| 01 | Contracts & schemas | DONE — PR #2 merged |
| 02 | Core Game Engine | DONE — PR #2 merged |
| 03 | Simulator & Replay | DONE — PR #2 merged |
| 04 | Electron Shell & Typed IPC | DONE — PR #2 merged |
| 05 | CONTROL Minimal | DONE — PR #2 merged |
| 06 | STAGE Pixi Minimal | DONE — PR #2 merged |
| 07 | EulerStream Connector & Normalizer | DONE — PR #2 merged |
| 08 | End-to-End Gameplay Integration | DONE — PR #2 merged |
| 09 | Asset, Theme & Visual System | PR OPEN — DA-VISUAL-R1 consumed, awaiting ChatGPT visual QA |
| 10 | Auto Host & TTS | TODO |
| 11 | DJ & Audio Reactive | TODO |
| 12 | Settings, Secrets & Licensing | TODO |
| 13 | Diagnostics, Resilience & Performance | TODO |
| 14 | Packaging, Release & Acceptance | TODO |

Trạng thái hợp lệ: `TODO`, `READY`, `IN PROGRESS`, `PR OPEN`, `BLOCKED`, `DONE`.

## Tasks 00 → 08
- PR #1 và PR #2 đã merge.
- Core vertical slice hoàn chỉnh: Connector → Normalizer → Core Engine → CONTROL / STAGE.
- GitHub Actions Validate PASS sau review-fix; tổng regression suite tại thời điểm merge batch là 294 test.
- Real EulerStream credential smoke test vẫn pending owner; không block Task 09.

## Task 09 — DA-VISUAL-R1
- Theme: **Neon Kawaii Arena**.
- Visual owner: ChatGPT/System Architect.
- Production pack đã được tách/chuẩn hóa/đóng gói: **104 logical assets**.
- Asset groups: 12 regular dancer, 10 VIP dancer, 24 reaction, 14 command bubble, gift/FX tiers, Top/rank/accessories, stage/UI/background, fallback avatar.
- Regular canvas: 512×768; VIP canvas: 560×840; stage: 9:16.
- Head sockets chuẩn hóa và được khóa trong manifest để avatar TikTok render theo mask thay vì hard-code theo costume.
- Runtime distribution ưu tiên WebP atlases + JSON frame metadata; individual PNG/WebP được giữ trong production source package.
- Locked package: `DA-VISUAL-R1-production.zip`, SHA256 `e297760bb8f1d5d6b7b28cb98f0dc08bccdeceb350511d3fed1b60c2676ebef1`, 40,076,049 bytes.
- `.dance/ASSET_MANIFEST.json`: APPROVED_LOCKED.
- `.dance/DANCE_LOCK.json`: LOCKED.
- `.dance/HANDOFF.json`: visualSetupComplete=true; Claude implementation gate OPEN once the exact locked ZIP is available in the local repository and its SHA is verified.
- Claude must implement Task 09 on branch `claude/task-09-asset-theme-visual-system`, publish implementation receipt, open PR, and stop for ChatGPT visual QA.

### Task 09 — implementation result (chờ visual QA)
- Branch `claude/task-09-asset-theme-visual-system`; receipt tại `.dance/implementation/IMPLEMENTATION_RECEIPT.json`.
- ZIP SHA256 khớp lock; **104/104 asset + 7/7 atlas** verify sha256 theo manifest, 0 problem.
- Asset trong git theo quyết định owner: chỉ runtime WebP + JSON + manifest + contact sheet (122 file, 7.93 MB); 111 PNG editing source giữ ngoài repo trong ZIP đã ghi hash.
- AssetService (`packages/assets`): Zod validate manifest/atlas ở boundary, registry tra theo asset ID + fallback theo category, theme là DATA bind slot→id, AvatarCache memory LRU + disk port + TTL 48h + fallback.
- STAGE: atlas frame theo metadata (không hard-code toạ độ), avatar đặt tại `headSocket` của manifest, crown/badge/aura cho Top 1–3, effect scheduler chống gift spam theo performance profile, theme switch không đổi gameplay state.
- Tests: **363** (294 → 363, +69). `pnpm validate` PASS toàn bộ.
- `.dance/requests/DA-REQ-001.json` OPEN: `VISUAL_CONTRACT.json` (DRAFT) tham chiếu id/geometry không có trong package APPROVED_LOCKED; đã bind sang asset approved cùng category, không tự vẽ hay recolor.
