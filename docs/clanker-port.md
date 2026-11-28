# Porting the clankers to the new rig

The clanker gorillas are being rebuilt on a new rig, worked out in `untracked/clanker-collab` (its viewer, `viewer.html`, is the "clanker studio"). This document is the plan for replacing every current gorilla (`BL.agent`, `src/js/agent.js`) with it. It also catalogs what the current gorillas wear and do, all of which the new rig has to carry over.

## What is here so far

- `scripts/clanker/rig.mjs` writes `src/js/clanker-model.js` (`BL.clankerModel`: `sets`, `rig(set, form)`, `pose(r, t, gait, act)`). It is the collab's `blocks/rig2.mjs` as of its round b200, unchanged apart from its paths and export name, and it writes the same model byte for byte. Its sources sit beside it:
  - the posed parts, `blocks/*.txt`, one character a block on the six-view sheet's grid;
  - `palette.mjs`, `finish.mjs` and `pec-map.json`.

  Every tuning value is a default that the environment can still override. Run `node scripts/clanker/rig.mjs` after changing any of them.
- `scripts/clanker/catalog/` renders each current outfit beside its new version:
  - `render.mjs` writes to the gitignored `untracked/clanker-outfits/`;
  - `outfits.mjs` is the catalog;
  - `dress.js` is the first pass at dressing the new body.
- `src/js/clanker-model.js` is not loaded by the page yet. Nothing in the game changes until the steps below land.

## The new rig, against the current one

- **Shape.** The body is a set of smooth lofted parts with a welded torso, not voxel boxes:
  - hips, belly, chest, head;
  - upper arms, forearms with their fists, thighs, shins, feet.

  The torso is one belly piece chosen from 41, one for each step between all fours and upright, plus a live sleeve that joins it to the chest. Joints turn by quaternions.
- **Forms.** It has the fur ("ape") and glyph ("code") forms. The glyph form has animated falling-code rain.
- **Poses.** One `pose(r, t, gait, act)` covers:
  - the stance, from all fours (`t` 0) to upright (1), and walking and running gaits;
  - the air (toes down), landing, climbing (with a lean into recessed rock), sitting and lying;
  - the haul over an edge (`act.mantleLeg`, `act.mantleKnee`).
- **Size.** Upright it stands 2.53 m. The current gorilla stands 2.42 m, so scaling the new one by 0.956 matches it. The catalog renders it at that scale.
- **Climbing.** In the viewer the climbing works as follows:
  - it only takes hold of large vertical walls;
  - it rises into the climb before reaching the wall and leans past a lip;
  - the haul over an edge is driven by W and S both ways, with its fists on the top;
  - walking off an edge climbs down, and running off jumps;
  - it grabs a wall from a jump or a fall.

  All of that lives in `viewer.html` now. It has to move into `clanker-play.js` and `clankers.js`.

## Outfits (all made by `BL.agent.create`, agent.js:501)

