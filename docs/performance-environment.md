# Mirror shard environment cube (task2.7)

The environment cube is requested only when an actual camera-visible mirror shard covers at least8 CSS pixels after viewport clipping. The collector's padded sphere alone is insufficient: transformed shard vertices provide the screen bounds, including explicit batch offsets and the visible prefix. Behind/near/far rejection is conservative at an eye-plane crossing. The gate runs before shader/cube allocation. Every cube face uses the reduced far-scene set already used by medium reflections. High's ordinary planar reflection is unchanged. Tiny shards without a cube retain their authored material until a readable shard initializes it.

The actual-game comparison hit the fresh mirror for500 damage and let its50 pooled shards settle naturally. Their source geometry, transforms, life, damage/update methods and the clock were not edited. The same camera sequence measured12 synchronous renderer submissions per case: a readable shard was414.02 CSS pixels; tiny4.55; the offscreen edge0. One ARM64 Chrome155 used Metal on M1Pro at1440×900/DPR1. This counts real cube framebuffer attachments, depth clears, draws, instances and triangles; it is not an FPS or latency benchmark.

| Tier | Tiny/offscreen cube passes before → after (12 frames) | Readable cube passes before → after | Readable cube triangles before → after |
|---|---:|---:|---:|
| high |12 →0|12 →12|32,248,148 →5,798,024|
| medium |6 →0|6 →6|2,897,668 →2,897,668|
| low |3 →0|3 →3|7,487,901 →1,625,241|

Both tiny views spend no new cube allocation or capture after the change. Returning to the large view resumes at the tier's cadence. Intact-mirror and behind-camera views spend0 before and after. Native command counts agree with renderer counters; no WebGL error or console output occurred. The medium set was already reduced, so readable work is unchanged. Per-capture cost still exceeds the brief's0.25M medium reflection target; no such acceptance claim is made here.

Natural settling calls the real renderer, so the cube already exists before the initial tiny measurement. The raw fixture called that row tiny-first-use; the normalized report correctly calls it tiny-initial-view. It does not prove fresh first-use pixels or zero total cube resources. The source-helper oracle covers19 eligibility/cadence cases including gating before allocation; that structural proof is not a replacement for actual first-use visual validation.

The reduced cube removes fine reflected Matrix detail visible in the high readable-shard comparison. This is an intentional far-scene quality tradeoff requested by2.7, not pixel identity. All-tier before/after PNGs are in untracked/performance/phase-2-7-{before,after}/, including readable, tiny, offscreen and return views. Shader bytes and high planar capture selection are unchanged. Full raw paired data and corrections are in performance-environment-evidence.json. The existing global tier passes269/269 after integration; stopped browser checks are not retried.
