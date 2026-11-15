# Shared DSB rescue: staged integration for #384

**Status: staged integration, not end-to-end completion or activation.** This change
is stacked on #467 (`codex/377-virtual-host`, base
`fffe3afedb57c56c88e6b5bca3073744b45df8b0`). It does not close #384. No
production binding, alarm, socket message or provider resource is enabled. The
real browser renderer, acknowledged command client, authenticated HTTP adapter
and public cache are implemented, but the production index/bindings and scene
entry do not install them. The existing local rescue continues until an integration
installs the receiver and explicitly switches authority.
Do not deploy or merge this independently of its prerequisite.

## What is implemented

- `worker/src/rescue-world.js`: deterministic 300-slot logical stray population,
  seeded decisions, basic roaming/sniff/sit/sleep/poop activity, adoption with
  home/birth-generation identity, 45-second replacement with a **new** identity,
  and the existing **512-pile, oldest-first ring**. There is no pile lifetime.
- `worker/src/host-rescue.js`: a sidecar in the **same storage transaction and
  ownership fence** as `VirtualHost`. It requires a ready authenticated Room
  census and its exact observed host revision. A stale census, old host,
  expired finite run or non-current/non-DSB session cannot mutate it. It neither
  renews the host lease nor begins a run. Commands have per-session sequence
  receipts; a changed retry is refused, and exact retries return the same result
  without another action/write. The pile ID, not its current array index, is the
  scoop target, so a concurrent replacement cannot be scooped by a stale tap.
- `src/js/rescue-shared.js`: a separate, strictly allowlisted public component
  frame and complete-snapshot receiver. It rejects old epochs/revisions, changed
  duplicate frames, malformed rows and owner/session fields before replacing
  state. Missing piles/dogs are removals; no delta history or tombstone archive
  is required. Quality chooses 300/150/60 render candidates without changing
  the 300-record shared state. The actual renderer retains its existing bounded
  per-tier draw and shadow caps.
- `rescueDsb.attach().acceptShared(frame)` installs accepted public rows in the
  actual batched dog/pile renderer. All 300 logical identities survive quality
  changes, while local stray AI, respawn, public pile creation and local scooping
  stop. Small corrections blend only across a clear, nearby segment on the same
  floor; new identities, larger gaps or blocked segments snap with the existing
  grow-in animation. Complete snapshots remove absent dogs/piles, and stale
  frames cannot restore them. Stable home/generation and pile IDs are exposed
  for the future command layer from the displayed pick, not its current pool
  index, so snapshots between drawing and clicking cannot retarget replacements.
  Unacknowledged local adoption is blocked.
  Disposing a visit removes nodes/pickers and rejects late frame callbacks.
- Private owner-linked companion roster and latest-only, **non-durable** pose
  relay. It carries identity, name, breed, scene, position and basic activity.
  Disconnect, release, travel, generation and host changes clear the old pose.
  Offers echo the full current world/epoch/body and host/component revisions,
  preventing delayed pre-travel/pre-takeover poses from reappearing. Poses are
  paced to at most 4 Hz per owner and expire from presentation after 2 seconds.
  This is a companion presentation expiry, **not a poop lifetime**.
- `rescueDsb.retireLegacyPoop(store, receiver)`: explicit one-way migration only
  after a valid shared frame is accepted. It removes the rescue save's `poops`
  and `scooped`, preserving validated adoption data. A separate rescue-only
  marker survives an old tab rewriting the legacy save. New loads/saves ignore
  those old fields thereafter. No unrelated key or preference is cleared.
  A false return reports failure to persist the marker; the current visit is
  still marked shared and must not use local piles. A scene integration must
  handle that failure before promising migration survives a reload. The scene
  seam attempts migration once per visit and returns `{accepted, persisted}`;
  repeated snapshots do not cause repeated local-storage writes. The migration
  marker suppresses local strays/piles on a later visit pending a fresh frame.

- `worker/src/room-rescue.js` / `Room.rescueObservation`: an atomic Room-side
  observation of current connection, committed body handoff and census. Pending
  movement, close, handoff or quiescence refuses new rescue actions. The host
  revision read before the observation is checked in the sidecar transaction.
- `worker/src/rescue-delivery.js` / `rescue-http.js`: an explicit host/Room
  coordinator and same-origin HTTP adapter. Private reads/commands require the
  normal verified contributor session and current Room connection. Client owner
  headers/session references are ignored. Requests are size-bounded and require an explicit
  feature-specific admission limiter at installation. The existing Room
  reconnect limiter (20/minute) is not reused for pose/poll traffic. Private responses are `no-store`; the public
  path can read only the separately validated public cache and never calls the
  host or starts simulation. Cache writes use transaction-serialized revision
  checks, reject owner/companion fields, and default to a 24-hour maximum age.
- `rescue-client.js` / `rescueDsb.connectShared({world})`: explicitly installed
  public/private polling and acknowledged adoption, release and scoop controls.
  One pending command retains its exact sequence/payload across uncertain replies,
  reconciles a committed receipt on refresh, and retries with exponential delay
  capped at 30 seconds. Scene/account/generation changes and disposal fence late
  callbacks. Neither adoption nor scooping falls back to legacy mutation while
  the first shared frame is loading. Actual `dsb-*` scene zones are accepted.
