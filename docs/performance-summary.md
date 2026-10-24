# Performance work: where each target stands (23 Oct 2026)

Raw measurement rows stay outside the tree, under the ignored `untracked/performance/evidence/`: they hold machine-specific paths. Every figure comes from the task note named beside it, measured in ARM64 Chrome on an M1 Pro unless the note says otherwise. Figures from different fixtures are not additive.

| Target | Now | Met | Where |
|---|---|---|---|
| Hub heap floor under 250 MiB | 236.7–239.0 MiB used after forced GC (backing 127.7–132.0 MiB) | yes | final runs; `performance-compact-geometry.md` |
| Hub heap floor under 200 MiB | 205.9–207.8 MiB with `?compactGeometry=1`; default off | no | `performance-compact-geometry.md` |
| Tour within boot + 15 MiB | last measured growth 20.9 MiB (task 1.6); not remeasured | no | `performance-phase-1.md` |
| 60 FPS on all three tiers | walking holds 60.0 FPS with no frame over 33 ms at high; foliage medium sample was 57.6 (task 2.3); no non-Apple GPU | partly | `performance-collision-query.md`, `performance-foliage.md` |
| Pile under 2M triangles high / 1.2M low | 2.58M / 2.27M; the glyph LOD that would cut Matrix fields is set aside for an oblique-coverage defect | no | `performance-foliage.md`, `untracked/performance/glyph-lod-decision.md` |
| Small props 30% fewer instances | unchanged at about 37.4k | no | `performance-small-props.md` |
| Medium reflection under 250k triangles | 496,533 close | no | `performance-rendering.md` |
| Walking under 50 KB a frame, 3 MB/s | 505,928 B a frame, 28.95 MiB/s sampled | no | `performance-collision-query.md`, final run |
| Jumbotron refresh under 100 KB | 158–186 KB for the refresh itself; the renderer adds about 450 KB a refreshed frame | no | `performance-screens.md` |
| Hosted inline JS under 3 MB, gzip under 1 MB | 6,607,128 B HTML, 1,771,801 B gzip | no | `performance-loading-4-2.md`, final build |
| No transition task over 100 ms | Drop 123 ms; Factory about 450, Arcade about 380, DSB about 855, ₿IFRÖST about 355 ms | no | `performance-loading-4-5.md` |
| Cold ready under 2.5 s | hub 4.36 s; 3.15–3.33 s on a later visit with `?terrainworker=1` | no | `performance-loading-4-6.md` |
| Totem feed under 5 KB | 66–75 B summaries and 0 B 304s through the Worker; static hosts still read GitHub | yes where the Worker serves | `performance-loading-4-7.md` |

## Set aside, with their patches kept

- Matrix glyph vector LOD: loses 28% of glyph coverage at 60° and nearly all at 85°, for rain too. `untracked/performance/glyph-WIP-at-handoff.patch`.
- Terrain glyph source snapshots: correct, about 0.18 MiB a page and only under `compactGeometry`. `untracked/performance/set-aside/glyphsnap.patch`.
- DSB and ₿IFRÖST construction slicing: DSB suite 769/770 on clean code fell to 728/748, ₿IFRÖST's longest task did not move. `untracked/performance/handoff-assets/ooga-task-4-5-worlds.patch`.
- The canonical-geometry prototype (task 3.3) was never run and is not integrated.

## Checks the maintainer needs to see

`untracked/test-ledger.json` holds these under STOP (failed in two consecutive runs; not retried), and one was fixed:

- Failing before this work: factory greeter, gorilla rage throw, hub matrix (Chrome hangs), hub mirror (Chrome gone), timechain crossing, Ooga carry orbit, soak: dsb cycles.
- `canvas2d tour` (hub) hung from task 4.5 until its loop yielded a task between steps, as `tourGo` does; with that fix it passes again (every scene arrives and paints on Canvas 2D, clean console).

First failures: birds-eye combat (hub, after task 4.2; gameplay code not touched here), and `hub routes`, `hub fall`, `hub grounding`, which only fail when run by name out of their session and fail identically on clean code.

## Open PRs

All five references (OogaBoogaX#263, #265, #267, #193, #165) are still open at the heads the handoff recorded. Against this branch #265 and #263 conflict textually in `src/index.html`, `src/js/deferred.js` and `scripts/distribution-modules.mjs`, #267 in `gl-renderer.js` and `test/run.mjs`, #193 in several files: the overlaps task 4.2 expected, to merge by keeping both sides.