| Outfit | Where | Built by | Kind | New version (catalog pass 1) |
|---|---|---|---|---|
| Fur form | everywhere | agent.js:410 | rig palette | the rig's own `ape` set |
| Glyph form | Orbit, Drop, Rally, ghost hunt (x1.25), rage, sleep beam | agent.js:411 | rig palette | the rig's own `code` set |
| Lab coat | EntropyLab (hub lab mouth) | `labTorsoVox` :323, `labArmVox` :338, `labCoatClip` :432 | recoloured voxels, clipped at the mouth | a clean-room outfit: the coat painted closed over chest and belly, sleeves to a cuff just before the thumb, white trousers; a white hood painted over the head, open at the face, with a curved clear visor in the game's glass (`visor`); wrapped on, a zipper down the middle of the front from the collar to the hem (`zipper`, following the body under the belly too) and an ID badge on the right of the chest (`labKit`, a rigid piece) |
| B.C.A. suits x3 | B.C.A. office | `SUITS` :346, `suitTorsoVox` :360, `suitArmVox` :371, `suitLegVox` :372, `suitSeatVox` :375, `suitClip` :455 | recoloured voxels, clipped at the veil; seated legs | painted: the jacket down over the hips (`HEM`), trousers, shoes, and the cuffs, ending just before the thumb; wrapped on, a sports jacket's front: the shirt's V to a point at the bottom of the chest, notched lapels faced a shade lighter crossing over the button (`front`), and a tie and knot ending in a point above the belly (`tie`). The belt (`belt`) is only for a suit with its jacket off (no seated legs yet) |
| Hard hat | Lightning Factory (x0.72) | factory-scene-models.js:2219, scene-factory.js:1647 | rigid, on the head | seated on the new head (`hat`) |
| Hard hat and hi-vis vest | Lightning Jet Hangar (x0.86) | hangar-models.js:2771, scene-hangar.js:1344 | rigid box vest | hat seated; the vest painted (navy, two yellow bands) |
| Staff hats x4, vests x5, props x5 | Ooga Arcade staff (x0.72), six roles (scene-arcade.js:1435) | arcade-scene-models.js `staffHat` :4603, `staffVest` :4709, `staffProp` :4762, `PROP_GRIP` scene-arcade.js:1473 | rigid, modelled to the old box torso | hats seated; the coat one piece all round the upper body, painted in the uniform's red, with short sleeves cut square across the upper arm at one of its rings with gold piping (`staff`), a gold band round its hem over the seat at the back (`belt`, no buckle), red trousers to match, the vests' own red back and side panels, shoulder yokes, back trim and collar left off, the token on the back and the tool belt kept, and what lay on the panels brought down onto the body (`drop`, `panels`); vests shrink-wrapped onto the new torso (`wrap`), aprons and tails hanging off the belly, and what came down on the upper arm left off but the gold shoulder boards and epaulettes; tools through the fist's hole, pointing ahead; the tray level between both fists, elbows bent |
| Rally repair mechanic | Arcade service bay (x0.65) | scene-arcade.js:399 | staff hat 2, vest 2, a held driver, a fixed pose | not yet (same pieces as the mechanic, plus its pose) |
| Ringmaster's hat | air hockey bot (x0.72) | hockey-players.js:138 | rigid | seated on the new head |
| Poker dealer jacket | Ember Den (x1.16) | poker-models.js:350 | rigid boxes | painted: jacket, shirt front, gold tie, sleeves, cuffs |
| Clank arm and red visor | Block Frenzy, Clanktown (x1.35) | block-models.js:1542 | rigid, hand-placed against the old voxels | refitted to the forearm and the head |
| Lab flask | EntropyLab hub workers | agent.js:385, `holdLabItem` :1350 | held in the left hand at the old fist; the hub's bench also has beakers and dice (hub-models.js `labBeaker`, `labDie`) | carried upright in the left fist with the elbow bent, so the fist's hole stands upright: the flask by its neck through it, the beaker by its rim; the die clasped under the hanging fist (`labCarry`, `labDie`) |
| Ghost brutes | ghost hunt arena (x1.25) | ghost-game.js:346 | glyph form, a hit target per part | glyph form |
| NPC ghost look, burn tints, breathing, highlight | hub | npc-ghosts.js, scene-hub.js:10383, clankers.js:6265, scene-hub.js:6419 | materials and scales on the parts | carry over to whatever parts the new rig has |

The new versions are fitted in `dress.js`:

