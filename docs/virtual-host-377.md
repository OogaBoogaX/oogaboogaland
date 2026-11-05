# Virtual host: inactive implementation draft

Part of #377; **does not close it**. Baseline: `rock` at
`17659ddfa0079f24bea84d872e29e532530bd7e4`. Room now imports an authority adapter,
and the client understands its preview negotiation. No configuration enables it;
there is no new binding, HTTP route, migration, alarm, enabled host timer, dependency or production
data change. The current browser host still runs by default.
During this increment `rock` advanced to `1a87a4eb9d91330638f029b38e456188385d00a1`
with #462 voice changes. Overlapping paths were reviewed; fixture prerequisite
loading was placed away from the new voice context so both changes combine. This draft must not be described as an
always-on NPC world or an enabled disconnect feature.

**Current player recovery policy:** keep identity/form, location/facing, physical
motion and remaining jump credits, selected equipment/mode, ownership and deadline.
Ammo, spare magazines, fuel, health, animation and AI/controller history reset to
normal defaults. This supersedes exact consumable/health claims in older progress
sections below. Session schema/protocol 4 and controlled body-3 implement the
reduced inactive format. See [the current capacity audit](virtual-host-body-storage.md)
for complete sizes, reset semantics and the remaining browser/cost gaps.

## Pending body handoff: local checkpoint

**Current follow-up: atomic RPC receipts and Room lifecycle hooks.**
`host-body-operations.js` stores the latest handoff result in the same transaction
as its body/session mutation. Exact retries recover that result without another
admission, hold or presence update. A canonical SHA-256 command digest preserves
signed zero and detects changed retries without storing a second input snapshot.
Closed work uses recovery-only dispatch: it either returns the committed result
or records cancellation before an older in-flight request can create a body.
Old-epoch results stay old; only the current fenced host can retrieve them.

Room now parses receipt-only messages, persists trusted claim input until the
offer completes, records close timestamps, and restores missing connections from
their last durable observation. A closing socket is fenced synchronously while
ordinary presence/voice cleanup remains immediate. Explicit server hooks and
`host-body-room.js` drive one handoff/cleanup operation at a time. A lost Room
completion reply can resume delivery from its stored phase. Before any live-send
possibility, a replacement host can abandon an undelivered final ACK using the
original deadline; this reconciliation must happen before ordinary recovery ticks.
An empty retained index still fences legacy joins and authority rollback.

These hooks require `VIRTUAL_HOST_BODY_PREVIEW`, an authenticated current Room
authority and compatible socket. No configuration sets the flag and no welcome
advertises the unfinished feature. Staged bodies refuse ordinary movement/body
reports until the live adapter is implemented. This is not an enabled reconnect
feature. Automatic runner recovery ordering, receipt retirement, independent
player/ghost bodies, full-world restore and live presentation remain unfinished.
Receipt slots cannot be discarded early: their original request window must end
and Room must retain the outcome before explicit retirement. Without that runner
step, unresolved work safely blocks a new request for the same account or capacity.

The increment passes **75 distinct focused Node checks**, including actual Room
source lifecycle tests, atomic rollback, lost replies, cancellation, replacement
host cleanup and rollback fencing. No Hub/browser test was run. A new finite
30-second strict four-Hz run still fails: **119/120 updates, 78 late**, last-client
p95 **334.4 ms**, maximum **347.9 ms**, with 20 ms synthetic latency and 31 decoders
sharing one Node process. First-client p95 also fails at **268.7 ms**. Simulation
completion missed no deadline; rate bounds still hold. The run measured the
restricted 53-NPC/30-player workload, not full-world or handoff churn. Later
cleanup-only hooks are covered by focused checks, not this load sample. Activation
and burst remain disabled; no threshold or policy was relaxed.

The earlier sections below retain checkpoint history; this follow-up supersedes
their claims that Room lifecycle hooks or uncertain-claim receipts are absent.

**Latest follow-up: inactive browser v2 and durable Room outbox.** The browser
preflights an offer, restores the newer final snapshot with controls off, and
enables control only after the host commits `startedBody` and Room delivers the
matching `body-live` receipt. The one-second starting interval is a snapshot
hold, not browser control permission. It no longer depends on `net.serverNow()`.
Local elapsed time bounds inactive waiting from the first outgoing apply request;
duplicate replies never renew it. Monotonic and wall elapsed time, reversal checks,
visibility suspension and receipt-time expiry checks cover the tested clock jumps,
sleep and delayed timer cases. These checks do not prove ordinary live movement
fencing during a network partition or host replacement.

`worker/src/room-body-handoff.js` persists intent before host RPCs, retains private
references and the latest transfer, and records possible live notification before
sending it. A reply arriving after close is retained for cleanup, never sent to a
replacement socket. Unknown RPC outcomes remain pending rather than being blindly
redispatched. When live notification was never attempted, the host can abandon an
ACK-committed handoff and restore the original disconnect deadline; once a live
send was possible, cleanup must use the normal disconnect path instead.

The component now has the explicit Room hooks described above; automatic lifecycle
orchestration and the independent scene body adapter remain required.
No reclaim capability is advertised. The component stores at most 32 records of
34 KiB plus a 1 KiB index; 32 maximum-size transfers measured 1,063,362 JSON bytes
across 33 records in the earlier schema, with a largest row of 33,229 bytes.
Current schema-2 sizes and the separate host receipt journal are documented in
the body storage audit. Provider overhead is extra.

This follow-up passed 64 distinct focused Node checks: six client, 15 networking,
and 43 host/session/storage/outbox checks. One initial networking fixture advanced
its clock 200 ms on every read, exhausting the new wait budget; that fixture now
uses an explicitly controlled clock and all 15 checks pass. No product deadline
or assertion was relaxed. Build passes. No Hub/browser tests or new load run were
performed. Combined runtime, storage billing and production cost remain unmeasured.
The earlier checkpoint below describes the host foundation; its browser-v1 gap is
superseded by this follow-up, while live integration and delivery gates remain open.

Session schema 4 / `host-session-v4` adds two persisted states without adding
fields. `offered` remains host-owned: held input is stopped, passive physics
continues, and the original absolute grace deadline and occupancy are retained.
An offer replacement changes generation/token but cannot renew that deadline.
`activateBody` returns the latest body, after bounded recovery, and changes it to
`starting`: a one-second snapshot hold clipped by the original deadline. The
host does not step it during that hold. A confirmed socket close, duplicate
session, revocation or host restart cannot take control early. A lost final ACK
returns it to passive host recovery after the lease, with the original deadline.

Only `startedBody`, bound to the authenticated account, private generation/token
and exact server-retained final transfer, makes it live. Duplicate successful
ACKs do not write or refresh presence. Failed writes roll back body and ownership
together. Receipts for replaced generations are rejected before their stale
transport census can alter newer sessions. Unfinished offer physics and expired
leases block publication until recovery catches up. Full body and session size,
controller-construction and passive-step budgets are unchanged. Old session
schemas refuse; no automatic migration or production writer is enabled.

The host-side increment passes **74 distinct focused Node tests** across session,
body-storage, capacity, authority and recovery checks (64 initially, then 23
body-storage/capacity checks including two new boundary checks, plus eight
passive-physics/presentation checks). The real restricted
Clanker fixture verifies horizontal neutralization, motion during an offer,
transfer of the newer body, no host stepping within the lease, and falling recovery
after an unacknowledged lease. Standard pose, default health and remaining jump
credits survive. Pending offers and final ACKs keep the free-arm indicator and
red name circle; the circle becomes green only after acknowledged live ownership.
Those tests use actual rigs in Node, not a live browser or scene wiring.
Conservative pending-session JSON is 898 bytes plus its separator,
within the existing 1,024-byte session reservation; this excludes the separately
bounded body record and is not a claim that every combined record fits 1 KiB.

**Not a completed Room/browser handshake:** the new bounded durable outbox and v2
client must still be integrated with real Room lifecycle and reconciliation.
Separate Room and host commits are not atomic. Ordinary possession resets motion
and is not a substitute for the independent body adapter. The browser does not
use a server-clock estimate to authorize control during the starting hold.

First-login NPC placement with a separate continuing ghost track, full-world
collision/AI/recovery, Ooga restore and live disconnect presentation remain open.
The strict four-Hz delivery failure below is unchanged. New handoff operations add
commits; combined CPU, Room storage/write cost, network partitions and device/browser
validation remain required. Burst and activation remain disabled; Tess is excluded.

## Latest local throughput checkpoint

The longer 120-sweep test with 20 ms synthetic client latency disproved the
rolling preview's headroom: 119/120 updates arrived, 84 were late, and the last
client took up to 352.2 ms. A separate, disabled `rate-4-burst-2-v1` preview
passed the same stress case: 120/120, no late/coalesced/superseded updates,
211.7 ms p95 /220.7 ms maximum last-client age. It earns four publications per
second with two credits and a 125 ms minimum gap. This allows **five** in a rolling
second, unlike the strict rolling policy. Sustained rate remains four/second;
the short-window burst budget is explicitly larger and separately gated by
`VIRTUAL_HOST_BURST_PREVIEW`. No deployed configuration enables either experiment.
Both retain the same payload and one-unacknowledged-frame bounds and fencing.

The new `connectBody` operation commits the ownership change and matching body
transfer atomically; failure to produce the body rolls back the claim. The caller
must authenticate the account and wait for browser preparation first. It does
not implement Room's readiness/grant/ACK exchange or the separate player body.
Those, real-world physics/work state, live disconnect visuals and production cost
validation remain unfinished. Even the 29 ms stress margin is not full-world proof.

`prepareBody` now supplies a server-retained, token-free observation for that
preparation. It neither reserves a body nor confirms presence. `connectBody`
requires the observation and rechecks its host epoch, body generation and expiry
before recovery can use a transport census. A second check after recovery prevents
an inferred expired disconnect from becoming a fresh spawn. A missing body binds
the admission counter, so creation followed by removal cannot fool a stale request.
Forty focused host/storage/recovery checks pass, including actual Clanker restore.
Room still must bind readiness to its current authenticated socket and implement
grant/apply/ACK and confirmed-close delivery; these server methods alone do not
enable browser reclaim. See the current storage document for cost assumptions.

### Inactive browser handoff contract

`body-reclaim.js` is now loaded before `net.js`. It requires Room's explicit
`host-body-reclaim-v1` capability, which **Room does not advertise**, and a complete
scene adapter, which **no scene installs yet**. Thus it changes no deployed body
ownership. It prepares an inactive resource, applies one bounded committed transfer,
acknowledges that generation/revision, and activates controls only on a matching
`body-active`. Duplicate grants do not reapply or refill resources. There is one
asynchronous preparation and one expiry timer, at most ten seconds; stale completion,
connection replacement and expiry release the resource. New incompatible authority
blocks old controls. The network layer suppresses cached body/pose replay while
blocked, invalidates pose caches on activation, and leaves voice messages separate.

Eighteen focused Node checks pass, including the actual net module and restoration
of an actual minimal Clanker checkpoint before ACK. This is not browser scene or
render validation. `test/run.mjs` only loads the new dependency in its existing net
fixture; that suite was not run because the Hub restriction remains in force.

`VirtualHost.confirmBody` adds the server-side apply check. Room must retain the
exact issued transfer and bind the browser's receipt to its current authenticated
socket plus the private host generation/token. Confirmation compares the complete
current session view and body component, preserving signed zero. Unrelated world
revisions may advance; changed equipment, occupancy, body data, epoch or generation
cannot activate an old receipt. It is read-only and renews neither presence nor
grace. The storage adapter now shares the same bounded exact-value comparison.
All 15 storage checks pass after correcting one new test's capture-injection setup;
the 26 host/recovery checks passed on the first run. No production state changed.

The missing Room half is material: it must authenticate/bind each offer and
ACK to its current socket, persist outstanding close/grant work, and reconcile
uncertain host commits. The pending handoff methods above now preserve the host
deadline; legacy `connectBody` still marks the session live immediately and must
not be exposed as the browser reconnect flow. Scene adapters also need independent player bodies
alongside the continuing #379 NPC track, real world collision and Ooga restore.
No capability, body route or scene adapter is enabled by this checkpoint.

The burst policy has **not** been approved for activation. Its earlier timing pass
does not satisfy the strict policy. Separate strict publication checks pass, while
the saved 120-sweep strict rolling run still fails delivery (84 late, one omitted).
No unchanged throughput run was repeated or reclassified as passing.
An independent offline check of the saved strict run found a maximum of four
publications per rolling second and a minimum 234 ms gap among its 119 commits;
its worst last-client age was still 352.2 ms. The rate gate passes and the delivery
gate fails. The separate publication suite has nine strict/legacy checks and two
burst-bound checks; all eleven pass, without enabling any runtime configuration.

### Earlier ten-second rolling result

An explicit, disabled rolling-cadence preview now passed the finite local delivery
gate: all 40 updates reached all 31 acknowledging clients within 250 ms, with no
coalescing or supersession. Last-client age was 239.8 ms p95 /247.0 ms maximum,
leaving only 3 ms margin. The fixture still excludes complete island/world work,
browser rendering and real network/device costs; this is not activation approval.

