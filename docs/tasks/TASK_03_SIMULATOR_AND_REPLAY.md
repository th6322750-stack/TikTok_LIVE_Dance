# Task 03 — Simulator & Replay

## Mục tiêu
Cho dev/test toàn bộ pipeline mà không cần TikTok LIVE.

## Scope
`packages/simulator`, contracts/core integration tests.

## Bắt buộc
- MockConnector implement cùng interface LiveConnector.
- generator cho comment, gift/streak, follow, share, join, like, viewer/session metadata nếu contract hỗ trợ.
- preset gift: 1, 25, 99, 500, 1500 diamonds.
- deterministic fake users/avatar URLs.
- Session Recorder format chứa relative timestamp + event phù hợp thiết kế.
- ReplayConnector: play/pause/speed 1x/2x/5x; deterministic clock abstraction.

## Kiến trúc
Simulator phải đi theo pipeline giống production: Connector -> normalized boundary -> Core Engine -> outputs. Không emit trực tiếp sang STAGE.

## Tests
- sequence GO -> gift -> follow cho state dự kiến.
- streak replay không double count.
- replay cùng fixture 2 lần cho state cuối giống nhau.
- speed thay đổi timing nhưng không thay order/state cuối.

## Điều cấm
Không hard-code renderer calls; không cần UI simulator ở task này.

## DONE
Một test fixture có thể tái hiện phiên LIVE nhỏ hoàn toàn offline và tạo cùng canonical final state mỗi lần.