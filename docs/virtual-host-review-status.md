# Virtual host: current review status

The current truth for reviewers. It supersedes the chronology in the other
`virtual-host-*` notes where they differ. Not review-ready and not activated.
PR #30 metadata and base edits are held separately for approval and are not
changed here.

## Producer (BananaPayServer)

- #30 now integrates #31's published `4ea6c046` through signed `457c595`;
  exact-head CI 126 succeeds, with 58 focused integration checks. (Earlier, #30
  `b784ec81` integrated #31 `391d679`: 47/47 Node checks, CI 124.)
- #31's anchor and rebuild policy is under material review and not
  architecturally approved. There is no policy pivot.
- A local workerd RPC test, on an earlier producer checkpoint, passed a fresh
  unknown pile through the named `PageApi` -> `Donations` -> SQLite path.
- Unverified: an anchored pile in the runtime, staging bindings, billing.
- #31 bounds returned rows (`LIMIT 1`) and retained memory (streaming
  `reviewCredit`), but rows read and CPU are still O(history).

## Host (this repository)

- Published `1a04da8f`, which adds the CI step for the private pile source
  checks. Exact-head CI 897 (run 42293556952) succeeds: Unit 452, replay 41,
  Host/recovery 287, terrain/cache 11, Room compatibility 79, plus the 31 new
  source checks (`hub-pile-source` 23, `host-world-receiver` 6,
  `hub-source-reconcile` 2), now enforced by CI. Earlier: `23ca440e` (v159 to
  v162), CI 896, which did not yet name those three files.
- Neither allocation candidate investigated since (v165 portrait heads, v166
  packed collision cursor) is published. This does not affect earlier
  published memory work, such as the v148 retention fix or the v152 headless
  compact geometry.

### Allocation candidates investigated (excluded)

- Packed collision reads (v166, excluded). `solid-props` `geometryOf` iterates
  `geometry.faces`, which on a packed mesh would cache a frozen plain copy of
  every face (`data.legacy`). An experimental cursor read removed that:
  - A synthetic 3-face mesh's `data.legacy.size` went from 0 to 3 after
    `prepare`, add, sync and query before the change, and stayed 0 after it.
  - Focused tests passed: `hub-solid-scratch` 4/4 (after one fixture
    correction), `headless-compact-geometry` 3/3, `npc-collision` 7/7.
  - On the actual host (`verification-v167-host-solid-packed.json`): 106
    actors, eight ticks, a valid 42,868-byte checkpoint. The 68 unique
    geometries `geometryOf` examined were all unpacked: 0 packed, 0 legacy
    entries.
  - So the change has no effect in this workload. It is excluded from the
    host PR. The complete patch and files are preserved outside the repository
    (`checkpoint-v167-excluded-*`, with SHA256). `src/js/solid-props.js` and
    `worker/test/hub-solid-scratch.test.mjs` are as published at `1a04da8f`.
    The experiment's counts and test passes are not part of the PR.
- Render-only portrait heads (inventory only, no change). Across 53
  contributor templates there are 55 portrait geometries: 1,246,036 packed
  bytes. All rig geometries total 9,371,744 packed bytes, plus 237 unpacked
  meshes that were counted but not sized. These are packed payload bytes, not
  retained heap. No heap, quota or cost saving is claimed or published.

### Static collision shell packing (v173, local experiment, not promoted)

- Correctness only (`verification-v173-static-pack.json`). Two fresh baseline
  processes, then one experiment that packed the 68 static collision shells in
  place at registration, before their first tree build. The experiment used
  Float64, a diagnostic-only collision ownership flag injected into a
  temporary bundle, and the excluded v167 cursor reader.
- All three matched exactly: full checkpoint, projection and query hashes
  through build, eight ticks, v2 pile growth and reversal, and a restore, with
  106 actors. There were no observed vertex byte changes and no legacy face
  copies.
- The restore phase disposes the world and rebuilds it from its checkpoint in
  the same child process and isolate. It reused 58 already-cached collision
  meshes. It does not show a host restart in a fresh isolate.
- Limits: this is one synthetic fixture. Vertex integrity covers only writes
  observed in those runs, and runtime-mutable geometry was recognised by
  identity from known roots. It is not exhaustive ownership proof.
- Local workerd memory, one matched pair (v174,
  `verification-v174-static-memory.json`). Baseline and experiment both
  completed with no errors, current source, 106 actors and equal checkpoint
  bytes. Live world after explicit GC:
  - JS heap used: 112,096,596 B baseline and 97,345,620 B experiment
    (−14,750,976 B).
  - Backing store: 60,727,866 B and 67,895,341 B (+7,167,475 B).

  These are separate counters moving in opposite directions; they are not
  summed and give no net figure. This is one pair with no repeat
  distribution, no Room, sessions or bodies, and no provider fit or billing
  claim. The disposed-world values varied substantially and are not reliable
  retention attribution, so they are not presented as a saving.
