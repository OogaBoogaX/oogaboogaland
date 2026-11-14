# Destination Map and optional coaching

## Current readiness and hub-test audit (November 14, 2026)

Updated against rock `07690cd6` after #679, preserving the new Ooga bodies and shared Tess. The map now calls the repository island Merge Rock. Optional coaching works while shared Tess is idle and yields to her visible queue, and sits beneath draggable Oogatron windows so their controls remain tappable.

The hub suite no longer forces `birdseye=1`. Retired hub cutaway, hidden-floor combat and overhead replay assertions are removed. Ooga and gorilla input, touch zoom, possession, sleep, player targeting and cloud checks use the ordinary orbit/shoulder/first-person modes. Shared projection, picking, culling and speech visibility remain covered, and the running Ghost Hunt now explicitly proves overhead rotation and its removal on exit. The cave seal, removed mainland totems/Agent/glyph room, decorative clouds and harmless hub combat retain their regression checks.

Testing the normal shoulder-to-carry handoff exposed a real player-targeting bug: carry-exit cleanup replaced the newly solved pitch. Cleanup now runs before solving, so the selected player stays visible on desktop and phone without moving the Ooga. The sleeper fixture waits for the real one-second relocation cooldown left by its preceding wake before measuring possession. Startup fixtures use the map's preview/confirmation flow.

Validation: build, changed JavaScript syntax and whitespace checks pass; **666/666 unit checks** pass. Focused browser checks pass for ordinary hub cameras (13), gorilla camera/possession (17), desktop/phone player targeting with both modelled Oogas (16), Ghost Hunt gear/camera (8), shared camera rendering (6), and the retained cave checks (6). Map accessibility/touch, shared Tess coaching, startup holds, decorative effects and desktop/phone Oogatron popups also pass. Fresh 320px and 390px map captures were visually reviewed. The full suite before this audit reported **2513/2530**, including one known-open check; corrected and retired cases were subsequently verified only in the affected lanes.

Follow-up investigation fixes player-on-player contact roundoff that pushed a rider sideways as the supporting Ooga rose, and the cabinet banner now reserves the measured equipment width so Mine's View button is not covered by the avatar. Drop startup no longer runs unrelated Block Frenzy setup. Chalkboard taps target exposed board pixels through the actual picker, and the legacy shoulder replay checks current-body camera clearance as well as its repaired side, preserved pose and equipment. These focused checks pass. Visibility boundary queries no longer retest the opposite ray's rejected triangle; the profiled hot path uses a fixed-arity norm. The standalone covered-wall workload passed at **57.2 FPS, High quality, 16.8 ms p95**, but its formal suite rerun after the latest rock merge failed at **51.6 FPS, Medium quality, 33.4 ms p95**. Those earlier results did not clear performance; the final unsampled follow-up is recorded below. Neither the threshold nor the measured workload changed. Both the pre-merge and integrated unit runs passed **666/666**. The integrated cabinet phone/chalkboard lane passes **68/68**, including every affected cabinet header and a visually checked Mine capture.

The lifecycle investigation attributed four of DSB's extra GPU records to Merge Rock's rotating detail preloads, not departed-scene ownership. Both soaks now use the existing `repospin=0` fixture and wait for coarse construction **and pending detail uploads** before their baseline. Resource limits are unchanged. DSB passes **3/3** (GPU 1400 → 1402, object heap 440.69 → 439.41 MB); Factory passes **5/5** across six mid-show departures (GPU 1572 → 1574, object heap 494.49 → 511.32 MB). Listener and DOM counts remain identical, and Factory's exact owner-generation checks pass on every departure. Runtime rotation remains enabled outside these lifecycle fixtures.

