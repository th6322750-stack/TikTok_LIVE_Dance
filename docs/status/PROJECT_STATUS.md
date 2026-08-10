# Dance Arena V2 — Project Status

Kiến trúc: **A — approved**  
Execution plan: **B — approved**

| Task | Tên | Trạng thái |
|---|---|---|
| 00 | Bootstrap monorepo | DONE — PR #1 merged |
| 01 | Contracts & schemas | READY — batch 01→08 |
| 02 | Core Game Engine | TODO — batch 01→08 |
| 03 | Simulator & Replay | TODO — batch 01→08 |
| 04 | Electron Shell & Typed IPC | TODO — batch 01→08 |
| 05 | CONTROL Minimal | TODO — batch 01→08 |
| 06 | STAGE Pixi Minimal | TODO — batch 01→08 |
| 07 | EulerStream Connector & Normalizer | TODO — batch 01→08 |
| 08 | End-to-End Gameplay Integration | TODO — batch 01→08 |
| 09 | Asset, Theme & Visual System | BLOCKED — waiting for ChatGPT production assets |
| 10 | Auto Host & TTS | TODO |
| 11 | DJ & Audio Reactive | TODO |
| 12 | Settings, Secrets & Licensing | TODO |
| 13 | Diagnostics, Resilience & Performance | TODO |
| 14 | Packaging, Release & Acceptance | TODO |

Trạng thái hợp lệ: `TODO`, `READY`, `IN PROGRESS`, `PR OPEN`, `BLOCKED`, `DONE`.

Claude cập nhật file này trong PR/batch. ChatGPT review và quyết định giai đoạn tiếp theo.

## Ghi chú theo task

### Task 00 — Bootstrap monorepo
- PR #1 đã được System Architect review PASS và squash-merge vào `main`.
- pnpm workspace + 3 apps (`desktop`, `control`, `stage`) + 8 packages đã dựng xong.
- Stack: Electron 43 + electron-vite 5, Vite 7, React 19, PixiJS 8, TypeScript 5.9 strict, Vitest 4, ESLint 10 + Prettier 3.
- Dependency direction được enforce bằng ESLint và `pnpm arch:check`.
- Validation: `pnpm validate` PASS; fresh install từ lockfile PASS.
- Kiến trúc xác nhận: `simulator -> connectors` hợp lệ; Core/Contracts không dùng Node built-ins; source-first exports được chấp nhận trong monorepo private hiện tại.

### Batch 01 → 08
- Owner override: Claude được triển khai liên tục Tasks 01–08 trên branch `claude/batch-01-08-core-vertical-slice`.
- Một commit checkpoint cho mỗi task.
- Không được bỏ qua validation của task đang làm.
- Sau Task 08 mở PR và dừng để System Architect review.
- Task 09 không được bắt đầu trước khi ChatGPT tạo bộ production assets.
