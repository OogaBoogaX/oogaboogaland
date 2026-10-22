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

## 1.3 — Per-index model variants

`models.variants` now lazily tracks each index and clears only that index's payload. The hub's indices 0 and 3 no longer pin the other ten Arcade cabinets or attract-frame sets 1 and 2. The same change covers every `variants` user, including shared hub/scene kits in hub-models, agent, bifrost-models and race-models; callers keep their existing API and stable identities for retained indices.

The browser keeps only WeakRefs to the ten scene-only cabinet geometries and the two scene-only attract-frame arrays during Arcade → hub. The native GC runs before dereferencing them, so the diagnostic does not keep them alive.

| Hub after Arcade | Before | After |
|---|---:|---:|
| Arcade-only cabinets still alive | 10 | 0 |
| Arcade-only attract-frame sets still alive | 2 | 0 |
| JS heap | 228.12 MiB | 223.49 MiB |
| Backing storage | 132.27 MiB | 132.75 MiB |
| Combined floor | 360.38 MiB | 356.25 MiB |
| Native listeners | 407 | 407 |

The combined floor improves 4.14 MiB in these runs. This establishes collection of the unwanted variants; it does not establish the brief's ≤1 MiB total for the hub's own two cabinets and their frame sets. Those remain intentionally used. No geometry or visuals change.

Validation: build/syntax checks clean; unit tier 262/262, including shared hub and incoming-scene preservation, scene-only rebuilding, default and named indices. The hosted DEBUG hub → Arcade → hub sequence has no teardown errors or console output. Return latency varies widely in these runs and is not claimed as a speed improvement; it is measured separately for task 1.7.

## 1.4 — Scoped preparation and Timechain's actual retention

The room cache premise needed correction: `timechain-room-models.js` used untracked per-scale Maps and eager module constants, not the tracked caches described in the audit. Its 18 structural/prop geometries therefore could not be released regardless of async scope.

`models.withScope` restores the caller in `finally` around each synchronous build batch; asynchronous builders explicitly scope later batches. Director preparation uses it, and hosted chunks scope their evaluation by group. Standalone pure-data bundle tooling remains supported. Room caches are lazy tracked getters/variants that always use the Timechain scope, including when the hub asks for a preview or its live geometry. Cancelling a preview releases that scope after disposing its GPU resources. The exterior Sphere belongs to the hub and intentionally stays; it is not interior residency.

The actual doorway creates a preview and cancels it, then a Room 1 visit returns to the hub. WeakRefs are taken from the built graph, with no ownership-changing getter calls during the measurement.

| Retention after hub return | Before | After |
|---|---:|---:|
| Preview meshes still alive (18 captured) | 18 | 0 |
| All non-image room meshes still alive (52 captured) | 40 | 22 |
| JS heap | 216.84 MiB | 214.64 MiB |
| Backing storage | 127.91 MiB | 127.92 MiB |
| Combined floor | 344.75 MiB | 342.56 MiB |
| Native listeners | 407 | 407 |

The remaining 22 captured room meshes are shared actor geometry already needed by the hub. Exact SHA-256 hashes of positions, faces/materials, lines and normals match before/after at 1×, 1.5× and 2× (5,411 / 7,206 / 9,284 faces). Hashes and raw runs are in the JSON evidence. No visual difference.

Validation: build and syntax checks clean; unit tier 264/264. Hosted cancelled-preview → Room 1 → hub passes DEBUG teardown and has a clean console. PR #265, #267 and #193 patches still apply cleanly. PR #263's exporter change three-way merges without conflicts in temporary files; its picture extraction and standalone bundle evaluation pass against that merged exporter. No pending PR was merged or duplicated.

## 1.5 — Visit listeners and persistent sheet rows

The director creates a signal per visit and aborts it after leave, including failed entry and page teardown. Scene listeners and HUD controls use that signal. HUD disposal also releases its listener closures. The page owns a bounded set of donor/recent rows and the current roster's rows, with no contributor or visit callbacks in that pool. Ordering, online/voice marks, donor units and the away toggle still update normally.

Ten Factory → hub laps use the same native GC/counter procedure. `--dom` seeds three donors and records row identity through WeakRefs. The new leaderboard has ten reusable slots; unused slots stay hidden. All 46 roster rows survive the visits.

| Hub after ten laps | Before | After |
|---|---:|---:|
| DOM nodes | 11,822 | 10,123 |
| Detached SVGs (boot: 4) | 96 | 4 |
| Original roster rows still attached | 0 / 46 | 46 / 46 |
| Original donor rows still attached | 0 / 3 | 10 / 10 slots |
| JS heap | 227.66 MiB | 230.13 MiB |
| Backing storage | 149.44 MiB | 151.30 MiB |
| Combined floor | 377.09 MiB | 381.44 MiB |
| Listeners after lap 1 → lap 10 | 408 → 409 | 408 → 409 |

This fixes roster SVG churn, not a demonstrated heap-floor reduction. The reported +17-listener leak does not reproduce. A follow-up without `DOM.getDetachedDomNodes` holds native listeners at **407 after lap 1 and 407 after lap 10**. DevTools' separate `getEventListeners` audit lists 403 attached application listeners at both stops, with identical targets, event types, capture settings and handler sources. The apparent 408 → 409 growth above comes from the detached-DOM inspection itself; no application handler changed. The strict listener criterion passes without that diagnostic. All 290 reported shadow roots exist at boot and are explicitly identified by Chrome as `user-agent` roots; none are application-created. The four detached template SVGs also remain from boot, so the brief's literal zero criterion is not met.

The first after run timed out during a later transition without console errors. It was not used as successful evidence. A fresh run completed all ten laps; its timeout includes scene/frame diagnostics and allows 90 seconds. The before run completed under the original 30-second limit. Transition durations vary and are not speed claims.

Validation: changed JavaScript parses; unit tier 264/264; focused HUD regression plus global tier 266/266. The regression uses real scene transitions, verifies the departed signal no longer fires and the incoming signal fires once, and clicks donor units and the away toggle on the reused nodes. Hosted DEBUG teardown and the completed ten-lap console are clean. PR #265 and #267 still apply; #193's changed DSB context three-way merges cleanly with these listener options. Full scene/performance acceptance remains pending. The follow-up records Chrome 155, Apple M1 Pro through ANGLE/Metal, DPR 1 and 32 GiB device memory. Raw listener lists stay untracked; committed fingerprints pin their exact equality.
