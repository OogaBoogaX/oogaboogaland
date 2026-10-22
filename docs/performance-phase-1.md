# Phase 1 performance evidence

Base: `bde1fd61189712bc20191f390c12e3a37d5373fb` (`rock`). Work stays on the local `performance-improvements` branch.

Open PR boundaries: #263 owns DSB picture extraction, #265 owns deferred Rally/Mine/Orbit groups, #267 owns packed GPU vertices and indexed faces. #193 adds video image surfaces; #165 supplies the covered-movement profiler. These fixes do not duplicate those changes.

## Measurement

Build with `npm run build:site`, then run `node scripts/profile-residency.mjs <label> <scene[:place],...> [--rest] [--snapshots]`. One fresh, focused native Chrome at 1440×900, AC power, no live feeds, noon/day 80 and 1,000 bananas. At each stop the page is frozen and Chrome collects garbage three times. `Runtime.getHeapUsage` reports JS heap and backing storage separately; `Memory.getDOMCounters` supplies native node/listener counts. No listener hooks retain application objects. The automatic quality governor remains enabled; each evidence row records its actual tier. These are memory measurements, not FPS claims.

Raw JSON and optional heap snapshots stay under `untracked/performance/`. The source-page hash is recorded in each JSON file. `SNAPSHOT_TAG=1-factory` restricts snapshots to that stop. All figures below use MiB (1,048,576 bytes).

## 1.1 — Hub scratch references

The idle control did not reproduce the reported leak: Factory JS heap was 242.65 → 242.38 MiB, and the original snapshot already held `supportEntry: null`. A repeatable reproduction calls the existing `clankers.debugLoungeSpots` query (`--rest`, with `gorillamove=1`); both builds admit 21 rest sites. The original Factory snapshot then retains `CLANKER_REST_SLOPE.supportEntry` → gorilla entry → rig/owner. Clearing the scratch immediately after the ground probe, including throwing probes, and clearing actor/hit scratch on departure removes that root.

| Factory after the rest query | Before | After |
|---|---:|---:|
| JS heap | 247.64 | 242.40 |
| Backing storage | 101.42 | 88.70 |
| JS heap + backing storage | 349.06 | 331.10 |
| DOM nodes | 10,851 | 9,975 |
| Native listeners | 382 | 381 |

The combined reduction is 17.96 MiB; neither heap figure alone should be presented as an 18 MiB JS-heap reduction. No visual or gameplay change. `solid-props.js` has no module-level strong actor/owner cache: its geometry cache is a WeakMap and visit-owned entries are cleared by `dispose`.

Validation: `node --check` on changed JavaScript; unit tier 260/260. The focused hosted hub → Factory transition passes the existing DEBUG teardown assertions with a clean console. The regression also covers accepted, blocked, fire-rejected and throwing rest probes.
