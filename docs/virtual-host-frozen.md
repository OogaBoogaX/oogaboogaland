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