The final performance follow-up passes the actual suite **3/3 twice without CPU sampling**: covered movement measures **58.0 and 57.6 FPS, High quality, 16.8 ms p95**, with worst delivered gaps 49.8 and 43.8 ms. Every original threshold remains active. No performance experiment is retained: orienting ray coefficients and splitting bounds rejection did not reliably improve earlier runs and were reverted. The earlier failures remain material evidence of local timing variability; these passes do not establish a diagnosed performance fix. The profiling helper now supports `--source` and focuses before readiness, matching the suite's setup, and `COVERED_CPU=1` can capture the actual suite session. Sampled runs passed too, but are not used as acceptance timing.

The **gorilla population handoff remains unresolved and debugging is paused at the maintainer's request**. Its bounded transition trace shows mhodl releasing two stalled climbs, landing safely, then trying another roof and becoming stranded on a ledge. The widened-search experiment did not help. A subsequent level-cooldown experiment prevented the immediate roof retry but still found no admissible ground rest and introduced additional stalls; it too was reverted. No gorilla runtime change from these experiments remains. **666/666 unit checks** passed during the investigation; the corrected DSB/Factory lifecycle run was **14/15**, failing only the gorilla handoff. The maintainer has deferred the remaining test investigation to resume the PR queue. The gorilla failure remains recorded as pending acceptance; no check is disabled or reported as passing. Feature review can proceed using the focused Map evidence and CI above. Physical phones/controllers, screen readers, actual browser zoom and staging entrance acceptance remain unverified. Earlier results below are historical.

## Integration with rock dc381fa8 (November 11, 2026)

The atlas now includes upstream's Repo Island: its island footprint, stone bridge, named destination, View action and entrance bearing. All thirteen destinations use the existing scene guards. Navigation checks follow upstream's five supported Ooga modes; the removed normal overhead mode is not reintroduced.

Selecting in the phone List now immediately updates the map pin's selected state while the atlas is hidden. The mobile preview scrolls in the normal flow so it cannot cover pins. Close remains sticky, and selecting a destination brings its confirmation into view.

Build, changed JavaScript syntax and whitespace checks pass. The authorized follow-up resolves the 320px pin failure: Repo Island could exhaust the radial placement candidates and fall back onto HQ. One bounded grid pass now redistributes the pins when that search fills up, preserving the 44px targets, 48px center spacing, origin clearance and callout lines to the real landmarks.

Final focused map/navigation checks pass **13/13**. The phone check measures every pin and performs native touch activation of all thirteen at both 320px and 390px, verifying that the intended map pin and list row become selected. Map/List selection, touch guidance/cancellation, Repo Island View/Return and the desktop/navigation checks also pass. The user explicitly authorized continuing beyond the previous STOP; a successful run cleared that failing check's ledger entry naturally. Earlier Chrome-startup entries are unrelated and were not erased.

[Corrected crowded 320px layout](world-map-480-packed-320.png) · [390px layout](world-map-480-packed-390.png). Captures use the same actual-player fixture as the regression. Set `MAP_PIN_SHOTS=untracked/performance/map-pins` on the focused browser command below to reproduce them.

Fresh normal-vsync diagnostics cover desktop, 390px, 320px, short-height, driven-gorilla and DSB layouts. All six report no horizontal overflow or console messages; phone touch Close passes, reduced motion disables the receipt/edge effects, gorilla confirmation moves to Lab and DSB Harbor preserves the actor position. The captures are local Chrome emulation, not real-device or staging evidence.

[Desktop](world-map-480-desktop.png) · [390px phone](world-map-480-phone.png) · [320px phone](world-map-480-narrow.png) · [DSB](world-map-480-dsb.png) · [Raw diagnostics](world-map-480.json)

Remaining acceptance: walk actual entrances/bridges on staging, real phones in both orientations, physical controllers/disconnect, screen readers, actual 200% zoom, pointer-lock denial and the historical broader-suite gates below. Keep this PR draft and all four issues open.

## Usability follow-up (November 11, 2026)

Landmark icons retain 44px touch targets with smaller drawn symbols, a numbered list and short selected/focused names. Phones switch between Map and List without losing the selection; desktop keeps both. Surface, HQ and Basement filters separate stacked landmarks. The explicit Return to my Ooga button restores a previewed view through the existing pilot API. Known action restrictions appear during selection; the scene still checks the final travel action.