- Private companion frames now use the existing body/leg/tail renderer, with
  64 reserved slots, batched tags/flight equipment, own-account deduplication,
  generation/revision/sequence fences and two-second presentation expiry. They
  create no pick targets, local AI, saved private rows or public cache fields.
  The own dog's pose still comes from the existing walking/crew flight solver.
- `worker/src/rescue-routes.js`: 300 server-owned routes baked from actual DSB
  geography, exterior solids, home seeding and ground/walking queries. There are
  295 moving routes and 2,265 nodes. Every loop, including its closing segment,
  has floor/chord checks; moving loops also pass the full-body solid sweep.
  Three inherited lower-body overlap homes (25, 95, 147) remain stationary and
  are **not** certified full-body clear. See [route evidence](rescue-routes.md).

Existing `remote-players.js` already renders contributor-authored character pets
through `crew.createPets()`. That is **not** the adopted rescue-dog system. This
change does not add a second visual copy of those pets. The new private companion
renderer is separate from those pets and uses the same adopted-dog batches. Live
visibility still requires installing the authenticated delivery path.

## Authority and recovery

The sidecar key is `dsb-rescue-v1`; the host's existing checkpoint schema and
128-Ooga/Clanker public limit are unchanged. The sidecar stores an exact route
layout alongside its version and rejects a changed layout/world rather than
silently resetting identities. Coordinates are integer centimetres, within the
existing rescue save's 200 m boundary. The caller supplies **300 server-owned,
terrain-cleared routes**, each with 1–8 nodes within 3.5 m of its home. Consecutive
segments, including last→first, must already be valid on DSB terrain. No route,
spawn point or authoritative pile position is accepted from a browser.

The core has no pathfinder. Its deterministic model tests still use synthetic
routes, while the separate route tests reconstruct real DSB exterior geometry
and compare the committed route table and source fingerprint. The inherited
three-home collision limitation remains an activation gate. Night activity rests at a route node; exact existing sleep-at-home and
passing-player tagging behavior is not claimed equivalent yet.

Occupied DSB advances at 1 Hz; each invocation performs at most eight steps.
The last logged-in DSB participant leaving freezes the logical clock, RNG and
poop timers. An arrival restores that state without offline replay or a burst of
overdue poop. An unknown gap over eight seconds also freezes across the gap.
Repeated empty ticks write nothing; an arriving guest alone does not keep a host
running. This deliberately assesses/restores the empty-land case rather than
continuously simulating every stray with no live DSB participants.

Adoption records and receipts follow the authenticated host account/session.
They survive disconnect grace and transfer to the account's newer generation;
expired session records remove the live companion track. The original stray
identity never returns: any replacement advances the home's generation.
**Durable cross-session adoption restoration and migration of existing local
adoptions still need wiring.** The existing browser adoption save is preserved;
this core does not claim that browser/server adoption handoff is complete.

## Integration contract and gates

1. Finish #467's authenticated Room routing/census/scene binding. A caller must
   first read the host revision, then obtain a ready Room census with no
   uncertain/pending lifecycle events, and pass `{ready, revision, tokens}`.
   `HostRescue` refuses a revision change inside its transaction. Derive session
   references from the authenticated socket, never an account ID supplied by a
   client. Reserve command receipts before acknowledging adoption to the UI.
2. Install the real `RESCUE_ROUTES` configuration and bind its exact layout to
   the checkpoint. The sidecar already refuses changed layouts. Regenerate and
   review route/source revisions after geometry changes; never silently reset
   identities. Resolve the inherited clearance limitation before activation.
   Schedule `tick` only from occupied host work/lifecycle changes, not guest reads.
3. Install the HTTP handler on the existing trusted host router and call the
   scene's `connectShared` with its expected world and supply a reviewed admission
   budget to the handler. **Neither is installed by
   this PR.** Commands and UI acknowledgement are implemented, including initial
   loading and uncertain-reply handling, but they do not bypass #467's disabled
   live host/body routing. The new shared own-dog record is visit-local and restored
   from authenticated state; it never overwrites legacy adoption saves.
4. Complete authoritative companion care and durable cross-session adoption
   restoration/migration. Shared own-dog feeding, hunger/starvation, local poop
   and local release are deliberately blocked; only acknowledged release applies.
   This is a missing feature, not equivalent existing care. Local legacy dogs
   retain their old care until the shared integration replaces their presentation.
   Pose refs still require promptly refreshed full-host revisions; continuity and
   cost under concurrent host activity need validation.
5. Install the public cache adapter in #378's trusted cache/router. Only
   `snapshot().frame` can enter it. The handler and monotonic cache are tested,
   but no production cache binding or route exists. A cache write failure does
   not replay a committed command; the next explicit host tick repairs delivery.
   Expired/unavailable caches return unavailable without starting a paid run.
