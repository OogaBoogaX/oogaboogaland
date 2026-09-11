# AGENTS.md

Guidelines for AI agents and human collaborators working on Ooga Booga Land. Read this
before changing anything. The standard: production-quality engine code in
dependency-free JavaScript, correct, measured, allocation-conscious, consistent with the
modules around it, and verified by the suite before it lands.

## What this is

A WebGL2 floating island whose cliff caves are projects. The page lands on the hub; the
open caves are the EntropyLab lab, where donated bananas feed voxel cavemen who
represent its contributors, and Ooga Rally, a three-track kart race for the same crew.
Pile, crew, effects and loot crates are the same systems in the hub and the lab and the
pile level is shared everywhere; the rally has its own systems over the same cavemen. The page is static and network-free: the
content policy forbids every connection, payments are a simulator stub, all state lives
in localStorage. A backend comes later and must fit the contract in `src/js/donations.js`;
do not add network code before it exists. Visitor-facing controls are in the README.

## Ground rules

- Read a file before editing it. Edit what is on disk, not what you assume.
- Never run git commands. The maintainer commits. No branches, stashes, or `.gitignore`
  changes unless asked.
- Vanilla JavaScript only: no frameworks, TypeScript, bundler, npm dependencies,
  external scripts or fonts. `package.json` exists only for `npm test` and `npm run build`.
- Keep the content policy strict. `src/index.html` allows `self` scripts and styles and
  nothing else; the build pins inline blocks by hash. Never add `unsafe-inline`,
  `unsafe-eval`, or a remote origin.
- Smallest change that works. No refactors, reformatting, or renames the task does not
  require. Match the surrounding style.
- No console noise. The suite fails a check if the console is not clean.
- Run `npm test` before finishing. Fix failures; never weaken or skip a check.

## Repository

| Path | What it is |
|---|---|
| `src/index.html`, `src/style.css`, `src/js/` | the sources; open `src/index.html` directly to run them |
| `oogaboogaland.html` | the built single-file page, committed; regenerate with `npm run build` after any change under `src/` |
| `scripts/build.mjs` | inlines `src/` in script order and pins the content policy hashes |
| `.github/workflows/pages.yml` | builds and deploys the single-file page to GitHub Pages on pushes to `rock` or manual runs |
| `test/run.mjs`, `test/browser.mjs` | the suite and its headless Chrome driver |
| `untracked/` | local planning notes, ignored by git |

Nothing to install. `npm test` needs Node 22 or newer (the driver uses the global
`fetch` and `WebSocket`) and Chrome; the driver looks at the macOS application path, so
on Linux or Windows set `CHROME` to the binary. A full run takes about five minutes,
mostly in the soak blocks. Deploy only `oogaboogaland.html`, served as `index.html`.

GitHub Pages uses the Actions workflow above. It rebuilds the page and uploads only
`_site/index.html`; do not publish the source tree. The workflow deploys but does not
run the browser suite, so run `npm test` locally before merging.

## Modules and load order

Classic scripts, each an IIFE with `"use strict"`, sharing one namespace `window.BL`.
The `<script>` tags in `src/index.html` are the dependency order and the build order. Add
a module by placing its tag after everything it uses; `director.js` loads last, after
every scene has registered on `BL.scenes`.

