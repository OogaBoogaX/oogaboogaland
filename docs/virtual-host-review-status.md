# Virtual host: current review status

The current truth for reviewers. It supersedes the chronology in the other
`virtual-host-*` notes where they differ. Not review-ready and not activated.
PR #30 metadata and base edits are held separately for approval and are not
changed here.

## Producer (BananaPayServer)

- Producer #30 `b784ec8127318ad7be983007531ed0f98dd64b3c` integrates signed
  #31 `391d67968adb2a863d55c10c12416ff6ce053d23`.
- Combined 47/47 Node checks pass; CI 124 (run 42283858121) passes on Node 22
  and 24.
- A local workerd RPC test, on an earlier producer checkpoint, passed a fresh
  unknown pile through the named `PageApi` -> `Donations` -> SQLite path.
- Unverified: an anchored pile in the runtime, staging bindings, billing.
- #31 bounds returned rows (`LIMIT 1`) and retained memory (streaming
  `reviewCredit`), but rows read and CPU are still O(history).

## Host (this repository)

- Published `619adb863114adcab7b7e5ce8063740766dc4cc3` (v151 to v154, the
  base merge and the hammock fixture repair). CI 893 (run 42287343520): Unit,
  replay and all 284 Host/recovery checks pass; terrain fails 10/11 at the
  host-foliage parity check (`hub-solid-scratch.test.mjs`), which compared the
  browser build's compact storage with the host's plain arrays.
- Local, pending, not published: the acquisition primitive below, and that
  check's repair. It now compares every vertex, face (read through the compact
  API) and other field exactly, regardless of storage, with a negative control.
  Run locally it finds no geometry or metadata difference.

### Private pile consumer (v2)

- Exact v2 aggregate only. A v1 snapshot is refused (`legacy`), never decayed
  or migrated. An unknown level stays null, never 0.
- Health and uncertainty may change at one revision; accounting may not.
  Lower revisions are ignored; a higher one may lower the level (reversal).
- No decay: `at` is accounting time, never read freshness.
- Queued is not applied: an accepted input waits in the host's queue until a
  simulation tick drains it. Diagnostics say queued, never applied or current.
- An unknown, invalid or unreachable read halts the finite run (durable fault).

### Startup and recovery gate (v153, v154)

- `verifyStartup` reads once, through the existing latch and 4 s timeout, and
  passes only a known v2 pile no older than, and not conflicting with, the
  latest accepted or queued pile, that renders the same level as the state the
  first frame shows. Otherwise it refuses with a fixed code.
- v153 gates `startRun` (before the startup record, `begin`, Room and first
  frame) and `recoverRun` (before Room takeover, `ticket` and reclaim).
- v154 also gates every newly opened runner in the receiver opener: attach,
  cold alarm, cold Room hint and tick reopen, after the runner's own ownership
  checks and before any body dispatch, reclaim, tick or publication. A refusal
  closes the runner unreturned and is a durable fault, so no timer or later
  wake reaches the refused opener. No source proof is cached.
- Extra bounded reads: `startRun` and `recoverRun` read twice (gate, then the
  attach opener); each cold open reads once. A transient failure at a cold
  open is now a durable fault needing operator recovery, not a receiver retry.

### Room acquisition without publication (local)

- `acquireHostRoom` (`host-room.js`) acquires Room authority and binds the
  host with every check `publishHostPoses` makes: occupancy and format, CAS
  and lost-reply reconciliation, host binding, and the fenced host
  confirmation. It sends no frame: Room keeps `frame: null`, `sequence: 0`,
  followers stay frozen, and the durable rate gate is untouched. A retry after
  a lost reply re-verifies and writes nothing. Only an explicit, fresh,
  unpaced acquisition may skip the frame.
- Nothing calls it yet. `startRun` still acquires through the first publish,
  and the startup gate is unchanged.

### Not resolved

- A changed level is still refused, not reconciled. Remaining wiring, not done:
  1. `startRun`: `acquireHostRoom` in place of `publishHostPoses({ acquire })`.
  2. Queue the fresh v2 input (`worldInput`) and let the attached runner
     drain it with real ticks against Room's authenticated census.
  3. The runner refuses ticks until body events reconcile (`bodyDue`), and
     body reconciliation would place against the stale level. It needs a
     tick-before-bodies startup mode, or source application ahead of body
     work, without an empty census or invented time.
  4. The gate in `verifyStartup` and in the opener then compares the drained
     state, not the retained one, before bodies and the first publish.
  5. `hub-world-state` refuses a pile whose `at` is after the world clock.
     A world that was stopped while donations arrived lags real time, so the
     input can drain only after catch-up ticks pass `at`. Draining is bounded
     by the maximum lag (`maxLagMs`), beyond which a run needs explicit
     outage recovery.
- The first configuration is immutable, so once the live pile differs from it,
  first boot is refused.
- Strict 4 Hz: no new success. The delivery gate, total cost, memory fit and
  live browser integration are unresolved.

## Checks

| Pass | Result |
|---|---|
| v152 focused Node checks | 29/29, build passed (before v153) |
| v153 pile-source tests | 20/20 |
| v154 pile-source tests | 21/21 (20 kept, plus the cold alarm/hint regression) |
| Acquisition primitive (local) | host-room-takeover 29/29 (27 kept, 2 new); pile-source 21/21; host-world-receiver 6/6 |
| Foliage parity repair (local) | hub-solid-scratch 3/3; terrain lane not yet rerun in CI |

Each pass ran only `node --check` on touched files and the files listed.

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
