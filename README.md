# TikTok LIVE Dance Arena V2

Repository trung gian cho quá trình thiết kế và phát triển **TikTok LIVE Dance Arena V2**.

## Cách làm việc

- **ChatGPT**: kiến trúc hệ thống, đặc tả kỹ thuật, UI/UX spec, acceptance criteria, review và asset hình khi cần.
- **Claude**: triển khai code theo spec/task đã được commit lên repository.
- **GitHub**: nguồn sự thật chung để trao đổi giữa hai bên.

## Tài liệu kiến trúc

- [`docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`](docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md) — Blueprint A: kiến trúc tổng thể Dance Arena V2.
- [`docs/tasks/B_TASK_INDEX.md`](docs/tasks/B_TASK_INDEX.md) — kế hoạch triển khai và thứ tự task.
- [`docs/status/PROJECT_STATUS.md`](docs/status/PROJECT_STATUS.md) — trạng thái từng task.

## Nguyên tắc kiến trúc cốt lõi

```text
Connector -> Normalizer -> Core Engine -> CONTROL / STAGE
```

- TikTok data không đi thẳng vào STAGE.
- STAGE không quyết định gameplay.
- CONTROL không sở hữu canonical game state.
- Core Engine không phụ thuộc React, PixiJS hoặc Electron.

---

## Yêu cầu môi trường

| Công cụ | Phiên bản |
| --- | --- |
| Node.js | `^22.13.0 \|\| >= 24` (xem `.nvmrc`; ESLint 10 không chạy trên 22.12) |
| pnpm | `>= 10` (`corepack enable pnpm` hoặc `npm i -g pnpm@10`) |

`engine-strict=true` nên install sẽ fail sớm nếu sai phiên bản Node/pnpm.

## Bắt đầu

```bash
pnpm install          # electron tải binary lazily ở lần chạy desktop đầu tiên
pnpm validate         # format + lint + arch + typecheck + test + build
```

Các script ở root:

| Script | Mô tả |
| --- | --- |
| `pnpm dev` | chạy song song dev script của mọi app |
| `pnpm dev:control` | CONTROL (Vite) tại `http://localhost:5273` |
| `pnpm dev:stage` | STAGE (Vite) tại `http://localhost:5274` |
| `pnpm dev:desktop` | Electron shell (electron-vite) |
| `pnpm build` | build toàn workspace theo thứ tự topological |
| `pnpm typecheck` | `tsc` cho từng project |
| `pnpm test` | Vitest cho toàn workspace |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm arch:check` | kiểm tra dependency direction ở mức package.json |
| `pnpm clean` | xoá build output |

> Task 00 mới chỉ dựng khung. `pnpm dev:desktop` khởi động Electron nhưng **chưa mở cửa sổ nào** — WindowManager và typed IPC thuộc Task 04.

## Cấu trúc workspace

```text
apps/
├── desktop/    Electron Main + preload (lifecycle, windows, IPC, services)
├── control/    CONTROL renderer — React
└── stage/      STAGE renderer — PixiJS

packages/
├── contracts/    schema/type/IPC contract dùng chung (leaf của dependency graph)
├── core-engine/  canonical game state, pure TypeScript
├── connectors/   LiveConnector: EulerStream / Mock / Replay
├── settings/     config versioning + migration
├── assets/       asset registry/manifest
├── licensing/    machine identity, entitlement, trial
├── logging/      structured logging + redaction
└── simulator/    synthetic + replay event source

scripts/          workspace tooling (architecture guard, clean)
docs/             blueprint, task, ADR, status
```

Mỗi package có `README.md` riêng ghi rõ trách nhiệm và ranh giới của nó.

## Dependency direction

```text
contracts  ←  core-engine / connectors / settings / assets / licensing / logging / simulator  ←  apps
```

Quy tắc bắt buộc (Blueprint §67):

- `packages/**` không được import Electron, React hoặc PixiJS.
- `contracts` và `core-engine` không được import cả Node built-ins (giữ pure và deterministic).
- Renderer (`apps/control`, `apps/stage`) không được import Electron hay Node API — chỉ dùng preload whitelist.
- CONTROL không import PixiJS; STAGE không import React.

Các quy tắc này được enforce tự động ở hai tầng:

1. **ESLint** (`eslint.config.mjs`) — chặn ở mức import.
2. **`pnpm arch:check`** (`scripts/check-dependency-direction.mjs`) — chặn ở mức `package.json`, đồng thời phát hiện dependency cycle và workspace edge sai.

## Quy ước TypeScript

- `tsconfig.base.json` bật `strict` cùng `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`.
- Package được consume **từ source** (`exports` trỏ tới `./src/index.ts`) nên typecheck và Vite/electron-vite không cần build trước.
- `pnpm build` vẫn compile từng package độc lập bằng `tsc` (`tsconfig.build.json`) để đảm bảo mỗi package tự compile được với declaration của dependency.