6. Complete two-player adoption/scoop/travel/reconnect checks; real DSB terrain,
   browser animation/quality/cleanup, physical-phone and combined NPC/dog/ghost,
   projectile and voice checks. Agree performance/cost budgets before activation.

## Bounds and measured source workload

Ceilings: 300 logical strays; 512 piles; 64 retained owner receipts (the host's
existing maximum session count); 1 Hz simulation; 4 accepted command attempts/s
per owner; a 64 KiB public frame; 96 KiB state and 64 KiB route configuration,
with a 192 KiB sidecar-envelope guard. Exhaustion is refused, not truncated.
No per-frame durable write, unbounded event queue or pile archive is introduced.
The new guest cache adds up to one logical public-frame put per changed
publication. Private polling is at most once per two seconds and owner poses at
most 4 Hz while active; each currently performs fenced host/Room reads. Those
RPC/cache costs and the larger 224-instance draw ceiling are additional and
**not included** in the earlier core-only source measurement below.

Reproduce the bounded measurement and correctness checks:

```
node scripts/characters.mjs --json > worker/src/characters.gen.json
node --test worker/test/rescue-world.test.mjs worker/test/rescue-renderer.test.mjs worker/test/rescue-delivery.test.mjs worker/test/rescue-routes.test.mjs worker/test/virtual-host.test.mjs worker/test/host-sessions.test.mjs
npm run build
```

On the source revision of this PR, the Node fixture compared 30 logical seconds
with 32 live sessions under the same minimal `VirtualHost` adapter, then the same
adapter plus rescue, with 300 strays, 512 piles and 32 companions. These are two
serial in-process trials with cloned in-memory rollback storage, not 30 seconds
of real browser/network/provider load. It excludes scene geometry and existing
NPC simulation. The test prints raw values, so timing can vary on rerun.

| Measurement | Host-only baseline | Host + rescue |
| --- | ---: | ---: |
| Source trial elapsed time, ms | 22.67 | 147.26 |
| Logical storage puts over 30 ticks | 30 | 60 |
| JSON bytes passed to puts | 434,854 | 1,686,730 |
| Rescue public-frame bytes produced | 0 | 523,916 |
| Largest rescue public frame, bytes | 0 | 17,519 |
| Final rescue checkpoint envelope, bytes | 0 | 42,046 |

The increment is 30 puts and 1,251,876 JSON write bytes over 30 ticks. Read-only
snapshots, duplicate commands and repeated empty ticks add zero puts in the
focused tests. **No network packets were sent.** Sending each frame unchanged to
32 viewers would be 960 component messages and 16,765,312 bytes over that interval
(before framing/compression), about 559 kB/s aggregate. This is fan-out arithmetic,
not measured transport performance or a recommended production cadence. The
single-process timing includes JSON validation and storage cloning; it is not
Cloudflare CPU or a client frame-time/FPS result. It exposes a potentially material
storage/fan-out cost that needs optimization/budget agreement, not a zero-cost claim.

### Provider costs and outstanding measurements

The sidecar shares the existing host object; it does not create a new object or
start an always-on run. While occupied it adds one logical put per simulation
tick, plus accepted command/receipt mutations. At 1 Hz continuously for 30 days,
that is 2,592,000 additional logical puts before commands/retries. Actual billed
rows depend on the selected storage backend and its accounting; JSON bytes and
JavaScript API calls are **not** a provider invoice. At most one write per event
is not the same as one billable row.

The [Cloudflare pricing assumptions in #467](virtual-host-frozen-costs.md) were
last checked there on 2026-11-05: paid SQLite includes 50 million written rows per
month, then $1/million; active duration is metered at the object's memory rate,
with 400,000 GB-s/month included and $12.50/million GB-s thereafter. All allowances
are shared with other account usage. Recheck the
[official pricing and billing granularity](https://developers.cloudflare.com/durable-objects/platform/pricing/)
before selecting a cadence. Requests/RPCs, row reads, stored bytes, base-plan cost,
retry behavior, snapshot-cache storage/delivery and duration remain additional
or unresolved. This patch provisions none of them.

Actual client frame time/FPS, render/effect workload, mobile animation cost,
network framing/fan-out, provider duration/requests/storage usage, real-phone
results and the combined companion-feature run are **not measured and remain
acceptance gates**. Browser emulation is not substituted for a physical phone.
No Factory, browser, full-suite, performance-floor or local visibility/storage
suite was run. The source-only rescue migration checks use a fake map, not a live
browser or existing user storage. Renderer/scene tests load real math, scene,
models, rescue code and controller in a VM. HTTP/client tests use actual HostRescue,
VirtualHost and validated Room handoff records with rollback-capable in-memory
stores. They exercise acknowledged UI, lost replies, exact retries, disposal,
private/public boundaries, actual scene-zone names and retained generations.
The route tests construct real terrain but do not exercise a browser or GPU.
The final aggregate passes 87/87 after the source bake, including two
real-terrain checks. The subsequent explicit-admission guard passes all 14
HTTP/client checks, adding one regression for 88 distinct focused checks. Syntax, build and whitespace checks pass. Exact-head CI is
reported in the PR. None is a complete #384 pass.