Guide me there adds a cancellable bearing and distance to the next authored entrance, using existing zone/door links for cave exits and bridge crossings. It never moves the actor, unlocks a door, enters a game or draws a claimed walkable route. HQ/basement guidance ends at HQ with a stairs instruction; Mempool leads to its descent entrance. The indicator updates at most 10 Hz only while guiding and disappears on scene/provider changes. This first entrance guide is available in the hub; DSB retains camera views and explicit return.

Build, changed-JavaScript syntax and whitespace checks pass. Focused map/navigation checks pass 12/12, covering all twelve finite entrance targets, actor preservation, floor filters, Map/List, return and early refusal. A 320px phone capture was inspected and its touch Close check passed; compact floor controls retain 44px targets. Physical phones/controllers, screen readers and deployed acceptance remain pending. Earlier results below refer to their earlier revisions.

## Top-down world atlas (November 11, 2026)

The Map now surveys the actual current world from above, using the already-built hub islands and DSB terrain. Numbered, 44px pin buttons and the equivalent named list share selection. Nearby pins fan out with callout lines, keeping separate HQ/basement levels selectable without inventing different coordinates. The camera target or controlled body is marked independently from the last-chosen destination.

Before confirmation, the selected zone, origin, dotted preview line and level description explain the action. The line is explicitly not a walking route. Oogas use **View**, leaving the body where it is; a driven gorilla uses **Warp to**, preserving the scene's existing guarded travel contract. Confirmation stays synchronous, with no queued teleport, fake progress bar or loading delay. A refusal stays open with the reason. Successful gorilla travel gets a brief, non-flashing edge settle and a receipt; camera choices say **View selected**, not that the actor arrived. DSB interior exits say the return **started**, since the scene owns that transition. Reduced motion removes the animations, and the optional guide waits until the receipt clears.

The desktop layout pairs the survey with a scrollable list and preview footer. Phone layouts retain the 44px pins, a full-width confirmation and reachable sticky Close. Short-height windows scroll the preview into view without a footer covering the entire survey. Keyboard and controller input use the existing modal/focus/neutral-input paths. Selection alone does not move the camera or body. All new drawing is bounded to opening/resizing/selection, with at most 27,000 terrain samples on opening and no per-frame map rendering.

### Current verification

Integrated with `rock` at `77366597f9d75c555d459fd7da158a15d03fb5e9` in merge `044ae122`. Source build, changed-JavaScript syntax and whitespace checks pass. Focused command:

```sh
ONLY='destination accessible names,hub map navigation' LANES=1 CHROME_ARCH=arm64 node test/run.mjs --browser-only hub
```

**11/11 browser checks pass** on the atlas implementation. This excludes the global/unit tier. It covers accessible preview names, unchanged camera/body during preview, confirmation, underground floor distinctions, keyboard isolation, Close/Escape focus, controller menu and reconnect-neutral behavior, coaching and look/return flows. The first sandboxed Chrome launch aborted in macOS application registration before checks; native Chrome outside the sandbox ran successfully. No Factory, local visibility/storage, full suite or stopped workload was run.

The existing visual diagnostic (`scripts/profile-destination-map.mjs`, not an additional test runner) captured desktop, 390px phone, 320px phone, 720px short-height, driven-gorilla and DSB scenarios. All six reported no horizontal overflow or console messages; every pin and Close measured 44px. Both phone-emulated touch Close checks succeeded. The driven gorilla moved about 14m to Lab after confirmation and produced a warp receipt; DSB Harbor changed the view with zero actor displacement. Reduced-motion computed styles disabled the receipt animation and edge effect. Map-open timings are local two-frame observations, not INP or user-study completion times. Raw observations are linked below.