| File | Exposes | Job |
|---|---|---|
| `qr.js` | `BL.qr` | QR code for the donation link |
| `math.js` | `BL.math` | `mat4` (with `invert`), easing, damping, hashing, `rayFromView` |
| `daylight.js` | `BL.daylight` | the local solar clock: continuous sun/moon directions, sidereal star frame, altitude-driven sky/light factors, six semantic phases, `sample`, `createClock` |
| `scene.js` | `BL.scene` | nodes, world transforms, camera, bounds cache, tweens |
| `gl-renderer.js` | `BL.glRenderer` | WebGL2: instancing, frustum culling, shadow map, sky pass with sun, moon and stars, ten bounded point lights, bloom, MSAA, quality tiers, pixel budget |
| `canvas-renderer.js` | `BL.canvasRenderer` | Canvas 2D fallback, same API; also draws locker icons |
| `models.js` | `BL.models` | procedural geometry: room, cavemen, props, crates, `SWAG` catalog |
| `terrain.js` | `BL.terrain` | voxel grid, greedy meshing, the island: `heightAt`, `surfaceAt`, `onLand`, `isPath`, mouths |
| `hub-models.js` | `BL.hubModels` | cached hub props: cave rim, gate, shelves, sign, lantern, trees, bushes, grass, rocks, barrels, torches, fire pit, clouds, dock, critter bodies |
| `caves.js` | `BL.caves` | the seven cave slots (clock position, status, scene, name) and the gate |
| `contributors.js` | `BL.contributors` | roster snapshot, state by commit age, hashed traits, `LIKENESS` |
| `donations.js` | `BL.donations` | donation request, simulator, event contract, `sanitize` |
| `interact.js` | `BL.interact` | pointer gestures, ray picking, drag, long-press, double tap |
| `controls.js` | `BL.controls` | held keys, two on-screen sticks, a hold button and the both-mouse-buttons chord on the canvas, folded into one axes object per frame |
| `pilot.js` | `BL.pilot` | the visitor's view of any scene: orbit camera and presets, free flight, third person over a caveman, act button and Space (the jetpack throttle while one is worn) |
| `game.js` | `BL.game` | loot tiers, deterministic loot, inventory, localStorage, `formatLarge` |
| `hud.js` | `BL.hud` | DOM panel: roster, meter, feed dialog, locker, toasts, tooltip, `renderIcon` |
| `fx.js` | `BL.fx` | particle pool and bursts, speech bubbles, zzz marks, ticker, overlay drawing |
| `crew.js` | `BL.crew` | cavemen from the roster: states, fan slots, walk / eat / sleep / cheer / build, strolls, the rush to fresh bananas, the driven caveman and jetpack flight, swag, pokes |
| `pile.js` | `BL.pile` | inflating yellow-backed surface layer through 302, then the layered banana shell over a growing mound; drop-in, hatch, `MAX_BANANAS`; level on the shared `world` |
| `crates.js` | `BL.crates` | loot crates: landing ring, spawn, open, remove |
| `critters.js` | `BL.critters` | instanced butterflies by day, fireflies and embers by night, populations by phase and tier, bursts |
| `scene-hub.js` | `BL.scenes.hub` | the island scene: the clock samples the sky and lamps each frame; registers first so it is the landing scene |
| `scene-lab.js` | `BL.scenes.lab` | the lab scene; Escape and Leave cave return to the hub |
| `race-models.js` | `BL.raceModels` | cached rally props: Rock Kart and Dino mounts, gantry and lamps, boost pad, item crate, rock, peel, boulder, spectators, banners, torch stands, and the themed decor (palms, lagoon rocks, lava rocks, obsidian, bones, pines, crystals, ice spikes, snow rocks, buoys) |
| `race-track.js` | `BL.raceTrack` | `TRACKS` and `THEMES`; `build` turns a closed Catmull-Rom spline into a road ribbon with curbs, walls and lips before gaps, a terrain skirt in chunks, decor baked per sector, spectators, torches, checkpoints, the grid, item spawns and the minimap; `nearest`, `project`, `heightAt`, `surfaceAt`, `roadY` |
| `racers.js` | `BL.racers` | the seven contributors as racers on a mount (`MOUNTS`): a fixed-step arcade controller (throttle, steer, drift charge and tiered boost, hop, launches and landings, walls, falls, hazards, respawn), racer pushes, checkpoints, laps, ranks, rubber band, the AI driver, mount animation |
| `race-items.js` | `BL.raceItems` | fixed pools: banana pickups and the turbo meter, item crates, boost pads, thrown rocks, dropped peels, boulders, skid marks in a ring buffer; `use` |
| `race-hud.js` | `BL.raceHud` | the garage board, the in-race strip, countdown and notices, results, pause, minimap and speed lines on the overlay |
| `race-audio.js` | `BL.raceAudio` | procedural sound: one `AudioContext` opened on the first real gesture, a fixed pool of eight pre-started oscillator voices gated by gain envelopes, one looped noise buffer behind wind, drift scrub and crowd filters, a three-speed engine (first gear pulls from idle, later gears drop in at half revs and wind to a limiter, two cruise shifts drop the note flat out, a held throttle blips it in place during the countdown) or a growl pitched by speed, footfalls on foot; `cues`, `update`, `quiet`, `setMuted`, `dispose` |
| `scene-race.js` | `BL.scenes.race` | the rally scene: garage, countdown, racing, paused, finished; chase camera, lighting from the ten nearest torches, donations, `leave` |
| `director.js` | `window.__ooga` (debug only) | the app: renderer, frame loop, governor, housekeeping, keys, donations, routing, transitions |

