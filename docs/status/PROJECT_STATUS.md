# Dance Arena V2 — Project Status

Kiến trúc: **A — approved**  
Execution plan: **B — approved**

| Task | Tên | Trạng thái |
|---|---|---|
| 00 | Bootstrap monorepo | PR OPEN — branch `claude/task-00-bootstrap-monorepo` |
| 01 | Contracts & schemas | TODO |
| 02 | Core Game Engine | TODO |
| 03 | Simulator & Replay | TODO |
| 04 | Electron Shell & Typed IPC | TODO |
| 05 | CONTROL Minimal | TODO |
| 06 | STAGE Pixi Minimal | TODO |
| 07 | EulerStream Connector & Normalizer | TODO |
| 08 | End-to-End Gameplay Integration | TODO |
| 09 | Asset, Theme & Visual System | TODO |
| 10 | Auto Host & TTS | TODO |
| 11 | DJ & Audio Reactive | TODO |
| 12 | Settings, Secrets & Licensing | TODO |
| 13 | Diagnostics, Resilience & Performance | TODO |
| 14 | Packaging, Release & Acceptance | TODO |

Trạng thái hợp lệ: `TODO`, `IN PROGRESS`, `PR OPEN`, `BLOCKED`, `DONE`.

Claude cập nhật file này trong PR của từng task. ChatGPT review và quyết định task tiếp theo.

## Ghi chú theo task

### Task 00 — Bootstrap monorepo
- pnpm workspace + 3 apps (`desktop`, `control`, `stage`) + 8 packages đã dựng xong.
- Stack: Electron 43 + electron-vite 5, Vite 7, React 19, PixiJS 8, TypeScript 5.9 strict, Vitest 4, ESLint 10 + Prettier 3.
- Dependency direction được enforce tự động bằng ESLint và `pnpm arch:check`.
- Validation: `pnpm validate` (format + lint + arch + typecheck + test + build) PASS; fresh install từ lockfile PASS.
- Chưa có: gameplay, contracts thật, IPC, cửa sổ Electron, CI workflow (xem PR để biết chi tiết).
