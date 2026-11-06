# Visibility allocation and optional-work results

## Cleared covered-wall investigation

After explicit maintainer clearance, source `30b1244037fbdef424462c88fa920eafd7fcae9a` received one CPU diagnostic and one unprofiled suite acceptance run. Runtime code, workload, quality requirements and all thresholds are unchanged. Build and inspected visibility-module syntax pass. The machine was on AC at full charge with Low Power Mode off. Personal Chrome remained open and active, as requested; immediately before acceptance its 15 processes summed to 34.8% sampled CPU. No other test browser was observed. This is not isolated-machine evidence or a measured before/after improvement.

| Run | Ordinary movement | Covered movement | Result |
|---|---|---|---|
| CPU diagnostic, portable page, Chrome 157.0.8103.39 | 60.00 FPS, medium quality | 59.20 FPS, high quality; p95 16.8 ms, max 33.4 ms, worst gap 39.0 ms | Covered row passed; ordinary row failed the unchanged high-quality requirement |
| Unprofiled suite, source page | Passed; quiet runner did not retain successful numeric details | 59.60 FPS, high quality; p95 16.8 ms, max 50.0 ms, worst gap 54.9 ms | **2/3 checks passed**; covered row failed strict max-frame and worst-gap limits below 50 ms |

The clean covered row retained outlines on all 299 samples, delivered the donation and travelled 3.49 m. Its worst sample reported 34.1 ms update, 2.6 ms rendering and 17.2 ms overlay. The diagnostic's largest non-idle sampled functions were character-visibility tree construction and partitioning: 1,226 self samples combined, including 390 under idle warming and substantial synchronous `meshOf` → `nearest` → `exposed` → `anchor` → overlay paths. That identifies first-use visibility construction as a lead, but does not establish the cause of the separate clean run's worst update spike. Historical Chrome 156 results and these differently instrumented/delivered runs are not a paired comparison.

No safe targeted covered-wall runtime fix was established, so none was manufactured. No further performance attempt followed the failed newly cleared run. This isolated checkout had no initial ledger; the new covered failure is preserved at streak 1, alongside the historical stopped evidence below. No ledger was reset, and Factory or unrelated stopped workloads did not run. The smallest next investigation needs a quiet measurement window and renewed clearance to capture the intermittent update/overlay spike with time-correlated profiling before proposing a fix. Keep draft; low-tier CPU, first-use/soak/device, multiplayer and broader suite acceptance remain open.

[Raw diagnostic, exact hashes, clean failure and ledger](visibility-covered-followup.json). Raw CPU stacks remain in ignored local artifacts because they contain local source paths.

## Prior readiness review

Source at `0a46edba88394ff98edd6570dd049656b36d49dc` builds successfully and all nine changed JavaScript files pass syntax checks. This follow-up does not rerun browser, allocation or performance workloads. The stopped covered-wall acceptance remains stopped; the low-tier CPU result and device, soak, first-use and multiplayer gates below remain unresolved. The branch remains draft.

