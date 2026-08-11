# Dance Arena V2 — Project Status

Kiến trúc: **A — approved**  
Execution plan: **B — approved**

| Task | Tên | Trạng thái |
|---|---|---|
| 00 | Bootstrap monorepo | DONE — PR #1 merged |
| 01 | Contracts & schemas | PR OPEN — batch 01→08 |
| 02 | Core Game Engine | PR OPEN — batch 01→08 |
| 03 | Simulator & Replay | PR OPEN — batch 01→08 |
| 04 | Electron Shell & Typed IPC | PR OPEN — batch 01→08 |
| 05 | CONTROL Minimal | PR OPEN — batch 01→08 |
| 06 | STAGE Pixi Minimal | PR OPEN — batch 01→08 |
| 07 | EulerStream Connector & Normalizer | PR OPEN — batch 01→08 |
| 08 | End-to-End Gameplay Integration | PR OPEN — batch 01→08 |
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

**Kết quả batch (chờ review):**

| Task | Nội dung chính | Test |
|---|---|---|
| 01 | contracts Zod-first: 6 normalized event, connector status, GameState, StageEvent, typed IPC | 32 |
| 02 | Core Engine pure TS: registry/command/cooldown/queue/slot/gift dedup/ranking/VIP/party goal | 49 |
| 03 | MockConnector + ReplayConnector + normalizer boundary; scenario/recorder/gift presets | 20 |
| 04 | CoreRuntime (Electron-free) + WindowManager + typed IpcRouter + 2 preload whitelist | 24 |
| 05 | CONTROL React: projection reducer, dashboard, queue/ranking/feed, simulator + stage controls | 22 |
| 06 | STAGE: scene controller theo port + Pixi layer stack, DancerView placeholder, slot layout 9:16 | 19 |
| 07 | EulerStreamConnector (status machine, backoff+jitter, heartbeat) + normalizer phòng thủ | 38 |
| 08 | E2E: join flow, gift flow, streak regression, STAGE reload, CONTROL reload, reconnect | 15 |

- Tổng: **231 test** trên 22 file. `pnpm validate` PASS (format, lint, arch, typecheck, test, build).
- Vertical slice offline chạy đúng: `GO` → queue/dancer → STAGE spawn; gift 500 → diamonds → ranking → VIP → gift effect tier-4 → CONTROL cập nhật.
- **Real credential smoke test pending owner** — chưa có TikTok LIVE account + EulerStream API key trong môi trường dev. Đường đi provider được phủ bằng fixture payload chạy qua đúng connector thật + fake transport.
