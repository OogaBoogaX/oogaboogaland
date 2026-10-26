# Time-sliced construction (task 4.5)

Terrain building (`islandSteps`, grid meshing, vertex compaction, cave labels) and twenty cached Factory and Arcade constructors now run as generators that yield inside their own loops. Ordinary callers drain them synchronously with no clock reads, so the hub and every existing caller build exactly as before. A scene may declare `buildSteps`: once a transition's fade is fully black, the director runs them through `buildTasks.run`, one slice per task, while the old visit stays whole and frozen; only a finished cache is published, and a failed or cancelled build releases the destination's owners and fades back. Boot does the same behind the curtain. `buildTasks.measure` keeps the boot-quality probe on synchronous construction CPU only, so waiting between slices cannot make a fast device look slow; the 3600/5400 ms thresholds are unchanged.

The handoff's slices were 8 ms. While the screen is black that only adds waiting: Drop's entry took 2.7–2.8 s against 1.67 s before. One shared `buildTasks.SLICE_MS` of 40 ms, still under the 50 ms long-task line, brought it to about 2.1 s with the same longest task. The rest of the gap is the generators' own cost: Drop's construction CPU is about 1.5–1.6 s against about 1.2 s synchronous.

| Transition | Longest task before | after | Entry before | after |
|---|---:|---:|---:|---:|
| Drop | 1,298 / 1,276 ms | 123 / 123 ms | 1,671 ms | 2,104 / 2,072 ms |
| Factory | 548 / 551 ms | 433 / 462 ms | 938 / 955 ms | 950 / 962 ms |
| Arcade | 456 / 494 ms | 396 / 364 ms | 854 / 889 ms | 875 / 857 ms |
| DSB | 857 / 867 ms | 853 / 857 ms | ~1,250 ms | ~1,250 ms |
| ₿IFRÖST | 365 / 351 ms | 354 / 361 ms | ~510 ms | ~510 ms |

Drop trades 0.4 s more of black screen for no long task; Factory and Arcade keep their entry time and lose about 100 ms of their longest task, which is now their synchronous `enter` (crew, HUD, wiring). Cold hub boot is unchanged (4.48–4.50 s). The <100 ms per-transition target is met only by Drop.

The handoff's DSB and ₿IFRÖST slicing (`ooga-task-4-5-worlds.patch`) is left out: with it the DSB suite fell from 769/770 on a clean export to 728/748, and ₿IFRÖST's longest task did not move. The handoff's patches predate the 2.x commits, and a fuzzy apply silently put an old export line over a comment in `models.js` and dropped `segmentBoxQueryClear` from `terrain.js`'s export; they were reapplied with exact context and their few rejected hunks merged by hand.

The suite's `tourGo` round trip and the factory entrance check stepped transitions with `advance` in one synchronous loop, where a build's tasks can never run; they now yield a task between steps, capped at 20 s of wall time, and assert the same arrival. Unit 269/269; drop, orbit, arcade, ₿IFRÖST, lab, race and mine pass; factory 312/312 without the greeter (STOP since task 4.2). Raw rows: `untracked/performance/evidence/performance-loading-4-5-evidence.json`.
