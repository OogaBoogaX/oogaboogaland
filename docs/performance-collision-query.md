# Typed box sweeps for entrance and bed collision (task 3.2)

`entranceSegmentClear` and `bedSegmentClear` called `terrain.segmentBoxClear` with fourteen numbers per box. In optimized code V8 boxed the non-integer ones as heap numbers at every call, which made the two sweeps two of the largest allocation sites while walking. They now fill a caller-owned `Float64Array(14)` (the box's six values change per box, the sweep's eight once per entrance or bed) and call `segmentBoxQueryClear`, which copies the record into locals before any arithmetic. The scalar `segmentBoxClear` stays as a thin adapter over the same kernel with its own private record. No tolerance or expression changed. The records hold numbers only, and the call chain is synchronous, so no reentrant call can overwrite a live record.

These player and camera sweeps run every frame, often several times per frame. The other allocation changes in this part have different cadences: chalkboard edits flush at most every 100 ms while drawing, plus once on close; live jumbotron stats normalize once per minute when the poll returns.

Equivalence: 140,196 differential cases (80,196 kernel cases including tangencies, signed zero, NaN and infinities, and 60,000 transformed entrance and bed sweeps) matched the old code exactly, and the existing convex probe now also runs 25,023 axis-aligned box fixtures (6,030 contacts) through the scalar, reversed and typed entries against the same goldens.

Walking, ARM64 Chrome, 1920×1080, 15 s real A/D walk: one sampled run per side with Chrome's sampling heap profiler at 16 KiB, with delivered FPS from separate unsampled runs. The sample covers JS-heap objects, not typed-array backing stores.

| | Before | After |
|---|---:|---:|
| Sampled allocation per frame | 609,265 B | 511,375 B |
| Sampled MiB/s | 34.17 | 28.74 |
| `entranceSegmentClear` self | 65.0 MB | not sampled |
| `bedSegmentClear` self | 18.6 MB | not sampled |
| Unsampled FPS (two runs) | 58.67 / 57.41 | 58.34 / 59.54 |
| Frames over 33 ms | 20 / 39 | 25 / 7 |
| Heap-drop proxy MiB/s | 17.06 / 17.01 | 18.62 / 19.19 |

The heap-drop proxy rose while sampled allocation fell. It sums heap decreases across frame boundaries, so it moves with when collection happens, not only with how much is allocated; it is not used as acceptance here, and the 50 KB per frame / 3 MB/s walking target remains unmet. `voxelSegmentClearAt` (62 MB) and the sleep-mark sight probe were the largest collision-side sites in this sample. Raw rows: `untracked/performance/performance-collision-query-evidence.json` (ignored local evidence, not committed). The 505,928 B/frame whole-stack summary belongs to #292, rather than this change's 511,375 B/frame sample; no frame-time improvement is claimed here.

Historical validation at the measurement commit: 269/269 global checks; the hub scene was not run then because its ledger held unrelated first failures. Later targeted hub and lab results are recorded in [PR #291](https://github.com/OogaBoogaX/oogaboogaland/pull/291), and the [review at `65baf74`](https://github.com/OogaBoogaX/oogaboogaland/pull/291#pullrequestreview-5640732364) reports 282/282 unit checks. This documentation correction adds no new runtime results and leaves every STOP entry in force.
