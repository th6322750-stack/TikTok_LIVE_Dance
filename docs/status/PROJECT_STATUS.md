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
| 09 | Asset, Theme & Visual System | IN PROGRESS — ChatGPT visual prep / Claude gated |
| 10 | Auto Host & TTS | TODO |
| 11 | DJ & Audio Reactive | TODO |
| 12 | Settings, Secrets & Licensing | TODO |
| 13 | Diagnostics, Resilience & Performance | TODO |
| 14 | Packaging, Release & Acceptance | TODO |

Trạng thái hợp lệ: `TODO`, `READY`, `IN PROGRESS`, `PR OPEN`, `BLOCKED`, `DONE`.

## Task 00
- PR #1 merged.
- pnpm monorepo, strict TypeScript, architecture guards và validation baseline hoàn tất.

## Tasks 01 → 08
- PR #2 `Tasks 01-08: Core vertical slice` đã được System Architect review vòng cuối và merge bằng merge commit `c569780b8b328fdaa91e02ad2fca630ff99d6af6`.
- GitHub Actions `Validate` PASS trên head `0514e3e9d47a3a2f81b20dea58b3e081b7529abc`.
- Tổng test sau review-fix: **294 test**; `pnpm validate` PASS.
- Core vertical slice đã hoàn chỉnh: Connector → Normalizer → Core Engine → CONTROL / STAGE.
- Các blocker review đã đóng: EulerStream bundle/SDK mapping, reconnect race + close-code policy, finalized gift dedup ledger, queue priority lexicographic.
- Real EulerStream credential smoke test vẫn pending owner; đây là known limitation, không phải blocker cho Task 09.

## Task 09 — Visual ownership gate
- ChatGPT/System Architect sở hữu visual truth và production assets.
- Claude không được tự thiết kế hoặc thay thế visual đang chờ.
- Task 09 chỉ được handoff sang Claude khi `.dance/HANDOFF.json` có `visualSetupComplete: true` và `.dance/DANCE_LOCK.json` khóa đúng visual revision.
- Protocol Task 09 dùng `.dance/` gồm project state, handoff, lock, asset manifest, visual contract, request loop, implementation receipt và QA defects.
