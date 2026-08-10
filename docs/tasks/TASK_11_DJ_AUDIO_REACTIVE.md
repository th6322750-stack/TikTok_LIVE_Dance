# Task 11 — DJ & Audio Reactive

## Mục tiêu
Tạo audio/media subsystem tách khỏi gameplay, gửi tín hiệu beat/intensity tối thiểu cho STAGE.

## Components
Player, Analyzer, BeatDetector, BpmClock, ReactiveSignal, DJ playlist/media controller.

## Inputs
- local audio playback.
- manual BPM + TAP BPM fallback.
- kiến trúc mở cho desktop/mic capture nhưng chỉ implement nếu ổn định trong scope.

## Output contract
Không gửi raw waveform liên tục qua IPC nếu không cần. Ưu tiên `bassIntensity`, `midIntensity`, `highIntensity`, `beat`, `bpm` với throttling hợp lý.

## Stage behavior
Beat có thể drive scale/light/environment/particles; gameplay state không phụ thuộc audio timing.

## Playlist
Media image/GIF/video compatibility theo Electron/Chromium support; transition và random/timed switching phải có controller riêng.

## Tests
- BPM clock fake timer.
- analyzer signal normalization.
- playlist transition state.
- audio stop/restart không crash STAGE.

## DONE
STAGE phản ứng nhịp với tín hiệu audio/BPM mà không làm event/game pipeline chậm hoặc phụ thuộc.