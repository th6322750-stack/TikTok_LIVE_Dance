# Task 09 — Asset, Theme & Visual System

## Mục tiêu
Biến STAGE từ placeholder thành hệ thống visual có registry, cache và theme, sẵn sàng nhận asset do ChatGPT render.

## AssetService
- manifest-driven AssetDefinition.
- types: body, vip-body, effect, background, dj, ui.
- import/validate metadata.
- fallback assets.
- lazy load asset nặng.

## AvatarCache
- memory + disk cache abstraction.
- key bằng hash URL.
- TTL configurable 24–72h mặc định hợp lý.
- network fail -> default avatar.

## Theme
Theme manifest định nghĩa background, floor/environment, normal/vip costume pools, badges/crown, gift effect presets, UI overlay references. Không hard-code paths trong gameplay.

## STAGE polish
- normal + VIP zone rõ.
- Top 1/2/3 visual distinction.
- effect scheduler tránh quá tải khi gift spam.
- performance modes LOW/BALANCED/ULTRA.

## Asset handoff
Nếu thiếu artwork, tạo placeholder có ID/ratio/size rõ trong manifest; KHÔNG tự tạo style ngẫu nhiên. ChatGPT sẽ render bộ asset đồng bộ sau.

## Tests
- missing asset fallback.
- theme switch không đổi gameplay state.
- cache hit/miss/expiry.
- 30 dancer placeholder benchmark không tạo obvious leak.

## DONE
Có thể thay theme/asset bằng manifest mà không sửa Core Engine.