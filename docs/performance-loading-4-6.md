# Terrain Worker and lazy hub interiors behind flags (task 4.6)

Two default-off experiments. `?terrainworker=1`: the hub, Drop and Orbit take their island from a same-origin classic Worker, which runs the ordinary deterministic terrain build once, transfers its typed buffers as a data-only snapshot and stops; `terrain-snapshot.js` rehydrates the snapshot with the same query functions (no code crosses, and a checksum of the query source refuses a mismatched build), and `terrain-cache.js` keeps two snapshots of this build in IndexedDB (about 28 MB each). A missing Worker, a failed build or a broken cache falls back to the ordinary build. `?lazyhub=1`: HQ and basement beds start as plain bedding and swap to their LifeHash beds in idle time once the view comes within 18 m; the Mempool island's body, its model caches and the HQ mattress now build through generators, which ordinary calls drain synchronously. Boot and transition `prepare` calls also receive an abort signal. With neither flag, no Worker or IndexedDB is touched, the terrain-cache group is never fetched, and the generators reproduce the old grid bytes, model digests and 12,000 queries exactly.

Ready time (`__ooga.timing.ready`), ARM64 Chrome, staged site:

| Boot | No flags | `terrainworker=1`, first visit | `terrainworker=1`, later visit |
|---|---:|---:|---:|
| Hub | 4,355 ms | 5,256 ms | 3,332 ms |
| `/oogadrop` | 1,857 / 1,860 ms | 2,376 ms | 484 ms |
| `/oogaorbit` | 1,582 / 1,551 ms | 2,386 ms | 476 ms |

The first visit pays the Worker's build and a 28 MB transfer; every later visit skips the build. `lazyhub=1` brings no boot gain on its own (4,586 ms); with both flags the hub boots in 5,160 ms, then 3,153 ms. The 2.5 s full-game cold ready target is not met. Every case kept a clean console and the hub's two round trips through the factory, and the CSP stays `'self'` scripts with a `worker-src 'self'`. An isolated page passed the handoff's 37 Worker and cache checks (one Worker cold, six after reload, all terminated). Not done: cold-boot nearest-ten actor ordering, a hub heap floor and long-task timings with the flags.

Flags off: unit 270/270; drop, orbit, mine and factory (without its stopped greeter) pass; the hub's walk down into the Mempool chamber, map navigation, round trip, the Timechain resident and HUD steps pass. Running hub steps by name, `hub routes`, `hub fall` and `hub grounding` fail with type errors, identically on a clean export of the previous commit: they depend on earlier steps of their session, so their ledger entries come from the selection, not this change. Raw rows: `untracked/performance/evidence/performance-loading-4-6-evidence.json`.
