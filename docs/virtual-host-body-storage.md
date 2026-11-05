# Body checkpoint capacity audit (#377 / draft #467)

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
