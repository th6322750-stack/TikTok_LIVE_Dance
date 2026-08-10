# TikTok LIVE Dance Arena V2

Repository trung gian cho quá trình thiết kế và phát triển **TikTok LIVE Dance Arena V2**.

## Cách làm việc

- **ChatGPT**: kiến trúc hệ thống, đặc tả kỹ thuật, UI/UX spec, acceptance criteria, review và asset hình khi cần.
- **Claude**: triển khai code theo spec/task đã được commit lên repository.
- **GitHub**: nguồn sự thật chung để trao đổi giữa hai bên.

## Tài liệu kiến trúc

- [`docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md`](docs/architecture/A_BLUEPRINT_DANCE_ARENA_V2.md) — Blueprint A: kiến trúc tổng thể Dance Arena V2.

## Nguyên tắc kiến trúc cốt lõi

```text
Connector -> Normalizer -> Core Engine -> CONTROL / STAGE
```

- TikTok data không đi thẳng vào STAGE.
- STAGE không quyết định gameplay.
- CONTROL không sở hữu canonical game state.
- Core Engine không phụ thuộc React, PixiJS hoặc Electron.
