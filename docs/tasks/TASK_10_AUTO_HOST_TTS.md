# Task 10 — Auto Host & TTS

## Mục tiêu
Tạo rule engine tự động phản hồi LIVE nhưng không hard-code câu/trigger trong renderer.

## Rule model
`Trigger -> Conditions -> Cooldown -> Actions`.

## Triggers tối thiểu
join/follow/share/comment/gift/partyGoalComplete/rankPromotion và timer reminder phù hợp.

## Actions
- SHOW_ANNOUNCEMENT
- TTS
- START_SPOTLIGHT
- SHOW_EFFECT
- START_MINIGAME hook

## TTS Queue
- không phát chồng hàng loạt.
- priority: high-value gift > important social action > comment response > generic reminder.
- max queue, duplicate suppression, cooldown, optional interrupt policy.
- provider abstraction để có thể dùng system/Edge/OpenAI-like provider sau; không hard-code credential.

## Safety/product rule
Auto Host chỉ tạo overlay/TTS nội bộ; không tự post comment lên TikTok trừ khi một future connector/API chính thức được thiết kế riêng và duyệt.

## Tests
- rule match/non-match.
- cooldown.
- duplicate TTS suppression.
- priority ordering.
- gift spam không tạo unbounded queue.

## DONE
Simulator event có thể trigger announcement/TTS action deterministic, cấu hình rule nằm ngoài UI logic.