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

## 1.2 — Tess cache ownership

Tess already used `models.cached`; the problem was the hub scope keeping its populated getters alive. Tracked entries now expose `clear`, and a cached getter forwards it. Tess counts live rigs and clears all seven private caches after the last rig is disposed. Multiple live rigs continue to share their tiers. The fine ring no longer builds 576 bevelled ticks only 0.35 mm wide; the larger marks, globe, animation and tier selection are unchanged.

Factory always creates a Tess rig, even before she is approached. Its snapshot is therefore not a Tess-free case. The Lab after hub → Factory → Lab is the zero-instance measurement.

| Measurement | Before | After |
|---|---:|---:|
| Lab JS heap | 212.27 MiB | 182.62 MiB |
| Lab backing storage | 88.13 MiB | 88.07 MiB |
| Lab combined floor | 300.40 MiB | 270.69 MiB |
| Tess prepared faces in Factory | 212,300 | 197,324 |
| Tess prepared geometries | 36 | 36 |
| Lab native listeners | 371 | 371 |

The combined reduction after Tess leaves is 29.71 MiB. Factory retains the live rig by design; its combined floor falls about 3.54 MiB from removing subpixel ticks. The lifetime regression proves that disposing one rig preserves another rig's shared geometry, while disposing the last releases all tiers before the next rig rebuilds them.

Screenshots at high, medium and low are saved as `untracked/performance/phase-1-2-{before,after}-tess-{high,medium,low}.png`. The guide patrols between captures, so backgrounds and orientations differ; these are visual inspection images, not pixel-identical comparisons. The existing low tier is unchanged. The only geometry removed from high/medium is the fine subpixel ring ticks.

Validation: build and syntax checks clean; unit tier 261/261; hosted DEBUG hub → Factory → Lab passes teardown with a clean console. Renderer interfaces and the open GPU/deferral PRs are untouched.