- Node transaction recovery, matched (v175,
  `verification-v175-static-recovery.json`). Baseline A, baseline B and the
  experiment ran in fresh Node processes with the v129 transaction path.
  Every original assertion passed: a failed transaction leaves durable state
  unchanged, a stale frame is refused, and recovered frames are confirmed.
  All 10 committed-state and frame hashes matched across all three runs.
  - Rollback: 286.302625 ms and 290.106625 ms baseline, 305.665542 ms
    experiment. All are still over the 250 ms gate.
  - Startup: 2427.52 ms and 2401.10 ms baseline, 2489.39 ms experiment.
  - No speedup is claimed. Warm tick timings are not strict delivery proof.
    Later hosts reused the same process caches, so this is not a
    cold-isolate restart.
- Experimental packing remains excluded. The v174 heap and backing-store
  trade-off stands. No production change is made or promoted: runtime source
  is unchanged; only this documentation changed.

### Private pile consumer (v2)

- Exact v2 aggregate only. A v1 snapshot is refused (`legacy`), never decayed
  or migrated. An unknown level stays null, never 0.
- Health and uncertainty may change at one revision; accounting may not.
  Lower revisions are ignored; a higher one may lower the level (reversal).
- No decay: `at` is accounting time, never read freshness.
- Queued is not applied: an accepted input waits in the host's queue until a
  simulation tick drains it. Diagnostics say queued, never applied or current.
- An unknown, invalid or unreachable read halts the finite run (durable fault).

### Startup and recovery gate (v153, v154, v159)

- `verifyStartup` reads once, through the existing latch and 4 s timeout. It
  refuses, with a fixed code, a pile that is unknown, unreadable, invalid,
  legacy, has an accounting time after trusted host time, or is older than or
  conflicting with the latest accepted or queued pile.
- Preflight, before any run is bought: `startRun` (before the startup record,
  `begin` and Room) and `recoverRun` (before Room takeover, `ticket` and
  reclaim). A valid changed level passes preflight (v159); before v159 it was
  refused.
- v154 also gates every newly opened runner in the receiver opener: attach,
  cold alarm, cold Room hint and tick reopen, after the runner's own ownership
  checks and before any body dispatch, reclaim, tick or publication. A refusal
  closes the runner unreturned and is a durable fault, so no timer or later
  wake reaches the refused opener. No source proof is cached.
- Extra bounded reads: `startRun` and `recoverRun` read twice (gate, then the
  attach opener); each cold open reads once. A transient failure at a cold
  open is now a durable fault needing operator recovery, not a receiver retry.

### Changed-pile reconciliation (v159 to v162, published in `23ca440e`)

- `startRun` now acquires Room authority and binds the host with
  `acquireHostRoom` (v157), sending no frame. The first frame comes from the
  runner, after body reconciliation.
- The runner opener, after the runner's own ownership checks and before any
  body dispatch, reclaim, tick or frame, reconciles any snapshot whose full v2
  aggregate differs from the retained one, including same-revision health or
  uncertainty and a higher revision at the same rendered level (v160). It calls
  `VirtualHost.reconcileSource`, then re-reads what the host retained. It must
  find exactly this aggregate (an exact comparison) and its level in the stored
  state, never only a receipt or a queue. The same read is compared; nothing is
  reread.
- A cold opener (alarm, Room hint or tick reopen inside a still-valid lease) now
  restores the source producers once for its finite run (v160). Before this, an
  evicted run resumed NPC ticks with no source timers, because only `attach`
  started them. They use the same durable minute cursor and end at `runUntil`.
  An explicit attach starts its own and its opener does not. A refused or
  faulted world gets none. The same run means exact identity (v161): world,
  fence, owner and `runUntil`, with that loop's generation still current, not
  halted and not past its end. A takeover sharing the deadline, or a halted,
  superseded or ended loop, gets a fresh loop; only a live loop for exactly this
  run is kept.
- `reconcileSource` is one host transaction for an owned, Room-bound, running
  world within the maximum lag. The Hub world queues the fresh absolute input as
  usual, merged from any queued input so the queued activity payload is kept.
  As a replacement input it takes this reconciliation's acceptance and
  effective times, not the earlier input's. It then applies only the pile and the geometry it
  shapes: pile level, mainland refresh, a clanker support check, collision sync.
  There is no step, census, absence recovery, session, deadline, lease,
  `wallCursor` or `simulatedAt` change, and no roster or swag change. Unchanged
  or stale source writes nothing. A failed application or commit leaves the last
  committed state.
- Clock: a pile's accounting time is bounded by the latest validated source
  observation (the queue's, else the configuration's at first boot), itself
  bounded by trusted host time at intake. It is no longer bounded by the NPC
  world clock, which may lag after a stop. This replaces a `Math.max` that let
  intake stretch the bound. Cold reconstruction revalidates against the
  retained queue's observation; a pile ahead of it is refused, not
  reinterpreted. No new persisted field.
