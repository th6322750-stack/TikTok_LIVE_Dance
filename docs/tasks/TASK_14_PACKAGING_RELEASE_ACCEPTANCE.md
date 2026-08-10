# Task 14 — Packaging, Release & Acceptance

## Mục tiêu
Tạo bản Windows distributable có versioning/release checklist, không thay đổi architecture.

## Packaging
- electron-builder hoặc tooling đã khóa từ Task 00.
- Windows installer/portable strategy được document.
- app metadata/icon placeholders rõ ràng.
- production source maps/log policy hợp lý.
- dependency lockfile bắt buộc; reproducible install.

## Release checklist
- fresh install trên máy sạch/VM.
- first run.
- CONTROL/STAGE open.
- Simulator vertical slice.
- Euler credential configuration flow.
- connect/disconnect/reconnect.
- STAGE Window Capture 9:16.
- settings persistence/migration.
- license trial/active/expired states.
- diagnostics export.
- uninstall/reinstall behavior theo policy license/settings.

## Acceptance scenario cuối
1. Mở app.
2. Configure connector.
3. Open STAGE.
4. Comment GO từ simulator hoặc LIVE thật -> dancer xuất hiện.
5. Gift 500 -> score/rank + effect.
6. Rank promotion -> VIP update.
7. Reload STAGE -> state phục hồi.
8. Drop WebSocket -> reconnect không reset session.
9. Export diagnostics không chứa secret.

## Deliverables
- build commands.
- artifact naming/version rule.
- `docs/release/RELEASE_CHECKLIST.md`.
- known limitations.
- release candidate tag/PR chỉ khi owner yêu cầu.

## DONE
Có RC build chạy được và toàn bộ acceptance gate quan trọng được ghi kết quả, không chỉ nói “build thành công”.