- **Painted outfits** recolour copies of the body's own meshes by region rules (chest, belly, arm, forearm, leg, shin, foot), cached by geometry and outfit.
- **Hats** (`hat`) are fitted: each hat's lowest edge sits just above the brow (`BROW`), its crown is centred over the head there front to back, and it takes the smallest size that still encloses the head. A geometric check (`encloses`) makes sure no point of the head pokes through the hat's wall or crown, with 1 cm to spare.
- **Vests** modelled on the old box torso (`wrap`) are split finely and shrink-wrapped onto the new torso's surface, standing as far off it as they stood off the old one (a little over half), in the belly's frame. What lay over the old torso's top comes down onto the shoulders, and cloth below the old vest's hem (aprons, tails) hangs straight down off the widest of the body above it; above the hem it follows the body. What would come down on the upper arm is left off (the sleeve is painted there, and the arm swings apart from the belly), except gold. Two kinds of piece are handled apart. A rigid one (the round token on the back; the lab badge) is placed by its middle and scaled the same every way, so a circle stays a circle. One worn under the rest (the server's apron skirt) lies on the body with only its own layers' depths, so it comes out from under the vest's hem, curves round the belly and falls straight down.
- **The suit belt** (`belt`), for a suit with its jacket off (a buttoned jacket covers it), is a band of one height round the hips, tilted from under the belly in front (`WAIST`) to over the top of the seat behind (`WAIST_BACK`), following the body's and the thighs' outline, with a brass buckle.
- **Held things** follow the new fist: its middle is at y -0.66, z -0.03 in the forearm's frame, and its hole runs along x, which hanging points ahead on the right forearm and behind on the left. A tool's handle runs through the hole. The ticket roll sits in the grip, the flask hangs by its neck, and the tray is held level between both fists with the elbows bent (the game's carry pose will do this).
- **Other rigid pieces** keep their place on the matching new part, mapped from the old part's box to the new one.

Close-ups for checking them: `node scripts/clanker/catalog/hands.mjs [hand|head|torso] [names...]` writes `hands.png`, `heads.png` or `torsos.png`, old and new from the side and the front.

Still to do: the seated suit legs, and every hat, prop and vest in each pose its scene uses (the vests are wrapped on the standing torso, and the chest moves on the belly).

## Places (one `create` each; scale)

- **Hub:** one companion per Ooga (clankers.js:2126, managed, coat and suit clips), the driven body and remote players.
- **EntropyLab:** the lab scene's summoned Agent (scene-lab.js:207).
- **B.C.A.:** the hub's companions in their suits.
- **Factory** (scene-factory.js:1646, x0.72), **Hangar** (scene-hangar.js:1343, x0.86).
- **Arcade:**
  - staff (scene-arcade.js:1687, x0.72);
  - the Rally mechanic (:399, x0.65);
  - the air hockey bot (hockey-players.js:138, x0.72).
- **Ghost hunt** (ghost-game.js:346, x1.25), **Block Frenzy** (scene-block.js:2710, x1.35), **Ember Den** (poker-models.js:193, x1.16).
- **Orbit** (scene-orbit.js:1911), **Drop** (scene-drop.js:916), **Rally** (scene-race.js:790): the glyph form, unmanaged.

## Transitions to keep

- **EntropyLab lab coat:**
  - **Setup:** the coat is set by a plane at the lab mouth, 0.5 m in, the depth of the veil (`labCoatClip`).
  - **Crossing:** the plain torso and arms are clipped to the island's side and coat overlays to the cave's (`clipPlane`; the shader discards `dot(clip, world) > 0`). The coat appears exactly where the gorilla has crossed (`coatSplit`, agent.js:1219).
  - **Inside:** the full coat is swapped in and the gorilla goes upright (`state.lab`).
  - **New rig:** it needs the same clipped plain and outfit copies of each part. Its welded belly pieces and live sleeve count as parts.
- **B.C.A. suit:** the same at the office veil, over the legs too. It rises upright over 1.4 m past the veil (`officeRise`), with seated legs at a desk.
- **Sleep beam:**
  - **Look:** it flips to the glyph form and `matrixNative` for the beam, then back (`sleepBeamLook`, clankers.js:6560).
  - **Streams:** the glyph streams measure the posed body (sleep-beam.js).
- **Status beams** (npc-status-beams.js), **rage** (clanker-rage.js:688), **reveal** (the lab scene), **swim** (`motion.swim`, a dog paddle).

## Coverage: everything the current gorillas do

A survey of every `BL.agent` call site and every movement the old rig's `poseManaged` takes (`motion.*`). Each item needs a counterpart on the new rig before this is ready for review. Items the steps below already name are left out.

### Grabbing, dragging and throwing an Ooga
- **The driven gorilla** (`clanker-play.js`: hold the grab key near an Ooga, drag it, release to drop, the throw meter; `grabOoga`, `releaseOoga`, `motion.dragging`, `motion.throwProgress`).
- **Block Frenzy's gorillas** drag an Ooga by the feet to the edge and throw it off (`block-sim.js`, `scene-block.js`). The dragged Ooga is posed from the gorilla's hand (scene-block.js:1899), so it must read the new fist.
- **Banana rage** grabs and throws (`clanker-rage.js`).
- **The new rig needs:**
  - a grip: ankles held in the fist, through its hole;
  - a drag gait: walking with the arm back and the Ooga trailing;
  - a throw: a wind-up and release that `throwProgress` drives.

### Actions and poses the new rig has no form for yet
- **Ground pound:** a charge, a slam and the triple-tap combo (`pound`, `poundCharge`, `BL.agent.POUND`, `TRIPLE`).
- **Other moves:** chest beat (`beat`), the rage smash (`smash`, `cancelSmash`) and the poke reaction (`poke`).
- **Eating:** feeding with the mouth opening (`feed`, `mouth`, `openingSettle`).
- **Grooming** (`groom`, `groomPhase`, `groomSide`) and **rolling** (`roll`, `rollAngle`, `rollSide`).
- **Jumping:** take-off and landing phases (`takeoff`, `landing`).
- **Swimming:** the dog paddle (`swim`).
- **Sitting and lying:**
  - sitting with a look and a shift (`sitLook`, `sitShift`), and the B.C.A. desk seat with its swivel chair;
  - lying in the 20 HQ and basement beds, and the sleep beam's landing check against a bed's pose.
- **Lab work:** bench reach, squeeze, die roll, run-in, the touch screen (`labWork`, `labReach`, `labSqueeze`, `labRoll`, `labRunIn`, `labTouchArm`) and `workExit`.
- **Office work:** typing, the abacus and looking about (`officeWork`, `officeHands`, `officeLook`, `officePhase`).
- **Gaits:** the knuckle, upright and run gaits mapped onto `pose`'s gait (`walkGait`, `walkPhase`, `BL.agent.GAITS`), and `supportOffset`.

### Scenes that pose the old parts directly
These write rotations on `chest` and `parts.*` themselves, so each needs rewriting for the new rig's quaternions and extra parts:
- **Ooga Arcade:**
  - the staff's job poses (sweep, stock, claw, scoop, hand, dust, fan, rail and others, scene-arcade.js);
  - the Rally repair mechanic;
  - the air hockey bot's mallet reach (hockey-players.js).
- **Lightning Jet Hangar:**
  - the room-fire operator with the extinguisher (hangar-room-fire.js);
  - the meltdown worker pounding the Jet and brawling (hangar-meltdown.js);
  - the crew seated at desks, and the loft-window figures clipped to their windows.
- **Ember Den, the poker room:**
  - the dealer dealing (poker-models.js);
  - the walking and seated crowd (poker-crowd.js, unmanaged, `update`);
  - the table players (poker-games.js) and the terrace server (poker-terrace.js).
- **The Agent:**
  - the EntropyLab scene's summoned Agent and its reveal (scene-lab.js);
  - Right Shift+A Agent play (director.js, `BL.agent.createPlay`, `agentView`, `agentControls`, `agentHandoff`).
- **Ghost hunt brutes:** the glyph form, the leap and slam, and a hit target per part (ghost-game.js).
- **Cameos:** the unmanaged glyph-form gorillas in Orbit, Drop and Rally.

### Other players and the network
- **Remote players:** other players see a driven gorilla from `pose.g = [flags, speed, stride, climb, side, swim]` (worker/src/protocol.js, room.js, remote-players.js).
  - The new climbing (grab, lean past a lip, the haul over a top) and dragging or throwing need fields there.
  - That is a protocol change, so the Worker has to deploy first, and the change must stay readable by older pages.
- **npc-sync:** the host's frames carry the gorillas' plan and hit events (`npc-sync.js`), and followers replay them on their own rigs.
- **island-world:** the island-world server GameHost is planned to run the gorillas next; its collision sizes have to match the new body.

### Looks and effects layered on the rig
- **Ghost look:** the NPC ghost look's tinted twins, one per source geometry (`npc-ghosts.js`). The new rig swaps meshes: 41 welds, the live sleeve, glyph-rain layers. Each needs a twin, or a material path.
- **Tints and highlight:** burn tints, the hover highlight and breathing (`chest.scale.y`, which the chest's weld swap affects).
- **Beams:** sleep and status beams measure the posed body (sleep-beam.js, npc-status-beams.js); the rage glyph look too.
- **Reflections:** lower-tier reflections keep only `characterPart` geometry, so every new mesh, worn piece and wrapped outfit must be marked.
- **Visibility:** the outline through walls and the camera-cover outline of a hidden walker need the driven gorilla's meshes. In first person the head hides, with the near fade.
- **Picking and targets:** hovering, tooltips and shots use the gorilla's parts as targets (`bodyTarget`, the head as the eye, the left hand as a grip).
- **Companion styles:** the hub gives each Ooga's companion its style (remote-players.js:115, clankers.js:2152). Check what that sets on the old rig.
- **Sounds:** sounds timed to the old animation (the pound's impact and others) must follow the new rig's timings.

### Size, collision and behaviour
- **Sizes and envelopes:** `BL.agent.footprint` and its compact profiles, `bodyRadius`, `bodyHeight`, `bodyMinY`, `bodyHull`, `envelope`, `climbCenter`, `climbPoseClear`, `walkPoseClear`, `labPoseClear` and `walkSupportAt`, all from the new body.
- **Climbing rules change:** the old gorillas climb more than vertical walls. The new rules (large vertical walls only, the W and S haul, climbing down a walk-off, jumping a run-off) change the routes NPC gorillas plan: bed paths, cliffs, the mirror cave's entry (the "mirror clanker" check).
- **Outfits in motion:**
  - The wrapped vests, ties, badges and visor are fitted to the standing torso, but the chest moves on the belly. Each needs splitting between the chest and the belly, or following the weld.
  - The lab coat and suit clips at the veils must cover the welded torso, the live sleeve and the wrapped pieces.

### Performance
- **Pose:** 250 to 350 µs a call, allocating. It needs to be allocation-free and about ten times faster, and must work with the hub's settled-pose rate (`animationInterval`).
- **Faces:** 8,848 visible faces a gorilla. Distance detail levels are needed for the hub's twenty or so, and the Canvas 2D fallback has to cope.
- **Glyph form:** the code rain re-picks a frame each tick.
- **Build slices:** the first build of a form has a 79 ms slice (one body part) to split.

### Tests and docs
- **The suite:** about 600 suite lines touch gorillas: bed landings, passive support, the mirror clanker, lab flask pickup, gorilla controls. They must pass on the new rig without loosening any check.
- **AGENTS.md:** update every row that describes the old rig (agent.js, clankers.js, clanker-play.js, sleep-beam.js, npc-status-beams.js, npc-ghosts.js and the scenes above).

## The interface the rest of the game uses

These come from `BL.agent` and each rig: `root`, `parts.{head, torso, armR, armL, legR, legL}`, `hips`, `chest`, and these functions and fields:

- **Posing and moving:** `poseManaged`, `update`, `setForm`, `form`, `pace`, `walk`, `place`, `poke`, `jump`, `onIdle`, `heading`, `driven`.
- **Lab items:** `holdLabItem`, `releaseLabItem`, `labFlask`, `labPickupBench`.
- **Body sizes:** `bodyRadius`, `bodyHeight`, `bodyMinY`, `*Compact`, `torsoRadius`.
- **Clearance and climbing:** `bodyHull`, `climbCenter`, `climbPoseClear`, `walkPoseClear`, `walkSupportAt`, `labPoseClear`.
- **Mouth and targets:** `mouth`, `bodyTarget`, `envelope`.
- **Actions:** `feed`, `pound`, `beat`, `cancelSmash`.
- **Lifetime:** `liveGeometry`, `dispose`.
- **Statics:** `BL.agent.footprint`, `.torso`, `.labCoatClip`, `.suitClip` and the lab constants.

Consumers set some of these directly:

- **Part rotations:** scene-arcade.js, hangar-room-fire.js, hangar-meltdown.js, scene-poker.js and hockey-players.js write `chest` and `parts.*` rotations.
- **Breathing:** clankers.js scales `chest.scale.y`.
- **Hands, eyes and hits:** the hub reads head bounds as the eye, the left hand as a grip, and parts as hit targets.

The new rig has more parts (forearm, shin and foot apart from the upper arm and thigh). It needs either a `parts` view with the old names or updated consumers.

## Steps

1. **Load it:**
   - **Script tag:** done; it loads right after `agent.js`.
   - **Load cost:** done. Nothing is built at load (3 ms to evaluate, no heap), and the page boots with a clean console. A form's parts and its 41 torso welds are built the first time they are asked for. `prepareSteps(form, slice)` builds them for `BL.buildTasks` in 16 slices. Its worst slice is 79 ms, one body part, so that part still wants splitting. A rig of a prepared form takes 2 ms; an unprepared one takes about 700 ms.
   - **Pose:** make `pose` allocate nothing per frame and cost far less. It allocates arrays now and takes 250 µs standing, 350 µs walking. The hub poses about twenty gorillas a frame, so this matters most.
   - **Page weight:** 251 KB of source, 72 KB gzipped, against `agent.js`'s 121 KB and 33 KB. Removing `agent.js` brings the net to about 39 KB gzipped.
2. **A rig adapter:** give the new rig the interface above, under `BL.agent` or behind it, so the call sites keep working:
   - managed and unmanaged rigs;
   - collision shapes and body sizes from the new body;
   - the old gaits mapped onto `pose`.
3. **Outfits:** move pass 1 into the game, as painted outfit sets and refitted pieces. Then:
   - split each wrapped vest at the waist between the chest and the belly, so it follows the chest's pose;
   - make the seated suit legs;
   - look over every hat, prop and visor in every pose its scene uses.
4. **Transitions:**
   - clipped copies for the lab coat and the suits, with the welded torso and sleeve included;
   - the sleep and status beams, rage, reveal and the swim pose.
5. **Climbing and movement:** move the viewer's climbing, haul and grab logic into `clanker-play.js` and `clankers.js`, as clankers' behaviour.
6. **Every place:** switch each of the places above to the new rig and check each in play:
   - the hub, lab mouth and B.C.A. veil;
   - the Factory and Hangar crews;
   - the Arcade staff, mechanic and hockey bot;
   - the ghost hunt, Block Frenzy and Ember Den;
   - Orbit, Drop and Rally.
7. **Remove** the old rig's code, update `AGENTS.md`, and run the suite.
