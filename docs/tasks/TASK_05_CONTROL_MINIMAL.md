# Task 05 — CONTROL Minimal

## Mục tiêu
Tạo CONTROL React đủ để vận hành/debug vertical slice, chưa cần đẹp final.

## Scope
`apps/control`.

## Layout tối thiểu
Sidebar + header + dashboard.

## Dashboard phải thấy
- connector status
- LIVE account/configured status placeholder
- session status/time
- viewer count nếu có
- active dancers
- queue count
- session diamonds
- Top 10 ranking
- event feed dev-friendly

## Actions tối thiểu
- Open/close/reload STAGE.
- Connect/disconnect buttons wired typed IPC nhưng connector thật có thể chưa có.
- Clear stage / reset session command nếu core API hỗ trợ.
- Simulator quick actions thông qua IPC/mock path.

## State rule
CONTROL không sở hữu canonical game state. Nó nhận snapshot/incremental updates và gửi intents.

## Tests
- React component smoke.
- IPC adapter mocks.
- snapshot renders expected values.
- command button emits đúng typed command.

## Điều cấm
Không đọc filesystem, không lưu secret, không tự sửa queue/ranking local như source of truth.

## DONE
Streamer/dev có thể quan sát state và kích hoạt các hành động cơ bản để test pipeline.