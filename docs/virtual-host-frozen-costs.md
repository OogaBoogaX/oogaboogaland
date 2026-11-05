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
Live/starting references still block retirement. The exact-body no-live-send
rollback now works after run expiry, preserving the original deadline and finite
run/lease. Automatic orchestration must still call it before drain; host
reacquisition when only pending departures remain is unfinished. The runner must
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
