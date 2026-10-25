# Instance uploads and idle buffers (task 2.6)

Changing ordinary groups and versioned batches now share one renderer-owned upload stream. Stable records settle back into their existing private buffers by a GPU copy after the existing shadow settle period. Complete matrices, material parameters, visible-prefix ordering and counts determine stability; shadow motion alone would miss glow changes. Caller arrays stay owned by their producers. World and before-view poses occupy separate regions; growth and shrink requeue and rebase every live streaming record. Six regions rotate in one GPU buffer. A sustained fourfold capacity gap trims startup storage after four seconds, without a timer.

The board data surfaces already retained their buffers after task 3.1. Its navigation dots still rebuilt every eight seconds. Seven exact curved/flat layouts now remain owned by hidden nodes and are prepared before selection, including after GPU pruning or context restoration. Authored vertices, normals, materials, Canvas commands and hit actions match. This adds 90,720 vertex bytes beyond one layout, with bounded instance/driver storage; drawing still selects one layout.

One focused ARM64 Chrome 155 tab, Metal/M1 Pro, AC power, DPR 1, 1440×900 window. Exact d25c2c0 baseline and final patch use the same harness, eight-second warmup and five-second real walking windows. Separate idle windows warm for thirty seconds and record ten. Feeds are off and noon is frozen.

| Walking | High before→after | Medium before→after | Low before→after |
|---|---:|---:|---:|
| bufferSubData calls/frame |236.84→1.004|231.86→1.000|234.39→1.000|
| Uploaded bytes/frame |882,929→884,578|879,383→880,621|878,019→879,393|
| Render submission CPU ms/frame |2.72→2.96|2.34→2.48|2.40→2.63|
| Delivered FPS |53.64→53.69|57.61→59.60|60.00→60.00|
| Intervals over 33 ms |19→15|7→1|0→0|

The upload-call target is met. Bytes remain almost unchanged; rebasing VAO attributes costs CPU. These windows establish no general FPS win: earlier shorter-warmup before/after windows both delivered 60 FPS, and the matched high-tier captures show similar startup frame dips. The hooked profiler allocates its own draw records, so its heap-drop counters are excluded from GC conclusions. No non-Apple hardware was available.

Settled high-tier idle: buffer creates+deletes fall from 4+4 to 0+0 per ten seconds; both deliver 60.002 FPS. Upload calls fall 229.93 → 1.00/frame, render submission CPU 2.95 → 3.15 ms. The intermediate untrimmed stream retained about 5.90 MB CPU + 35.4 MB GPU; final idle storage is 1,101,600 B CPU + 6,609,600 B GPU. Existing per-record private reservations remain. The six-region ring is command-ordered but has no fences, so a driver stall-free claim would be unsupported.

Validation includes bit-exact instance fetches for 88 explicit fields plus 300 ordinary groups across tiers/views, fixed capacity/count/zero/mode-change cases, world/before-view growth and region wrap, indexed capture restoration, 11 trim cases, 17 batch cases and disposal to zero buffers/listeners. PR 193 and 267 still apply separately and together. Streaming leaves shader bytes unchanged; the ordinary fragment shader did change earlier in this PR, when `ab4ebcd` added retained canvas-surface sampling, and its pinned hash was re-baselined on purpose. The existing jumbotron check now cycles all layouts and tests same-index rewarming. Integrated global and focused browser checks pass 281/281 (jumbotron cycling/prune rewarm, real WebGL context restoration, Factory peer portals and Race/Factory repeated scene teardown). Full-suite acceptance remains unverified because the previously stopped Canvas Timechain crossing is not retried.

Screenshots for high/medium/low are retained under untracked/performance/phase-2-6-final-trimmed-walk-<tier>.png. They were visually inspected; geometry and shading are unchanged by streaming. Raw before/after recordings and correctness evidence are in `untracked/performance/performance-uploads-evidence.json` (ignored local evidence, not committed). Reproduce after staging: CHROME_ARCH=arm64 PROFILE_WALK=1 PROFILE_WARM_SECONDS=8 node scripts/profile-rendering.mjs label; for idle omit PROFILE_WALK and set PROFILE_WARM_SECONDS=30 PROFILE_SECONDS=10 PROFILE_TIERS=high.
