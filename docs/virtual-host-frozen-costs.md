# Frozen-body measurements and remaining cost gates

## Unchanged receiver-scan writes — v142

The receiver still atomically reserves its scan counter and alarm before any
Room RPC. When the successful result leaves that exact bounded record unchanged,
it now retains the committed reservation instead of writing the same row and
alarm a second time. Failure counters, pending-work deadlines, recovered failure
state and terminal outcomes still commit their changes. No scan interval, retry
budget, ownership fence, body deadline or publication rate changed.

Six receiver tests and three Room-event tests passed, including loss of a wake,
restart, concurrent work, atomic reservation, changed deadlines and error/reset
persistence. The regression counts one row put plus one alarm set for an unchanged
scan, rather than two of each. Syntax, whitespace and the build passed.

At an assumed one unchanged scan per second, this removes 5,184,000 storage-write
API calls over 30 days. That is arithmetic from the source/fixture, not a measured
production invoice. The checked-in Room migrations use SQLite and the host
receiver explicitly requires SQLite; host activation remains absent. Cloudflare
[documents SQLite puts and alarm updates as write-billed operations](https://developers.cloudflare.com/durable-objects/platform/pricing/),
with account-level included usage. Actual bills, retries, occupied-world cadence
and total host/Room traffic still require validation.

The saved no-player 106-NPC trial separately measured one root put per warm host
tick, 41,940–43,535 JSON bytes in the final eight samples, and no writes for pose
confirmation. Four ticks per second would mean 10,368,000 such puts per 30 days;
these are repeated checkpoint updates, not accumulating retained storage. This
partial count excludes Room publications, body movement, acknowledgements,
service inputs and receiver work. It is not a total-cost forecast.

## Mismatched warm-world retirement — v141, focused validation complete

The adapter now disposes an unused warm world before reconstructing a different
persisted checkpoint. Previously the old cache survived until a later commit,
so replacement construction could retain two complete worlds. The cache is only
an optimization: authoritative state still comes from fresh durable reads, and
actively borrowed transaction worlds remain separate. Failed attempts continue
to discard their speculative state; no checkpoint is dropped or reinterpreted.

The regression now explicitly populates the warm cache through a pose read,
then verifies a different exact checkpoint releases it before construction.
Previously that fixture's validation-cache hit could leave no warm world to test.
The adapter and transaction tests passed (34/34), including release before
replacement allocation, with syntax/whitespace and the build also passing.
No memory or latency saving is measured for this path yet.

The latest saved rollback profile attributes 160.59 ms to geometry construction,
38.84 ms to actor construction (including 27.23 ms forest proof replay), 19.61 ms
to logical restoration, 50.06 ms to simulation and 10.12 ms to capture within the
289.89 ms operation. Nested phase timings must not be added twice.

Cloudflare's current [memory documentation](https://developers.cloudflare.com/workers/platform/limits/#memory)
continues to specify 128 MB per isolate. Successful completion of an in-flight
local request is insufficient evidence of sustainable fit: the documented
production response to memory pressure can include isolate replacement. Both
retained/peak memory and repeated cold-recovery costs therefore remain gates.

## Private terrain-grid template — v140, focused validation complete

The compiled template now attempts lossless run-length encoding of its standalone
9,594,624-byte material grid. Encoding uses two fixed passes and fixed-size typed
arrays, and is retained only when its payload is at most half the original grid
size. High-entropy grids use native cloning. Grids with shared buffer aliases,
subarray storage or resizable buffers also keep native clone semantics.

Each recovered world still gets a fresh full-sized Uint8Array containing all
material values, not a boolean occupancy approximation. No world shares mutable
collision cells with another. This changes only the private static template;
checkpoint schemas, authority checks, placement and rate limits are unchanged.

The terrain regression passed, covering every byte of the authored grid,
nonbinary long runs, noisy fallback, shared-buffer alias preservation and
cross-world isolation. Syntax, whitespace and the build passed. The actual grid
encoded into 149,927 runs, retaining 749,635 bytes of typed payload instead of
9,594,624: an exact 8,844,989-byte payload reduction, excluding object metadata.

The finite 106-actor rollback/restart trial passed its correctness assertions.
Cold reads took 231.96 and 200.39 ms, rollback recovery 289.89 ms, and eight warm
ticks 32.30–55.66 ms. Rollback recovery still exceeds the 250 ms target.

Local workerd built the world and advanced eight ticks with a valid 42,868-byte
checkpoint, no external requests and no runtime errors. Post-tick used JS heap
was 151,021,916 bytes and backing storage was 52,274,157 bytes before collection.
These observations do not establish retained/peak heap or provider memory fit.
Startup/dispatch took 2,217 ms and simulation-only ticks took 15–33 ms; no speed
improvement or strict Room-delivery success is claimed. The runtime was disposed
and the coordinated Mac window released. No signing or publication occurred.

## Host foliage alternatives — v139, focused validation complete

Host geometry construction now requests base foliage without the medium/far
render alternatives or their atlas-source graph. The coarse builders are deferred
and are not called in that mode. The base vertices, faces, collision shells,
normals, climb data and placement metadata are retained. This is intentionally
narrower than replacing authored models with approximate collision shapes.

Foliage builders keep separate base-only and ordinary-render caches, so host-first
construction cannot remove a later browser's alternatives. The host policy is
restored after each synchronous construction step, including exceptions; it is
not held across generator yields. Browser construction defaults to full detail.

All three focused collision/foliage regressions passed, including exact authored
base-geometry equality in both cache orders, nesting, exceptions and deferred
construction. Syntax, whitespace and the build passed. The bounded full-world
rollback/restart trial passed its correctness assertions; cold reads took 200.51
and 237.69 ms, rollback recovery took 298.72 ms, and eight subsequent warm ticks
took 32.74–50.11 ms. Recovery headroom is still insufficient.

The local workerd run built 106 actors and advanced eight ticks, validating a
42,868-byte checkpoint with no egress or runtime errors. Post-tick used JS heap
was 145,282,544 bytes and backing storage was 60,839,482 bytes, before collection.
The earlier base-only-scratch run observed 159,052,956 and 61,413,806 bytes
respectively; these individual heap observations do not measure retained-memory
savings or peak allocation. Simulation-only ticks were 15–33 ms. Provider fit,
strict Room delivery and total cost remain unresolved. The runtime was disposed
and the coordinated Mac window released; nothing was signed or published.

## Bounded exposed-geometry census — v138

One coordinated local workerd run completed with 106 actors, eight simulation
ticks, a valid 42,868-byte checkpoint, zero egress and no runtime errors. Before
the diagnostic walk, post-tick used JS heap was 168,328,568 bytes and backing
storage was 61,413,806 bytes. Simulation-only ticks took 15–34 ms; this does not
measure Room delivery. No forced collection or production quota test occurred.

The read-only graph census reached its 250,000-object cap before covering the
whole world. It is explicitly incomplete: the visited portion contained 1,502,690
plain-array slots, including 1,387,999 numeric entries. It encountered render
normals, foliage level-of-detail geometry and image-atlas source references in
the host scene. These identify candidates for a narrower collision-only model
representation; they do not establish their total retained size or prove that
removing them would satisfy the memory limit. Closure and WeakMap caches are
outside this census. The cap was not raised and no geometry was removed.

The runtime was disposed and the coordinated performance window released.
Provider memory fit, rollback headroom and strict delivery remain open.

## Host collision scratch allocation — v136–137

The two host collision registries now allocate shoulder-query scratch only when
querying a surface that needs it. Browser registries retain their previous eager
allocation. Growth preserves collected polygons and contacts, remains bounded by
the registered mesh's triangle count, and never drops collision candidates. A
focused regression compares eager and lazy results across connected surfaces,
multiple growth steps and reuse. It passed, as did the build.

Matched finite local workerd runs built the same 106-actor world and advanced it
for eight ticks. The eager baseline reserved 5,594,034 bytes of shoulder scratch
in each registry. The optimized world needed none in this particular workload.
Backing storage decreased by exactly 11,188,068 bytes both after construction
(72,296,652 to 61,108,584 bytes) and after eight ticks (72,601,874 to 61,413,806).
Both worlds validated, with the same 42,868-byte checkpoint size after the ticks.
The source collision test separately exercises queries that require growth.

Simulation-only tick samples were 16–34 ms for eager allocation and 16–38 ms for
lazy allocation; these short runs establish neither a speed improvement nor
end-to-end delivery performance. The optimized post-tick JS heap observation was
159,052,956 bytes before collection. Retained and peak memory remain unknown,
and the provider's 128 MB fit is still unproven. The local runtime is not enforcing
a verified production memory quota. Both runs blocked external egress, produced
no runtime errors and disposed their runtimes. No provider resources were created.

The bounded Node rollback/restart trial also passed after this change, preserving
the durable record through the injected failed commit and cold reads. Cold pose
operations measured 201.52 and 234.30 ms; recovery after rollback still took
294.42 ms. Eight subsequent warm ticks measured 32.80–51.32 ms. These are individual
local operations, not sustained provider results, and the recovery gate still
lacks consistent headroom. Strict Room delivery has not been remeasured or fixed.

## Private compiled terrain template — v135

The terrain factory now validates and owns one private template, then deep-copies
it into each world. External snapshots still undergo full validation; the
unchecked restoration function is private. Worlds share no mutable query buffer,
mouth record or path state. The terrain regression verifies caller mutation,
cross-world mutation isolation and malformed-input rejection alongside existing
query parity. All four terrain/forest checks passed.

The bounded full-world rollback/restart trial also passed. Cold pose reads took
271.23 and 224.21 ms; the rollback recovery tick took 309.92 ms. Eight warm ticks
were 39.25–63.51 ms. Startup took 2,621 ms. These individual local Node samples
do not establish consistent sub-250 ms recovery or quantify a stable saving
against another run. Memory fit and strict end-to-end delivery remain open.
No schema, publication rate, ownership check or activation gate changed.

## Forest-anchor recovery search — v132–134

Finer attribution corrected the earlier description of actor construction:
enumerating outdoor sleeping anchors costs 236–243 ms per reconstructed world;
cached Ooga and Clanker rig construction together costs only about 8–10 ms.
The host previously repeated the deterministic forest search to establish stable
bed IDs even when no NPC was sleeping outdoors.

The host now retains one bounded search proof for the fixed authored layout,
placement and roster count. Each new private world rechecks every accepted
footprint sample and the blocking witness for every rejected candidate against
its current terrain/props. A changed answer reruns the original search. Returned
bed/node/sleeper records are fresh; no world or mutable reservation is cached.
The cache holds at most 16,384 four-double query records (512 KiB) plus 53 anchor
rows. An oversized proof disables reuse without truncating the search. The real
fixture retained 5,183 queries (165,856 bytes), including 451 rejection witnesses,
and 52 available anchors. This is a bounded memory addition, not a memory fix.

The final finite 106-actor run passed the injected commit rollback, two cold
recoveries/confirmations and eight subsequent ticks. Forest revalidation took
23.69–27.30 ms. Cold pose operations took 283.91 and 245.99 ms; the rollback
recovery tick took 321.19 ms. These single local samples still lack reliable
headroom under 250 ms. First-isolate startup still performs the full search.
Three focused regressions cover new-world clearance, changed obstacles, bed
isolation/order, cache key changes and bounded fallback. No rate, placement,
activation or checkpoint-schema limit changed. Memory fit and strict Room
delivery remain unresolved.

## Construction attribution and updated isolate memory — v130–131

A bounded run measured the phases within each cold operation. For the first
cold pose read, geometry construction took 197.50 ms, actor construction
251.08 ms, and logical restoration 14.16 ms, within a 485.87 ms operation.
The later cold read measured 155.03 / 246.94 / 13.16 ms respectively, within
435.77 ms. Thus rebuilding geometry and rigs dominates this sample, rather than
decoding/restoring saved logical state. Initial startup still took 2,212 ms.

An updated local workerd probe with reduced terrain completed with 106 actors,
zero egress and no runtime error logs. It reported 138,701,388 bytes used JS heap
and 71,785,977 bytes backing storage, before forced GC; build/dispatch took
2,114 ms. This improves on the prior 180,688,888-byte heap observation but still
does not demonstrate fit within the documented 128 MB isolate budget. No forced
GC was attempted, because the earlier inspector GC command timed out. Neither
retained heap after collection nor peak memory is established by this sample.
The local runtime was disposed. No production resource was provisioned.

## Cold walking recovery correction — 2026-11-06 (v127–129)

Following approval to diagnose and resume the stopped recovery check, the
rejected `pdubl22` position was traced to a collision-contract mismatch. Its
ordinary outdoor movement admitted the position using the live collision core;
recovery instead tested a wider idle-pose slice against props. The diagnostic
confirmed live clearance passed at the exact position where that slice failed.

Recovery now applies the same center/prop admission to ordinary outdoor walkers
and explicitly checks the stationary forward trunk core against terrain. Live
planted turns normally skip that second query; recovery must prove it. Lab,
office, biped, climbing, airborne and resting poses retain their pose checks.
No actor is relocated, reservation dropped, or checkpoint state discarded. A
focused regression verifies terrain, core, sweeps, props, land boundary, sealed
caves and gates still refuse invalid placement, and specialized poses retain
their existing admission. Player placement is unchanged.

The final finite 106-actor run passed late-commit rollback, cold recovery and
confirmation, eight further ticks, and a second cold recovery/confirmation.
Failed commit and both cold reads left the durable data unchanged. Warm ticks
after the first restart ranged from 31.04 to 53.43 ms; the earlier warm tick was
65.43 ms. Cold pose reads took 485.34 and 434.17 ms, still above the separate
250 ms recovery target. The final stored record was 43,535 JSON bytes. These are
Node/in-memory observations, not sustained Room delivery, provider CPU or billed
cost. No egress occurred. The build and focused collision regression passed.

The v126 placement failure below is resolved in this local patch; its logs and
STOP history remain preserved. Memory fit, cold-recovery latency, live browser
integration, strict delivery and combined cost remain open. Activation remains
disabled.

## Committed-runtime reuse and current blocker — 2026-11-06 (v125–126)

The host now lends one previously committed private world to a later transaction
only when its exact logical checkpoint matches freshly read storage. Taking the
loan removes it from the cache. Storage retry, callback failure or failure after
callback completion discards the attempt; only resolution of the storage
transaction invokes the commit hook. Concurrent attempts cannot share mutable
actors. Root ownership, revision, deadlines and bounded state validation remain
fresh. `VirtualWorld.setup()` retains this adapter across RPCs. No checkpoint
write frequency, rate limit, activation setting or storage schema changed.

The host-only terrain template also retains just the faces and exact Float64
vertices used by continuous-ramp queries. Voxel, window, sight and cave query
data remain unchanged. Terrain parity and the initial 106-actor logical recovery
check passed. Browser render geometry is unaffected.

One instrumented local host run measured phases **inside the same operation**:

| Warm operation/phase | Elapsed time |
| --- | ---: |
| Complete tick | 67.77 ms |
| Actual world simulation within that tick | 53.48 ms |
| Capture within that tick | 11.22 ms |
| World validation within that tick | 0.07 ms |
| Public projection within that tick | 0.20 ms |
| Pose reads, separate operations | 18.01 / 14.28 ms |
| Confirmation, separate operations | 1.09 / 1.23 ms |

No reconstruction occurred during that warm tick. Initial construction took
2,194 ms of the 2,210 ms begin operation. These are single in-memory Node
observations with 106 all-working NPCs, no player sessions and no Room/network;
they are not sustained four-Hz or production billing results. In particular,
the older 60.5 ms simulation and 538 ms full tick came from separate runs and
must not be subtracted as a measured phase breakdown.

The real-world late-commit failure trial confirmed unchanged durable data and
discarded speculative state. The following tick rebuilt/restored in 468 ms,
simulated in 48 ms and completed in 530 ms. The next cold pose read then failed:
`invalid Clanker world recovery placement: pdubl22 (working/travel, site 0)`.
A diagnostic rerun reproduced it. That check is paused under the repository's
two-failure STOP rule; the collision guard is unchanged. This blocks recovery
readiness despite the warm speedup. The 61 focused transaction/cache/takeover
checks pass, but do not replace that failed full-world trial.

Reduced-terrain Node retained memory is still approximately 183 MiB heap plus
68 MiB of array buffers. Provider memory fit, cold recovery, live browser flow,
strict end-to-end delivery and combined cost remain open. All activation stays
disabled; the changes are not a production-readiness claim.

## Actual host operations and confirmation correction — 2026-11-06 (v121)

One finite local profile used `createHubHost`, the real 106-actor Hub factory,
an atomic cloned in-memory store, and the all-working activity/pile fixture.
The clock advanced once by 250 ms. These are single samples, not percentiles,
SQLite/provider timings, or a sustained delivery pass. No external requests.

| Operation | Before | With bounded validation cache |
| --- | ---: | ---: |
| Begin | 2,488 ms | 2,452 ms |
| Initial poses | 774 ms | 753 ms |
| Confirm initial frame | 696 ms | 1.33 ms |
| Tick | 818 ms | 736 ms |
| Post-tick poses | 706 ms | 702 ms |
| Confirm new frame | 648 ms | 1.45 ms |
| Reject obsolete frame | 725 ms | 1.34 ms |

The correction retains one bounded immutable copy of the last successfully
validated simulation DTO. Exact scalar/structure comparison, including negative
zero, avoids rebuilding an unchanged world solely to confirm validity. Fresh
host storage, ownership, revision and session/deadline checks still run. Changed
state reconstructs and validates; query/mutation operations still use private
transaction worlds. The cache does not assert that a speculative checkpoint
committed and never retains a mutable simulation. Focused checks cover changed
and malformed inputs, cache mutation, discarded attempts, disposed scopes and
query invalidation. The paired actual-host run still rejects obsolete frames.

Tick and pose reconstruction remain far above the 250 ms budget. This correction
does not establish four-Hz delivery or solve cold recovery.

### Actual local workerd memory observation (v120)

Cached Miniflare `5.20261001.0-alpha` / workerd `1.20261001.1` constructed one
real Hub with all 106 actors, held it live for inspector measurement, and captured
a 28,543-byte checkpoint. Construction/dispatch took 2,362 ms. Inspector reported:

| Isolate metric | Before construction | Live world, before forced GC |
| --- | ---: | ---: |
| Used JS heap | 8,805,172 B | 180,688,888 B |
| Heap backing storage | 230,058 B | 80,462,636 B |
| Embedder heap | 515,872 B | 258,128 B |

The used JS heap alone is about 172 MiB, above the documented 128 MB Workers
budget; backing storage adds about 77 MiB. This is direct local isolate evidence
of a serious capacity problem, not the earlier Node RSS comparison. Local
workerd completion does not establish production fit or enforce the same quota.
The forced-GC inspector command timed out after 15 seconds; retained live-world
memory after GC and the peak remain unverified. The runtime was disposed, with
zero attempted egress and no runtime error logs. No deployment or activation.

Memory and cold reconstruction require further reduction before readiness.
Terrain geometry also supplies ramp/support queries; it cannot all be removed
as decorative data. Neither this probe nor a confirmation cache justifies
raising limits, relaxing the strict publication gate, or enabling the host.

### Retained allocation attribution (v122)

A separate bounded Node run explicitly collected garbage after yielding out of
the constructor's job. One live world retained 265,504,568 B of JS heap and
79,642,128 B of array buffers (about 253 and 76 MiB respectively). These are
Node allocations, not another Workers quota measurement. The scene graph held
3,847 nodes, 833 distinct geometries, 928,864 vertices and 451,676 faces. The
main terrain alone contributed 167,208 faces; the largest satellite branch
added 59,623. Geometry is therefore a concrete reduction target, but collision
and placement consumers must keep equivalent query results.

After disposal and another collection, heap and array buffers remained near
265 MB and 80 MB. The module retains a terrain template and model data; this
observation does not isolate their individual sizes or establish a leak. It
does show that disposal alone did not return this process to its approximately
11 MB pre-construction heap. An immutable validity cache cannot address this
world representation cost.

## Readiness audit — 2026-11-06 (v118)

Published implementation/test head `aaa05c8952018f0764b06c63ddfe4003fbebee19`
passes [exact-head CI](https://github.com/OogaBoogaX/oogaboogaland/actions/runs/42211381067):
433 unit, 41 Cloud Hopper, 281 host/recovery and 79 Room checks. This does not
validate live browser behavior, sustained delivery, runtime memory or billing.
No new browser/performance run accompanied this audit: another task owns the
local testing window. The maintainer has now explicitly approved resuming the
Hub/browser checks and necessary readiness fixes; the coordinated window is
still pending, with PR 488 active and PR 489 queued.

### Full-world reconstruction is on ordinary operations

`VirtualHost.transaction()` creates a private simulation scope for each storage
attempt and disposes it afterward. `VirtualHost.read()` invokes simulation
validation; `createHubWorldSimulation().forTransaction().validate()` calls
`use()`, which constructs and restores the actual Hub on its first access.
The scope reuses that world only within the same transaction. Consequently,
separate tick, pose, confirmation and body-movement transactions can each pay
construction/recovery costs, even when only reading. Storage retries can repeat
that work. This is source inspection, not a new timing measurement.

The v110 measurement below times a step on an already constructed world. Its
61 ms must not be presented as full host-operation latency. The measured 848 ms
reconstruction already exceeds the 250 ms target before the complete operation
is measured. Transaction isolation currently prevents speculative simulation
from leaking after failed writes; an optimization must retain that guarantee.
The next bounded profile should measure actual host operations and isolate heap,
not repeat the existing step-only probe or introduce an unverified global cache.

Cloudflare documents [128 MB per isolate](https://developers.cloudflare.com/workers/platform/limits/#memory),
including JavaScript and WebAssembly allocations. The saved 740,032 KiB Node
process RSS includes different runtime/process costs and is not an isolate-heap
measurement. It neither establishes fit nor proves a provider limit violation.
Likewise, constructing a world during an invocation is distinct from the
provider's top-level script-startup limit.

### Conditional cost arithmetic, not a production forecast

Current [SQLite pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
includes 50 million written rows per month, then $1 per million, with billable
usage rounded to billing units. KV-style methods on SQLite count as rows;
deletes and alarms also incur writes. Duration uses allocated 0.128 GB while
active, includes 400,000 GB-s/month, then $12.50/million GB-s. Requests/RPCs,
reads, retained storage, plan charges and other account usage are separate.

Source inspection still finds four steady logical writes per accepted player
sample: Room pending sample, host root, host body/receipt, Room receipt. First
samples and lifecycle events add work. Assuming one billed row per written key,
no retries and the full included write allowance available:

| Continuously changing players | Accepted samples/player/s | Writes in 30 days | Write overage only |
| --- | ---: | ---: | ---: |
| 30 | 1 | 311,040,000 | $262 |
| 30 | 4 | 1,244,160,000 | $1,195 |

For a single 15-minute run these cases imply 108,000 and 432,000 writes. These
are scenarios, not chosen cadences or measured provider charges. Client capture
suppresses unchanged accepted state; disconnected frozen bodies do not generate
a recurring movement/physics loop. NPC publication and lifecycle writes are
additional. Two continuously active objects would use 663,552 GB-s/30 days,
giving $12.50 duration overage under the same unused-allowance assumption;
that does not include any request or write charges, and no such loop is enabled.

### Delivery and access gates

The unchanged strict runner waits until the previous actual publication plus
250 ms, then confirms host freshness and submits to Room. Existing v68 evidence
measured 3–7 ms after that gate: those positive delays accumulate against fixed
250 ms arrivals. Faster simulation alone does not remove this pacing issue.
Burst remains disabled; final ownership confirmation and rate safeguards remain.
Co-locating authoritative publication checks is a design candidate requiring
race/recovery validation, not an approved shortcut or a measured solution.

Required next access: a coordinated local performance window. Resuming the
STOP-restricted live Hub/browser checks has been explicitly approved. Local
workerd can validate runtime behavior without deployment, but production cost
and latency remain unknown without provider evidence. No deployment, activation,
paid loop, rate relaxation or production-data access was performed.

Historical restricted measurements below: 2026-11-05. All activation remains disabled. These are finite local
workerd/SQLite trials, not production telemetry or a permission to start a loop.
The cached runtime is Miniflare `5.20261001.0-alpha`, which differs from the
repository's declared Wrangler. External egress was blocked; all trials recorded
zero attempted external requests and zero runtime error logs.

## Focused capacity correction — 2026-11-06 (v110)

The v109 failure was 68,603 bytes, exceeding the 63,488-byte budget by 5,115.
Using the existing lossless codec for Ooga logical state removes repeated JSON
keys and encodes exact scalars. No state was dropped and no cap was raised.

| Post-tick component | Before | After |
| --- | ---: | ---: |
| Ooga logical state | 44,496 B | 17,021 B |
| Clanker state | 19,946 B | 19,946 B |
| Activity | 2,454 B | 2,454 B |
| Lab equipment | 1,330 B | 1,330 B |
| World, inputs, layout, offices, identity/version and outer JSON overhead | 377 B | 377 B |
| Complete world | 68,603 B | 41,128 B |

After restart and another tick: 41,561 bytes, leaving 21,927 bytes (34.5%) of the
same budget. This is the reproduced all-working case, not a worst-case bound.
All 106 actors restored; both streams' logical position/job/reservation checks,
activity, equipment, offices and layout matched. Packed Ooga state decoded
exactly to the source DTO. Existing codec tests passed 10/10 after updating stale
input-mutation fixtures; no codec algorithm or limits changed.

Latest bounded Node result: construction 2,863 ms, initial capture 16.8 ms,
one tick 61.0 ms, packet 12.8 ms / 9,772 bytes, restore 848 ms (previous paired
run 778 ms), peak process RSS 740,032 KiB. Recovery exceeds the existing 250 ms
target. Transaction-by-transaction construction, steady-state performance,
mixed-status capacity and workerd memory/billing remain unresolved. No further
stress loop or activation was started. Earlier v109 failure below is historical.

## Full Hub probe — 2026-11-06 (v109)

One bounded local Node run, 53 Oogas plus 53 gorillas, actual authored Hub,
synthetic all-working activity and 69-banana pile; no external requests or DO
activation. Construction 2,825 ms; process CPU 4,903 ms user plus 238 ms system;
peak RSS 624,576 KiB (610 MiB). Initial capture 14.7 ms and 54,177 bytes against
63,488 bytes available. One tick 62.5 ms; packet assembly 12.9 ms; packet 9,772
bytes with an 81-byte land/pile layout. The next capture refused `state size`
before restart. There is no measured successful recovery or steady-state sample.

This does not satisfy the production gates. In particular, reconstructing this
world per durable mutation cannot be justified by the one-tick figure. Cold
construction, post-tick capacity and Workers memory/CPU must be resolved before
billing estimates or activation. Earlier restricted-world results below do not
represent this full scene. No caps or rate policy were relaxed.

The host now has zero mempool/backlog reads or water-state writes. It retains
only the existing bounded Oogatron and private BananaPay aggregate reads within
an explicitly started finite run. Hosted Ooga path state has two 512-element
Float64 waypoint arrays (8,192 bytes/actor), replacing the general planner's
81,920-byte per-actor arrays and shared graph; this is allocated storage, not a
measured whole-world memory saving. NPC collision/support and rendered rigs
still dominate substantial work and have not been optimized by this change.

## Recovery events

Thirty actual source Clanker player bodies start in independent empty authored
meadows, with nonzero velocity. Their accepted positions are retained exactly;
all velocity becomes zero. Runtime reconstruction uses the same SQLite directory.
Injected rollback, stale-owner refusal and all 30 restored body records pass.

| World | Event | Recovery wall ms | Key writes | JSON value bytes written |
| --- | --- | ---: | ---: | ---: |
| 64 KiB padded world | Known closes, expiry | 4.69 | 1 | 80,770 |
| 64 KiB padded world | Unknown closes, expiry | 6.34 | 31 | 92,012 |
| 64 KiB padded world | Unknown closes after 250 ms | 9.14 | 31 | 92,315 |
| 53 restricted source NPCs | Known closes, expiry | 4.83 | 1 | 39,387 |
| 53 restricted source NPCs | Unknown closes, expiry | 5.43 | 31 | 51,409 |
| 53 restricted source NPCs | Unknown closes after 250 ms | 32.92 | 31 | 51,712 |

Every event used zero NPC steps, zero offline physics steps and zero reconstructed
body controllers. Each cell is one observation, not p95 or a worst-case bound.
Cold begin took 151–179 ms with the NPC world; cold runtime reconstruction took
86–95 ms. Those include disposable fixture bootstrap rigs and runtime startup.

Duplicate events and public snapshot reads made zero writes. They still loaded
51–92 KB through the storage adapter. NPC-world snapshot reads took 18–20 ms;
the padded-world reads took 2.5–2.9 ms. Snapshot reads validate the saved world
and complete body rows, so absence of physics does not imply zero work.
Public frames were 13.6–14.9 KB. These costs argue against periodic refreshes
solely for stationary bodies; use close/reclaim/expiry events and late joins.

## Combined strict delivery

One 30-second trial used 53 restricted source NPCs, 30 frozen bodies, actual Room
RPC/WebSocket delivery and 32 Node protocol clients (31 decoders, one stalled
receiver), with 20 ms synthetic downstream delay. No browser or scene was loaded.
NPC ownership/collision with the independent player fixtures is not full-world
simulation. The 250 ms delivery rule and all other gates were unchanged.

- Host updates: 120/120 completed inside 250 ms; transaction p95 104.90 ms,
  completion-from-schedule p95 113.91 ms, maximum completion 122.13 ms.
- Host transactions: 120; key writes: 150; serialized value bytes: 7,910,156.
  The first missing-transport observation writes 30 neutralized body rows once.
  Later updates write the shared NPC/root state. These counters exclude Room
  writes, admission and diagnostic reads; they are not total billed operations.
- Client delivery: 105/120 revisions emitted, 15 superseded; 93 emitted revisions
  exceeded 250 ms. First-client p95 292.76 ms; last-client p95 354.74 ms. The
  strict end-to-end gate **fails**, despite host-side headroom.
- Wait between completed host work and publication: p95 176.76 ms. From
  publication start to first transport arrival: p95 126.93 ms. Serial client
  processing adds p95 67.66 ms from first to last decoder in this one Node
  process. This is a fixture limitation, not evidence that phones are fast.
- Delivered bytes: 24,971,432 including warmup. One stalled receiver remained
  bounded at its single unacknowledged frame. Restart/rollback preserved the
  final state and all 120 reference NPC steps.

The frozen design removes recurring player-body simulation, but it does not fix
strict publication scheduling or client decode cost. Do not enable burst or
relax the gate to turn this result into a pass.

## Planning arithmetic, not an account bill

[Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
was checked on 2026-11-05: paid SQLite includes 50 million row writes monthly,
then $1/million; KV methods on SQLite are billed as rows. RPC sessions and
non-hibernating wall time also cost money. Active duration uses allocated
128 MB, not the measured body size. Included allocations are shared with other
account usage; excess units round upward. Actual plan/usage was not inspected.

The v2 body store performs four logical key writes per steady accepted sample:
Room inbox, host root, host body including its receipt, and Room completion. The
first sample also writes the Room handoff marker (five total). A focused actual
Clanker fixture counts these writes across both atomic stores. Its one steady
sample took 24.60 ms and wrote 1,420 host JSON bytes plus 656 Room JSON bytes;
this is in-memory Node, not SQLite/RPC, a percentile, or provider CPU. The prior
five-write steady path and its separate receipt index are superseded. Assuming one billed row per key write, no retries/extra writes and all
50 million included writes available, 30 continuously active players for a
30-day month would produce:

| Accepted samples/player/sec | Logical writes/month | Illustrative write overage alone |
| ---: | ---: | ---: |
| 1 | 311,040,000 | $262 |
| 4 | 1,244,160,000 | $1,195 |

These scenarios exclude compute, requests, reads, base plan, other services and
other account usage. They are not selected production cadences or forecasts.
This removes 20% of steady logical writes, but remains expensive for continuous
movement. Frozen-body savings do not establish a safe production capture cadence.
Changes before the last durable acceptance can still be lost; any lower cadence
must explicitly quantify position staleness rather than promise exact continuity.

## Integration blockers and reproduction

The inactive Room census now retains all known references while closed or
uncertain outbox work is pending. `reconcileRoomBodies` refuses to infer absence
until that work settles, and compares the host revision read before the Room
RPC to prevent concurrent admission/ACK/movement being marked offline. Focused
tests cover these paths. It does not add an HTTP route, timer or advertised
client feature.

Closed-only Room cleanup now accepts its exact retained authority descriptor
after lease/run expiry. The host coordinator requires a valid current host fence,
recovers or cancels uncertain operations, and requires passive/absent proof for
the exact generation before retiring the row. It does not renew the run/lease,
send grants, replay movement or alter deadlines; takeover fences old calls.
The closed-row coordinator now performs exact-body no-live-send rollback or a
single confirmed close before proving the reference passive/absent. It protects
unrelated live generations and preserves the original deadline/run/lease. It
recovers/cancels uncertain commands before either action. Automatic scheduling and
host reacquisition when only pending departures remain are unfinished. The runner must
serialize/reconcile explicit close operations before taking its ready census.

Other open gates: actual earliest-deadline alarms, public event delivery/ACK,
stationary actor creation/cleanup and live scene binding, full-world collision
and NPC mapping, first-login ghost continuity, capture cadence/write reduction,
strict delivery headroom and provider resource verification. Existing Hub/browser
STOP restrictions prevent the corresponding live visual tests.

Use an already-installed cached Miniflare package, with no installation:

```sh
HOST_RUNTIME_PACKAGE=/path/to/miniflare/package.json node worker/eval/body-session-runtime.mjs --events
HOST_RUNTIME_PACKAGE=/path/to/miniflare/package.json node worker/eval/body-session-runtime.mjs --events --roaming
HOST_RUNTIME_PACKAGE=/path/to/miniflare/package.json node worker/eval/body-session-runtime.mjs --steady --roaming --deliver --pipeline --cached-room --frames=120 --client-delay-ms=20
```

The JSON output records source hashes, runtime, fixture flags, per-frame timings,
storage counters and explicit limitations. The local task retains the complete
outputs as `verification-frozen-sqlite-events.json`,
`verification-frozen-sqlite-npcs.json`, and
`verification-frozen-strict-delivery.json`. Later source changes require fresh
verification before reusing the numbers as evidence for that changed path.


## Storage v2 follow-up measurements

The maximum receipt is 268 JSON bytes. Together with the full 8,192-byte body
component and all maximum identity/metadata fields, the v2 row is 8,875 bytes;
341 bytes remain below the unchanged 9,216-byte cap. Component nodes remain 128
with 19 envelope/receipt nodes within the existing 24-node allowance. Receipt
retention, body position and root commit remain atomic. Version 1 envelopes are
refused without mutation; an explicit drain/migration is required before reusing
old preview storage. No production binding uses this layout.

A fresh finite SQLite/workerd run with 53 restricted source NPCs and 30 player
records measured known expiry 4.85 ms/1 write/39,387 JSON bytes; unknown expiry
5.98 ms/31 writes/51,889 bytes; and unknown 250 ms absence 32.95 ms/31 writes/
52,192 bytes. All used zero body constructions, offline physics and NPC steps.
No-op and snapshot reads made zero writes; snapshot reads took 18.52–19.10 ms.
Each event is a single observation, not a tail-latency bound. Restart and rollback
passed; long cases replaced/fenced the owner, short recovery retained its lease.
Evidence: `verification-v54-frozen-events.json`. These tests do not exercise Room
closed-handoff retirement; that path is covered by focused in-memory tests.

A separate 30-second diagnostic kept the strict 250 ms rule, 53 restricted NPCs,
30 frozen records, 32 protocol connections and 20 ms synthetic downstream delay,
but decoded only one client instead of 31 in one Node process. It still failed:
112/120 emitted, eight superseded, 54 late. First-client p95 was 286.11 ms and
last-client p95 286.26 ms, despite host completion p95 69.23 ms (zero host misses).
First-to-last-client p95 fell to 0.65 ms, so serial multi-client decoding is not
the only bottleneck. Waiting before publication was p95 142.19 ms; publication
to first transport p95 152.10 ms. It wrote 150 host keys/7,910,636 JSON bytes and
delivered 26,641,340 bytes including warmup; Room writes are not counted there.
Evidence: `verification-v54-strict-one-decoder.json`, zero egress/runtime logs.

The source schedules the next attempt 250 ms after the last attempt and the
next commit 250 ms after the last actual commit. It waits before final host
confirmation/Room RPC, so that work adds delay each cycle and eventually makes a
prepared revision stale. Moving the wait past confirmation could widen the
ownership race; that change needs an explicit atomic publication protocol, not
an arbitrary earlier wake or relaxed rate guard. No such change is enabled.
The one-decoder trial is diagnostic, not a substitute for representative clients,
full-world geometry/AI, authenticated live movement or billed-resource validation.


## v56 scheduling diagnosis and closed-row integration

Five independently authored Claude Code fake-clock tests diagnose delayed strict
publication, finite shutdown, supersession and malformed commit evidence. Codex
reviewed and ran them, and added a finite-commit-time guard: a late reply may
confirm a commit made before `until`, but cannot legitimize one stamped at or
after it. In the modeled callback, 40 ms of work after the commit gate produces
290 ms commit intervals (about 3.45 Hz). This is a deterministic diagnosis of the
current scheduler, not an approved lower performance target or provider result.

A fresh 30-second local workerd/SQLite run with 53 restricted NPCs, 30 frozen
records, 32 protocol connections, 31 decoders and 20 ms synthetic delay still
fails the unchanged strict gate: 113/120 revisions delivered, seven superseded,
101 late. First-client p95 is 283.48 ms; last-client p95 349.23 ms. All host
updates finish within 250 ms (completion p95 109.31 ms, max 122.47 ms); host
transaction p95 is 100.58 ms. Publication wait p95 94.73 ms, publication-to-first
transport p95 127.55 ms and serial first-to-last decoder p95 68.75 ms remain
separate contributors. Host writes are 150 keys/7,910,636 JSON bytes; delivered
bytes including warmup are 26,885,992. Room/admission/diagnostic costs remain
excluded from the storage count. Zero external egress and runtime error logs.
Evidence: `verification-v56-strict-delivery.json`, with the same fixture/runtime
limitations as prior measurements. A subsequent token-format check affects only
the retained-close boundary, which this NPC delivery benchmark does not invoke.

The new close path is event-driven and bounded to one retained Room row; it
performs no offline physics or NPC tick and infers no unrelated live absences.
It can still sweep already-due retained grace records, within the existing cap.
It does not install alarms or quantify production close-storm costs. Integrating
many independent closes must measure root/body write amplification before any
activation; the single-row safety change is not a throughput/cost certification.


## v57 finite disconnect-cost comparison

`node worker/eval/body-session-runtime.mjs --close-storm --roaming` adds a
finite, local-only comparison using the same cached SQLite/workerd runtime,
53 restricted NPCs and 30 independently admitted player bodies. All bodies start
live; 1, 15 or 30 are closed individually through `closeRetainedBody`. A separate
scenario reconciles 30 explicit closes with a complete trusted census in one
`reconcileBodies` call. This comparison does not add batching or timers to the
live Room, and a single retained close must never masquerade as a complete census.

| Closed bodies / method | Operations | Wall time total | Host key writes | JSON bytes written | Host bytes read |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / individual | 1 | 4.01 ms | 2 | 41,489 | 54,576 |
| 15 / individual | 15 | 52.29 ms | 30 | 617,394 | 810,408 |
| 30 / individual | 30 | 100.97 ms | 60 | 1,224,054 | 1,602,888 |
| 30 / complete census | 1 | 4.67 ms | 31 | 52,192 | 54,576 |

Individual-close operation p95 was 3 ms for each scenario; the single census
operation was 4 ms. These workerd clock measurements are coarse integer
milliseconds. Wall time includes local dispatch and post-operation diagnostic
reads. Key counts/bytes cover the host transaction only, exclude Room close
journals, admissions, duplicates, verification and diagnostics, and are neither
provider billable row counts nor billed CPU. Each scenario runs once, so its
within-scenario percentiles do not establish repeatability or production tails.
The workload is 30 bodies, not the storage maximum of 32 or a worst-case record.

The individual path rewrites the root for each close; it remains bounded but
amplifies write bytes by about 23.5 times compared with the complete-census
scenario. Prefer the existing revision-fenced census path when its readiness
contract is satisfied; use the exact retained-close path for isolated uncertain
rows. Do not wait indefinitely for a census, infer unrelated disconnections,
extend grace deadlines or weaken fencing to obtain the lower number. Automatic
coordination, worst-case simultaneous reconnect/close workloads and combined
Room costs remain unverified before activation.

All scenarios preserved frozen location, the original close + 60-second
deadline, live siblings, host lease and run end. There were zero NPC steps and
zero body constructions during close operations. Replaying every close wrote
nothing; all 30 body records survived a runtime reconstruction and restored
through the actual body codec. Zero external egress or runtime error logs.
This is orderly local persistence testing, not abrupt process-loss or browser
validation. Evidence: `verification-v57-close-storm.json` with source hashes.

Two additional independent Claude-authored tests, reviewed and run by Codex,
cover duplicate closes racing same-account reclaim and original-deadline expiry
after a host restart. Two overlapping proposed tests were left out in favor of
the existing retained-close coverage. No pacing, activation or capacity gate was
changed; the v56 strict-delivery failure remains open.


## v58 departure-only cleanup and strict pacing analysis

The finite `--events --roaming --cleanup-ack` SQLite/workerd check uses 53
restricted NPCs and 30 independent body records. After the NPC run and lease
expire, the cleanup-only owner can read all 30 departures, acknowledge 15,
reconcile a stale receipt without writes, and acknowledge the remaining 15.
Injected write failure preserves the whole record. Remaining bodies restore
through the actual codec after partial compaction; the final empty state survives
runtime reconstruction. No body construction, physics or NPC tick occurs during
acknowledgement. Final acknowledgement stops ownership rather than renewing it.

For known/unknown-close scenarios, partial acknowledgement took 4.49/5.12 ms,
with 16 key puts (38,278 JSON bytes) and 15 key deletes. Final acknowledgement
took 2.05/2.37 ms, with one root put (24,600 bytes) and 15 deletes. The partial
case rewrites shifted rows because this storage format uses dense slots; that
compaction cost is included. Deletes are now counted separately in the evaluator
and must not be omitted from future provider cost accounting. These are single
local observations, not billed CPU, provider billing units or production tail
measurements. Room retention/delivery costs are excluded. Evidence:
`verification-v58-cleanup-runtime.json`; zero external egress/error logs.

A read-only analysis of the existing v56 strict-delivery trace isolates drift:
the first 20 committed gaps are 255–257 ms (median 255.5), accumulating 111 ms
beyond the nominal 250 ms intervals before any of those gaps skips a revision.
Across all attempts, pose projection p95 is 28 ms, the wait inside the publication
callback p95 is 110 ms, final host confirmation p95 is 2 ms, and Room publication
RPC p95 is 15 ms. These named phases differ from the earlier end-to-end queue and
transport measurements. This analysis does not rerun the workload or establish a
new performance result; evidence is `verification-v58-delivery-analysis.json`,
which names and hashes the original trace.

Strict pacing waits before final host confirmation and Room RPC; their positive
post-gate cost accumulates. Reducing rig projection alone cannot eliminate that
drift. A future protocol change must place pacing near the actual Room commit
while preserving a fresh ownership/revision check and bounded in-flight work.
Moving the existing host check earlier, acknowledging an uncommitted frame, or
allowing catch-up bursts would weaken current safeguards and is not implemented.
Strict delivery remains a blocking gate; no rate, burst or activation change.


## v59 body-presentation encoding and delivery bounds

`node worker/eval/body-presence-size.mjs` validates 32-record frames through the
actual retention module. Representative frozen/mixed/departure frames are
13,189 / 13,851 / 14,524 JSON bytes. Long-identity/large-number cases, including
occupancy or existing-NPC handback, are 22,845 / 23,484 / 24,125 bytes. The largest
measured frame leaves 8,643 bytes below the unchanged 32-KiB limit; its persisted
Room row is 24,344 bytes. These cases stress bounded fields but are not an
exhaustive proof of the largest possible numeric encoding.

Each new snapshot makes one logical Room-row put. Exact duplicate reconciliation
is read-only. A complete send to 32 ready viewers encodes 425,888–777,696 bytes
across the measured cases, including each message envelope. Hibernation credit
bounds each viewer to one unacknowledged frame; subsequent updates coalesce.
These are byte counts and logical in-memory writes, not billed writes, provider
CPU, actual egress, latency or a sustained body-event benchmark. Retained-state
compatibility also adds one key read when Room wakes. Account and production
billing remain uninspected. Evidence: `verification-v59-presence-size.json`,
including source hashes and reproduction scope.

A body-event path should not run on the NPC simulation cadence or refresh
stationary bodies continuously. Combined movement/capture cadence, Room writes,
viewer decode/scene cost and strict NPC publication throughput still need a
representative integrated runtime measurement. The v56 strict-delivery failure
remains open; this change neither reruns that benchmark nor relaxes its gate.


## v60 client receiver and read amplification (local only)

The finite `node worker/eval/body-presence-size.mjs --receiver` audit now includes
actual public-wire parsing, validation, immutable retention and an ACK sink for
32 serial Node receivers. Each of six profiles runs 20 warmups and 100 measured
frames, with no socket, rendering, physics, timer or provider resource. Evidence:
`verification-v60-presence-size.json` includes source hashes. Representative
32-view/mixed/all-departure batches took 3.865 / 4.166 / 4.341 ms p95 for all
32 receivers; long-identity/large-number cases took 6.484 / 6.682 / 6.814 ms p95.
These are aggregate single-process source timings, not individual browser p95s,
network latency, durable runtime costs or a production bill.

The added send timestamp raises envelope size to 13,332–24,326 bytes across these
cases; 32 ready viewers imply 426,624–778,432 application bytes per event before
transport overhead. The largest tested frame remains 24,125 bytes (8,643 bytes
headroom); the durable row remains 24,344 bytes (9,448 bytes headroom). These are
bounded stress cases, not an exhaustive numeric-encoding maximum. No capacity
limit has changed.

Actual Room tests verify a single retained-frame cache: after its first validated
read, all 32 late-join deliveries and 20 off/on hub toggles reuse that frame without
additional durable snapshot reads. Each successful new retention invalidates the
cache, and authority changes force a new validated read. A socket ACK still cannot
free host departure state. This reduces read amplification; it does not reduce
the previously measured durable writes per movement/event or establish provider
billing. Host events still require explicit orchestration; no continuous loop was
enabled.

No new strict-delivery run was performed: the publication scheduler and rate
policy did not change. The v56 failure and v58 post-pacing latency analysis remain
applicable. The strict 250 ms minimum between committed sends plus positive final
ownership-check/RPC latency causes drift against a fixed 250 ms production clock.
Moving the confirmation earlier or enabling catch-up bursts would change the
safety/rate contract, so neither was done. A solution must preserve fresh fencing
and the rate safeguard, with a new representative end-to-end trial before the
performance gate can be considered passed.


## Local v61: gate-phased projection experiment (gate still fails)

One finite cached-workerd run added `--project-near-gate` to the strict pipeline:
120 scheduled frames, 53 restricted roaming NPCs, 30 frozen player records, 32
connections with 31 serial Node decoders, one stalled receiver and 20 ms synthetic
delay. The experiment waits until 50 ms before the existing publication gate to
capture poses. It preserves final host confirmation after the gate, the Room's
minimum 250 ms interval, fixed simulation arrival grid, all caps and disabled burst.
It is an opt-in harness experiment, not a production scheduler change.

Evidence: `verification-v61-gate-projection.json` and derived
`verification-v61-gate-analysis.json`. It published 113/120 frames, superseded seven,
and had 104 late emitted frames. First-client p95 was 284.27 ms and last-client p95
349.16 ms; the throughput gate remains false. Logical Room commit gaps were minimum
254, median 256, p95 400 and maximum 450 ms; the first 20 gaps accumulated 123 ms
above the fixed grid. No gap violated the existing minimum. These timestamps
precede durable completion and are not socket-receive timestamps.

Post-projection pacing p95 fell to 55 ms (previous run 110 ms), but the experiment
moved waiting before projection: pre-projection pacing p95 was 70 ms. Host projection
p95 was 29 ms, final confirmation 2 ms and Room RPC 15 ms. Overall delivered age and
supersession did not improve materially, so this is not a successful performance
fix. It is one non-isolated-machine sample, not a statistical A/B comparison.

Host completion p95/max was 111.84/120.73 ms. The run recorded 150 host puts and
7,910,636 serialized host-write bytes, plus 26,876,909 delivered application bytes
including warmup. Room/admission/diagnostic writes, actual provider billing, network,
full-world collision and browser rendering are excluded. There were no attempted
outbound requests or runtime error logs. All workerd instances and timers ended.

Claude's independent timing review correctly separated logical commit time from
delivery and identified post-gate work, but its proposed <=1 ms timer overshoot and
1–2 ms gain were not measured guarantees. Separate clocks alone do not explain
this drift: positive work after the gate matters even on a shared clock. The new
measurement does not justify moving confirmation earlier, enabling bursts, raising
limits or redefining the performance gate. Production costs and readiness remain
unproven; frozen-body event delivery must remain separate from shared NPC cadence.


## Local v62: eliminate one redundant mixed-packet decode

`RoomNpcAuthority.publish` still fully validates the persisted record and incoming
copied packet against the current authority. Its final constructed-record check
now validates all metadata/scalar/cadence invariants without decoding the same new
packet again. External/cold-read validation remains complete. The private shortcut
is unavailable through the exported validator; the strict rate gate, ownership,
lease, duplicate-byte reconciliation and storage transaction are unchanged.

Claude independently reviewed the invariant chain. Codex verified that `posesFor`
depends only on the unchanged authority descriptor and frame, and retained the
cheap final metadata check to cover injected callbacks or aliased mock storage.
Twenty-six focused Room/publication tests pass, including failure, restart,
duplicate, takeover, migration and mixed-protocol paths.

The final source was measured once with the same v61 gate-phased strict workload:
120 fixed-grid frames, 53 restricted NPCs, 30 frozen records, 32 connections and
31 serial Node decoders with 20 ms synthetic delay. Room RPC p50/p95/max was
10/13/14 ms, compared with 13/15/21 ms in v61. This single-run comparison shows
less local Room work, not a statistically established production improvement.

The delivery gate still fails: 112/120 frames, eight superseded, 100 late;
first-client p95 283.41 ms, last-client p95 348.18 ms. Logical Room gaps were
minimum 254, median 256, p95 423 and maximum 468 ms. The first 20 gaps accumulated
118 ms excess. Host completion p95/max was 113.57/130.12 ms. There were 150 host
puts and 7,910,636 serialized write bytes, plus 26,644,657 delivered application
bytes including warmup. No attempted egress or runtime error logs occurred.

Evidence: `verification-v62-publication-final.json` and derived
`verification-v62-publication-analysis.json`. The earlier candidate run is retained
separately; it predates reinstating the final cheap metadata check. Both completed
and all local runtime processes/timers stopped. These runs exclude full-world
physics, real network/browser rendering, Room/admission/diagnostic billing and
provider CPU/cost certification. No activation, rate relaxation or paid loop.


## Local v63: trace final publication scheduling

An opt-in harness trace now records projection completion, gate release, final
host confirmation, Room entry and logical publication time. The production
scheduler, ownership checks, rate guard and limits did not change. One finite
30-second trial used the same 53 restricted NPCs, 30 frozen bodies, 32 connections,
31 serial Node decoders and 20 ms synthetic delay as v62. It published 109/120
frames, superseded 11 and delivered 100 late frames. First-client p95 was 284.70 ms;
last-client p95 was 348.13 ms. The strict gate remains false.

Among 96 successful publications whose projection finished before the gate,
gate-release lag was median/p95 2/2 ms and maximum 3 ms. Thirteen successful
publications reached that point after their gate had passed; their median lag was
193 ms. Calling the latter timer overshoot would be misleading: these observations
include late preparation and gaps following superseded attempts.

For 97 pairs with consecutive simulation sequences, logical publication intervals
were minimum/median/p95/maximum 254/256/258/259 ms. Final work after gate release
took median/p95/max 4/6/7 ms: host confirmation was 2/3/4 ms, Room ingress 0/1/1 ms
and Room entry to its logical timestamp 2/3/3 ms. Room work after that timestamp
was 9/11/14 ms. Millisecond wall clocks are coarse; the logical timestamp precedes
durable completion and is not socket arrival or billed CPU. These stages explain
accumulating delay without weakening fencing, but do not establish a safe fix.
The next publication protocol must reconcile ownership and scheduling atomically;
merely waking confirmation earlier is not proven safe.

There were 150 host puts/7,910,636 serialized host-write bytes and 25,919,443
application delivery bytes including warmup; Room/admission/diagnostic writes and
provider billing remain excluded. Egress attempts and runtime error logs were zero.
Evidence: verification-v63-publication-trace.json (SHA256
16dac7e90088c857a9c0a67459cad6321bc50ee5ebee0c42619548e06f7d1c7d), with
verification-v63-trace-classified.json separating waited versus already-late
publications. The earlier trace-analysis artifact labels aggregate gate lag
“gateOvershoot”; the classified analysis corrects that interpretation. No unchanged
benchmark was repeated. This is restricted local evidence, not full-world,
browser, network or production cost certification. Activation remains disabled.


## v64: scheduling assessment, with rate policy unchanged

An independent Claude Code source assessment considered moving the wait into
Room after host confirmation. Codex checked the host lease, revision and Room
commit paths: host and Room remain separate atomic domains. A fresh host check
before a deliberate wait does not protect against a later lifecycle/revision
change, and Room's own authority cannot prove that the host's exact revision is
still current. A proposed time-limited receipt also needs a defined clock/error
model, mutation/revocation semantics and final reconciliation of delayed requests;
a host lease horizon alone is insufficient. No such protocol was installed.

The trace already measures positive work after the rate gate, so a proposed clock
skew explanation is not established by those measurements. Likewise, “at most one
stale frame” would depend on enforcing a single coordinator and bounding in-flight
requests; it is not a proven cross-process guarantee. The existing rate and final
confirmation checks remain unchanged. No new throughput benchmark was run for
this model-change hook, and the v63 strict delivery failure remains an open gate.

## v65: reproduced host/Room takeover gap

At v65, `worker/eval/publication-takeover.mjs` reproduced this gap in a finite
source-level diagnostic. It uses the actual VirtualHost, RoomNpcAuthority and publication bridge with serial,
rollback-capable in-memory stores, an authored data-only simulation and one shared
logical clock. No Hub, browser, network, timer or production resource is involved.
The v65 output is retained as `verification-v65-publication-takeover.json`.
The v66 evaluator now asserts that the delayed frame is rejected instead.

The host begins at 100000 with lease expiry 110000. Room first acquires authority
and publishes at 109750, giving its separate lease expiry 119750. A host session
mutation increments the revision at 109751 without renewing host ownership. That
revision passes final confirmation, but its Room call is delayed until 110001.
At that point runner B successfully acquires host epoch 2. Room nevertheless
accepts the in-flight epoch-1 publication and renews its lease to 120001. Old host
reads correctly fail with `host fenced`; new Room acquisition correctly refuses
while the independent old Room lease remains live.

This reproduces stale presentation after host takeover and delayed replacement
Room acquisition in the existing cross-object protocol. It does not demonstrate
two simultaneous Room owners, establish a production delay distribution, or prove
a bound on stale requests across processes. Moving the rate wait after confirmation
would widen an already-existing gap. A second check after publication cannot undo
a frame already sent. A safe scheduling change therefore needs coordinated
publication/takeover fencing, including delayed requests and lifecycle mutations;
the separate leases and a timestamp alone do not provide that guarantee.

No scheduler, lease, rate, capacity or activation policy changed. The latest strict
runtime result remains v63's failed gate. This diagnostic adds no CPU or billing
measurement. Activation stays disabled pending both ownership and performance
validation.

## v66: coordinated takeover verification and current strict-delivery result

The host now persists a takeover intent, fences Room, then grants its replacement
ticket. `node worker/eval/publication-takeover.mjs` reports both authorities at
epoch 2, no replacement pose committed, and the delayed old frame rejected. Rate
debt survives the fence. This resolves the v65 acceptance race for the coordinated
NPC publication path; it does not make ordinary host revision/lifecycle changes
atomic with every Room publication. The final host confirmation remains in place.

Binding adds one initial host write. A successful takeover adds two host writes
(intent and completion) plus one Room fence write; no new host write is added per
steady publication. The tested typical pending binding encodes to 175 JSON bytes;
maximum-width identifiers and counters encode to 421 bytes. The corresponding
empty-session host metadata example is 917 bytes within the unchanged 2,048-byte
reservation and 128-node cap. These are encoding measurements; the independent
scalar maxima do not describe one simulated timeline. Every actual checkpoint
continues to validate the full metadata and admitted-session reservations.

The local SQLite/workerd smoke used two actors, two viewers and 30 frozen sessions.
It passed restart, coordinated takeover, preserved frozen position/timestamp/grace,
timely reclaim, bounded catch-up, late joins and rejection of old host/Room frames
and old ACKs. Peak checkpoint/frame sizes were 18,705/523 bytes. Five catch-up
operations each took at most eight NPC steps and zero disconnected-body steps.
These small samples are correctness evidence, not a capacity or latency percentile
claim. The first attempt was blocked by loopback permissions before assertions;
the first executed run exposed an obsolete moving-body assertion, corrected to
require unchanged frozen motion, timestamp and deadline. The corrected run passed.

One representative strict trial used 53 restricted NPCs, 30 frozen records,
32 protocol connections (31 serial Node decoders, one stalled) and 20 ms synthetic
downstream delay, for 120 target frames. **The gate still fails:** 113 frames
published, seven superseded and 99 late. First-client p95 was 282.64 ms and
last-client p95 345.59 ms. Consecutive-sequence logical publication gaps were
minimum/median/p95/maximum 254/256/257/259 ms. The takeover fix does not remove
post-gate scheduling/confirmation work; neither cadence nor the rate guard changed.

The steady sample recorded 150 host puts, 7,915,917 serialized write bytes and
26,893,122 delivered application bytes including warmup. The one-time binding and
admission writes are outside those steady host-put counters; Room, diagnostic,
provider billing and browser costs remain excluded. Host completion p95 was
109.39 ms. Egress attempts and runtime errors were zero. The cached runtime was
Miniflare 5.20261001.0-alpha / workerd 1.20261001.1, not production certification.

Artifacts: `verification-v66-workerd-smoke-fixed.json`,
`verification-v66-strict.json` (SHA256
`dcd8e494cacc28cd17beba651c4428375ee7f6874296c5a88b1c922f8586180c`), and
`verification-v66-strict-summary.json`. Activation stays disabled pending live
world/profile integration, lifecycle orchestration, coordinated finite-run
rollover, strict delivery headroom and combined resource/cost validation. No paid
loop, deployment, provisioning or production action occurred.


## v67: review fixes and close-path cost bounds

The independent v66 review identified release/restart liveness gaps, an expired
first-publication lease, and initial-binding races. The later local fixes passed
229 focused Worker/source checks. A drained close adds two host writes (intent and
completion) plus one Room release write; an already browser-mode Room needs no
release write. A racing old takeover may add one failed CAS attempt. An identical
completed-close reconciliation adds no writes. No steady host publication write,
recurring timer, larger capacity reservation or relaxed rate policy was added.

The maximum-width release binding measures 440 JSON bytes, with its empty-session
host metadata measuring 936 bytes, below the unchanged 2,048-byte/128-node bound.
These are encoding bounds rather than one physically realizable timeline. Room's
optional `fencePending` flag adds 20 JSON bytes while true and 21 while false,
including its comma, and is removed on authority configuration/release. The
explicit release also retains strict rate debt for records that never used a
coordinated takeover.

`verification-v67-checkpoint.log` records the combined checks. The v66 workerd
smoke and representative throughput sample predate these lifecycle edits; they
must not be described as validation of v67. No unchanged benchmark was repeated.
There is still no production billing evidence, full-world browser validation or
strict four-Hz pass. Occupied-world migration, live scene integration and realistic
combined cost remain blockers. Activation and burst stay disabled.


## v68: recovery costs and paired publication delay

Explicit recovery from browser authority uses the existing two host takeover
writes plus one Room reacquisition write, without changing the run deadline or
adding steady-state writes. Final drained release uses one Room transaction for
authority plus two compatibility-key deletions; the host retains its two-step
release protocol. Outbox checking is bounded by its existing 32-entry index, and
a nonempty index prevents release. No recurring task or paid loop was enabled.

A post-analysis of the saved v66 strict trace (no new benchmark) measures paired
spans within the local runtime. Across 113 emitted frames, final host confirmation
was median 2 / p95 3 ms; Room entry to its recorded publication timestamp was
median 2 / p95 3 ms. The paired total from pacing-gate wake to recorded publication
was minimum 3 / median 4 / p95 5 / maximum 7 ms. Across 105 consecutive-sequence
pairs, recorded publication gaps were 254/256/257/259 ms (minimum/median/p95/max).
The timestamp is taken inside the Room transaction, before completion; its return
followed median 9 / p95 10 ms later. These are integer-millisecond local spans,
not Cloudflare production CPU or network measurements.

The strict gate is tied to the prior actual publication. Positive work after that
gate accumulates phase delay against fixed 250 ms input arrivals. Reducing other
simulation work alone does not eliminate that scheduling structure. Moving the
final host confirmation earlier would weaken the current freshness check; burst
or rate changes remain unapproved. A different ownership-safe publication design
or a separately considered service target is still needed before activation.
The serial Node client harness adds a distinct median 64.95 / p95 68.26 ms from
first to last decoder; it is not per-user CPU for independent real browsers.

Artifact: `verification-v68-delivery-analysis.json`, derived from the unchanged
v66 strict artifact hash above. The analysis does not turn the failed gate into a
pass, and v68 source changes have not had a fresh workerd load or browser run.


## v69: client identity bridge, unchanged delivery gate

Account/body-to-character resolution is event-driven at replica creation, local
attachment and grant change. It adds no durable writes or wire fields and no
stationary-body physics. The existing unchanged-body early return avoids adding
an allocation to every scene update. Live replica construction makes one resolved
record copy when that replica is created, not per pose update. No production CPU
measurement is claimed; source/rig checks retain the no-recurring-pose-work guard.

The saved v66 timing evidence and v68 paired-delay analysis still apply to the
publication investigation; v69 does not modify that algorithm. With a strict
250 ms minimum measured from each actual Room publication, positive work after
the gate creates drift against a 250 ms arrival stream. Moving the confirmation
earlier or allowing burst would change the safety/rate contract. No such change
was made. Co-locating the decisive ownership check with publication commit is a
possible future design to assess, not an implemented or measured solution.
Activation remains blocked by that gate and the live-world validation gaps.

## v70: connected stop cost and unchanged pacing

The stop barrier adds one logical write of the existing bounded handoff row per
new stop request. Retries read that row and resend the same small control message;
they do not rewrite its timestamp. The existing decline/cleanup path handles the
acknowledgement. No per-body timer, extra durable record, recurring publication or
physics loop is introduced. The handoff row remains capped at 34,816 bytes.

The focused fixture measured the complete JSON handoff row at 748 bytes before
stop and 764 bytes afterward. The new field adds at most 26 JSON bytes with a
maximum-width safe integer timestamp; revision growth can also add a digit.
This is metadata overhead, not a claim that every real transfer fits 764 bytes:
the retained checkpoint determines the full row size, and the existing bound
continues to reject oversized records. Provider key/encoding overhead, billed
operations, network latency and production CPU were not measured here.

The combined source checks still enforce strict publication delay/deadline rules.
No new workerd benchmark was run, and the previously failed four-Hz result is
unchanged. Connected mode switching and real Hub performance remain unverified.

## v71: bounded connected migration journal

One explicit migration commits two logical puts (Room authority and the release
journal) and deletes the two retired body-mode markers in the same transaction.
The journal holds at most 32 account/connection pairs in a 4,096-byte JSON bound.
A one-recipient fixture uses 160 bytes; maximum-width IDs, 64-character connection
tokens and a maximum-width authority revision use 3,659 bytes. The corresponding
private message is at most 223 JSON bytes, or 7,136 bytes for all 32 recipients.
These measurements exclude keys, provider encoding, transport and billed units.

Successful receipt retries do not write the durable journal. Socket attachments
are updated once per matching connection/revision, and the receipt can be resent
without resetting a fresh ordinary body. Restart checks the journal only when a
persisted browser-authority record exists; ordinary Rooms without such an
authority gain no migration-journal read. There is no new recurring timer or
simulation work. Production CPU and billing remain unmeasured.

Strict delivery is unchanged. The deterministic delayed-commit tests still pass
their safety contracts, while the saved load result still fails its throughput
gate. With a 250 ms minimum from each actual publication, even a fixed additional
3–7 ms after that gate yields approximately 3.89–3.95 publications per second,
before other delays. Prefetch already overlaps work before the gate; moving the
final host confirmation earlier changes the freshness guarantee. Co-locating the
decisive ownership/freshness check and publication commit remains a larger design
candidate, not a measured fix. No production-readiness claim or rate relaxation
follows from the migration tests.

## v72: quiescence uses existing socket attachments

The request and acknowledgement each serialize the existing connection attachment
once. Duplicate requests/acknowledgements perform no additional attachment writes.
The fixed quiescence value is 80 JSON bytes with a one-digit revision, 95 bytes
with a maximum-width revision, and adds at most 113 JSON bytes including its field
name/comma to an existing object. The complete authored viewer fixture measures
645 bytes before and 743 bytes after. These are JSON measurements, not provider
serialization sizes or a worst-case bound on the existing voice/scene attachment.

Cloudflare's current [WebSocket attachment documentation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocketserializeattachment)
states a 16,384-byte serialized maximum and persistence only while the socket
remains healthy. That lifetime fits this proof: replacement/disconnected viewers
must not retain permission from a former connection. Host body continuity remains
in the existing durable records. Full runtime attachment size, including existing
voice and visual metadata and provider encoding, still requires validation before
activation. Persistence failure refuses migration rather than dropping fields.

This increment creates no SQL row, timer or recurring body update. It does add a
nonce-bearing attachment field and bounded explicit control messages. Source tests
validate retry behavior; production CPU/billing and strict publication throughput
are unchanged and unverified by this increment.