The preview enforces four publications in every rolling second, at least 125 ms
apart, with persisted debt across restart and release/reacquisition. This explicitly
changes the short-interval policy; the default still requires 250 ms spacing.
No deployed configuration enables `VIRTUAL_HOST_ROLLING_PREVIEW`. Older Rooms
must explicitly negotiate the mode; older persisted-record readers refuse it.
See [the measured cadence and migration rules](virtual-host-body-storage.md#rolling-cadence-preview-and-body-transfer).

The new server-only `bodyForSession` reads the matching current session and body
component atomically, checks the authenticated account supplied by its caller plus
the private generation/token, and returns no token or other player's state. Actual
Clanker reconstruction from that transfer preserves motion and resets resources.
It does not confirm presence or grant browser controls. Room authentication wiring,
browser apply/ACK and separate player/NPC body lifecycle are still unfinished.

### Prior strict-spacing result

The explicit finite publication runner now keeps at most one RPC in flight and
one newest pending revision. It prepares poses before the next delivery slot,
then rechecks ownership before Room commits. A newer partial body sweep safely
supersedes publication; ordinary host reads still reject incomplete recovery.
Failures stop the runner without blind retries. No timer or live runner is enabled.

With 53 restricted roaming NPCs, 30 player bodies, eight transactions per sweep
and 32 Room sockets, all 40 simulation updates finished within 250 ms. Delivery
still emitted only 38 updates; five reached even the first client late (264.5 ms
maximum age). Ownership confirmation and RPC dispatch add roughly 5–7 ms after
each 250 ms pacing wait, accumulating until newer recovery supersedes a frame.
The strict end-to-end gate remains unmet. Activation stays disabled; no timing,
transport, recovery or capacity limit was raised. This is a finite local fixture,
not full-world or production throughput certification.
See [the combined measurement](virtual-host-body-storage.md#four-hz-batching-and-combined-delivery-gate).

Browser inspection confirms the remaining integration is substantial:
`crew.control` may put an Ooga on the floor, `clankers.possess` clears velocity,
and `pilot.restorePose` is a camera/debug replay operation. None is an exact
physical reclaim API. The live controller also maps one Clanker per owner,
so reusing possession cannot simultaneously preserve that NPC's ghost track.
The next integration must provide a separate player body lifecycle, restore its
minimal physical state against actual world/support geometry, then attach local
controls only after an authenticated, current-generation grant. Room currently
has NPC authority RPCs but no such body grant/ack channel. These paths remain
unfinished; fixture recovery and `resetResources: "defaults"` do not implement
them. First-login placement plus the continuing NPC ghost track remains part of
#379 integration. Tess remains excluded.

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
| Room `pose` carries position/yaw and compact `g`, `j`, `w` display fields | It lacks vertical velocity and the essential physical body handoff. Add and validate these explicitly; consumable quantities now reset and need not be inferred or saved. |
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
  as at most eight 250 ms simulation steps. Passive recovery shares a 4,096-step
  transaction budget; unfinished recovery pauses NPC stepping and pose publication.
  The authenticated transport census is
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
- `connect(ticket, liveTokens, claim)` is the authenticated admission/reconnect
  entrypoint. It prioritizes that account's passive continuation within the same
  budget; generic registry callbacks must not substitute for timely reconnect.
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
record. Host schema 4 refuses earlier host schemas without migrating them; private
session schema 3 refuses earlier schemas rather than silently changing their recovery
policy. A stale runner cannot overwrite a new owner. Transaction tests cover
rollback and competing claims; actual Durable Object storage/output gates and
alarm execution still require a local Cloudflare runtime test.

## Disconnect and occupancy contract

The confirmed close of the current `(accountId, generation, token)` starts grace
for exactly 60,000 ms. Stale sockets cannot disconnect, update or release a
replacement. A duplicate live connection rotates generation/token and neutralizes
old held movement. Reconnect strictly before the deadline preserves the same body,
resulting position and heading, Ooga/Clanker kind, selected weapon/slot, gear
ownership, carry/combat mode, unlimited-ammo flag and jetpack ownership/equipment.
Current/spare ammunition, fuel and health reset to normal defaults on return.
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
history. The future handoff must cancel incomplete reload/firing/thrust and reset
consumables to normal defaults under the revised recovery policy. Ordinary connected
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
The original helper projected twice to detect superseded host state; the revision
confirmation described below now avoids that duplicate projection. The local
projection measurement below excludes coordination, checkpoint validation/copying
and RPC/storage cost.

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

### Recovery work budgeting and capacity admission

The host now shares a **4,096 passive-substep budget per transaction** across
restore, recovery, callbacks, drain and stop. A body cursor advances only as far
as committed physics; unfinished records keep their original last-presence and
deadline. The next transaction serves the oldest unfinished cursors. All 64
complete grace intervals therefore take 19 operations instead of one operation
with 76,800 calls. `work` reports performed steps and pending bodies/steps. A
failed commit preserves the previous cursor and ownership; replacement owners
continue from those cursors. Automatic storage-transaction retries share an outer
operation meter too: exhaustion aborts the operation without publishing attempted
progress; a later explicit operation can try again. `work.attemptedSteps` includes
discarded attempts, while `work.steps` describes committed progress. The budget counts callback work, not a promise of
Cloudflare CPU time: each callback still needs a measured bounded world query.

The typed `VirtualHost.connect(ticket, liveTokens, claim)` must be used for
authenticated admission/reconnect. It prioritizes that account's complete passive
continuation before unrelated bodies. A reconnect accepted before its saved
deadline can reclaim its resulting pose even when others remain behind; one at
the deadline cannot revive it. Generic internal `sessions` callbacks do not get
this automatic priority and `registry.connect` returns `recovering` instead of
handing back a stale pose. Repeated callbacks cannot replenish the transaction
budget. Arrival/close command persistence across Room RPCs still requires the
unfinished authenticated outbox; this internal API does not implement it.

While previously committed recovery is unfinished, NPC time does not advance and
pose publication refuses the partial state. Late expiry settlement can span
several transactions, but its recorded departure time stays the original deadline
and possession cannot be reclaimed after it. Occupancy and handback settle with
the completed body, atomically; a future runner must schedule these bounded
operations promptly and account for this processing interval. No automatic loop
was added. That increment used host schema 3; the capacity increment below now
uses schema 4 and rejects earlier schemas without modifying them. The private session codec remains version 2.
No implicit migration, reset or production rollout is performed.

`node worker/eval/host-recovery.mjs` at commit `cbf6d3e9` drove actual host
admission and recovery over authored Clanker/platform fixtures and atomic
in-memory storage. These historical unreserved results motivated the reservation
and mixed-roster experiment below; the current evaluator has been replaced:

| Authored actors | Sessions admitted | Peak checkpoint bytes | Recovery writes | Total recovery bytes written |
|---|---:|---:|---:|---:|
| 1 | 64 | 32,932 | 19 | 619,051 |
| 32 | 64 | 56,461 | 19 | 1,066,102 |
| 64 | 64 | 80,749 | 19 | 1,527,574 |
| 96 | 50 | 98,065 | 15 | 1,466,870 |
| 128 | 1 | 98,010 | 1 | 98,002 |

Across these five finite sequences, maximum operation time was 16.1782 ms (first
case); the 64-actor/64-session case measured p50/p95 5.5618/5.7263 ms over its 19
operations, with 109.422 ms total process CPU. The new budget reduces peak work
but increases checkpoint writes/serialization; these are not DO billing figures.
There is one sequence per capacity, not a production percentile guarantee.
96 actors left only 239 bytes at peak; 128 actors admitted just one of these
particular sessions. These are **unsafe activation margins**, not supported
production capacities. Complete actor fields, worst-case numeric/string growth,
future motion and other world data require reserved headroom and an explicit
admission policy with a compact complete codec before activation. The 96 KiB cap
is unchanged. Geometry complexity, peers/animated support, real storage/RPC,
account costs and browser rendering remain unmeasured.

The first evaluator run correctly reached terminal `backlog` after settling its
last body but incorrectly tried to tick again, receiving `host fenced`. Its loop
was fixed to stop at both terminal states and the rerun passed. No production
code or check threshold was relaxed for that evaluator correction.

### Reserved capacity and mixed-roster checkpoints

The registry currently contains **53 characters** (`node scripts/characters.mjs
--json`); `clankers.js` creates one Clanker per crew Ooga. That means **106
potential NPC bodies**, before player tracks; it is not a measured simultaneous
active-world count. Room's 32 viewers and the registry's 64 retained body slots
are different limits: live bodies, disconnected bodies and unacknowledged
visual departures all consume retained slots.

Host schema **4** requires and persists a simulation `checkpointBytes` maximum.
Admission reserves that entire maximum, 2,048 metadata bytes, and **1,024 bytes
per retained slot**, rather than looking only at today's serialized size:

`maxSessions = min(64, floor((98304 - 2048 - simulationBudget) / 1024))`

A full profile returns `full` before allocating a new body; duplicate/reclaim
operations retain their slot. Departures retain theirs until acknowledged.
Changing the budget or loading an older host schema fails closed, without a
silent migration/reset. The same 96 KiB physical limit remains. Simulation state
is separately bounded to 16,000 encoded nodes, metadata to 128 and each slot to
48, leaving the sum below the original 20,000-node whole-record limit. Slot
byte/node limits are checked on every commit. Tests overestimate all float
encodings with 25 ASCII digits plus string quotes, use maximal identifiers,
16-digit counters/timestamps, occupancy and both session/departure forms. A new
body schema must rederive these bounds; schema 2 still lacks full actor state.

`compactSimulation` is opt-in: it stores repeated object field names once per
ordered shape, retaining numeric precision, array order and negative zero.
There is no general compression dependency or rounding. Its world version
includes format and budget. It rejects cycles, aliases, non-data properties,
nonfinite numbers, ambiguous arrays, excessive dictionaries/depth/nodes and
expanded data over 256 KiB. Decoding charges repeated key bytes before allocating
each object to bound expansion. Shared world geometry belongs once in the world,
not duplicated in each actor. The mixed fixture consequently stores its authored
mesh once; this is not a complete production geometry/actor codec.

The finite evaluator now exercises 120 active quarter-second steps followed by
a complete simultaneous grace recovery, serially on Node v22.23.4. Oogas use the
real work/walker controller; Clankers use the real flight controller. Inventories,
crowd interactions, rigs and the world remain fixtures. All accepted sessions
and departure records fit after growth, failure and restart:

| NPC bodies (equal pairs) | Declared simulation bytes | Retained slots | Peak total bytes | Active p50 / p95 ms | Recovery operations / bytes written |
|---|---:|---:|---:|---:|---:|
| 2 | 30,720 | 64 | 35,434 | 2.752 / 3.640 | 19 / 665,810 |
| 32 | 30,720 | 64 | 50,995 | 13.716 / 16.066 | 19 / 960,747 |
| 64 | 49,152 | 46 | 58,705 | 24.694 / 28.085 | 14 / 816,253 |
| 106 | 65,536 | 30 | 72,634 | 39.687 / 45.225 | 9 / 650,722 |

At 106 actors, initial simulation data fell from **133,057 to 47,180 bytes**;
its measured peak was **57,415**, leaving **8,121 bytes inside its declared
budget** and **25,670 bytes total physical headroom**. This profile admits 30
retained bodies, **fewer than Room's 32-viewer ceiling**. A future Room body path
must respect profile admission and retained grace/tombstones rather than infer
capacity from viewer count. The capacity fixture explicitly refuses more than
53 pairs; it does not promise that 128 complete actors fit. Completing actors
or increasing the roster requires a new measured profile/world or a different
storage architecture, not removing these bounds.

Packing costs CPU: at 106 actors the 120 active transactions used **6,339.817 ms
process CPU** and wrote **8,573,259 bytes**; nine recovery operations used
**411.166 ms CPU**, p50/p95 **37.491/45.186 ms**. Repeated `npcFor` queries still
unpack the whole world. A bounded ownership index and reusable transaction-local
runtime are candidates for profiling, but are not implemented. These local
sequences include validation/copying and authored adapters, not Cloudflare
storage, cold starts or multi-world load. They are not production percentiles
or an affordability result. Evidence: `verification-capacity-cost-final.json`.

The 106-actor test also compares every decoded state to the original unwrapped
controllers, exercises JSON persistence, a failed transaction, host replacement,
a last-millisecond body reclaim and absent-NPC departures without replaying NPC
steps. Separate tests fill all 64 slots, grow the simulation to its exact declared
maximum, retain occupied bodies and drain into departures. Budget mismatch,
old schema, expansion attacks and overrun preserve the prior checkpoint.

Production cost validation remains blocked by the absent production world/runner
and account/runtime measurements. No Wrangler executable is installed in this
checkout. The subsequent local runtime experiment below uses an already cached runtime outside the checkout;
no runtime was installed or deployment attempted. Cloudflare's current
[pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
meters active/non-hibernating wall time, not local CPU samples; SQLite `put`
costs rows, whereas legacy KV storage uses 4 KB units. Account allocations are
shared and unknown here. A hypothetical 4 Hz writer makes **3,600 writes per
15-minute run**, at most **337.5 MiB of serialized checkpoint traffic** under
this application cap, before additional session/recovery writes. Continuous
4 Hz operation would make **345,600 writes/day**, already above the documented
100,000/day free SQLite write allowance. These are arithmetic scenarios, not
enabled schedules or invoice predictions. Cloudflare's
[limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
allow larger storage values than this application's deliberate 96 KiB cap;
increasing that cap would not establish safe CPU, fanout or recovery costs.

Current local verification: **81/81** focused host tests, including seven new
capacity/codec/roster checks; the separate codec review passed **6/6** after
rejecting hidden/accessor/symbol state and strengthening maximal-number tests.
Unit **408/408**, build (**316 scripts**), **19** touched JS/MJS syntax checks
and whitespace passed. No thresholds were weakened; no Hub/full/browser checks
were rerun. Full actor
and Clanker projection, exact browser reclaim, authenticated body outbox and
free-arm/green-beam rendering remain unfinished, with #379/#464 boundaries intact.
Tess is unchanged. No timer, paid loop, environment enablement or deployment added.

### Local Durable Object storage and ownership query costs

`worker/eval/host-runtime.mjs` bundles its separate local fixture entrypoint and
runs the real `VirtualHost` against workerd's SQLite Durable Object transactions.
It requires `HOST_RUNTIME_PACKAGE` to name an already installed Miniflare
`package.json`; it never installs dependencies, loads a Wrangler account config,
authenticates or deploys. It binds loopback, disables telemetry/CF lookup, blocks
outbound fetch, and uses fresh temporary storage that it removes afterward. This
entrypoint is not imported or bound by the deployed Worker.

The cache available for this experiment was **Miniflare 5.20261001.0-alpha**,
**workerd 1.20261001.1**, with compatibility date **2026-10-01**. Its associated
Wrangler is 4.147.0, older than the repository's declared ^4.153.0. Consequently,
this closes a local-storage evidence gap, not the locked deployment-runtime or
production validation gate. Authored clock, mesh, inventory and partial actor
adapters remain the same as the Node capacity fixture.

Both 32-NPC/64-slot and 106-NPC/30-slot sequences completed 120 active steps,
refused excess admission, rolled back a write after `put`, and retained their
exact checkpoint after disposing and starting a new workerd process. The new
owner reclaimed the same body one millisecond before expiry with a new token,
unchanged equipment and completed passive motion. A stale owner was rejected;
other departures kept their original deadlines and did not spawn NPCs. Recovery
did not replay the saved simulation. No outgoing fetch or unexpected runtime log
was observed. This is orderly process reconstruction, not an abrupt kill or a
Cloudflare eviction test.

The initial smoke run could not bind loopback inside the sandbox. The permitted
local run then exposed a temporary-bundle module-root configuration error before
any assertion. Minimal plain/crypto/SQLite probes and isolated source initialization
passed; setting the generated bundle's module root fixed startup. The first
executed smoke sequence then exposed an incorrect evaluator assumption: observing
a grace at deadline-minus-1ms splits its final integration interval, so the total
was 76,802 calls rather than 76,800. The evaluator now measures and asserts exact
elapsed passive milliseconds: `slots * 60000 - 1`, plus the unchanged 4,096-call
per-operation cap. The corrected smoke and full runs passed. No product threshold
or simulation rule changed for those evaluator corrections.

Profiling identified repeated whole-world decoding for `npcFor` queries during
expiry. `compactSimulation.readQueries` now provides one lazy, recursively frozen
snapshot for a transaction's read phase. A query cannot mutate another query's
view. No snapshot survives a transaction attempt. `VirtualHost` creates a fresh
reader after each actual handoff, including before the session callback following
recovered handback. Tests cover both refusal of a now-invalid second handback and
a new release correctly observing changed eligibility in that same transaction.
Simulation steps, checkpoints, schema, ownership and deadlines are unchanged.
This is not a persistent ownership index and does not cache updates.

Two serial local sequences measured the following end-to-end dispatch times. The
first used per-query decoding, the second the phase reader. They include local
serialization, process dispatch and SQLite. These are small observational samples,
not a controlled production speedup or Cloudflare CPU/duration figures:

| NPCs / retained slots | Reader | Active p50 / p95 ms (120 samples) | Recovery p50 / p95 ms | Recovery ticks after priority reclaim |
|---|---|---:|---:|---:|
| 32 / 64 | Per-query | 17.841 / 23.215 | 23.971 / 30.867 | 18 |
| 32 / 64 | Phase snapshot | 15.416 / 18.430 | 14.532 / 17.030 | 18 |
| 106 / 30 | Per-query | 56.726 / 80.525 | 52.849 / 80.647 | 8 |
| 106 / 30 | Phase snapshot | 40.767 / 42.417 | 30.863 / 32.586 | 8 |

The priority reconnect itself performs one bounded recovery operation; the table
counts subsequent ticks. Serialization/write counts were identical between runs:
106 actors wrote **8,573,420 bytes over 120 active writes**, then **578,608 over
eight recovery ticks** after reclaim. Total passive time was **1,799,999 ms over
36,002 calls** for 30 bodies (3,839,999 ms / 76,802 calls for 64). The local SQLite
directories were roughly 4.4–4.5 MB including runtime/WAL files; these are not
billable stored-state sizes. Production account cost remains unmeasured.
Evidence: `verification-runtime-{load,query-load}.json` in the task workspace.
The final run with explicit same-body, new-token, unchanged-equipment and
no-runtime-log assertions also passed (`verification-runtime-query-final.json`):
106 actors measured 37.091 / 40.427 ms active p50 / p95 and 28.975 / 31.578 ms
recovery p50 / p95. Write counts and serialized bytes were unchanged. The timing
variation reinforces that these local samples cannot establish production costs.

The renewed browser review leaves these integration requirements unresolved:

- `crew.control` changes activity/pose and `crew.relocatePlayer` clears hop,
  leap, jump credits, rocket/thrust, ladder and support state. `clankers.possess`
  reconstructs or clears drive velocity and releases reservations. Exact reclaim
  needs explicit validated capture/restore APIs, not calls to these existing paths.
- `remote-players.js` currently reconstructs Clanker display with `poseManaged`
  from the small `g` motion summary. Managed rigs also carry easing/phase, form,
  clipped coat/suit geometry and a reparented lab item. That summary cannot supply
  exact host rig projection or restore its coupled simulation. A full posed-rig
  representation and stable world/item references must precede client application.
- The current server pose frame accepts only the existing 112-float Ooga records.
  Clanker delivery must be version-negotiated and costed with #388/#389; silently
  treating a gorilla as an Ooga record or enlarging the frame cap is unsafe.
- #379 must provide the independent player/NPC track boundary; #464 owns reusable
  live-player equipment/pose presentation. The grace body needs that path for its
  free-arm/open-hand indicator and idempotent green-beam departure. Room's immediate
  voice/transport cleanup must remain separate from body retention.

No browser handoff or visual behavior was changed by this cost increment. It does
not make #377 ready. Tess remains excluded.

### Exact managed Clanker display projection

`agent.createPoseProjector(world)` now captures and applies the actual managed
rig through `clanker-pose.js`. It includes local transforms and Float32
quaternions, visibility, ground/lean transforms, scorch/ember/glow, native/living
color flags, ape/code geometry, clipped lab coats, office suits and their seated
legs, and the held vessel plus its glass-shell children. It does not reconstruct
animation from the small `g` movement summary. Application selects the existing
geometry, applies every transform and recomputes bounds without advancing time
or fitting the resting body again.

The explicit world id must identify the compatible world/assets revision. A
profile also checks scale, clothing configuration, suit color and clipping-mouth
coordinates; the exact node-parent layout must match. An external held item must
already be bound to both rigs by the world adapter under the same stable id.
Projection does not spawn, resolve or reparent shared items. Unknown attachments,
mismatched items/worlds/profiles, unsupported clothing, cycles, sparse/accessor
arrays, invalid numeric tails and future versions are refused before changing
the receiver. Each pose is bounded to 24 nodes, 24 scalar fields per node and
16 KiB serialized JSON. No event stream or firing/thrust input is included.

The browser-free test uses the actual Agent geometry, managed animation and
renderer matrix functions over 90 pose transitions, two follower rigs, a midway
rig reconstruction, and a fresh JS context with newly built geometry. It compares
selected meshes, palettes, clip planes, world transforms and pose bytes through
lab work, office seating, climbing, rolling, swimming, grooming, airborne poses,
held glass, invisible bodies and native-color transitions. Reapplying a snapshot
is idempotent. Rejected snapshots leave the receiver untouched. This proves the
projection/application path, not a browser/GPU test or full actor recovery.

`node worker/eval/clanker-pose.mjs` measures 53 actual managed rigs and two local
followers over 120 authored frames. The JSON representation reached **1,603
bytes for one actor** and **73,499 bytes for the roster**, with **8,771,044
serialized bytes** across the run. That exceeds the existing 32 KiB public
snapshot limit and also the roughly 57 KiB Ooga pose-frame limit, before adding
Oogas. A full-roster JSON packet is therefore not a viable delivery contract.
The limits were not increased and no new transport was enabled. Versioned
encoding and transport negotiation must be coordinated with #388/#389; raw JSON
cannot be passed to the existing Ooga publisher. The lossless packet increment
below fits this measured load without chunking or increasing the delivery cap.

Review removed repeated descriptor validation while walking already-validated
ancestor rows. The serial measurement after that change was 37.408 / 40.021 ms
p50 / p95 for projection, serialization and two applications together, with
5,191.974 ms total process CPU including source posing. Those local Node/VM
samples are not production CPU, network or billing figures. With the final
unknown-attachment guard, the serial run measured 40.807 / 44.522 ms p50 / p95,
5,712.515 ms total process CPU, and the same payload sizes. Evidence:
`verification-clanker-pose-cost-final-guarded.json` in the task workspace.

This is display state only: it does not preserve animation easing state for the
next authoritative tick, Clanker AI/controllers, velocity, health, jump credits,
inventory or reservations. `clankers.possess` is still unsuitable for exact body
reclaim. No automatic path calls the new API; authoritative Room delivery,
browser body reclaim, grace/free-arm and departure-beam rendering remain
unfinished. #379 independent tracks and #464 player presentation remain their
own work. Tess is excluded. No permanent runner or production action was added.

### Lossless bounded mixed-pose packets

`npc-pose-packet.js` adds a standalone complete-snapshot encoding for Oogas and
Clankers together. Its wire cap is **32 KiB**, unchanged from the public snapshot
budget. It has a separate **128 KiB** expanded-packet cap, at most **128 actors
combined**, the existing per-Clanker node/scalar bounds, and no previous-frame
dependency. Each packet can reconstruct a late join or reconnect on its own.
It does not accumulate chunks, history, previous dictionaries or per-client
queues. An oversized or incompressible snapshot is refused as a whole; no actor
is omitted and no cap is increased automatically.

Ooga records remain their original binary bytes. Clanker scalars use exact tags
for zero, one, minus one and negative zero, Float32 only when exactly representable,
and Float64 otherwise. A bounded byte compressor uses one candidate per hash and
at most 64 KiB of backwards history. It is dependency-free and linear in bounded
input/output work. Expansion checks literal lengths, backwards distances,
overlapping copies, exact output size and complete input consumption. A
noncryptographic checksum detects accidental corruption; it is not authentication
and must be enclosed by the existing authenticated/fenced authority contract.
Decoded poses still pass their semantic and rig-profile validation. The codec
does not infer body ownership or execute events.

Mixed-load checks preserve all Ooga bytes and every Clanker scalar exactly,
including negative zero; reconstructed packets are canonical. Actual follower
rigs match the source transforms after decoding. Corrupt headers/checksums,
truncated blocks, invalid backreferences, oversized expansion, duplicate actors,
wrong worlds, actor-count overflow, and incompressible valid legacy records are
refused. A 128-Clanker boundary case decodes; a highly compressible input whose
expanded state exceeds the cap is refused before compression. Invalid frames
cannot poison subsequent independent frames.

The finite evaluator now includes 53 Oogas through the actual pose encoder and
53 actual managed Clanker rigs, two local receivers and 120 frames. Its varied
case uses distinct headings/phases, all suit colors and eight bound vessels:

| Measurement | Varied 106-actor fixture |
|---|---:|
| Largest compressed complete packet | 7,918 bytes / 32,768 cap |
| Largest expanded packet | 66,736 bytes / 131,072 cap |
| Total compressed bytes, 120 packets | 919,749 |
| Raw Clanker JSON alone, largest frame | 75,181 bytes |
| Projection, encode, decode and two applications, p50 / p95 | 44.139 / 47.687 ms |
| Total process CPU including source posing | 6,153.102 ms |

An earlier more repetitive fixture peaked at 3,434 bytes; it is not the sole
capacity evidence. These are authored local Node/VM loads, not full NPC AI,
production physics, browser/GPU, network or billing measurements. Ooga rigs in
the cost fixture are authored DTOs using the real encoder. No affordability or
general worst-case compression claim follows; refusing high-entropy overflow is
part of the contract. Evidence: `verification-mixed-packet-{cost,varied-cost}.json`
and `verification-mixed-packet-{first,review}.log` in the task workspace.

The codec is loaded but not enabled for live delivery. The preview negotiation
below makes the format explicit; the existing host publisher and browser still
use only Ooga frames. In particular, browsers must freeze independent Clanker
AI before applying server poses, resolve held-item ownership, and preserve the
separate player movement/voice paths. The new codec alone does not complete
Room/client integration, full actor recovery, exact player reclaim or disconnect
visuals. Those requirements remain open; #377 is still draft and Tess is excluded.

### Mixed Room capability preview, still disabled

Room's internal mixed preview requires both `VIRTUAL_HOST_PREVIEW=1` and
`VIRTUAL_HOST_MIXED_PREVIEW=1`, an explicit `format: "mixed-1"` acquisition, and
every occupant advertising `?npc-authority=2`. Neither flag is set in a deployed
configuration. The browser still advertises version 1; loading the codec does
not opt it in. Version 2 clients must also understand version 1. Unknown client
versions and incompatible replacement sockets are refused before evicting the
existing connection. Occupant checks run inside the authority transition gate.

The durable assignment and authority envelope use version 2 for mixed data,
with format, revision, world and epoch bound to the assignment. Legacy version 1
records remain readable; unknown or incomplete records fail closed. A format
cannot change within a revision or with a stale owner. Mixed packets must decode
within the existing bounds and name the assigned world. Legacy Ooga payloads
cannot be published into a mixed assignment. The legacy `poses` validator stays
unchanged; format dispatch does not recursively invoke the mixed decoder.

The existing 250 ms publication interval, 32-viewer cap, one latest durable frame
and one outstanding credit per socket remain. Room caches one checked envelope
for the latest committed frame, so fanout does not decompress/wrap once per
viewer. Replacement clears that cache; no intermediate frame queue is retained.
Failed writes emit nothing. Duplicate publications compare exact bytes, including
after lease expiry. Repeated hibernation wakes retain outstanding credit, and a
late join receives the complete latest snapshot. Removing the preview flags
retains the authority fence and readable committed snapshot; a deliberate release
can return to version 1 without re-enabling mixed publication. Older builds must
receive that explicit release before rollback.

Review found that an incompatible newer descriptor could leave the browser's
older compatible parser eligible to accept stale frames. The browser now clears
its retained frame and refuses both stale and unsupported frames while the
incompatible fence is latched; it acknowledges neither. Only a newer compatible
descriptor clears the fence. This does not enable mixed browser rendering.

The actual Room and codec test uses 53 Oogas, 53 managed Clankers and 32 mocked
sockets. Its first 2,628-byte packet delivers 85,120 bytes including 32-byte
envelopes, with one envelope validation for the entire fanout. It checks the
33rd-viewer refusal, two exact decoded receivers, actual selected follower rig
parity, late join, reconstruction, failed writes, lost replies, replacement,
stale tickets, unknown formats and explicit release. This repetitive integration
fixture does not replace the more varied 7,918-byte cost fixture above, nor does
it measure real socket buffers, Durable Object CPU or production costs.

This increment does not connect `publishHostPoses` to the mixed format. Actual
headless Clanker simulation, the browser's Clanker ownership gate, shared item
identity, exact browser body reclaim, grace/open-hand and beam visuals remain
required before client opt-in. No production resource, timer or permanent loop
was enabled. Evidence: `verification-mixed-room-{first,review,fanout,host,compat}.log`.

### Managed animation continuation and aggregate capacity

`agent.createManagedCheckpoint(world)` now captures/restores the actual managed
Clanker rig's animation state as well as its display pose. `clanker-state.js`
uses versioned ordered fields, exact finite numbers, explicit unset/NaN walk-phase
sentinels and signed-zero tags that survive JSON. It retains easing, stride,
grooming, rolling, office hand targets, lab grip, clothing/form and the pose used
by the next `poseManaged` step. Held items and pickup benches require matching
world-owned identity bindings; no reference, callback, route or geometry is
serialized. Unsupported standalone routes, preview-only items, unknown fields,
bad bindings and malformed state fail before target mutation. Restore rebinds
the roll/item quaternion buffers used by subsequent animation and recomputes
bounds without moving the body. No live caller uses this API yet.

This is **rig animation continuation**, not the outer Clanker AI or complete
player body. It does not grant ownership, restore health/reservations or replace
the authenticated Room body outbox. Exact browser reclaim still needs its own
complete controller/body codec and an admission profile that actually fits.

Tests run 144 real animation steps with repeated fresh JS contexts, held glass,
bench rebinding, lab/office transitions, climbing, rolling, swimming, grooming,
airborne/landing, squeezing, form changes and animation triggers. Continued
poses and collision bounds match the uninterrupted source; restore is idempotent.
The first run caught a valid `undefined` walk phase missing from the codec. Its
explicit sentinel fixed the source error and the same check passed. No threshold
was relaxed. The roster codec packs all poses together through the existing
lossless packet format and keeps animation columns separate, with a **64 KiB**
roster cap and **24 KiB** per-rig cap; the host's own limits are unchanged.

A finite 120-frame experiment with 53 varied actual rigs, eight bound vessels
and the existing authored work/flight fixture measured:

| Measurement | Local result |
|---|---:|
| Raw animation roster peak | 102,200 bytes |
| Roster with packed poses | 36,561 bytes |
| Roster through existing storage packer | 37,074 bytes |
| Capture, pack, storage round trip and rig restore, p50 / p95 | 152.785 / 156.515 ms |
| Combined 106-actor fixture plus animation, raw peak | 182,846 bytes |
| Combined JSON-tree nodes / existing cap | 17,644 / 13,000 |
| Combined checkpoints refused | 120 / 120 |

**The original representation blocked combined admission.** The animation roster fits alone; adding it to
the current 106-actor fixture does not fit the existing representation. It is
not valid to add these records to the previously measured 72,633-byte host
checkpoint or claim its former margin still holds. The experiment deliberately
retains all byte/node limits. Further representation/storage work and full-body
budgeting are required before activation. Timings exclude assertion/display
comparison from the listed path; total process CPU, including world/rig steps
and verification, was 27,192.624 ms. These Node/VM results are not billed DO CPU,
production duration or an affordability claim. Evidence:
`verification-continuation-cost-final.json` in the task workspace.

### Compact checkpoint redesign: explicit opt-in, still inactive

The subsequent storage increment addresses that measured overflow without raising
the 13,000-source-node, 256 KiB expanded, 64 KiB simulation or 96 KiB total host
limits. `clankerState.packRoster(world, records, true)` selects roster version 2:
fixed-schema sparse scalar rows omit only defined defaults and encode exact
float32/float64 values, signed zero and explicit unset sentinels. Its bounded
base64 chunks use the same complete pose packet. Version 1 remains the default
and readable. Unknown versions, malformed scalar indices, noncanonical numeric
tags/padding, duplicate actors and truncated/chunk-overrun data are refused.
Each row expands to a fixed number of animation fields; no dynamic dictionary or
run-length instruction can amplify it. This does not remove any actor state.

`createCheckpointPack(bytes, { intern: true })` and the matching
`compactSimulation` option explicitly select checkpoint version 2. The world
version changes from `pack1-...` to `pack2-...`; existing worlds cannot silently
switch or roll back. Source validation retains every existing structural bound.
Up to 128 repeated scalar values share a dictionary; the tree uses tagged exact
IEEE numbers, UTF-16 strings (including lone surrogates) and bounded array/object
records. Strings/fields are data only. The decoder charges each original node,
depth and expanded JSON byte count before allocating its subtree, including every
dictionary occurrence and repeated property name. Wire bytes are bounded before
decoding; neither metadata nor session reservations are borrowed. The opt-in
reader accepts old version 1 records; the default reader refuses version 2.

Profiling found repeated pose descriptor validation dominating the rig path.
Only fully validated, deeply frozen pose/continuation snapshots now reuse private
weak validation records. Mutable copies still undergo full validation. No actor
or historical frame is retained by a strong global cache; capture/decode remains
independent of previous frames. Default display capture stays mutable; continuation
capture and roster decode return immutable snapshots.

A 120-frame varied workload now uses distinct Ooga RNG seeds, starting positions
and work phases, distinct Clanker flight trajectories, 53 varied actual rig poses
and eight held vessels. This avoids relying on 53 copies of one controller state.
It measured **12,412 nodes** and **51,343 stored bytes**, with **0/120 refusals**:
14,193 bytes remain in the declared 64 KiB simulation profile. Rig capture,
packing, storage round trip and restore measured **61.476 / 64.600 ms p50/p95**;
the combined controller/rig storage round trip separately measured
**8.527 / 11.164 ms**. Do not add percentiles or interpret these authored Node
measurements as production CPU or billing. Earlier textual interning still failed
the varied byte budget; the binary representation supersedes those intermediate
results. Evidence: `verification-storage-binary-varied.json`.

The actual VirtualHost test combines 106 varied controllers, 53 managed rigs and
30 retained sessions, checks the 31st admission refusal, failed-write rollback,
fresh host reconstruction, old-world refusal, exact animation capture, same-body
reclaim at 59,999 ms with unchanged equipment and the other 29 expiry intents.
It preserves simulation state throughout outage recovery without replaying NPC
decisions. The measured host checkpoint peaked at 66,460 bytes in that fixture.
Twelve serial successful host ticks, including validation and storage packing
but excluding assertions, measured **149.919 / 158.738 ms p50/p95** locally.
That cost is substantial within a 250 ms tick period; it is not evidence that an
always-on production host is affordable. The smaller rig-only timings above
must not be substituted for the full host operation. Evidence:
`verification-storage-host-cost.log`.
Storage remains mocked here; this is not an abrupt workerd or production test.
Neither outer AI nor complete player body state is represented. The remaining
588 source-node margin and measured byte margin must be reassessed when those
states and real world geometry are included. **Activation remains blocked.**

### Transaction-local checkpoint reuse and measured tick cost

`compactSimulation.forTransaction()` supplies a fresh scope inside every storage
callback, including automatic retries. It retains one deeply frozen decoded view
per unchanged packed object. Frozen wire children and exact own-field identity
checks prevent a changed record from reusing that view. Read-only validation,
ownership queries and pose projection share it; steps and accepted handbacks work
on private mutable copies, pack within the existing limits, then replace the view.
Rejected handbacks discard their edits. Old read phases keep their frozen view;
all scopes and queries close after success or failure. Nothing survives a retry
or becomes a global actor cache. Adapter validation and queries must remain pure,
synchronous functions of checkpoint data and the versioned static world.

Scalar size checks now count the UTF-8 JSON representation without creating a
byte array per scalar. Numeric boundaries, valid surrogate pairs, lone surrogates
and a deterministic sweep of UTF-16 combinations match TextEncoder exactly.
No checkpoint format, node/byte limit, session reservation or activation gate
changes. Committed pose reads also reuse the validated frozen view, while legacy
adapters keep their defensive-copy path.

In consecutive serial runs of the same 106-controller / 53-rig / 30-session
fixture, the published baseline measured **152.124 / 157.498 ms p50/p95**, and
this change measured **138.533 / 147.625 ms** (12 ticks each, identical Node flags).
That is about 6.3% lower p95 in this small local comparison, not a production
guarantee. An earlier baseline sample had a 683.008 ms p95 outlier; it is retained
in the evidence rather than attributed to this code. Another optimized run was
147.614 ms p95. The previous 158.738 ms measurement remains historical.
Checkpoint sizes are unchanged at 66,460 total / 51,236 simulation bytes. These
are wall-clock timings with mock storage; actual DO CPU, complete AI/body state,
world geometry, memory residency and account costs still need validation.
Evidence: `verification-host-tick-{matched,confirm}-{before,after}.log`.
**Activation remains blocked; this modest optimization does not clear the gate.**

### Committed mixed-frame publication, still an explicit preview

`VirtualHost.poses(ticket, {format: "mixed-1"})` and `publishHostPoses` now accept
an explicit mixed-format request. The simulation adapter receives that format
when projecting its committed state; the host validates the complete packet,
world identity and bounded codec before any Room mutation. Omitting the option
preserves Ooga-only publication. Loading the codecs does not opt in any caller.
The coordinator checks Room's format as well as ownership, including lost-reply
reconciliation. A format change cannot occur inside the same authority epoch;
it requires a separately fenced migration. Both Room preview flags and compatible
occupants remain required. No browser advertises the new capability.

The integration test uses the actual host, compact checkpoint, managed Clanker
animation and Room with authored trajectories and mocked storage/sockets. Its
53 Oogas / 53 Clankers survive failed host writes, lost publication replies,
host/Room reconstruction, late join and owner replacement. Two clients receive
identical complete frames; a stalled client retains one credit. A reconstructed
Clanker matches the host's actual display transforms. Wrong worlds, unknown
formats and an in-place downgrade are rejected. In this fixture the packet was
5,235 bytes and the checkpoint 17,796 bytes; **these exclude full controllers,
player sessions and world geometry** and must not replace the larger capacity
measurements above. Publication never advances animation or replays actions.

This closes the committed mixed-frame coordinator gap. Live scene authority
freezing, full controller/body restoration, held-item binding, the browser's
capability advertisement and disconnect presentation wiring remain unfinished.
The renderer tests are headless scene-transform comparisons, not browser/GPU or
production validation. Activation stays disabled and #377 remains open.

### Combined local runtime cost and revision confirmation

`worker/eval/host-cycle.mjs` runs a finite local workerd/SQLite host plus the actual
Room RPC and WebSocket path. The bundle uses the actual managed rig/geometry code
without a DOM; only its evaluator build maps `window` to `globalThis`. It supplies
an authored cast, collision world, simulation clock, Ooga display templates and
pilot/crew constants. No deployed file or environment gets that shim or preview
configuration. The workload has 106 partial controllers, 53 managed Clanker rigs,
30 retained sessions and 32 viewers for 12 measured cycles. One viewer withholds
acknowledgments; the others validate persistent authority and sequence state.
The evaluator also checks failed-write rollback, identical observer bytes,
orderly workerd/SQLite reconstruction, timely same-body registry reclaim with
unchanged inventory, stale-host rejection and an exact retained late-join frame.
It does not perform browser body reclaim or prove the complete NPC world.

The follow-up evaluator extends this restart through actual Room reacquisition:
bounded passive recovery and NPC catch-up, refusal of implicit acquisition, the
existing Room lease's real wall-clock expiry, explicit newer-epoch acquisition,
new-revision delivery, independent rejection of old host and Room tickets, rejection
of an old-revision ACK, continued delivery and exact subsequent late joins. The
stalled observer receives one frame in the new revision and remains bounded after
the stale ACK. This does not simulate authenticated browser body commands.

Both the two-actor smoke scenario and the full 106-actor/53-rig/30-session/32-viewer
scenario pass. In the full scenario, five catch-up operations advance eight fixed
NPC steps each after a 10,001 ms authored outage. Their local wall times are
244.929, 204.275, 195.473, 202.588 and 193.491 ms. The first uses 1,934 passive
substeps after prioritized reclaim; every operation stays within the existing
4,096 passive / eight NPC-step limits. The original deadlines remain unchanged.
The separate real Room lease wait is 8,591.899 ms; total recovery/check/delivery
scenario time is 10,190.078 ms. This is a bounded correctness measurement, not a
production recovery-latency guarantee. Host simulation time remains authored;
Room time is real, and neither lease is shortened for the test.

That extended run's steady-cycle p50/p95 is 136.671/162.426 ms, demonstrating the
variation around the matched comparison below. Checkpoint and packet maxima stay
67,156 and 6,359 bytes. Added recovery operations bring scenario totals to 24
attempted host writes / 1,530,722 serialized bytes and 409 binary envelopes /
2,234,172 bytes. These totals describe the extended scenario, not the shorter
baseline/optimized comparison. Evidence: `verification-cycle-reacquire-{smoke,full}.json`.
There were no assertion failures, external requests or console logs.

Phase measurement identified publication as the larger cost. `confirmPoses`
now re-reads and validates committed storage, checks ownership/lease/run deadlines
and pending body recovery, and compares revision, logical time and run deadline.
The coordinator uses this after Room RPCs instead of projecting the same immutable
revision a second time. Every persisted mutation increments revision; pure,
versioned projection remains required. The original frame and Room's independent
packet/ownership checks are unchanged. A commit during the RPCs returns
`superseded` without sending the older frame. This is still not an atomic commit
across two objects. A publisher paired with an older host lacking revision
confirmation refuses before configuring Room; it never falls back to browser AI.

Consecutive final baseline (`383b23a4`) and changed runs on Node22.23.4/macOS arm64,
Miniflare5.20261001.0-alpha/workerd1.20261001.1 measured:

| Local wall time | Baseline p50 / p95 | Changed p50 / p95 |
| --- | --- | --- |
| Host tick | 40.647 / 63.757 ms | 43.062 / 56.308 ms |
| Publication | 105.710 / 115.087 ms | 85.905 / 98.984 ms |
| Paired tick + publication | 146.366 / 173.888 ms | 128.825 / 152.938 ms |

Paired totals are measured per cycle, not sums of percentiles. A previous matched
comparison measured 166.280→161.339 ms combined p95; the initial comparison was
174.727→158.630 ms. The consistent reduction in publication work is supported by
a regression requiring one projection, but these small samples do not establish
a guaranteed speedup. The older 147.625 ms Node/mock tick result is a different
runtime/fixture and must not be compared directly with these numbers. Local times
include dispatch, SQLite, RPC, diagnostic responses and observer validation sharing
one Node process. They are not isolated DO CPU or billed duration. Conservative
Room rate-limit pacing is reported separately; this is not a demonstrated sustained
4 Hz whole-world loop. The cached runtime differs from the declared Wrangler range.

Both final runs retain the same 67,156-byte maximum host checkpoint and 6,359-byte
maximum packet. They deliver 2,212,188 binary bytes in 405 envelopes across the
bounded scenario (including initial/late-join frames); control/ACK bytes, browser
rendering and voice are excluded. There are 18 attempted host writes / 1,139,635
serialized bytes, including the intentionally rolled-back write. Those are
logical instrumentation counters, **not billed storage writes/bytes**, and do not
include Room's writes or platform overhead. Peak isolate memory, physical-phone
cost and actual account usage remain unmeasured. No external request was attempted;
no dependency was installed, account configuration read, resource provisioned or
production loop enabled. Temporary SQLite and processes are disposed afterward.

Run with `HOST_RUNTIME_PACKAGE` pointing to an already installed Miniflare package;
`--smoke` uses two actors and two viewers. `HOST_CYCLE_SOURCE` may name local copies
of exactly `virtual-host.js` and `host-room.js` for the baseline. The output records
source hashes, environment, individual timings, assertions and failures. Runtime
operations have 15-second timeouts and socket waits have 5-second limits. The
initial evaluator build needed its synthetic cast import resolved explicitly;
no assertion failed. Evidence: `verification-cycle-final-{before,after}.json` and
`verification-cycle-{full-host,unit,build}.log`. Local checks:107host,408unit,
320-script build. Existing Hub/browser STOP restrictions remain unchanged.

**Activation remains blocked.** Full outer AI/world state, independent-track
integration (#379), complete body/occupancy capture and direct browser restore,
shared player presentation (#464), live disconnect effects, locked-runtime memory
and combined production/account costs are still required. No limit or reservation
was raised, and Tess remains excluded.

### Actual outer Clanker controller: state and cost boundary

`worker/eval/clanker-world.mjs` now runs the existing `clankers.create/update`
controller and actual managed rigs in a finite Node VM, not an extracted walker
or flight substitute. Synthetic Ooga owners stand in an authored empty flat
meadow with no caves, lab, office, sleeping, rage or production collision world.
Initial rest timers are zero so the real planner chooses outings. No gameplay
default changes. Each update retains the existing 250 ms / 1/30 s substep behavior;
the authoritative scenario uses no camera-based animation throttling.

The default controller meadow dimensions admitted only 37 of the 53 entries.
The explicit `--spacious` scenario uses a radius-60 meadow and admitted all 53;
it is a load case, not the production island. Over 120 updates / 30 simulated
seconds, 36 versus 52 actors moved and chose new destinations; 31 versus 51
planned paths. These active counts must accompany performance claims.

The exposed state inventory contains 145,485 visited values, 110,293 typed-array
values occupying 851,180 bytes, 53 random streams and nonfinite sentinels and
actor references. Its diagnostic JSON is 811,159 bytes in the crowded case and
817,530 bytes in the spacious case. This is **not a restorable checkpoint or an
encoded-size measurement**. It excludes closure-owned clocks, planning cursors,
portal/office/lab reservations, owner state and geometry. A naive generic capture
cannot satisfy the current node/byte bounds; fixed controller schemas must
distinguish durable continuation from reproducible scratch and bind references
to versioned world identities before a storage profile can be selected.

`checkpointRandom: true` on the existing Clanker constructor opts its existing
per-actor stream into the already-supported RNG continuation word. Default
browser construction is unchanged. Tests compare actual AI choices and managed
animation across repeated capture/replacement against the ordinary browser
stream. They bind identical initial managed-rig checkpoints because `agent.js`
separately initializes `idleFor` with `Math.random`. Capturing the AI word alone
does not restore full controller or rig state.

Profiling the crowded case identified repeated torso-profile selection in peer
collision queries. `agent.torso.radius/offset` now select that profile once per
call. They retain the exact priority and capsule formulas, without a cache across
calls or changes to poses, contact admission or AI. A pinned original-code fixture
checks every planning/compact flag combination and scale plus actual animated
rigs. Consecutive serial before/after measurements on Node22.23.4/macOS arm64:

| Authored scenario | Before update p50 / p95 | After update p50 / p95 |
| --- | --- | --- |
| Crowded, 37 active of 53 entries | 34.696 / 208.218 ms | 30.221 / 150.971 ms |
| Spacious, 53 active entries | 79.056 / 127.966 ms | 62.740 / 87.168 ms |

Activity/movement/path counts and diagnostic sizes match in each pair. These are
small local VM wall-time samples including execution-timeout overhead, not DO CPU
or production cost. They cannot be added to the earlier partial-controller
percentiles. Run `node worker/eval/clanker-world.mjs [--smoke] [--spacious]`;
`CLANKER_AGENT_SOURCE` may name a saved local `agent.js` for comparison. Source
hashes and individual timing rows are recorded. No dependency, API call, account
configuration, renderer or permanent loop is used.

Evidence: `verification-clanker-torso-{crowded,spacious}-{before,after}.json`
and `clanker-world-crowded.cpuprofile`. The first smoke fixture incorrectly
required path planning on an unobstructed direct route; it now observes actual
destination changes and includes the lounge departure interval. The first RNG
parity fixture had different random initial rig state; binding the existing rig
checkpoint corrected it. No gameplay threshold or STOP-restricted check changed.
Local validation passed 109 focused host/recovery tests, 408 unit checks, the
320-script build, seven changed JavaScript/module syntax checks and whitespace
validation. Hub/full/browser checks remain unrun under the unchanged STOP ledger;
these local results do not establish live scene or device correctness.
Full world checkpointing, exact browser body restore and live disconnect effects
remain unfinished; activation is disabled and Tess is excluded.

### Fixed Clanker typed-buffer continuation, not a full world checkpoint

`worker/src/clanker-buffers.js` captures the twenty existing per-entry typed-buffer
fields under a fixed versioned schema. It preserves every byte, including inactive
path tails, negative zero and nonfinite sentinel bits. It does not infer scratch
from a path's active count. The stored representation has one optional-allocation
mask per actor followed by sorted field/block/hex triples; zero blocks and trailing
zero bytes are implicit. Omitting empty per-field arrays avoids consuming over a
thousand generic checkpoint nodes for a 53-entry roster. No executable schema,
property path, constructor or allocation length comes from storage.

The component binds exact ordered owner IDs, world version and native byte order.
It refuses incompatible layouts, debug-sized climbing paths, allocated rage-search
workspaces, shared buffers, malformed/duplicate blocks and capacity overruns.
Restore validates the whole payload before allocating fresh typed buffers and
never mutates a live controller. Optional rage roster arrays retain the distinction
between null and allocated zero-filled buffers. Capturing these arrays does not
restore rage's separate controller/closure state.

Admission is capped at 53 entries, 32 KiB encoded JSON and 1 MiB expanded typed
storage. These are **component refusal limits**, not a reservation in the world's
64 KiB profile or an increase to generic packing's 13,000-node / 256 KiB expanded
JSON limits. The typed allocation has its own explicit bound; aggregate isolate
memory is still unmeasured. Dense legitimate paths can exceed component admission,
and tests require refusal rather than truncation. A complete world must guarantee
its supported profile fits before activation; these meadow samples do not do so.

`node worker/eval/clanker-buffers.mjs [--smoke] [--spacious]` measures capture,
generic packing and JSON round-trip restoration between actual controller updates.
Each full run advances 120 updates / 30 simulated seconds and checks thirteen
snapshots, including initialization. Every decoded buffer is byte-compared and
installed for the next real AI update. Results on Node22.23.4/macOS arm64:

| Scenario | Component JSON / generic-packed bytes, max | Component nodes, max | Capture p50 / p95 | Unpack + restore p50 / p95 |
| --- | --- | ---: | --- | --- |
| Crowded, 37 active / 53 entries | 2,669 / 3,023 | 258 | 0.690 / 4.037 ms | 0.398 / 0.847 ms |
| Spacious, 53 active entries | 3,746 / 4,152 | 315 | 0.729 / 4.103 ms | 0.417 / 0.840 ms |

Both restore 851,180 typed bytes exactly. Generic packing p95 is 0.536 / 0.533 ms.
With thirteen samples, p95 is the maximum and includes cold initialization. The
actual controller retains its other state throughout this evaluator; this is
**not a host restart**, a full-world checkpoint or a production cost measurement.
No timing is added to an unrelated fixture's percentile. Evidence:
`verification-clanker-buffers-sparse-{crowded,spacious}.json`.

Focused tests compare repeated persisted buffer replacement against uninterrupted
actual Clanker AI and managed-rig animation, check source layout coverage and exact
unusual bit patterns, and refuse malformed/oversized profiles. The host CI lane
includes the new tests. No production caller imports the codec yet.

Extending beyond the restricted roaming profile below still needs complete world
schemas, stable owner/item/geometry bindings and portal/lab/office/bed reservations.
Restoring those together must
precede exact browser body reclaim and live disconnect presentation. Existing
`possess`/`travel`/`control` entrypoints reset relevant state and remain unsuitable
as restore APIs. Room authentication, body generation and durable departure ACKs
must bind that eventual restore. Combined storage/CPU/memory and account billing
remain unvalidated. Tess is excluded and activation remains disabled.

### Actual roaming-controller restart, restricted and inactive

`worker/src/clanker-roaming.js` now checkpoints the actual Clanker controller for
an explicitly limited `roaming-1` profile. It composes source-owned scalar defaults,
the typed-buffer component, per-actor RNG, managed rig/pose continuation and fifteen
closure clock/scheduler values. Actor references rebind by ordered identity to the
new controller's entries. Unknown source fields or changed boot defaults refuse
recovery; no executable schema is accepted from storage. A baseline checksum
detects accidental layout/default/static-world mismatches. It is not authentication:
the enclosing host must still bind an explicit simulation/world implementation
version and authenticated ownership.

The profile permits only static meadow adapters and chilling owners; fixtures
provide synthetic owners.
Caves, work, sleep, combat/rage, debug climbing, player control, remote ownership,
held world items and unsupported context callbacks are refused. Browser callers
do not enable it. Explicit profile construction produces dormant rigs; a new world
calls `sync()` to initialize, while recovery applies its committed bodies directly.
Ordinary browser construction still activates normally. This avoids choosing
temporary spawn positions, reservations and random outings just to overwrite them.
Static lounge candidates are reconstructed and included in the baseline binding.

Restoration is allowed only on a fresh controller before advancing or publishing.
Decode validates the bounded checkpoint structure first. If application fails, the
adapter becomes unusable and the transaction must discard that controller. The
host test deliberately constructs a fresh controller for each operation, injects
a failed write, retries from committed state, replaces ownership after lease expiry,
performs bounded catch-up and compares against uninterrupted actual AI. It also
refuses the old owner's ticket. Separate tests repeatedly replace the full VM,
checking exact subsequent scalar state, paths, self/peer bindings, RNG and animation.
This is actual **supported roaming recovery**, not just component replacement.

`node worker/eval/clanker-roaming.mjs [--smoke] [--spacious]` measures that same
restricted controller over 127 updates / 31.75 simulated seconds. Seven periodic
restart checks are followed by seven complete cold-construction / restore / actual
step / capture operations. Each result matches the uninterrupted controller.
The complete-cycle timing is measured as a pair, not summed phase percentiles.
Final serial Node22.23.4/macOS arm64 observations:

| Scenario | Max packed checkpoint | Max expanded JSON nodes / bytes | Complete local cycle p50 / p95 |
| --- | ---: | --- | --- |
| Crowded, 37 active / 53 entries | 43,705 bytes | 4,932 / 55,901 | 135.430 / 228.531 ms |
| Spacious, 53 active entries | 59,508 bytes | 6,485 / 74,569 | 153.588 / 164.383 ms |

The existing 64 KiB storage, 13,000-node and 256 KiB expanded-JSON limits remain
unchanged. Seven timing samples make p95 the maximum. An earlier complete-cycle
pair measured 243.109 / 163.736 ms p95, demonstrating variation, not a guaranteed
margin. Both final cases rebuilt cold controllers in at most 40 ms versus roughly
200–243 ms before dormant construction. Capture p95 was 33.171 / 34.308 ms;
restore p95 was 37.754 / 38.876 ms. The evaluator's periodic process observations
reached 56.3 / 48.0 MB JS heap and 158.1 / 149.5 MB RSS. These include multiple
Node VM contexts and tooling, are not high-water marks, and do not establish a
Durable Object's isolate memory or billed duration. Data, source hashes and each
sample are in `verification-clanker-roaming-complete-{crowded,spacious}.json`.

**Activation remains blocked.** The spacious sample leaves only 6,028 bytes in the
reserved world budget for everything outside this Clanker profile. The crowded
cycle approaches a 250 ms step before Ooga AI, full island collision, SQLite or
Room delivery. Neither this sample nor the earlier component margins establish a
safe full-world storage or CPU profile. Do not reduce session reservations or raise
limits based on these short runs. The 30-retained-session / 32-viewer boundary is
unchanged. General work/sleep/world state, live Worker/Room adapter integration,
exact browser body restoration and live disconnect presentation remain unfinished;
production CPU/memory/account cost remains unvalidated. No live capability,
deployment, resource, permanent loop, movement/voice boundary or Tess behavior
changes. The test lane includes the new roaming recovery tests.

Local verification passed 116 host/recovery tests, 408 unit checks and the
320-script build. The Hub STOP ledger remains unchanged; no browser/full suite
was rerun. Evidence: `verification-clanker-roaming-{full-host,unit,build}.log`.

### Restricted roaming through local SQLite and Room

The follow-up adds an explicit `--roaming` mode to the finite `host-cycle.mjs`
evaluator; `--spacious` enables the complementary all-active scenario. The
original partial-roster workload remains the default. This mode uses the actual
restricted outer Clanker controller for both simulation and exact mixed-pose
projection, with SQLite host checkpoints and real Room RPC/WebSocket delivery.
`clanker-roaming-simulation.mjs` lives under `worker/eval/`, has no deployed
import/binding. Its first version created a fresh disposable controller for each
operation; the measured transaction-scoped follow-up is described below.
Failed writes and retries cannot retain speculative actor state. Its world
version binds the actor count and authored meadow profile. Each mutation captures
and checks the existing packed limits before replacing the caller's state.

The focused test compares uninterrupted actual AI against this adapter, including
discarded speculative steps, exact subsequent checkpoint and rig packet bytes,
public coordinates, changed-world refusal and operation isolation. Synthetic
chilling owners are not player accounts: `npcFor` and `handoff` deliberately
offer no player-body restoration. Retained session bodies still use the separately
authored passive-collision mesh. These results do not prove a common island world.

Each representative run advances 120 measured single-step cycles, then persists
and reconstructs workerd, catches up a 10,001 ms authored outage in five eight-step
operations, reclaims the registry body and explicitly reacquires Room authority.
Final simulated time is 40.25 seconds. All 32 observers agree on committed frame
bytes; one withholding ACKs remains at one outstanding frame. The tests also
retain the original deadline/equipment, reject stale host/Room tickets and ACKs,
and verify resumed delivery and exact late joins. Existing limits remain unchanged.

Before transaction-scoped reuse, serial local observations on Node22.23.4/macOS arm64, cached
Miniflare5.20261001.0-alpha/workerd1.20261001.1:

| Scenario | Whole host checkpoint max | Packet max | Tick + publication p50 / p95 | Eight-step recovery range |
| --- | ---: | ---: | --- | --- |
| 53 entries, 37 active, crowded | 59,833 bytes | 6,802 bytes | 158.978 / 202.409 ms | 301.979–361.858 ms |
| 53 entries, 53 active, spacious | 75,439 bytes | 8,464 bytes | 163.564 / 178.813 ms | 253.711–301.355 ms |

Both retain 30 sessions and use 32 viewers. The checkpoint figures include host
metadata and sessions; they are not available simulation capacity. The world
still has a reserved 64 KiB limit. All 120 active timing samples exclude the
separately reported Room pacing wait. This is a paced finite correctness workload,
not evidence of sustained four-Hz production throughput or bounded billed CPU.
Whole scenarios attempt 132 host writes totaling 7,339,733 / 8,623,647 serialized
bytes (including an injected rolled-back write), and deliver 3,757 binary envelopes
totaling 21,332,327 / 28,638,340 bytes respectively. These are diagnostic byte
counts, not SQLite row charges, WebSocket billing units or account costs.

Evidence: `verification-roaming-runtime-{smoke,crowded,spacious}.json`; no assertion
failure, console log or external request. The actual adapter's five focused tests
pass in `verification-roaming-runtime-test.log`. The original partial-roster smoke
case also passes (`verification-roaming-runtime-compat.json`). The 320-script
build, five JS/MJS syntax checks and whitespace pass; the Hub STOP ledger is
unchanged and no browser/full suite ran. Runtime source hashes are included
in each result. Cached runtime versions still differ from the declared Wrangler
range; orderly reconstruction is not abrupt eviction. There is no authenticated
browser body command/reclaim or live disconnect presentation, Ooga AI, full island,
work/sleep/combat/reservation recovery, browser rendering, production memory or
account-cost validation. The original per-operation reconstruction exceeds one
250 ms step during recovery; the transaction-scoped follow-up below addresses
that measured cost without claiming full-world safety. Activation stays off;
Tess remains excluded and no permanent loop or production resource is enabled.

#### Reuse only inside a storage transaction attempt

The roaming evaluator adapter now implements the host's existing `forTransaction`
contract. A scope restores one private controller and keeps it through that
attempt's fixed steps, validation and projections. Every individual step still
performs a bounded checkpoint capture before assigning its result. Frozen wire
children and exact property identities bind the private controller to its current
DTO; replacing fields or passing another DTO reconstructs from that checkpoint.
No JSON hash or cross-request actor cache is used. Errors poison and dispose the
scope; storage completion, rollback and each optimistic retry also dispose it.

The added regression checks eight-step recovery allocates one controller, exact
checkpoint/pose continuation against uninterrupted AI, deep freezing beneath an
already shallow-frozen input, replacement of fields on the same DTO, rejection
after malformed state or private-step failure, failed durable commit, a discarded
optimistic attempt and owner replacement. A first test caught nine constructions
instead of one: assignment happened after the scope remembered the old fields.
Moving assignment inside the operation fixed the cause without changing limits.

Serial reruns of the same 120-cycle local SQLite/Room scenarios:

| Scenario | Tick p95 | Tick + publication p50 / p95 | Five eight-step recovery operations |
| --- | --- | --- | --- |
| Crowded, 37 active /53 entries | 75.952 ms | 124.304 /158.239 ms | 172.701–203.807 ms |
| Spacious, 53 active | 54.648 ms | 130.063 /149.444 ms | 117.525–153.579 ms |

All ten observed recovery batches are below 250 ms; the earlier ranges were
301.979–361.858 and 253.711–301.355 ms. This is a local sample, not a production
worst-case guarantee. Whole checkpoint and packet maxima remain exactly
59,833/6,802 and 75,439/8,464 bytes. Rollback, persisted restart, unchanged deadline,
Room reacquisition, stale-ticket/ACK refusal and exact client delivery still pass.
Evidence: `verification-roaming-scope-{crowded,spacious}.json`. No live capability,
host limit, world reservation, fixed-step count or packet precision changed.
Full-world storage, aggregate CPU/memory and account billing remain unvalidated.
Final verification: 118/118 host/recovery tests and the 320-script build pass;
five JS/MJS syntax checks and whitespace pass. The existing Hub STOP ledger is
unchanged; no Hub/full/browser check was rerun. Evidence:
`verification-roaming-scope-full-host.log` and `verification-roaming-scope-build.log`.

### Isolated controlled Clanker body continuation

The explicit `body-1` construction profile extends the source-owned checkpoint
bridge for **one** controlled Clanker in the same authored noncombat empty meadow.
No ordinary browser construction enables it. `createClankerBodyCheckpoint` shares
the lossless scalar/buffer/RNG/rig encoding with the roaming codec, but has a
separate profile baseline, an 8 KiB component cap and one additional closure field:
the controlled entry's index. Restoration binds the private controller directly
after decoding into a fresh disposable controller, without calling `possess`,
`travel` or `release`. Malformed application poisons the adapter; it must be
discarded before publishing or binding it to a live world.

Its explicit neutralization clears held direction, run, climb and jump inputs and
queued jump buffers. Capture refuses nonneutral inputs; restoration cannot replay
the disconnected hold. Position, facing, velocity, health, grounded/airborne state,
jump allowance, form, typed continuation state and exact managed animation survive.
The normal controller clears its internal `cancelled` latch after a neutral physics
update; the validator permits that while still refusing held/queued input. This
was corrected after the new rejection test exposed an overly strict latch check.

The actual-source test starts a running jump, saves airborne state, reconstructs
the controlled body and uses its remaining midair jump only after a **new** input.
It compares 48 subsequent updates and repeated fresh restorations against the
uninterrupted original, through gravity and landing. Methods for ordinary
possession/travel/release are replaced with throwing functions during first
restoration to prove they are not used. Tests also reject wrong world, missing or
out-of-range ownership, multiple actors, remote control, climbing, held bodies,
rolling/fire, invalid health or velocity and reuse after a failed restore.

This is not an authenticated browser reconnect or a general player codec.
The profile refuses combat, other actors, world jobs, sleep/seat/ladder/grab
relationships, shared supports and world-item bindings. Ooga body and
weapon/ammunition/fuel continuation remain separate unfinished work. No Room
body command, session format, transport capability, deadline or occupancy behavior
is changed. The existing roaming profile continues to refuse player ownership.

`node worker/eval/clanker-body.mjs` measures 48 complete fresh-VM restore/step/capture
comparisons. The largest component was **1,531 serialized bytes /39 packed nodes**;
all 48 samples exceeded the existing **1,024-byte session slot**, even before its
account/deadline/occupancy/departure envelope. Cold-cycle Node wall time p50/p95/max
was 23.872/25.618/27.413 ms, including VM/module construction, not workerd CPU or
browser latency. Evidence: `verification-clanker-body-capacity.json`. The 8 KiB cap
is a standalone refusal bound, not a new session reservation. Complete body/world
storage and admission must be redesigned and measured before integration; this
component must not be appended to schema 2 or consume existing NPC reservations.
Activation remains disabled, and Tess is unchanged.

The follow-up [body storage audit](virtual-host-body-storage.md) inventories this
internal slot bound, tests model reconstruction, compares lossless encodings and
larger inline reservations, and implements an opt-in atomic separate-record
layout. It preserves exact state and existing logical host/world limits, with
explicit aggregate capacity and measured local SQLite costs. Live full-body
physics, authenticated reclaim and production activation remain gated.

The shared-source change was checked against both 53-entry local SQLite/Room
workloads again. Recovery remained 171.055–200.477 ms crowded and
116.895–154.151 ms all-active; paired active-cycle p95 was 155.087/142.620 ms.
Checkpoint/packet maxima were unchanged and all authority/restart/delivery checks
passed with zero egress/logs. Evidence:
`verification-clanker-body-roaming-{crowded,spacious}.json`. Final verification:
120/120 host/recovery tests, 320-script build, four JS/MJS syntax checks and
whitespace pass. The Hub STOP ledger is unchanged; browser/full checks were not
rerun. Logs: `verification-clanker-body-{full-host,build}.log`.

### Disconnect presentation, not yet connected to live sessions

`host-presence.js` renders committed grace views and applied departure intents
over existing actual Ooga/Clanker rigs. `prepare()` restores the previous limb
transform before the caller applies the next authoritative pose; `render()` then
raises the explicitly bound free arm and displays a green open-hand icon. The
arm direction accounts for the torso, reclining and peek transforms. A fixed
local angle failed the initial real-Clanker test; converting the raised direction
through its actual parent transform fixed it. The same test now passes without
moving the root, changing equipment or detaching the held vessel.

The circle next to a retained player's name is red during committed disconnect
grace and green again after a generation-validated live view confirms reconnect.
World nameplates and name tooltips consume the same bounded, rig-root keyed
status; pose preparation, deadline expiry and rejected stale frames cannot turn
it green. Existing control flags cannot override this offline status. Voice and
sidebar roster behavior are unchanged. Actual Ooga/Clanker tests cover reconnect,
stale generations, malformed frame tails, expiry and disposal. This remains part
of the disabled host path: live retained-body/nameplate delivery and browser
visual verification are still outstanding, subject to the Hub STOP ledger.

Bindings include the body generation. Mismatched generations, duplicate bodies,
occupied hands and malformed tails are refused before changing limbs. A missing
binding never creates an NPC. The helper currently requires direct actor children
of an identity scene root. It is a presentation layer and must run after physics;
it neither advances passive motion nor hands player control back. The caller
must still implement authoritative body identity and delivery.

Expiry uses `sleep-beam.js` and its existing green historical glyphs. Up to 64
retained bodies use four fixed pools of 16, within the existing per-pool cap of
20; no cap was raised. Progress comes from the original committed departure
timestamp over 700 ms. A late observer or restart past that interval does not
restart the beam or resolve/spawn a body. Unapplied intents are not completed.
The helper does not acknowledge durable intents or change body visibility;
those actions belong to the still-unfinished handoff integration. Reduced motion,
geometry collection, exact limb restoration and disposal are covered.

The maximum-load local evaluator measured 64 hands over 120 samples and 64
simultaneous beams over 43 samples: hands p50/p95 **0.351/0.605 ms**, beams
**2.064/2.875 ms** (maximum 12.216 ms). Fixed glyph instance storage is
**245,760 bytes**, 3,072 glyph instances, at most 32 glyph batches and one shared
hand geometry. This measures actual scene matrices/geometry in Node, not GPU
uploads/draws, browser/phone appearance, network latency or production costs.
The larger simultaneous GPU load remains a validation gate. Both new modules
are loaded but unused by the live scene; no capability, preview flag or runner
was activated. Evidence: `verification-presence-cost-final.json` and
`verification-presence-{first,repair}.log` in the task workspace.

Verified locally November 4–5, 2026 on Node v22.23.4:

- Storage redesign: **101/101** focused host checks, **408/408** unit checks,
  the **320-script** build, all twelve touched JS/MJS syntax checks and whitespace
  validation passed. The seven checkpoint tests include 200 deterministic diverse
  JSON round trips, exact IEEE/Unicode/negative-zero cases, truncation, malformed
  lengths/tags, expansion bombs, original node/depth limits and mixed versions.
  The varied combined host test passed with unchanged session reservation and
  restart deadlines. No test assertion failed in this increment; the initial
  measurement harness recognized only structural-capacity errors and was updated
  to record the byte-budget refusal too, without changing either budget.
  The existing 20-entry browser ledger is unchanged; no Hub/full/browser check
  reran. Logs: `verification-storage-{full-host,unit,build}.log`,
  `verification-storage-binary-{integration,corruption}.log`,
  `verification-storage-static.json`.
- Managed continuation and disconnect presentation increment: **96/96** focused
  host checks, **408/408** unit checks, the final **320-script** build, eight
  touched JS/MJS syntax checks and whitespace validation passed. Subsequent
  continuation/presentation review passed **18/18**; the final presentation
  allocation cleanup passed **8/8**. The existing 20-entry browser failure ledger
  is semantically unchanged; no Hub/full/browser check reran. Initial failures
  and their diagnosed source fixes are recorded above. Logs:
  `verification-continuation-presence-{host,unit,review,build-final}.log`,
  `verification-presence-final.log` and
  `verification-continuation-presence-static.json`.
- Mixed Room increment: **91/91** focused host checks and **75/75** Room
  compatibility checks, **408/408** unit checks, the **318-script** build, all
  five touched JS/MJS syntax checks and whitespace validation passed. The
  20-entry Hub failure ledger is unchanged; no STOP-restricted checks reran.
  No new failing checks or threshold changes.
- Mixed-packet increment: **88/88** focused host checks, **408/408** unit checks
  and the **318-script** build passed. No new failing checks. The varied mixed
  load completed all 120 frames with exact Ooga bytes and final Clanker display
  parity for both receivers. Existing STOP-restricted browser checks remain
  unrun. Logs: `verification-mixed-packet-{host,unit,build}.log`.
- Managed Clanker projection increment: **86/86** focused host checks and the
  subsequent **5/5** pose review checks passed; **408/408** unit checks and the
  317-script build passed. Syntax checked all 11 locally touched JS/MJS files.
  The final attachment-guard review passed **5/5** and its build passed (logs
  `verification-clanker-pose-final-{focus,build}.log`). Generated HTML
  remains excluded; the existing Hub failure ledger is unchanged and no
  STOP-restricted browser checks were rerun. Evidence:
  `verification-clanker-pose-{host,review,unit,build}.log`,
  `verification-clanker-pose-syntax.json`, and the finite cost JSON records.

- Local runtime/query increment: **84/84** focused host checks, **408/408** unit
  checks, the 316-script build, syntax checks for all six touched JS/MJS files,
  and whitespace validation passed. Generated HTML was restored and excluded.
  The final finite SQLite runtime sequence passed both load profiles, with no
  outbound fetches or unexpected logs. Hub/full/browser checks were not rerun;
  the 20-entry failure ledger is unchanged. Evidence:
  `verification-query-{host,unit,build}.log`, `verification-query-syntax.json`,
  and `verification-runtime-query-final.json` in the task workspace.
- Recovery budgeting: **38/38** initially affected lifecycle/host/passive checks
  passed; the full focused host batch passed **74/74**, including exact airborne
  equality against an uninterrupted 60-second reference, failed writes, owner
  replacement, duplicate close, last-millisecond/exact-deadline reclaim, no budget
  replenishment through callbacks or automatic transaction retries, and refusal
  of partial-state pose publication.
  The retry review passed all **38/38** affected checks, including accounting for
  successful retried attempts and preserving the checkpoint on exhausted retries.
  Final retry checks: `verification-budget-retry-final.log`. Older host schema 2 is
  rejected. Logs: `verification-budget-{first,host}.log`;
  capacity and cost evidence: `verification-budget-cost-final.json` in the task workspace.
  Unit **408/408**, build (**316 scripts**), five touched JS/MJS syntax checks
  and whitespace passed. No Hub/full/browser rerun; the failure ledger is unchanged.

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


### Standard-pose player recovery follow-up

The user's revised requirement permits a standard pose and fresh animations on
player recovery. The opt-in controlled Clanker body-2 profile removes saved rig
and animation continuation while retaining gameplay state and explicitly stored
position. Rebuilt collision clearance is required before recovery can succeed;
old body-1 records refuse rather than silently migrate. The complete measured
session-plus-body is 1,221–1,418 bytes, so the atomic separate-record layout and
bounds remain pending wider world/body validation. See the current section of
[the capacity audit](virtual-host-body-storage.md) for itemized sizes and gaps.
This does not complete authenticated browser reclaim or enable the host. Tess
remains excluded and #379's independent ghost-track login remains unimplemented.

### Minimal player-body recovery and transaction follow-up

The latest user direction drops exact ammo, fuel, health and other nonessential
continuation. Body-3 is a fixed physical tuple with standard-pose reconstruction;
session schema/protocol 3 removes consumable quantities and requests default
resources on successful connect. Old schemas refuse. Actual passive Clanker
controllers now live inside the same transaction as registry motion and body
rows, align horizontal neutralization on close, and are disposed on retries and
failures. No live browser reset or production host is enabled.

Full inline sampled records are 712–828 B; the maximum-length-id conservative
case is 1,287 B. Separate bounded storage remains. A 1,200-step operation budget
puts already-closed 30-body recovery below 250 ms in the local fixture, but
unreported simultaneous disconnect recovery still reaches 869 ms and batch
close 650 ms. These are explicit activation blockers, not production cost proof.
The current capacity audit records itemized bytes, 128 passing host tests,
408 local unit checks, physical comparisons and all remaining integration gaps.

### Bounded body work and combined local-runtime follow-up

Body-3 now has source-owned data-only disconnect operations. They bind the trusted
owner/world/baseline, verify prior motion and zero only horizontal velocity;
ordinary gravity/collision still runs through actual controllers. Cold controller
creation is bounded independently from physics steps and shared across retries.
The inactive body adapter admits one controller per operation, defers other body
work without changing deadlines, and rejects over-budget new-body batches.
`simulation.maxSteps` may lower the default eight NPC steps per operation; the
new expensive fixture uses four, keeping fixed-step physics unchanged.

The finite new SQLite/workerd evaluator composes 30 distinct actual body controllers
with session transactions and optionally 53 restricted roaming NPC entries. It
passes exact body restoration, default health, partial-write rollback, persisted
restart and stale-owner rejection. After a 10,001 ms outage it verifies all 30
bodies and 40 NPC steps against saved-state continuation. Four NPC steps per
operation reduced the observed maximum combined transaction from 250.45 to
170.14 ms, at the cost of 39 rather than 34 operations and 1.73 rather than
1.45 MB of serialized writes. The complete 30-body short sweep still takes about
529 ms with NPCs, so four-Hz delivery and production cost are **not** certified.
See the capacity audit for fixtures, cold Node/runtime differences and limitations.
No signing retry, live browser activation, Tess change or production action is
part of this follow-up. Browser reclaim, full-world integration and live visuals
remain unfinished; signing is not the only remaining blocker.

### Independent actor bindings and retained publication tickets (local v39)

`host-actor-bindings.js` binds an already separate player rig and NPC rig, bounded
at 32 bindings and 256 nodes per NPC. Ghost appearance uses reversible per-node
opacity without changing shared geometry, pose, AI, collision or equipment state.
Generation checks prevent stale releases and cross-account rig reuse. Equipment
tree changes require an explicit refresh. Tests with actual Clanker rigs and
controllers show the NPC track continues while only the player receives the
raised hand and red/green indicator. This is an inactive presentation component:
it does not create the independent controllable body, place first login from an
authenticated NPC, or integrate full-world recovery. It is not in the scene script
list. Renderer fidelity, including matrix modes and ghost shadows, is unverified.

The optional private `publishHostPoses` receipt removes two Room status RPCs from
steady publication. Fresh host revision confirmation and Room's transactional
revision/owner/format/lease/rate checks remain. Stale receipts cannot reacquire
authority, even if `acquire` is requested; lost replies still compare exact frame
bytes. The receipt is only for the trusted runner, never a browser capability.
No deployed caller opts in; `--cached-room` selects it in the finite evaluator.

A 120-sweep local run with 53 restricted NPCs, 30 player controllers, 31 decoders
and one stalled client still **fails** strict 250 ms delivery: 119/120 emitted,
80 late, last-client p95 327.001 ms/max 352.407 ms and first-client p95 264.001 ms.
There were no simulation completion misses, egress attempts or runtime logs.
The two status reads disappeared, but pacing p95 remained 79 ms. Four-publication
spans were 1,003 ms minimum/1,007 ms median: work after eligibility accumulates
against a four-per-second arrival stream. The rate policy was not loosened.
This restricted local result does not certify full-world, browser, handoff churn,
real network or billable compute costs. Activation and burst remain disabled.

48 distinct focused checks pass across the actor/publication/body/reclaim suite
and Room suite. Hub/browser STOP restrictions remain in force. Full-world source
adapters, independent player creation, live scene reclaim/presentation, bounded
runner orchestration and migration/drain are still required. Tess remains excluded.

### Source-owned independent player factory (local v40)

`BL.clankers.createPlayerBody` now creates one dormant player controller with its
own mutable owner and roster. It does not append to the NPC roster or possess,
hide or modify the original NPC. The body checkpoint codec restores it directly;
the reclaim coordinator enables input only after the committed live receipt.
Suspension cancels input and freezes browser updates. Disposal removes only that
body. Passive host recovery still uses the existing source-owned checkpoint
bridge under host authority, independently of the browser input gate.

The factory explicitly requires `static-body-3`, trusted ground/clearance callbacks,
and a fresh owner identity. It rejects broader world options. It is exercised by
the browser-free grant/ACK contract and finite headless evaluator, but no scene
calls it. Actual controllers demonstrate a newer airborne final grant, independent
NPC motion, default resources and safe cleanup. This is a working static-world
player path, not completion of the hub's supports, climbing, jobs, occupancy,
equipment interactions or source-owned Ooga recovery. Authenticated production
NPC mapping and first-login placement remain unwired.

A finite local SQLite/workerd test after a 10,001 ms unreported disconnect and
host replacement verifies all 30 bodies and 40 restricted NPC steps. Recovery
uses 17 operations, p95/max 139.510 ms each, 1,119.587 ms total; cold startup
271.985 ms and cold restart 84.609 ms. It verifies original deadlines, rollback,
persisted restart and stale-owner fencing, with zero egress or runtime logs.
This is catch-up evidence, not sustained delivery, full-world or billing proof.

`publication-latency.mjs` isolates final-check delay with the actual publication
coordinator, Room rate transaction and latest-only runner, using authored logical
time. Across 120 sweeps, a 0/1/4 ms final check produces final frame ages of
20/50/140 ms respectively (20 ms authored preparation). Strict attempt and commit
rate bounds remain enforced. These are model outputs, not CPU measurements.
They explain how post-eligibility work can accumulate without network jitter.
The last real strict delivery run still failed; the new factory has recovery
verification only. Activation and burst remain disabled; Hub/browser STOP applies.

### Footprint support and vanished-prop recovery (local v41)

The independent factory additionally accepts explicit `terrain-body-3` queries:
versioned footprint support, terrain-only support, point support and ground-plane
fitting, plus the existing ground and clearance callbacks. These use the ordinary
source controller. The profile/version enter the checkpoint baseline; static-only
or changed-terrain readers refuse rather than misinterpret a body. Recovery now
uses the same footprint support query as driven movement, so a ledge under the
body can support it even when the center ray misses. The rebuilt standard pose
is fitted before collision clearance is checked.

A browser restore still refuses a grounded body whose support disappeared. The
authoritative host may restore it with `passive: true`, retaining the stored
motion for comparison with the registry. Capture and live activation remain
blocked until actual source physics applies the support removal and gravity.
The body and registry then commit together. Tests cover a vanished prop across
host replacement, original deadlines, stale-owner rejection and rollback of the
whole recovery transaction. No lost-support exception permits an overlapping
body, silent relocation or capture before the required step.

Focused tests use actual `solidProps` meshes for ledge support and wall collision,
plus source controllers for airborne continuation and landing. A finite Node
sample processes 32 distinct bodies after support loss in eight operations of
four bodies: maximum operation 5.662 ms, total 24.487 ms, largest sampled body
component 194 bytes. Modules/collision trees were already loaded; this excludes
session envelopes, host/Room/SQLite/network overhead and peak-memory/billing
proof. It is a small authored geometry set, not representative full-world load.

Full hub integration still requires a common world snapshot and support identity,
moving-platform/rider behavior, Ooga recovery, climbing/occupancy/equipment and
live scene/camera/control wiring. World changes must be coordinated with body
steps before offering a transfer. These callbacks do not implement that ordering.
No live scene calls the new profile; activation and burst remain disabled. The
strict delivery failure is unchanged and was not rerun. Hub/browser STOP remains.

### Final placement fence and longer strict-cadence diagnosis (local v42)

The independent Clanker factory now rechecks current footprint support and
collision clearance when the committed live receipt enables control. Geometry
may change after the final snapshot was restored. This check neither advances
physics nor reposes the rig; a missing platform or new overlapping obstacle
refuses activation. The browser coordinator disposes the prepared body and keeps
movement blocked. The existing world version and unsupported-state checks remain.
This is still an inactive source boundary, not scene integration.

Focused Node verification: 17 checks pass across body-reclaim, clanker-body-world
and clanker-body, including unchanged support, a removed support mesh, and a new
intersecting mesh during grant/ACK. Build passes 321 scripts. No Hub/browser checks.
A rejected final activation does not yet notify the host through a body-only
release protocol: socket close/reconciliation remains the existing cleanup path.
Do not enable the feature until that lifecycle is completed; do not close voice
as a substitute or assume blocked browser input proves server-side grace.

The finite publication-latency diagnostic now includes 1,200 authored sweeps over
five logical minutes. With 20 ms preparation and respectively 0/1/4 ms of final
confirmation after rate eligibility, the final ages are 20/320/1,220 ms. The 1 ms
case first exceeds 250 ms at sweep 921; the 4 ms case at sweep 229. Both attempt
and actual Room commit rates remain strict. This is an authored logical-clock
model, not measured RPC cost or production throughput: it deliberately waits for
each publication, whereas an independent simulation can supersede/coalesce. It
shows why a short passing run cannot establish headroom for this ordering. The
last real strict delivery run remains failing; no rate policy changed.

Full-world AI/physics, authenticated account/NPC placement, scene control/camera
and recovery presentation remain unfinished. Activation and burst remain off.

### Durable body-only decline and same-connection retry (local v43)

Browser reclaim failure, inactive timeout, suspension or adapter teardown now
stops/releases the local controller and sends only `body-decline` plus the
current request nonce. It never sends body state, identity, a private token or a
client timestamp. Room binds that nonce to the authenticated connection and
atomically closes the retained outbox row. Unknown host operations remain pending
for the existing exact-command reconciliation path. The first close time survives
duplicates, failed writes, uncertain committed replies and restart.

The body remains fenced while the WebSocket, voice session and mute controls stay
connected. Wake restores a durable close even if attachment update was lost.
Explicit server staging can retry on that same connection only after the old row
has been retired with host cleanup proof; an old nonce cannot close the new row.
No browser packet clears that gate. Automatic host scheduling/census remains open.

Cleanup uses the existing conservative live-send distinction. Before any live
notification was attempted, an unchanged final hold can be abandoned with its
original grace deadline. Once live notification might have reached the browser,
cleanup disconnects the CURRENT body using Room's first observed close time. It
does not trust a browser assertion that control never started, rewind physical
state, or use the earlier snapshot; normal live-disconnect grace applies. This
can start a new 60-second window after failed final activation, because the server
had already confirmed live. That distinction is deliberate and covered by tests.

49 distinct focused checks pass across browser coordinator, actual Room source,
outbox and host operation tests. Final build passes 321 scripts. No Hub/browser
scene tests or probes. Feature advertisement/activation remains disabled. The
scene teardown contract is implemented in setAdapter(null); live scene wiring,
full-world recovery and automatic finite runner integration are still unfinished.

The logical timing diagnostic now also produces independent revisions every
250 ms while preparation/pacing/confirmation runs. Over 1200 authored sweeps,
1 ms final confirmation delivers 1199 frames with one superseded read and max
committed-frame age 249 ms; 4 ms delivers 1195 with five superseded reads and
max age 248 ms. Both retain strict attempt/commit rates. No client/network costs
are present, so this is not a passing production latency result. The prior serial
model's growing ages are conditional on serial production; independent production
can discard obsolete work instead. Production strict delivery remains unresolved.

### Browser recovery wire and scene adapter contract (local v44)

The page now loads clanker-body-transfer.js, a bounded source-owned decoder and
reclaim adapter. It has no Worker checkpoint/packing imports. The trusted world
boot supplies the body owner, physics baseline and source rules. The payload has
only v/world/profile/body: ten physical slots (owner, position, facing, velocity,
jump credits and form/motion flags). Equipment/mode remain in the enclosing view;
health/ammo/fuel/rig/animation/history are not added. Signed zero has an explicit
JSON spelling, preserving exact scalar values without float quantization.

The adapter reserves one fresh independent body and uses one temporary body for
preflight. Final apply consumes the reserved decoder once. Only the live receipt
activates source control and attaches the scene callback; failed/partial attach
is suspended, detached and disposed. Teardown uses the v43 body-only release.
The existing source tests now exercise this page adapter instead of importing a
Worker decoder into the recipient. Independent NPC movement remains unaffected.
No hub scene installs it yet: authenticated owner mapping, full-world queries,
Ooga recovery and actual camera/control integration remain necessary. clankerPlay
expects sleep/combat/travel/climbing methods beyond the restricted factory, so
simply swapping that factory into the live scene would be incomplete.

Host storage stays packed. An explicit browserTransfer:true session-adapter option
projects a deterministic wire payload on reads and all ACK/abandon comparisons.
It defaults false, has no deployed caller and enables no capability. Changing
projection with outstanding old-format handoffs requires a drain; mixed formats
refuse rather than silently migrate. Room's existing bounded envelope still
applies, and the browser component has a separate internal 2048-byte cap.

54 distinct focused checks pass. Representative JSON UTF-8 sizes: component194B,
complete handoff829B, stored session+body row828B. An adversarial long-name/numeric
component is340B; that is not a maximum combined-record proof. Host reconstruction,
changed-receipt rejection, duplicate ACK and original-deadline abandonment are
tested with the projected wire; storage retains its original packed component.
Final build passes322scripts. No Hub/browser/scene probes.

Final finite Node sample:32distinct bodies, eight serial four-body operations
after removal of an authored platform. Recovery+wire encode maximum5.825917ms,
total25.085708ms. Separate page-source construct/JSON-decode/placement-activate/
dispose maximum2.20175ms, total11.681915ms. Largest sampled stored component194B,
wire196B. One controller alive at a time per operation; preloaded source and
small collision trees. Excludes session/Room/storage, full world, actual browser,
camera, rendering, network, peak memory and billedCPU. It is not a sustained
four-Hz or production readiness result. The previous strict delivery gate still
fails; no rate policy changed. Activation and burst remain off, Tess excluded.

After the final cost sample, adapter release cleanup was hardened with nested
finally blocks so detach/dispose still run if suspension fails. That adapter
release path is not exercised by the cost sample; recorded source hashes remain
those actually measured. The focused reclaim tests and build were rerun.


## Local v45: independent Clanker controls, still inactive

clankerPlay now exposes attachBody/detachBody/stepBody for the trusted recovery
adapter after the committed live receipt. It reuses the existing camera handoff
and keyboard/touch input, but routes movement and cancellation to the independent
body. It never possesses/releases the corresponding NPC. Duplicate attachment,
existing local possession, combat-only scenes and unsupported methods refuse.
The final acknowledged view is copied into the adapter's attachment callback,
including equipment/mode, rather than using the older preparation. Clearing
held input preserves physical position, facing and velocity. Escape/teardown
can notify body reclaim after local detachment; detachBody suppresses recursive
notification. Suspending the source body makes the camera release on update.

Only walking/jumping are supported by this restricted body factory. Combat
commands, chest beating, travel and legacy moving-player support are fenced;
control help reflects that boundary. The Hub loop has a separate body step,
currently a no-op because no scene installs a reclaim adapter. Full-world owner
mapping, Ooga recovery, dynamic supports/occupancy, AI jobs, rendering registration,
ordinary movement transmission, ghost/disconnect presentation and automatic Room
runner integration remain unfinished. Do not advertise or activate this boundary.

21 focused source/controller tests pass in verification-player-control-final.log.
They cover physical motion preservation on input cancellation, final-view copying,
independent NPC evolution, grant/ACK fencing, terrain placement and failed attach
cleanup. The initial focused run had three failures: two from structuredClone
being unavailable in the source VM and one from the new test attempting a neutral
checkpoint read while controls were held. The adapter now copies its JSON view
using the same JSON contract as the coordinator; the test reads physical fields
before cancellation. The failed log is retained. No validation was weakened.
Build passes 322 scripts. Hub/scene/browser tests and probes remain prohibited
by the existing STOP restriction; camera/input/presentation changes have only
static review and build/syntax verification, not a runtime UI pass.

The finite strict-cadence model now reports authored downstream budgets. For
1,200 independent productions, adding 20 ms after commit produces 76 late
arrivals with 1 ms confirmation or 93 with 4 ms confirmation; maximum ages are
269/268 ms. At 50 ms downstream, 196/237 are late, maxima 299/298 ms. The model
retains the actual publisher/Room rate checks; these added delays are arithmetic
budgets, not network or CPU measurements. It does not establish production cost
or throughput. The previous actual end-to-end result still fails (119/120 frames,
80 late, last-client p95 about 327 ms). No new workerd run, rate-policy change,
burst activation or relaxed ownership check. Tess excluded; no deployment.


## Local v46: recovery callback ownership

The scene adapter may synchronously trigger teardown, suspension, a new socket or
a new offer during preflight, final restoration or camera attachment. The reclaim
coordinator now captures the attempt/adapter/resource before each callback and
checks them again before retaining its result. An old callback return or exception
cannot revive a disposed body or clear its replacement. Explicit in-progress
phases prevent recursive receipts from invoking the same callback twice. Time
spent in preflight and activation consumes the existing deadline, as final apply
already did; expired work is released without opening ordinary movement. Voice
remains available and the existing body-only decline handles host cleanup.

31 focused source and Worker tests pass, including all three callback boundaries,
close/suspend/adapter replacement/new-offer transitions, returning and throwing
callbacks, recursive receipts and callbacks that cross their deadline. The real
source-body adapter also tests suspension from its attachment callback: body
control stays off, detachment/disposal happen once and the physical state is not
replayed. These tests do not run the Hub or browser UI. Full-world scene wiring,
rendering and the strict delivery gate remain open; activation and burst are off.


The instrumented finite local workerd run (120 sweeps, 53 restricted roaming NPCs,
30 retained bodies, four body loads per operation, 31 Node decoders plus one
stalled follower, authored 20 ms delay, strict rolling cadence) still FAILS:
119/120 emitted, one superseded, 80 late. Last-client p95 338.380 ms, max349.540;
first-client p95 277.141 ms, max287.988. No simulation completion deadline misses;
completion p95 140.561 ms. Recovery verification, rollback and persisted restart
passed. 36.8667 host writes/target second, 62,510,497 serialized host write bytes
in the measured window; excludes Room/provider overhead and is not billed CPU.

Paired records now retain production completion, first transport callback,
first decode start/finish and last receiver for each delivered sequence, all on
one Node monotonic clock. Eight frames were already older than250ms at the first
transport callback, 24 after first decode, 80 after last decode. Per-frame
completion-to-first-transport p95 143.346ms, first decoder p95 3.156ms, first-to-last
receiver p95 66.933ms. These are different distributions and MUST NOT be added.
The single-process 31-decoder timer overshoot p95 67.611ms is a harness cost, not
31 independent browser/network latency. It does not excuse the first-client
failure. The next scheduling investigation should preserve these paired spans,
address pre-delivery pacing/Room work and isolate client execution when practical;
do not turn a reduced-decoder run into proof that the original gate passed.

Artifacts: verification-reclaim-callback-strict-local.json and empty .stderr,
verification-reclaim-callback-paired.json (derived, includes source artifact hash).
The initial sandbox run failed with listen EPERM on127.0.0.1 before producing
results; its stderr is retained. A reviewed escalation allowed the same finite
loopback-only workload; zero external egress attempts and zero runtime logs.
No Hub/browser probes, cloud resources, production data or deployment. No rate,
ownership, capacity or activation gate changed. The 31 focused tests and final
build pass; performance remains a blocker, not an improvement claim over v39.


## Local v47: independent player scene registration, inactive

The Hub now supplies attachPlayer/detachPlayer callbacks to clankerPlay. Its
attachBody signature takes the copied final view, rather than only mode. Before
camera attachment, the scene checks the authenticated local account, canonical
Clanker body name, root membership and separate body identity. It keeps one local
independent registration; it does not append to the fixed NPC roster or capture
array. Registration supplies netBody and the six-slot ordinary-motion buffer,
picking targets, part-owner lookup, collision mesh and mirror tracking. Matching
teardown removes those references; the recovery adapter still owns root disposal.
The source body is suspended before camera/DOM teardown; finally cleanup removes
registration and invokes the body-release callback even if UI cleanup throws.
Legacy NPC registration still creates its existing capture records.

This connects the previously missing registration callbacks, not the whole live
feature. No scene installs a reclaim adapter, capability remains unadvertised,
and activation/burst remain off. Trusted world/NPC mapping, full-world recovery,
Ooga bodies, moving supports, occupancy, ghost/disconnect rendering and authoritative
movement integration remain unfinished. In particular Room currently blocks all
ordinary movement from staged body-handoff clients, even after live delivery;
removing that block without a durable last-body-state/recovery design is unsafe.
The existing body-only release and voice boundary are preserved. No Tess changes.

UI/Hub behavior is only statically reviewed and build/syntax checked under the
existing STOP restriction; no scene/browser/Node scene probes were performed.
The prior31focusedrecoverytests remain recorded in v46; they were not rerun to
pretend this UI registration was runtime-tested. Build322scripts passed.

The finite strict runtime evaluator now records publication start/return and
post-operation fixture-audit time. It retains audits/capacity assertions and all
actual rate/ownership checks. In the new120frame run:119/120 emitted,1superseded,
82late,last-clientp95326.461ms/max352.492ms,first-clientp95264.422ms/max290.155ms.
Restart/rollback pass,0simulationdeadline misses,0egress/0runtime logs. No production
resources. The initial measured setup is unchanged:53restrictedroamingNPCs,
30retainedbodies,4bodyloads/operation,31Node decoders+1stalled,20msauthoreddelay.

Per-frame wait-before-publication p9571.078ms, publication-to-firsttransport p95
104.030ms; fixtureaudit p951ms/max1ms for publication. The worst first-client frame
finished simulation126.649ms afterits scheduledtime, startedpublication138.762ms,
reachedfirsttransport267.192ms andfirstdecoded290.155ms. Its measured phases were
19msprojection,95mspacing,1msconfirmation,15msRoompublication. The fixtureaudit is
not the dominant delay. These overlapping spans/percentiles cannot be added.
Single-process31decoderfanout remains a limitation, but first-clientfailure remains.
No performance improvement or readiness claim from this unpaired sample. Fixing
strict cadence needs scheduling/authority work, not deleting diagnostics or raising
limits. Artifact verification-player-registration-strict.json, empty.stderr.


## Local v48: minimal live-body capture, not network ingestion

The restricted source body now has liveBodyState(), sharing the exact ten-slot
physical validator with bodyState() but allowing held movement inputs. bodyState()
remains neutral-only for host checkpoint/recovery. Capture reads identity,
position/facing, velocity, jump credits and form/motion flags; it does not clear
inputs, advance physics, pose the rig or include health/ammo/fuel/animation/history.
Unsupported jobs/climbing/captures, invalid scalars and unstepped missing-support
recovery still refuse. Existing standard-pose restoration remains unchanged.

The page forBody codec can capture only after successful restore while its
independent source body is active. The reclaim adapter exposes capture(resource)
only for its held attached resource; release invalidates that access. Packed host
records expose fromTransfer(value), a pure conversion using the source world,
complete profile and owner validators. This retains no bootstrap controller.
Neither operation authenticates a message, sends a packet, changes a session or
writes durable state. Room continues to block ordinary movement for staged body
handoffs. Authentication, monotonic sample ordering and atomic session/body storage
must be integrated before using live captures; do not simply remove that fence.

45 focused checks pass: source body, wire, terrain, reclaim and host body storage.
A new sixty-step walking/jumping comparison proves repeated capture leaves held
inputs, trajectory, animation and health unchanged relative to an uncaptured
reference body. Fresh restoration preserves physical state, clears held inputs
and resets health. Wrong owner/world/profile/version, extra fields, unsupported
source actions and invalid velocities reject. Pre-live, suspended and released
resources cannot capture. The largest component among those60samples was252B;
the final packed component was205B. These exclude session/message/storage overhead
and are not worst-case combined-record or CPU measurements. No resources or rig
continuation added. Final build passes322scripts; Hub/browser tests remain barred.

Scheduling review reuses the saved finite logical model (not a new performance
run). With1ms post-eligibility confirmation, serial1200productions end at320ms
age and first exceed250ms on delivery921; with4ms they end at1220ms and first
exceed on229. Once the rolling four-commit bound is active, waiting for that bound
and then paying an authored positive confirmation cost makes the next four-commit
span exceed1000ms. Independent production bounds old-state queueing by superseding
samples, but does not satisfy all-four-frames/250ms delivery. This is a limitation
of the current ordering, not a proof against every possible architecture. Keep
fresh ownership confirmation and the strict rate gate; a scheduling/authority
integration change is needed. No rate or burst change was made, and no unchanged
workerd rerun was performed. Latest actual strict result remains v47's failure.
Full-world and live scene integration remain unfinished; activation stays off.


## Local v49: atomic live movement boundary (inactive)

`VirtualHost.updateBody` now accepts a bounded physical wire sample only against
an authenticated server-supplied account, current live generation/private token,
current host ticket, and trusted transport census containing that session. It
checks these before recovery. This is a server method, not a new browser route.
Room's movement fence remains in place. The scoped Clanker adapter validates the
source profile/owner, reconstructs a fresh standard body, validates its placement,
and commits exact registry motion and its packed body together. Equipment stays
unchanged; no health/ammo/fuel/held controls/animation history is persisted.

An atomic per-account receipt records generation, sequence, canonical packed-body
SHA-256 and acceptance time. Equal samples return the original receipt without
presence refresh, construction or writes; older/changed repeats reject. New
sessions reset sequence only after live-session authentication. At most32 receipts
exist; a new accepted commit atomically prunes accounts no longer retained in
sessions/pending departures. This is bounded replay storage, not a message queue.
The schema's maximum row is268B; the row cap is288B. Maximum32-id index545B, cap576B.
These are UTF-8 JSON limits excluding keys/provider overhead. Explicit account
removal cleanup still belongs in the inactive lifecycle integration.

Verification:55 focused Worker/source tests passed, then24 focused tests passed
with additional replacement-session/host-ticket cases, then2 journal tests passed
with final288/576-byte caps and maximum-schema admission. New cases cover partial
failure at all four initial writes, changed/lower duplicates across reconstruction,
wrong account/token/generation, missing census membership, newest-position
horizontal-stop/vertical-fall disconnect, stale host/replacement sessions,
underground standard-pose rejection, shared speculative construction budget,
receipt capacity and atomic pruning. An initial fixture mistakenly restored one
controller twice; it now uses a separate source body. Another initial test found
an oversize index reached generic complexity rejection before journal validation;
shape/length now refuse first. Both logs are retained; neither was a Hub check.
Build passed322scripts. No Hub/browser/scene execution or new workerd trial.

Representative sample162B and receipt155B exclude the session/body/envelopes and
are not total recovery storage, worst-case live traffic, CPU or billing results.
Every accepted update currently constructs a source controller and rewrites the
host root plus changed body and receipt (four writes for first receipt, normally
three thereafter). A duplicate still pays bounded reads/validation/hash. Ingress
rate, full-world collision validation and combined performance remain unmeasured.
The default one-construction operation cap also means an optimistic retry may
abort safely; the future Room adapter must reconcile uncertain results.

Publication review: movement commits advance the same host revision checked by
`confirmPoses`, so an interleaved movement sample can supersede an in-flight NPC
frame. Do not relax that fence or the strict rate gate to hide this. Lifecycle
coordination/publication architecture and representative mixed-load validation
are required before enabling movement. Latest actual strict result remains v47:
119/120 frames,82 late,last-client p95326.46ms and first-client p95264.42ms.
It predates this code and does not measure movement ingress. No scheduling or
rate-policy change was made. Full-world AI/Ooga/occupancy/riders, actual scene
reclaim/ghost/disconnect presentation and production cost validation remain open.
Activation/burst stay disabled; Tess excluded; nothing merged or deployed.


## Local v50: Room movement inbox and close ordering (inactive)

RoomBodyHandoff now retains one movement sample per existing handoff account.
Authenticated current connection, live phase, live-send marker and request nonce
are required; browser identities, host tokens and timestamps are never accepted.
The durable Room receive time survives retries. A pending sample cannot be replaced
by newer data. Identical retries keep its time and do no writes; changed/lower
samples refuse. Completion retains the host receipt before an ACK can be sent;
closed/replacement sockets receive no ACK. The inbox is bounded by the existing
32-account handoff index,4KiB sample/5KiB row limits, and is deleted atomically with
resolved handoff cleanup. First admission atomically upgrades the handoff row to
v3 so older v2 writers refuse to ignore its pending movement. Missing/orphaned
records fail closed. Server hooks are finite and still have no WebSocket route.

The host now has a distinct `updateObservedBody` RPC: an older host cannot silently
ignore an observation-time option. Source motion is saved with Room's original
observation time as last presence, while registry/host processing clocks remain
current. Observations before prior presence or after host processing refuse.
The command digest binds that observation time. A delayed in-flight commit cannot
move presence past a previously recorded socket close. Legacy direct updateBody
calls keep their processing-time behavior and are not used by the new coordinator.
Local v49 receipts with the former digest definition fail changed duplicate checks;
no deployed data exists, and an activation/migration plan must reconcile or drain
any retained local test operations rather than assume same-sequence compatibility.

Close reconciliation deliberately does NOT replay a pending sample. It fences the
host generation into grace first, preserving whichever body was already committed.
A late in-flight update either committed before that fence or fails against the
passive generation. Only a trusted host proof of passive/absent state permits
Room to fence the unresolved inbox entry and retire it. This also allows cleanup
of a malformed, never-committed sample without a permanent pending slot. A stale
reply cannot ACK a replacement. The original close deadline remains authoritative;
no later processing time or old snapshot is substituted. Automatic close/census
ordering across the real deployed runner remains uninstalled.

The browser coordinator exposes explicit `captureMovement()` data only. It keeps
one sample until a matching request/generation/sequence ACK, returns copies on
retry, and samples fresh state only after ACK. Capture/serialization callbacks
cannot revive a closed/replaced body. net.js recognizes the ACK. There is no
sampling timer, outgoing movement transmission, enabled capability, or Hub adapter
installation. Existing body/pose movement fences remain.

Verification:77 focused Worker/source checks passed, then the13-test Room suite
passed with an additional coupled actual-Clanker/VirtualHost/Room-inbox case.
That case commits physical movement, loses the host reply, closes Room, and proves
latest committed position, stopped horizontal velocity, retained vertical motion,
original60-second deadline, matching registry/body storage and atomic inbox cleanup.
Representative actual-wire Room inbox row317B, excluding keys/provider overhead.
Other cases cover partial admission writes, durable-format upgrade, lost Room
replies, immutable pending samples, stale/invalid ACKs, replacement connections,
older-host protocol refusal, delayed observation, changed observation digest,
invalid placement, and callback teardown. Build322scripts passed. No Hub/browser/
scene execution; no live Room WebSocket or real cross-DO concurrency/performance
claim. The standard fixture validates destination placement, not swept-path/speed
or complete moving-world collision safety. Earlier passing logs are retained.

A new finite logical model (`worker/eval/publication-movement.mjs`) exercises the
actual publisher/Room rate gate with1200 authored NPC signals,20ms preparation,
1ms confirmation and shared-revision mutations at0/1/4/15Hz. With no movement it
publishes1199/1200 and76 modeled arrivals exceed250ms after an authored20ms downstream
budget. At4Hz movement offset25ms it publishes1130/1200 (70 superseded), with
maximum commit age24ms; at15Hz offset0 it publishes1177/1200 (23 superseded), max33ms.
Lower age here accompanies missing publications, not a delivery-gate pass. Timing
phase changes results. All attempt/commit strict rolling-four and125ms minimum-gap
bounds remain intact. This is authored scheduling diagnosis, NOT CPU/network/
full-world throughput or a production probability distribution. Latest actual
workerd result remains v47's failing119/120,82late result; no unchanged rerun.

Remaining: outgoing transport negotiation/rate policy and protocol parser; real
Room/current-socket/census runner wiring; account deletion; full-world AI/Ooga/
occupancy/riders; scene reclaim/ghost/disconnect visuals under the Hub STOP
restriction; combined mixed movement/publication load and production cost gates.
Activation and burst stay disabled; Tess excluded; no merge/deployment/signing.