- A refusal after acquisition (unknown, unreadable, stale, conflicting, or a
  change not retained) closes the runner, sends no frame or body grant, and is
  a durable fault for explicit recovery.

### Not resolved

- Full-Hub reconciliation, `worker/test/hub-source-reconcile.test.mjs`, builds
  real worlds (terrain, pile geometry, Oogas, Clankers).
  - It covers growth with an accounting time ahead of the world clock, NPCs and
    actor state unchanged, queued activity kept, future and unknown refused
    atomically, duplicate no-op, exact cold restore, reversal, and a later
    normal drain.
  - First run (independent, after the donation UI window): 1 pass, 1 fail. The
    failure was a fixture error: it expected the layout record's level to
    follow the pile. That record is the immutable construction recipe, with its
    irreversible ring, and keeps the level the world was built at. The
    assertion now checks the current state and geometry level (5000), and that
    the recipe level is unchanged. Production layout is untouched.
  - Second run, after that correction alone: 2/2 pass. That covers the cold
    restore of the grown pile in that one fixture world. It is not a general
    proof for every layout.
  - CI now enforces it. CI 896 on `23ca440e` did not name it. The step added in
    `1a04da8f` runs it with `hub-pile-source` and `host-world-receiver`, and
    exact-head CI 897 passed all 31 of those checks.
- The clanker support check (`supportRemoved`): when the mainland's walkable
  surface changes, it marks a clanker whose floor fell away as passively
  falling, with zero velocity. It moves no actor and advances no time; gravity
  acts at the next step. It is the reaction a normal drain already makes.
- Reads: `startRun` and `recoverRun` read twice (preflight, then the opener);
  each cold open reads once. The opener's reconciliation uses that one read.
- Strict 4 Hz: no new success. Recovery rollback 295.45 ms (over the 250 ms
  gate), the memory quota, delivery, runtime, total cost and live browser
  integration are unresolved. Not review-ready, not activated.

## Checks

| Pass | Result |
|---|---|
| v152 focused Node checks | 29/29, build passed (before v153) |
| v153 pile-source tests | 20/20 |
| v154 pile-source tests | 21/21 (20 kept, plus the cold alarm/hint regression) |
| Acquisition primitive (v157) | host-room-takeover 29/29 (27 kept, 2 new); pile-source 21/21; host-world-receiver 6/6 |
| Foliage parity repair (v158) | hub-solid-scratch 3/3; terrain lane 62/62 locally |
| Source reconciliation (v159) | hub-pile-source 22/22; host-room-takeover 30/30; host-world-receiver 6/6; hub-world-validation 3/3 |
| Review corrections (v160) | hub-pile-source 23/23; host-room-takeover 30/30; host-world-receiver 6/6; hub-world-validation 3/3; hub-source-reconcile authored, syntax only, not run |
| Run identity (v161) | hub-pile-source 23/23 and host-world-receiver 6/6 (source-timer fix, 29/29) |
| Full-Hub reconcile (v162) | hub-source-reconcile: first run 1/2 (layout-recipe fixture error); after the assertion correction, 2/2 |
| CI 896 on `23ca440e` | Unit 452, replay 41, Host/recovery 287, terrain/cache 11, Room compatibility 79; the three files above not yet in the workflow |
| CI 897 on `1a04da8f` | Unit 452, replay 41, Host/recovery 287, terrain/cache 11, Room compatibility 79, plus 31 new source checks |
| Packed collision reads (v166, experiment, excluded) | first run: hub-solid-scratch 3/4, headless-compact-geometry 3/3, npc-collision 7/7; the failure was the new test's VM fixture missing `convex.js`, and the rerun after that correction alone passed 4/4 (`verification-v166-solid-retry.log`). The actual-host inventory (`verification-v167-host-solid-packed.json`) found 68 geometries, all unpacked: no applicability. Not in the PR |

The version rows are local runs at the time; each ran only `node --check` on
touched files and the files listed. `host-room-takeover`, `hub-world-validation`
and `hub-solid-scratch` are also in CI's existing steps.

## Measurements (local, not provider proof)

- Memory, 106 NPCs, local workerd, explicit GC: live JS heap 112,042,176 B and
  backing 60,717,450 B, against a baseline of 126,987,680 B and 51,360,585 B.
  These are distinct counters, not proof of fitting the provider's 128 MB.
- Recovery trial: startup 2496.40 ms; rollback 295.45 ms, over the 250 ms
  gate; cold pose 243.25 and 206.49 ms; warm 33.25 to 53.87 ms.
- Same-run rollback phases: geometry 164.17 ms, actors 41.85 ms (including the
  nested forest's 28.10 ms), restore 20.60 ms, tick 47.58 ms, capture 11.54 ms.
  Nested phases are already inside their parent; never add them twice.
- Timing may overlap concurrent source editing; the donation Node tests started
  after both probes.

## Held fixed

Activation and burst stay disabled. NPC and player streams stay independent;
NPCs are passive. Frozen bodies keep the 60 s grace, red marker and raised
hand. No Tess.