[Hub camera preview](world-map-480-desktop.png) · [Phone preview](world-map-480-phone.png) · [Gorilla warp preview](world-map-480-gorilla.png) · [Gorilla result](world-map-480-arrival.png) · [DSB preview](world-map-480-dsb.png) · [Raw observations](world-map-480.json)

Read-only review found no remaining blocking issue after correcting the origin marker, DSB ground sampling/exit wording, and last-chosen accessibility semantics. These focused checks are not a full acceptance sign-off. Physical phones/controllers, screen-reader interaction, actual 200% zoom, pointer-lock denial and broader scene acceptance remain unverified. Required CI must be checked on the published head. All sections below are historical unless explicitly updated.

## Integration with rock 5e5ad247 (controller profiles)

Published head: the merge of `rock` at `5e5ad247` into this branch. Upstream's pad-action layer (#535) rewrote `gamepad.js` around contexts, learned profiles and a Menus layer (`pad-focus.js`) that takes the pad whenever a modal dialog is open, and removed Whitepaper Day and Goldbug (#539). Map follows it instead of carrying its own pad reading:

- The dialog is modal, so `pad-focus.js` drives it: the d-pad or left stick moves focus to the nearest control, A chooses, B or Menu closes. Map's own `ui` state, d-pad list walking and `hold(on, requireNeutral)` are gone from `gamepad.js`.
- On foot, Menu's fixed row still sends Escape; `destination-map.js` opens Map on a pad-marked Escape wherever Map is available (`canOpen`) and otherwise leaves the key its let-go meaning. The row is labelled `Map · let go · back`.
- Closing Map calls the new `gamepad.requireNeutral()`: no stick movement is published until both sticks have rested inside the dead zone, a requirement a controller's absence leaves standing, as before.
- Pad-synthesised keys (`e.pad`) are no longer tracked as held keyboard keys, since `pad-focus.js` sends Escape without a keyup.
- Tess's guide no longer waits on the removed Whitepaper tour; it still yields to the coaching. DSB Land's action table is upstream's weapon-free one with `mode-preset` returning Map's answer.

Checks on this head: `npm run build` and `node --check` on every touched file pass; `npm run test:unit` 483/483 (the gamepad hold check now exercises `requireNeutral`); `ONLY='destination accessible names,hub map navigation' LANES=1 node test/run.mjs hub` 493/493 (the global tier plus those two hub steps). The destination pad check now drives the pad through the menus layer (a real microtask between polls, a named Xbox id) and reads a press edge right after its own poll, since the page's frames poll too; the coaching check first drives an Ooga, as the guide's movement step is about the visitor's own. No full suite, Factory, perf or stopped check was run for this synchronization; the results below are historical.

## Current integration with rock

The chooser now follows upstream's player controls: choosing a view moves the camera while the Ooga stays where it stands. Movement or Escape returns to the Ooga. Hub gorillas keep upstream's guarded travel behavior. The chooser labels these actions “View” and “Go to” respectively; coaching no longer offers a free camera or tells the visitor to retake control. DSB rooms retain the explicit Return outside action.

The merge preserves upstream's separate-body Map fixtures and adapts them to choosing a destination. HUD tracking uses the actual current actor instead of the removed `modeCave` state. Close returns focus to Map, while a successful choice focuses the canvas. The existing accessibility regression now checks Close as well as Escape. Opening Map also cancels a pending DSB click-to-place wallet walk, so it cannot move or place a device behind the dialog; the existing wallet playthrough covers the interruption and fresh click.

The browser results and captures below are historical evidence from the earlier behavior, not validation of this integration. No Factory or stopped checks have been rerun. The integrated browser behavior, physical gamepad, real devices, screen reader and actual zoom still need validation.

## Controller reconnect follow-up

Disconnecting a controller cleared Map's pending stick-neutral requirement. Reconnecting with deflected sticks could therefore resume movement or camera input when Map closed. The no-controller path now preserves that requirement until both sticks are sampled inside their dead zones; button release and ordinary disconnect handling stay unchanged.

