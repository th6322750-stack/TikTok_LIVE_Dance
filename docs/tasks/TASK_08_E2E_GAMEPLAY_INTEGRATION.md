# Task 08 — End-to-End Gameplay Integration

## Mục tiêu
Ghép Tasks 02–07 thành vertical slice thật.

## Flow bắt buộc 1 — Join
TikTok/mock comment `GO` -> connector -> normalized CommentEvent -> CommandEngine -> Queue/Dancer -> StageEvent -> IPC -> Pixi DancerView.

## Flow bắt buộc 2 — Gift
Gift -> dedup -> user/session diamonds -> ranking -> VIP/party goal -> effect resolver -> CONTROL updates + STAGE effect/ranking events.

## Behaviors
- configurable max dancers 1–30, queue max default 200.
- commands GO/JOIN/VAO/VÀO; movement LEFT/RIGHT/DOWN/VIP với aliases configurable sau này.
- gift priority strategy default theo Blueprint A.
- tier config mặc định: 1–9, 10–49, 50–199, 200–999, 1000+.
- Stage only animates resolved events.

## Integration tests
- offline simulator full chain.
- reconnect ngắn không reset canonical session.
- STAGE reload giữa session -> snapshot khôi phục.
- CONTROL reload không reset engine.
- duplicate/streak gift không làm score sai.

## Manual acceptance
Một fake user comment GO thấy avatar/body placeholder lên STAGE; gift 500 làm diamond/rank thay đổi và FX tier tương ứng xuất hiện.

## DONE
Milestone M2 vertical slice hoạt động offline; nếu có credential test hợp lệ, LIVE thật cho kết quả tương đương.