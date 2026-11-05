# Frozen disconnect continuity — inactive draft #467

The approved default is a server-owned frozen body. This replaces disconnected
player physics, not shared NPC simulation. Activation and burst remain disabled;
Tess is excluded. No deployment, provisioning, permanent loop or billing change
is included.

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
