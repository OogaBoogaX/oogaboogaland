# Frozen disconnect continuity — inactive draft #467

The approved default is a server-owned frozen body. This replaces disconnected
player physics, not shared NPC simulation. Activation and burst remain disabled;
Tess is excluded. No deployment, provisioning, permanent loop or billing change
is included.

The latest published checkpoint before this pass is signed `2e42d59a886b0a2dca64780b3ac269fe01f0af24`
on draft #467. It preserves v75–v84; the local v85 corrections below are newer.
Earlier numbered sections describe historical checkpoints and may retain
superseded NPC handback language. The current requirement is independent streams.

## Passive NPC interactions and shared forest construction (v94, local)

The updated requirement keeps NPC work, sleep and wandering routines, including
actual scripted screen, office and EntropyLab equipment use. It removes incidental
NPC interactions: combat/projectiles, fire reactions, pokes, blast knockback,
grab/carry behavior, grooming other characters, peer collision and traffic pushes.
Terrain, structural scenery, floors and routine workstation/bed reservations remain;
this is not permission to make actors walk through the island or remove lab jobs.
Independent live player bodies retain their normal controls and interactions.

Hub roster actors now expose a non-enumerable passive policy; authoritative Ooga
and Clanker construction always enables it. Physics mesh registration and weapon
queries exclude passive bodies without hiding their rendered models. Shared movement
and scene contact paths skip passive peers, while controller entry points reject
incidental damage/fire/grabs/pokes. NPC work animation clocks continue but their
projectile emission, hits on companion NPCs and incidental pile-spill effects stop.
Scheduled lab pickup/return/roll, office screen/chair behavior, sleep and private
reservations remain. Legacy browser possession clears combat effects before a body
returns to passive NPC behavior; independent hosted tracks are never possessed. These changes need live integration validation; no new tests
or browser runs were performed under the current implementation-only instruction.

`pool-site-props.js` now supplies the browser and host with the same board geometry
and bounded seeded forest construction. Existing seeds, placement caps, wildlife
starting clearances, obstacle lists and crown-height data are retained. Browser
construction uses the extracted source with its existing cooperative pause adapter;
the Worker exports the same builders. Wildlife updates and presentation remain
separate. This does not yet assemble or install a complete Hub startup factory.

Activation and burst remain disabled. Full startup composition, end-to-end recovery,
strict delivery and production cost gates remain unfinished. No new performance
improvement or runtime equivalence is claimed by syntax/build verification.

## Current architecture: independent NPC and player streams (v85)

Every NPC continues its own track while its owner is online, disconnected or
absent. Player bodies have separate identity, generation, position and lifecycle
records. First login samples the NPC's current position without possessing that
NPC; reconnect samples the retained player body. Grace keeps the frozen player
body and ghosts the existing NPC. Confirmed expiry retires the player body and
makes the already-continuing NPC solid at its own position. No player movement,
AI, ammunition, animations or physics are transferred into an NPC.

The registry now emits departures with the reserved legacy `handback` field null.
Host settlement acknowledges visual departure work without looking up or calling
NPC handover code. Previously stored handback metadata remains readable but is
not executed. The compact simulation interface no longer requires a handover
callback. The public NPC projection already uses the simulation checkpoint
independently of player session lists. The eventual Hub factory must include all
NPCs in that projection and must version its world for these semantics before
activation; no live checkpoint migration or mixed deployment is enabled here.

Server-mode browser playback now follows every NPC roster entry, including those
with old driven markers. Remote player replicas wait for authoritative presence
and generation; ordinary movement alone cannot hide a counterpart or establish
an online body. Frozen-body bindings keep the NPC ghost through grace and restore
its opacity as soon as the server departure begins, independently of the player's
short green beam. Existing red/green name status, raised hand, standard-pose
reclaim and zero-momentum resource reset remain unchanged. Transport census and
original persisted deadlines determine absence; silence in changed movement does
not. The existing local/remote independent-body ghost bindings were retained.

## Shared Ooga source extraction (v86, disabled and untested)

The actual `crew.js` controller now accepts a private authoritative contributor
roster, explicit tint input and checkpointable seeded execution streams. Its
incremental bed planner uses a fixed work count instead of the viewer's available
wall-clock time. Hosted tracks cannot be possessed or turned into network puppets,
and neither browser pause state nor camera animation throttling controls them.
Ordinary browser construction retains its existing random, timing and control
defaults. Character motion constants are shared independently of the browser pilot.

`contributors.js` now exposes a private roster constructor using an explicit clock
and registry. Browser debug filters and local additions are refused for the
authoritative roster. Its bounded activity checkpoint preserves per-repository
timestamps and the first-snapshot markers, validating all entries before restoring
existing actor-held Maps. It does not checkpoint an actor's AI or physical state.

The browser Hub now calls the extracted `npc-bed-routing.js` and
`npc-work-sites.js` rules for actual sleep routes, cave approaches, occupied firing
positions and shot clearance. These are the existing Hub algorithms with explicit
geometry/occupancy providers. `worker/src/ooga-crew.js` imports the actual controller
and shared rules without loading the browser pilot, controls or feeds.

**This is not a complete Hub factory.** Remaining work includes constructing the
actual coupled Hub geometry and interactions outside `scene-hub.js`, capturing
Ooga behavior, planning intent, occupancy and coupled Clanker/world state in a
single bounded recovery checkpoint, and connecting that factory to the disabled
receiver. RNG and activity snapshots do not substitute for those missing fields.
No representative recovery, runtime, browser, cost or strict-delivery validation
was performed in this implementation-only pass. Existing test loaders also need
to load `walk-rules.js` before the pilot/crew in the later testing pass.

## NPC restart continuity (v87, local and unverified)

The user approved rebuilding NPC animations and unfinished routes on host restart.
Preserve logical position, destination, activity and reservations. This is separate
from the player resource-reset policy; NPC inventories and accepted effects are
not discarded merely because their rig is reconstructed. No animation phase or
route-generator continuation is required. The earlier exact-planner experiment
is preserved separately outside the branch and is not installed.

The real `crew.js` controller now exposes `createLogicalCheckpoint` for ordinary
Hub work, wandering and sleep. It records roster identity, positions and motion,
activity/destination, work phases and reserved places, bed identities, inventory,
weapon cooldown, live rounds and deterministic random streams. Restoration resets
poses, walker searches and bed planning, restores claims before checking placement,
and preserves rounds already in flight without calling the firing callback again.
Sitting support offset is retained so a fresh pose does not embed the body in its
support. Bed recovery does not run AI or claim a different bed during restoration.

This API requires stable bed identity providers and a real placement validator;
restoration is only into a fresh private world, which must be discarded on failure.
It rejects unsupported combat, carried, fire/panic, ladder and construction states
rather than silently losing them. Those coupled modes and full Clanker recovery
remain unfinished. The Ooga record must still be composed with contributor activity,
Clanker and shared-world state under the existing combined byte/node limits. This
is not an installed host factory or a completed recovery implementation. No limits,
production bindings or activation flags changed. Runtime recovery, representative
capacity and full-world cost remain unverified; this pass uses syntax/build only.

## Clanker and lab recovery extraction (v88, local and unverified)

The actual Clanker controller now accepts authoritative execution, a supplied
world clock and a placement validator. This mode starts dormant for restore,
uses checkpointable RNG, refuses player possession and remote-player hiding,
and does not let viewer animation throttling or the browser clock control NPC
progress. The Worker imports the source controller and its real agent/wall/rage
modules directly. Server-side sleep glyph rendering is omitted; the sleep
lifecycle remains in controller state for client presentation integration.

`createClankerLogicalCheckpoint` adds job-state recovery using the existing
bounded scalar-delta and buffer codecs. Its version differs from the older
roaming checkpoint and it stores root positions rather than rig continuation.
The controller supplies desk/waiting/doorway reservations, bed assignments and
world scheduling clocks, plus stable authored lab geometry references. Restore
blocks updates until `finishRecovery` rebuilds rigs, checks reciprocal claims
and validates placement against the reconstructed coupled world. Combat, capture,
fire/panic and debug modes remain unsupported and fail closed. Accepted routes
and movement state are retained; no in-flight browser generator is serialized.
The existing 53-actor, 64-KiB component, buffer and shared packing limits remain.
Representative combined capacity has not been measured for this new profile.

`npc-lab-equipment.js` now owns the real Hub pickup, return and die-roll code;
`scene-hub.js` calls that same module. Its separate recovery component keeps item
ownership, table/held placement, settled pickup points and in-flight die state.
It restores held items without replaying pickup, release or rolling actions.
Actor, equipment, contributor activity and Ooga records still require one atomic
combined world checkpoint. The enclosing factory must restore all records into
a private world before finishing recovery and publishing anything.

**The complete Hub factory is still missing.** Real terrain/prop collision,
world-event closures, remaining coupled state, projection and restore ordering
still need extraction from `scene-hub.js` and binding to the disabled receiver.
The new components have build/syntax checks only; no runtime or browser execution,
new tests, benchmark, production-cost evidence or activation is included.

## Combined recovery and HQ construction (v89, local and unverified)

`hub-world-recovery.js` composes actual Ooga, Clanker, contributor and lab-equipment
checkpoint APIs in one bounded envelope. It restores mutable world state and
activity, both actor populations, held/table lab objects, rebuilt Clanker poses,
then placement checks. Both controllers block updates while restore is incomplete.
A failure poisons the coordinator and disposes the private world. Capture returns
a detached snapshot; the existing host byte/node limits apply to the whole record.

The coordinator still requires the complete factory's real `worldState` provider,
whole-world validator and disposal. Remaining mutable geometry, game/event state
and authoritative clock must join that provider. It is not an installed host.
Clanker defaults now start neutral in authoritative mode so activity changes since
original boot cannot change the recovery baseline; activation/restore establishes
the actual working pose. Runtime recovery and combined capacity remain unverified.

The real HQ/basement builder is extracted into `hub-headquarters.js`; the browser
uses that same construction for beds, entrance collision shells, ramps, signs,
benches and hearth. Worker imports expose actual terrain/HQ/solid-prop builders
without browser globals. Cave/interior and islet props, collision/event closures,
and complete simulation/projection construction remain unfinished. No meadow
fixture, fake browser, rate relaxation or activation is used.

After the execution disconnect, all 37 local task files survived. Before any
further edits, they were copied with SHA-256 verification into the v89 reconnected
backup. The attempted documentation/build command had not executed. The resumed
pass performs build/syntax only; no tests, Hub/browser runs or benchmarks.

## Work interiors and office recovery (v90, local and unverified)

The browser now uses `hub-work-interiors.js` for the real EntropyLab, B.C.A.
interior and Lightning Factory mouth. The Worker imports the same builders:
lab stations and pickup anchors retain the authored world transforms; desk and
shelf collision, outlet/shaft collision and the delivery source are unchanged.
The factory model module can load without `window`; its browser canvas-label
functions remain browser-only and are not called by these construction paths.
This does not extract the separate Factory simulation or include Tess.

B.C.A.'s committed abacus state previously lived only in private model closures.
Its source-owned checkpoint now saves each desk's count, carry rod and four
base-seven digits. Restore validates both desks before mutation and rebuilds
bead and monitor geometry from committed values, without replaying `commit()` or
preserving a partial bead animation. Clanker recovery still owns chair heading,
desk occupancy and actor activity. These records are distinct and restored
within the same combined world envelope before actors resume.

The unpublished combined recovery schema advances to version 2 and requires an
explicit ordered list of office checkpoint providers, including an explicit
empty list if the world has no office. Old incomplete envelopes fail closed.
All office data is included under the existing total byte/node bounds; those
bounds were not enlarged. This schema has never been activated in production.

Full-world construction, remaining collision/event closures and receiver binding
are still unfinished. Runtime recovery, full-envelope capacity, live scene
behavior and strict delivery/cost gates remain unverified. This pass runs only
syntax checks and the build, as requested; no new tests or benchmarks, no
activation, deployment or signing attempt.

## Shared cave collision and NPC navigation (v91, local and unverified)

`hub-cave-physics.js` now owns the browser's actual cave shell construction:
rims, HQ lintels, sealed faces, mirror bars, climb masonry bounds and closed-cave
zones. It also owns the same swept gate/ceiling queries, sealed-plane crossings
and closed-zone exit rules. The browser and Worker import that single source;
portal dimensions and the default locked mirror placement no longer have separate
copies. Camera clearance and game-ring collision stay in their existing callers.

`npc-hub-navigation.js` extracts the actual work-fan reservation refresh, detours,
roof/rim exclusions, landing and destination rules, fire avoidance and voluntary
walker clearance. It resolves crew and terrain at query time, so a reconstructed
world or browser revisit does not retain the old instance. World-specific support,
pile collision and destination floor providers remain required. Browser Timechain
floor handling is passed through unchanged. Work zones are derived from actor
reservations and must be refreshed after recovery before simulation resumes.

This advances collision extraction, but does not complete host startup. The real
prop/islet/support and coupled world-event providers still reside partly in the
browser scene; the complete world factory must bind them before the existing
private receiving object can start it. No fallback ground, permissive collision,
empty scene or evaluation adapter has been installed to bypass that gap.

Only build and syntax checks are run in this implementation pass. Runtime/browser
behavior, full-world recovery size and performance/cost validation remain open.
Activation, burst behavior, production bindings and rate limits remain unchanged.

## Islet support and standing-water recovery (v92, local and unverified)

`pool-support.js` is the browser's actual island-frame footing, float/afloat,
covered/overhead, rock/material and conservative box-query implementation. It
requires the real island, authored site and water-level provider. Mempool,
Timechain and Bifröst source geometry modules and their model dependencies now
load without `window`; Worker exports construct their authored sites. This does
not yet assemble the browser's forest scatter, all support providers, wildlife
or each islet's interaction controller into the host.

`pool-hydrology.js` extracts standing-water dynamics from the existing water
renderer. Both paths use the same backlog-to-level mapping, bounded easing,
flood-stage hysteresis, sampled culvert banks and surface queries. The browser
retains its existing effects, block-cube queue, ripple and debug behavior. The
host mode uses no renderer and owns its physical level query; it rejects invalid
or conflicting timestamped readings, ignores older readings, rejects backward
clock steps and limits steps to 250 ms. Viewer resume/preview operations are
unavailable in that mode. These checks are local controller boundaries, not a new
public feed endpoint or production subscription.

Its fixed 13-value checkpoint preserves target, eased/shown/flood levels, stage,
reading freshness, backlog, status and controller time. Derived channel widths
are rebuilt from the authored terrain after restoration. The unpublished combined
recovery envelope advances to v3 and requires authoritative hydrology, restored
before mutable world state and actors. Whole-envelope byte/node limits remain
unchanged. This records standing-water physics, not the browser's visual block
queue; durable world-event intake/effect delivery still needs completion.

