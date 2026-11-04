# Virtual host: inactive implementation draft

Part of #377; **does not close it**. Baseline: `rock` at
`17659ddfa0079f24bea84d872e29e532530bd7e4`. Room now imports an authority adapter,
and the client understands its preview negotiation. No configuration enables it;
there is no new binding, HTTP route, migration, alarm, timer, dependency or production
data change. The current browser host still runs by default.
During this increment `rock` advanced to `1a87a4eb9d91330638f029b38e456188385d00a1`
with #462 voice changes. Overlapping paths were reviewed; fixture prerequisite
loading was placed away from the new voice context so both changes combine. This draft must not be described as an
always-on NPC world or an enabled disconnect feature.

## Implemented and still missing

`worker/src/virtual-host.js` implements transactional ownership fencing, finite
host runs, fixed-step recovery with bounded catch-up, a versioned checkpoint,
atomic session operations and bounded public snapshot delivery. Its simulation
adapter is required, synchronous and data-only. General host tests use a named
deterministic fixture. The extraction tests additionally exercise the actual
surface planner, RNG and Ooga work-trip transitions with explicitly authored
world/weapon adapters; they do not run the complete Ooga/Clanker simulation.

`worker/src/host-sessions.js` implements single body/session ownership, 60-second
disconnect grace, duplicate-session fencing, passive-body integration, equipment
retention, occupancy lifecycle and durable departure intents. The actual island
collision adapter and browser presentation/transport are not connected.

The existing `npc-paths.js` surface-route planner is now usable headlessly through
`worker/src/npc-navigation.js`, with bounded route capture/restore. Its existing
routing algorithm is unchanged and both browser and host import the same source.
This is the first real NPC extraction boundary, not a new AI: tests use authored
test geometry and recorded actor positions, not the full hub collision bundle.

`worker/src/npc-random.js` also loads the existing Clanker `math.mulberry32`
generator headlessly. An opt-in capture word preserves its exact future draws;
normal browser callers retain the same API/sequence without a capture closure.
The versioned checkpoint is at most 25 JSON bytes per stream. Golden outputs
recorded from the base, actor independence and failed-commit/owner-recovery tests
guard continuation. This supplies a reusable state boundary, **not** a completed
Clanker adapter: its current browser caller has not opted into checkpoints, and
Ooga crypto/Math.random choices still need a deliberate authoritative input policy.

`src/js/npc-work.js` now contains the existing Ooga site selection and work-trip
transitions, called by both browser `crew.js` and `worker/src/npc-work.js`. The
6,816-byte `runWork` function moved unchanged. Planning's three injected callbacks
preserve browser randomness, route planning and companion notification semantics.
Host checkpoints retain work phases, waypoint indices, positions, aim/readiness,
timers, rest and reload-slot flags, with strict world/catalog compatibility.
This is a real state-machine extraction; supported walking is shared below, while
world/crowd queries, aim, weapon/reload and Clanker behavior remain explicit adapters.

The existing mesh kernels (`convex.js`, `solid-props.js`) now also load headlessly.
`src/js/npc-clearance.js` shares the hub's unchanged voluntary NPC clearance policy;
the browser resolves its current island at query time after each visit rebuild.
`worker/src/mesh-collision.js` prepares bounded, explicitly authored flat mesh
catalogs, hashes their content and restores collision poses before rebuilding
query caches. This is a real collision boundary, **not** an export of the hub's
terrain, moving actor rigs or world rules. Unknown scene features fail closed.

The crew's `recoverWalker`, `recoveryHeight`, `searchWalker`, `jumpWalker`,
`walkToward` and `walkWorkTo` now live in shared `src/js/npc-walker.js`. The complete
17,515-byte function block is unchanged, alongside its avoidance initializer.
Headless composition now uses actual supported movement and recovery search with
the existing work controller, surface planner and mesh kernels. Crowd/shoulder,
pose, weapon/reload and airborne integration remain explicit caller boundaries.

The Clanker's existing `prepareJump` and `updateJump` now live in shared
`src/js/clanker-flight.js`, imported by both the browser and an inactive Worker
adapter. Preflight, reversal, blocked-arc release and wall-arrival decisions are
unchanged. Bounded arc continuation survives reconstruction with its caller's
coupled body state. This does not provide the remaining drive gravity, climbing,
rage, lab work, rig animation or Clanker display projection.

The complete headless Ooga/Clanker simulation, production Durable Object runner,
browser follower conversion, authenticated protocol negotiation, independent
tracks, disconnect handoff and visual rendering remain integration gates. Neither
mocked storage nor fixture motion establishes Cloudflare or live-world behavior.

Tess is explicitly excluded following the later user decision. Keep her existing
behavior; #466 is a design discussion before shared-state/queue implementation.
No Tess source changes are included here.

## Feasibility findings from current source

| Current boundary | Consequence |
| --- | --- |
| `room.js` elects a player browser and relays its `npcFrame`; `npc-sync.js` uses FORMAT 2, 112 floats per Ooga plus events | The frame is a pose display format, not an AI recovery checkpoint. It omits random generator state and much route, timer and reservation state. |
| `crew.js` builds model geometry at module load, drives rendering parts and uses random decisions; `clankers.js` depends on scene nodes, `agent`, support/clearance queries, authored routes and effects | Neither can simply be imported into a Durable Object. A DOM/window shim or a frozen pose relay does not solve headless simulation. |
| `scene-hub.js` supplies work sites, terrain, buildings, stairs, ceilings, collision callbacks and update order | Extract versioned world data/query adapters before enabling headless AI. Preserve structural navigation and category-specific behavior. |
| `npc-sync.js` excludes possessed bodies; gorilla work also reacts to crew events | #379 must supply the continuous independent tracks and possession representation. Do not duplicate their AI in this host. |
| Room `pose` carries position/yaw and compact `g`, `j`, `w` display fields | It lacks vertical velocity, exact fuel/reserve ammunition and the complete controlled-body handoff. These must be explicitly added and validated; do not infer them from visual flags. |
| Room `drop` immediately releases body/cabinet and voice; a newer login currently evicts the previous one | Grace must integrate with these paths atomically. Changing only close handling would strand locks or permit duplicate bodies. |
| Hub/remote presentation does not provide this lifecycle's free-arm indicator | #464 consumes semantic grace state; #453 supplies the green-glyph reference. No new competing visual transport here. |

Before extraction is accepted, the real simulation checkpoint must cover positions,
velocities, activity inputs and timestamps, travel phase/waypoint progress, timers,
bed/work reservations, random state and decisions that affect future movement.
Rendering-only particles, speech history and fired projectiles are not replayed.
Use captured world versions, not runtime-generated client geometry, as recovery
compatibility keys. #402's transition behavior remains separate.

## Host contract