The existing destination gamepad regression reproduces this on `1acb75fdfcd6e990e36dc7abff91f2c00f8b6a2e`: **438/439**, with reconnect-before-close, reconnect-after-close and both-stick neutral requirements failing. With the one-line state fix, the single focused rerun passes **439/439**, including held-button suppression, fresh-button activation, ordinary disconnect/reconnect, keyboard coaching and Map controls. Command: `ONLY='destination accessible names' LANES=1 node test/run.mjs hub`. Build and syntax checks for `src/js/gamepad.js` and `test/run.mjs` pass. No Factory, performance, full-suite or stopped workload ran. Physical-controller and other manual acceptance below remain open.

An additional extension explicitly closes Map while the controller is absent, then reconnects with both sticks deflected. The same focused lane passes **439/439** with this ordering, reconnect-before-close and disconnect-after-close covered together. The runtime fix is unchanged.

## Keyboard replay follow-up

Controls previously reserved native Enter/Space activation for Close, preventing keyboard activation of the new Learn by exploring button. Dialog buttons now retain native activation while practice keys remain isolated from gameplay. The existing destination check now exercises both keys through Chrome's native input path.

Validation on head `667e3c0fdc32f4c455dca617671d2696917638e8` plus this fix: build and changed JavaScript syntax pass; `ONLY='destination accessible names' LANES=1 node test/run.mjs hub` passes **439/439**. The first fixture omitted Enter's native key metadata and reported **438/439** (`[false,true]` for Enter/Space). Correcting that event, without changing assertions, passed the single focused rerun and cleared its ledger entry. No Factory, performance, full-suite or previously stopped browser workload ran. This result does not replace the broader acceptance gaps below. Keep draft pending those gates and maintainer play-testing.

## Feature behavior

Map opens a labelled destination chooser instead of immediately moving through a cycle. It groups Play, Explore and Learn, identifies the current destination and describes each entrance. An Ooga gets “View”; a driven hub gorilla gets “Go to.” Scene-owned look and travel actions still decide whether the choice is allowed. A refusal leaves the chooser open with feedback. DSB interiors offer one truthful action, “Return outside to CHORA,” before showing town viewpoints.

The optional guide progresses from moving the controlled Ooga to a successful Map choice. It can be dismissed and replayed from Controls, and remembers completion locally. It coordinates with Tess so two guides do not compete. It awards no tickets, loot or artificial progress and does not bypass Arcade cabinets, ownership or entrance rules.

## Controls and layout

Keyboard focus starts on Close; Tab, Enter and Space use native dialog controls. Escape closes Map and restores focus. Movement stays held off until a fresh key press. Gamepad Menu opens/closes, D-pad or left stick moves through the visible order, A chooses and B closes. Sticks must return to neutral before movement resumes. The existing M mute binding stays unchanged. The original list destinations were at least 64 CSS px tall, Close is 44×44, and the sticky header keeps it reachable while scrolling. The world continues running behind the chooser.

[Desktop capture](destination-map-desktop.png) · [Phone-emulation capture](destination-map-phone.png) · [Raw layout and interaction observations](destination-map.json).

## Historical measurements before the player-control integration

Baseline `rock`: `e6d69aa4d9d93f1c90bf0a28c8899189d3f160a0`. Candidate runtime: `20daa63c` plus layout `eca32c74`. Tests use native ARM Chrome 156 on macOS 27.2 / M1 Pro. Counts below are button activations from the Pile, not user-study completion times; phone scrolling may add gestures.

