# Task 00 — Bootstrap Monorepo

## Mục tiêu
Tạo skeleton repo production-ready nhưng chưa implement gameplay/UI thật.

## Phải tạo
- pnpm workspace.
- `apps/desktop`, `apps/control`, `apps/stage`.
- `packages/contracts`, `core-engine`, `connectors`, `settings`, `assets`, `licensing`, `logging`, `simulator`.
- TypeScript strict base config.
- scripts root: `dev`, `build`, `typecheck`, `test`, `lint`.
- test runner thống nhất (ưu tiên Vitest).
- formatter/linter thống nhất.
- `.gitignore`, `.editorconfig`, Node/pnpm engine version.

## Stack khóa
Electron + TypeScript + Vite + React cho CONTROL + PixiJS cho STAGE + Zod tại external boundaries. Không thay framework nếu không có ADR.

## Điều cấm
- Không implement gameplay.
- Không kết nối EulerStream.
- Không license logic.
- Không tạo UI phức tạp.
- Không bỏ `strict` để build cho qua.

## Validation
- fresh install thành công.
- `pnpm typecheck` pass.
- `pnpm test` pass dù mới chỉ có smoke tests.
- `pnpm build` tạo được các package/app skeleton cần thiết.
- dependency direction không làm core import Electron/React/Pixi.

## DONE
Workspace clean, reproducible, task sau có thể thêm contracts mà không phải đổi lại cấu trúc nền.