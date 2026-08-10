# Task 07 — EulerStream Connector & Normalizer

## Mục tiêu
Kết nối LIVE thật nhưng cô lập provider-specific schema khỏi Core Engine.

## Scope
`packages/connectors` + composition trong desktop.

## EulerStreamConnector
- implement LiveConnector.
- connect/disconnect.
- status machine: idle/connecting/connected/reconnecting/disconnecting/error.
- exponential reconnect 1,2,4,8,15,30s capped + jitter.
- heartbeat/close/error handling theo provider behavior.
- structured logging có redact API key.

## Normalizer
Raw provider payload phải validate/parse an toàn và chuyển thành contracts v1. Dùng fallback field mapping khi schema gift/user có biến thể, nhưng gom provider-specific logic trong adapter/normalizer.

## Gift
Phải giữ đủ dữ liệu cho streak/dedup: transaction ID nếu có, repeatCount, repeat end/state, diamond value, gift ID/name/image.

## Security
API key không log. Không gửi raw secret xuống CONTROL/STAGE.

## Tests
- fixtures raw comment/gift/follow/share/join/like -> normalized event đúng.
- malformed payload không crash connector.
- reconnect schedule test với fake timers.
- disconnect intentional không auto reconnect.

## Điều cấm
Không ranking/VIP/FX trong connector.

## DONE
Có thể kết nối một LIVE thật và emit normalized events mà Core không biết Euler schema.