Host startup is still incomplete: remaining prop/scatter and coupled support,
world event intake, complete actor/projection construction and the receiving
object's real factory binding remain open. Nothing has been activated. This pass
has build/syntax verification only; no new tests, runtime probes or cost runs.

## Fenced backlog intake (v93, local and unverified)

The private receiving object exposes `ingestWorldInput` only through the trusted
same-application binding. It has no HTTP or browser-forwarding route. The host
checks the exact live owner/fence/world, finite run, lease, clock and bounded lag
inside its storage transaction. Inputs are a strict 256-byte backlog-reading
schema; there is no arbitrary command or user payload. Intake does not renew the
lease, start a run or enable any feed/polling service.

`hub-world-inputs.js` retains one coalesced latest standing-backlog reading, with
its observed, accepted and effective timestamps. Newer readings replace the
pending reading; identical retries return retained, older readings return stale,
and conflicting same-timestamp data is rejected. This latest-value policy is
specific to standing backlog snapshots and must not be used for donation or
inventory events. A due reading is applied to the real hydrology controller and
cleared within the next simulation checkpoint. Pending intake and hydrology now
share unpublished combined envelope v4 under the existing total limits.

Simulation steps receive the durable wall cursor separately from simulation time;
the compact adapter forwards it. Input draining uses the wall cursor so explicit
paused-outage recovery does not delay old accepted readings, while NPC logical
time retains its established pause behavior. A full factory must bind
`enqueueInput` to the source-owned input controller, drain it before stepping
hydrology/actors, and pass the wall cursor to hydrology. Missing adapters fail
closed. That complete factory is still unfinished: this intake boundary does not
by itself make startup ready or create a production data feed.

Build/syntax only in this pass; no new tests or runtime/cost claims. Remaining
prop/scatter/support assembly, other world-event intake, factory construction and
projection/receiver integration remain open. Activation and strict rate policy
stay disabled/unchanged respectively.

## Local lifecycle wiring (v85, disabled and untested)

`createVirtualWorldClass(createHost)` supplies the private Durable Object lifecycle
around the existing real host/Room interfaces. It implements finite startup with
a retained operation identity, exact Room/world attachment, fenced restart
recovery, Room notification ingress, a single production timer and independent
single-flight publication, durable fault shutdown, and bounded explicit
retirement of four retained handoffs per call. Retirement preserves voice and
refuses release before bodies and migration receipts are drained. Startup is a
private RPC; HTTP returns 404. No join starts a world or extends its run.

The v87 local follow-up retains the retirement intent across the host's final
release commit, so a lost reply can finish the same release. A completed startup
request returns its stopped receipt instead of starting another paid run. A new
explicit request must name the exact drained, released `previousFence`, which is
retained before `begin` for crash reconciliation. Replaying an older request after
subsequent runs cannot match that predecessor. Existing maximum-lag
and explicit paused-recovery requirements still apply; no automatic renewal or
outage-time catch-up policy was added. This lifecycle change has syntax/build
checks only, not runtime or race verification.

The class is not exported by the Worker and has no deployment binding. It still
requires the **real complete Hub host factory**; a restricted roaming evaluator
is not substituted. Full geometry, work/seat/game state and full roster recovery
remain unresolved there. The existing inactive browser adapter is still disabled.
Thus this is lifecycle wiring, not a code-complete live Hub implementation.

At the user's request, no tests were added or run during this pass. Existing
handover-oriented assertions describe superseded behavior and need reconciliation
in the later testing phase. Cheap syntax/build checks are recorded in the local
handoff. Latest measured strict delivery remains failed (v82); no new performance,
production cost, live Hub, collision or browser validation has been performed.
No activation, deployment, rate relaxation, Tess edit or external agent work.

The v73 checkpoint verifies the reclaim coordinator, body decoder and
Clanker controls together, and fixes input-listener cleanup when scene detachment
throws. The v72 untouched-viewer quiescence hook and connection-bound receipts
remain. Its client preview remains off. Live Hub body restoration, full-world
validation and the strict publication/cost gates are still unfinished; this is
not activation-ready.

The combined controller check uses actual source modules over an empty authored
meadow with fixture DOM/camera services. It verifies hidden preparation, no
gravity or control before the committed live receipt, stale-generation refusal,
duplicate-receipt handling, independent NPC ownership, movement capture, and
cleanup after server stop, scene leave and socket close. It does not run the Hub,
a browser or production terrain and does not validate visual appearance. The
detachment regression reproduced 16 retained input listeners; disposal now fences
new attachment before cleanup and removes listeners even when release throws.
The exception still propagates to the reclaim owner rather than acknowledging
uncertain cleanup as successful.

### Historical movement transport boundary (v74 local audit)

The private `Room.stageBodyMovement`/`RoomBodyHandoff.receiveMovement` hooks accept
a bounded checkpoint of up to 4 KiB. They are not WebSocket ingress. The ordinary
`parseClientMessage` boundary allows 256 UTF-16 code units for non-chat messages
and has no `body-motion` case. Oversized non-chat text returns `false`, which
closes the socket; smaller unknown messages are ignored. Merely calling
`bodyReclaim.captureMovement()` from Hub controls would not deliver durable
movement. Do not raise the ordinary message limit or repurpose pose/voice frames
to hide this missing integration.

An offline candidate for the current Clanker tuple retains all seven floating
point values as binary64 plus its two bounded integer slots: 58 binary bytes,
80 base64 characters. With a fixed message type, 32-character request nonce and
maximum-width sequence, the proposed JSON envelope is 184 ASCII characters.
This is format arithmetic, not a verified running protocol. Omitting owner,
world and profile is safe only if the server reconstructs them from the exact
authenticated current connection and retained handoff record, validates the
body with that profile, and preserves existing ownership and ACK ordering.
Other character schemas need their own explicit versions. No candidate parser,
capability, sender or rate change has been enabled.

`worker/eval/body-movement-wire.mjs` preserves the local audit. Its first run
failed during static-profile fixture placement; the corrected support-plane run
then failed on a cross-VM array comparison. The comparison has been corrected
by inspection, but further execution is stopped under the test rule. No complete
size table or round-trip pass is claimed. Actual ingress cost, cadence, replay
fencing and collision validation remain required before connecting this path.

### v75: compact movement and Hub attachment (inactive)

`body-motion.js` now implements the 58-byte Clanker payload and 184-character
maximum envelope without changing `MESSAGE_MAX`. Seven binary64 values retain
signed zero; jump count and flags occupy one byte each. Account, world, profile
and owner are reconstructed from the authenticated connection's retained grant.
Other character formats are refused. The parser accepts only the exact versioned
envelope and canonical encoding; the host's existing body decoder remains the
gameplay/collision validator before durable acceptance.

The browser sender requires both its disabled local preview and explicit Room
capability. It captures no faster than every 250 ms, retains one unresolved
sample, retries that same sequence until acknowledged, and suppresses unchanged
accepted checkpoints. The Room retains the same single pending sample and a
250 ms write interval across wake. The existing movement token bucket remains
the ingress prefilter. Ordinary pose and voice protocols are unchanged.

Only a host receipt permits the public player attachment to advance or the
browser to receive its movement ACK. Attachment failure prevents ACK; an exact
retry repairs presentation before acknowledging. A wake with a newer pending
sample preserves the attachment's last accepted position instead of jumping
back to the login grant. A connection-bound presented-request marker prevents
that optimization from skipping a replacement grant. Body release clears the
public body while retaining the socket and voice session.

The disabled Hub adapter maps the authenticated character to the existing NPC
owner, creates a separate Clanker body using Hub terrain queries and fixed
`hub-terrain-body-1` profile version, and attaches the existing controls only
through the reclaim protocol. It unregisters on scene leave without disposing a
newer scene's adapter. Missing owner/world/profile compatibility fails closed.
This source integration has not been run in Hub or a browser under the existing
STOP restriction; placement, overlap, scene transitions and visuals remain
unverified there.

Focused checks cover the new codec, inbox pacing and identity reconstruction,
actual Room socket ingress, pending-sample wake, attachment-failure repair and
idle capture suppression. The new Room fixture initially used an object instead
of the source schema's profile string; it passed after that fixture correction.
The separate v74 audit remains stopped and was not rerun. These checks do not
measure production CPU or writes. Remaining work includes trusted full-world
startup/profile mapping, a bounded event coordinator to drain the Room inbox
through the host, Ooga restoration, deadline scheduling, and combined throughput
and cost validation. No production binding, alarm loop or activation was added.

### v76: bounded event coordination (local, inactive)

`Room.bodyWork` inventories the existing durable outboxes under the current
Room authority. It closes expired preparations at their original deadline and
missing sockets at the latest durable observation, including a later movement
sample. It exposes the earliest remaining handshake deadline and exact private
session refs to the trusted coordinator, never to a browser. Queues remain
bounded by the existing 32-account cap. Frozen bodies whose outboxes have been
retired do not generate work.

`drainBodyEvents` processes at most four accounts per explicit invocation,
prioritizing close reconciliation, then handoff commands, then movement. It
retains the caller's round-robin cursor, refreshes protected refs between
operations, stops on blocked cleanup, and rereads deadlines after activation
changes the preparation window. The existing operation journals handle lost
replies. A trusted runtime must serialize these passes with other host mutation;
the function itself neither admits new accounts nor starts a loop or timer.

A small durable Room marker is written before the pass mutates the host. Only
successful durable public-frame retention clears that exact marker revision.
If cleanup removes the last outbox row and publication then fails, the next pass
still discovers the debt and publishes current state. An older pass cannot
clear a newer marker. The idle path with no debt performs no publication or
writes. This adds two marker writes per successful nonempty pass; inventory
reads and refreshed censuses are bounded but their combined production cost
has not been measured. The four-account cap is a work bound, not a throughput
claim or a replacement for the strict publication gate.

Focused checks cover bounded progress, lost cleanup replies, publication retry
after the last row is retired, marker restart/write failure, original deadline
expiry, and missing-socket recovery after a newer durable movement sample. The
first coordinator test injected a lost reply into an inventory read rather
than the cleanup transaction; that fixture was corrected once and passed.
No Hub/browser or broad test was run. The stopped v74 audit remains stopped.

Full-world startup, actual event routing and earliest-deadline alarm ownership
remain unimplemented. Ooga investigation found that `crew.create({playerName})`
can own a separate actor, but `crew.control` resets its vertical position to the
support plane. Reusing ordinary possession would therefore break frozen-airborne
reclaim; a source-owned restore path and independent pilot attachment are still
required. No Ooga behavior was changed in this increment.

### v77: independent Ooga recovery (local, inactive)

`ooga-body.js` defines an exact, versioned identity/position/equipment record.
There is no rig, animation, velocity, ammunition, fuel or health continuation.
The scene supplies a canonical world/profile/name, terrain support and standing
shape clearance. Missing support or overlap refuses recovery rather than guessing
a new location. A fresh `crew.create({playerName})` supplies one independent actor
with separate health and weapon maps; the NPC is not controlled or modified.

Preparation remains hidden with no registered input or crew updates. Activation
waits for the reclaim coordinator's committed live receipt, checks clearance again,
then restores feet height after ordinary possession would snap it to the floor.
Hop velocity and held actions start at zero. The source crew resumes gravity only
when the eventual scene owner calls its update. Partial input registration and
failed activation are cleaned up; a failed or suspended body cannot be reactivated.
The adapter requires explicit attach/detach callbacks. No Hub pilot attachment is
installed yet, and actual source crew geometry/gravity has not been executed under
the Hub/browser STOP restriction. Its controller tests use an interface fixture.

`createOogaBodySessions` commits minimal Ooga body records with the existing host
session transaction. Authenticated movement cannot alter identity or equipment.
Placement is validated before acceptance and transfer; failed writes leave both
session and body unchanged. Frozen records run no passive physics. The shared
body store's previous Clanker-only kind guard now admits Ooga while retaining
profile-specific validation and all existing byte/node/account bounds. This is
an Ooga-only transaction adapter, not yet a mixed-character runtime.

Room's committed-position projection accepts Ooga feet coordinates. Pending
private movement does not affect public presence; only the host receipt advances
the socket attachment. Wake preserves the accepted position. The compact socket
codec and browser sender remain Clanker-only: this Ooga test uses the private
Room API, not a working Ooga WebSocket path.

Five focused Ooga checks pass, plus the focused actual Room projection/wake check.
The host check uses actual VirtualHost/storage/session modules with fixture world
and clearance callbacks. It covers atomic write failure, obstructed placement,
freeze and owner restart with the original 60-second deadline. Its first run found
the shared store's Clanker-only guard; the guard was corrected once and the test
passed. No Hub/browser, broad suite or stopped v74 audit was run.