The rally modules load after both scenes so the hub stays the landing scene, and before
`director.js`.

Both renderers implement the same surface: `render(root, camera, opts)` returning
whether a frame was drawn, `project(x, y, z, out)`, `ray(px, py, camera, out)`,
`resize`, `setQuality`, `releaseGeometry`, `releaseUnused(liveSet)`, `dispose`, and the
getters `kind`, `quality`, `ready`, `failure`, `stats` (`records`, `active`,
`mirrorResources`, `culled`, `drawn`), `size`. Gameplay code stays renderer-agnostic;
anything new goes into both.

## Scenes and the director

One scene is active at a time. `director.js` owns what outlives a scene: the renderer
(WebGL2, or the Canvas 2D fallback when the context or programs fail), the overlay canvas,
the frame loop, governor, quality auto-tier, minute housekeeping, keydown routing
(Shift+Delete and Shift+R there, every other key to `active.onKey`), the visibility
pause, `game`, `world`, the donation subscription, `BL.scenes`, `?scene=` routing,
transitions, the `[data-scene]` HUD sections, `__ooga`, and `destroy` on pagehide. A
scene builds its root, camera, input, HUD and systems in `enter` and drops them in `leave`.

`world` is `{ level }`, the banana level every scene shares. With `game` it is the only
gameplay state that crosses a transition.

The scene contract, as `scene-lab.js` and `scene-hub.js` implement it:

