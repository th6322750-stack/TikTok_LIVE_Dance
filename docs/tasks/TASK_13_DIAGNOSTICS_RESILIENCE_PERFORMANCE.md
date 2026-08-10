# Task 13 — Diagnostics, Resilience & Performance

## Mục tiêu
Hardening cho LIVE dài và hỗ trợ debug khách hàng.

## Logging
Structured levels DEBUG/INFO/WARN/ERROR, redaction, file rotation khoảng 10MB và retention hợp lý. Tách connector/engine/renderer errors đủ để truy vấn.

## Diagnostics export
ZIP gồm app version, system info, sanitized settings, logs cần thiết và session counters; tuyệt đối không API key/private secrets.

## Resilience tests
- connector disconnect/reconnect.
- CONTROL reload không dừng session.
- STAGE reload + snapshot recovery.
- malformed provider events.
- asset/avatar network fail.
- renderer error không làm main/core chết.

## Performance acceptance
Target STAGE 60 FPS ở BALANCED với tới 25 dancers trên máy dev chuẩn được ghi lại; hỗ trợ 30 dancers theo cấu hình. Stress simulator 50–100 events/s trong burst; throttle CONTROL statistics/viewer updates thay vì spam IPC.

## Long-run
Chạy replay/stress session đủ dài để phát hiện growth bất thường; ghi phương pháp đo memory/CPU trong report. Không tuyên bố leak-free chỉ vì chạy ngắn.

## DONE
Có diagnostics bundle, recovery flow và benchmark/stress report trong docs.