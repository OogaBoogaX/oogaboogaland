# Typed box sweeps for entrance and bed collision (task 3.2)

`entranceSegmentClear` and `bedSegmentClear` called `terrain.segmentBoxClear` with fourteen numbers per box. In optimized code V8 boxed the non-integer ones as heap numbers at every call, which made the two sweeps two of the largest allocation sites while walking. They now fill a caller-owned `Float64Array(14)` (the box's six values change per box, the sweep's eight once per entrance or bed) and call `segmentBoxQueryClear`, which copies the record into locals before any arithmetic. The scalar `segmentBoxClear` stays as a thin adapter over the same kernel with its own private record. No tolerance or expression changed. The records hold numbers only, and the call chain is synchronous, so no reentrant call can overwrite a live record.

Equivalence: 140,196 differential cases (80,196 kernel cases including tangencies, signed zero, NaN and infinities, and 60,000 transformed entrance and bed sweeps) matched the old code exactly, and the existing convex probe now also runs 25,023 axis-aligned box fixtures (6,030 contacts) through the scalar, reversed and typed entries against the same goldens.

Walking, ARM64 Chrome, 1920×1080, 15 s real A/D walk:

| | Before | After |
|---|---:|---:|
| Sampled allocation per frame | 609,265 B | 511,375 B |
| Sampled MiB/s | 34.17 | 28.74 |
| `entranceSegmentClear` self | 65.0 MB | not sampled |
| `bedSegmentClear` self | 18.6 MB | not sampled |
| Unsampled FPS (two runs) | 58.67 / 57.41 | 58.34 / 59.54 |
| Frames over 33 ms | 20 / 39 | 25 / 7 |
| Heap-drop proxy MiB/s | 17.06 / 17.01 | 18.62 / 19.19 |

The heap-drop proxy rose while sampled allocation fell. It sums heap decreases across frame boundaries, so it moves with when collection happens, not only with how much is allocated; it is not used as acceptance here, and the 50 KB per frame / 3 MB/s walking target remains unmet. `voxelSegmentClearAt` (62 MB) and the sleep-mark sight probe are now the largest collision-side sites. Raw rows: `performance-collision-query-evidence.json`. 269/269 global checks; the hub scene was not run (its ledger holds unrelated first failures).
