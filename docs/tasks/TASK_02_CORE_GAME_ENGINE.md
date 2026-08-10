# Task 02 — Core Game Engine

## Mục tiêu
Xây canonical game state bằng pure TypeScript, deterministic và testable.

## Scope
`packages/core-engine` + tests.

## Components bắt buộc
- SessionEngine
- UserRegistry
- CommandEngine + per-user/per-command cooldown
- QueueEngine + max queue
- DancerEngine + logical slot system
- GiftDeduplication/GiftEngine
- RankingEngine
- VipEngine
- PartyGoalEngine
- SpotlightEngine base

## Invariants
- Một platform user không có 2 active dancer.
- Nickname không phải identity.
- Queue không duplicate cùng user.
- Dancer dùng logical slot; renderer mới map slot -> pixel.
- Ranking update khi score thay đổi, không theo frame.
- Gift streak không double-count cumulative repeat events.
- Engine nhận normalized events, không biết EulerStream.

## Public API gợi ý
`createGameEngine(config)`, `handleEvent(event)`, `dispatchCommand(command)`, `getSnapshot()`, `subscribe(domainEvents)`.

## Tests bắt buộc
- GO/JOIN/VAO/VÀO map đúng thành JOIN_STAGE.
- queue full.
- duplicate GO.
- 30 dancer slots.
- movement cooldown.
- gift x1,x2,x3,x4 chỉ tính đúng final total.
- rank 11 -> 10 sinh VIP promotion và rank 10 cũ demotion.
- party goal completion.
- snapshot deterministic.

## Điều cấm
Không Electron, React, Pixi, WebSocket, filesystem.

## DONE
Core test coverage đủ cho gameplay quan trọng và mọi test deterministic, không phụ thuộc network/time thực không inject được.