| Member | Role |
|---|---|
| `id` | the key in `BL.scenes` and in `?scene=` |
| `enter(ctx)` | build the visit; set `root`, `camera`, `input`, `debug` on the scene object |
| `update(dt, elapsed)` | per frame, allocation-free; `elapsed` is scene time, restarting at 0 on every enter |
| `overlay(dt)` | draw the frame's 2D overlay (`fx.drawOverlay`); the director paints the fade after it |
| `onDonation(donation)` | a donation event while this scene is active |
| `onKey(e)` | keys the director does not handle itself |
| `onLootCleared()` | the locker was emptied with Shift+Delete |
| `renderOpts` | any of `clear`, `sky`, `ground`, `sun`, `light`, `shadowCenter`, `shadowExtent`, `bloomStrength`; with `horizon` and `zenith` the sky pass draws (plus `moon`, `stars`, `time`); `lights` is a `Float32Array(80)` of up to ten `x, y, z, radius, r, g, b, 0` entries with `lightCount`, clamped to the tier; `fog` (an rgb array) with `fogNear` and `fogFar` fades distant faces toward that colour, off when absent |
| `leave()` | tear the visit down; returns `{ targets }`, the input target count read before `input.dispose` |
| `stats()` | `visibleNodes`, `allNodes`, `tweens`, `targets` plus the stats of fx, crates, crew, the pile and, in the hub, the critter counts |
| `liveGeometry(set)` | add geometry kept off the graph but wanted on the GPU (the cavemen's swapped heads) |
| `root`, `camera`, `input`, `debug` | set in `enter`; `input` and `debug` nulled in `leave` |
| `inMotion` | getter, true while the pile or fx animate; the governor keeps full rate for it even unfocused |

`ctx` is one object for the page life: `{ renderer, canvas, overlay, game, world, go,
from }`. `go(id)` starts a transition (throws on an unknown id, ignored while one runs);
`from` is the scene being left, `null` on boot. The hub ignores it and always starts on
its landing view.

A transition is a 0.25 s fade to black, then in one frame `swap`: `leaving.leave()`,
`clearTweens()`, `enter(next)`, `renderer.releaseUnused(live)` with `live` = every
geometry under the new root plus its `liveGeometry`, then 0.25 s back in. Under
`?debug=1` the director throws if the leave contract is broken: children left on the old
root, input targets reported by `leave()`, tweens surviving `clearTweens`, or more GPU
records than the new scene has live geometries. `leave` must also clear timers, dispose
its systems, input and HUD, and null the visit's module-level references; the soak checks
measure exactly that.

`__ooga` reads the active scene's `debug` object for `slots`, `cavemen`, `crates`, `lab`,
`hud`, `applyAllSwag`, `renderLocker`, `demoTip`, `refreshStates`, `trimPool`, `shown`,
`island`, `mouths`, `camera`, `crew`, `controls`, `pilot`, `renderOpts`, `lamps`, `fireSeats`,
`critters`, `daylight`, `setHour`, `track`, `racers`, `items` and `race`; a scene fills in
what it has.

## Engine patterns to keep

- **Allocation-free frame loop.** Nothing in `frame`, `updateCaveman`, `drawOverlay`, or
  the renderers allocates per frame. Hoist literals, write into scratch objects
  (`setVec`, `SCREEN`, `MUZZLE`), reuse arrays.
- **Pool and cap.** Particles, bullets, bubbles, sleep marks, crates, inventory and the
  pile have fixed capacities. Anything spawned repeatedly needs a pool or a cap; prove it
  with the soak pattern if in doubt.
- **Instance by geometry.** Nodes sharing a geometry object are one draw call. Reuse
  geometry; cache builders with `cached()` or a `Map` keyed by parameters, as `models.js`
  does.
- **Release what you stop using.** Nodes removed from the graph leave picking and the GPU
  at the next housekeeping pass. Call `input.remove` for anything you registered.
- **Deterministic cosmetics.** Contributor traits hash from the handle, loot from the
  donation id via `fnv1a`. `Math.random` only for throwaway effects; `randomInt` (crypto)
  only where fairness matters, such as the die.
- **Frame rate is sacred.** Full rate whenever focused. Reduce work through the quality
  tiers (pixel density, effects), never by throttling frames.
- **Camera moves only on input.** No auto-orbit, drift or inertia. Held keys and sticks
  move the target or the driven caveman while held; damping settles within a few frames.
- **The race runs on a fixed step.** `scene-race.js` accumulates frame time into 1/120 s
  substeps (at most four a frame) for `racers.substep` and `items.update`, so handling is
  identical at any frame rate; `pose` and the camera run once per frame. Everything on a
  track lives in typed arrays or preallocated objects: samples are structure-of-arrays,
  `nearest` walks from the caller's last index, decor is baked into one merged geometry per
  sector so the renderer culls a sector at a time, and the dynamic batches (spectators,
  skids) are fixed-capacity `instanceData`.
- **Sound is synthesized and pooled.** No audio files: `race-audio.js` builds every node
  once, a cue only schedules gain and frequency automation on a pooled voice, and the
  context is created only from a gesture the browser has activated (`navigator.userActivation`),
  so nothing warns in the console. The scene silences the layers outside a race and closes
  the context in `leave`.
- **The clock is the hub's.** `daylight.sample` writes the hub's `RENDER_OPTS` in place every
  frame; phases (dawn, morning, noon, dusk, night, midnight) drive lamps, critters, quotes
  and toasts. The lab is inside the rock and passes no sky. The roster's sleep and eat states
  come from commit age, never from the clock.

## Checks and trust

Validate at boundaries: localStorage on load (`game.load`), donation text
(`donations.sanitize`), browser capability (renderer fallback, context loss, program
failure), and pointer input (cancellation, second finger, stale targets). Inside those
boundaries trust the code. No guards for states our own code cannot produce; a thrown
error beats a silent fallback.

## Adding things

**A prop in the lab.** Build geometry in `models.labRoom` from `box`, `lathe`, `tube`,
`ring`, `polyline`, `merge`, or voxels via `makeVox` and `voxelGeometry`. Return the node
in `equipment` if interactive, register it in `scene-lab.js` with `addProp` (which also
unregisters it in `leave`) using an `owner.kind`, then handle that kind in `tooltipFor`
and `onTap`.

**A swag item.** Add an entry to `SWAG` in `models.js`: `id`, `name`, `tier`, `slot`
(`head`, `hand`, `face`, `gun`), optional `offset`, `rotation`, `float`, `spin`, and a
`build` returning geometry. Weapons are skins: `skin: "club"` or `skin: "gun"` switches
the caveman's own club or rifle to gold (see `skins`) and `build` only feeds the locker
icon. Sizes are fractions of caveman height; the head is about 0.28 wide and 0.22 deep at
hair level, so anything wrapping it needs radius 0.38 or more. The locker icon is automatic.
Stacks cap at `STACK_MAX` (9) per item: `game.lootFor` rolls only from items under the cap,
so a full item never appears as a crate, and `addItem` refuses the tenth.

**A caveman behaviour.** Add state to the `cave` object created in `crew.js`, drive it in
`updateCaveman`, reset it in `resetPose` if it changes limbs. One-off arm animations must
settle back; see cheer and catch. A working day is `cave.act.kind`: `eat` or `rush` at
the fan slot, `wander` to a spot, `idle` there, `player` under the visitor. Strolls run
only when the scene passes `wanderSpot` (the lab does not); `walkToSlot` leaves a
stroller alone unless forced, which `rush` does. Walkers stand on `groundAt`, so a scene
with terrain passes its `heightAt`.

**A lamp in the hub.** Build a geometry whose flame faces are the only emissive ones, then
`addLamp(node, LAMP.kind, x, y, z)` in `scene-hub.js`: `node.glow` follows the dusk ramp in
stagger order and lit lamps fill the fixed point-light array (ten reach the shader). A critter
kind is a batch in `critters.js`: fixed capacity, homes seeded by `mulberry32`, motion
written straight into `instanceData`, population eased toward a phase- and tier-scaled target.

**A rally track.** Add a definition to `TRACKS` in `race-track.js`: `id`, `name`, a
`theme` from `THEMES`, `laps`, `seed`, `hazard`, medal `targets` in milliseconds and
`points` through `P(x, z, y, { w, bank, surface, wall, curb, pad })`. The road is a slab
(`ROAD_LIFT`, `SLAB_DEPTH`, `CROWN`) with raised curbs and shoulders; boards are plank
blocks on beams and piles; `slabY` is the driving surface and `roadY` the centreline
profile launches are read from. `build` takes `rain`: on the outdoor tracks it greys the
sky, dims the sun, tints the slab wet and raises `slipAt` for road and boards (snow on the
peak, nothing in the gorge); the scene rolls it with `randomInt` on every track load and
`?debug=1&rain=1` or `rain=0` pins it. Precipitation is one fixed-capacity instanced batch
in `scene-race.js` that falls through a box ahead of the camera. The spline must not
cross itself at the same height; a bridge (`surface: SURF.board`) may cross a lower road.
A `SURF.gap` point opens a jump: the road rises into a lip before it, checkpoints keep a
runway clear of it, and a `pad: 1` on the point before feeds it. Keep the run-up to a gap
straight. Build it in node or the browser and read `spawns`, `checkpoints` and the
`race tracks` check; then run `race AI` and make sure every racer finishes.

**A mount.** Dinos draw three shared hides (`DINO_HIDES`) so each part is one instanced
draw per hide, and their legs pivot at the hip. Add an entry to `MOUNTS` in `racers.js` (top speed, acceleration, brake,
turn, drift turn, mass, hop, off-road factor, body radius, garage bars) and a builder in
`race-models.js` returning `{ node, seatY, seatZ }` plus whatever parts `pose` animates;
`seat` places the caveman and `pose` drives the animation by mount id.

**An item.** Add its name to `ITEMS` and `ITEM_NAMES` and its odds to `ODDS` in
`race-items.js`, handle it in `use`, and give the AI a rule in `drive`.

**A donation-driven event.** Hook `onDonation` in the scene module. Do not touch the
event shape `{ id, sats, handle, message, at }`; the backend will emit exactly that.

**A cave.** The seven mouths exist in the terrain, one per slot in `caves.js`. Opening
one is one line there (`scene`, `status: "open"`, `name`) plus a scene module registering
`BL.scenes.<scene>`. An open mouth gets shelves, torches, a label, a camera preset and a
tap that dollies in and calls `go(slot.scene)`; `"sleeping"` gets a bedroll and zzz;
anything else stays dark; `buildMouth` dresses an open mouth by its `scene` (shelves for
the lab, the rally's garage of kart, wheels, crate and barrel from the cached rally
geometry). The new scene needs Escape and a `leave` action back to `"hub"`, and its own
`data-scene` sections in `src/index.html` if its HUD differs.

**A scene.** An IIFE loaded after the systems it uses and before `director.js`,
registering `BL.scenes.<id>` with every contract member. `enter` builds everything from
`ctx` and sets `root`, `camera`, `input`, `debug`; `update` and `overlay` allocate
nothing; `leave` clears timers, disposes crates, pile, crew, fx and the pilot, removes
every input target it added, empties `root`, disposes `input` and `hud`, nulls the visit's
references and returns `{ targets }`; `stats` and `liveGeometry` as in the lab. The
camera comes from `pilot.create` with the scene's presets and bounds (`clampTarget`,
`clampCamera`): call `readInput` before the crew moves and `update` after, spread
`pilot.hooks` into the input hooks, route the `act` and `reset-view` actions and the
Escape and 0 keys to it, and `bind` it the shared systems. Give the crew `walkable` and
`useNear`, and answer `onTap` for every prop worth a reaction. Round trips under
`?debug=1` throw if any of that is missed, and a scene reachable from the hub needs its
own turn in the soak blocks.

