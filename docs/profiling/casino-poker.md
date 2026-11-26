# Casino performance measurements

The hosted casino streams the original lounge recordings through the existing mixer, loads bundled hat geometry when requested, updates visible lobby rows when their state changes, and trims out-of-view instances at the end of full-detail floor reflection draws. The portable page embeds its recordings and hats.

Five trials per build alternated order on the same ARM64 Mac with Chrome 158, a 390 × 844 touch viewport, local gzip HTTP and immutable caching for hashed assets. Each trial opened a fresh Chrome profile. The warm visit reopened the scene in that profile. Readiness was the first animation frame with the poker room and its controls built. The results below are medians across trials. [Raw measurements and rendering comparisons](casino-poker.json)

| Metric | Before | After |
|---|---:|---:|
| Cold room ready | 841.1 ms | 820.4 ms |
| Warm room ready | 800.8 ms | 772.6 ms |
| Cold resource transfer accounted for by room readiness | 3,335,709 B | 3,231,303 B |
| Production-style main JavaScript, uncompressed | 9,802,834 B | 8,973,023 B |
| Same main script, gzip | 2,693,510 B | 2,587,601 B |
| App-owned PCM buffer for Lobby Time | 74,160,000 B | 0 B |
| Hidden table-list DOM mutations over 30 practice pause/resume changes | 1,170 | 0 |
| Main-thread time for those 30 changes | 5.3 ms | 2.6 ms |
| Seated frame interval, p50 | 16.7 ms | 16.7 ms |
| Seated frame interval, p95 | 17.9 ms | 18.0 ms |

The audio metric measures full-length recording data held by Web Audio buffer sources. The browser still buffers media during streaming. All four staged M4A files matched the original encoded bytes. Playback advanced from the first track to another with zero whole-track Web Audio buffers. A simulated media-element gesture refusal successfully played Lobby Time using the unlocked Web Audio fallback. Two concurrent requests for a bundled hat fetched its archive script once.

For rendering, the same frozen scene, shader time and camera were rendered with and without reflection trimming at High quality. The 800 × 513 WebGL framebuffer was read back after each pass. Repeating the reference produced identical pixels. All four optimized views also matched every channel. The counts below cover the renderer’s capture pass. Draw-call counts were identical.

| Camera | Reference triangles | Optimized triangles | Reduction |
|---|---:|---:|---:|
| Seated | 1,295,719 | 1,097,579 | 15.3% |
| From the entrance | 1,297,465 | 1,128,059 | 13.1% |
| Across the floor | 1,268,154 | 1,019,907 | 19.6% |
| Toward the terrace | 585,058 | 336,017 | 42.6% |

The seated frame-time distributions overlap. The measurements establish less submitted GPU work and less synchronous HUD work. Physical-device frame rate, battery use and whole-process memory remain unmeasured.

To reproduce the comparison, stage both revisions with identical Worker page, audio, image and page asset flags. Serve them on separate local origins with the same caching and compression settings. The script takes their origins in before/after order and prints JSON.

    TRIALS=5 node scripts/profile-casino.mjs http://127.0.0.1:4191 http://127.0.0.1:4192
