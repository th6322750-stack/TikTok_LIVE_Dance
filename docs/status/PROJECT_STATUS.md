# Dance Arena V2 — Project Status

Kiến trúc: **A — approved**  
Execution plan: **B — approved**

| Task | Tên | Trạng thái |
|---|---|---|
| 00 | Bootstrap monorepo | DONE — PR #1 merged |
| 01 | Contracts & schemas | DONE — PR #2 merged |
| 02 | Core Game Engine | DONE — PR #2 merged |
| 03 | Simulator & Replay | DONE — PR #2 merged |
| 04 | Electron Shell & Typed IPC | DONE — PR #2 merged |
| 05 | CONTROL Minimal | DONE — PR #2 merged |
| 06 | STAGE Pixi Minimal | DONE — PR #2 merged |
| 07 | EulerStream Connector & Normalizer | DONE — PR #2 merged |
| 08 | End-to-End Gameplay Integration | DONE — PR #2 merged |
| 09 | Asset, Theme & Visual System | DONE — PR #3 merged, DA-VISUAL-R3 final QA PASS |
| 10 | Auto Host & TTS | **READY FOR IMPLEMENTATION — handoff `DA-T10-AUTOHOST-TTS`** |
| 11 | DJ & Audio Reactive | BLOCKED — wait Task 10 review/merge |
| 12 | Settings, Secrets & Licensing | TODO |
| 13 | Diagnostics, Resilience & Performance | TODO |
| 14 | Packaging, Release & Acceptance | TODO |

Trạng thái hợp lệ: `TODO`, `READY`, `IN PROGRESS`, `PR OPEN`, `BLOCKED`, `DONE`.

## Tasks 00 → 08
- PR #1 và PR #2 đã merge.
- Core vertical slice hoàn chỉnh: Connector → Normalizer → Core Engine → CONTROL / STAGE.
- Simulator và real-provider pipeline dùng cùng normalized-event/core path.
- Real EulerStream credential smoke test vẫn pending owner; không làm thay đổi trạng thái hoàn thành offline/integration của Tasks 07–08.

## Task 09 — FINAL
- PR #3 merged: `22bb2331422c51e429918c62ac4d3c429bbe2216`.
- Final implementation head: `af1ce72a00b532b917836f76dafcd981d5141381`.
- Approved visual revision: **DA-VISUAL-R3 — Neon Kawaii Arena**.
- Production pack: **104 logical assets**, **7 runtime atlases**.
- Per-asset avatar socket, crown/badge tuning, LOW takeover coverage and 4px atlas padding final QA PASS.
- `DA-QA-001` → `DA-QA-005`: CLOSED.
- Final regression suite: **381 tests**; CI PASS.

## Task 10 — handoff opened

Handoff: `.dance/HANDOFF.json` → `DA-T10-AUTOHOST-TTS`.

Full implementation contract: `docs/tasks/TASK_10_AUTO_HOST_TTS.md`.

Implementation branch:

`claude/task-10-auto-host-tts`

Architecture:

```text
LIVE/game/timer trigger
      ↓
Core AutoHostRuleEngine
      ↓
AutoHostActionIntent
 ├─ visual → STAGE
 └─ TTS → Main bounded TtsQueueService → STAGE Web Speech adapter
```

Task 10 requirements include declarative rule evaluation, cooldowns, safe template rendering, Vietnamese default rules, bounded priority/deduplicating TTS queue, typed Web Speech bridge, R3 reaction/bubble rendering, CONTROL runtime controls and full simulator/reload/spam regression tests.

Hard product rules:

- no TikTok outbound comments/messages;
- no cloud TTS credential;
- no raw arbitrary comment TTS in default rules;
- no `eval`/executable rule expressions;
- no Auto Host mutation of gift score/ranking/queue/VIP;
- DA-VISUAL-R3 remains immutable;
- runtime Auto Host config persistence is deferred to Task 12.

Task 11 must remain blocked until Task 10 PR passes ChatGPT review and is merged.
