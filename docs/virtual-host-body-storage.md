# Body checkpoint capacity audit (#377 / draft #467)

## Current policy: frozen disconnected bodies

The approved pivot uses session schema 5 / `host-session-v5`. All three velocities
are cleared on disconnect, offer and duplicate acquisition; the saved location
stays fixed through grace, restart and expiry. The ten-slot body-3 component and
bounded atomic storage remain, but no controller reconstruction or gravity step
is needed to freeze or expire an admitted body. Historical sizes and physics
benchmarks below describe their named checkpoints, not the new execution cost.

[Current architecture, measurements and remaining gaps](virtual-host-frozen.md)
include zero-momentum reclaim, support loss and the preserved physics commit.
No capacity or rate safeguard was raised. This supersedes the passive-offer and
recovery-cursor descriptions below; resource quantities and animation still reset.

## Historical minimal physical state audit (body-3)

The user's latest direction explicitly permits health, ammunition and jetpack
fuel to reset when the player returns. This supersedes the preservation claims
in both historical audits below. The disconnected player's animation also starts
fresh in a standard pose. Independent NPC recovery remains unchanged.

The body component is now a fixed ten-value tuple: owner id, x/y/z, facing,
x/y/z velocity, remaining jump credits and one movement/form bitfield. That
bitfield holds grounded, passive fall, biped, parked and wall release; airborne
is derived from grounded. The component also binds its schema, world version
and immutable physics baseline. It saves **no health, health cooldown, ammo,
spare magazines, fuel, animation, RNG, AI routes/buffers, counters or scheduler
clocks**. Geometry and remaining controller state are reconstructed from defaults.

Session schema 4 / `host-session-v4` keeps selected equipment and mode (eight
fields), identity, generation/token, location/motion, occupancy and the absolute
deadline. Successful connect returns `resetResources: "defaults"`. Fresh Clanker
reconstruction restores normal full health. Browser weapon/jetpack reclaim is
still unfinished: this directive does not prove the live browser has reset ammo
or fuel. The eventual handler must use normal creation defaults (full current
magazine, empty spare list, full jetpack fuel), retain selected equipment/ownership,
and cancel firing, reloading and thrust rather than replay actions.

Old body-1/body-2 and session schemas are refused, not silently converted. The
body profile remains restricted to a controlled Clanker in an authored noncombat
meadow. Standard-pose recovery checks real rebuilt hull clearance and floor
compatibility; a failed restore cannot publish or silently relocate the body.
No activated writer uses these formats, and no production migration is included.

### Pending handoff storage follow-up

**Current Room/receipt increment:** Room row schema 2 temporarily retains a
server-authored claim (at most 2 KiB) until the initial offer completes, then
releases it. It does not retain that claim alongside the full transfer. The same
storage key refuses earlier row schemas; no deployed writer uses either format.
At 32 maximum-size transfers, Room now measures **1,063,778 JSON bytes** across
33 records, largest row **33,242 bytes**, within the unchanged 34 KiB row cap.

The new host receipt journal has its own **32 × 36 KiB plus 1 KiB index** bound.
It stores one latest result per account, immutable operation identity, a SHA-256
input digest and the original request expiry. A synthetic near-maximum transfer
sample measured **1,056,166 JSON bytes** across 33 records, largest **33,003 bytes**.
The combined measured samples total **2,119,944 bytes**; their combined reservation
is **2,295,808 bytes**, excluding existing host/body checkpoints and provider
overhead. These are maximum-transfer fixtures, not claims about typical minimal
body sizes or billed storage. No session/body reservation was raised.

Receipt and body writes are atomic. Exact retry returns the stored result without
new host writes or physics; changes to signed zero or command identity refuse.
Cancellation also persists, preventing a late RPC from claiming after close.
Retention has no silent eviction or timer. Room must first retain/reconcile the
outcome, then the finite runner must explicitly retire the host receipt after its
original request window expires. Until then, a new request for that account can
be blocked. This bounded cleanup scheduling is not yet wired into a running host.

The new strict load sample still fails delivery (119/120, 78 late; last-client
p95 334.4 ms/max 347.9 ms). It performed 960 host transactions and 1,106 writes,
62,510,497 serialized JSON write bytes over 30 target seconds (36.87 host writes/s).
It does not include reclaim churn, the new receipt writes, full-world interactions,
provider billing units, peak memory or production cost. No permanent loop or
production resource was enabled.

Schema 4 reuses existing times: `offered` retains the disconnect deadline while
passive physics advances `stepAt`; `starting` fixes `stepAt` at the final transfer
and limits its snapshot hold to `min(stepAt + 1000, deadline)`. Only a valid final
ACK clears the deadline and confirms presence. No extra serialized fields, rig
continuation, consumables or health are introduced. The longest state name adds
three ASCII bytes relative to `grace`. The maximum conservative padded session in
the capacity check is **898 JSON bytes**, plus one array separator, against the
unchanged 1,024-byte reservation. Separate body limits and admission stay unchanged.

The real source-controller test covers the offer and lost-ACK path; host-owned
physics continues during offer, pauses only for the bounded starting lease, and
resumes from its saved cursor when that lease expires. A confirmed transport close
cannot shorten an outstanding control lease or extend the original grace period.
Partial-write failures roll back the session and body record together. Duplicate
successful final ACKs do not rewrite storage or refresh last presence.

The inactive v2 browser now restores the final snapshot with controls off and
waits for the host's committed live receipt. Local clocks bound inactive waiting,
not control permission. The new Room outbox persists RPC intent, private references,
one latest transfer and possible live notification. It retains closed pending work
until its exact host outcome can be reconciled. A host abandonment operation can
restore the original deadline after a final ACK only if Room proves no live send
was attempted. A possible live send requires ordinary disconnect handling.

The outbox has a separate internal bound: 32 rows of at most 34 KiB and a 1 KiB
index. A capacity test with all 32 transfers at 32 KiB measured **1,063,362 JSON
bytes across 33 records**, maximum row **33,229 bytes**. This includes JSON field
names and envelopes, but excludes provider storage/index overhead. The existing
session and host body reservations are unchanged. Outbox cleanup frees a slot
only after the exact reference is confirmed passive or absent; uncertain work
blocks replacement rather than silently evicting an owner.

Room lifecycle hooks, close capture and atomic unknown-reply reconciliation now
exist; automatic orchestration, receipt retirement and the scene adapter remain
incomplete. No capability is advertised. Offer/activation/final-ACK and Room outbox transactions add writes;
the prior throughput/cost samples below do **not** measure this new exchange.
No paid loop, migration, binding or production action was enabled.

### Prepared reclaim and current cost model (2026-11-05)

`VirtualHost.prepareBody` reads a token-free observation without claiming a body,
refreshing presence or changing storage. Room must retain it against the current
authenticated socket/nonce. `connectBody` now requires it: epoch, generation and
expiry are checked before recovery uses the transport census, then generation is
checked again after recovery. Delayed readiness cannot evict a replacement or turn
an inferred expired disconnect into a new spawn. An absent body's observation also
binds the global admission counter, preventing create/remove/recreate ambiguity.
An unrelated admission can conservatively invalidate an absent-body preparation;
reuse prepared assets and reread the observation. Existing-body preparations do not
depend on unrelated admissions. The observation expires by the host lease, run end
or known grace deadline. It adds no persisted session field or body bytes.

Forty focused checks pass, including actual source Clanker restore, atomic failure/
retry, duplicate readiness, removal, exact expiry and an unknown close discovered
after restart. These methods still lack the live Room readiness/grant/apply/ACK
exchange and durable close delivery. They do not solve a lost grant or ACK by
themselves. Preparing assets must precede claiming; accepting controls still needs
the current socket and committed generation. Hub/browser tests remain restricted.

