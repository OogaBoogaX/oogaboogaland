# Cloud Hopper loading: measured result

The hosted hub leaves Cloud Hopper's controller, HUD, weather, sound and game-only meshes unloaded until its Arcade cabinet is used. Approaching or hovering that cabinet can prefetch its code. Save-Data suppresses speculation while deliberate play still works. A refused download leaves the same Ooga in the Arcade; retry opens the game, and Escape returns through the cabinet. The portable page remains self-contained.

This is a bounded first-play improvement, not completion of regional streaming or lazy character rigs. It does **not** meet the original 40% startup or 30% critical-transfer targets. Geometry and visibility preparation remain dominant. The additional chunk moves bytes to first use; it does not remove them from a complete game visit.

## Current integration: 2026-11-08

This branch incorporates upstream `rock` at `5e5ad247117835ce676a79cd951d390084551de0`, starting from PR head `c389232bc76da04bbb1a78836fffa97e4c32870a`. The merge preserves upstream's removal of the old Whitepaper and Goldbug flows, the current pet-reaction hooks, and Cloud Hopper's deferred loading boundary. The shared ghost look stays available to island NPCs without loading the optional game.

The PR is ready for review, not draft. The draft and pending-intake notes in the dated sections below describe those earlier checkpoints. Factory acceptance is still unresolved and was not rerun. The earlier startup measurements and full-suite totals do not measure this integration; no new performance or device claim is made.

Validation on the integrated source:

- `npm run build` and syntax checks on the touched JavaScript pass.
- `node --test worker/test/cloud-hopper-replays.test.mjs`: **14/14**, including island NPC ghosts without the optional game.
- `CHROME_ARCH=arm64 LANES=1 node test/run.mjs cloud-hopper-record`: **31/31**, covering recording/client and HUD lifecycle fixtures.
- `ONLY='cloud hopper fixed camera,cloud hopper island framing,hub hosted optional game' LANES=1 CHROME_ARCH=arm64 node test/run.mjs --browser-only hub`: **8/8**. This covers the supported camera views, island framing, unloaded first play, refused download, retry and interrupted ascent returning the same Ooga to Arcade.

The explicit `--browser-only` option selects existing scene checks and keeps their assertions, watchdogs and failure ledger. It cannot be combined with `full`, `unit`, `perf` or dedicated checks. Normal global/full commands and CI are unchanged. These are focused results, not a full-suite pass. No Factory, stopped local check, performance run or physical-device test was run. GitHub's automatic checks run separately on the published commit.

## Historical framing investigation: 2026-11-05

The maintainer explicitly authorized resuming the stopped framing and Factory investigations. This follow-up starts from `fc82ebc66c683195d37809ad5be5d26c556b3715`; the previous failures remain in the historical evidence below and archived local ledgers.

**Framing fixture repair:** the camera fixture's `H.exit()` queued the actual Arcade scene transition. The framing fixture then tried to advance its old hub/controller during that departure, leaving its sample in `lifting` with the HUD hidden. Both fixture cleanups now use `H.cancel()` to release the game locally without requesting a scene change. Runtime behavior, all 15 held-key gates, supported shoulder/first-person replay checks and numerical camera/framing limits are unchanged. The hosted regression still tests the real Escape/Arcade exit separately.

The first resumed command (`ONLY='cloud hopper fixed camera,cloud hopper island framing,factory lifecycle' LANES=1 CHROME_ARCH=arm64 node test/run.mjs hub factory`) could not launch Chrome inside the sandbox: **433/435**, with both browser sessions aborting at macOS application registration before assertions. Running with browser access reached **440/441**: all three camera assertions and the full framing assertion passed; Factory failed in the experimental fixture before retention measurements.

Final framing-only validation after reverting the Factory experiment: `ONLY='cloud hopper fixed camera,cloud hopper island framing' LANES=1 CHROME_ARCH=arm64 node test/run.mjs hub`: **439/439**. `npm run build` and `node --check test/run.mjs` also pass.

**Factory remains blocked.** The experiment tried to compare the same pile level after each real +12-banana tip, since the expanding ring intentionally removes scenery targets. It incorrectly called the departed hub's debug setter, which is null under scene release. The active Lab's existing `__ooga.setPileLevel` is the available setter. The runner counted the earlier launch failure and this exception as two session failures and printed STOP (`factory lifecycle`, streak 2, last `2026-11-05T19:57:43.030Z`). The experiment was archived locally and reverted; no Factory fixture or runtime change is included here, and no further Factory test was run after that STOP. The original exact-target failure remains unresolved; the disappearing target's identity has not been proved. Resuming the corrected experiment requires renewed maintainer clearance under the repository rule.

