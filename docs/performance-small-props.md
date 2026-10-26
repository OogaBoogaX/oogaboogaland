# Small prop culling (task 2.5)

The main collector now skips explicitly opted-in props below 1.8 CSS pixels and restores them above 2.2, using the same conservative projected physical bounds as foliage. Characters, assembled unmarked details, coherent Matrix glyph fields, portals, image surfaces and mirrors are excluded. An explicit particle/grass batch is rejected only when every instance in its camera prefix is tiny; mixed batches keep their data, order, upload and counts. Main-camera rejection does not remove a prop from other passes. Marked ordinary shadow casters use their physical shader-space radius when rejecting a group wholly outside the light frustum, without the camera's extra one-metre margin.

The fixed pile-camera measurement found no eligible prop below the threshold. This feature therefore does not achieve the requested 30% reduction there. Matrix fields dominate instance counts and removing their individual cells would change the picture. No broader benefit is claimed from the functional fixture.

| Tier | Main instances before → after | Main triangles before → after | smallCulled | FPS before → after |
|---|---:|---:|---:|---:|
| high |37,427 →37,427|2,577,494 →2,577,476|0|60.00 →60.00|
| medium |37,391 →37,390|2,541,199 →2,542,056|0|57.61 →58.01|
| low |37,364 →37,378|2,265,128 →2,273,083|0|60.00 →60.00|

The source changes cannot explain those tiny dynamic count differences as culling gains: smallCulled remains 0. CPU submission was 3.04 → 3.23 ms high, 2.62 → 2.70 medium and 2.74 → 2.87 low in these single samples. Before is the exact 2.3 final build, after task 2.5, one focused ARM64 Chrome 155 using Metal/M1 Pro, 1440×900/DPR 1,8 s warmup and 5 s per tier. All three screenshots are in untracked/performance/phase-2-5-after-{high,medium,low}.png; the 2.3 final screenshots are the reference. No visible prop difference is expected at this camera.

The existing overhead-projection family was extended to prove opt-in hysteresis, near/orthographic handling, unchanged glyph/assembled geometry and data, and preservation of an entire mixed batch. The first added fixture supplied an invalid sky:false RGB option and threw before its new assertion; removing that invalid option repaired the fixture. The single permitted retest passed 275/275 global and focused checks with every assertion unchanged. Eight source-helper cases and PR 193/267 compatibility checks also pass. No stopped checks were rerun and no full-suite pass is claimed. Complete raw profile data are in `untracked/performance/evidence/performance-small-props-evidence.json` (ignored local evidence, not committed).
