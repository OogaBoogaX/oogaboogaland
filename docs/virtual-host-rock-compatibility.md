# Rock compatibility bridge for #467

This is an inactive compatibility draft, not approval to activate or deploy the
virtual host. It combines contributor head
`fffe3afedb57c56c88e6b5bca3073744b45df8b0` with rock
`04524e75737f9344ee2e61395a54a0b7ceb6557f`, preserving both histories. No
contributor branch is changed. #579 remains on its original contributor base.

The supporting pull request targets upstream `codex/377-virtual-host` from a
fork branch. It is intended for review and integration into #467, not a
competing virtual-host implementation or a replacement PR to rock. Neither
#467's draft status nor its activation gates change.

## Recovery compatibility

The complete Hub recovery envelope is now version 8. Version 7 and earlier are
rejected before geometry or controller construction. Current rock changes the
terrain/dressing recipe, fixed paths, passive collision policy, work reservation
order and routed chill walks. Those records must not be replayed under the new
rules just because a caller supplied the same world label.

Any eventual activation requires a new explicit world-version label and an
approved migration or fresh-world decision. There is no automatic migration,
checkpoint deletion, authority takeover or preview activation in this bridge.

- Work and Ooga logical records retain reservation time with an explicit
  Infinity/null encoding and retain bounded route, leg and chill-return intent.
- Hosted Oogas and Clankers use the current shared fixed mainland planner.
  Clanker lanes have a trusted fixed-size buffer profile, separate from legacy
  roaming records. Expanded memory is accounted for without increasing encoded
  checkpoint limits.
- The paired roster limit is 64 Oogas plus 64 Clankers within the existing
  128-NPC authority envelope. Current rock has 55 contributors. Legacy restricted
  roaming/buffer-v1 fixtures retain their 53-actor bounds.
- Browser-host FORMAT3 and negotiated server FORMAT2 remain explicit, separate
  protocol paths with the same Ooga record representation.
- The headless Timechain build omits canvas painting through an explicit option;
  its physical keypad, doors, bridge and collision geometry remain present.

## Validation evidence

Focused checks cover work/walker continuation, combined-world validation caches,
transport ownership/recovery, Clanker fixed buffers, passive terrain/masonry
admission, headless Timechain construction, and the actual 55-contributor Hub's
pile reconciliation, cold recovery and transaction refusal. A first full-Hub run
identified the obsolete 53-actor bound; both affected checks passed after the
coordinated bounded-capacity correction. Some isolated fixture mocks required
current callbacks/protocol-version assertions; no budget or collision checks
were removed.

