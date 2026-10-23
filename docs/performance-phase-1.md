# Phase 1 performance evidence

Base: `bde1fd61189712bc20191f390c12e3a37d5373fb` (`rock`). Work stays on the local `performance-improvements` branch.

Open PR boundaries: #263 owns DSB picture extraction, #265 owns deferred Rally/Mine/Orbit groups, #267 owns packed GPU vertices and indexed faces. #193 adds video image surfaces; #165 supplies the covered-movement profiler. These fixes do not duplicate those changes.

## Measurement

Build with `npm run build:site`, then run `node scripts/profile-residency.mjs <label> <scene[:place],...> [--rest] [--snapshots]`. One fresh, focused native Chrome at 1440×900, AC power, no live feeds, noon/day 80 and 1,000 bananas. At each stop the page is frozen and Chrome collects garbage three times. `Runtime.getHeapUsage` reports the V8-managed heap (`usedSize`) and backing storage separately; `Memory.getDOMCounters` supplies native node/listener counts. No listener hooks retain application objects. The automatic quality governor remains enabled; each evidence row records its actual tier. These are memory measurements, not FPS claims. Chrome's `performance.memory.usedJSHeapSize`, named in the brief, includes backing storage: a blank-page control with one 96 MiB typed array raises that page reading by 96 MiB while CDP `usedSize` barely moves. Compare the combined column with the brief's budget; the separate V8 column is not that budget.

Raw JSON and optional heap snapshots stay under `untracked/performance/`. The source-page hash is recorded in each JSON file. `SNAPSHOT_TAG=1-factory` restricts snapshots to that stop. All figures below use MiB (1,048,576 bytes).

## 1.1 — Hub scratch references

The idle control did not reproduce the reported leak: Factory V8 heap was 242.65 → 242.38 MiB, and the original snapshot already held `supportEntry: null`. A repeatable reproduction calls the existing `clankers.debugLoungeSpots` query (`--rest`, with `gorillamove=1`); both builds admit 21 rest sites. The original Factory snapshot then retains `CLANKER_REST_SLOPE.supportEntry` → gorilla entry → rig/owner. Clearing the scratch immediately after the ground probe, including throwing probes, and clearing actor/hit scratch on departure removes that root.

| Factory after the rest query | Before | After |
|---|---:|---:|
| V8 heap | 247.64 | 242.40 |
| Backing storage | 101.42 | 88.70 |
| V8 heap + backing storage | 349.06 | 331.10 |
| DOM nodes | 10,851 | 9,975 |
| Native listeners | 382 | 381 |

The combined reduction is 17.96 MiB; neither heap figure alone should be presented as an 18 MiB JS-heap reduction. No visual or gameplay change. `solid-props.js` has no module-level strong actor/owner cache: its geometry cache is a WeakMap and visit-owned entries are cleared by `dispose`.

Validation: `node --check` on changed JavaScript; unit tier 260/260. The focused hosted hub → Factory transition passes the existing DEBUG teardown assertions with a clean console. The regression also covers accepted, blocked, fire-rejected and throwing rest probes.

## 1.2 — Tess cache ownership

Tess already used `models.cached`; the problem was the hub scope keeping its populated getters alive. Tracked entries now expose `clear`, and a cached getter forwards it. Tess counts live rigs and clears all seven private caches after the last rig is disposed. Multiple live rigs continue to share their tiers. The fine ring no longer builds 576 bevelled ticks only 0.35 mm wide; the larger marks, globe, animation and tier selection are unchanged.

Factory always creates a Tess rig, even before she is approached. Its snapshot is therefore not a Tess-free case. The Lab after hub → Factory → Lab is the zero-instance measurement.

| Measurement | Before | After |
|---|---:|---:|
| Lab V8 heap | 212.27 MiB | 182.62 MiB |
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
| V8 heap | 228.12 MiB | 223.49 MiB |
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
| V8 heap | 216.84 MiB | 214.64 MiB |
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
| V8 heap | 227.66 MiB | 230.13 MiB |
| Backing storage | 149.44 MiB | 151.30 MiB |
| Combined floor | 377.09 MiB | 381.44 MiB |
| Listeners after lap 1 → lap 10 | 408 → 409 | 408 → 409 |