At this checkpoint the PR was draft and Character intake was pending for that reason. Factory acceptance, real devices, live multiplayer/voice, unmet performance targets and maintainer play-testing remained open. The measurements were not repeated.

## Earlier acceptance follow-up — 2026-11-05

This update starts from merged PR head `8e4d32361dcfe464ba93bcdd7955e1b3b6249873`. The measurements below remain historical; this follow-up does not remeasure startup, memory, energy or device performance.

**Repair:** closing the opening card to start a run restored focus to the previous sidebar control. The shared `controls.uiKey` then consumed Escape/movement there. `cloud-hopper-hud.js` now hands focus to the world canvas during lifting/ready/running, retaining ordinary focus restoration when leaving the game and in the standalone HUD fixture.

**Fixture corrections:** the camera checks clicked the hidden Next level button (it precedes Play), queried the old guide container, and expected carry/overhead views that the current game's `combatOnly`/`noOverhead` hooks disallow. They now click the visible Play/Replay button, use the current Skip tips action, and exercise both supported combat views at 30/60 Hz. Replay waits for the Arcade ascent. The 0.001 camera-drift limits, framing limits and key gates are unchanged. The hosted check additionally cancels the first ascent and verifies canvas focus and the same actor on return.

Validation:

- `npm run build`, `node --check test/run.mjs`, and `node --check src/js/cloud-hopper-hud.js`: pass.
- `ONLY='cloud hopper fixed camera,cloud hopper island framing,hub hosted optional game' LANES=1 CHROME_ARCH=arm64 node test/run.mjs hub`: **439/441**. All three camera assertions passed. Framing failed again; the extended hosted assertion found the focus/return failure repaired above.
- After the focus repair, `ONLY='hub hosted optional game' LANES=1 CHROME_ARCH=arm64 node test/run.mjs hub`: **435/435**. Unloaded first play, refused download, retained actor, retry, interrupted ascent and same-actor Arcade return pass.
- The final standalone-HUD fallback was checked with `CHROME_ARCH=arm64 node test/run.mjs cloud-hopper-record`: **31/31**, including narrow viewport emulation and HUD lifecycle. This is not real-device testing. The 435-check run predates that fallback; the game-canvas branch is unchanged.

**STOP gates remain.** The framing assertion reached streak **2**, last `2026-11-05T19:38:09.961Z`, with its sample still in `lifting` and the HUD hidden; it was not fixed or rerun after STOP. The parent checkout's `factory lifecycle` session remains at streak **3** (last `2026-10-12T17:46:42.144Z`); the PR worktree's exact-target assertion is still at streak **1** (last `2026-11-05T07:50:37.000Z`). Factory was not rerun and its assertion was not changed. Source inspection finds a confound to investigate: each simulated Factory tip increases the shared pile; its expanding path intentionally removes scenery targets. The old evidence shows 1,012→1,084 shown bananas with 1,715→1,714 targets, but does not identify the missing target. This is a diagnosis lead, not a proven fix.

The repository's rule is: “When the same check fails a second run in a row, the runner prints `STOP`. Do not try again: report the ledger entry to the maintainer and move on.” Framing/Factory acceptance therefore needs maintainer clearance and investigation. No ledger was reset or moved to evade STOP; no full/performance/DSB rerun was made. At that checkpoint Character intake was pending because the PR was draft (“Draft character submissions wait until ready for review”). Live multiplayer/voice, real devices, the unmet performance targets and maintainer play-testing remain open.

## Reproduction

Baseline: upstream `rock` at `e6d69aa4d9d93f1c90bf0a28c8899189d3f160a0`. Candidate runtime: `b52615ae`. [Individual measurements and hashes](cloud-hopper-startup.json).

Apple M1 Pro, native ARM Node 24.22.1, Chrome 156, ANGLE Metal, macOS 27.2 (26B123), AC power at 100%. Requested Chrome window 1920×1080, DPR 1, 60 Hz, default adaptive quality (medium in every before/after run). Local HTTP with Node zlib's default gzip compression; no network throttling. Noon/day 80, 1,000 bananas, feeds and account networking disabled. Ten alternating A/B/B/A pairs, one browser at a time. Each new browser profile runs cold and then warm on the same origin. No CPU sampler runs during these timings. The original batch did not record inner viewport/render dimensions. A later diagnostic with the same launch settings measured 1920×993 CSS/canvas pixels; the harness now records these fields explicitly. The historical harness hash remains in the evidence JSON.

```sh
npm run build:site
CHROME_ARCH=arm64 RUNS=1 node scripts/profile-first-play.mjs REPO LABEL
```

Run the same candidate harness against both separately staged checkouts, alternating their order. First playable means the curtain is gone and a real W key changes the camera through two displayed frames, using the same predicate on both builds. W is then released; the following ten seconds measure idle frame pacing, **not** a continuous movement workload. The mark `ooga:first-playable` is useful for diagnostics but is not substituted for this input witness.

