# Task 04 — Electron Shell & Typed IPC

## Mục tiêu
Tạo desktop runtime ổn định với CONTROL/STAGE tách biệt và IPC whitelist.

## Scope
`apps/desktop` và contracts IPC cần bổ sung hợp lý.

## Bắt buộc
- AppLifecycleManager.
- WindowManager cho CONTROL/STAGE.
- preload riêng cho từng renderer.
- `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` nếu Electron target hỗ trợ flow hiện tại.
- typed IpcRouter dựa trên contracts.
- CONTROL/STAGE `ready` handshake và snapshot request.
- stage open/close/reload/always-on-top/bounds API.
- service composition root, nhưng chưa nhét gameplay vào `main.ts`.

## Security
Không expose `ipcRenderer`, `fs`, `process`, shell chung cho renderer. Chỉ expose high-level whitelist API.

## Resilience
CONTROL reload không làm disconnect runtime. STAGE reload phải có đường lấy snapshot lại.

## Tests/validation
- smoke launch 2 window.
- validate preload surface chỉ có API cho phép.
- invalid IPC payload bị Zod reject.
- window close/reopen không crash main.

## Điều cấm
Không Euler logic; không visual polish; không gameplay branch trong Electron Main.

## DONE
Electron app chạy với hai renderer placeholder và typed IPC boundary an toàn.