This fixes roster SVG churn, not a demonstrated heap-floor reduction. The reported +17-listener leak does not reproduce. A follow-up without `DOM.getDetachedDomNodes` holds native listeners at **407 after lap 1 and 407 after lap 10**. DevTools' separate `getEventListeners` audit lists 403 attached application listeners at both stops, with identical targets, event types, capture settings and handler sources. The apparent 408 → 409 growth above comes from the detached-DOM inspection itself; no application handler changed. The strict listener criterion passes without that diagnostic. All 290 reported shadow roots exist at boot and are explicitly identified by Chrome as `user-agent` roots; none are application-created. The four detached template SVGs also remain from boot, so the brief's literal zero criterion is not met.

The first after run timed out during a later transition without console errors. It was not used as successful evidence. A fresh run completed all ten laps; its timeout includes scene/frame diagnostics and allows 90 seconds. The before run completed under the original 30-second limit. Transition durations vary and are not speed claims.

Validation: changed JavaScript parses; unit tier 264/264; focused HUD regression plus global tier 266/266. The regression uses real scene transitions, verifies the departed signal no longer fires and the incoming signal fires once, and clicks donor units and the away toggle on the reused nodes. Hosted DEBUG teardown and the completed ten-lap console are clean. PR #265 and #267 still apply; #193's changed DSB context three-way merges cleanly with these listener options. Full scene/performance acceptance remains pending. The follow-up records Chrome 155, Apple M1 Pro through ANGLE/Metal, DPR 1 and 32 GiB device memory. Raw listener lists stay untracked; committed fingerprints pin their exact equality.

## 1.6a — The tour's second island

The ten-scene tour disproves the brief's one-island-cache premise. The hub calls `terrain.island` with the Factory's roof opening; Drop and Orbit call it without that opening. `ISLANDS` therefore holds two complete voxel/mesh graphs after either game is visited. The retainer is the terrain module's `ISLANDS` Map → seed-1 entry → geometry/cutaway/collision graph, independent of `models.release`.

Each terrain key now has its own tracked owner. Drop → Orbit still shares the same unperforated island while it is live; their last departure drops its Map entry. The roof-open hub keeps its own key. No geometry builder, positions, faces or collision input changes.

The matching tours are Lab, Arcade, Rally, Drop, Orbit, Mine, Factory, Bifrost, Timechain Room 1 and DSB, with a hub return after each. Both builds start at high and step down to low under the same governor. These are residency comparisons; the forced-GC runs' highly variable transition durations are not speed acceptance results.

| Measurement | Before | After |
|---|---:|---:|
| Hub after Drop, combined floor | 418.14 MiB | 354.60 MiB |
| Hub after all ten, V8 heap | 285.10 MiB | 249.77 MiB |
| Hub after all ten, backing storage | 177.69 MiB | 146.79 MiB |
| Hub after all ten, combined floor | 462.78 MiB | 396.56 MiB |
| Boot → final combined growth | 95.80 MiB | 33.69 MiB |
| Final native listeners | 407 | 407 |

The ten-scene reduction is 66.22 MiB. The ≤ boot + 15 MB target is still not met; the next investigation covers remaining model caches and historical hub ownership. This is one demonstrated retention fix, not a claim that task 1.6 is finished.

Validation: syntax/build clean, unit tier 265/265, both full hosted DEBUG tours complete with clean consoles. The new unit check proves per-key sharing and release while retaining the roof-open hub and preserving the rebuilt game's mesh counts and sampled support heights. #265 and #267 still apply cleanly; the terrain change does not touch the other open PRs.

## 1.6b — Keyed and historical model ownership

The remaining caches were not all registered with `models.track`: persistent model Maps, HQ getters and DSB dressing could survive a scene even after its root was disposed. `models.scopedMap` applies the per-index ownership rule to each Map key, including iteration. The model and dressing modules use it without changing their builders. The HQ's local getter helper now uses the shared tracked helper.