`new VirtualHost({storage, simulation, sessionAdapter, clock})` needs a transactional
Durable Object storage-compatible adapter. `simulation` supplies `version`,
`initial`, `validate`, `step(state, milliseconds, simulationTime)` and `project`.
It also requires `npcFor(state, bodyId)` and `handoff(state, departure)`. Both read
the transaction's simulation state. The host requires successful handback before
marking the departure applied, and never calls handoff when no NPC exists.
All callbacks must be synchronous, deterministic and free of network/other external
side effects because a transaction can retry. `sessionAdapter.stepPassive` is
required even when no player is present; missing physics cannot silently freeze a
body. Optional occupancy validation defaults to refusing a claim.

- `begin(owner, durationMs)` is a trusted operator action, never a browser join.
  Duration is at most 15 minutes. It resumes existing state, never resets it.
- `claim(owner)` takes an expired 10-second lease within the same finite run or
  its existing-session drain, including late recovery that only completes expiry. It
  increments its persisted fence. Every subsequent write checks owner, fence,
  world version, lease and run deadline inside the transaction.
- `tick(ticket, liveTokens)` advances grace bodies and expiry in the same transaction
  as at most eight 250 ms simulation steps. The authenticated transport census is
  mandatory once session state exists, including an empty census. Duplicate calls at
  the same time do not step twice. Backlog beyond 30 seconds pauses the run instead
  of skipping AI time or running unlimited recovery work. These are draft bounds,
  **not a measured or approved production cadence**.
- An explicit `begin(owner, durationMs, {resumePaused:true})` can resume after a
  long outage/stopped run: keep NPC state, timers and RNG, re-anchor the wall cursor,
  and record the unsimulated interval in `pausedMs`. This loses wall-time progress
  during the outage and is not seamless recovery. Logical `simulatedAt` does not
  jump, so absolute AI timers keep their remaining duration. Wall-clock session
  deadlines are untouched. A new run cannot start until existing bodies drain.
- `sessions(ticket, liveTokens, operation)` reconstructs the registry, recovers
  against the authenticated Room's surviving socket tokens and commits the operation
  with its bounded pending departures. Publish returned results only after success.
  A failed commit cannot announce ownership or an expiry. No browser supplies the
  token list, account identity, ownership decision, physics adapter or NPC existence.
- `disconnect(ticket, liveTokens, ref, closedAt)` applies a trusted observed close
  before inferring missing transports. This is the close entrypoint; a generic
  registry callback that disconnects after recovery has the wrong ordering. Room
  must deliver pending close observations before removing those tokens from the
  logical census supplied to other operations, including after outbox replay.
- `stop(ticket, liveTokens)` stops admission and NPC stepping, drains already
  accepted bodies and retains earlier grace deadlines. The run deadline does the
  same automatically on tick. Still-live bodies get at most 60 seconds from that
  persisted stop time; a late restart never extends it. Once no bodies remain,
  status becomes stopped; applied visual tombstones need no recurring wake.
  No method starts an alarm/interval. An eventual runner must schedule bounded
  wakes independently of visitors, complete this finite drain and then stop.
  It must not auto-start another run.
  A crash in the final lease window may leave the rest of that finite run idle.

Storage holds one overwritten checkpoint (96 KiB maximum), not an archive.
Unknown/corrupt schema, world or state fails closed without deleting the stored
record. Host/session schema 2 refuses the old unpublished schema 1 rather than
inventing missing magazine/body fields. A stale runner cannot overwrite a new owner. Transaction tests cover
rollback and competing claims; actual Durable Object storage/output gates and
alarm execution still require a local Cloudflare runtime test.

## Disconnect and occupancy contract

The confirmed close of the current `(accountId, generation, token)` starts grace
for exactly 60,000 ms. Stale sockets cannot disconnect, update or release a
replacement. A duplicate live connection rotates generation/token and neutralizes
old held movement. Reconnect strictly before the deadline preserves the same body,
resulting position and heading, Ooga/Clanker kind, selected weapon/slot, gear
ownership, carry/combat mode, current magazine, ordered counts of up to two spare
magazines, unlimited-ammo flag, jetpack ownership/equipment and normalized fuel.
At the deadline it cannot reclaim the old body. The actual client codec must still
map these fields from current equipment without inferring them from pose flags.

Passive motion plus body ID, kind and zone are passed to the physics adapter; equipment, deadlines and
ownership are not writable through it. Horizontal held movement is neutralized;
vertical velocity remains. Recovery is divided into at most 50 ms segments, capped
by the 60-second grace window (up to 1,200 adapter calls per body). The adapter must
use real swept collision, gravity and scene transitions. Worst-case 64-body recovery
is an explicit CPU measurement gate. A fixture ledge is not proof of island,
Clanker support, water, ladder, abyss or game-scene collision.

The body contains no saved held inputs, thrust, shots, swing/reload action or event
history. The future handoff must cancel incomplete reload/firing/thrust without
granting ammo/fuel; current finite inventory values remain. Ordinary connected
movement stays on its current path. Only grace-body passive motion changes owner.
Voice disconnect/cleanup continues immediately on its existing path; grace is not
permission to retain audio or route it through a host browser.

Grace exposes `presentation: "open-hand"`: #464 must choose the free arm, raise it
and show an open hand while respecting equipment, then clear it on reconnect. The
host emits a stable `depart:<generation>` intent with a green departure and an
optional existing-NPC handback. No NPC means departure only: no spawn or arrival
beam. Late consumers must reconcile current state, not replay old beam/actions.
Departure tombstones retain the body's zone, motion and exact equipment. The NPC
lookup and handback use transaction-local simulation state; handback and the
`applied` marker commit atomically. An unapplied departure cannot be acknowledged.
Applied tombstones survive until visual delivery acknowledgement, but recovery
never reapplies the handback. Effects are idempotent by generation; pending departures survive crashes and block
reclaim until applied/acknowledged. A full outbox refuses new bodies rather than
dropping an unacknowledged departure. It shares 64 slots with sessions.

A restart with no surviving transport derives grace from persisted `lastSeenAt`;
it never assigns a fresh 60 seconds from restart. Saved grace deadlines survive
every restart. Delayed presence persistence can shorten the available grace after
a crash; checkpoint frequency must be selected against that accuracy/cost tradeoff.
Already expired bodies integrate passive motion only through their saved deadline,
then depart; they never replay held inputs, shots or thrust.

One hammock/cabinet resource per session; no resource has two owners. Retain through
grace/reconnect; release on expiry, explicit logout/release, revocation or zone
departure. This deliberately follows the new #377 request over the old immediate
cabinet-disconnect rule, but is not enabled in current Room. #461 must reconcile
gear from occupancy, and #463 must stop game input and clean up the seat without
moving hockey physics to this host. New claims require authoritative proximity and
resource validation. Changed/missing scene resources after a world migration require
an explicit cleanup migration before resume.

