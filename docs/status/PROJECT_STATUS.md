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
| 09 | Asset, Theme & Visual System | READY — DA-VISUAL-R1 locked, awaiting Claude implementation |
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