Measured UTF-8 JSON bytes in that single-account fixture (including the body
record's encoding/envelope and movement receipt, excluding provider internals):

| State | Body checkpoint | Session | Full body record | Session + body record | All stored values | Storage key bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Accepted movement | 289 | 443 | 629 | 1,072 | 1,527 | 37 |
| Offered after restart | 289 | 448 | 476 | 924 | 1,379 | 37 |

Thus removing pose and resources does not guarantee the full combined state fits
1 KiB. Keep the bounded separate records for now. These are fixture observations,
not worst-case capacity or provider billing measurements; shared host metadata is
included only in “All stored values.” Max-width identity/position codec coverage
does not substitute for worst-case combined session and movement-journal sizing.

Remaining integration includes canonical full-world startup/profile mapping,
mixed character routing, Ooga socket capture, independent pilot attachment,
trusted event/alarm ownership and end-to-end late join/reclaim presentation.
Strict delivery, representative capacity and production cost validation remain
open. Activation and burst remain disabled; no limits or deployed routes changed.

### v78: Ooga socket capture and Hub control wiring (local, inactive)

`ooga-motion.js` packs four exact binary64 coordinates and two equipment bytes:
34 binary bytes, 48 base64 characters, and a maximum 157-character JSON envelope.
Signed zero is retained. No account, world, profile, owner, timestamp or resource
value is sent. Room reconstructs identity from the authenticated retained grant.
Unknown flag bits, invalid equipment combinations, nonfinite coordinates and
noncanonical base64 are refused. This preserves equipment data in transit; the
host still decides whether a gameplay state change is authorized.

The additional `ooga-motion=1` query and `host-ooga-motion-v1` welcome capability
are required alongside the existing movement/reclaim negotiation and disabled
preview gates. Older Clanker-only clients receive no Ooga capability. Socket
attachments preserve the negotiation across wake. Ooga shares the existing
single-sample inbox, 250 ms pacing, host-receipt ACK, stale-connection fencing and
committed-position projection. No message/rate/account limit was raised. The
browser retries the same pending capture, then suppresses unchanged ACKed state.

The disabled Hub adapter now selects an Ooga branch with fixed
`hub-ooga-standing-1` profile and source terrain/standing-clearance queries.
It creates a separate crew, reserves local presentation, ghosts the existing NPC,
and binds the pilot to the already activated body without possessing it again.
Movement capture, ordinary guide selection and footsteps use that controlled
actor. The NPC crew and its synchronization remain separate. Pilot release and
disposal call the reclaim owner; detach restores the prior systems and callbacks.
Another possession cannot silently switch away from this authoritative body.

This is source integration only. Hub/pilot execution remains prohibited by the
existing STOP. It is not evidence of correct live collision, visuals, camera,
scene transitions, interaction or cleanup. Equipment changes still require an
authenticated host command: the current Ooga host adapter rejects a movement
sample which changes equipment. Some Hub interaction helpers still target the
original crew directly. These are explicit integration gaps, not supported
features or reasons to activate the preview. The fixed browser profile also needs
the matching authoritative full-world implementation before a grant can succeed.

Three focused Ooga checks pass: exact codec/parser bounds, actual net capture and
ACK handling, and actual Room socket ingestion/wake/late join. The net fixture's
first ACK omitted the required generation; the fixture was corrected once and the
allowed retry passed. Four existing focused Clanker codec/inbox/Room compatibility
checks also pass. No Hub/browser, broad suite, production benchmark, stopped audit
or external Claude transmission was performed. Full-world boot, canonical routing,
mixed body adapters, alarm ownership and strict delivery/cost gates remain open.

### v79: mixed-body routing and equipment selection (local, inactive)

The Ooga adapter now accepts weapon selection, carry/combat mode, selected slot
and wearing/removing an already-owned jetpack through the authenticated movement
sample. It still refuses changes to weapon ownership, jetpack ownership and the
unlimited-resource entitlement. The strict codec rejects equipping an unowned
item. Host motion, equipment, body record and replay receipt commit atomically;
duplicate samples cannot refresh presence or replace an earlier selection. The
registry uses the original server observation time, so processing a delayed
selection cannot extend a known disconnect deadline. Resource quantities and
animation continuation remain absent. This closes the selection gap described
in v78; acquiring new equipment still needs a trusted entitlement path.

`createMixedBodySessions` composes the source Ooga and Clanker adapters inside the
same existing host/body-storage transaction. Each sees only its own body/session
rows. Capture checks that every current or departing body is supplied exactly
once by its correct adapter, then orders the combined result by generation.
There is no independent per-kind commit or partial save. Partial startup and
disposal failures clean up every constructed child; a controller/capture failure
poisons the attempt. Clanker construction debt shares the existing operation
object across optimistic retries, and the combined passive budget takes the
smaller source limit. Account, storage and delivery bounds are unchanged.

This is body routing, not world startup. The caller must supply both source
adapters and a real compatible world. The new integration test uses the actual
Clanker controller over authored props and the actual Ooga record adapter with
fixture clearance/world callbacks. It verifies mixed admission, unchanged other
body state, rollback, cleanup and restart recovery. It does not run Hub or claim
representative full-world CPU, collisions or cost. Additional filtered session
views and captures need combined resource measurement before activation.

Hub jetpack selection and direct twirl/tint controls now target the independent
player's crew; game combat-mode changes reach that crew too. Its context omits
the shared NPC resident callback: that callback owns Sani's seat and can relocate
him, so invoking it from the separate player would alter NPC state and recovery
position. The existing NPC shot recorder uses object identity and does not record
the separate player's shots as NPC events. Ordinary player shots retain their
existing networking path. These scene changes are reviewed source only under the
Hub/browser STOP restriction.

Six unique focused checks pass for equipment/replay/restart, mixed routing and
partial startup, plus existing Clanker movement, delayed-observation deadlines
and registry equipment recovery. No new test failed in this increment. The
single-account encoded sizes from v77 remain unchanged in this fixture.

Still missing: the authoritative full Hub simulation and canonical account/world/
profile boot, deployed event/alarm ownership, trusted entitlement acquisition,
remaining seating/game/scene-transition integration, and integrated performance/
cost validation. There is no production host-runtime implementation behind the
finite evaluation workers. Activation and burst remain disabled, and those
evaluation fixtures must not be used as the real-world startup implementation.

### v80: trusted first-login placement and Room staging (local, inactive)

`Room.bodyCandidate` derives the account, canonical body ID and character handle
from its current authenticated socket. It requires the negotiated movement and
handoff capabilities and a compatible room; a stale socket cannot prepare a new
body. `stageWorldBody` is one explicit server-side admission event. It retains
the preparation in the existing Room outbox and reconciles a lost staging reply
by reading that outbox. Repeated calls reuse retained work instead of creating a
second preparation. There is no new browser-selected claim, route or timer.

`VirtualHost.prepareWorldBody` reads the retained kind and generation without
changing the world. Fresh admission requires the source simulation's synchronous
`playerSpawn(state, identity)` adapter. The position is sampled again inside the
offer transaction, after asset preparation, so a moving NPC's earlier position
is not used. The source returns exactly `npcId`, `feetOffset`, `zone` and `body`.
The host checks the canonical NPC mapping, kind, x/z/yaw and projected y minus
the authored root-to-feet offset; zero momentum is enforced. An explicit null
NPC mapping permits the world's safe spawn rule without creating an NPC. The
source must supply valid equipment and standing-shape placement through the body
adapter. No NPC checkpoint or track is changed by admission. Compact simulation
wrappers preserve this hook, reject asynchronous results and expose frozen query
state within a transaction.

Reconnect uses the retained body and original deadline, including retained kind;
it does not call the first-login spawn adapter. Recovery that expires the retained
generation refuses the stale preparation rather than silently spawning again.
Source claims omit legacy `zone`/`body` fields so an older host cannot accidentally
treat them as an ordinary browser handoff. New claims cannot include those fields.

Three focused checks passed: actual host admission/reclaim against a moving NPC
fixture; actual Room capability/current-socket staging and lost-reply recovery
with a stub host preparation; and packed transaction query isolation. The host
fixture initially used the wrong `npcFor` callback signature; correcting that
fixture and the single permitted retry passed. These are not a live Hub test or
a complete production-world test.

Additional source-only Hub fixes route magazine pickup, ammo cleanup, fire-roll
controls, underground jetpack removal, magazine HUD and first-person fire display
through the independent player's owning crew. Bed-landing clearance reads the
pilot's current body. This leaves the NPC roster and its gameplay state separate.
These paths remain unexecuted under the existing Hub/browser testing restriction.

Still missing: a real full-world `playerSpawn` implementation and canonical
startup/profile mapping (including Clanker source seeding), trusted event/alarm
routing, remaining seat/game/scene-transition interactions, and representative
throughput/cost validation. The new explicit admission function is not installed
as a production handler. The prior strict four-Hz failure remains an activation
blocker. No activation, burst, rate or storage bounds changed.

### v81: fenced world ticks and explicit publication pacing (local, inactive)

`tickRoomWorld` now reads the host revision before requesting Room's authenticated
body census. A pending handoff, uncertain close or inconsistent census blocks the
tick. `VirtualHost.tick` accepts the observed revision and compares it inside
every storage attempt, before session recovery or world stepping. If an admission,
movement or live acknowledgement committed while the census was in flight, the
tick returns superseded without inferring a disconnect, advancing NPCs or writing
the checkpoint. The caller must drain the durable Room work before another
explicit tick; this helper installs no loop or retry policy. Token inputs are
copied before an asynchronous storage callback can observe caller mutations.

The focused race test exercises concurrent admission and an optimistic storage
retry using the actual host with a rollback-capable store. Both preserve the
new live body and discard speculative simulation. A fresh census advances the
world normally. This is an authored data-only world, not full Hub simulation.

`publishHostPoses` accepts an optional `notBefore`, explicit `waitUntil` callback
and clock for the finite publication runner. At entry the requested wait must
be no more than one 250 ms delivery interval. Preparation can happen before that
deadline; final host confirmation remains after the wait. Early/rewound clocks
fail closed; reaching the finite run end suppresses publication. Room independently
checks its durable rate budget and ownership, so a caller cannot select an
earlier commit time. No timer is installed by the bridge itself. Tests exercise
post-wait confirmation, takeover during the wait, superseded revisions, expiry,
clock faults and the unchanged 250 ms Room gate. One fixture initially reached
its lease expiry before the intended concurrent-write case; correcting its clock
setup and the one permitted retry passed.

This makes the pacing contract explicit outside the evaluator, but does not
demonstrate a performance improvement. Re-reading the preserved v66/v68 evidence
shows consecutive publication gaps of 254–259 ms: positive confirmation and Room
work after the strict gate accumulate delay. No benchmark was rerun, rate policy
relaxed, confirmation moved earlier, burst enabled or production cost inferred.
The strict four-Hz gate remains unsatisfied. Full-world source startup, geometry,
profile mapping and actual runner/event wiring remain separate unfinished work.

### v82: finite event dispatcher and fresh strict measurement (local, inactive)

`openHostWorldRunner` attaches read-only to an already acquired host and its
matching Room authority. It checks the world, owner, epoch, format, finite run
deadline, strict cadence and host revision. It never begins a run, takes over,
renews a run, installs a timer or creates a cloud binding. `worldRunState` supplies
metadata without projecting poses, so a runner can attach while an expired body
correctly blocks pose publication and then reconcile that body's deadline.

The dispatcher routes explicit admission, body-event, tick and publish calls.
It accepts one mutation at a time, returns `busy` without accepting/queuing another
identity or command, and uses the durable Room outbox on the next explicit event.
Each body pass drains at most four accounts, reconciles the fenced census and
retains the committed presentation, including after restart or a lost reply.
The next original body deadline is returned to the caller; there is no recurring
frozen-body loop. Ordinary ticks do not rewrite body presence. Unknown pending
work or a due body deadline blocks ticking/publication until an explicit body
pass resolves it. An uncertain error closes the local dispatcher, leaving durable
body state for recovery. Local close does not release a body, voice or Room owner.

Publication has its own single in-flight request, allowing simulation to advance
while waiting. Only the latest pending revision is retained; final confirmation
rejects a frame superseded during the wait. Three focused checks pass using the
actual host, session registry, Room NPC authority and body-presence stores with an
authored transport census: frozen expiry/restart with no physics, bounded busy/
error behavior, and concurrent production with stale-frame rejection. They do
not execute Hub or represent full WebSocket admission/reclaim coverage.

The strict local workerd measurement now uses `publishHostPoses`' explicit pacing
instead of injecting the wait into its final-confirmation wrapper. One finite
120-sweep/30-second run used 53 restricted roaming Clankers, 30 frozen body records
and 32 protocol clients (31 acknowledging decoders, one stalled). It emitted
104 sweeps, superseded 16, and delivered 85 emitted sweeps later than 250 ms.
First-client age was 271.1 ms p95; last-client age was 336.4 ms p95. The strict
delivery gate **failed**. No unchanged rerun followed. The initial sandbox attempt
could not open localhost (`listen EPERM`); the permitted localhost-only run
completed with zero outbound requests and zero runtime log errors.

Measured host transaction wall time was 82.95 ms p95 (96.25 ms maximum); all 120
simulation steps completed within their target deadlines. The host-side counter
recorded 150 writes and 7,915,917 serialized bytes in the window: 5 writes per
target second. These counters exclude Room storage writes and are not billed CPU
or billing units. Aggregate transport counted 24,733,135 bytes/3,256 deliveries,
including the harness's warmup; this is not a per-browser CPU measurement.
Rollback and persisted restart checks retained all 30 bodies and 120 NPC steps.
The cached runtime was Miniflare 5.20261001.0-alpha, not the declared production
Wrangler. Raw local evidence: `verification-v82-strict-local.json` and the derived
`verification-v82-strict-summary.json` alongside the checkout.

This dispatcher is not exported from the deployed Worker and has no production
event/alarm binding. Full Hub construction remains unfinished: the browser crew
and scene own additional interaction state, seats/reservations and geometry that
the restricted adapters do not capture. A real world factory/profile mapping,
Clanker spawn seeding, complete interaction recovery and production runner wiring
remain necessary. The measurement exercises the pacing bridge, not this new
dispatcher's complete end-to-end route. Activation and burst remain disabled.

### v83: Room event ingress and bounded admission discovery (local, inactive)

Room now has a gated wake path for current joins, authority changes/recovery,
durably accepted handoff/movement work and persisted closes. The optional
`VIRTUAL_WORLD.getByName('island').notifyRoomWorld(hint)` RPC uses one stable object
name across world versions. Its hint contains only server-owned world, Room
revision, owner, epoch and finite run deadline; no player identity, command,
position, equipment or voice data. The RPC is not awaited inside Room's
concurrency block because the receiver must call back into Room. It requires
`VIRTUAL_HOST_RUNNER_PREVIEW`, all existing host/body/movement preview flags and
an explicit binding. None is enabled or added to deployment configuration here.

The notifier holds one request, one coalesced flag and at most one timer. Sends
are at least 250 ms apart; an external event grants at most two further attempts,
and a busy/remaining-work response cannot sustain a permanent retry loop. An
uncertain error schedules no retry; a subsequent actual event may try again,
with three failures quiescing that notifier. Authority changes dispose the old
notifier. These are expendable wake hints: existing durable inbox/close records
and authenticated socket attachments remain the source of truth. No additional
durable row is written per movement merely to notify the host.

`bodyAdmissionCandidates` reads at most the bounded Room roster/outbox and returns
four current socket identities plus a `more` flag. Existing outboxes, nonempty
bodies, closing/declined sockets and migration quiescence are excluded. The
receiver helper `dispatchRoomWorldHint` checks its own retained host/Room tickets,
reconciles body work, obtains that current inventory, validates every identity
before staging, and requests Ooga admission through the existing trusted path.
The notification cannot select a different account, body kind, Room or world.

Eight focused checks passed: actual Room gating/committed notification/admission
inventory and replacement sockets; the existing missing-transport wake check;
fake-clock notifier coalescing/pacing/failure/expiry; and receiver fencing plus
bounded inventory validation. The Room wiring test uses a recording notifier;
the notifier and receiver have separate focused checks. This is not an actual
cross-object RPC or full Hub end-to-end test. The three additional compatibility
checks cover host-receipted movement, authenticated staging/close ordering and
voice-preserving decline/restart cleanup. The build (328 scripts), 32 changed
JavaScript syntax checks and diff whitespace check pass. No new test failed.

Still required before activation: the receiving Durable Object backed by the
real Hub world factory, its fixed-world bootstrap/migration, a bounded rescan of
durable work **and current admissions** when a hint is lost or follow-up budget
is exhausted, finite-run tick/deadline scheduling and cleanup. No deployment
binding, receiver class or always-on process is installed here. In particular,
the notifier alone cannot guarantee first-login progress after a failed wake.
Delivery and combined costs must be remeasured after the full path is wired;
the failed v82 result remains the current timing evidence. Hub/browser STOP and
disabled activation/burst remain in force; Tess and voice behavior are unchanged.

### v84: receiver recovery increment — paused at user cost boundary

Local, uncommitted `HostWorldReceiver` adds finite persisted recovery scheduling
for an already acquired host/Room pair. It cannot begin or renew a world from a
notification. It reserves an attempt and alarm before external work, fences
hints against retained tickets, resumes bounded admission scans after restart,
and pauses after three failures. A run permits at most 3,600 scan attempts,
spaced at least 250 ms; quiet recovery backstops use 1 second. This is inactive:
no Worker export, deployment binding, real Hub factory or automatic startup exists.
The SQLite adapter follows the provider's
[transaction contract](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction)
and preserves retryable overlapping alarm delivery per the
[alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/).
The new scheduling itself is not yet verified in workerd/SQLite.

Recovery scans request `bodies({refresh:false})`: current Room census is still
checked, but unchanged bodies do not cause repeated presentation writes or
socket delivery in a retained runner. Restart and actual body changes still
reconcile presentation. Body-frame lease expiry/late-join freshness remains an
integration concern for the eventual shared world driver; this does not claim
complete static presentation or full Hub startup.

Five new receiver interface tests pass (lost hints/restart, fencing/budgets,
concurrency, failure limits and atomic reservation using an authored storage
adapter). One extended actual host/Room-authority runner test passes, including
no body writes/delivery on an unchanged rescan. After the stop request, the user explicitly authorized one signed checkpoint
and push. Essential publication checks passed: the build (328 scripts), all 34
changed JavaScript syntax checks and whitespace checks. No broad tests or new
performance run were performed. Receiver metadata adds
one bounded row and up to two row writes per attempted scan plus alarm changes;
combined billed cost is unmeasured. The prior strict delivery failure remains.

Work paused at the user's explicit credit/cost boundary. Preserve this increment
and all earlier checkpoints, do not activate, and await direction before more
implementation, tests or agents. The separately authorized checkpoint
publication does not authorize further feature work.

## Preservation and reversion

All previous task work is preserved in signed commit
`ea11f818712f3f29ba4a43aa3238a48fde0ce210`, branch
`checkpoint/377-physics-before-freeze-20261105`, plus a verified local Git bundle.
See [the checkpoint inventory](virtual-host-physics-checkpoint.md). To explore
physics again, create an isolated checkout at that commit. Do not reset the active
branch or overwrite later work. Returning to that code would also restore its
unfinished integration and failed delivery gate; it does not authorize activation.

## Durable state and lifecycle

- The host's atomic session/body records retain identity, account, generation,
  private ownership token, world/zone, last accepted position/facing, equipment
  selection/form, occupancy and the absolute deadline. Observers never own this
  record. The current bounded separate body records remain.
- Only authenticated, ordered, validated movement committed before the close can
  change the saved position. Room's observation time is separate from processing
  time. A queued unaccepted sample cannot replay after close; uncertain committed
  replies reconcile against the existing durable receipt.
- Disconnect clears x/y/z velocity and holds. The record stays at that location,
  including in midair. No elapsed-time catch-up, controller construction or
  collision step occurs for a frozen body. Unchanged lifecycle sweeps leave its
  body fields and cursor unchanged. Shared NPC operations still have their own
  CPU, storage and delivery costs.
- The original 60-second deadline survives restart, duplicate close, offers and
  lost acknowledgements. Expiry emits one durable green-glyph departure and
  releases occupancy. It hands back only to an existing NPC; it does not spawn one.
  A late observer must use the logical deadline and cannot replay an expired beam.
- An offer and the bounded starting interval keep the body frozen. The exact
  current generation and durable live acknowledgement are required for control.
  Old sessions, changed retries and old-host receipts remain fenced. Schema 5 and
  `host-session-v5` refuse previous physics session formats without implicit
  migration. Older clients reject the new grant; activation must require a
  compatible client and reconcile old local state explicitly.

Restoration does not depend on another viewer remaining online. The server keeps
the position. On a new connection or wake it reads the durable record and its
deadline before issuing any grant. The lifecycle supports explicit event-driven
expiry; a production earliest-deadline alarm and orchestration are **not wired**.
There must be no polling or repeated frame solely to keep a frozen body present.

The inactive `VirtualHost.reconcileBodies` entry point now accepts trusted close
observations and the authenticated transport census independently of NPC ticks.
It commits changed session/body state and existing-NPC handbacks atomically. A
duplicate event leaves storage and the ownership lease unchanged. Its `wakeAt`
is the earliest applicable body deadline (including a lost-ACK control lease or
finite run end), not a polling cadence. A future alarm owner must reacquire a
valid host fence when necessary; this method never extends the run or ownership.
No alarm is installed by this change.

The inactive Room integration exposes an authenticated bounded census, blocking
absence inference while closed or uncertain handoff rows remain. The runner
reads the host revision before that RPC and compares it inside reconciliation;
a concurrent login, live ACK or movement supersedes the census instead of being
mistaken for a disconnect. This remains an explicit server hook, not a deployed
loop. A separate closed-only cleanup path now accepts the exact retained Room
world/epoch/owner/revision after lease/run expiry. It neither renews that authority
nor sends grants. `retireRecoveredBodyHandoff` uses a current host fence, recovers
or durably cancels uncertain operations, and retires only an exact generation
proved passive or absent. Pending movement is fenced, never replayed. A Room
takeover fences old cleanup calls. The coordinator now resolves its own live or
starting closed reference first: restore the exact no-live-send hold, or apply
its confirmed close through `closeRetainedBody`. A close observed after finite
run end is bounded by that persisted run stop. Both paths protect unrelated live
generations instead of treating one close as an absence census. The coordinator
then rereads the exact reference before retirement. Automatic cleanup scheduling
and reacquisition when only pending departures remain still need integration;
this is not a general expired-run grant permission. The narrow
`abandonBody` rollback itself now works after run end: with current host ownership
and the exact unchanged issued body, it restores the original grace deadline
without extending the run or ownership lease. All live grant/ACK operations remain
closed after run end.

`bodyPresence` reads a complete committed public frame with epoch, revision,
logical deadlines and departure intents. It includes no private ownership token
or packed controller state, refuses overdue lifecycle state until reconciliation,
and caps the complete result at 32 retained records and 32 KiB. It refuses larger
profiles rather than silently dropping records. The existing 64 KiB world profile
admits 30 sessions; future admission/capability wiring must honor both bounds.
Frame `expiresAt` bounds accepting a newly delivered snapshot under its host lease;
it must not become a recurring body refresh requirement. Once accepted, stationary
presentation persists to its absolute logical deadline or a newer authoritative
event. Delayed-frame fencing, event delivery/acknowledgement and scene binding are
still required. A past departure is a tombstone, not permission to replay its beam.

## Reclaim and presentation

The inactive Clanker reclaim adapter builds a fresh standard pose with controls
off, rejects a nonzero-momentum frozen grant, and checks the actual rebuilt hull
against current geometry. A new obstruction or floor above the body refuses
reclaim; it never silently teleports out. If an old support vanished, the saved
position stays unchanged and the restored body becomes airborne with zero speed.
Clearance is checked again before activation because the world can change during
the acknowledgement exchange. Gravity begins only after live control is enabled.
If another uncancellable preparation is still running, or no scene adapter is
installed, a new valid offer is explicitly declined while retaining the single
preparation bound. The final activation transfer must preserve the offered grace
deadline and cannot move server issuance time backward. These checks supplement
local elapsed-time bounds; browser wall time never authorizes control.
Health, ammunition, fuel and animation history use normal fresh-player defaults;
browser weapon/jetpack wiring still needs integration.

Observers should retain a stationary display body with its free arm raised,
open-hand indicator and red name marker. The existing bounded presentation helper
keeps the marker red through offers/starting and changes it to green only for a
committed live generation. It does not run body physics. Actual event delivery,
static scene binding, beam acknowledgement and observer cleanup remain unfinished.
Do not feed the frozen actor through ordinary remote-player extrapolation or AI.
No new collision/seat policy is silently introduced: existing occupancy remains
held until expiry/release; full-world contacts and moving supports need validation.

First login must use the account's NPC position while its independent ghost track
continues (#379). The separate-body and ghost helpers exist, but production account
mapping and full-world placement are not installed. Voice and ordinary live player
movement retain their separate responsibilities.

## Measurement and verification

See [the current SQLite/runtime cost report](virtual-host-frozen-costs.md) for
the post-pivot 30-body recovery trials, combined strict-delivery failure,
conditional live-movement write-cost scenarios and remaining integration gaps.
The measurements below document the earlier in-memory checkpoint.

Finite Node trials use 30 actual restricted Clanker body records and a padded
64 KiB world, in independent authored meadows, with in-memory atomic storage:

| Recovery event | Wall time | Physics steps / rebuilt controllers | Logical key writes | JSON value bytes written |
| --- | ---: | ---: | ---: | ---: |
| Previously confirmed closes, expiry | 5.99 ms | 0 / 0 | 1 | 79,800 |
| Restart discovers closes after expiry | 5.58 ms | 0 / 0 | 31 | 90,692 |
| Restart discovers closes after 250 ms | 5.02 ms | 0 / 0 | 31 | 90,995 |

Each row is **one observation**, not a percentile or worst-case guarantee.
Unknown-close writes atomically neutralize all 30 stored components once. Later
unchanged bodies do not rewrite their component rows. Provider overhead, SQLite,
RPCs, full-world simulation and browser rendering are excluded. Reproduce with
`node worker/eval/clanker-body-sessions.mjs`, `--unknown-close`, and
`--unknown-close --short`. This is not billed CPU or a complete production bill.

The completed focused suites pass 152 distinct checks (66 revised host/reclaim,
59 lifecycle/NPC/Room/presentation, 14 journal/capacity, and 13 Room-handoff
checks). The 322-script build and 19 touched JS/MJS syntax checks pass; generated
HTML is restored and the 20-entry Hub ledger is unchanged.

Focused tests cover 64 simultaneous expiry records with zero physics work,
rollback/retry, original deadlines, stale owners, no forced NPC creation,
independent NPC progress, source-controller freeze, authenticated movement and
lost replies, protocol refusal, zero-momentum reclaim, support loss before apply
or before live ACK, obstruction refusal, resource defaults and red/green markers.
Hub/browser/full/scene checks remain prohibited by the existing STOP restriction.

The event/snapshot increment passes 71 focused host, registry, body-storage and
actual source-controller terrain checks. These cover write rollback, duplicate
no-op events, zero NPC/physics ticks, occupancy and exactly-once existing-NPC
handback, host replacement, lost ACK, finite run end and concurrent late joins.
Thirty-two long-ID/high-precision fixture bodies serialize to 18,822 bytes;
their complete departure frame is 20,157 bytes. These are measured fixture sizes,
not a proof of every permitted metadata combination; runtime byte and record
bounds still reject overflow. Thirty-two concurrent readers return identical
independent frames without writes. Actual Clanker storage also passes the new
event path without constructing an offline controller, including after terrain
support disappears. No production timing or billed-resource claim follows from
these focused tests.

Frozen-body savings do not solve live-movement write amplification. The current
steady movement path can perform five logical key writes per accepted sample
(Room inbox, host root/body/receipt, Room completion), plus lifecycle/retry work.
No production capture cadence is selected or wired. Its accuracy is the last
durably accepted sample, not the final rendered frame: packet loss, queueing and
commit delay can make it older. Unload flushing is not guaranteed. Do not infer
an affordable always-on rate from the frozen-body trial.

The prior restricted workerd strict-delivery trial still failed: 119/120 frames,
82 late, first-client p95 264.42 ms and last-client p95 326.46 ms. It predates the
pivot and is not a measurement of the new code. No rate threshold, capacity,
strict four-Hz policy or activation gate was relaxed.

## Remaining activation gates

Authenticated live routing and capture policy, close-before-census orchestration,
durable deadline wakeup/cleanup, bounded late-join/static body delivery, full-world
Ooga/Clanker AI and collision/occupancy, independent NPC mapping, live scene and
weapon/jetpack restoration, abrupt-failure tests, strict delivery headroom and
combined production CPU/storage/request costs remain open. Full-world geometry,
shared peers and mobile rendering are not covered by the authored fixtures.
Keep the PR in draft and all activation flags off until these are demonstrated.


## Current-base integration

The draft now integrates `rock` at
`e6d69aa4d9d93f1c90bf0a28c8899189d3f160a0` through a normal merge, preserving
signed history and both checkpoint commits. The only textual conflict was the
network fixture's context: it now retains both the base's `voiceBlend` and the
reclaim path's `TextEncoder`. The combined source passes 152 focused checks for
host/session recovery, Room handoff/authority, body adapters and protocol/voice
compatibility. Build and touched-source syntax checks pass. No prohibited
Hub/browser/full/scene checks were run; activation and burst remain disabled.

The next base update, `2eed79e3`, includes the upstream #464 equipment/pose and
#461 hammock fixes. Conflict resolution keeps their visual/rest pose fields
alongside the body-reclaim send gate, and retains both visual/rest fields and
body/NPC authority fields in Room hibernation attachments. Focused regressions
exercise pose blocking until live acknowledgement, forwarding visual/rest data
after acknowledgement, and retaining those fields alongside body fencing across
Room restart. The shared pose/hammock implementation remains the upstream work;
this merge does not reset selected equipment or enable frozen-body presentation.
The combined revision passes 157 focused tests, the 322-script build and 19
changed-source syntax checks. The existing 20-entry test ledger is unchanged.
Hub/browser/full/scene tests remain unrun under the STOP restriction.


## Body storage version 2

Replay metadata is now part of the existing bounded body row, committed with its
position and host root. Steady accepted movement writes root/body once and Room
inbox/completion once each; the first sample also writes a Room marker. A duplicate
makes no host write and does not refresh presence. Receipts follow row compaction
and reset only with a new body generation. Callback errors abort the transaction
even when caught. No component, node, row, account or rate bound increased.

Version 1 envelopes are refused without mutation. There is no implicit migration
or deployed binding. Before any activation, old local preview worlds must be
explicitly drained or migrated with their journal receipts; never delete a live
root to bypass this gate. See [cost evidence](virtual-host-frozen-costs.md).


### Departure-only restart and acknowledgement (v58, inactive)

After the last body expires, an ordinary draining tick can leave only applied
departures in a stopped host. The normal run claim deliberately refuses that
state. `claimBodyCleanup(owner)` now obtains a finite cleanup lease only after
both the run and previous lease have ended, with no held bodies and at least one
already-applied departure. It raises the ownership fence and leaves the original
run end and simulation untouched. It installs no timer and cannot admit players
or resume NPC simulation.

`acknowledgeBodyDepartures(ticket, {world, epoch, revision, ids})` is a trusted
server-only integration hook for acknowledging events after Room durably retains
the presentation. There is no browser route or enabled transport. The entire
receipt is checked before removal: mismatched revision/epoch/world is superseded;
unknown, duplicate, oversized or unapplied IDs are refused. Acknowledgement does
not infer disconnected sessions, sweep due bodies, run handbacks or refresh
remaining body deadlines. Removing the final departure after the run ends also
stops the cleanup lease. Failed writes roll back, and stale receipts cannot
remove later events. A lost final reply is reconciled from durable stopped state;
blindly retrying a stopped owner's ticket correctly fails fencing.

This closes the pending-only host recovery/ACK API gap. The caller must still
implement and verify durable Room receipt retention, bounded delivery, late-join
reconciliation and earliest-deadline scheduling before activation. A raw ID list
or an untrusted browser message is not delivery proof. Removing a host tombstone
before durable Room retention would lose its presentation and is forbidden.


### Durable Room presentation and bounded preview delivery (v59)

`RoomBodyPresence` now commits one complete latest public frame in
`room-body-presence-v1`, before the host acknowledges its departures. The existing
32-record/32-KiB frame bounds remain; the persisted row allows 1 KiB of additional
authority metadata. Exact public schemas reject private tokens, rig components,
unknown fields, duplicate identities/generations, invalid occupancy, and frames
whose freshness extends beyond a retained body's deadline. Room authority is
checked from storage in the same transaction. Host epoch, owner and revision
fence older writes; a newer host epoch cannot regress a known body generation.
Same-revision refresh may advance timestamps only, never alter body content.

`retainHostBodyPresence` reads a committed host frame and confirms its revision,
retains it in Room, invokes bounded preview delivery, then acknowledges the exact
departure receipt at the host. An uncertain Room reply is reconciled by reading
back the exact retained frame. Failed or superseded host ACKs leave Room's copy
intact; a concurrent host mutation cannot delete newer events. The two Durable
Object commits are not atomic: viewers may briefly receive a previously committed
snapshot while a newer host event is pending, but presentation never grants
control. A lost final host ACK still requires durable-state reconciliation.

Room sockets must explicitly request `body-presence=1`; the deployed client does
not advertise it. All existing occupants must be compatible before first
retention. Once the row exists, wake/restart preserves that requirement, refuses
incompatible joins or removed preview configuration, and refuses release to
browser authority until an explicit drain/migration is implemented. It never
silently drops retained state during rollback. An existing incompatible occupant
causes retention to fail before host acknowledgement, rather than being kicked.

`deliverBodyPresence` sends only to compatible hub viewers, with one outstanding
frame per socket and one latest Room snapshot. Per-socket credit survives in
hibernation attachments. A matching `body-presence-ack` releases only that socket's
credit; it cannot acknowledge host departure IDs, create a body, or grant control.
Slow viewers coalesce intermediate frames. A Room takeover fences old requests
and replaces obsolete credit. No timer or recurring body loop was installed.
Delivery counts are send attempts, not proof that a browser rendered the frame.

Expired stored frames remain available with `stale: true` for recovery/late-join
presentation; their old `now` value must not be treated as the current render
clock or a renewed lease. The v60 receiver below now supplies bounded validation and a presentation clock.
Scene placement and disposal, stale-view handling and transient beam behavior
when frames coalesce remain required before activation. The caller must invoke this path for
body events, not for every NPC revision or ordinary movement report. Automatic
closed-row/deadline orchestration and combined live workload validation remain
unfinished. Tess, ordinary movement and voice retain their separate scope.


## v60 receiver and automatic late-join delivery (local, inactive)

`src/js/body-presence.js` is now the shared public schema validator and browser
receiver. Room retention and the receiver use the same exact field, 32-body and
32 KiB bounds. It excludes private tokens, rejects malformed tails atomically,
and requires zero held-body velocity. The previous separate public-view validator
was removed after moving this contract into the shared module; private registry
validation remains unchanged.

`net.js` routes body snapshots and fences them against the separately received
NPC authority, including a fail-closed fence when net does not support a newer
format. Capability is still hard-disabled (`BODY_PRESENCE_PREVIEW = false`); merely
loading the module or receiving a feature string does not enable it. Unknown
versions, changed same-revision payloads, older host epochs/revisions and known
body-generation regressions cannot replace a valid sample or earn an ACK. The
receiver stores one immutable snapshot, with one prior frame retained only for
fencing across socket/authority changes. There is no timer, physics, control grant,
input replay or NPC ownership change. The socket ACK releases delivery credit;
it is not proof of rendered pixels or a host departure acknowledgement.

Every Room envelope now includes `sentAt`, distinct from the snapshot's original
`frame.now`. Presentation time starts at that send timestamp and advances by the
larger of monotonic and wall elapsed time since receipt, ignoring absolute local
clock offsets. Exact duplicates cannot rewind that clock or renew freshness;
clock reversal/nonfinite values latch failure until reconnect. This is a visual
lower-bound estimate because network transit time is unknown. It must never
replace the reclaim controller's request-relative lease checks or trigger host
expiry/ownership changes. A stale sample must not be interpreted as a newly live
player; the scene still needs to consume the stale indication explicitly.

Compatible hub entry now automatically reads/sends the retained snapshot, even
when stale and after Room restart. Room keeps one validated latest snapshot in
memory per authority and invalidates it after each retained commit. ACKs, status
reads and hub toggles reuse that bounded cache; status returns a detached copy.
The cache never substitutes for durable retention, and its send timestamp/stale
flag is recalculated. Thirty-two late joiners and repeated hub toggles are tested
without extra durable snapshot reads or resetting outstanding delivery credit.
No repeating offline-body loop or new alarm is installed.

Claude Code authored three independent receiver tests in an isolated checkout
using the existing Max subscription and file-only tools. Codex reviewed the entire
file, corrected fixture references and marked the fixture departure applied,
then added Room/net integration and cache assertions. Current local validation:
210 focused source/Worker tests plus 120 Room/voice/chat/etc. regressions passed;
build (323 scripts), syntax and whitespace checks passed. These results do not
cover live Hub rendering, frame-rate performance or a deployed environment.

At the v60 checkpoint, scene consumption, first-login NPC placement, full-world
adapters, and automatic lifecycle orchestration remained unfinished. The v61
local scene increment below advances consumption but does not finish those gates. Hub/browser testing remains STOP-restricted. Strict NPC delivery
still fails its existing end-to-end gate. Activation, burst, deployment and merge
remain disabled/unperformed; the failed signer has not been retried. This local
work is not the published PR head.


## Local v61: frozen scene replicas and independent Room movement

The hub now passes its presence receiver and existing NPC lookup into the remote
player pool. `host-frozen-bodies.js` owns separate generation-bound Ooga/Clanker
replicas, static standard poses, equipment presentation, red name markers and the
free raised hand. Committed departure tombstones drive the existing green beam
for at most 700 ms; late observers do not construct expired beams or new NPCs.
Stationary bodies retain their pose and indicator between events; no disconnected
physics loop, input replay or recurring body-only publication was introduced.

The combined live/frozen visual roster remains capped at 32. Held slots are
reserved before any live construction, and excess old Room visuals retire before
new held replicas allocate. A full roster replacement never stages a second
roster. Visible frozen bodies contribute stationary collision envelopes; placement,
occupancy and authenticated reclaim still belong to the separate body adapter.
Unsupported worn Clanker weapons/jetpacks fail the frozen adapter explicitly.
That failure clears its partial roster and is not retried each animation frame.

Live Room movement remains independent of public-presence freshness: a stale or
missing presence refresh does not destroy healthy Room replicas or stop their
movement. A committed held/departing body still suppresses conflicting ordinary
poses. After presence first activates, newly observed Room peers use independent
replicas without the legacy NPC hide path. Known live views bind the matching NPC
as a ghost; unknown peers cannot invent a generation-bound NPC binding and wait
for the committed mapping. World/epoch changes retire old live bindings even if
a numeric body generation is reused. Presence alone never grants local controls.

The new source-only fixture loads the actual remote pool, managed rigs and Ooga
equipment presentation, never scene-hub or a browser. Four tests pass, covering
mixed rigs, zero recurring pose work, transport loss with healthy live movement,
world replacement, 32 held versus 32 ordinary peers, expiry, absent NPCs, malformed
tails and failed equipment cleanup. Twelve related receiver/binding/presentation
checks also passed this turn. The first attempt failed before assertions because
the fixture omitted activity-repos and matchMedia; that setup was corrected and
the permitted retry passed. These checks supplement the previous v60 330 tests;
the full previous set was not rerun for this scene increment.

Claude Code independently reviewed a frozen source snapshot using read-only tools
in its isolated checkout. Codex confirmed and corrected stale-presence interference
with ordinary movement and world/epoch binding reuse, and added capacity regressions.
Other review examples involving duplicate body IDs, unapplied departures or future
departure times are rejected by the shared validator before actor mutation.

Activation stays hard-disabled. Live Hub/browser rendering and performance remain
unverified under the existing test restriction. The hub still has no installed
`bodyReclaim.setAdapter`; local controlled-body suppression during offered/starting,
first-login placement, safe collision/occupancy reclaim, full-world adapters and
automatic lifecycle orchestration remain integration work. NPC equipment added
after binding also needs an explicit ghost-refresh hook. The scene source changes
must not be described as a complete playable integration or merge readiness.


## Local v62: provisional reclaim visibility

`clankerBodyTransfer.reclaimAdapter` now places each provisional controller under
an invisible identity node. The source actor root remains visible as required by
its physics/checkpoint validation; the scene's real visible traversal skips the
entire staging subtree. Neither preflight nor starting-state restoration can draw
a second local body over the frozen replica. Only the committed live callback
reparents the actor to its original scene root before control/camera attachment.
Preview, timeout, refusal and teardown cleanup remove the staging node and dispose
the source controller against its original root.

Factories receive detached preparation copies. A preparation guard refuses nested
factory calls; attachment cannot activate twice, and a synchronous scene release
cannot revive a disposed resource. Cleanup checks the actual parent before moving
a node, avoiding duplicate children after partial setup. Failed attachment suspends
and hides the actor while the reclaim coordinator unwinds it. Source disposal and
scene detach do not require a visible root; that visibility invariant applies to
checkpoint operations, which remain unavailable after failed activation.

Forty-five focused reclaim/transfer/Room/publication checks pass. The extended
source-controller test also checks actual `scene.traverseVisible`, independent NPC
visibility, nested preparation/activation, exact pre-ACK placement, and staging
removal. Existing cases cover geometry changes and lost or failed acknowledgements.
Build and syntax checks pass. No Hub/browser/scene test or probe was run.

This is a source-adapter integration increment, not completed hub wiring. The hub
still does not install `bodyReclaim.setAdapter`. It needs an explicit shared world
profile and trusted account/owner/body mapping; an offer must not choose the physics
profile or manufacture that mapping. Available independent Clanker profiles remain
static-body-3 and terrain-body-3, excluding jobs, climbing, moving supports, beds
and combat. The full island simulation/profile is not yet provided by those
fixtures. Atomic replacement of the local frozen replica/ghost binding at live ACK
and later-added NPC equipment ghost refresh remain scene integration gates.


## Local v63: private ACK to public frozen-body handoff

The Clanker adapter now carries the validated starting transfer's world, host
epoch and revision through the live attachment callback. The remote pool accepts
that callback only for its authenticated local account and matching body form.
It consumes the latest public sample before registering a fence callback, removes
the matching frozen replica and its collision/name references, and restores the
NPC's prior appearance before the independent player's ghost binding attaches.
Older public held frames cannot recreate the local body. The local reservation
shares the existing 32-body cap with frozen, departing and ordinary remote bodies;
excess ordinary replicas retire before attachment. A full unrelated held roster
refuses the local attachment until public state catches up.

The private receipt names the starting snapshot, not the subsequent live commit.
Unrelated host writes can publish the same starting generation at a newer root
revision. Such a snapshot is retained as an intermediate state, rather than
incorrectly revoking a successful private ACK. The registry cannot return a live
or grace generation to starting: a new offer allocates a new generation. A newer
public closure, disappearance, changed body/generation, world or host epoch still
suspends the local body. Public snapshots never grant or renew control; the private
reclaim coordinator remains authoritative for that browser's activation.

Refused acquisition never invokes a callback before its release handle exists.
Fence callbacks cannot reenter acquisition, and teardown releases remote replicas
and NPC ghost layers even if a callback throws. Scene detach releases the local
presentation handle before disposing its pool; pool disposal conservatively
suspends any still-attached local body. A failed frozen renderer continues to
refuse attachment until a newer valid frame arrives. This is deliberate fail-closed
behavior while required collision/ghost presentation is unavailable, not a fallback
that silently ignores an unsupported remote body.

Forty distinct focused checks pass across source frozen-body rendering (9), body
reclaim (14) and registry lifecycle (17). Cases include pending public frames,
intermediate starting snapshots, generation reuse refusal, stale release handles,
full rosters, nested callbacks, renderer failure and teardown. Actual source rigs
and controllers are loaded, but no Hub/browser/scene test or probe is run. Claude
Code independently reviewed an isolated source snapshot using the existing
subscription and read-only tools; Codex verified its findings, implemented fixes
and tested them. No Claude process remains active.

This completes another local callback boundary, not live world installation.
The hub still has no installed bodyReclaim.setAdapter: trusted production world
profile/account-owner mapping, full-world physics/occupancy, first-login NPC
placement, late-added NPC equipment ghost refresh and lifecycle/deadline
orchestration remain unfinished. Live scene behavior remains unverified under the
Hub/browser STOP. Activation and burst stay disabled. This work is not published;
the signer remains blocked and has not been retried.


## v64: refresh ghost equipment on model changes

Actor bindings now index their NPC roots within the existing 32-binding cap.
The scene's existing model-change hook refreshes the corresponding frozen,
remote-live or independently controlled player's NPC ghost when worn equipment
is added or removed. Unknown props are an O(1) no-op; unchanged frames do not
scan rig trees. Refresh still validates the complete bounded tree before changing
opacity, preserves preexisting opacity, restores removed nodes and never multiplies
an existing ghost layer twice. Replacement generations and disposal remove the
old root index. Invalid or oversized local model trees remain explicit errors;
this hook does not authorize larger actor trees or unsupported full-world states.

Six binding checks and ten source-pool checks pass, including real rig gear nodes,
held-to-live transitions, generation replacement, removal and disposal. The hook
is wired in scene source but remains unverified in the live Hub under the existing
STOP restriction. First-login production mapping, full-world recovery, adapter
installation and deadline orchestration are still unfinished. This supersedes the
missing equipment-refresh hook listed in the earlier checkpoint sections, without
claiming the remaining integration is complete.

## v65: reclaim controls after synchronous scene teardown

The private Clanker attachment now retains the exact body/binding identity across
the scene callback. If that callback releases, fences or disposes the body, the
old attachment returns false without reacquiring the camera or controls. Refusal,
suspension and callback exceptions release the original body; an obsolete callback
cannot release a replacement binding. Independent NPC ownership stays untouched.

Thirty-one focused checks pass across body reclaim, source transfer/world/body
controllers and the new controls boundary. They exercise actual controller and rig
modules with an authored empty meadow and fixture UI/camera services, including
gravity after activation, synchronous release/disposal, input shutdown and listener
cleanup. Build and syntax checks pass. These checks do not run the Hub, a scene,
renderer or browser, and do not validate live visual behavior. The live adapter,
production world/account mapping and full-world integration remain unfinished.
Activation and burst remain disabled.

## v66: coordinate host takeover with Room fencing

`publishHostPoses` now requires the coordinated publication protocol. After Room
has configured the matching authority, a one-time host transaction records its
Room binding and checks the projected revision. A failed initial Room configuration
does not bind the host; an intervening host mutation supersedes the frame. Steady
publication still reads and confirms without adding a host write.

A bound host refuses raw `claim`, `claimBodyCleanup` and `begin` transitions.
`claimHostRoom` persists a pending takeover intent after host lease expiry, fences
Room to the replacement epoch, then grants the replacement host ticket. Pending
intent blocks ordinary host ownership checks. Room can accept an old in-flight
frame before its fence commits, but the replacement host has no ticket yet. After
the Room fence commits, old Room revisions reject even exact duplicate frames;
the new host ticket is granted only afterward. This does not assume synchronized
host and Room clocks or undo frames already sent on a socket.

The intent and last completed claim are bounded metadata. Failed writes roll back;
lost Room replies are reconciled against its exact authority. Recovery resumes a
pending intent, or explicitly supplies the exact completed intent to reconcile a
lost completion reply without renewing the lease. Reusing an owner name alone
cannot join a live host lease. Competing replacement operations cannot displace
the pending winner. The coordinator must durably identify recovery operations and
route each host/world to the same trusted Room; this is an internal service
protocol, not a browser-supplied capability.

Room fencing preserves the negotiated pose format, cadence history, finite run
deadline and previous publication's rate debt. It clears the old pose instead of
fabricating a replacement snapshot. Cleanup after finite expiry can finish body
departures with zero NPC steps and without opening a new run. An explicit
coordinated *new-run* transition was not implemented at v66; v67 below adds
an explicit drained close followed by a separate finite `begin`. Automatic lifecycle orchestration
and the production host-to-Room mapping remain activation gates. Body-only entry
points must be routed through the same bound authority before live integration.

The reproduced delayed old-host publication is now rejected. Tests cover crashes
between each durable step, competing owners, lost replies, initialization failure,
rate debt, stale intents, mixed protocol refusal, and cleanup without extending
grace. A finite workerd/SQLite smoke run also verifies restart, late joins, timely
reclaim and old-ACK rejection with 30 frozen sessions, two actors and two viewers.
It is not a full-world or production-load certification. The representative strict
delivery gate still fails; see the cost document. Hub/browser tests remain stopped,
Tess is excluded, and activation and burst remain disabled.


## v67: independent review and bounded lifecycle recovery

Claude Code reviewed the five host/Room source files at v66, read-only, through the
user-authorized subscription session. The later fixes below were reviewed and
checked locally; they were not sent for a second Claude review.

Room's persisted `fencePending` marker allows the first frame of a newly fenced
epoch to establish its lease after a crash outlasts the original Room lease. The
first accepted frame consumes this permission. Subsequent expired publication,
newer epochs and the finite run deadline still fence the caller. Replaying a
fence or publication does not renew its lease. This marker cannot originate from
ordinary authority configuration or survive a release to browser mode.

Initial binding now records ownership even if a simulation mutation supersedes
the projected frame, so frequent ticks cannot indefinitely leave the raw claim
path open. Superseded bytes are not published. An unpublished host refuses cached
Room receipts: first binding requires fresh Room evidence. Completion validates
known exact authority descriptors, boolean ownership and the matching run deadline.
The ordinary final host revision confirmation remains in place.

`closeHostRoomRun` is a separate explicit operator action for **drained** worlds.
After host lease expiry, it persists a version-2 release intent, releases Room by
revision CAS, reconciles a lost reply, then marks the host stopped and removes its
binding. It grants no live ticket and leaves the simulation checkpoint intact.
The next run requires a separately requested finite `begin`, and a separately
explicit Room acquisition. It never starts a recurring paid loop or automatically
undoes an intentional browser release. Strict rate debt survives release and
reacquisition, including a close immediately after a publication.

The release intent can supersede a pending takeover owned by the same operation.
An old takeover can fence Room once while the release is in flight; the release
coordinator uses at most two CAS attempts to handle that race. A completed close
increments the host fence, so old tickets and takeover completions cannot revive
it. Lost completion replies recover with the exact persisted release intent;
a newer finite run fences that intent. Trusted orchestration must serialize
lifecycle operations and route each world to the same Room. These private receipts
are not cryptographic proof and must never be accepted from a browser.

Close refuses held bodies, unacknowledged departures and Room's existing body
handoff/presence drain guards. **Occupied-world migration is still unfinished.**
If an operator releases Room with retained host bodies, this close path cannot
silently erase them or reacquire server authority. Their explicit recovery/migration
policy and live routing remain activation blockers. Seamless finite-run rollover
is also not provided: this path deliberately transitions through browser authority.

Focused tests cover the expired-fence crash, stale receipts, superseded initial
binding, drained stop and natural expiry, old takeover/release races, lost replies,
invalid proofs, stale completion after a newer run, and refusal to discard bodies
or departures. The 229-check combined Worker/source run passed. No Hub/browser
checks ran, and no production readiness is claimed. The v66 strict-delivery failure
still applies; v67 changes lifecycle handling, not steady publication scheduling.


## v68: explicit occupied recovery and final empty-Room drain

`recoverReleasedHostRoom` is a distinct trusted operator operation. Ordinary
`claimHostRoom` and publication still refuse a browser-mode Room. Recovery requires
an explicit supported pose format and the host's persisted takeover intent. Room
reacquisition uses its current revision CAS, keeps the existing cadence and rate
debt, and restores the **original** finite run deadline. Only the reconciled exact
Room receipt grants the replacement host ticket. Lost replies resume that same
operation; another owner/revision fences it. No body, equipment, session deadline,
position, pending departure or NPC checkpoint is discarded by this transition.

This also permits recovery after the original run has expired when held bodies or
pending departures still require cleanup. The Room lease stays capped at the old
run end, NPC publication remains closed, and the host can process bounded expiry
and retained departure delivery. It does not authorize new live admission or a
new paid simulation window. The Room RPC retains preview, mixed-format, cadence,
capacity and occupant compatibility checks. Voice connections are left intact.
Trusted lifecycle serialization and same-world/Room routing remain prerequisites.

A final `releaseDrainedNpcAuthority` path now retires the Room's empty handoff index
and retained body presentation atomically with authority release. It requires the
host's version-2 drained release intent and an empty Room handoff outbox. If body
preview was used, all Room occupants must have left. A failed write leaves both
compatibility markers and server authority intact; restart after success permits
legacy joins. NPC-only rooms can retain ordinary viewers. This clears the earlier
permanent empty-index rollback block without silently migrating connected body
clients or discarding a held body on the host.

These hooks recover retained server state and finish an empty-room drain. They do
not implement a seamless occupied browser-mode migration, live scene restoration,
production identity/profile routing, or automatic lifecycle scheduling. First-login
NPC placement with independent ghost tracks still needs live integration. Activation
and burst remain disabled. The prior strict-delivery gate still fails.


## v69: canonical account-body identity in presentation and reclaim

Room stages authoritative bodies as `player:<accountId>`. The former scene and
replica adapters instead inferred character and form from names such as
`gorilla:<handle>`, so a valid canonical Clanker could not attach or render.
`net.hostCharacter` now resolves a validated canonical body/account pair through
the authenticated local/remote roster or canonical account identity map. Body kind
comes from the explicit host view. A name belonging to a different canonical
account, unsupported kind, mismatched ID or unknown mapping is refused.

The Hub's independent Clanker attachment and NPC ghost lookup use that resolver.
Frozen replicas and local reservations accept account-keyed bodies only with an
explicit resolver. Live remote construction also takes name and form from the
matching host view, overriding conflicting ordinary pose metadata. Stable body IDs
still own reservations and generation fences; mapped character names only select
the visual rig and the existing NPC to ghost. No NPC body is consumed or spawned.

The final private live receipt installs the local canonical body name/form without
sending a legacy body claim or replaying a cached pose. A later grant can replace
Clanker with Ooga under the same stable account-body ID: the old controller is
released, the old receipt cannot enable the replacement, and voice stays connected.
Repeated unchanged scene body reports retain their allocation-free early return.

262 focused source/Worker checks pass, including actual net/reclaim modules and
remote rig presentation without loading Hub or a browser. CI's focused recovery
step now includes body-reclaim and host-frozen-bodies checks. Hub edits have syntax
and build validation only because its STOP restriction remains. This is identity
and handoff integration, not a completed Hub adapter: trusted world/profile factories,
Ooga control binding and full-world support/collision validation are still required.
An offline body for an account absent from the canonical identity map and current
roster cannot yet resolve its appearance for a late join; it fails closed rather
than guessing. Production roster/profile provisioning must close that gap before
activation. No capability flag, rate safeguard or deployment changed.

## v70: durable stop barrier for a connected body

The explicit preview-only `Room.requestBodyStop` RPC now retains a stop request
before sending `body-stop` on the existing authenticated connection. It requires
the exact retained Room authority and current connection, a fully live handoff,
and no unresolved movement sample. After this commit, Room refuses further body
movement and activation receipts for the request. The optional bounded `stopAt`
field stays in the existing handoff row; older exact-schema readers refuse it.
No new timer, subscription, recurring write or disconnected physics loop is added.

The client stops and releases its controller before returning the existing
`body-decline` acknowledgement. A duplicate stop retries that acknowledgement
without releasing twice; old preparation and activation messages cannot restart
the stopped request. A different valid request can subsequently prepare a new
body. Stop receipts never cross a connection. Voice remains on the same socket.

A send attempt is not proof of a stopped client. Until Room observes a matching
acknowledgement (or ordinary transport loss), the host generation remains live.
The first observed close time drives existing host reconciliation and its
60-second grace deadline. A lost reply or repeated acknowledgement cannot reset
that timestamp. Host cleanup must still prove the exact generation passive before
Room retires its record. Stop delivery can be retried after the old grant/Room
lease expires because it grants no control and cannot renew the finite run.

This is a prerequisite for connected migration, not a completed browser-mode
switch. No client capability advertises it; no path enables legacy controls after
the acknowledgement, discards held bodies or removes the occupied-Room release
guard. The trusted migration coordinator, final mode receipt and live Hub adapter
remain unfinished. A client which never acknowledges must remain fenced pending
ordinary close/recovery; there is no timeout that silently authorizes a second
controller. The existing full-world, strict-delivery and production cost gates
remain open, with activation and burst disabled.

## v71: final connected release after a complete drain

`closeHostRoomRun(..., { connected: true })` now explicitly selects the connected
migration protocol. The default close still requires body-mode viewers to leave.
Host release preparation must first prove that no sessions, held bodies or
pending departures remain. Room additionally requires an empty handoff outbox,
at most 32 recipients, the `body-migration=1` capability on every connection, no
ordinary claimed body and a recorded stop for every handoff participant. A client
without that capability blocks the transition. There is no forced expiry or
discard of a player's remaining 60-second hold.
An occupant marked for body handoff but never prepared/closed still blocks this
path and must leave or complete a supported handoff/stop exchange. An empty host
alone is not evidence that an unknown local controller has stopped.

Room commits browser authority, the bounded recipient journal and deletion of
body compatibility markers in one transaction. A failed authority or journal
write rolls everything back. After commit, the ordinary authority descriptor
precedes each private `body-release` receipt. A crash before updating socket
attachments or notifying clients recovers from that journal on wake. Receipt
retries match account and connection; they neither affect replacements nor reset
a newly claimed ordinary body. A newer server authority fences the old receipt.
Voice connections stay intact throughout this mode transition.

The browser requires the exact separately accepted browser-authority descriptor,
its current account/connection, no live or preparing body, and no unfinished
asynchronous preparation. Only then can the explicit receipt clear the body-mode
latch. Networking clears the old canonical body and movement cache; a fresh
ordinary claim is required. No cached pose, shot or thrust is replayed. Repeated
receipts do nothing. `BODY_MIGRATION_PREVIEW` is false, so deployed clients do not
advertise or accept this migration yet.

If controller disposal throws, the page keeps body controls fenced and does not
acknowledge a successful stop, accept a replacement body or clear the latch on
migration/reconnect. A fresh page is required to discard the failed controller;
voice remains usable. This prevents a disposal failure from being mistaken for
proof that a second controller may start.

302 focused source/Worker checks and the build pass. These cover actual Room and
net modules, failed writes, post-commit crash recovery, stale attachments,
replacement sockets, changed authority, lost final receipts, client disposal
failure and bounds. They do not execute Hub/browser tests or validate production
latency. This completes the explicit drained-mode receipt path, not seamless
transfer of an active world or live Hub integration. No rate policy, automatic
fallback, production route or activation setting was enabled.

## v72: untouched viewers prove quiescence before migration

`Room.requestBodyQuiescence` handles a body-mode viewer which never received a
body offer. It refuses any outstanding handoff for that account, claimed ordinary
body, closing/stale connection or incompatible client. It persists a random
request nonce, current authority revision and acknowledgement bit in the existing
socket attachment before sending `body-quiesce`. Retry and Room wake reuse that
request. A changed authority requires a fresh nonce and acknowledgement.

The client requires the exact account, connection and already accepted server
authority, plus no handoff/resource/preparation/disposal failure. It blocks new
local possession before asking the active scene to prove it has no controller.
Without a scene proof, or with an active/uncertain controller, it sends no ACK.
Reentrant scene changes and connection loss invalidate a proof in progress.
Repeated requests can resend the same receipt without repeating scene work.
Voice stays connected. No unknown local controller is forcibly disposed.

The Hub registers this proof after its controllers exist and on retained-scene
resume, and unregisters it on leave. It checks the ordinary Ooga, Clanker and
independent body controllers, crossings, doorway and Cloud Hopper state. The
existing possession gate refuses new Ooga/Clanker selection while quiescing.
This is a live-source lifecycle hook; Hub/browser execution remains prohibited
by the STOP restriction, so scene interaction and teardown are not verified live.

Room accepts only the current socket's exact nonce/revision receipt and saves the
acknowledgement before using it as migration evidence. An attachment failure leaves
both the previous durable value and the in-memory permission unchanged. A pending
quiescence blocks new handoff staging. The connected-release transaction can then
accept this proof in place of a nonexistent handoff close, while still requiring
the host/session/departure drain and empty outbox. Final release clears the proof;
only that separate receipt clears the client's possession latch. A replacement
socket starts a fresh exchange; it cannot inherit the old acknowledgement.

306 focused checks and the build pass, including actual Room/net paths, failed
attachment persistence, stale/replaced connections, authority changes, no-scene
and active-scene refusal, callback teardown and disabled-preview behavior. No
Hub test or new workerd load run was performed. Full body adapter installation,
trusted profiles and production orchestration remain unfinished.


## v95: private authored-world geometry assembly

`buildHubWorldGeometry` now composes the actual terrain snapshot, private path
state, shared altar, north arch, library, Headquarters/basement beds, cave shells,
EntropyLab equipment/stations, B.C.A. office, factory outlet, Mempool forest and
support, fixed Clanker sleeping routes, Timechain and Bifrost geometry. It requires
an authoritative hydrology controller and an explicit bounded pile level. It
returns the actual controllers/meshes and a pile-level layout update, and disposes
partial construction on failure or cancellation. Target and prop registration
are bounded at 8,192 and 1,024 respectively; these are internal startup safeguards,
not measured production capacity claims.

The browser and host now share the exact terrain/library options, altar ring
construction and rainforest sleep routes. The host retains a data-only terrain
template and reconstructs each world from a private structured clone, avoiding
shared mutable path/query state across recovery attempts. This clone's memory and
startup CPU costs remain unmeasured. The source terrain validator's existing
limits remain in force. Neither terrain graphs nor render meshes go into the
small durable simulation checkpoint.

Passive NPC work no longer activates firing exclusion zones or detours another
walker around those zones. Actual scheduled screen, lab equipment, office and
sleep routines remain; this does not re-enable incidental combat or collisions.

This is a construction stage, **not a completed or installed VirtualHost factory**.
Remaining work includes mainland prop/layout parity, the complete actor support
and context assembly, actor construction/projection, mutable world/recovery
composition and final receiver startup binding. No substitute evaluation world
is installed. Build/syntax checks do not establish runtime correctness, late-join
consistency, recovery fidelity, four-Hz throughput or cost. Hub/browser checks
remain restricted; activation, deployment bindings and burst policy stay disabled.


## v96: actor composition and status-change beams

The user replaced status-change commutes with beams: Oogas and gorillas transfer
between clank/chill/sleep destinations; away sleepers disappear. Returning away
workers start at the pile. A login whose NPC is away also needs a checked pile
spawn, while a present NPC still supplies the initial player's position. This
supersedes sleep-route continuation for NPC status changes, but does not alter
live-player control or the frozen-body reconnect grace.

Passive Oogas now settle into their reserved real sleep pose directly, and wake
at a checked work or chill destination with cleared motion. Old in-progress bed
commutes switch to this policy on update. Gorillas release held lab items and
portal/office reservations, reserve and check their actual sleep destination, and
transfer without walking out of a cave or crossing the rainforest bridge. Working
arrival uses a bounded 33-candidate pile search with source collision checks.
Missing beds or an invalid destination keep the actor hidden with bounded retry;
no new bed, terrain exemption or peer-control transfer is introduced. Scheduled
screen, lab and office routines continue. Passive eating no longer depletes the
shared pile, and passive actors no longer construct/destruct incidental props.

`npc-status-beams.js` observes client-visible state transitions after NPC sync and
uses the existing green glyph renderer. It has 20 active presentation slots and
one coalesced pending transition per actor (bounded roster), suppresses initial
late-join/restart replay, cancels away transitions, and clears/disposes with the
Hub lifecycle. It does not move or hide actors, add protocol fields, or run server
animation timers. Status changes snap instead of position-interpolating through
terrain. Independent local body attachments can request an incoming beam when
their counterpart remains away; they never reactivate or possess that NPC.

`createHubWorldActors` now constructs the actual crew and Clanker controllers,
work sites, source lab equipment, real sleep anchors and combined recovery
composition. It uses an explicit authoritative roster/clock/world and complete
movement providers. It does not provide fake ground, permissive collision, DOM,
input or HUD stubs. Authoritative crew construction skips input/HUD/transient FX
and browser tween registration. The lab's inside-room predicate is shared with
the browser. The new host actor path no longer constructs sleep commute graphs.

The host's first-login check retains the identity/kind mapping and exact-position
requirement for present NPCs; for an away NPC it accepts the trusted world's
checked pile spawn instead of the hidden last sleep position. The complete
movement/spawn adapter, actor projection and final production factory/startup
binding are still unfinished. No claim is made that this admission change alone
implements production login. Whole-world recovery/capacity, browser visuals,
strict four-Hz delivery and production cost remain unverified. Activation remains
disabled. This pass performs build and syntax checks only, as requested.

## v97: shared pile arrivals and transaction-scoped player occupancy

`hub-arrival.js` now owns the source Hub's bounded pile search. The browser
retains its existing terrain, fire, body and remote-player checks. Deterministic
arrivals scan at most 288 points across six rings; ordinary respawns retain
48 random candidates followed by three rings. Exhaustion returns failure and
never selects an old bed or arbitrary fallback position. Passive Oogas also no
longer fall back to a non-pile recovery spot when starting work, or walk from an
old destination when a chilling status beam cannot find a safe landing.

`hub-world-arrivals.js` is composed into the actual actor layer. It selects a
present NPC's position without modifying that NPC; an away counterpart instead
uses the shared deterministic banana-pile search. Its mandatory standing-shape
placement provider must check real current geometry and support, returning null
for an unsafe position. A missing/obstructed destination refuses admission.
Fresh bodies use standard defaults, zero momentum and no held actions. This is
only fresh admission; timely reconnect continues to use the retained frozen body.
The helper does not construct unknown characters or force an NPC awake on login.

VirtualHost passes a bounded copy of committed body IDs, kinds, zones and motion
from both sessions and pending departures into each fresh spawn attempt. Tokens
and account metadata are excluded. Compact simulation wrappers forward that
context, including their transaction-local variants. This permits a retry to
recheck current occupied positions rather than retaining a speculative free slot.
The Hub helper reserves conservative maximum standard body dimensions per kind
and a 0.15-unit gap for other retained players. Passive NPCs reserve no player
collision space. This conservative policy can refuse a crowded arrival before
actual detailed body geometry would, and remains unmeasured.

This is still NOT end-to-end host completion. Complete source movement/support
providers (including the new player placement callback), actor projection,
identity mapping, coupled mutable-world state, and the final production factory
binding remain outstanding. No deployment binding or activation flag changed.
Build/syntax verification is not live recovery, collision, multi-client or cost
validation; those remain unverified under the current no-new-tests direction.
Existing strict delivery failure and production resource/cost gates remain open.

## v98: shared structural and Clanker support providers

The browser and private geometry factory now share the actual HQ mattress
support/ceiling/sweep and stone-doorway queries in `hub-structural-support.js`.
Browser geometry is resolved at call time, so retained scene visits and rebuilt
roots do not leave stale references. The browser's existing Cloud Hopper bypass
remains explicit; the authoritative Hub does not use that bypass.

`hub-clanker-support.js` extracts the source gorilla footprint, terrain/prop
support, water flotation, ramp and ground-plane fitting, masonry contact/hull
checks, climb-area probes, balcony entry and tall-prop detection. The browser
still supplies its player-top support callback. The host supplies the explicit
passive-NPC rule: NPCs cannot stand on players; using that provider for a driven
body is rejected. The geometry factory assembles these components from the real
private authored world, and actor construction consumes twelve concrete Clanker
queries instead of requiring those callbacks from a future external adapter.

Full movement clearance is not replaced by a permissive cylinder or flat floor.
Clanker rig/limb sweeps, rest transitions and placement, the Ooga navigation
composition, remaining world layout/event state and final host binding are still
unfinished. No full-world runtime, capacity, strict-delivery or cost evidence was
obtained in this implementation-only pass. Activation remains disabled.


## v99: rig clearance and passive Ooga navigation composition

The actual Clanker rig, limb, lab contact, climbing, doorway and rest-transition
sweeps now live in `hub-clanker-clearance.js`, consumed by both the browser and
private host. `hub-world-clearance.js` composes the real terrain/prop/masonry
providers and validates recovered Clanker poses without advancing AI. Passive
NPCs do not reserve incidental space against players or other NPCs; scheduled
bed and work reservations remain. The actor factory also supplies the work-site
lookup used by lab departure clearance.

`hub-world-navigation.js` now supplies the source Ooga support, walking, flight,
ceiling, cave/ramp, fire, pile and route-exclusion queries over the private Hub.
Walking/flight and mirror headwear sweeps are shared with browser code. The
mirror panel is included in private geometry. Banana-pile core construction,
level scaling and exact triangulated height/body queries are shared without
creating the browser renderer, shell particles or camera cover. Initial work
arrivals use the bounded pile search with actual geometry checks. Passive
chilling/recovery destinations no longer reject passing actors in browser code.

This is not a complete receiving-host startup. Routine destination layout and
wander/recovery selection, complete mainland prop construction, Ooga recovery
placement and player admission, world event/state composition, projections,
identity mapping and the final factory binding still need completion. The new
navigation component intentionally refuses use for driven player movement.
Independent NPC tracks, status beams, frozen players and activation restrictions
remain unchanged. No runtime, browser, recovery, performance or cost validation
was performed in this implementation pass; build/syntax checks cannot establish
those properties. The existing strict-delivery failure remains an open gate.

## v100: routine destinations and recovery admission

The actor constructor now composes all required Ooga movement/destination queries
and all Clanker layout arrays itself. `npc-routine-destinations.js` shares the
existing seeded destination search, fire-seat selection and routine reservations
with the browser; the host uses its checkpointed execution random stream and an
explicit world-daylight provider. `npc-clanker-layout.js` shares cave/roof/entry
rest and climb zones. These routines never read online-player presence.

Private geometry includes the mainland firepit mesh and hazard, selected from
the existing bounded candidate sequence, and the shared concentric fire seats.
Its free-space predicate checks the constructed static geometry and mouth
reservations. Full parity with browser scenery claims is still unverified:
mainland prop assembly remains incomplete, and this can affect selected
positions. Adding the remaining props must precede any activation or layout
parity claim. Browser selection retains its original claim predicate.

`hub-world-placement.js` now provides actual terrain/prop/bed/altar/gate/mirror
checks for initial player admission and Ooga restart placement. Admission allows geometrically clear standard player bodies in midair; the
existing reclaim flow supplies zero momentum. Grounding is read from actual
support, without snapping saved positions. This path has not been run end to end. The existing arrival
coordinator separately checks occupied durable player bodies. Ooga recovery
checks transformed body parts and head accessories in the rebuilt standard or
sleeping pose; hidden away/pending-beam actors have no active collision body.
The circumscribed part shapes are conservative and may reject valid tight or
resting poses. That false-rejection risk and live browser reclaim remain
unverified; no blocked body is silently moved or its reservation discarded.

Combined recovery now refreshes scene transforms and the solid index after
restoring held routine equipment and before either stream's placement checks.
Early navigation/layout construction failures dispose the private geometry.

Final receiving-host binding is still incomplete: authoritative mutable-world
state/event composition, trusted startup roster/item configuration, projection
and identity adapters must be connected to the existing finite-run lifecycle.
The already constructed actor composition is not a deployed host. No new runtime
or throughput/cost evidence was collected, and the strict-delivery and capacity
gates remain open. Activation and burst remain disabled.


### Real Hub state and simulation composition (v101, disabled)

`hub-world.js` now constructs the private real geometry, authoritative activity
roster, source Ooga/Clanker controllers, queued backlog input, hydrology, arrival
placement, combined recovery and projections. `hub-world-simulation.js` implements
VirtualHost's initial/validate/step/project/poses/spawn/input contract over that
factory. Each transaction attempt owns and disposes its world; changed checkpoint
children rebuild it, and a failed capture cannot replace the durable DTO. No
mutable actor cache survives a transaction retry. Construction is synchronous
inside this adapter and its latency has not been measured.

`hub-world-state.js` supplies the durable wall clock, simulated elapsed time,
pile level, bounded item inventory/assignments and tint input. Source actor codecs
own their gameplay and random state. Daylight uses the existing solar calculation
with UTC, so routine choices do not depend on a viewer's timezone. The real
character registry and generated dress definitions can now load without a browser;
the authored character files are unchanged. Startup requires explicit trusted
activity/configuration, not a browser save or a silent stale-activity fallback.
There is still no installed production provider for that configuration or live
activity/donation/item inputs; the current event queue handles backlog only.

Projection publishes both complete NPC streams, including away entries whose
rigs are hidden, regardless of live/frozen player presence. Ooga frames use the
browser's cast/site signature; Clankers use their actual rigs and stable held-lab
item identities. Authenticated spawn checks forward the Room's canonical handle,
account and body kind into the NPC mapping, preserving pinned account checks.
An account number alone cannot infer a character. These internal mapping helpers
are not authentication endpoints.

This completes the real simulation-adapter composition, **not the receiving host's
end-to-end startup**. The concrete durable body-storage/session adapters still
need to be composed with this world and authenticated identities and installed in
the private finite-run factory. Complete mainland props/layout parity, dynamic
world-event intake, held-equipment client presentation and actual full-world
recovery remain unverified/incomplete as described above. The combined raw
checkpoint and mixed pose packet retain existing byte/node limits; no claim is
made that a full roster fits them. Startup/capture/restore cost, strict four-Hz
delivery and production cost remain unresolved gates. No activation, deployment,
new tests or runtime measurements were performed in this implementation pass.


### Concrete frozen-body startup and trusted updates (v102, disabled)

`hub-virtual-world.js` now supplies the actual `HubVirtualWorld` subclass of the
finite receiving lifecycle. `openHubHost` reads its private configuration;
`createHubHost` composes the real Hub simulation, atomic body store and new frozen
session adapter. The class remains absent from deployed exports and bindings.
Its private `configure` RPC requires all existing preview gates, accepts a first
configuration or an exact retry, and refuses replacement or an existing world
without configuration. It creates no run, lease, feed or timer.

Configuration has exactly `version`, `seed`, `checkpointBytes`, `source`, `state`
and `activity`. `source` is the trusted service's positive monotonic `revision`
and `observedAt`; `state` is the v1 private state with `at` equal to that source
stamp and `elapsed: 0`; `activity` is the canonical roster's logical checkpoint.
Pure configuration validation runs before storage. An adapter to supply this
configuration from actual production services is not installed. No synthetic
activity or personal browser save is substituted. Existing body capacity and
checkpoint reservations remain enforced.

`hub-body-record.js` stores canonical character identity with the existing Ooga
or Clanker browser wire. Clanker's fixed baseline and ten-scalar rules now come
from the source controller without constructing a rig. Browser reclaim uses the
canonical handle rather than the nonexistent `npc.owner.id`. The session adapter
binds identities only from VirtualHost's authenticated Room admission context,
retains that mapping atomically with body data, checks movement generations and
entitlements, and produces the existing grant/ACK transfer. Confirmed disconnect
and takeover keep registry positions and zero momentum. It retains equipment and
mode, resets resources and animation, and runs no disconnected-body physics.
Reclaim checks actual static geometry plus retained player occupancy; NPCs remain
independent and reserve no player space. Conservative standing-shape clearance
may reject tight valid poses and is unverified. This is not movement anti-cheat.

The existing private `ingestWorldInput` path now accepts a separately bounded
32-KiB `hub-state` envelope: `{v:1, kind:'hub-state', observedAt, revision, state,
activity}`. Here `state` has only `level`, `tint`, `inventory`, `assignments`.
It represents absolute service totals/assignments, never a donation increment.
One pending latest snapshot is checkpointed; stale revisions are ignored and
conflicting retries rejected. The fixed step applies state/activity together,
refreshes pile and equipment geometry, then advances ordinary status/routine
logic. The old backlog input retains its 256-byte limit. No publication rate,
world checkpoint limit or permanent paid loop was changed. The new event
checkpoint refuses old backlog-only snapshots rather than silently migrating.

The concrete private startup/body/reclaim/event code path is now connected.
It has not been executed end to end. Complete mainland prop/layout parity,
held-lab-item client presentation, real service producers/configuration and
full-world runtime/recovery/capacity/delivery/cost validation remain outstanding.
Build and syntax checks do not establish those behaviors or production readiness.
Activation and burst remain disabled; no deployment or production data changes.


### Local receiver and ladder follow-up (v103)

The mixed frame now reaches the actual browser NPC receiver. It checks the world
and complete ordered Ooga signature, splits the bounded packet, and applies the
complete Clanker roster through each existing rig projector. Held lab objects
are bound by the exact `index:kind:station` identity emitted by the host. Changed
claims are released before reassignment, duplicate claims are rejected, and all
rig profiles/topologies are checked before pose mutation. Incompatibility hides
the Clanker roster and retains the local-AI fence until a compatible full frame.
No player body is created, possessed or simulated by this display adapter.

Clanker local `sync`, planning and update are fenced during server authority;
the scene also stops local lab-equipment physics. Independent player-body
stepping remains separate. The client mixed-format capability is wired behind
`NPC_MIXED_PREVIEW = false`; no preview/activation/rate flag was enabled. This
implements held-item presentation, not loose die/screen-state replication:
those mutable lab presentation fields still need an explicit bounded channel.

Browser and host now share the authored bluff-ladder geometry and placement,
including its routine destination, with a bounded terrain search. This does not
complete mainland parity: scenery, palms/hammock supports, dressing and the
browser claim ordering still differ. In particular, the host fire-selection
predicate is still based on built solids rather than the full browser claims.
These are placement/continuity risks and remain activation blockers.

Service inspection found a bounded Oogatron reader and donation socket pile
messages, but no existing server-owned inventory/assignment snapshot API.
`hub-state` still requires a trusted producer of the complete absolute state;
no browser localStorage state was promoted to authority and no subscription or
paid loop was introduced. The receiver/held-item changes are build/syntax checked
only, with no new tests, runtime probes, performance or cost claims in this pass.

### Local lab/source/mainland follow-up (v104)

`mixed-2` adds a complete lab presentation to the same NPC packet: each named
loose object's absolute transform/visibility, explicit held markers, and the
existing screen/strip/marker transforms. It uses an 8-KiB lab sublimit, at most
16 items and 8 screens, within the unchanged 32-KiB compressed and 128-KiB
expanded packet limits. The client validates lab identity/topology and held
claims before applying the complete scene. It does not simulate loose-object
physics or advance screen animations independently. Legacy `mixed-1` retains
its original encoding and decoded shape. Authority version 3 and client
`npc-authority=3` explicitly negotiate the new payload; Room joins, occupied
migration, claims, body presence/reclaim and publication all retain the same
ownership/rate gates. Old clients cannot be admitted as compatible viewers of
this format. The new client capability remains behind the disabled preview
constant. Full packet capacity/CPU/compatibility are unverified in this pass.

A concrete Oogatron producer is now tied to the existing explicitly started,
finite Hub run. It uses the existing 4-second/2-MiB bounded reader, at most once
per minute, with a durable attempt cursor preventing restart retries from
bypassing that cadence. Reads occur outside the serialized mutation window;
application uses the latest retained/pending activity and keeps the current
pile/inventory/assignments. It uses absolute `hub-state`, skips unchanged
activity, and retains the last durable activity if the feed fails or the host
is busy. It creates no alarm, automatic start, renewed run or deployed binding.
The maximum existing 15-minute run bounds this producer to at most 15 reads
(theoretical response-body ceiling 30 MiB), plus cursor writes and changed
world updates. These bounds are not measured CPU or billing results. Polling,
network access and this finite loop have not been activated or executed.
Donation/pile and inventory/assignment producers still require an authoritative
source contract; local browser saves are not used as authority.

Mainland construction now includes the actual browser jumbotron cabinet and
solid totem bodies. The cabinet builder allocates no canvases in the host;
board placement and totem metadata/coordinates are shared. Decorative screens,
chrome, lights and totem feeds are not started by geometry construction. The
ladder now matches the browser's decorative-only collision registration,
correcting the prior host-only solid. Complete mainland parity still needs
palms/hammock supports, scenery, dressing, placement claims and reflow ordering;
these remain blockers for safe activation and complete body-placement claims.
Build/syntax validation only; no new tests or runtime/benchmark campaign.


### Mainland construction follow-up (v105, activation still disabled)

The browser and private host now share cave dressing through
`hub-mouth-dressing.js`, ground predicates and placement constants through
`hub-layout.js`, and seeded palms/hammock/scenery construction through
`hub-mainland-planting.js`. Browser lighting, picks, coil effects and local
hammock controls remain in the browser. This extraction does not redesign the
hammock or change NPC routines. The host registers the actual cave dressing,
chalkboard, lantern-post, palm and tree collision meshes; it uses ground
reservations rather than substituting solid-clearance checks for authored
placement. Physical body admission still checks the solid graph separately.

The host builds the fixed claims, reserved construction sites, ladder, fire,
board, totems and moving pile posts in the authored order. It plants palms and
the hammock, then seeded scenery, then claims the library and satellite
approaches and removes the fire-side bush. Pile changes move lantern posts,
remove covered meadow palms and their hammock, and reflow scenery; roster
changes update work-lane clearance. Removed supports notify the Clanker
controller. These changes retain independent NPC/player streams and passive
NPC behavior; no additional feeds, paid loops or activation flags were enabled.

**Remaining layout/recovery gap:** this assembles the same physical layout
algorithms, but does not yet durably record the original layout inputs and
subsequent permanent palm removals. Rebuilding at the current pile level or
roster size can produce a different seeded layout after either changes. The
same issue must be reconciled for a late-joining browser before claiming
restart/late-join collision parity. Existing placement validation remains in
force; activation must stay disabled. Browser-only Canvas fallback geometry,
held-object topology, full-world capacity, strict delivery and combined costs
also remain unverified. No runtime tests or performance claims accompany this
implementation pass.

**Service source boundaries:** BananaPayServer's documented PageApi exposes
invoice/note/onchain and a visitor-scoped socket. That socket requires the real
visitor IP; no server-to-server pile snapshot method is documented. A compatible
read-only service contract is required before a host donation producer can be
connected. Do not fabricate a visitor IP or derive totals from replayed tips.
NPC loot inventory/assignments currently live in each browser's localStorage;
there is no shared inventory producer to subscribe to. Existing explicit,
bounded host configuration is retained. Authored/default NPC appearance can
use empty inventory/assignments without migrating player saves; any shared
outfit editing needs a separately agreed authoritative source. No unrelated
service repository or production data was changed.


### Durable layout and private pile source (v106, activation still disabled)

The combined Hub checkpoint is now version 5. It includes a bounded layout
record `{v:1, level, count, ring}`: the construction pile level and roster
count, and the greatest pile ring radius observed. Recovery builds the original
layout before applying the retained current level and all permanent palm
clearance. The regenerated history must match before actor recovery starts.
A version-4 checkpoint cannot safely supply the missing recipe and is rejected
with an explicit migration requirement. No existing checkpoint is overwritten
or automatically migrated. The layout record is limited to 256 bytes/eight
validation nodes inside the unchanged combined checkpoint budget.

This resolves server-side storage/wiring for layout history, not browser
late-join integration: the browser still needs an explicitly compatible way
to obtain and apply the same recipe before attaching live actors. That remains
an activation blocker. Recovery/collision behavior has not been runtime-tested
in this implementation-only pass.

A separate local companion patch for **OogaBoogaX/bananapayserver** adds
`PageApi.pileSnapshot()` and a matching Durable Object method. It returns only
`{v:1,type:"pile",bananas,at,eatPerHour}`. It uses the existing pile calculation,
selects the local pile row without initializing it, and does not query D1,
change invoice processing, expose donor/node data, add a public route, open a
socket or fabricate a visitor IP. Object startup retains its existing schema
initialization. Only `worker/index.mjs`, `worker/object.mjs` and
`docs/protocol.md` change in that companion patch. It is not published,
installed or deployed; the currently deployed service does not have this RPC.

The disabled finite Hub runner now calls that RPC alongside its existing
activity source, at most once per minute and at most 15 times in an explicitly
started 15-minute run. The durable attempt cursor remains shared. The wait
ends after four seconds; an outstanding RPC keeps its latch until settled so
timeouts cannot accumulate concurrent donation reads in the same object.
Activity and pile failures are independent. Replies must fit 256 bytes/eight
nodes, be no more than a minute old and not be from the future. Regressed or
conflicting timestamps cannot replace accepted state. Unchanged zero-decay
snapshots do not cause extra world writes. No new timer, alarm or recurring
paid run is enabled.

World state version 2 retains the last accepted pile snapshot and computes
its decay on existing simulation steps, including after restart. Snapshots
replace absolute state and never replay donations. Pending activity updates
preserve the pile record, inventory and assignments. A source outage keeps
the last accepted decay schedule; it never injects a zero total. Initial
version-1 configuration with no pile source is still accepted, but new
captures include the version-2 field. All existing state, event and frame
size/rate bounds remain unchanged. NPCs use authored/default appearances; no shared loot source is required.

The local companion and host wiring require targeted tests and real Workers
RPC verification later; the owner's no-new-tests instruction applies to this
pass. No new service binding, production call, merge or deployment was made.


### Browser layout attachment (implementation checkpoint)

The concrete Hub now publishes layout with each complete NPC snapshot. The
bounded layout envelope (at most 512 encoded bytes) contains the original
construction pile level and roster count, maximum historical ring radius,
and current pile level and roster count. Packet version 3 negotiates authority
version 4 (`mixed-3`); older clients cannot attach this full-world stream.
Existing frame, expanded-packet, actor and delivery bounds are unchanged.

A browser awaiting Hub construction advertises viewer interest before waiting
for the snapshot, with a five-second cancellable wait. It constructs the
seeded mainland from the saved recipe, then applies current pile size and
historical palm/hammock removal. Changing current pile/count reflows the scene;
a different world or construction recipe requires a full Hub transition.
Same-world recipe changes and regressing removal history are rejected.
Body reclaim and NPC projection wait until the latest layout is applied.
Existing body-only release preserves voice during reconstruction. The Canvas2D
fallback cannot attach an authoritative Hub with different physical geometry
and fails closed. All preview and activation flags remain disabled.

This is code wiring, not verified live parity. Only build and syntax checks
are authorized in this pass. Cold boot, retained-scene return, cancellation,
late join, reconnect, takeover, layout reflow, body placement and compatibility
need runtime verification later. Additional packet decoding and layout
application costs have not been measured; strict four-Hz throughput, recovery
capacity and production cost gates remain outstanding. The separate private
BananaPayServer snapshot patch is preserved but not deployed; NPCs use authored/default appearances without a shared loot source. No service permission was changed.


### Authored NPCs and shared lake input

Host NPCs retain authored character traits and default weapon skins without
applying Loot Locker assignments. The server-controlled browser NPC stream
uses the same rule. Independent player cosmetics and local saves are unchanged.
New private startup configuration may omit inventory and assignments, which
normalize to empty arrays. Existing validated fields remain in recovery data;
this does not discard a prior checkpoint or migrate player saves.

The finite service runner also reads the aggregate `/api/mempool` endpoint
already used by the browser's chain feed. It shares the durable one-minute
attempt cursor, allows at most one read per interval, aborts after four seconds,
and caps each response at 32 KiB while reading. A 15-minute run permits at most
15 such reads (480 KiB of accepted response bodies). These are ceilings, not
measured CPU or billing costs. Receipt time is recorded because this response
has no source observation timestamp. Failed reads retain the last durable water
state; there is no transaction stream, socket or automatic run renewal.

The negotiated layout envelope now also carries the host's bounded hydrology
checkpoint, under the unchanged 512-byte envelope cap. Clients apply the saved
water level and flood stage before NPC projection/body reclaim and hold those
values between frames. Their local chain feed can still update information
boards and visual effects, but cannot independently move authoritative water.
Late joins therefore receive the current eased water state rather than starting
a separate interpolation from the latest backlog reading. Presentation updates
refresh water collision surfaces even when distant effects are asleep.

Implementation-only checkpoint: source I/O, packet capacity at representative
loads, lake collision parity, startup/restart and browser reclaim remain
unverified. No tests or runtime probes were run in this pass. Full-world strict
four-Hz throughput and combined recovery/resource costs are still release gates.
The donation companion remains a separate local patch and needs its own review,
verification and authorized deployment before that live source is available.