The companion loading PR subsequently recorded passing camera/framing checks at `a7554abc7f5c3f70a1d2541208bc050c52eb7a36`. That evidence belongs to [PR #478](https://github.com/OogaBoogaX/oogaboogaland/pull/478), not this branch or an integrated full-suite run. Factory acceptance remains unresolved. Earlier results below are retained as historical observations.

## Measured change

Object visibility now uses fixed-arity norms for bounded world coordinates, stops repeating an owner's range test once relevance is established, and rejects obvious out-of-range pieces before the exact norm. Off-canvas sleep marks expire normally but avoid exact room/terrain sight queries. Transform traversal uses an indexed child loop. Optional visibility-mesh warming targets a two-millisecond callback budget and resumes larger trees at their existing checkpoints; exact on-demand queries remain available.

The measured improvement is **20.0% lower median sampled allocation** during the ordinary walk. This does not reach the original 50% allocation goal or establish a 25% p95 CPU improvement. The covered-wall FPS gate remains unresolved. Remaining original-plan scope includes bounded spatial queries, dirty-transform reuse and broader relevance scheduling with gameplay/multiplayer equivalence.

## Reproduction

Baseline upstream `rock`: `e6d69aa4d9d93f1c90bf0a28c8899189d3f160a0`; candidate runtime: `f658458c`. [Per-run measurements, allocation sites, manifests, GPU counters and GC durations](visibility-work.json).

Native ARM Node 24.22.1, Chrome 156, ANGLE Metal / Apple M1 Pro, macOS 27.2, AC power at 100%. One browser at a time. The clean and sampled lanes request a 1920×1080 Chrome window at DPR 1. Those original runs did not record the inner viewport; the separate GC and integrated diagnostics with the same launch settings recorded **1920×993 CSS/canvas pixels**. The harness now records exact dimensions. GPU-counter runs record a **1440×813** main render target from the requested 1440×900 window. These lanes are distinct from the suite's 1920×1080/DPR-2 covered-wall workload.

Each lane uses five alternating A/B/B/A pairs of 60-second walks after a five-second warm-up. The named actor is portlandhodl at (10, 0), with alternating A/D every 420 ms, noon/day 80, 1,000 bananas, feeds and account networking disabled. High quality is requested and stays high in every clean and sampled walk. Surrounding NPC choices are not completely seeded; nearby activity and travelled distance can vary. A GC is requested before each measured window, never during it.

```sh
npm run build:site
CHROME_ARCH=arm64 WALK_SECONDS=60 node scripts/profile-allocations.mjs REPO LABEL
CHROME_ARCH=arm64 WALK_SECONDS=60 node scripts/profile-allocations.mjs REPO LABEL --sample
CHROME_ARCH=arm64 WALK_SECONDS=60 TRACE_GC=1 node scripts/profile-allocations.mjs REPO LABEL
CHROME_ARCH=arm64 PROFILE_ROOT=REPO PROFILE_WALK=1 node scripts/profile-rendering.mjs LABEL
```

Use the same harness against both staged checkouts. Sampling, GC tracing and GPU hooks run separately from clean timing. The evidence records historical harness hashes; later additions only record dimensions and enable the separate GC mode. GC collection uses Chrome's [Tracing protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json), checks for data loss and caps collected events.

## Ordinary walking

Median [minimum–maximum] across five runs, except the explicitly labelled single diagnostics. Allocation sampling uses a 16,384-byte interval and includes objects collected during the window. Values are estimates, not an exact allocation census.

| Metric | Before | After | Result |
|---|---:|---:|---|
| Sampled allocation, MiB/s | 18.903 [18.788–19.024] | 15.131 [15.079–15.300] | −20.0%; 50% goal unmet |
| Sampled bytes / displayed frame | 330,342 [328,328–332,460] | 264,426 [263,510–267,373] | −20.0%; 50 KB/frame stretch goal unmet |
| Clean displayed FPS | 60.002 | 60.002 | All ten runs at the display limit |
| Clean p95 frame interval, ms | 16.7 [16.7–16.8] | 16.8 [16.7–16.8] | Sub-millisecond quantization; no meaningful gain |
| Clean p99 frame interval, ms | 16.8 | 16.8 | Unchanged |
| Clean frames >33 / >50 / >100 ms | 0 / 0 / 0 | 0 / 0 / 0 | Five 60-second windows per build |
| Exact maximum frame interval | Not retained | Not retained | All intervals ≤33 ms; do not substitute p99 for max |
| Heap-drop reclamation proxy, MiB/s | 15.015 [14.833–15.132] | 12.314 [12.238–12.441] | −18.0%; not allocated bytes or GC pause time |
| Clean used heap at first measured frame, bytes | 383,068,516 | 382,673,025 | A warmed point after prior GC, not total process memory |
| Clean used heap at final measured frame, bytes | 393,158,912 | 392,794,657 | No substantial residency reduction demonstrated |
| Combined three-change build, one 60-second clean diagnostic | — | 60.002 FPS; p95 16.7 / p99 16.8 ms; 0 >33 ms; high→high | Combined runtime before the final layout-only refinement |
| p95 simulation/query/transform/overlay CPU | Not measured separately | Not measured separately | No 25% CPU claim |
| Largest optional build slice | Not measured | Not measured | 2 ms is a checkpoint budget, not a hard duration guarantee |

## Garbage collection diagnostic

One additional 60-second trace per build. Count only complete `MinorGC`/`MajorGC` events on `CrRendererMain`; nested V8 phases and background-thread work are not added again. No trace data loss was reported. These diagnostic windows do not replace the five clean frame-timing runs.

| Metric | Before | After | Observation |
|---|---:|---:|---|
| Minor GC count | 645 | 540 | −16.3% |
| Minor GC total wall duration, ms | 208.156 | 176.739 | −15.1% |
| Minor GC p95 duration, ms | 0.386 | 0.396 | +0.010 ms |
| Minor GC maximum duration, ms | 0.839 | 0.604 | −0.235 ms |
| Major GC count / duration | 0 / 0 | 0 / 0 | None observed in these windows; not a long-session guarantee |

## GPU submission diagnostic

One separate five-second walk per tier, 301 frames each. Numbers below are averages per displayed frame. Main/shadow/reflection passes are separated by their observed framebuffer dimensions; all raw pass totals are retained. Dynamic actor and shadow activity varies. These small differences are observations, not evidence of a GPU optimization or strict visual equivalence.

| Tier / metric | Before | After |
|---|---:|---:|
| High: main / shadow / reflection draw calls | 341.29 / 156.40 / 134.62 | 340.46 / 157.47 / 135.52 |
| High: main / shadow / reflection triangles | 754,221 / 280,821 / 637,560 | 753,523 / 289,507 / 635,554 |
| Medium: main / shadow / reflection draw calls | 339.15 / 155.48 / 27.65 | 339.07 / 154.48 / 27.49 |
| Medium: main / shadow / reflection triangles | 750,942 / 292,008 / 198,020 | 750,911 / 289,549 / 196,733 |
| Low: main / shadow / reflection draw calls | 341.18 / 151.72 / 13.91 | 341.53 / 151.72 / 13.92 |
| Low: main / shadow / reflection triangles | 748,017 / 208,808 / 99,655 | 748,510 / 208,722 / 99,656 |
| High / medium / low uploaded bytes per frame | 156,816 / 155,176 / 157,174 | 157,719 / 155,230 / 154,489 |
| High / medium / low render CPU mean, ms/frame | 2.715 / 2.915 / 2.450 | 2.709 / 2.915 / 2.587 |
| High instance-stream GPU capacity, bytes | 1,159,200 | 1,188,000 |
| High retained renderer records at sample end | 805 | 806 |
| GPU elapsed time / driver memory | Not measured | Not measured |

Low-tier CPU submission was 5.6% higher in this single instrumented sample; it is not presented as a win or dismissed as proven noise. Repeated tier-specific CPU acceptance remains open. CPU submission time is not GPU execution time, and stream capacity is not total GPU residency.

## Covered movement and remaining acceptance

| Metric / gate | Before | After / status |
|---|---|---|
| Existing covered-wall donation floor, 55 FPS | Untouched upstream CPU-instrumented diagnostic: 46.45 FPS, p95 33.3 ms, low tier | Earlier candidate diagnostic: 46.45 FPS, p95 33.4 ms, low tier; failed |
| Covered donation/outline witness | Donation true, 233 outlined frames | Donation true, 233 outlined frames in that diagnostic |
| Final candidate covered-wall acceptance | — | Not rerun after STOP; unresolved |
| Ten-trip residency / 15-minute soak / peak process memory | Not measured here | Not measured; no 20% memory claim |
| Cold/warm startup and transition timing for this branch | Not measured | Not measured; see companion loading PR for its distinct measurements |
| Real phones, energy, live host/follower/voice parity | Not measured | Not measured; no battery-life or multiplayer-performance claim |

The earlier covered candidate also contained a temporary doorway-reuse experiment that was removed, so it is explicitly **not** a final-candidate acceptance result. CPU profiling was enabled in both covered diagnostics. The companion Map branch's unprofiled full run also failed the covered floor at 46.89 FPS; that is a different candidate, not a clean paired baseline for this branch. Thresholds remain unchanged.

Build and touched syntax pass; global geometry/visibility rules pass (422/422), focused distant-effects checks pass (431/431 including global checks), and the combined loading/Map/distant-effects run passes **487/487**. The full series remains **not full-suite green**: the Map full run was 2,070/2,106, and the startup branch still reports legacy Cloud Hopper camera/framing and exact Factory target-count failures. Related weapon-pose/hammock work in PRs #476–477 and the original dirty checkout are preserved.

Draft pending these acceptance gates and maintainer play-testing. The callback budget cannot prevent an indivisible small build or checkpoint from overrunning its estimate. More aggressive scheduling needs immediate-after-startup and first-use latency evidence before it can be accepted.