## Before and after

Median [minimum–maximum] over ten runs per cache state. Lower is better except FPS. These are local experiments, not population percentiles.

| Metric | Before | After | Change / result |
|---|---:|---:|---|
| Main JS, raw bytes | 6,928,027 | 6,546,653 | −381,374 B |
| Main JS, gzip bytes (Node default) | 2,036,048 | 1,922,064 | −113,984 B (−5.60%) |
| Cloud Hopper chunk, raw / gzip bytes | Included above | 382,616 / 114,833 | Deferred to first use |
| Main + game chunk, gzip bytes | 2,036,048 | 2,036,897 | +849 B after loading both |
| Cold observed subresource transfer through ten seconds, bytes | 2,408,859 | 2,294,875 | −4.73%; navigation HTML excluded |
| Cold subresource requests | 10 | 10 | Unchanged at this observation point |
| Warm observed subresource transfer / requests | 8,243 B / 8 | 8,243 B / 8 | Unchanged; navigation HTML excluded |
| Cold navigation → displayed input response, ms | 5,648.95 [5,569.7–5,823.0] | 5,610.20 [5,551.1–5,742.3] | −0.69%; 40% goal unmet |
| Warm navigation → displayed input response, ms | 4,608.30 [4,587.7–4,703.8] | 4,524.80 [4,491.6–4,676.0] | −1.81% |
| Cold longest pre-input task, ms | 187 [182–203] | 189 [182–194] | +2 ms median |
| Cold sum of pre-input task time above 50 ms | 273.5 [254–307] | 281.5 [252–308] | +8 ms median |
| Warm longest pre-input task, ms | 186.5 [179–232] | 185.5 [176–197] | −1 ms median |
| Warm sum of pre-input task time above 50 ms | 451.5 [436–516] | 451.0 [435–480] | Essentially unchanged |
| Observed quality after ten seconds | Medium in all 20 loads | Medium in all 20 loads | Matched output tier |
| Post-input idle p95 / p99 / max interval, ms | 16.7–16.8 / 16.8 / 16.8 | 16.7–16.8 / 16.8 / 16.8 | All runs; no >33 or >50 ms frames |
| Unforced used heap after ten seconds, cold MiB | 600.94 [581.48–613.44] | 590.78 [381.35–601.76] | GC-sensitive; not a residency saving claim |
| Unforced used heap after ten seconds, warm MiB | 652.64 [477.93–810.30] | 475.85 [437.74–801.83] | GC-sensitive; not a residency saving claim |
| Parse/compile CPU, first-use transition p95 and held-screen duration | Not measured separately | Not measured separately | No claim |
| Forced-GC heap floor, backing storage, peak process/GPU memory | Not measured | Not measured | No 20% residency claim |
| Ten-trip retained growth / 15-minute soak / energy | Not measured | Not measured | Follow-up acceptance work |
| Constrained network / real Android and iPhone | Not measured | Not measured | Desktop results do not establish these |
| Live host/follower cadence, voice and handoff | Not measured | Not measured | Protocol untouched; no parity measurement claim |

The resource totals are observed **after** the ten-second window, not an exact critical-path waterfall. Task blocking is computed over navigation to the input witness; it is not Lighthouse TBT. Heap-drop observations are not allocated bytes or GC pause timings.

## Historical validation and remaining gates

- Build and touched JavaScript syntax pass. Global tier: 422/422, including Save-Data versus deliberate play.
- Hosted physical Arcade entrance → refused Cloud Hopper download → retry → same actor → Escape return: pass. The dedicated hosted run passed 424/424 including global checks.
- Combined loading, direct Map, coaching, DSB exits and distant-effect checks with all three implementation commits: **487/487**.
- Six DSB lifecycle trips pass. Six Factory trips retained stable total nodes/DOM and released its subscriptions, but its exact target count changed 1,715→1,714 and failed. This remains a failure, not a relaxed bound.
- The broader startup run was **433/438**: four legacy Cloud Hopper camera/framing assertions and the Factory target assertion failed. The old outdoor-cabinet geometry warm-up was updated to match the cabinet's removal; the remaining camera expectations still fail. They are not claimed fixed by deferred loading.
- The full suite on the companion Map implementation was **2,070/2,106**. It is not a passing full-suite result for this series. Covered-wall performance, multiple older game/scene fixtures and lifecycle checks remain unresolved. STOPped checks were not repeatedly rerun after the authorized attempt.

These historical failures are not a passing acceptance result. Remaining original-plan work includes safe region extraction, lazy character preparation, a general cancellable during-play scheduler, constrained-network/real-device evidence and measured transition/residency acceptance. No generated `oogaboogaland.html` is included in the commit.
