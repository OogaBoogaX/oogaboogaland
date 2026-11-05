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

The current live-movement path performs five logical key writes per accepted
sample. Assuming one billed row per key write, no retries/extra writes and all
50 million included writes available, 30 continuously active players for a
30-day month would produce:

| Accepted samples/player/sec | Logical writes/month | Illustrative write overage alone |
| ---: | ---: | ---: |
| 1 | 388,800,000 | $339 |
| 4 | 1,555,200,000 | $1,506 |

These scenarios exclude compute, requests, reads, base plan, other services and
other account usage. They are not selected production cadences or forecasts.
Frozen-body savings cannot justify the current per-sample durable write design.

## Integration blockers and reproduction

The inactive Room census now retains all known references while closed or
uncertain outbox work is pending. `reconcileRoomBodies` refuses to infer absence
until that work settles, and compares the host revision read before the Room
RPC to prevent concurrent admission/ACK/movement being marked offline. Focused
tests cover these paths. It does not add an HTTP route, timer or advertised
client feature.

Room's cleanup hooks currently require its live NPC lease and finite run window.
After either expires, host-only lifecycle recovery can proceed under a new host
fence, but Room handoff cleanup cannot. A separate bounded cleanup-authority
design is required; this change deliberately does not renew NPC simulation or
weaken the existing gate. The runner must also serialize/reconcile explicit
close operations before taking its ready census.

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
