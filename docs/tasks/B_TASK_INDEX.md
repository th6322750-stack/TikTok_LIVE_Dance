# B — Claude Execution Plan

Đây là kế hoạch triển khai chính thức của Dance Arena V2 dựa trên Blueprint A.

## Trước khi code
Claude phải đọc:
1. `docs/handoff/CLAUDE_READ_FIRST.md`
2. `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`
3. File task hiện tại

## Thứ tự task

| # | Task | Phụ thuộc | Gate chính |
|---|---|---|---|
| 00 | Bootstrap monorepo | A | workspace/typecheck/test skeleton |
| 01 | Contracts & schemas | 00 | schemas + fixtures + validation |
| 02 | Core Game Engine | 01 | deterministic unit tests |
| 03 | Simulator & Replay | 01,02 | events đi đúng real pipeline |
| 04 | Electron Shell & Typed IPC | 01 | 2 windows + preload whitelist |
| 05 | CONTROL Minimal | 04 | dashboard/state/commands minimal |
| 06 | STAGE Pixi Minimal | 04 | snapshot + incremental stage events |
| 07 | EulerStream Connector & Normalizer | 01,04 | connect/reconnect/raw->normalized |
| 08 | E2E Gameplay Integration | 02-07 | GO + gift + rank + stage chạy end-to-end |
| 09 | Asset, Theme & Visual System | 06,08 | registry/cache/theme/perf-safe visual |
| 10 | Auto Host & TTS | 02,08 | rules + queue + priority/cooldown |
| 11 | DJ & Audio Reactive | 06,08 | audio signals -> stage reactive |
| 12 | Settings, Secrets & Licensing | 04,08 | migration + secret protection + entitlement |
| 13 | Diagnostics, Resilience & Performance | 08-12 | reload/reconnect/logs/load tests |
| 14 | Packaging, Release & Acceptance | 13 | Windows artifact + acceptance checklist |

## Milestone gates

### M1 — Offline vertical slice
Tasks 00–06. Simulator có thể tạo user, spawn dancer và STAGE render mà chưa cần TikTok thật.

### M2 — Real LIVE vertical slice
Tasks 07–08. TikTok/EulerStream thật có thể comment GO, avatar lên sân, gift cập nhật điểm/ranking/effect.

### M3 — Product feature set
Tasks 09–12. Visual/asset, Auto Host, DJ/audio, settings/license hoàn chỉnh.

### M4 — Commercial hardening
Tasks 13–14. Diagnostics, long-run stability, build/release.

## Quy tắc review
Không gộp nhiều task lớn vào một PR. Task sau chỉ nên bắt đầu khi dependency đã merge hoặc có quyết định rõ ràng từ người review.