The saved 30-second burst run contains **1,106 host key writes, 960 root commits,
and 62,510,497 JSON value bytes**. The root is rewritten during each bounded body
recovery batch. Most serialized traffic is therefore repeated world/session state,
not the reduced ten-value player body. Bytes exclude provider encoding/metadata.
Both the local fixture and configured Room use SQLite; no host namespace is deployed.

Cloudflare bills SQLite KV writes as rows, unlike the legacy KV backend's 4 KB
units. Paid storage includes 50 million monthly writes, then $1/million; usage
and allowance are account-wide. Duration uses allocated 128 MB and active wall time,
with 400,000 GB-s included and $12.50/million beyond it. Excess usage is rounded
to billing units. These are provider rules, not account telemetry.
[Provider pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

The following arithmetic repeats this fixture's workload mix for 30 days and
models one additional Room publication write per 250 ms. Room writes were not
instrumented. This is **not an expected monthly bill**: individual disconnects
last at most 60 seconds, so repetition assumes continuing disconnect churn.

| Conditional scenario | Modeled monthly write rows | Writes with unused / exhausted paid allowance |
| --- | ---: | ---: |
| Repeat the measured host mix, plus Room publications | 105,926,400 | $56 / $106 |
| No passive player batches; one host and one Room write per four-Hz update | 20,736,000 | $0 / $21 |

Those totals exclude other Room writes, reads, requests, duration, stored capacity,
the Workers plan and account traffic. A continuously active object models 331,776
GB-s per 30 days; host plus continuously active Room models 663,552. Hibernation
eligibility and the final runner topology need measurement. No account allowance,
invoice, production CPU, peak heap or device metric was accessed. The offline
calculation is retained in `verification-prepared-reclaim-cost.json` beside the
saved runtime evidence. No new load run was needed. Keep activation disabled;
reducing repeated root work and validating the combined world remain required.

### Four-Hz batching and combined delivery gate

#### Thirty-second stress and bounded burst experiment

The evaluator now supports 40 or 120 scheduled sweeps and 0–100 ms of synthetic
one-way client delay. Delayed decode/ACK data stays limited to one frame per socket;
the last acknowledging client's age includes that delay. Every stream remains
bounded, timers are cleared on exit, and the same 250 ms deadline applies. This
is a latency sensitivity test, not a measured Internet/browser delay distribution.

The 120-sweep, 20 ms-delay comparison used the same 53 restricted actual Clankers,
30 player-body controllers, 31 decoding clients and one stalled socket:

| Policy | Delivered /120 | Late delivered | Last-client p95 /max | Simulation misses |
| --- | ---: | ---: | ---: | ---: |
| Strict rolling four/second | 119 | 84 | 342.4 /352.2 ms | 0 |
| Four/second with two burst credits | 120 | 0 | 211.7 /220.7 ms | 0 |

The rolling run had one safe supersession. Its final confirmations and commits
still move the rolling window forward; that delay accumulates over a longer run.
The burst preview records a virtual 250 ms service schedule with one interval of
extra credit. Late commits spend that credit without shifting every future slot.
It keeps a 125 ms minimum gap and a finite runner deadline. Saturation tests allow
41 publications in ten seconds; any interval of duration D milliseconds is
bounded by `2 + floor(D /250)`. It can deliver five in a rolling second, including
in this sample. **This increases the short-window budget from four to five; it
does not preserve the strict rolling ceiling.** Sustained rate stays four/second.
Payload limits and the single unacknowledged frame per viewer stay unchanged.

The mode is named `rate-4-burst-2-v1`, requires `VIRTUAL_HOST_BURST_PREVIEW`, and has
a distinct persisted cadence version. No deployed config enables it. Negotiation,
rollback, duplicate reconciliation, cold restore and release/reacquisition retain
the debt. Switching policies requires a quiet second. Future cadence versions
refuse. The strict rolling preview and legacy 250 ms default remain available for
comparison; no live configuration was switched. Do not activate or silently pick
the experiment solely because this restricted stress case passes.

Burst-run simulation completion p95/max was 87.8 /103.1 ms; minimum observed commit
gap was 225 ms. No revision was coalesced or superseded. Both runs recovered the
same 30 bodies and 120 NPC steps, survived injected rollback and orderly restart,
converged across all acknowledging clients, and bounded the stalled receiver.
Both attempted 1,106 host writes /62,510,497 serialized bytes during the measured
30 seconds. Burst delivery was 3,752 envelopes /28,602,586 bytes including warm-up.
These are fixture observations, not billed CPU or production pricing. The final
host writes were about 74.8 KiB each, underscoring the cost of repeatedly writing
the combined checkpoint. Full-world jobs, Ooga AI, shared supports/occupancy,
memory and realistic scene state remain outside this measurement.

Evidence: `verification-rolling-stress.json` and `verification-burst-stress.json`.
The strict gate fails in the former and passes with about 29 ms worst observed
margin in the latter. Neither establishes production readiness, abrupt-failure
safety, real browser rendering, or full-world cost. No Hub/browser tests ran.

`VirtualHost.connectBody` now combines authenticated-account validation, priority
body recovery, session claim, matching component capture and transfer in one
transaction. A failed body write or missing transfer capability rolls back the
ownership change too; optimistic retries return only the committed generation.
An actual fresh Clanker restores the returned current motion with normal resource
defaults. A stale version returns no transfer. This closes the gap between separate
`connect` and `bodyForSession` calls, but is **not** a live browser ACK protocol.

The future Room exchange must bind preparation, final grant and ACK to the current
authenticated socket/connection token. While the browser prepares, the original
grace deadline and host passive physics must continue. Only a ready browser may
trigger `connectBody`; a stale request/ACK must not release or recolor another
generation. The existing registry's `connect` marks a session live, so calling it
before potentially slow browser preparation would freeze host passive motion.
No body command or scene activation has been wired around that unsafe shortcut.

#### Rolling-cadence preview and body transfer

The new **explicit opt-in** `rolling-4-v1` cadence enforces no more than four
attempts/publications in every rolling 1,000 ms interval, plus a 125 ms minimum
gap. It absorbs scheduling jitter without increasing the maximum number or bytes
of frames per second. It does allow shorter gaps than the existing 250 ms default;
this is a versioned preview policy change, not an unchanged transport guarantee.
The finite runner still retains one active RPC and one newest pending revision.
Room still allows only one unacknowledged frame per follower. No deployed config
enables `VIRTUAL_HOST_ROLLING_PREVIEW`; mixed-packet and host preview gates remain.

Four timestamps and a counter persist atomically with each Room frame (84 bytes
for the measured cadence object, before its property name/separator). Failed
writes and duplicate reconciliation spend no credit. Restart and explicit
release/reacquisition retain the debt; switching cadence needs a quiet second.
Acquisition confirms the persisted mode before sending a frame, including when
an older Room silently ignores an unknown claim field. Older strict record readers
refuse the extra cadence field. An operator must explicitly migrate back after the
quiet interval before using an older build; do not delete the authority record.
The wire pose format is unchanged, and host confirmation/fencing is unchanged.

One finite ten-second local workerd run, with 53 restricted roaming Clankers,
30 player-body controllers and 32 Room sockets, measured:

| Metric | Result |
| --- | ---: |
| Complete simulation sweeps /delivered sweeps | 40 /40 |
| Missed simulation or all-client delivery deadlines | 0 /0 |
| Coalesced /superseded revisions | 0 /0 |
| Simulation completion p95 /max | 93.5 /95.8 ms |
| Last acknowledging client age p95 /max | 239.8 /247.0 ms |
| First-client age p95 /max | 174.6 /181.7 ms |
| Measured minimum commit gap | 228 ms |
| Maximum commits in any observed rolling second | 4 |
| Host writes /serialized bytes | 466 /17,713,235 |
| Delivered envelopes /bytes, including warm-up | 1,272 /8,620,017 |

All 31 acknowledging clients received identical ordered final data; the stalled
socket retained one frame. Exact body/NPC recovery, failed-write rollback and
orderly persisted restart passed. Evidence: `verification-rolling-throughput.json`.
The stricter gate uses the last acknowledging client and does not credit early
timer wakeups. **This restricted local gate passes with only 3 ms margin.** It
does not certify full-world capacity, real browsers/networks, abrupt eviction,
long-run behavior, billed CPU/peak memory or production costs. The cadence's later
negotiation/migration hardening is unit-tested; the timing sample predates those
changes, which add an acquisition read outside the measured steady window.

`VirtualHost.bodyForSession` now reads a current live session and its exact body
component in the same storage transaction. Its caller must supply the account
from Room authentication. A private token/generation check rejects another socket
or account; grace, stale owner, expired run/lease and inconsistent body rows refuse.
The bounded result includes epoch/revision/expiry, a token-free view, the minimal
checkpoint and `resetResources: "defaults"`. It exports neither another player's
record nor tokens, does not write or renew presence, and constructs no host rigs.
An actual fresh Clanker restores its motion and normal health from the transfer.
This is a server transfer primitive, **not completed authenticated browser reclaim**:
Room's authentication/close outbox, grant/apply/ACK, separate player body and live
presentation integration still need implementation. No HTTP or WebSocket body
command was enabled. First-login NPC placement/continuing ghost tracks remain #379.

#### Prior increment: bounded independent publication

`LatestHostPublication` is an explicit finite state machine, not an activated
loop. It retains one in-flight publication and one newest revision number; it
does not queue frames or start timers. Attempts are spaced at least 250 ms and
runs are capped at 15 minutes. Preparation may overlap Room's remaining interval;
the finite evaluator waits before the final host confirmation and commit.
Committed Room replies now include their original `publishedAt` timestamp, also
on exact duplicate reconciliation. Uncertain failures close the runner. Closing
prevents new work while an already-authorized RPC can still complete.

Interleaved partial recovery returns `superseded` only through the publication
path's explicit `skipPending` policy. Existing strict pose/confirmation callers
still reject incomplete recovery. Fencing, invalid storage and closed runs still
throw; no stale or partially recovered pose is substituted. Room's unchanged
one-unacknowledged-frame rule bounds the stalled receiver.

Two finite ten-second local trials used 53 actual restricted roaming Clankers,
30 actual player-body controllers, 31 decoding clients and one stalled socket:

| Publication timing | Simulation completion max | Emitted /40 | First-client age p95/max | Late emitted |
| --- | ---: | ---: | ---: | ---: |
| Preparation after the slot | 203.7 ms | 35 | 288.8 /294.3 ms | 10 |
| Preparation before the slot | 155.0 ms | 38 | 262.2 /264.5 ms | 5 |

Neither trial missed a simulation deadline. The second had 40 attempts, 38
publications and two safe supersessions; its median delivery gap was 256.0 ms,
maximum 432.8 ms. Ordinary Room commit timestamps were about 255–257 ms apart:
waiting until the previous commit plus 250 ms, then confirming ownership and
dispatching the RPC adds roughly 5–7 ms each time. The accumulated pacing reached
94 ms and crossed the next recovery sweep twice. Projection was 21/32 ms
median/max, confirmation 2/4 ms and Room publication 13/16 ms. These coarse wall
spans overlap with dispatch/client work and are not additive billed CPU.

Both trials verified identical ordered delivery to all 31 acknowledging clients,
final convergence, one retained frame for the stalled client, exact 30-body and
40-NPC-step recovery, rollback and orderly persisted restart. The second measured
466 host writes /17,713,235 serialized bytes during 40 sweeps, and 1,210 delivered
envelopes /8,153,095 bytes including warm-up. This is a substantial write cost,
not actual provider billing or a production cost approval.

**The end-to-end four-Hz gate still fails.** The reported ages above measure the
first client, not the slowest acknowledging client. Review tightened the evaluator
to use the maximum age across all 31 and to prevent early timer wakeups from
counting as scheduling margin. That stricter timing variant has not been rerun;
it cannot turn these failures into a pass. No repeated timing run is warranted
without a concrete scheduling/integration fix. Exact confirmation, cadence and
delivery limits remain intact. Source-only confirmation compatibility was fixed
after an existing recovery test caught its default behavior changing.

Evidence: `verification-publisher-pipeline.json` and
`verification-publisher-prepared-pipeline.json`. These are local authored meadows
with separate NPC/body geometry, no browser rendering, full-world jobs/reservations,
authenticated body reclaim, abrupt eviction or production-account measurements.
The default body construction limit remains one; only the evaluator opts into four.

#### Prior diagnosis: validation and runner cadence

Phase measurements separate host/Room work from serial client decoding in the
local test process. Before the latest change, Room publication itself took
10 ms median /12 ms maximum, host projection 19 /24 ms, host confirmation
13 /16 ms, and 31 client decoders together 62.1 /67.4 ms. The two read-only Room
status calls together took at most 1 ms. These RPC phase spans use workerd's
coarse wall clock; they are not isolated CPU samples. Running one canonical
decoder with 31 byte-compared transport peers reduced client work to 2.3 ms
median, but exposed excessive pacing in the sequential runner. Neither mode
includes browser rendering or real network/device costs.

The restricted roaming evaluator now retains **one private, bounded copy of
validated checkpoint data** (at most 64 KiB encoded). Exact field/descriptor
comparison allows an unchanged simulation to pass body-only validation without
rebuilding all 53 NPC rigs. Any changed data takes the full source restore path;
no hash, ownership/fence, mutable controller or session is cached. Projection and
stepping still construct a private controller within their transaction. Restart
has an empty memo. This optimization is limited to the authored static-world
profile: a real world must include every geometry/support/reservation dependency
in its validation identity before it can use the same technique. Peak heap
usage, including temporary copies, remains unmeasured.

The finite runner now paces after projection and before the final host ownership
check, with a reported 250 ms gap after its warm-up publication. All 40 measured
arrivals remain fixed at 250 ms; no deadline is reset or threshold relaxed.
A matched prior-source run uses the identical runner and 31 decoding clients:

| Same runner, different simulation adapter | Active sweep p95/max ms | Late delivery deadlines |
| --- | ---: | ---: |
| Before exact validation reuse | 282.2 /287.3 | 40/40 |
| After exact validation reuse | 189.8 /193.6 | 30/40 |

Body-only transactions now take about 3.7 ms median, and host confirmation 2 ms.
The remaining misses accumulate around the Room's unchanged minimum 250 ms
spacing and runner scheduling: final completion delay reached 451.9 ms after
40 arrivals, although active work stayed below budget. **The strict end-to-end
gate still fails.** This is evidence to redesign the bounded publication runner,
not permission to enable the host, raise transport limits or claim four-Hz
production readiness. Room production code was not changed by this increment.

The same 10,001 ms outage/restart case recovered 30 bodies and 40 NPC steps
exactly in 17 transactions, 1,151.4 ms total, max143.1 ms; 73 host writes /
852,403 bytes. Failed writes, stale-owner fencing and orderly restart passed.
New tests ensure exact-data reuse, lazy fresh-controller construction, malformed
and changed record refusal, isolated failed attempts and cold revalidation.
Evidence: `verification-room-{phases-all,phases-one,matched-before,memo-throughput,memo-recovery}.json`.
The preserved prior adapter's hash matches the previous checkpoint manifest.

#### Earlier batching results

`createClankerBodySessions` now accepts an explicit `bodyLoads` budget of 1–4.
The default remains one. Only the finite evaluator opts into four; no deployed
caller or activation flag changed. Construction counts are shared across retries,
passive work remains capped at 1,200 steps, and bodies beyond the batch retain
their cursor/deadline. No partial body sweep may publish. Tests compare the same
committed five-body checkpoint under serial and four-body batches, including a
rolled-back optimistic attempt: state, ownership and deadlines match exactly.

`body-session-runtime.mjs --roaming --steady --body-loads=4` adds a finite
40-frame trial scheduled every 250 ms. Each sweep advances 30 distinct player
controllers and 53 actual restricted roaming NPCs. Queue delay accumulates when
service is slow; the harness never resets its arrival schedule to hide misses.
`--deliver` includes the real Room RPC/storage/WebSocket implementation and 32
synthetic protocol clients, one of which never acknowledges. A fixture-only Room
subclass exposes the actual publication timestamp for pacing; it changes no
production Room behavior or rate limit. Clients retain only their latest frame.

| Trial | Transactions /40 sweeps | Sweep p95/max ms | Missed deadlines |
| --- | ---: | ---: | ---: |
| One body/transaction, no delivery | 1,200 | 634.6 /638.3 | 40/40 |
| Four bodies/transaction, no delivery | 320 | 204.7 /210.8 | 0/40 |
| Four bodies + Room +32 clients, final pacing | 320 | 332.0 /334.5 | 40/40 |

The final combined run delivered 1,272 frames /8,620,017 bytes. All acknowledging
clients received byte-identical current poses; the stalled client received one
frame. Publication p95/max was 130.9 /137.9 ms. Active work excluding pacing still
exceeded 250 ms, so the combined four-Hz gate **fails**. These are local wall times
including 31 client decoders in one Node process, not production host CPU or a
claim about distributed-client performance. The earlier delivery trials used
conservative reply-completion pacing and are retained as intermediate evidence.

Host persistence wrote 466 keys /17,713,235 serialized bytes over 40 combined
sweeps: 46.6 host key writes per target second. This excludes Room storage,
attachments, billable units and peak memory. The lower transaction count reduces
amplification but does not certify affordable permanent operation. Four-body
10,001 ms outage recovery took 17 transactions /1,396.7 ms total, max159.0 ms,
with 73 host key writes /852,403 bytes. All 30 restored bodies and 40 NPC steps
matched their exact references; rollback, orderly restart and stale-owner fencing
passed. Body records and capacity reservations did not grow.

The roaming evaluator also provides transaction-bound read queries, avoiding a
second controller reconstruction after publication validation. Readers expire
on checkpoint mutation/disposal and change no saved state. This is an evaluator
adapter improvement, not full-world simulation or a cross-transaction rig cache.

Evidence: `verification-four-hz-{single,batched,batched-recovery,room-paced}.json`.
No browser/Hub tests ran. The world still uses separate authored meadows rather
than shared island collision/occupancy. Ooga AI, full-world jobs/reservations,
authenticated browser body reclaim, live disconnect presentation and production
cost validation remain open. No new signing attempt, PR publication or activation.

### Complete sizes, including encoding overhead

The finite `worker/eval/body-storage-audit.mjs` run measures 48 actual running,
double-jump and landing states, matching session motion, 13-digit timestamps,
and all JSON/base64 overhead. Removing the nonessential state reduces the
largest measured inline session+body from **1,418 B to 828 B**.

| Representation | Minimum | Maximum |
| --- | ---: | ---: |
| Packed physical body | 196 B | 240 B |
| Session + body inline, including continuation key | 712 B | **828 B** |
| Departure + body inline | 688 B | 804 B |
| Repacked combined record | 771 B | 859 B |
| Separate session + stamped body row | 876 B | 992 B |
| Conservative metadata bound + measured body | 1,107 B | 1,151 B |

The largest inline sample is **572 B session + 240 B body + 16 B key/separator**.
The session itemization (field name and value included) is account 15, body id 17,
kind 16, generation 14, token 42, zone 16, state 15, lastSeenAt 26, deadline 24,
stepAt 22, motion 179, equipment 156, null occupancy 16, punctuation 14 bytes.
The packed body uses version 5, shape table 42, encoded data 111, scalar pool 77
and punctuation 5 bytes. Before packing: schema 5, world 33, baseline 34,
physical tuple 143 and punctuation 5 = 220 bytes.

For that sample, the physical tuple's individual JSON values are owner id 11 B,
x 18, y 18, z 17, facing 3, vx 19, vy 19, vz 18, jump credits 1 and flags 1.
The remaining 18 B are its array/key punctuation. The binary scalar encoding
uses 9 B for each of these seven non-float32-exact physical numbers, preserving
precision; the evaluator also reports scalar widths before pooling/base64.
Per-field binary widths cannot simply be added to the final JSON size because
pooling and base64 have shared overhead. Removed gameplay/animation fields take
**zero bytes** in either record.

A codec-boundary fixture with 80-character owner/world ids and seven distinct
float64 values is 376 B. Combining it with the conservative maximum session
metadata estimate gives **1,287 B**. This is a conservative bound scenario,
not a reachable-island load or a claim of the absolute maximum encoding.
Therefore sample records fit 1 KiB, but universal 1 KiB admission is unproven.
Keep separate atomic rows and existing caps for this checkpoint; no limit was
raised. A hypothetical 2 KiB inline reservation would reduce the existing
64 KiB-world capacity from 30 to 15 sessions. The storage cap of 8 KiB per body
is a refusal bound, not the amount actually written. No compression library or
lossy quantization was added.

### Actual passive-body transaction integration and limits

`clanker-body-sessions.js` now restores, steps and captures the actual controlled
Clanker in the same storage transaction as session motion. Each attempt owns and
disposes its controllers; retries cannot reuse speculative physics. Confirmed
close and duplicate live ownership zero horizontal held movement in both the
registry and body, keeping vertical velocity and jump credits. Stale closes,
failed admission, partial writes and unbacked metadata-only movement cannot
replace committed body state. Unsupported occupancy and live updates refuse.

The adapter budgets 1,200 passive 50 ms steps per operation, enough for one full
60-second reconnect window. The outer retry budget is shared. Thirty bodies
recover 36,000 steps over 30 transactions; unchanged live records do not build
controllers. Tests cover actual gravity to landing, duplicate sessions,
rollback/retry, owner replacement, deadline and timely same-body reclaim.

Local Node measurements, including cold VM/controller creation and in-memory
storage copies, are **228.55 / 232.03 / 232.61 ms p50/p95/max** for already-closed
30-body recovery (zero batches above 250 ms). Batch admission/close remain
**656.29 / 650.28 ms**. If a restart first discovers all 30 disconnected sockets,
the first transaction must also neutralize their body records: measured recovery
p95 **304.15 ms**, max **869.12 ms**, three batches over 250 ms. **This fails the
activation budget.** Step count alone is not a CPU guarantee. A bounded close/
neutralization design and combined world/body runtime measurements remain needed.
These actors occupy independent empty fixture meadows, not one colliding world;
this is not workerd CPU, SQLite billing or production resource certification.

Cold single-body reconstruction p50/p95/max is 22.86/26.10/27.47 ms. Forty-eight
independent physical next-step comparisons have zero mismatches. Verification:
128/128 host/recovery tests and 408/408 browser-free local unit checks. No Hub,
full or browser suite was rerun; the 20-entry STOP ledger remains unchanged.
Current local evidence: `verification-minimal-recovery-{size,body,rebuild,cost,unknown-close}.json`
and `verification-minimal-recovery-{host,unit}.log` in the task workspace.

Authenticated browser reclaim, production collision/support/occupancy, full Ooga
and world simulation, first-login NPC position with continuing ghost track (#379),
live disconnect presentation and combined runtime/account cost validation remain
unfinished. Activation remains disabled, Tess excluded, and the PR remains draft.

### Follow-up: data-only closes, construction bounds and actual local runtime

The preceding Node timings describe the first body-3 integration. The current
follow-up neutralizes admitted body records without rebuilding rigs: a codec
created from trusted source rules checks schema, world, physics baseline, owner
and the previous registry motion, then changes only vx/vz to zero. The resulting
motion must match the new registry record before the atomic commit. Its rules
retain no controller or scene. Tests compare the result with actual source
`disconnect()` over 24 physical states, reject corrupt/foreign records, and use
the data codec after disposing its bootstrap controller. No physics time or
position changes in this path. Thirty-body close fell from about 650 ms to
6–8 ms in the Node fixture.

A separate **one-controller construction bound per host operation** now applies
across storage retries. The registry's optional `canStep` hook defers other
bodies, preserving their cursors and deadlines; existing ordering and reconnect
priority select the next body. Pending recovery cannot publish or advance NPC
time. Over-budget new-body batches abort atomically and must be split; a fresh
admission competing with recovery work may likewise need a later operation.
Failed retries cannot multiply cold-controller work. This is a conservative
inactive adapter policy, not a proven final delivery cadence.

`VirtualHost` also accepts a lower `simulation.maxSteps` in the range 1–8, while
retaining the fixed 250 ms simulation step and default eight-step cap. The new
combined-runtime fixture selects four NPC steps per operation. Tests show five
eight-step commits and ten four-step commits produce exactly the same 40-step
state, including rollback. Neither change loosens the 250 ms measurement gate.

The new finite `body-session-runtime.mjs` / `body-session-runtime-worker.mjs`
loads the actual source in cached **Miniflare 5.20261001.0-alpha/workerd** and
uses local SQLite. It creates 30 distinct player bodies, measures cold boot and
persisted restart, injects write failure, tests old-owner fencing, and restores
all bodies into actual controllers to compare motion and normal health. It also
supports 53 actual restricted roaming NPC entries in the same host transaction.
There are no live bindings or outbound requests. Bootstrap rigs are disposed;
their data-only identity codecs are retained. Diagnostic verification rebuilds
all bodies outside the host mutation budget and is reported as such.

| Local fixture | Recovery p95 / max per transaction | Total sweep | Serialized recovery writes |
| --- | ---: | ---: | ---: |
| 64 KiB padding world, 30 confirmed closes, 60 s | 11.10 / 19.16 ms | 247.64 ms | 2,437,513 B |
| Padding world, 30 unreported closes, 60 s | 11.94 / 20.45 ms | 254.15 ms | 2,448,731 B |
| Padding world, 30 unreported closes, 250 ms | 4.72 / 9.15 ms | 105.52 ms | 2,469,845 B |
| 53 NPC entries + 30 unreported closes, 250 ms | 31.99 / 39.90 ms | 528.95 ms | 1,240,296 B |
| Same, 10,001 ms outage, eight NPC steps/operation | 210.11 / **250.45 ms** | 1,452.36 ms | 1,453,397 B |
| Same, four NPC steps/operation (current fixture) | **147.82 / 170.14 ms** | 1,865.34 ms | 1,726,860 B |

The final comparison verifies **30 bodies and all 40 NPC steps exactly** against
continuation from the saved pre-outage state. It takes 39 recovery transactions
and 98 key writes, versus 34 transactions /93 writes with the larger NPC batch.
The initial evaluator incorrectly compared a second fresh world boot and then
stopped after body recovery, before all NPC catch-up completed; both harness
issues were fixed without weakening the exact-state or 40-step assertions.
Long 60-second outages exceed the existing NPC catch-up horizon and drain/pause
NPC time; those cases certify body expiry, not 60 seconds of NPC simulation.

All local-runtime scenarios passed storage rollback, orderly persisted restart,
actual physical restoration and zero logs/egress. Long/medium cases verified
replacement-owner fencing; the short case retained the still-valid owner lease.
The runtime uses independent authored meadows: body/NPC ownership, collision,
Ooga AI and full-island world state are not integrated. These are wall times with
dispatch/diagnostic reads, **not billed CPU, peak memory or actual billing units**.
The current Node cold-VM version still varies over budget (up to 408.58 ms in
one long run); it is distinct from the bundled local runtime, not a waived gate.

**Activation remains disabled.** In particular, a 528.95 ms complete short sweep
does not certify four-Hz delivery, even though each transaction fits 250 ms.
The one-body budget would need up to 30 root commits per fully occupied grace
sweep; at four sweeps/second that is 120 root commits/second before body-row
writes. This is a capacity/cost concern, not authorization for a paid loop.
Batching/caching validation and checkpoint-write amplification need further
measurement with the complete world and live transport before a rollout.

Final follow-up verification: **131/131 host/recovery tests**, **408/408 local
unit checks**, with the unchanged Hub STOP ledger and no browser rerun.

Evidence in the task workspace: `verification-data-close-{known,unknown}.json`,
`verification-body-work-budget-{known,unknown,short}.json`,
`verification-body-session-sqlite.json`, `verification-body-session-roaming-sqlite.json`,
`verification-body-session-combined-catchup-complete.json`, and
`verification-body-session-bounded-catchup.json`. The evaluator-only diagnostic
failures and their fixes are in `verification-body-session-eval-failures.json`.

## Previous standard-pose audit (body-2, historical)

The user no longer requires a disconnected player's rig pose or animation
continuation to survive recovery. The restricted controlled-Clanker profile is
now **body-2**, with component schema 2. It omits the entire managed rig, the
entry animation scheduler, and source-declared takeoff/landing, gait, grooming,
sitting and office/lab animation phases. Geometry rebuilds from the character
definition. It keeps root position explicitly, facing, drive/vertical velocity,
jump credits, health/cooldown, form, identity binding, random stream, scheduler
and remaining gameplay state. Fields that affect physics (including motion
collision-envelope flags) are retained. Roaming NPC continuation is unchanged.

Restore uses a fresh disposable controller and settles a standard rig without
stepping physics, possessing again or replaying controls. It checks the rebuilt
body through the world's clearance callback and rejects an overlapping body or
incompatible floor. Failure poisons that controller; it cannot publish. It does
not teleport to a fallback or claim generalized island depenetration. The source
profile remains limited to the authored noncombat meadow. Old body-1 profiles,
old component versions and rig-bearing snapshots are refused; no migration or
live browser activation is introduced.

### Full record measurements

`worker/eval/body-storage-audit.mjs` measures 48 successive running/double-jump,
health-recovery and landing states with a matching eight-field motion envelope,
13-digit epoch timestamps, equipment metadata and all JSON/base64 overhead.
These are finite local fixtures, not maximum possible full-island bodies.

| Representation | Observed minimum | Observed maximum |
| --- | ---: | ---: |
| Packed body component | 660 B | 785 B |
| Session + body inline, including continuation key | 1,221 B | **1,418 B** |
| Departure + body inline | 1,197 B | 1,394 B |
| Repacking the combined object | 1,290 B | 1,458 B |
| Separate session + stamped body row | 1,385 B | 1,582 B |
| Conservative maximum metadata + measured body | 1,640 B | 1,765 B |

The maximum inline sample consists of **617 B session + 785 B body + 16 B
continuation key/separator = 1,418 B**. The session's field/key bytes are:
account 15, body id 17, kind 16, generation 14, token 42, zone 16, state 15,
lastSeenAt 26, deadline 24, stepAt 22, motion 179, equipment 201, null occupancy
16, and 14 punctuation bytes. The packed body's fields are version 5, shape
table 113, data 503, scalar pool 159, and 5 punctuation bytes. Before final
packing its semantic groups occupy: version 5, world 33, baseline 33, clocks 62,
actor scalar deltas 593, typed-buffer deltas 101, position 68, punctuation 8 =
903 bytes. Saved rig/animation continuation contributes **zero** bytes.

Gzip level 6 of the full record is 796–933 binary bytes, but its versioned JSON
base64 envelope is 1,096–1,276 bytes. Brotli quality 4 is 802–958 binary bytes and
1,107–1,315 JSON/base64 bytes. Neither establishes a safe 1 KiB JSON reservation.
No compression dependency or lossy numeric encoding is enabled.

Removing the rig roughly halves the earlier measured body component; it does
**not** make the combined record fit 1 KiB. A 2 KiB inline reservation would fit
these samples and their conservative metadata expansion, but still halves the
current 30-body admission to 15 at a 64 KiB world budget. It is not a proven
maximum for Ooga, full-world interactions or future body schemas. Keep the
atomic separate-record layout for now: 8 KiB component, 9 KiB row, 32-row hard
cap and current 30-body host capacity. Its full-body refusal bound remains
9,172 bytes including conservative metadata/key overhead. No bounds were raised.

Focused verification covers fresh standard pose, repeated replacements through
landing, the remaining midair jump, held-input neutralization, version refusal,
collision rejection using the actual convex hull kernel and an obstructing body,
and rejection when a changed floor would bury the player. Forty-eight independent
rebuild samples preserve the measured gameplay values exactly through the next
step. A richer cold reconstruction audit measures up to 785 B/32 packed nodes,
with p50/p95/max 22.290/24.907/26.060 ms in Node VM. This includes cold module
loading and is not workerd CPU or combined recovery certification.

Browser reclaim/control binding, authenticated Room commands, production
collision/support/occupancy, full Ooga recovery and combined world/body cost
validation remain unfinished. Existing Hub STOP restrictions still block the
browser lane. The red/green indicator and Tess exclusion remain intact.
Local evidence: `verification-standard-pose-storage-audit.json`,
`verification-standard-pose-rebuild.json`, `verification-standard-pose-body.json`.

The updated local SQLite evaluator also passed all three 120-commit/30-body
scenarios: unchanged body-2 components p95 **4.301 ms /one key written**,
changing body-2 components **5.159 ms /31 keys**, and the 8 KiB ceiling fixture
**4.496 ms /31 keys**. Rollback, orderly persisted restart and stale-owner
fencing passed with no logs or outbound requests. Peak serialized write bytes
were 80,501 /108,793 /331,633 respectively. As before, the world is padding and
one body's snapshots are copied across synthetic identities; the ceiling string
is a storage-size test, not worst-case controller CPU. Node/workerd dispatch and
validation are included; full-world simulation and production billing are not.

Verification: **126/126 host/recovery tests**, **408/408 local unit checks**,
320-script build, nine changed JS/MJS syntax checks and whitespace pass. The
final added upright-form collision case also passed the three body tests. The
20-entry Hub STOP ledger is unchanged; no Hub/full/browser check was rerun.
Additional evidence: `verification-standard-pose-storage-runtime.json`,
`verification-standard-pose-host.log`, `verification-standard-pose-unit.log`,
`verification-standard-pose-collision-final.log`.

## Original storage decision and measurements (body-1, historical)

The remainder records the original exact-rig audit. Its requirement to preserve
animation continuation is superseded above; its storage atomicity, provider
limits and capacity analysis still apply.


The **1,024-byte slot is an internal reservation**, introduced by `d477e549` for
session schema 2, before complete controlled-body continuation existed. It is
not a Cloudflare or transport limit. Keep the existing metadata reservation and
store complete bodies in separate, atomically referenced records. The new
`host-body-storage.js` adapter implements this opt-in layout; no deployed host,
Room command or browser path uses it.

## Source and inventory

- `worker/src/virtual-host.js`: `HOST`, constructor `maxSessions`, `validate`,
  `save`. It reserves 96 KiB total, the full simulation budget, 2 KiB metadata and
  1 KiB /48 nodes per session or pending departure. A 64 KiB world permits 30
  retained slots. The cap reserves future growth rather than today's occupancy.
- `worker/src/host-sessions.js`: `SESSION`, `PENDING`, `MOTION`, `EQUIPMENT`,
  `readBody`, `checkpoint`. A session holds account/body/kind, generation/token,
  zone/state, three timestamps, eight motion fields, eleven equipment fields
  (including ordered spare magazines), and an optional occupancy kind/id.
  A departure holds its id/type/green glyph, account/body/generation, reason/time,
  optional NPC handback, zone, body motion/equipment, and applied flag. Departures
  retain a slot until acknowledged. No input history, mesh or textures are saved.
- `worker/src/clanker-roaming.js`: `createClankerBodyCheckpoint` reconstructs
  source defaults and stores scalar deltas, random state, 16 scheduler/ownership
  values, typed-buffer deltas and managed rig continuation. It has an **8 KiB
  standalone refusal cap**, not a proven maximum over every future gameplay path.
- `worker/src/checkpoint-pack.js`, `checkpoint-binary.js`: shape dictionaries,
  pooled scalars, compact constants/int16, float32 **only when exact**, otherwise
  float64, plus bounded base64 chunks. Negative zero is retained. Rig poses also
  use the existing lossless `npc-pose-packet.js` encoding. This is already packed
  state, not an uncompressed model dump.

Cloudflare currently documents **2 MB combined key/value** for SQLite storage and
**128 KiB values /2 KiB keys** for legacy KV storage. The implementation's 96 KiB
logical root remains unchanged; the new envelope is capped at 97 KiB and every
body row at 9 KiB. Explicit storage transactions commit or abort their operations
together. See the provider's [limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
and [transaction API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction),
checked 2026-11-05. JSON byte meters are application bounds, not a measurement of
Cloudflare's structured-clone/database overhead.

## Measurements and alternatives

`node worker/eval/body-storage-audit.mjs` measured 48 successive restricted
Clanker jump/landing states on Node 22.23.4, macOS arm64. These are component and
synthetic session-envelope measurements, not an Ooga restore or complete island.

| Representation | Maximum measured bytes |
| --- | ---: |
| Existing schema-2 live /grace /departure envelope alone | 493 /496 /486 |
| Conservative envelope upper bound (max ids, timestamps, occupancy, numeric lengths) | 963 /964 /933 |
| Packed Clanker component, excluding envelope | 1,515 |
| Grace envelope plus complete component | 2,027 |
| Departure envelope plus complete component | 2,017 |
| Packing that complete grace record again | 2,127 |
| Gzip level 6, binary /JSON-base64 envelope | 1,345 /1,828 |
| Brotli quality 4, binary /JSON-base64 envelope | 1,411 /1,919 |

The earlier health/form/double-jump evaluator reached 1,531 bytes; this smaller
fixture does not supersede that maximum. Conservative envelope growth plus the
component's 8 KiB refusal cap needs **9,172 bytes**, including the additional
`continuation` key/punctuation. This is a storage reservation calculation, not a
claim that every possible future body fits the component cap. Numeric upper
bounds deliberately overestimate floats with quoted 25-character strings.

The first expanded sample had 21 compact numeric constants, 47 int16 candidates,
one exact float32 and **27 numbers requiring float64**. Arbitrary float32 or
coordinate quantization changes state. Large account ids, generation counters
and epoch timestamps also cannot be narrowed to 32 bits. String/enum dictionaries
and sparse source defaults already remove substantial repeated data.

Gzip encode/decode p95 was 0.096/0.030 ms; Brotli 0.099/0.029 ms; repacking
0.107/0.068 ms. Whole-process CPU medians around encode/decode calls were
47/12 microseconds for gzip and 48/13 for Brotli; these include process/runtime
activity and are not isolated compression-thread or billed CPU measurements. These short Node zlib/wall-time samples include no workerd or
production certification. Compression still misses 1 KiB, can expand unsuitable
inputs, and would require an explicit schema plus bounded decompression. It is
not used by the new store. Repacking a single already-packed component grew it.

Keeping the 96 KiB root and 64 KiB world, inline slots of 2 /3 /4 /9 KiB admit
15 /10 /7 /3 bodies respectively. Increasing the root could work on SQLite, but
would enlarge every read/validation/write and change the host schema/admission
contract; it also abandons the current legacy-compatible per-value bound.
Separate records preserve current admission and let unchanged bodies avoid
rewrite while retaining exact state. They cost additional keys and validation.

Rebuilding the model is already supported. `clanker-rebuild.mjs` additionally
reset the managed rig and reconstructed it from outer state: component size fell
from 1,508 to 818 bytes without saved rigs. All 48 one-step samples retained the
tested root position/velocity/health/jumps, but all differed in exact continuation
and the torso collision hull differed by up to **0.02363 m**. The empty meadow
cannot establish obstacle/support safety. Do not silently drop this state.
The first diagnostic omitted restored root visibility and was rejected by the
existing profile guard; restoring that basic setting fixed the diagnostic.

## Implemented storage boundary

`createHostBodyStorage` decorates the same transaction used by `VirtualHost`.
It persists a versioned profile envelope at the existing root key and at most
32 fixed body keys. The logical host record retains its schema/limits. A complete
row set must match account/body/generation/kind for every live, grace or pending
record, in generation order. Each body component has an 8 KiB /128-node cap;
each envelope/row has its own byte/node bound. The current 64 KiB world still
admits 30 bodies; configurations whose host admission exceeds 32 are refused.

The root records each row's exact revision. Unchanged bodies reuse that revision;
changed bodies and the new root commit in one transaction. Host ownership remains
in the existing root. Old ownership cannot write through `VirtualHost`; stale,
missing, wrong-profile/world/generation rows fail recovery. Old raw layouts and
the new layout mutually refuse each other, with no automatic migration or reset.
Orphan rows with a missing root also refuse initialization. Expiry keeps the full
body until departure ACK; removal compacts fixed slots and deletes unused keys
in the same transaction. A caught write failure still poisons the transaction.

At 30 bodies the reserved aggregate is **367 KiB** (97 KiB root +30×9 KiB rows),
or **385 KiB** at the adapter's 32-body ceiling. It is deliberately finite, not
an increase to the logical root/world/metadata slots. The current typed callback
must provide retry-safe, complete source-owned body state; this store does not
implement passive full-body physics, authentication or browser reclaim.

Five focused tests cover actual component round-trip/restoration, host replacement,
unchanged deadlines, timely reconnect and stale close; component-ceiling occupancy,
departure retention and deletion rollback; partial writes and speculative retries;
mixed layouts, corruption, missing records and missing-root orphans; and exact
signed-zero/tiny-float preservation when detecting unchanged rows. The actual
Clanker test checks exact restored state, airborne state and remaining jump; its
session motion fixture is static and does not claim integrated passive physics.

## SQLite cost and remaining gates

`body-storage-runtime.mjs` uses an existing cached Miniflare
5.20261001.0-alpha/workerd runtime, local SQLite persistence and blocked egress.
It runs 120 finite commits per scenario with 30 synthetic body identities and
a full 64 KiB padding world. Changing actual components cycle through 48 authored
Clanker snapshots; they are copies, not thirty independent actors.

| Scenario | Tick wall p50/p95/max ms | Peak measured bytes written/tick | Keys written/tick |
| --- | --- | ---: | ---: |
| Actual component, unchanged | 3.673 /4.946 /6.344 | 80,501 | 1 |
| Actual components, changing | 4.244 /5.060 /6.534 | 130,903 | 31 |
| 8 KiB component ceiling, changing | 3.213 /4.348 /5.385 | 331,633 | 31 |

All scenarios read 31 keys, preserve exact payloads, roll back injected failures,
recover after orderly workerd reconstruction and reject the old host. Zero egress
and logs. The byte-ceiling string is not a valid Clanker and its one-node shape is
cheaper to validate; its lower time is not a worst-case CPU guarantee. Timings
include dispatch, JSON copying and diagnostics; no full-body controllers run here.
The initial layout rewrote unchanged body rows; revision references removed those
30 unnecessary writes without changing restore data. Exact bounded value comparison also avoids JSON equality collapsing negative
zero. Final timings were collected serially after tests finished; the preceding
run overlapped tests and is retained separately, not used in this table.

At four commits/second, 31 changing keys imply **111,600 key writes in 15 minutes**
or 321.408 million in a hypothetical continuous 30-day run. These are modeled
operations, not observed billable usage. SQLite KV methods are billed as rows;
the published paid allowance is 50 million writes/month, then $1/million, shared
with other usage. The free limit is 100,000/day. Deletes also count. Compute
duration is billed while active or unable to hibernate, so an always-on loop can
cost even between ticks. Provider billing applies allowances and rounding; these
local wall times are not billed CPU or an account quote. See [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Activation remains disabled. Complete Ooga state, constrained full-body recovery
work, actual supporting bodies/occupancy, authenticated Room commands, browser
apply/reclaim, combined world/body runtime and peak memory, abrupt eviction,
real-device visuals and account usage/cost verification remain open. This solves
the storage layout increment, not the whole host or safe permanent operation.
Tess is excluded; the red/green indicator code is unchanged. #379 owns fresh
login at the authoritative NPC position and its continuing ghost track; timely
reconnect reclaims the retained player body instead.

Verification: **125/125 host/recovery tests**, 320-script build, five JS/MJS
syntax checks and whitespace pass. The existing 20-entry Hub STOP ledger is
unchanged; no Hub/full/browser run. Local evidence:
`verification-body-storage-audit-final.json`,
`verification-body-storage-runtime-serial.json`,
`verification-body-storage-full-host-final.log`,
`verification-body-rebuild-audit.json`.
The audit's first envelope attempt used explicit release after disconnect; the
registry correctly refused that stale live operation. It now advances the real
grace registry to expiry to measure the actual departure envelope.

## Local v39 combined delivery measurement

The optional retained Room ticket eliminates two status reads per publication,
while keeping final host confirmation and transactional Room fencing. The finite
120-sweep strict-cadence test still fails delivery: 119 emitted/1 superseded,
80 late, last-client p95 327.001 ms/max 352.407 ms, first-client p95 264.001 ms.
Simulation completion p95 138.879 ms/max 154.305 ms has zero deadline misses;
publication pacing p95 79 ms remains outside that service measurement.

The 30-target-second sample writes 1,106 host records in 960 transactions and
62,510,497 serialized JSON bytes (36.867 host writes/target second). These are
instrumented host KV operations and JSON sizes, not provider billing units; Room
storage, full-world geometry/occupancy, body handoff churn and peak memory are
not included. No permanent loop or production cost validation is enabled.
The separate body records, essential physical state and resource-reset policy
are unchanged. Local evidence: `verification-retained-room-strict.json`.

## Local v40 independent factory recovery

The finite evaluator now constructs bodies through the source-owned independent
player factory, with explicit static-world admission rather than NPC possession.
After an unreported 10,001 ms absence and replacement host, 30 actual bodies and
40 restricted NPC steps recover through 17 operations. Per-operation p95/max is
139.510 ms; total catch-up is 1,119.587 ms, plus separately measured cold startup
271.985 ms and restart 84.609 ms. Recovery attempts write 73 host records and
852,403 serialized JSON bytes. Original deadlines, rollback and stale-owner
rejection pass; zero egress/logs. The record format and reservation bounds are
unchanged. No Room handoff churn, full-world physics, browser, billed CPU or peak
memory is included. Evidence: `verification-player-factory-recovery.json`.

## Local v41 terrain support boundary

`body-terrain-3` keeps the same ten-field physical body representation. Its trusted
support-query version changes the baseline, so mixed profiles/terrain revisions
refuse. Host-only passive restore may defer a missing-footing correction to the
next source step; capture and live activation are blocked until that step. The
session adapter performs it inside the existing atomic body/registry transaction.

A finite warm-Node sample of 32 distinct identities, one removed platform and one
wall used eight four-body operations, one body controller alive at a time. Maximum
operation 5.662 ms, total 24.487 ms; maximum sampled component 194 bytes. This is
not a complete session/envelope bound, workerd measurement or production billing
estimate. No full-world/churn/network/peak-memory load is represented. Evidence:
`verification-terrain-body-cost.json`; the per-body timing stops at capture,
whereas operation timing includes disposal. Full recovery correctness is covered
separately by focused actual-controller and atomic-host tests.

## Local v42 final activation placement check

Placement validation is shared by standard-pose restore and the final control
activation boundary. A fresh geometry query at activation prevents a platform
removal or overlapping obstacle during the handshake from reusing stale clearance.
It changes no stored fields or encoding sizes, moves no body, and advances no
animation or physics. The 17 focused body/reclaim checks pass. Failed activation
still needs a body-only host release/reconciliation path before live integration;
local control refusal alone does not change the server registry to grace.

The v41 cost sample predates this final activation query. Its passive-recovery
operation path is unchanged, but no new measured end-to-end cost claim is made.

## Local v43 body-only close durability

The nonce-only body-decline receipt reuses the bounded v2 Room row and existing
closedAt/phase fields; no body codec or storage-capacity increase. It atomically
marks that exact authenticated exchange closed and preserves unknown RPC work.
A pending or closed row prevents same-connection admission until host cleanup and
row retirement finish. Socket voice remains connected; restart repairs a stale
attachment from the durable closed row. Explicit server staging after retirement
can clear the stale marker and prepare a fresh nonce on the same connection.

The existing liveSent marker governs cleanup: false may abandon an unchanged hold
and retain its original deadline; true disconnects current state at the first
observed close and uses ordinary live-disconnect grace, even if the browser says
activation failed. No client assertion permits rollback. Focused tests cover
write rollback, uncertain reply, restart, stale request/connection, retained RPC,
original pre-live deadline, post-live disconnect and same-voice retry. Production
runner scheduling, census and live scene lifecycle remain unverified.

## Local v44 storage-independent browser recovery

Packed records now expose a pure transfer projection using source-owned rules.
The public wire is v/world/profile/body, with ten physical slots and explicit
signed-zero spelling. Page code validates owner/world/complete trusted baseline
and fixed shape before restoring a fresh standard body. No generic packed-state
decoder is shipped to the page. One failed restore consumes its decoder.

createClankerBodySessions.browserTransfer is explicit/defaultfalse. Its projection
is synchronous and used consistently by all host body reads, final/duplicate ACK
checks and abandoned-hold proof checks; stored records and body-bank capacity are
unchanged. Format changes require draining outstanding old-format handoffs.
The2048B component bound is internal, not a Cloudflare/provider/session limit.
Representative component194B, complete transfer829B, session+body row828B; another
long-name/numeric component340B, excluding envelope. These do not include full
host root/index/provider overhead and do not prove every combined record<1KiB.

Final source sample32bodies: recovery+wire encode maxfour-bodyoperation5.825917ms,
page-source construction/decode/placement/activation/disposal max2.20175ms. Runs
in Node with small authored geometry, no Room/storage/network/actual browser.
Do not use this as provider billing or full-world throughput evidence.

After the final cost sample, adapter release cleanup was hardened with nested
finally blocks so detach/dispose still run if suspension fails. That adapter
release path is not exercised by the cost sample; recorded source hashes remain
those actually measured. The focused reclaim tests and build were rerun.


Local v45 leaves packed storage and browser wire sizes unchanged. The page adapter
now passes a copied final acknowledged view to scene attachment, so equipment/mode
come from final application rather than preflight. No health/ammo/fuel/rig/animation
continuation was added. This copy follows the coordinator's JSON contract. The new
control attachment remains uninstalled; no full-world or production cost claim.


Local v48 adds read-only live physical sampling with the same ten-slot schema,
without clearing held input, and source-validated conversion back to packed
records. Sixty walking/jumping samples had a maximum wire component252B and final
packed component205B. No health/ammo/fuel/rig/animation state was added. These are
component sizes, not full session/ingress envelopes or a worst-case1KiB proof.
Network ingestion and atomic session/body update are still disabled/unintegrated.


Local v49 adds separate atomic replay metadata for live movement, without changing
the recovery body tuple, session reservation, component ceiling or root schema.
The receipt stores only v/account/body/generation/sequence/digest/server acceptance
time. Current representative movement message162B, receipt155B. Maximum schema
receipt268B (cap288B),32-account index545B (cap576B): total receipt reservation
9792B excluding keys/provider overhead, maximum actual JSON9121B. No receipt
contains the physical body a second time. Accepted changes write root/body/receipt
atomically; initial membership additionally writes the index; bounded turnover can
delete up to32 old keys. Duplicate delivery has no writes or presence refresh.
These costs are additional to the existing session/body store. No provider billing
or movement throughput claim; no route/timer enables the boundary. Combined full
world/Room/client load, account-deletion cleanup and lifecycle integration remain
unverified. The strict delivery gate still fails and activation remains disabled.


Local v50 adds one Room-side pending-or-last-accepted movement row per handoff
account (maximum32,5KiB/row; no additional unbounded index). Representative actual
Clanker wire plus Room metadata317B. Maximum reservation160KiB excludes keys and
provider overhead; it is additional to host replay receipts and existing Room
handoff transfers. First admission writes the v3 handoff marker and inbox atomically;
later new samples replace that one row, completion writes its receipt, identical
retries do not write, and resolved close deletes inbox with handoff cleanup. This
is not a measured write-rate/billing result. No outgoing loop or route enables it.
Host receipt shape/caps stay fixed; its digest now binds original Room observation
time, so retained old-digest local receipts require explicit reconciliation/drain.
Resources/rig/animation continuation remain excluded. Mixed-load performance,
provider costs and full-world bounds still need validation before activation.


## Frozen v54 inline movement receipts

The inactive adapter now writes envelope version 2 at the existing fixed keys.
Version 1 roots/rows are refused; no mixed writer or implicit migration may lose
replay state. Existing preview worlds need explicit drain/migration before use.

The body row additionally stores nullable `movement`: version, account ID, body
ID, generation, sequence, SHA-256 digest and original server observation time.
These bind the last accepted sample to its exact body generation. No gameplay,
resource, pose or animation data is added. Maximum receipt JSON is 268 bytes.
A maximum 8,192-byte component plus all maximum identity/metadata fields and the
receipt occupies 8,875 bytes, leaving 341 of the unchanged 9,216-byte row cap.
The component remains bounded to 128 nodes; 19 additional envelope/receipt nodes
fit the existing 24-node allowance. Storage keys/provider overhead are excluded.

Movement now writes two host keys atomically instead of three, with no separate
receipt index initialization. Row compaction carries its receipt by identity;
new generations clear it. Duplicate/restart recovery makes zero writes. Tests
cover both partial-write failures, swallowed callback failures, corrupt receipts,
missing atomic saves, compaction, replacement and actual source-controller motion.
The separate legacy journal remains available for explicit old-layout tooling;
it is not used by this v2 adapter and does not constitute a migration.