## Bounded delivery and deployment

Public snapshots allowlist NPC identity/category, root pose, activity/phase, route
progress and RNG seed plus the hub pile count. No private session/body/equipment or
voice fields. At most 128 NPCs and 32 KiB UTF-8; over-budget output rejects the
transaction. #378 owns cached guest storage, delivery and reconciliation. Guests
must not subscribe to the live Room through this helper.

`LatestHostDelivery` retains one snapshot and at most 32 follower cursors, sends at
most four times a second per follower, refuses obsolete epoch/sequence and skips
backpressured sends. Rejoin is idempotent. A slow follower gets the latest complete
state, not queued history. The real transport must supply genuine pending-byte
accounting or ACK-based backpressure; passing a constant zero is not acceptable.
The helper reports messages, UTF-8 bytes and skipped sends. These counters measure
only successful adapter sends, not Cloudflare billing or client render cost.

Production activation must be a separate, reviewed rollout after the remaining
gates pass. Negotiate an exact host/session/world capability before admission.
Persist one authority mode/epoch for the world. In server mode, reject all old
browser NPC publications and do not elect a browser fallback if the host is down;
freeze at the latest state with a reconnect indication. Old clients must reload
or remain in an isolated local experience, never share a second authority.

Schema migration must preserve NPC RNG/routes/timers, absolute grace deadlines,
session fencing and occupancy. Unknown newer state is read-only on rollback.
Drain/fence sessions before changing mode; do not roll code back to browser host
election while a server lease remains active. Conversion to the old pose-only
format loses recovery state and cannot be an automatic rollback. No migration or
mixed-version deployment has been executed by this PR.

## Resource envelope and cost gate

The hard bounds above protect a draft, not production performance guarantees.
One bounded local measurement of the existing planner on the authored 10 m test
line used 41 graph nodes and 33 route nodes: 778,240 bytes of graph typed arrays,
81,920 bytes per actor's typed arrays and a 593-byte JSON route checkpoint. The
first plan took 0.61 ms; 100 restores had p50 0.0094 ms, p95 0.0215 ms and maximum
0.089 ms on this local run. These numbers exclude real island geometry, full AI,
the complete roster, storage/serialization and rendering; they do not estimate
Cloudflare CPU or billing. Restoring an actor allocates its bounded route buffers,
so a production adapter should retain them between commits and measure recovery
allocation separately. Do not copy the test adapter's restore-on-every-step pattern
into a permanent runner.

At the maximum 32 KiB × 4 Hz × 32 followers, outbound payload alone reaches
4 MiB/s; that is a ceiling to reduce through measured compact state and interest
management, not an acceptable target. A 250 ms durable commit cadence would mean
10,368,000 checkpoint writes over 30 days; it needs a real batching/recovery study.

[Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
checked November 4, 2026: duration uses allocated 128 MB, even with fewer actual
bytes. One continuously awake object for 30 days uses 331,776 GB-s. Paid allowances
include 400,000 GB-s and 1 million requests per month, shared with other usage;
overage is rounded up to billing units ($12.50/million GB-s, $0.15/million requests).
SQLite includes 50 million written rows/month, then $1/million; each alarm schedules
a written row. Alarm invocations count as requests. One-second wakes alone mean
2,592,000 invocations and alarm writes in 30 days, before checkpoints and traffic.
This is arithmetic, not an account estimate: staging, production, other objects,
Worker charges, storage and actual remaining allowances are unmeasured. No promise
of zero incremental cost, and no permanent loop has been enabled.

[Alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/)
require retry-safe handling; at-least-once execution is not a precise simulation
clock. [Platform limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
also constrain CPU and storage. Our checkpoint cap is below the legacy 128 KiB
value cap as well as SQLite's larger cap; this is not a CPU/memory measurement.

Before activation, agree budgets and measure matched baseline/final revisions:
zero-player server simulation; normal and busy shared hub; 2 and 32 clients;
burst/reconnect/restart and maximum grace recovery. Record frame-time p50/p95/p99,
FPS, simulation/pose/render/effect CPU, heap, payload bytes, sends/second/fanout,
actual DO duration/requests/storage writes and checkpoint recovery error. Use
bounded sessions, a physical phone where available (label emulation separately),
and account metrics. After companions land, run one combined NPC/dog/ghost,
flame/projectile and voice check and link the evidence. None of those live or
physical-device measurements is claimed here.

## Next integration increments

1. Map the session codec to actual Ooga/Clanker equipment and body support; consume
   authenticated close observations before census removal. A dedicated WorldHost
   and Room need a bounded durable command outbox and idempotent acknowledgements,
   because their storage transactions cannot be atomic together. Live pose relay
   and immediate voice cleanup stay on their current paths.
2. Complete airborne/crowd behavior, aim, inventory and coupled
   Clanker plan/hit adapters, with their state in the same checkpoint. The trip
   transitions and supported walker/search are now shared by browser and host. Preserve current behavior;
   use explicit per-actor RNG words and logical clocks. Keep #379's independent
   tracks/possession representation as the interface, not a competing implementation.
3. Export the actual world into versioned terrain/prop/support queries. Shared mesh
   kernels and voluntary NPC clearance are now available, but the bounded flat-TRS
   adapter has only authored fixture catalogs. Reuse the existing terrain
   snapshot approach where possible. Persist bounded sleep-route search state and
   work/bed reservations rather than generators, scene references or machine-time
   budgets. Surface-route checkpointing alone does not supply these systems.
4. Connect the gated Room/client authority bridge to a complete host and pose
   projector, then run a finite local Durable Object exercise with zero browsers,
   restart, failed writes and a final-session drain. The new bridge tests execute
   real Room/net/npc-sync code with authored platform services, not a DO runtime.
5. Resolve the failed hub checks and verify the complete client/host behavior with
   two clients, slow receivers and reconnects. Measure actual checkpoint sizes,
   physics/query CPU, memory, fanout and account costs before proposing activation.

The current surface planner's graph scratch buffers are rebuilt, not persisted.
Actor checkpoints retain used route indices, exact cached lanes and progress,
bounded by the planner's existing 4,096 nodes; the host's total 96 KiB cap still
applies. Topology/world mismatches must refuse recovery. Tests show the same route
continues after a new host owner without replanning, but do not establish the
full-roster memory/size envelope or complete island navigation parity.

Random words must commit with the actor's choices in the same world checkpoint.
Never retain a mutable RNG outside a retried transaction: restore its word from
that transaction's state, then commit its captured continuation with the result.
The host regression exercises a failed write and owner replacement against an
uninterrupted stream, including conditional extra draws. Its choices are explicitly
a fixture; the separate work-trip tests use the extracted transitions. Existing seeded callers use
the unchanged draw body; `randomInt` and its crypto source are untouched.

### Work-trip recovery boundary

`createWorkCheckpoint(world, routeLengths)` owns only `cave.work`, not an entire
Ooga. It rejects unknown versions/worlds, changed site counts or route lengths,
out-of-range waypoint/site indices, malformed vectors, extra fields and nonfinite
state. Captures/restores copy vectors and route catalogs rather than aliasing live
state. Bounds are 32 sites, 4,096 points per route and finite world coordinates.
World versions must also change for geometry, site order, eligibility and adapter
semantics; equal route lengths alone do not establish compatibility.

Motion, RNG, exact magazine state, reload/burst clocks, reservations, activity input
cursors and companion transitions belong to the **same enclosing transaction**.
Callbacks cannot perform network I/O or publish effects before commit. Recovering
work must not restore old transient player actions or replay previous effects to a
late follower. Browser callbacks remain their original local implementations;
no authority mode, player movement, voice or disconnect presentation is switched.

Six golden traces were recorded from the original `crew.js` source at the base:
normal, maintainer rest, occupied/target-unready, site closure, spare magazines,
and unavailable reload slot. They cover all five trip phases. Test fixtures compare
the complete state/callback trace, restore after every frame, and exercise actual
host failed writes and owner replacement from each phase. Two follower fixtures
and a late joiner consume bounded latest snapshots of that state, without action
history. These use authored motion/aim/inventory callbacks and in-memory storage;
they are not real transport, island collision, full Clanker or Durable Object tests.

`node scripts/record-npc-work-baseline.mjs` reproduces the golden file from the
local base commit, checking the original function source hash before execution.
It does not fetch missing history or run a browser. Object keys are sorted before
hashing; array order, including magazines and notifications, is retained. The
initial fixture omits `weapon.workSite`, matching a browser actor before its first
assignment; the enclosing production codec must validate assigned weapon-site IDs.

The original `selectWorkSite` can leave partial site/position changes if its
position adapter refuses. That behavior is preserved, not silently repaired here.
A headless adapter must return valid state or abort its enclosing transaction;
the work codec is not a rollback mechanism for arbitrary adapter side effects.
Likewise, test rollback retains authored counters in the transactional fixture;
it does not establish transactional behavior of the current browser Clanker hooks.

The browser now uses the extracted module, so the earlier Hub source-attribution
report applies to the preceding v3 patch, not a full parity verification of this
new crew change. The twenty failing Hub assertions are deliberately not rerun.
Complete browser parity remains a gate, alongside real adapter/runtime integration.

### Collision and NPC clearance boundary

`prepareMeshCollision` requires a versioned, data-only catalog. Bounds are 128 flat
nodes, 64 geometries, 16,384 total unique vertices and fan triangles, 32,768
triangles summed over all placed nodes, 2 MiB of normalized
catalog JSON and 48 KiB of pose checkpoint JSON. The full host checkpoint remains
capped at 96 KiB. Registration order is retained for collision tie-breaks. SHA-256
covers geometry, flags, node order and initial transforms as well as the world ID
and explicit collision-kernel version (`solid-props-1`);
pose recovery refuses a changed catalog even when someone reuses a version name.
Object key order does not affect the fingerprint. Bump the kernel version when
changing query semantics; it is not an automatic source-code hash. Adapter semantics must still
bump the enclosing simulation version.

The adapter preserves face `gorillaStep`, `supportOnly` and `ragePass`, and node
`shoulderOnly`, `climbMasonry`, `gorillaStepAll` and `ragePass` flags. Its exposed
queries use normal collision behavior without skip/escape options. It accepts only
positive, nonsingular scales, Euler rotations, visibility and world-space flat
nodes. Hierarchy, quaternion animation, instances, `collisionGeometry` and special
`gorillaSteps` arrays are rejected, not ignored. A production exporter must resolve
these features explicitly, retain mesh winding/closed shells and prove parity.
Voxel terrain, occupancy, full animated bodies and special shoulder queries are
still separate. No production catalog is included.

Checkpoints retain ordered node IDs and poses, never BVHs or renderer references.
Restores validate the entire saved state before mutation and copy their vectors.
Preparation/hashing occurs outside the host transaction. The fixture rebuilds a
runtime for each simulation step so an aborted write cannot leak a moved obstacle
through a retained cache. Production reuse needs an equivalent reset discipline
and allocation/CPU measurements; copying this fixture into an always-on loop is
not an acceptable resource plan.

The shared 1,783-byte `npcWalkable` function is unchanged apart from indentation.
The Worker wrapper requires all seven world rules and both mesh-query callbacks,
rejects asynchronous/nonboolean decisions and invalid support, and limits a
single voluntary step to four metres (at most 27 pile samples plus its origin).
These bounds do not apply to the browser. A `-Infinity` no-support result refuses
the move without aborting the tick; NaN, positive infinity and out-of-range support
abort as malformed adapter state. A production support adapter must retain the
hub's finite abyss-floor policy. The four-metre wrapper is for a single voluntary
step, not all original crew probes (direct pile-slot probes may be longer); those
call sites require their own bounded query policy before full integration. This policy is neither `walkToward`, recovery search,
jump/gravity integration nor the complete `walkWorkTo` adapter. Those controllers
also own crowd/shoulder state, recovery search buffers, threat response and pose
updates; moving only their call site would lose state on restart.

Focused tests compare 80 decision/callback traces against a captured original
function from the base revision and exercise the real mesh kernels with authored
closed shells, treads, ceilings, support-only faces and changed visibility/poses.
Failed-write/owner-replacement tests use the actual host and collision adapters,
but the small movement stepper and serial in-memory storage remain test fixtures.
The shared source comparison is recorded outside the checkout. This extraction
changes browser hub wiring; the earlier Hub failure-attribution report is not a
runtime parity result for it. No restricted Hub assertion is rerun.

### Supported walker and local search boundary

`createWalkerCheckpoint(world)` owns only avoidance/local search. It encodes the
existing NaN target and Infinity best-distance sentinels explicitly, retains active
search entries and parent/cost/height/closed state, and preserves the selected path,
index, counters and jump decision. The original search has 441 cells and expands
at most six nodes per call. Strictly decreasing parent costs reject corrupted
cycles before the original parent-walk can run. State is copied, Float32 values
must round-trip exactly, and checkpoints are capped at 32 KiB per walker inside
the host's overall 96 KiB cap. Inactive search buffers are canonicalized: they are
never consulted before the original code initializes a new search. Path/counters
and jump scalars remain intact. The cap does not imply a full roster will fit.

Root position/yaw, work gait, surface routes, traffic, crowd/reservations, progress
backoff and hop/leap state must commit in the same actor transaction. The fixtures
do this with actual work/route/walker/mesh code over an authored world. Their
weapon/reload, crowd, pose and storage hooks remain labelled fixtures. Selecting
jump mode 4 preserves its decision and velocity; the walker waits for the caller's
existing airborne integrator. This is not yet a full Ooga/Clanker actor codec.

Worker calls require explicit world/crowd callbacks and bound elapsed time to
250 ms, a direct movement request to one metre and goals to 64 metres. Internal
search edges retain the original 0.025 m sweep size; landing candidates retain
the original 120-step cap. Boolean/support results must be synchronous and valid,
saved targets/search origins/jump destinations and cached route hints are checked
against the actor, external crowds are capped at 128, and shoulder progress cannot create a
non-progressing movement loop. These are inactive adapter bounds, not changed
browser movement rules. World callbacks must still be transaction-local and free
of external effects; throwing after a bad callback cannot undo its side effects.
The raw browser callbacks are not made transactional by moving their caller.

### Room/client authority preview

The legacy path still elects a browser and relays FORMAT 2 frames. The new
`room-npc-authority.js` adapter supplies a durable, compare-and-swap assignment
with a monotonic revision, explicit mode/world/epoch, private owner, ten-second
lease and at most a fifteen-minute run. New snapshots renew only the lease;
nothing extends the run or starts a timer. `Room.configureNpcAuthority` and
`publishNpcSnapshot` are internal RPCs gated by `VIRTUAL_HOST_PREVIEW === "1"`.
No checked-in environment sets that flag and no HTTP route calls these methods.
The internal read-only `npcAuthorityStatus(ticket)` reconciles an uncertain configure
or publish outcome without exposing owner credentials or replaying a mutation.
`host-room.js` now coordinates one explicit publication from a committed
VirtualHost ticket. A runner still has to supply the complete simulation and
schedule; fencing Room cannot make the two independent storage commits atomic.

After the authority commit, Room stops browser election/frame admission and tells
compatible clients the descriptor. The client latches it across close/reconnect;
missing frames and mismatched roster signatures freeze undriven Oogas, including
before the first `crew.update`, rather than permitting local AI. Explicit newer
release switches back to the existing browser contract; Room announces the chosen
browser host before releasing the fence. Ordinary driven bodies and voice retain
their existing paths. This snapshot adapter covers the existing Ooga pose format;
Clanker simulation/projection remains an activation gate.

A 32-byte preview envelope adds revision/epoch/sequence to the **unchanged** FORMAT 2
pose buffer. It is capped at 57,392 bytes (57,360 pose bytes plus envelope), with
128 records and no event tail. Replaying persisted firing/effect events on join
would be incorrect; event delivery and independent tracks remain with #379/#388/#389.
The complete display pose must be projected from actual actor/rig state; a public
position snapshot is insufficient and no synthetic projector claims otherwise.
This preview framing is not an approved transport rollout or a replacement for
those companion issues. #464 retains visual fidelity.

Only one unacknowledged snapshot per socket is allowed. Room keeps one latest
committed frame, skips intermediate frames for slow clients and delivers the newest
on a matching acknowledgement. Credit is persisted in socket attachments across hibernation; repeated wakes cannot
enqueue additional unacknowledged frames. No per-client history, resend timer or guessed
pending-byte count. A client that never acknowledges intentionally stalls until
reconnect or a new authority revision; unbounded timeout resends
would defeat the limit. Pose-only identical duplicates can be acknowledged after
reconnect, while changed duplicates and stale revisions/epochs/sequences are refused.
An identical publish retry can reconcile a committed result after lease/run expiry;
it does not write, renew the lease or admit a new frame.

Preview admission is limited to 32 compatible connected players; configuration
refuses incompatible occupants. A server-assigned Room rejects old connecting
clients and closes incompatible restored sockets via their ordinary cleanup path.
Removing the preview flag from a build that understands this record keeps the
server fence. **Before rolling back to a build that predates this protocol, explicitly
release to browser mode and confirm clients received it.** Older code cannot honor
the stored fence. Unknown saved versions fail initialization; unknown newer client
descriptors freeze instead of silently downgrading. Backward clocks refuse mutations.

The hard data envelope is one 57,360-byte durable pose frame plus metadata and one
57,392-byte in-flight frame per admitted socket (at most 1,836,544 bytes across 32
sockets, excluding platform overhead). At four new frames/second the all-full-frame
payload ceiling is 7,346,176 bytes/second. These arithmetic ceilings are deliberately
not called cheap: no full-roster CPU/heap, Cloudflare runtime or account billing
measurement has been performed. A permanent paid loop remains forbidden.

### Committed pose projection and Room publication

The browser's 112-float Ooga encoder now lives in `src/js/npc-pose.js`; its function
block moved unchanged. Browser hosting still uses the same holders, reused buffer,
event handling and cadence. `worker/src/npc-pose.js` projects explicitly supplied
posed rigs with bounded capacity, stable slot ordering and zero padding. Its
canonical output does not depend on a previous frame's unused quaternion bytes,
so a reconstructed checkpoint can reproduce a byte-identical retry. It rejects
malformed/nonfinite records and explicitly controlled/remote/temporary entries.
The complete simulation adapter must also exclude the locally driven body; this
codec does not discover ownership from a scene or create a rig from public x/y/z.

`VirtualHost.poses(ticket)` projects a copy of a committed simulation checkpoint,
returns its revision and finite run deadline, and does not step AI, write storage
or renew ownership. Missing pose adapters, expired/fenced owners and closed runs
fail before Room changes. `publishHostPoses` reconciles Room ownership, rechecks
the host, then publishes that exact frame. If host state changed during those
RPCs, it returns `superseded` without publishing. A lost configure reply is read
back; a lost publication reply requires an identical-payload duplicate check.
Same sequence alone is insufficient evidence. A new Room claim requires explicit
`{acquire:true}`; ordinary publication cannot undo an intentional browser release.
There is no retry loop, timer, binding, deployed export or automatic activation.

Both DOs still commit separately. This helper cannot cancel an already in-flight
publication at the instant another host takes over; Room's independent lease/CAS
is the final admission gate. A future runner must account for the temporary frozen
interval while an old Room lease expires, and explicitly drain sessions before
release/migration. The helper deliberately never releases to browser AI on errors.
It projects twice to detect superseded host state; the local projection measurement
below excludes that coordinator, checkpoint validation/copying and RPC/storage cost.

The actual Room test now consumes committed VirtualHost frames and covers lost
configure/publish replies, failed host writes, reconstruction of both objects,
late join, a stalled receiver, new ownership and explicit release. In the authored
one-actor run, 23 host writes retained a 258-byte checkpoint, Room retained a
464-byte frame, and three fixture sockets received 12,896 bytes in total. A stalled
socket received one frame before owner replacement. These are fixture counters,
not platform billing. No shot/event tail was delivered.

Run `node worker/eval/host-projection.mjs` for a finite, offline encoder comparison
(20 warmups and 240 measured samples per case). On Node 22.23.4, macOS arm64, the
128-authored-rig original encoder/frame copy measured p50 0.0234 ms / p95 0.1296 ms;
the shared encoder with bounded projection measured 0.0575 / 0.1984 ms. Total CPU
for 240 samples was 12.110 / 26.430 ms. Both produced 57,360-byte frames. This is a
matched projection fixture, not a full-page or production-world baseline. Heap
deltas included garbage collection and are not retained-memory bounds. Full AI,
geometry construction, Clankers, body recovery, storage, browser rendering and DO
charges remain unmeasured. The maximum fanout ceiling remains 7,346,176 bytes/s;
these timings do not make that acceptable or authorize an always-on loop.

Current companion inspection confirms #379 and #464 remain open with their required
implementations absent. Existing Ooga control/relocation resets hop/leap state;
Clanker possession reconstructs or zeroes drive velocity and hides the local NPC
when remotely controlled. Reusing those calls as an exact airborne reclaim would
lose state or prematurely hand back the body. #379 must supply the independent
track boundary. #464 must supply the reusable live-player equipment/pose path for
the semantic free-arm indicator; this change does not create a competing visual
transport. Clanker clothing, carried lab items, climb support and coupled work
state also require a full actor checkpoint/projector. The new Ooga display codec
does not complete those integrations.

### Passive body recovery and remaining body handoff

`passive-body.js` now integrates the SessionRegistry's disconnect motion through
explicit zone/shape support, ceiling and swept-solid queries. The new tests use
actual shared mesh kernels with authored flat geometry. Gravity proceeds in at
most 50 ms steps, falls without invented ground, stops at support/ceilings/walls,
and uses at most twelve extra probes for an unresolved swept contact. Landing
clears horizontal velocity. Registry disconnect already neutralizes held horizontal
motion, and the adapter has no access to equipment, firing, reload or thrust.
Exact ammo/fuel/mode remain in the session record. It rejects unsupported shapes,
penetration and invalid adapters rather than pretending they were simulated.

Expiry now simulates the remaining interval **up to the saved deadline**, even
when recovery occurs after it, before producing the green departure and existing-NPC
handback intent. Previously a due record could skip this last interval. The maximum
catch-up is 1,200 steps per body (76,800 for 64 bodies), each with bounded world
queries; these limits still need production cost measurement. Finite-step physics
is not a claim of frame-rate independence under arbitrary differently partitioned
wake times. Water, abyss policy, moving/animated supports, Clanker rig shapes and
production world export remain explicit adapter requirements.

Room `drop` still releases cabinets, doors, Studio/chalk and voice immediately.
The body grace cannot be implemented by delaying that whole function. Room
attachments still lack exact ammo/fuel, vertical velocity and the complete body
mode. A bounded authenticated body command/outbox must preserve confirmed close
times, reconcile duplicate sessions and acknowledge handoff idempotently across
Room/WorldHost before this feature can be enabled. Browser equipment capture,
reclaim application, free-arm/open-hand rendering, green beam and visual handback
are not integrated. The full NPC airborne/crowd/weapon/Clanker state machine is
also unfinished. These are implementation gates, not completed by the preview
transport or the disconnected-body motion adapter.

### Clanker flight and measured recovery costs

`worker/src/clanker-flight.js` wraps the actual browser arc controller with
explicit synchronous world, peer and rig queries. Each step is at most 250 ms;
sample buffers are capped at 32 segments, checkpoints at 4 KiB, and schema,
world and sample count must match on restore. The normal browser uses the shared
functions directly, preserving its existing scratch object and callbacks.
Original function blocks are retained as a hashed parity fixture from `af1abb83`.

The checkpoint holds from/to/lift, progress, duration, reverse/blocked state and
wall/cave-exit flags. Its `points` buffer is scratch: preflight writes point zero
and each successive segment before reading it, while flight and reservation
checks use the arc parameters. Restore allocates an empty buffer. Tests compare
fresh preflight points, every resumed flight sample, subsequent flights and a
refused partial preflight against the original controller. Runtime validation
checks finite bounded fields without serializing a checkpoint each step.
Position, drive/gravity state, climb/captive state, occupancy and work still
belong in one enclosing actor checkpoint; the fixture's coupled snapshot is
not a production actor codec.

Integration found the mesh/passive wrappers admitted radii only up to 2 m,
rejecting the actual flight controller's 2.25 m envelope. Their explicit cap is
now 3 m, covering that and the existing 2.9 m managed smash envelope; tests still
refuse 3.01 m. Mesh/node/triangle, height and step bounds are unchanged. A radius
envelope is not a rig silhouette or proof of captive/wall collision correctness.

`node worker/eval/clanker-flight.mjs` makes a finite offline measurement. On
Node 22.23.4/macOS arm64, 120 samples of 128 authored actors used 26,112 collision
queries per variant. Original flight measured p50/p95 0.0763/0.2251 ms, the bounded
shared controller 0.0736/0.1707 ms. The original runs in a VM context and neither
variant includes full AI or rigs; these figures do not establish a production
speedup. Before removing per-step checkpoint serialization the wrapper measured
1.2355/1.6221 ms on the same fixture. The coupled 128-actor fixture shrank from
163,201 to 97,153 JSON bytes by excluding scratch points. That leaves only 1,151
bytes of the 98,304-byte host budget **before sessions and other world state**:
it is not evidence that a full roster fits. Do not raise the cap to hide this;
production admission and a compact complete actor codec remain necessary.

Five local recoveries of all 64 grace bodies through the real mesh/passive
kernels used exactly 76,800 substeps each. p50 was 54.9703 ms, maximum 68.7189 ms
(also the five-sample p95); session/departure checkpoints were 31,781/31,068 bytes.
The bodies share an authored static platform and have no peer collisions.
Complex island geometry, moving supports, actor overlap resolution, serialization
of the full world, RPC/storage, DO CPU/duration and account usage remain unmeasured.
This is a reason to bound recovery work per invocation before activation, not
permission for a permanent paid loop. No production resources were accessed.

The body handoff review also found state missing from session schema 2: Ooga
`jumps`/`hopV`/leap continuation and health/recovery, Clanker `drive.jumps` and
health/form, and supported seat/ladder/grab modes. The existing motion record has
vertical velocity but cannot reconstruct all those controller states. Reusing
`crew.control`/`relocatePlayer` or `clankers.possess` would reset them. A versioned
complete body codec must precede admission; older records must be explicitly
rejected or migrated under a reviewed policy. Equipment application must restore
ordered magazines and exact fuel without calling ownership/grant paths, cancel
reload/burst/thrust holds, and reconcile resource changes newer than the last
confirmed checkpoint. This increment does not change live movement authority.
Room's close outbox, independent body tracks (#379), the reusable pose path
(#464), free-arm/open-hand rendering and green-beam handback are still unfinished.

## Verification record

Verified locally November 4, 2026 on Node v22.23.4:

- Clanker flight increment: initial integration failed all three new checks on
  the real 2.25 m shape exceeding the old 2 m mesh cap. One adapter repair passed
  all **16/16** affected flight/passive/collision checks. Scratch-checkpoint and
  validation review then passed the affected **3/3**; the final host batch passed
  **71/71**, including partial-preflight/restart parity. Unit **408/408**, build
  (**316 scripts**), nine touched JS/MJS syntax checks and whitespace passed.
  No Hub/full/browser rerun; the 20-entry failure ledger is unchanged. Logs and finite measurements are in
  `verification-clanker-{flight-first,flight-repair,flight-review,host,unit}.log`
  and `verification-clanker-cost-{first,final}.json` in the task workspace.
- Previous projection/publication increment: **66/66** focused host tests passed;
  after the explicit-acquisition review fix, the affected actual Room/bridge file
  passed **6/6**; the final adapter-bound and immutable-projection checks passed
  **19/19** in the affected host/pose files. Encoder parity covers 200 pose/equipment transitions against the
  recorded original function, full capacity, reconstruction and the actual browser
  host path. Unit **408/408**, build (**315 scripts**) and all eleven touched JS/MJS
  syntax checks passed. No Hub/full/browser rerun and no changed failure ledger.
  Logs: `verification-projection-host.log`, `verification-projection-review.log`,
  `verification-projection-unit.log`, `verification-projection-build.log`, and
  `verification-projection-cost-final.json` in the task workspace.
- Current `rock` advanced again to `350cf2bceef6881841ef946ac3f46d9518b4c7a6`
  with #465 hockey and #468 account changes. The authority descriptor now precedes
  welcome on the ordered socket, leaving upstream feature negotiation unchanged.
  Actual Room/compatibility checks passed **81/81**, and the final ordering check
  passed **6/6**. All five overlapping files combine in a three-way file preview;
  no branch merge/rebase or upstream authorship rewrite was performed. Remote
  combined CI still needs verification on publication.
- The latest bounded Claude CLI extraction attempt was rejected by automatic
  approval review before execution because sending repository code to that
  external service was not accepted as authorized. It was not retried; this
  increment was implemented and reviewed locally. Earlier successful Claude work
  and its authorship remain preserved; no API billing or signing settings changed.

- 31/31 host/session/navigation Node tests passed; the same batch included the existing
  replay/high-score checks, for **72/72 total** (about 0.4 seconds for the fixture
  process, not a real simulation CPU benchmark).
- The earlier root browser-free lane passed **408/408**. The follow-up `npm test -- hub`
  included this lane and real browser checks: **884/905 passed in 9.3 minutes**,
  with 21 failures across 20 unique checks, recorded below. Every ledger entry has
  streak 1; no assertion retry, threshold change or STOP occurred.
  The earlier green unit result is not a complete browser pass.
- Build, `node --check` on all seven changed/new JS/MJS files, and whitespace
  checks passed. The generated single-file site is not committed.
- CI now runs the host/session/navigation tests alongside its existing lanes.
- After tightening first-admission census/close bounds, the targeted host lane
  passed **15/15** again; syntax and whitespace were rechecked for that change.
- RNG follow-up: **408/408** browser-free unit checks passed. The focused host
  batch passed 33/34 on its first run: the new RNG fixture incorrectly projected
  `hub.choice`, which the strict public contract correctly refused. Its one fix
  changed the fixture to the required `hub.pile` shape, without weakening host
  validation or assertions. The RNG file then passed **3/3**; all 31 existing
  host/session/navigation checks passed in the original batch. Build and all ten
  touched JS/MJS syntax checks passed. No Hub checks were rerun; its twenty
  ledger entries remain byte-equivalent in content with streak 1. Local evidence:
  `verification-rng-host.log`, `verification-rng-repair.log`,
  `verification-rng-unit.log` and `verification-rng-build.log`.
- Work-trip follow-up: **408/408** browser-free unit checks passed. The first
  focused host batch passed **39/40**: moving the fixture's unassigned weapon-site
  property changed JSON insertion order and therefore its raw golden hash, while
  phase/callback traces matched. One correction canonicalized object keys and
  regenerated traces from the hash-verified original source, without changing
  assertions or using the new controller as its oracle. The six work tests then
  passed **6/6**; the other 34 checks passed in the original batch. Across 2,520
  frame restores, maximum work-checkpoint JSON was **390 bytes**, and complete
  single-actor fixture JSON **1,105 bytes**. These exclude real world/rig/collision
  state, full inventory effects and runtime/account cost. Build and syntax passed.
  The Hub ledger remains unchanged; no Hub or STOP-restricted assertion reran.
- A bounded read-only Claude Max review found the codec's unsafe phase/index
  combinations before testing. Outbound negative indices and return indices past
  the final waypoint now refuse restore. Independent review also confirmed browser
  callback initialization order, the original route-planning guard and no Tess edits.
- Collision/clearance follow-up: **408/408** unit checks passed. The focused
  host batch passed **46/47** initially. Its one failure was a new fixture expecting
  a long diagonal descent to clear a tread corner; the original swept mesh code
  correctly blocked that trajectory. One fixture correction now asserts that
  long descent is blocked and a clear edge descent succeeds; no kernel or tolerance
  changed. The collision file then passed **7/7**, and all other 40 host checks
  passed in the initial batch. Build (312 scripts), **23/23** JS/MJS syntax checks
  and whitespace passed. Hub assertions were not rerun; the twenty-entry ledger
  remains unchanged. Logs: `verification-collision-host.log`,
  `verification-collision-repair.log`, `verification-collision-unit.log`,
  `verification-collision-build.log`, `verification-collision-syntax.log`.
- The collision fixture's 128 placed cubes used a 28,725-byte catalog and
  15,381-byte checkpoint. Its 128 sweeps visited 2,048 candidates and tested
  384 triangles. Shared geometry contains 12 triangles; placed copies total
  1,536. These are authored-fixture counters/bytes, not production CPU, heap,
  Durable Object or account-cost evidence.
- A bounded read-only Claude Max review confirmed live island binding and script
  order and identified replicated-triangle cost and unsupported-support handling.
  The adapter now caps placed triangles, treats no-support as a refused move,
  and fingerprints an explicit kernel version. Independent review verified both
  collision algorithms unchanged and the original clearance source/fixture hash.
  Full crew probes exceeding four metres, production geometry export, semantics
  migration and closed-shell authoring remain explicit integration gates.
- Walker/search follow-up: all **47 existing host checks passed** initially;
  the five new tests stopped at a shared fixture setup typo (a geometry object
  called as a function). The unit lane also stopped because two source-extraction
  proofs still read moved functions from `crew.js`. One correction used the
  geometry object directly and pointed those unchanged proofs at `npc-walker.js`.
  The new walker file then passed **5/5** and unit **408/408**. Assertions and
  thresholds were retained. Build (313 scripts), all **6/6** changed/new JS/MJS
  syntax checks and whitespace passed. No Hub assertion reran; its ledger is
  unchanged. Logs: `verification-walker-host.log`, `verification-walker-repair.log`,
  `verification-walker-unit.log`, `verification-walker-unit-repair.log`,
  `verification-walker-build.log`, `verification-walker-syntax.log`.
- The composed work/walker/route/mesh fixture matches the original walker decisions
  for 500 frames including traffic waits, yields and backoff. Actual local search
  and obstacle traversal retain continuation through 240 reconstructions (modes
  1, 2 and 0); peak walker JSON is **2,868 bytes** in that single authored scene.
  A separate authored failed-search state exercises actual jump selection and
  mode-4 waiting. Host tests commit movement, search, routes and work together
  across failed writes and owner replacement. These do not establish full crowd,
  airborne physics, browser parity, 4 Hz simulation fidelity or production cost.
- Bounded Claude Max review and independent inspection confirmed browser hook
  initialization and found a reused VM test context and unbounded saved-target
  recheck. Both were corrected before the test batch. Independent review also
  guarded non-progressing shoulder callbacks and preserved work's explicit cache
  invalidation before recovery resets. The 17,515-byte function block and captured
  original source match exactly. The new codec's per-actor cap is not a claim that
  128 concurrent searches fit the host's 96 KiB total checkpoint budget.
- Room/body follow-up: initial focused host/session/Room/body batch passed **36/37**.
  Its only failure was the new Room harness swallowing a failed initialization
  promise; one harness correction retained that rejection, and the Room file
  passed **5/5**. Existing protocol/doorway/voice/hockey/chat checks passed **75/75**.
  Independent review then added release-ordering, ambiguous-publish reconciliation,
  unknown-version fencing and landing-stop checks; the two new files passed **9/9**.
  Unit **408/408**, build (314 scripts) and **12/12** touched JS/MJS syntax checks passed. No Hub/browser/full
  rerun. Existing predicates and thresholds were not weakened.
- Further independent inspection found that socket credit must survive hibernation,
  not only live in Room memory. It is now in attachments; repeated-wake tests passed
  **5/5**, and the affected Room compatibility checks again passed **75/75** after
  that change. The actual passive/mesh integration also passed **5/5**, including
  VirtualHost failed-write rollback of landing and handback and no replay after
  restart. Final new-test total is ten; existing host tests are unchanged.
- Bounded read-only Claude Max review completed successfully with no permission
  denials. Independent triage retained strict one-outstanding-frame backpressure
  instead of the suggested timeout resend, because a non-reading socket must not
  accumulate more frames. Held horizontal motion was already neutralized by the
  registry; the passive adapter also now clears it on landing. Rollback limits and
  backward-clock refusal are explicit. Logs: `verification-authority-focused.log`,
  `verification-authority-repair.log`, `verification-authority-room-regressions.log`,
  `verification-authority-review.log`, `claude-review-authority-result.json`.
- Claude Code used the existing authenticated Max subscription for the bounded
  session implementation, a read-only review and bounded follow-up registry fixes.
  Parent review added missing-
  collision refusal, bounded passive substeps, duplicate-input neutralization,
  lease/run validation, explicit paused recovery, idempotent subscriber registration
  and host/session transaction tests. Follow-up regressions cover explicit close
  ordering, idle grace ticks, bounded drain, exact inventory, durable body tombstones,
  logical-time resume and atomic NPC handback. No API key or billing setting was enabled.

Fixtures cover competing authority, deterministic restart, failed commits, mixed
versions, payload/fanout/backpressure, the exact grace deadline, stale sessions,
occupancy, passive falling and unchanged ammo/fuel. They do not provide an actual
Durable Object, complete browser, two-client or physical-phone pass. Other than the
bounded planner and projection measurements above, no full-world performance, load,
production data, merge or deployment operation was performed. The outstanding
integration/performance gates above remain required before activation/completion.

The browser failures below were recorded before the RNG/work extraction and remain
unresolved. No clean baseline hub run was available, so they are not labelled
pre-existing. At that earlier increment, source comparison confirmed the existing
16,348-byte route algorithm is identical to the base; the browser still uses
`createState`, `target` and `route`, while the new checkpoint methods are unused
by its current scene. No concrete causal fix in this increment was identified,
and unrelated controls, Tess, hammock layout and game behavior were not changed.
Do not rerun failing assertions without a diagnosis/fix; follow the ledger STOP rule.

| Failed browser checks | Failures |
| --- | ---: |
| Cloud Hopper: props/ghost camera obstruction, downhill/airborne relative camera, real-rock crossing camera, results/replay framing and held keys | 4 |
| Hub round trip: outdoor bed ownership on leaving/returning | 1 |
| Hammock moving tips/occupant/approved tree bounds | 1 |
| Chilling arrival and working arrival state/bed placement | 2 |
| Player-on-player support: landing, moving/rising support, gorilla riding support and gorilla walking collision | 4 |
| Lab jobs/room exits and gorilla apron descent | 2 |
| Jetpack toggle/climb/abyss inventory and stun/drop-tag behavior | 2 |
| Guide handoff: walking release and jetpack release during a tour | 2 |
| Matrix camera/glyph batches, reported in both renderer runs | 2 |
| Canvas 2D multi-scene tour | 1 |

The local handoff preserves the complete failure names/details in
`verification-fixes-ledger.json` and the full run in `verification-fixes-hub.log`.
These local logs are not production evidence or a successful two-client check.

### Source review of the 20 failures

The follow-up reviewed the existing logs, each failed predicate and current/base
source without rerunning any Hub checks. No failure was attributable to the patch
on this evidence. Six unique checks have existing fixture/admission mismatches:
all four Hopper checks call the refused non-arcade launch; the matrix test counts
the eight existing sleep-beam glyph batches across the whole hub; the Canvas tour
expects Rally entry without its required maintenance opt-in. These are source
findings, not a successful baseline test run.

The remaining fourteen stay unresolved: one outdoor bed-state predicate; the near
hammock anchor coordinate; five occupied inner fire seats instead of six; four
remote body/support checks; one actor's feet 0.1875 above the working-arrival
surface; two lab job/animation predicates; apron blocking/recovery; two jetpack
checks starting with the pack unworn; and two guide checks lacking post-tour
clearance or an initially climbing actor. In particular, the lab doorway exits
and matrix opacity samples passed their predicates. No related game behavior,
test threshold, layout or Tess source was changed to clear these failures.

The local handoff's `review-377/HUB-FAILURE-ATTRIBUTION.md` maps all twenty exact
ledger entries to source and evidence; `source-comparison.json` records hashes.
The RNG and work extractions postdate this Hub run and have separate focused
verification; the prior result does not establish browser parity for them.