| User-visible metric | Before | After | Evidence / limit |
|---|---:|---:|---|
| Choose Arcade from Pile | 7 sequential activations | Open + choose (2) | Existing preset order versus direct selection |
| Choose Mempool from Pile | 5 | 2 | Same travel action and guards |
| Choose Bifrost from Pile | 10 | 2 | Same travel action and guards |
| Open navigation without moving | Every cycle activation travels | Opening makes no trip | Accessible-name check witnesses unchanged destination |
| Discoverable destinations at once | One current cycle label | All 12 labelled choices | Accessibility tree includes all 12 buttons |
| Current place and entrance explanations | Current label | Current marker and descriptions | Dialog DOM / visual review |
| Movement/Map coaching | Tess's existing island guide | Optional movement + Map guide alongside Tess | Dismiss, replay, actual movement and completion checks |
| Held-key and held-stick leakage after closing | No Map dialog | None in focused keyboard/gamepad checks | Not a claim covering every hardware controller |
| DSB indoor selection | Cycling a viewpoint actually exits | Explicit Return outside action | Every registered room, twice, preserves panel state |
| 1440×813 desktop open-to-two-animation-frame proxy, ms | Not measured / different interaction | Median 27.85, max 29.10 (10 opens) | Normal vsync; not production INP |
| 390×844 touch-emulation proxy, ms | Not measured | Median 27.15, max 28.60 (10 opens) | Native touch closes after scrolling |
| 320×640 touch-emulation proxy, ms | Not measured | Median 27.60, max 32.10 (10 opens) | Native touch closes after scrolling |
| 720×363 constrained viewport proxy, ms | Not measured | Median 27.80, max 29.00 (10 opens) | Layout proxy, not actual 200% browser zoom |
| Horizontal page overflow at these sizes | Not measured | None | Layout bounds and captures |
| Destination / Close target height | Prior cycling control | ≥64 / 44 CSS px | Measured rectangles |
| First-use task success, time, wrong actions and help requests | Not measured | Not measured | No participant study or ≥90% success claim |
| Real Android/iPhone, physical gamepad, screen reader, actual 200% zoom | Not measured | Not measured | Emulation and AX checks do not replace manual review |
| Travel feedback/arrival p95 and cancellation latency | Not measured | Not measured | Existing navigation is reused; no faster-arrival claim |
| CPU/GPU, allocations/GC, retained heap, power, network cadence | Not measured for this branch | Not measured for this branch | Companion engine measurements do not establish Map overhead |

Reproduce after `npm run build` with `CHROME_ARCH=arm64 node scripts/profile-destination-map.mjs`. The driver uses normal vsync and enables motion; the published results replace the earlier uncapped layout-only timings.

There is no production analytics or external telemetry. No usability percentage is inferred from action counts.

## Validation and remaining gates

- Build and touched JavaScript syntax pass.
- Focused final controls: **476/476**, including native keyboard focus/Escape, held movement, raw standard-gamepad Menu/D-pad/B/neutral behavior, coaching completion/replay, actor/view-preserving travel, gorilla destinations and all DSB room exits.
- All three implementations combined: **487/487** focused loading/controls/visibility checks. The final layout-only follow-up was built and visually inspected at the four widths above; touch closing passed and console logs were clean.
- Full suite before the final focused fixes: **2,070/2,106**, so this is **not** full-suite green. The old gorilla-Map assertion was corrected for the intentional chooser-close behavior and then passed. Other failures include covered-wall performance, shared-panel/Rally fixtures, old Cloud Hopper camera/framing expectations, hammock bounds, crew/stand-on-player cases, Timechain/Matrix/Canvas fixtures, DSB media/TV and lifecycle fixtures. The covered-wall floor also failed on untouched upstream in a separate CPU-instrumented diagnostic; that is not a clean baseline acceptance run. The whole remaining failure list is not labelled proven baseline.
- [Full-run failure inventory](destination-map-full-suite.json) preserves every reported failure, including duplicate desktop/phone occurrences, and identifies subsequent focused corrections.
- The subsequent startup branch repairs the removed outdoor Cloud Hopper cabinet warm-up and passes DSB lifecycle trips, but its Factory target-count mismatch remains. Related weapon-pose/hammock PRs #476–477 are not duplicated here.

Draft pending unresolved suite gates and maintainer play-testing, including real devices, actual zoom, screen reader, pointer-lock denial, controller disconnect and participant usability evidence. The broader regional-loading/scheduler plan is not implemented by this UI branch.
