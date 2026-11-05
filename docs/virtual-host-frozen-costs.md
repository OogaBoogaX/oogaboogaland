# Frozen-body measurements and remaining cost gates

Measured 2026-11-05. All activation remains disabled. These are finite local
workerd/SQLite trials, not production telemetry or a permission to start a loop.
The cached runtime is Miniflare `5.20261001.0-alpha`, which differs from the
repository's declared Wrangler. External egress was blocked; all trials recorded
zero attempted external requests and zero runtime error logs.

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