On a hub return, `models.release` also checks historically hub-tagged payloads against the new hub's live geometry. A previous photograph or portal build no longer makes a scene's kit permanent. The scan follows payload containers, skips numeric geometry arrays and accessors, handles cycles and clears its scratch references in `finally`. Projective window wrappers share their source arrays, so those arrays protect the source cache too. The two window caches join the same ownership contract. Pure-data caches remain eligible for ordinary scope release without being mistaken for geometry.

The remaining post-DSB jump was traced to `BL.dressing.mediterranean` → private cache → geometry, with the same untracked pattern in Chora and coastal dressing. Those caches now release with DSB as well. A DEBUG guard rejects any scene-only tracking entry that survives its departure.

| Ten-scene tour | Before 1.6b | After 1.6b |
|---|---:|---:|
| Final V8 heap | 249.77 MiB | 238.26 MiB |
| Final backing storage | 146.79 MiB | 146.39 MiB |
| Final combined floor | 396.56 MiB | 384.65 MiB |
| Boot → final combined growth | 33.69 MiB | 20.90 MiB |
| Final native listeners | 407 | 407 |

The final floor falls 11.91 MiB, but the ≤15 MB growth criterion remains unmet. An intermediate run, before the DSB dressing caches joined tracking, grew 23.33 MiB. A focused Bifrost → hub → DSB → hub control with boot/final snapshots grows only 3.98 MiB; DSB alone does not account for the full tour's remaining growth. The next hub-policy measurement must recheck the complete tour, and no claim of passing the residency budget is made here.

Validation: 267/267 unit checks cover key ownership, Map semantics, cyclic payloads, getter safety, shared projective arrays and the release guard. The ten-scene hosted DEBUG tour and the focused snapshot control complete with clean consoles. The director permits a new room under the same scene ID to retain that new visit's caches. All changed JavaScript parses and the hosted build completes. #265 and #267 still apply; #193's only patch-context overlap remains the previously checked DSB listener options. No geometry builder or visual output changes. Full shared-scene acceptance is pending the hub-policy change.

The focused snapshots contain 2,286 → 2,184 geometry objects. Their V8 self-size buckets show code +4.32 MiB, strings +1.12 MiB and native storage +12.00 MiB, offset by arrays −8.24 MiB, ordinary objects −3.34 MiB and numbers −1.59 MiB. These are bucket totals, not dominator-retained sizes. The largest geometry paths lead to the live hub island, cutaways and shared hub kits; this control does not establish the cause of every byte remaining after the longer tour. The raw snapshots and detailed retaining paths remain untracked.

## 1.7 prerequisite — Character palettes survive cache release

Full hub release exposed a latent rebuild bug in `2140data` and `ibrihamturay-coder`. Each character kept one module-level set of palette slot numbers, even though every model build starts a new palette. The rebuilt hub contained 12 visible geometries with 1,037 faces whose colour was undefined, and WebGL failed while uploading them. The failing run is not acceptance evidence.

Each character now keeps its slots and colourway pairs in a WeakMap keyed by the model-build context. Hooks within that build share the same slots, and a later build registers its colours again. The geometry builders, RGB values and both colourways are unchanged.

The existing character check now releases each template and rebuilds all 46 characters, validating every face in both colourways. Before the fix it fails only for the two robots (266/267); afterward all 267 checks pass, with zero invalid palette faces. The policy visit check also explicitly renders the returned hub. The repeated hosted release-mode round trip now paints and finishes with a clean console.

## 1.7 — Keep/reuse or release the built hub

`hubcache=auto` keeps the built hub on devices reporting at least 8 GiB, or no usable memory signal; below 8 GiB it releases it. `hubcache=keep` and `hubcache=release` override either choice for measurement. The existing opening-quality policy remains separate.

