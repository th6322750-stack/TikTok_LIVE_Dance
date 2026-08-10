# Claude — READ FIRST

Tài liệu này định nghĩa cách Claude làm việc trong repo `th6322750-stack/TikTok_LIVE_Dance`.

## Source of truth
Thứ tự ưu tiên khi có xung đột:
1. `docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`
2. Task hiện tại trong `docs/tasks/`
3. ADR đã được duyệt trong `docs/decisions/`
4. Code hiện có
5. Suy luận của Claude

Không được tự ý phá kiến trúc A để làm nhanh hơn.

## Git workflow bắt buộc
- Không push trực tiếp vào `main`.
- Mỗi task dùng branch riêng: `claude/task-XX-short-name`.
- Chỉ sửa phạm vi task; tránh refactor ngoài scope.
- Commit nhỏ, rõ nghĩa.
- Khi xong mở PR vào `main`.
- PR phải ghi: mục tiêu, file chính đã đổi, test đã chạy, kết quả, assumption, known limitations, architecture deviation nếu có.
- Nếu có architecture deviation, tạo ADR trong `docs/decisions/ADR-XXXX-*.md`; không âm thầm đổi thiết kế.

## Definition of Done chung
Một task chỉ DONE khi:
- TypeScript typecheck pass.
- Test liên quan pass.
- Không có secret/API key bị commit.
- Không thêm `any` tràn lan để né type system.
- Không để renderer truy cập trực tiếp Node/Electron APIs ngoài preload whitelist.
- Không nhét gameplay vào Electron Main, React hoặc Pixi renderer.
- Có README/doc ngắn nếu public API/module mới cần giải thích.
- PR mô tả đầy đủ validation.

## Coding rules
- TypeScript strict.
- Ưu tiên pure functions trong domain/core.
- Zod ở boundary nhận dữ liệu ngoài hệ thống.
- Không dùng nickname làm user identity.
- Core Engine không import Electron, React, PixiJS.
- Connector không chứa ranking/VIP/queue/gameplay.
- STAGE chỉ render; CONTROL chỉ gửi intent/command và hiển thị state.
- Canonical game state thuộc Core Engine.
- Mọi IPC channel phải typed và nằm trong contracts.
- Log phải redact secret.

## Khi task chưa rõ
Không tự mở rộng scope. Ghi assumption trong PR. Nếu assumption ảnh hưởng kiến trúc, tạo ADR đề xuất thay vì tự đổi A.

## Sau khi hoàn thành task
1. Chạy validation nêu trong task.
2. Cập nhật `docs/status/PROJECT_STATUS.md` trên branch với trạng thái task và PR.
3. Mở PR.
4. Dừng tại đó để review trước khi sang task phụ thuộc tiếp theo.