The browser `hub host hand-back` check initially stopped. Its first run could not
launch sandboxed Chrome. Native Chrome then exposed an inherited
`CAMERA_OPENINGS` initialization-order error. The declaration was moved before
navigation composition and passes syntax checking. The single explicitly
approved rerun no longer reported that ReferenceError, but timed out before the
first frame (`scene: null`, `frames: 0`, `curtain: true`; 48.9 seconds for the
runner's two attempts).

A subsequent static pass found a separate preparation defect: the Cloud Hopper
loader overwrote the authoritative layout wait. The single preparation hook now
waits for the layout before loading that optional cabinet. This does not explain
the stopped offline fixture, which has no server authority. Existing traces
cannot distinguish slow construction from a stalled generator: the director
keeps the scene null until the sliced build and GPU preparation finish. The
readiness failure now includes existing construction marks, construction CPU and
page visibility on its final sample, without changing its deadline, retries or
assertions. One further explicitly authorized run used those diagnostics and
failed before reaching its hand-back assertions. Both fresh Chrome attempts
completed covered-view preparation at 24.1–24.4 seconds, beyond the 20-second
readiness deadline. Visibility warming took about 3.8 seconds and covered-view
preparation about 15.5 seconds. No exception occurred; the tab was visible.
Those observations locate the delay in ordinary Hub construction, not account
lookup or server-layout waiting. At that run, the core visibility modules and
covered-view preparation body matched rock, so a bridge-specific cause was not
established.
That run left the local failure ledger at streak 4. No replacement startup
probe was attempted.

Subsequent permissible work added four isolated Node checks for the actual Hub
preparation hook: layout waiting, the visit signal, ordered cabinet loading and
failure propagation all pass without building a scene. Covered-view preparation
now records separate collection, mesh baking, contours, sight, surfaces, drawing
and reset marks for a future authorized diagnosis; its work is not skipped.

That static review also confirmed an inherited contour defect. Compact geometry
reads reuse a mutable face cursor, but object-guide plane entries retained the
cursor as if it were an independent face. Later seam checks combined each face's
bounds with the last-read face's indices. Plane entries now retain their face
index and re-read the polygon synchronously. An isolated Node regression checks
identical plain/packed outer contours across four face orders, both direct and
49-face spatial-bucket seam paths, and no retained face copies. It passes after
correcting a missing crew-map fixture. The stopped
visibility-storage check was not run.

A further explicitly authorized browser run after the contour fix still failed
before its hand-back assertions. Its two fresh Chrome attempts put mesh baking
at 0.50–0.54 seconds, contour emission at about 14 ms, sight-guide update at
13.74–14.40 seconds, rock-surface preparation at 6–7 ms and cover drawing at
52–58 ms. Covered-view completion remained at 22.95–23.81 seconds, beyond the
unchanged 20-second readiness deadline. These are diagnostic observations, not
a measured performance improvement. The sight-guide update is now the isolated
startup bottleneck. That run left the local failure ledger at streak 5.

The next explicitly authorized run enabled CPU sampling without changing the
readiness deadline, assertions or existing driver retry. It also failed before
hand-back assertions, leaving the preserved ledger at streak 6. Its first
profile attributed 13.58 seconds to sight-guide update, including 13.46 seconds
in concealment and 9.80 seconds in the convex-face coverage certificate. The
certificate was scanned across every face for each target patch. The optional
`CPU_PROFILE=1` runner setting saves both attempt profiles under `untracked/`;
ordinary runs do not start a profiler.

The fallback now traverses the existing mesh BVH along the target's center ray.
Any convex face covering the complete target must intersect that ray, so its
fan triangles remain candidates. Inclusive, conservatively padded slab tests
retain boundary hits; the original exact face, near-plane and clipping
certificate is unchanged. The cached witness still runs first. This adds no
per-query arrays or candidate limits.

Two isolated Node checks compare that candidate traversal with the previous
exhaustive traversal while sharing the unchanged production certificate. All
2,376 queries and their cached repeats agree across packed/plain geometry,
rotation, nonuniform and reflected scale, world/local clipping, near-plane
boundaries, zero-sized boxes and a large translated origin. A dense fixture
uses over five times fewer exact face tests with the same results. Together
with contour and preparation regressions, the latest focused run passes seven
checks. This measures candidate work, not browser startup performance.

The explicitly authorized post-fix browser run then passed both checks in
0.3 minutes, without a driver retry or profiling enabled. It reached readiness
within the unchanged deadline, verified that working Oogas handed back with
out-of-range route indices continue without throwing, and passed the clean
console check. This clears the observed startup and route hand-back regression
for this fixture; it does not exercise live server takeover or authority
transport. No precise post-fix phase timing was collected. The old generic
readiness failure remains in the ledger at streak 6 because successful checks
have more specific names; the ledger was not edited. No other stopped check
was run.

Build and syntax checks pass. No Factory or visibility-storage checks were run.
No complete browser suite, provider-memory fit, delivery/cost headroom or live
activation claim is made. The outstanding integration/operational gates in
`virtual-host-review-status.md` still apply.

## Supporting-PR checks

The first CI run on supporting PR #590 stopped before fixed-route assertions
because the fixture still extracted walker/work declarations from crew
after those functions moved to shared modules. Its source slices now use the
production modules and verify their delimiters. The `fixed-routine-unit`
selector runs the same unchanged check without other lanes. The next CI run
reached a separate movement fixture with the same stale walker extraction and
a missing crew source binding. That fixture now uses the shared walker source
and supplies its browser context. Both unchanged checks pass through the focused
selector. The ordinary unit lane still runs each in its original order. Static
review found no further stale crew/walker/work extraction markers.

A further static review found that crew capture accepted an already-null live
reservation timestamp although the Worker work codec refused it. Crew capture
now requires Infinity or a finite nonnegative timestamp before encoding. The
real-Hub reconciliation file passes three checks, including invalid live values,
Infinity/null encoding and finite timestamp retention. No gameplay path that
produced the invalid null value was established.

The next fixture correction supplies the legacy authority state to the remote
pet mock; all seven unchanged pet checks pass through `pet-unit`. That selector
loads the production modules and leaves the normal unit prelude intact.
CI then passed all 573 unit checks and the site build. The first complete
Worker run passed 748 of 763 checks. Twelve frozen-body fixtures lacked the
real weapon-target module, two contributor fixtures lacked the real cave-slot
data, and one Clanker check expected the older blanket browser collision flag.
The fixtures now load those production dependencies. The Clanker regression
checks both current browser query-based filtering and the host-only root flag,
including shared accessor metadata and refused host possession/remote control.
Focused files pass 12/12, 44/44 and 6/6 respectively. No runtime policy or
assertion threshold changed in these fixture corrections.

The resulting supporting head `7d47c4557c89bdaa363e3462e3252d391908f047`
passed [CI run 42971596097](https://github.com/OogaBoogaX/oogaboogaland/actions/runs/42971596097):
573 unit checks, site build and all 763 Worker checks. This is the baseline for
subsequent integration work, not a provider or live-browser pass.

## Client connection ownership

A source-level live-routing check reproduced a disposed welcome restarting
voice after a synchronous room subscriber closed the connection. Socket identity
now fences message, open, keepalive and close callbacks. Welcome processing
stops after callbacks that dispose or replace the connection; connecting
subscribers can also cancel before socket creation. A retired public-body frame
cannot acknowledge on or close a replacement socket. No protocol or preview
switch changed. The actual Room/net file passes 45 checks, including disposal,
replacement, late callbacks and unchanged normal reconnect behavior; syntax and
the build pass. This is an isolated source fixture, not live browser evidence.

## Current full-Hub rollback

A finite current-source diagnostic found a correctness failure after eight
successful ticks and an injected storage-write failure: reconstruction rejected
a routed Ooga against an incidental prop. The source's fixed waypoint trips
deliberately pass through those props, but recovery had reapplied the stricter
ordinary placement check. The failed write left durable state unchanged.

Crew recovery now passes its own fixed-trip predicate to placement. Only that
exact passive-route case omits incidental-prop clearance; finite bounds, terrain,
NPC land, structural beds, gates, altar and mirror admission remain. Controlled
and non-fixed bodies retain their previous policy. No actor is relocated, no
motion or checkpoint format changes, and no persisted flag grants this policy.

The real-Hub regression advances the current 110-actor world, injects a failed
write, and proves the retry commits exactly the discarded logical step. It also
rejects the stale frame, confirms the new projection and reconstructs through a
fresh adapter without rewriting durable state. Logical recovery still resets
animation as designed; live and freshly reconstructed pose bytes are not claimed
identical. Together with placement-policy and transaction-cache checks, the
focused run passes nine checks.

One coordinated, unprofiled local Node sample measured a 44,578-byte host record,
455.27 ms rollback recovery and 310.09 ms for a fresh adapter's pose read. Eight
warm ticks ranged from 31.47 to 72.07 ms. This uses in-memory transactional storage,
no controlled player bodies or Room/network delivery, and a fresh adapter in the
same process rather than a fresh provider isolate. These are individual timings,
not percentiles. The 250 ms recovery target remains unmet. The old 106-actor
measurements are not a matched baseline for this 110-actor source revision.

## Rescue integration

A read-only application check of #579 at
`86ed05e29d60c660ca5800919e39d607be8c8840` passes for its complete rescue source
and renderer-test delta against this bridge. The patch has not been applied,
its base has not been changed, and this does not supply live rescue transport.

## Operational evidence still needed

The current scene already has a controlled-body adapter, independent Ooga and
Clanker registration, and remote body presentation. These are implemented seams,
not absent features. Their real authenticated flow remains unverified and the
browser reclaim preview stays disabled. The deployed Worker exports only Room
and GameHost; neither deployment configuration binds the virtual-world receiver.
Changing that is a separate activation step, not something a green source suite
does implicitly.

Public-body acknowledgements and census reconciliation also already exist.
Room commits retained presentation before the host acknowledges a departure;
the browser acknowledgement only returns socket delivery credit. The runner
drains body events and checks the host revision around the Room census before
tick/publication. Their representative cross-runtime execution remains a gate.

Before a finite provider trial, the integration needs an explicit world label
for recovery v8, a fresh-world or migration decision, an approved private pile
source, a named test environment and a spending limit. The trial must count
actual host/Room RPC sessions, alarm invocations, storage rows, WebSocket input
and active duration across both objects, including retries and cleanup. A
checkpoint-byte total or outbound frame count is not a bill estimate. Capture
provider resource errors and retained/peak memory with the real roster, player
bodies and Room together; a successful local workerd request does not certify
the provider memory limit.

Source bounds make a trial finite but do not establish affordability:

- The host run limit is 900 seconds, or 3,600 simulation intervals at 250 ms.
  The receiver separately caps scans at 3,600; this is not a cap on all RPCs,
  early notifications, storage operations or recovery work.
- A 32 KiB NPC packet sent every interval to all 32 followers would carry
  3,774,873,600 payload bytes over that period. This is ceiling arithmetic,
  not observed delivery, wire overhead or rescue/body traffic.
- At the provider's allocated-memory rate, one continuously active object for
  900 seconds represents 115.2 GB-s; two represent 230.4 GB-s. Startup and
  cleanup outside that interval and other account usage are additional.

[Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
was checked November 11, 2026. Paid included usage is shared account-wide;
billable overage rounds up to its billing unit. RPC sessions and alarms count
as requests, incoming WebSocket messages use a 20:1 billing ratio, and outgoing
messages have no request charge. SQLite puts/deletes and alarm updates incur
row-write accounting. Duration uses 128 MB per active object regardless of
measured heap. Consequently neither a small finite run nor spare included usage
can be assumed free without the account's current totals.

The strict delivery target and rollback target remain 250 ms. The older saved
delivery trace contains work after the publication pacing gate and misses that
target; source correctness and the offline browser hand-back pass do not replace
a new end-to-end result. No cadence relaxation, enabled preview, deployment,
paid run, migration or checkpoint deletion is included here.
