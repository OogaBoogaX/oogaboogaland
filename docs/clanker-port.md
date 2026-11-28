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
| Lab coat | EntropyLab (hub lab mouth) | `labTorsoVox` :323, `labArmVox` :338, `labCoatClip` :432 | recoloured voxels, clipped at the mouth | painted: coat over chest and belly, the chest open, a collar, sleeves to a cuff at the wrist |
| B.C.A. suits x3 | B.C.A. office | `SUITS` :346, `suitTorsoVox` :360, `suitArmVox` :371, `suitLegVox` :372, `suitSeatVox` :375, `suitClip` :455 | recoloured voxels, clipped at the veil; seated legs | painted: the jacket down over the hips (`HEM`), trousers, shoes, and the cuffs, ending just before the thumb; wrapped on, a sports jacket's front: the shirt's V to a point at the bottom of the chest, notched lapels faced a shade lighter crossing over the button (`front`), and a tie and knot ending in a point above the belly (`tie`). The belt (`belt`) is only for a suit with its jacket off (no seated legs yet) |
| Hard hat | Lightning Factory (x0.72) | factory-scene-models.js:2219, scene-factory.js:1647 | rigid, on the head | seated on the new head (`hat`) |
| Hard hat and hi-vis vest | Lightning Jet Hangar (x0.86) | hangar-models.js:2771, scene-hangar.js:1344 | rigid box vest | hat seated; the vest painted (navy, two yellow bands) |
| Staff hats x4, vests x5, props x5 | Ooga Arcade staff (x0.72), six roles (scene-arcade.js:1435) | arcade-scene-models.js `staffHat` :4603, `staffVest` :4709, `staffProp` :4762, `PROP_GRIP` scene-arcade.js:1473 | rigid, modelled to the old box torso | hats seated; short sleeves painted in the uniform's red, cut square across the upper arm at one of its rings with gold piping (`staff`); vests shrink-wrapped onto the new torso (`wrap`), aprons and tails hanging off the belly, and what came down on the upper arm left off but the gold shoulder boards and epaulettes; tools through the fist's hole, pointing ahead; the tray level between both fists, elbows bent |
| Rally repair mechanic | Arcade service bay (x0.65) | scene-arcade.js:399 | staff hat 2, vest 2, a held driver, a fixed pose | not yet (same pieces as the mechanic, plus its pose) |
| Ringmaster's hat | air hockey bot (x0.72) | hockey-players.js:138 | rigid | seated on the new head |
| Poker dealer jacket | Ember Den (x1.16) | poker-models.js:350 | rigid boxes | painted: jacket, shirt front, gold tie, sleeves, cuffs |
| Clank arm and red visor | Block Frenzy, Clanktown (x1.35) | block-models.js:1542 | rigid, hand-placed against the old voxels | refitted to the forearm and the head |
| Lab flask | EntropyLab hub workers | agent.js:385, `holdLabItem` :1350 | held in the left hand at the old fist | hanging by its neck from the new left fist |
| Ghost brutes | ghost hunt arena (x1.25) | ghost-game.js:346 | glyph form, a hit target per part | glyph form |
| NPC ghost look, burn tints, breathing, highlight | hub | npc-ghosts.js, scene-hub.js:10383, clankers.js:6265, scene-hub.js:6419 | materials and scales on the parts | carry over to whatever parts the new rig has |

The new versions are fitted in `dress.js`:

- **Painted outfits** recolour copies of the body's own meshes by region rules (chest, belly, arm, forearm, leg, shin, foot), cached by geometry and outfit.
- **Hats** (`hat`) sit on the new head where it narrows above the ears, scaled to its width there and centred front to back.
- **Vests** modelled on the old box torso (`wrap`) are split finely and shrink-wrapped onto the new torso's surface, standing as far off it as they stood off the old one (a little over half), in the belly's frame. What lay over the old torso's top comes down onto the shoulders, and cloth below the waist hangs straight down off the widest of the body above it. What would come down on the upper arm is left off (the sleeve is painted there, and the arm swings apart from the belly), except gold.
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
   - **Script tag:** add the model to the page's script order.
   - **Load cost:** build geometry lazily, per form and outfit, on first use, not every set at load.
   - **Pose:** make `pose` allocate nothing per frame (it allocates arrays now).
   - **Page weight:** check it (the model is 250 KB of source, against agent.js's 121 KB).
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
