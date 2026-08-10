# Task 12 — Settings, Secrets & Licensing

## Mục tiêu
Tạo persistence/versioning và entitlement an toàn hơn bản cũ.

## Settings
- schema có `configVersion`.
- load/validate/update/import/export.
- migration functions giữa version.
- export phải sanitize secret.

## Secrets
Euler API key tách khỏi settings thường. Dùng OS-backed encryption/secure storage phù hợp Electron/Windows nếu khả thi. Renderer chỉ cần biết `configured:true/false`, không nhận key trừ khi flow edit thật sự cần và được thiết kế có chủ đích.

## Licensing
- MachineIdentity abstraction.
- signed offline license verification (Ed25519 hoặc equivalent documented design).
- states: trial/active/expired/invalid/grace-period.
- EntitlementResolver và TrialManager.
- LicenseWatcher start theo app lifecycle, không bị connect/disconnect LIVE clear nhầm.
- online validation có thể là interface/stub nếu server chưa tồn tại; không bịa endpoint.

## Gate
CONNECT_LIVE và feature entitlement check ở service/core boundary, không chỉ disable button UI.

## Tests
- valid/invalid/expired signature fixtures.
- trial countdown với fake clock.
- clock rollback handling theo policy đã document.
- settings vN migration.
- export không chứa API key/license secret.
- connect/disconnect không tắt license watcher.

## DONE
Không lặp bug demo timer cũ; secret không nằm plaintext trong export/log bình thường.