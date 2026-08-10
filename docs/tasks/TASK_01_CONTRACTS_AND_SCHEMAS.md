# Task 01 — Contracts & Schemas

## Mục tiêu
Tạo ngôn ngữ chung của toàn hệ thống. Đây là contract mà các task sau phải dùng.

## Scope
Chủ yếu `packages/contracts`.

## Bắt buộc có
- `LiveUser` dùng platform ID làm identity.
- normalized event v1: Comment, Gift, Follow, Share, Join, Like.
- ConnectorStatus state machine types.
- GameState, UserState, QueueEntry, DancerState, Ranking/VIP/PartyGoal/Spotlight.
- GameCommand nội bộ.
- Stage snapshot + incremental StageEvent types.
- CONTROL command/request/response contracts.
- Settings schema version field.
- LicenseState/entitlement contracts.
- Zod schemas cho dữ liệu đi qua external/IPC boundaries.

## Quy tắc GiftEvent
Phải biểu diễn gift id/name, diamondValue, repeatCount, totalDiamonds, streak, streakEnded, transactionId?, imageUrl?. Không gắn logic tier vào schema.

## IPC
Channel name phải namespace rõ: `connector:*`, `game:*`, `stage:*`, `settings:*`, `assets:*`, `license:*`, `diagnostics:*`, `simulator:*`.

## Tests
- valid fixtures parse thành công.
- malformed fixtures fail có message hợp lý.
- union discrimination theo `type` hoạt động.
- serialization roundtrip cho snapshot/events.

## Điều cấm
- Không import Electron/React/Pixi.
- Không nhúng logic ranking/queue.
- Không dùng `any` để nhận raw provider.

## DONE
Tất cả package có thể import contracts mà không tạo circular dependency; fixture tests pass.