Keep mode retains the same root, camera, solids, cutaway sections, guide registries and actors. Its published active root becomes empty while away; input is unbound, visit listeners abort, subscriptions and timers stop, audio closes, and the guide/dialog controls pause. Transient particles, speech, sleep marks, damage numbers and tickers clear while the visibility cache and resize observer remain live. A fresh visit signal and reconciled HUD resume those objects on return. The hub's local elapsed time resumes too, and feeds/weather reconcile with the current snapshot. The director explicitly adds retained-hub geometry to the GPU ownership set, so the existing no-orphaned-record assertion still applies. Page destruction disposes the retained graph as well.

Release mode takes the complete disposal path, removes the cached terrain key through scoped release, and clears global guide references to its sight grid. The incoming scene keeps only the models it actually uses. The palette prerequisite above makes rebuilding those templates safe.

| Measurement | Before | Final keep policy |
|---|---:|---:|
| Hub return longest task, 3 laps, high | 849 / 732 / 693 ms | all <50 ms |
| Hub root reused | 0 / 3 | 3 / 3 |
| Whole return, including fade | 1,251 / 1,130 / 1,083 ms | 514 / 498 / 501 ms |

The final task observer reports no task reaching its 50 ms reporting threshold; this means **<50 ms**, not zero work. Timing runs omit HeapProfiler and forced GC. The independent clean release-mode run measures **98.02 MiB** in Factory (86.10 MiB V8 + 11.92 MiB backing storage, medium quality), below 150 MB. Its return builds a different hub root and paints without console errors. Forced-GC transition durations are not timing evidence.

After ten keep-mode Factory/hub laps, native listeners are **407 after lap 1 and 407 after lap 10**; 403 attached application listeners have identical target/type/capture/handler fingerprints (`9cf0cded…f1d6`). DOM nodes stay at 10,035 and every return reuses the original root. No retaining listener hooks are installed.

The ten-scene keep-mode tour also completes with clean DEBUG ownership and console checks. Boot/final-only collection gives 367.13 → 405.20 MiB, **+38.07 MiB**, so task 1.6's ≤15 MB growth target remains unmet. Retaining the full built hub is an explicit memory/return-speed tradeoff; these results do not attribute all remaining growth. This tour uses only endpoint collections, unlike 1.6b's per-stop measurements, and the two growth figures are not a controlled percentage comparison.

Validation: the full shared suite completes at **1,342/1,357** in 22 minutes. The untouched base reproduces the exact sprint distances, three rejected hill-capture fixtures in the gorilla rage check, and the Factory tours stopping at their first speech beat. No physics or tour behavior was changed to hide these baseline failures. A redundant walking playthrough added to the release-policy session was removed; the original walking check and all its thresholds remain unchanged.

The new lifecycle checks exposed five idle particle nodes surviving a parked hub, so parking now clears transient FX. The single focused retest is **278/280**, including **268/268 unit checks**. Both policy/HUD checks and both canonical DSB actor returns pass: inactive input/audio stop, signals end, controls and reused rows work, the original graph returns in keep mode and release mode rebuilds it. DSB's old “rebuilt” assertion now enforces the chosen policy and canonical geometry. The DSB soak hits its 8-second scene-travel deadline, and the Factory soak its 120-second session deadline, before their resource comparisons; those resource limits remain unchanged and acceptance is still unverified. The earlier pool/record growth is not claimed fixed by a completed soak.

The final timing and Factory-floor runs were repeated after transient FX cleanup. The ten-lap listener and complete-tour results above precede that cleanup. Open parent PRs remain the same five; #265 and #267 patches apply, and #193's only context overlap remains the checked DSB listener options. Additional baseline comparison of the remaining full-suite failures continues separately.

Later: the robot palette fix moved out of `src/characters/2140data.js` and `src/characters/ibrihamturay-coder.js`, which only their owners or a maintainer may change, into `models.buildCaveman`. Each character's colours are registered in the order its first build used before its hooks run, so slot numbers a character file kept stay valid after a released cache rebuilds it. Both files are back to rock's versions; the release-and-rebuild check across all 46 characters passes with the replay and fails on 2140data's palette without it, and in Chrome both robots keep valid colours on every face across two released hub rebuilds.