The race readouts sit in the top corners (`.race-hud-left`, `.race-hud-right`), the
minimap bottom-left on pointers and under the left readout on touch layouts; the race
hides the look stick and puts Drift and Throw beside the move stick.

**A HUD element.** Markup in `src/index.html`, styles in `src/style.css` using the
existing tokens, wiring in `hud.js` behind a small method, a `data-action` button if it
triggers behaviour. The sheet has three tabs, roster, bananas (the supply meter, the
visitor's stats and the project metrics that GitHub will fill later) and locker, with two
pull tabs on its edge that open their own panel or fold the sheet when it already shows; the donation form is the
`#feed` dialog owned by `hud.js` (`openFeed` / `closeFeed`), and keys pressed inside a
dialog never reach the scene. Counts from a thousand up go through `game.formatLarge`.
Blur controls after use so shortcuts keep working. The sheet collapses to a rail on
desktop and docks to the bottom under 720px.

## Debug keys and flags

Keys: B add 100 test bananas, L legendary tip, P fill the pile, 1 to 9 force a contributor to eating,
Shift+Delete clear the locker (loot on), Shift+R reset everything. Keys are ignored while typing in
a text field and on auto-repeat. The hub hides one jetpack under a random meadow prop each
load; its `highlight` pulses after `HINT_AFTER` seconds of scene time, and a driven
caveman flies at `crew.js`'s `JET_SPEED` within `flyable`.

In the rally: a drag swings the garage view round the grid, Enter starts the race, E or
Shift uses the item, Q looks back, 0 resets the camera, M mutes, Escape pauses. Results show projected times for
racers still on track and swap in real ones as they finish; a podium finish offers the
next track. The Cup (`cup-start`) runs every track in order, awards 10, 8, 6, 5, 4, 3, 2
points a race, shows standings on each podium and saves the best cup medal through
`game.recordCup`. `__ooga.race` also exposes `startCup`, `nextRace` and `cup`. `__ooga.race` exposes `phase`, `selection`,
`startRace`, `toGarage`, `pause`, `finishRace`, `cam` and `simulate(seconds)`, which runs
substeps without frames; `__ooga.racers.autopilot = true` lets the AI drive the visitor.

URL flags: `?debug=1` exposes `window.__ooga` with the scene, game, renderer, input,
`stats()`, `timing`, `frameInterval`, and in the hub `island`, `mouths`, `camera`;
`?scene=<id>` opens that scene (unknown ids land on the hub); `?nosim=1` silences the
simulator; `?canvas2d=1` forces the fallback; `?yaw=` sets the starting camera angle;
`?debug=1&bananas=` overrides the initial pile level for visual testing; `?debug=1&hour=`
pins the solar clock, `?debug=1&day=` selects a day of year, bounded `?debug=1&latitude=`
changes the test latitude, and `?debug=1&daylen=` runs a day in that many seconds (from the
pinned hour when both are given). `__ooga.daylight` exposes the bounded celestial state,
`__ooga.setHour(h, daylen, day)` resets it, and `__ooga.renderOpts`, `lamps`, `fireSeats`,
`critters` and `pilot` expose the rest. Counts clamp to
`pile.MAX_BANANAS` (ten million). Loot ships off behind `LOOT_DEFAULT` in `director.js`;
`?debug=1&loot=1` turns it on for a page, which is how the loot checks run.

## Testing

`npm test` builds `oogaboogaland.html` and runs `test/run.mjs` in headless Chrome over
the DevTools protocol. Every check opens the page with `?debug=1&nosim=1&hour=12` (noon, unless the check asks for
another hour) and asserts on real interaction: drags at projected positions, clicks, keys, DOM state, a clean console.
Lab checks add `scene=lab`, rally checks `scene=race` (they drive the physics through
`race.simulate` and `racers.setInput`, isolating the visitor with the `isolate` helper);
hub checks open the page without it and hold keys through `hold`. New behaviour needs a check. Follow the existing shape: one `withPage` block,
`record(name, ok, detail)` per assertion, no fixed sleeps where waiting on
`renderedFrames` is possible. A failure prints `FAIL` with its detail, so
`npm test 2>&1 | grep -E '^FAIL|checks passed'` is enough to read a result.

The `soak` blocks settle the memory question from `stats()`,
`Memory.getDOMCounters` and the heap after a forced GC (code and non-code split; the
bars apply to the non-code heap). Scene cycles: ten hub / lab round trips leave node,
target, tween, DOM, listener and GPU record counts identical and the heap within 10%.
GPU residency: each scene after visiting the other holds only its own geometry.
Donations, per scene: sixty tips in fifteen seconds with every crate opened end with
crates, particles and tweens at zero, nodes and targets back to base plus the trimmed
pool and what the crew built, GPU records bounded, heap within 15%. The rally has its own
turn: six hub/race round trips and sixty tips mid-race. Anything a scene creates per visit
must come back to base there.

Profile before optimizing. Boot phases are `performance.mark`s readable from
`__ooga.timing`.

## Privacy

No analytics, no external requests, no personal data. Visitor handle and message stay in
localStorage. The roster lists public contributor handles only. Every deliberate likeness
lives in the `LIKENESS` table in `contributors.js`, one line per person, opt-in and
removable; all other looks are hashed from the handle. No personal details about real
people anywhere else. Test scripts must not embed absolute paths, user names, or machine
names.

## Before you finish

1. `npm test` passes with a clean console.
2. No new per-frame allocations, no new unbounded arrays, nothing left registered or on
   the GPU after removal.
3. Both renderers still expose the same surface if you touched one.
4. A scene you touched still keeps the leave contract and the soak checks stay green.
5. Keys, phone layout, and the built `oogaboogaland.html` still work in both scenes.
6. Your change is the smallest that does the job, and it reads like the code around it.
