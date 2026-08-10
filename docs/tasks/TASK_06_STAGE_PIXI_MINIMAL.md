# Task 06 — STAGE Pixi Minimal

## Mục tiêu
Tạo STAGE 9:16 bằng PixiJS, render state từ Engine qua IPC.

## Layers bắt buộc
Background, DJ placeholder, Environment, NormalDancer, VIP, Particle, GiftFX, Overlay, Announcement.

## Bắt buộc
- hỗ trợ normalized logical coordinates/slot mapping.
- `DancerView`: body placeholder, avatar mask/fallback, nickname, optional rank badge.
- xử lý `stage:snapshot` để rebuild sau reload.
- xử lý incremental events: dancer spawn/move/remove, ranking change, gift effect placeholder, spotlight, announcement, party goal.
- 720x1280 và 1080x1920 scale đúng.

## Performance
Không re-create toàn scene mỗi event. Không nhận full GameState 60fps.

## Tests/validation
- snapshot với 10 dancers dựng đúng count.
- spawn/remove incremental không duplicate.
- reload + snapshot phục hồi scene.
- resize giữ layout 9:16/normalized coordinates.

## Điều cấm
Không xếp hạng, không tính gift tier, không queue logic trong Pixi.

## DONE
Simulator có thể khiến dancer placeholder xuất hiện/di chuyển/biến mất trên STAGE và reload vẫn khôi phục được.