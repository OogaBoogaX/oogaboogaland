// Ooga Raid: the side-on run-and-gun, and only a view of the rules in `raid-campaign.js` and `raid-sim.js`. A run is
// one campaign (`raidCampaign.create`) over the built stages, which plays them in order one sim at a time; each frame
// the scene feeds the held buttons in (`setInput` for each player), ticks the campaign on its own fixed step and draws
// the current sim's state out: the stage (its sectors and backdrop, or a room's shell, from its art; see The art), each
// player's Ooga posed by `raid-crew.js`, and fixed pools of nodes for the bullets and the enemy slots wearing the Fiat
// Legion's looks. The DOM HUD (`raid-hud.js`) shows each player's lives and score and the shot, the title card holds
// the run until it closes (keys 1 and 2, or its buttons, pick one or two players), a stage card names the next stage
// through the campaign's transition, and the results card ends the run. A boss bar shows a boss main's hit points left
// while one stands. P pauses and resumes the campaign, and Escape opens the pause card (Resume, or Exit, which leaves and
// settles the run); while paused no button reaches the sim. The sim keeps no events, so the sound (`raid-audio.js`)
// comes from comparing its state with the last frame's, kept in typed arrays made in enter (the terrain's, a stage's
// lifts, crumbling spans and a room's tripwires, made as each stage is placed), and the music follows the campaign's
// phase (`musicFor`). Touch plays player 1 with the move stick
// (left and right run, up and down aim), Jump! and a held Fire; the nav's Pause button pauses on any device.
//
// Weight, the view's alone, so the sim stays exact: a boss's part breaking and a boss's fall hold the campaign's step a
// moment (a hitstop, on displayed frames only, both players alike), they and a big machine's blast shake the play
// inside the steady frame and an Ooga going down shakes it lightly; a boss's carved name stands on a card as it first
// enters a stage, and each pickup (a weapon, rapid fire, the barrier) is called out big with a jingle (`calls`, read from
// the state, so the debug `simulate` shows them too).
//
// Players. Player 1 plays A D W S, Space jumps and J (or a click) fires; alone, the arrow keys move player 1 too. With
// two, the arrows are player 2's, comma jumps and full stop fires. Player 2 is the roster's next Ooga after player 1's.
// Through a transition or the ending no button reaches the sim, and every key held is let go as the next stage starts,
// so nothing pressed under the stage card leaks into it.
//
// Gamepads. Only standard-mapping pads (`mapping === "standard"`) are followed; any other is never added, polled or
// guessed at. The left stick (once it leans PAD_DEAD, then 8 ways) or the d-pad runs and aims, A jumps, B or X fires,
// Start pauses as P does (`padBits`, a pure map from a pad's axes and buttons to the sim's bits). Alone, every pad
// drives player 1 beside the keys; with two, the first pad connected drives player 1 and the second player 2, or a lone
// pad player 2 (player 1 keeps the keys). On the title card the d-pad's left and right mark 1 Player or 2 Players (the
// card shows the mark, `markPlayers`; the stick marks nothing) and A or Start plays the players marked, as a menu does:
// a mark alone never picks, so the Konami code on the d-pad can never pick players, and a left or right the code takes
// leaves the mark where it was. Paused, A or Start resumes; at game over A or a fire button continues as Enter does once
// OVER_HOLD has passed, and on the results card A starts again. The press that makes a pad appear (Chrome shows a pad
// only once a button is pressed) counts as a press: a pad announced with a button held gives that button's press once.
// A pad's buttons and stick held through a card, a release (`releaseAll`) or a pad joining or leaving are kept from the
// sim until let go, as keys are. The pads are read
// once a frame through `navigator.getGamepads()` only while one is connected (a `gamepadconnected` seen, or one already
// connected as the visit begins, which enter asks once); with none, no call is made. Some browsers return a fresh array
// from each call: that allocation is the browser's, and only while a pad is connected. Everything the scene does with
// it allocates nothing (typed arrays in pad order, no destructuring or closures). The listeners are added in enter and
// removed in leave. While a pad is connected the title card's players line and the pause card's help name the pads
// (`data-pad`), and so do game over's notice and the results card's line.
//
// Who plays. On a site with accounts (`BL.net.state.backend`) only a signed-in visitor, who plays their own Ooga (the
// cast's, or the temporary one the site gave them) as player 1; a signed-out visitor, or one whose account look failed
// (the page waits for it before any scene enters, so unresolved means it will not come), is told why and sent back home
// after a beat, and so is one who signs out mid-run. With no backend the Ooga that walked in plays, else the arcade's
// rule (the first the visitor may drive). The run is local: nothing goes to the room. A run is settled once, as it
// ends: at the campaign's end, which the card shows, or as it is left once started with a score or a stage cleared (the
// campaign loops, so a cleared run otherwise never ends). Settling records its best (`game.recordRaid`: the higher
// player's score, the furthest of `STAGES` reached and whether a loop was completed, each kept on its own) and pays its
// tickets (`raidSim.tickets`).
//
// The camera looks along -z at the play plane z = 0 from a fixed EYE_Z with `orthoMix` 1, so the plane is truly
// flat on both renderers and only `orthoHeight` sets the scale; the fog (12 to 70 from the eye) then reaches the
// backdrops and never the plane, on every display. The 8 by 7 screen (y 0 to 7) is fitted below the site header in
// whichever of two layouts shows it larger with the HUD strip clear of it: wide, the screen within the height under
// the header and the strip's two panels in the margins beside it (SIDE_PX each); tall, the screen across the width at
// the top and the strip in a row under it (ROW_PX, and ROW2_PX more for player 2's line), leaving the space below for
// touch controls. `fit` writes its choice to `#raid` (`data-raid-fit`, `--raid-hud-top`, and `--raid-card-top` for the
// stage card), which the stylesheet lays the strip out by. A frame at z = 3 covers everything outside the screen, the
// sky is painted as its own far layer, and the hills and peaks behind slide at their own rates: a layer's x is
// `camX * (1 - rate)`, its y `camY * (1 - rate)`.
//
// Stage kinds. A side stage follows `camX`; a climb follows `camY` with `camX` fixed at 0, its screens stacked from the
// bottom. A rooms stage never scrolls: the screen looks into the room through the sim's own projection (`projectX`,
// `projectY`), the shell (floor, side walls, back wall with its doors, the barrier while it stands) drawn flat behind
// everything, the room's front edge over it, and each enemy and bullet drawn at its projected point, scaled by
// `1 - ROOM.SHRINK * z` and set back DEPTH_Z a unit of depth so the deeper draw behind; nothing casts a shadow there.
// The Oogas walk the front line at depth 0, where the projection is the identity. Through the advance the shell grows
// about the projection's vanishing point until the back wall stands where the front opening was, and the Oogas stride,
// so the walk into the next room plays out.
//
// The art. A stage's art is `BL.raidArt.stages[stage.id]`, which each art file fills (raid-art-bank.js the bank rooms,
// raid-art-tower.js the tower, raid-art-factory.js, -lake.js, -pass.js and -reserve.js stages 5 to 8; raid-art-field.js
// the field troops every side stage shares): its `sector(stage, screen)` (and `screens(stage)` on a climb) and
// `backdrop(stage)` for a side or climb stage, an optional `fog` colour, and the moving pieces the scene places every
// frame from the sim's clock: `lifts` and crumbling `planks`, the tower gale's flags (`gale`), `belts` (run by the art's
// `slide`, or each belt's `shift`), the tide's `water` (placed at `tideLevel` by the art's `bodyAt`, `surfaceAt` and
// `raftAt`), the pass's `weather` (its aurora and snow, by `gustPhase`), the reserve's `storm` (each zone's stir and its
// blizzard the live `gustDir` way) and `cylinders`; a climb boss's lines (`boss.cableAt`) and a side boss's dressing
// (`boss(stage)`: its tower, and the blaze shown while the Warden overloads); `roomShell(stage, i)` for a rooms stage,
// with its doors, barrier, front edge, live tripwires, drop hatches' lamps and the twin gauge's needle. A stage with none
// keeps raid-models' sectors and backdrop (stage 1, the debug test climb) or the scene's minimal shell (the debug test
// rooms). Each type's look is the stage art's `skins[NAME]`, else `BL.raidArt.types[NAME]`, else `raidModels.looks()`;
// a type with none throws, naming it, when a slot of it is first drawn (the stages' types are held to their looks by the
// unit tier), and a stage throws as it starts, naming the type, when one it places, or one those release (each def's
// `releases`, raid-enemies.js), has none (the `raid looks` step holds it there). A look gives `build`, and where it
// has them `shut`, `turned`, `turnedShut`, `pick(state, slot)` (the name of the look to wear, kept from the slot's fall
// through its fade), a swelling type's `swell(k)` (its node also grows
// with its box, as the sim grows it), an emplacement's `opening(k)` and `turnedOpening(k)`, its `OPENINGS` frames between
// shut and open (raid-models' `opening`), worn through its opening and back through its shutting, a set-back `screw()` that rides with the slot (and `zByAttr`, the depth of both by
// attr), the Leviathan's neck (`boss.neck[name]`), and a lob's look by its attr (a stage's `skins.LOB.build(attr)`, else
// `BL.raidArt.lobs[attr]`), turned along its heading. A printer winding up (raid-enemies.js's PRINTER_WIND) wears
// raid-models' `winding` frames faster and faster, shakes, glows its `heat` over it and puffs soot and embers from a pool
// (`drawSmoke`); a printer's shot (a SHOT whose attr is AIM_STEPS or more) wears raid-models' dollar `bill`, swaying and
// flipping as it flies, where every other shot wears its stage's coin. A boss's parts are ordinary slots. A stage's art is gathered once
// a page as it is first placed (under the stage card, for the next stage) and its nodes are made as it starts and
// dropped as it ends.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, raidSim, raidStages, raidCampaign, raidEnemies, raidModels, raidCrew, raidHud: raidHudMod, raidAudio, contributors, interact: interactMod, fx: fxMod, hud: hudMod, controls: controlsMod } = BL;
  const { hexToRgb } = BL.math;
  const { createNode, addChild, removeChild, createCamera, tweenCount, traverseVisible } = BL.scene;
  const { FIXED, IN, PSTATE, PHASE, ENEMY, FLAG, RULES, TUNE, PLAYERS, BULLETS, ENEMY_SLOTS, ROOM, ROOM_PHASE, WIRE, CRUMBLE, GUST, TIDE, projectX, projectY, wireState, liftTop, gustPhase, gustDir, tidePhase, tideLevel } = raidSim;
  const BOSS = RULES.TIER.BOSS;
  const { CELL, SCREEN_W, SCREEN_H, ROOM_W, ROOM_H, STAGES } = raidStages;
  const CPHASE = raidCampaign.PHASE;
  const SCREEN_X = SCREEN_W * CELL, SCREEN_Y = SCREEN_H * CELL;
  // The eye stays at EYE_Z whatever the fit: under orthoMix 1 its distance moves only the fog, never the picture.
  const EYE_Z = 7.5, FOG_NEAR = 12, FOG_FAR = 70;
  // Wide: the screen fills FIT_WIDE of the height under the header, keeping SIDE_PX either side for the strip's panels.
  // Tall: FIT_TALL of the width, TOP_GAP m below the header, keeping ROW_PX under it for the strip's row (ROW2_PX more
  // with two players, whose second line stands under the first).
  const FIT_WIDE = 0.94, FIT_TALL = 0.98, TOP_GAP = 0.15, SIDE_PX = 124, ROW_PX = 84, ROW2_PX = 44, HUD_GAP = 12;
  const FRAME_Z = 3, SLAB = 80, RIM = 0.12;
  // How far the move stick leans before it runs or aims: under sin 22.5 degrees, so a diagonal sets both.
  const STICK = 0.38;
  // Gamepads: the stick counts once it leans PAD_DEAD, then runs and aims 8 ways by STICK on its direction. A
  // standard pad's buttons by index. START_BIT and the d-pad's own left and right (PICK_ONE, PICK_TWO, which mark the
  // title card's choice, as the stick does not) are the scene's beside the sim's six (SIM_BITS); PADS the most pads
  // followed, in the order they connected; ALL_BITS every bit a pad sets, held as one through a card.
  const PAD_DEAD = 0.5, PAD_A = 0, PAD_B = 1, PAD_X = 2, PAD_START = 9, PAD_UP = 12, PAD_DOWN = 13, PAD_LEFT = 14, PAD_RIGHT = 15;
  const SIM_BITS = 63, START_BIT = 64, PICK_ONE = 128, PICK_TWO = 256, ALL_BITS = SIM_BITS | START_BIT | PICK_ONE | PICK_TWO, PADS = 4;
  // A pad button down: a GamepadButton's `pressed`, or a plain number over half (a snapshot's).
  const pressed = (buttons, i) => {
    const b = buttons[i];
    return b !== undefined && b !== null && (typeof b === "number" ? b > 0.5 : b.pressed === true);
  };
  // A standard pad's axes and buttons as the sim's input bits (and START_BIT for Start, PICK_ONE and PICK_TWO for the
  // d-pad's left and right). Pure and allocation-free.
  const padBits = (axes, buttons) => {
    let bits = 0;
    const x = axes.length > 0 ? axes[0] : 0, y = axes.length > 1 ? axes[1] : 0, m = Math.sqrt(x * x + y * y);
    if (m >= PAD_DEAD) {
      if (x / m > STICK) bits |= IN.RIGHT;
      else if (x / m < -STICK) bits |= IN.LEFT;
      if (y / m > STICK) bits |= IN.DOWN;
      else if (y / m < -STICK) bits |= IN.UP;
    }
    if (pressed(buttons, PAD_LEFT)) bits |= IN.LEFT | PICK_ONE;
    if (pressed(buttons, PAD_RIGHT)) bits |= IN.RIGHT | PICK_TWO;
    if (pressed(buttons, PAD_UP)) bits |= IN.UP;
    if (pressed(buttons, PAD_DOWN)) bits |= IN.DOWN;
    if (pressed(buttons, PAD_A)) bits |= IN.JUMP;
    if (pressed(buttons, PAD_B) || pressed(buttons, PAD_X)) bits |= IN.FIRE;
    if (pressed(buttons, PAD_START)) bits |= START_BIT;
    return bits;
  };
  // Game over takes presses after OVER_HOLD seconds. The stage card stands CARD_AT of the way down the screen (over a
  // room's name sign), its sting STING_AT seconds in (after the clear's jingle; the ending's card has its own tune). The
  // boss bar hangs over the screen's top edge, never over play: the fit keeps BOSS_PX clear between the header and the
  // screen for it (its 20 px and BOSS_GAP px to spare, half above and half below), BOSS_W of the screen's width. A stage
  // with no tune of its own plays the first of its kind's (KIND_MUSIC).
  const OVER_HOLD = 0.6, CARD_AT = 0.28, STING_AT = 1.45, BOSS_PX = 24, BOSS_GAP = 4, BOSS_W = 0.5;
  const KIND_MUSIC = { side: "shore", rooms: "counting", climb: "tower" };
  // Shaman's Secrets (see Secrets below): the Konami code as keys, as a standard pad's presses (B is either fire button)
  // and as touches on the title card (a swipe at least SWIPE_PX one way, a tap moving under TAP_PX, never on a button);
  // each secret that changes the rules by its raid-sim CHEAT bit.
  const SECRET_KEYS = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  const SECRET_PAD = [IN.UP, IN.UP, IN.DOWN, IN.DOWN, IN.LEFT, IN.RIGHT, IN.LEFT, IN.RIGHT, IN.FIRE, IN.JUMP];
  const SECRET_TOUCH = ["up", "up", "down", "down", "left", "right", "left", "right", "tap", "tap"];
  const SWIPE_PX = 30, TAP_PX = 12, SECRET_LR = 4;
  const SECRET_BITS = { lives: raidSim.CHEAT.LIVES, continues: raidSim.CHEAT.CONTINUES, spread: raidSim.CHEAT.SPREAD, rapid: raidSim.CHEAT.RAPID, slow: raidSim.CHEAT.SLOW, barrier: raidSim.CHEAT.BARRIER };
  // Within this of an Ooga, an item that vanishes was taken (an item left behind frees off the screen).
  const TAKE_X = 1, TAKE_Y = 1.6;
  // The seconds a refusal stands before the visitor is sent back.
  const REFUSE_BEAT = 1.6;
  const SIGN_IN = "Sign in to play Ooga Raid", UNCHECKED = "Couldn't check sign-in. Reload to try again.";
  // Rooms: how far back a unit of depth sets a node (the back wall's targets at -DEPTH_Z), where the shell stands behind
  // them all, its doors and barrier just in front of it, the projection's vanishing point, and how much the shell grows
  // through the advance (the back wall to the front opening). DOORS is the most doors a room may draw.
  const DEPTH_Z = 2, SHELL_Z = -2.6, VP_X = ROOM.MID, VP_Y = ROOM.RISE / ROOM.SHRINK, ADVANCE_GROW = 1 / (1 - ROOM.SHRINK) - 1, DOORS = 6;
  // A room's art beside the shell: its front edge at FRONT_Z (outside the view the advance grows, so it stays the view's
  // frame), its live tripwires at WIRE_Z (just in front of the walkers), the gauge's needle NEEDLE_Z in front of the
  // shell, swung NEEDLE_SWING toward the open twin. A searchlight's pool lies on the front line POOL_Z back, its beam
  // CONE_Z back (behind the back wall's targets, in front of the barrier and the shell). The most a room may hold of each.
  const FRONT_Z = 0.6, WIRE_Z = 0.05, NEEDLE_Z = 0.02, NEEDLE_SWING = 0.6, POOL_Z = -0.3, POOL_Y = 0.02, CONE_Z = -2.35;
  const WIRES = 4, LAMPS = 4, LIGHTS = 4, CABLES = 4;
  // A crumbling plank shakes PLANK_SHAKE m through its fuse; a bill-bat flaps FLAP times a second. A gust cycle's length
  // and how far into it the blow starts (the stage clock's, raid-terrain.js).
  const PLANK_SHAKE = 0.02, FLAP = 10, GUST_PERIOD = TUNE.GUST_CALM + TUNE.GUST_WARN + TUNE.GUST_BLOW, BLOW_AT = TUNE.GUST_CALM + TUNE.GUST_WARN;
  // A lob's kinds by attr (a clipboard, a shell, a shard).
  const LOB_KINDS = 3;

  const rgb01 = (hex) => hexToRgb(hex).map((c) => c / 255);
  // The fog and clear colour, a stage's art's `fog` where it gives one (a dark hall's own), else HORIZON's.
  const HORIZON = "#d4ebf2", HORIZON_RGB = new Float32Array(rgb01(HORIZON));
  const RENDER_OPTS = {
    clear: new Float32Array(rgb01(HORIZON)), fog: new Float32Array(rgb01(HORIZON)), fogNear: FOG_NEAR, fogFar: FOG_FAR,
    sky: new Float32Array(rgb01("#b8d8e8")), ground: new Float32Array(rgb01("#6a5a44")),
    light: { x: 0.32, y: 0.76, z: 0.56 }, ambientFloor: 0.32, bloomStrength: 0.2,
    shadowCenter: { x: 0, y: SCREEN_Y / 2, z: 0 }, shadowExtent: 10
  };

  // Each type's hit points, tier and box origin by ENEMY value, the sim's own tables. HAS_HP marks the types with hit
  // points, which lie dying at 0 (a shot or an item has none to lose); tier and origin tell a bullet spent on a shut
  // enemy. SWELL is each type's swell share (its boxes grow by it as it is hit; raid-enemies.js), 0 for most.
  const { HP_OF, TIER_OF, ORIGIN_OF } = raidSim;
  const HAS_HP = Uint8Array.from(HP_OF, (hp) => hp > 0 ? 1 : 0);
  // Each type's destroyed routine (a slot at or past it has fallen and fades) and 1 for a boss main (raid-sim.js).
  const DESTROYED = Uint8Array.from(raidSim.DESTROYED), BOSS_MAIN = Uint8Array.from(raidSim.BOSS_MAIN);
  const SWELL = Float64Array.from(HP_OF, (hp, t) => raidEnemies.TYPES[t] && raidEnemies.TYPES[t].swell || 0);
  // The searchlight's routines (raid-legion-treasury.js): its pool goes red while LOCKED, and lamp and pool go dark.
  const LIGHT = BL.raidLegionTreasury.LIGHT;
  // Each type's ENEMY name by its number, for the error a slot with no look throws.
  const ENEMY_NAMES = [];
  for (const name of Object.keys(ENEMY)) ENEMY_NAMES[ENEMY[name]] = name;
  // A drop guard's warning routine (raid-legion-treasury.js): its hatch's lamp blinks while one waits in it.
  const DROP_WARN = BL.raidLegionTreasury.DROP.WARN;
  // Which way a look faces (its mirrored twin, where it has one, faces +x): a runner by its motion, a carrier against it
  // (its look flies +x), a vault gun keeps its side, any other the nearest Ooga in play. A look with `pick` faces as its
  // pick says (the Auditor by the sim's `eAim`, the Tax Collector by its run).
  // The emplacements (raid-enemies.js's `emplaced` types): routine OPENING opens one over TUNE.EMPLACE_OPEN, and its
  // destroyed routine's last before it holds it shut for good.
  const EMPLACED = Uint8Array.from(HP_OF, (hp, t) => raidEnemies.TYPES[t] && raidEnemies.TYPES[t].emplaced ? 1 : 0), OPENING = 1;
  const FACE_NEAREST = 0, FACE_RUN = 1, FACE_FLY = 2, FACE_FIXED = 3;
  const FACES = Uint8Array.from(HP_OF, (hp, t) => t === ENEMY.RUNNER ? FACE_RUN : t === ENEMY.CARRIER ? FACE_FLY : t === ENEMY.VAULT_GUN ? FACE_FIXED : FACE_NEAREST);
  const inBox = (b, dx, dy) => dx >= b[0] && dx < b[1] && dy > b[2] && dy <= b[3];
  // A boss: a boss main (`boss: true` in its def, whatever its tier: the Mech is armour, and the Engine's pod, boss tier,
  // is a part), or in a rooms stage a boss-tier target (the Mint Counter, the Printer King, whose rooms end on cores).
  const isBoss = (t) => BOSS_MAIN[t] === 1 || rooms && TIER_OF[t] === BOSS;
  const WEAPON_NAMES = ["Rifle", "Auto", "Cork", "Fan", "Beam"];
  // Player 2's shot line under its score, by rapid fire then weapon.
  const WEAPON_LINES = [WEAPON_NAMES, WEAPON_NAMES.map((name) => `${name} · Rapid`)];
  // Weight, the view's alone (the sim never knows it): a boss's part breaking holds the campaign's step HITSTOP_PART s
  // and a boss's fall HITSTOP_DOWN s, both players alike (displayed frames only: the debug `simulate` never holds); the
  // picture shakes inside the steady frame, SHAKE_* m at its start easing out over its life, on a boss's part breaking,
  // its fall and a big machine's blast (BIG_BOOM: the vault, a repo truck), and lightly as an Ooga goes down. A boss's
  // carved name (TITLES, its def's `title`) stands BOSS_CARD_MS as it first enters a stage, and a weapon callout
  // (CALLS: a weapon, rapid fire or the barrier taken, by player when two play) CALL_MS, CALL_AT of the way down the
  // screen, each with its jingle.
  const HITSTOP_PART = 0.06, HITSTOP_DOWN = 0.12;
  const SHAKE_PART = 0.1, SHAKE_DOWN = 0.2, SHAKE_BOOM = 0.12, SHAKE_DEATH = 0.05, SHAKE_LIFE = 0.45, SHAKE_DOWN_LIFE = 0.8;
  const BOSS_CARD_MS = 2400, CALL_MS = 1100, CALL_AT = 0.62;
  const BIG_BOOM = Uint8Array.from(HP_OF, (hp, t) => t === ENEMY.REPO_TRUCK || t === ENEMY.VAULT ? 1 : 0);
  const TITLES = Array.from(HP_OF, (hp, t) => raidEnemies.TYPES[t] && raidEnemies.TYPES[t].title || ""), CARDED = new Uint8Array(TITLES.length);
  for (let t = 0; t < TITLES.length; t++) {
    if (BOSS_MAIN[t] && !TITLES[t]) throw new Error(`scene-raid: boss ${ENEMY_NAMES[t]} has no title for its card`);
    for (const ch of TITLES[t]) if (ch !== " " && !BL.hubModels.SIGN_GLYPHS[ch]) throw new Error(`scene-raid: ${ENEMY_NAMES[t]}'s title "${TITLES[t]}" has "${ch}", which no carved sign holds`);
  }
  const CALL_RAPID = WEAPON_NAMES.length, CALL_BARRIER = CALL_RAPID + 1;
  const CALL_WORDS = [...WEAPON_NAMES, "Rapid fire", "Barrier"].map((name) => `${name}!`);
  const CALLS = [CALL_WORDS, CALL_WORDS.map((w) => `P1 · ${w}`), CALL_WORDS.map((w) => `P2 · ${w}`)];
  const COARSE = window.matchMedia("(pointer: coarse)").matches;

  // The frame round the screen, shared across visits; it casts no shadow, standing in front of the plane.
  const flat = (geo) => Object.assign(geo, { castShadow: false });
  const frameKit = models.cached(() => ({
    slab: flat(models.box({ w: 1, h: 1, d: 0.4, color: "#3a2a1c" })),
    rim: flat(models.box({ w: 1, h: 1, d: 0.3, color: "#a3874f" }))
  }));
  const moved = (geo, dz) => models.moved(geo, 0, 0, dz);
  // A hit and a kill: a white-gold star where a player's shot struck an enemy (FLASH_LIFE s, swelling and gone), and on
  // a kill a star FLASH_KILL times the size at its middle for KILL_LIFE s and SHARDS_PER glowing shards and sparks bursting
  // from it (SHARD_LIFE s under SHARD_G), each from a fixed pool, the
  // oldest reused when all are in flight. Both glow, so they read on either renderer and at any hour.
  const FLASHES = 8, FLASH_LIFE = 0.12, FLASH_GROW = 0.6, FLASH_KILL = 2.2, KILL_LIFE = 0.22, SHARDS = 48, SHARDS_PER = 12, SHARD_LIFE = 0.5, SHARD_G = 9, SHARD_V = 2.6;
  // A printer winding up (raid-enemies.js's PRINTER_WIND, `wind` 0 to 1 over TUNE.PRINTER_WINDUP, 1 through a burst): its
  // spin frames run SPIN_FROM a second rising to SPIN_FROM + SPIN_UP by the square of `wind`, it shakes SHAKE m at full,
  // its heat glows from HEAT_FROM to full, and soot puffs and embers rise from its top, SMOKE_FROM a second rising to
  // SMOKE_FROM + SMOKE_UP (every third an ember), at most SMOKE_STEP a slot a frame, from a pool of SMOKES (the oldest
  // reused), each living SMOKE_LIFE s or so as it rises, drifts and swells. Spin and smoke run on the sim's clock, so a
  // paused printer and its smoke stand still. A printer's shot (attr AIM_STEPS or more) is a dollar bill, swaying BILL_SWAY either side
  // of its heading and flipping BILL_FLIP about its length as it flies.
  const SPIN_FROM = 4, SPIN_UP = 26, SHAKE = 0.03, HEAT_FROM = 0.3, SMOKES = 40, SMOKE_FROM = 10, SMOKE_UP = 30, SMOKE_STEP = 2, SMOKE_LIFE = 0.75;
  const BILL_SWAY = 0.35, BILL_FLIP = 1.1, AIMS = RULES.AIM_STEPS, PRINTER_WIND = raidEnemies.PRINTER_WIND;
  // Telling an attack (raid-enemies.js's FLAG.WIND, and FLAG.BIG with it before a boss's big one). A winding slot wears its
  // look's wind variant where the look has one (`wind` for its open look, `<name>Wind` for any other it wears: raid-models'
  // and the art files'), and a ring in its family's colour (raidModels.FAMILY_OF, which every type that tells has) closes
  // on its box's middle, TELL_Z in front, over TELL_FOR (TELL_FOR_BIG for a big one), from TELL_OUT to TELL_IN times TELL_R
  // (its bullet box's half width, TELL_MIN to TELL_MAX m), glowing up and pulsing TELL_PULSE radians a second, and holds at
  // its smallest while the wind-up runs on (a burst); a big one's ring is the spiked one, TELL_BIG times the size, and turns
  // TELL_SPIN radians a second. It runs on the sim's clock, so a pause holds it. A slot's wind-up starting sounds a tick
  // only for the types TELL_HEARD marks (bosses and their parts, machines and emplacements: a soldier's wind-up is seen,
  // not heard, so a screen of clerks does not tick away), a boss's big one a deeper swell, a printer's its motor
  // spinning up. A boss's guns high on its body (TELL_FROM_*, the muzzles the legions fire from) wear the ring there.
  const TELL_OUT = 1.9, TELL_IN = 0.75, TELL_MIN = 0.22, TELL_MAX = 0.8, TELL_BIG = 1.35, TELL_PULSE = 40, TELL_SPIN = 3, TELL_Z = 0.45;
  const { TELL_FOR, TELL_FOR_BIG } = raidEnemies;
  const TELL_FAMILY = Array.from(HP_OF, (hp, t) => raidEnemies.TYPES[t] && raidEnemies.TYPES[t].tells ? raidModels.FAMILY_OF[ENEMY_NAMES[t]] || "" : "");
  for (let t = 0; t < TELL_FAMILY.length; t++) if (raidEnemies.TYPES[t] && raidEnemies.TYPES[t].tells && !TELL_FAMILY[t]) throw new Error(`scene-raid: ${ENEMY_NAMES[t]} tells its attacks but raid-models gives it no FAMILY_OF`);
  // The Grid Warden's tower top (its aimed shot and every spread leave there) and the floor its sparks start from, and the
  // Chairman's Engine's pod-phase gun (its core's spread of five, its big one, leaves its box's middle), [dx, dy] from
  // the boss's x and feet as the legions fire from them; a ring there is TELL_MUZZLE_R across, a gun's size.
  const TELL_WARDEN_TOP = BL.raidLegionFactory.TUNE.WARDEN_MUZZLE, TELL_WARDEN_SPARK = BL.raidLegionFactory.TUNE.WARDEN_SPARK_FROM;
  const TELL_ENGINE_TOP = BL.raidLegionReserve.TUNE.ENGINE_TOP_AT, TELL_MUZZLE_R = 0.45;
  const TELL_HEARD = Uint8Array.from(HP_OF, (hp, t) => {
    const def = raidEnemies.TYPES[t];
    return def && def.tells && (BOSS_MAIN[t] || def.main !== undefined || def.flags & FLAG.MACHINE || TIER_OF[t] === RULES.TIER.EMPLACEMENT || TIER_OF[t] === BOSS) ? 1 : 0;
  });
  const TELL_R = Float32Array.from(HP_OF, (hp, t) => {
    const b = RULES.SHOT_BOX[TIER_OF[t]];
    return b ? Math.min(TELL_MAX, Math.max(TELL_MIN, (b[1] - b[0]) / 2 * 0.8)) : TELL_MIN;
  });
  // Each shard of a burst as its pool record starts, but for the place: fanned evenly round with a lift, worked out once
  // so a burst only copies them in.
  const SHARD_FAN = Array.from({ length: SHARDS_PER }, (_, n) => {
    const a = (n + 0.5) / SHARDS_PER * 2 * Math.PI, v = SHARD_V * (0.7 + 0.3 * ((n * 5) % 3) / 2);
    return Float32Array.of(0, 0, 0, Math.cos(a) * v, Math.sin(a) * v + 1.5, 0, 0);
  });
  // Shaman's Secrets' banana peels: every player's shot drawn as a peel spinning PEEL_SPIN radians a second, its stub up
  // and three flaps splayed down round it, glowing a little as the shots do.
  const PEEL_SPIN = 14;
  const peelKit = models.cached(() => {
    const part = (w, h, color, emissive) => models.box({ w, h, d: 0.035, color, emissive });
    const flap = (a) => models.moved(models.turnedZ(models.moved(part(0.05, 0.13, "#f5c542", 0.45), 0, -0.065, 0), a), 0, -0.01, 0);
    return flat(models.merge(models.moved(part(0.07, 0.09, "#f5d76a", 0.5), 0, 0.03, 0), models.moved(part(0.03, 0.04, "#5a3a1a", 0.2), 0, 0.095, 0),
      flap(0), flap(0.7), flap(-0.7), models.moved(part(0.05, 0.03, "#fff6c8", 0.6), 0, 0.0, 0.01)));
  });
  const hitKit = models.cached(() => {
    const bar = (w, h, color) => models.box({ w, h, d: 0.03, color, emissive: 1 });
    return {
      flash: flat(models.merge(bar(0.16, 0.16, "#fffbe6"), bar(0.5, 0.08, "#ffd84a"), bar(0.08, 0.5, "#ffd84a"), models.turnedZ(bar(0.34, 0.06, "#ff8a1f"), Math.PI / 4), models.turnedZ(bar(0.34, 0.06, "#ff8a1f"), -Math.PI / 4))),
      shard: flat(models.box({ w: 0.11, h: 0.11, d: 0.03, color: "#ff9a2a", emissive: 1 })),
      spark: flat(models.box({ w: 0.08, h: 0.08, d: 0.03, color: "#fff1a0", emissive: 1 }))
    };
  });
  // The minimal room shell, for a rooms stage with no art in BL.raidArt (only the debug test rooms): drawn through the
  // sim's projection as flat pieces in the plane at SHELL_Z, the floor in bands of depth, the side walls, the back wall
  // with a skirting, and the front wall over the opening (the projection lifts the deep up the screen, so the ceiling
  // stands behind it). A door on the back wall, and the barrier: bars across the back wall, behind the targets on it.
  const roomKit = models.cached(() => {
    const P = (x, z, y = 0) => [projectX(x, z), projectY(y, z)];
    const piece = (points, color, emissive = 0) => models.prism(points, 0.02, color, emissive);
    const parts = [];
    for (let k = 0; k < 4; k++) parts.push(piece([P(0, k / 4), P(ROOM_W, k / 4), P(ROOM_W, (k + 1) / 4), P(0, (k + 1) / 4)], k & 1 ? "#6c5a46" : "#7a6650"));
    parts.push(piece([P(0, 0), P(0, 1), P(0, 1, ROOM_H), P(0, 0, ROOM_H)], "#4c4237"));
    parts.push(piece([P(ROOM_W, 0), P(ROOM_W, 0, ROOM_H), P(ROOM_W, 1, ROOM_H), P(ROOM_W, 1)], "#463d33"));
    parts.push(piece([P(0, 1), P(ROOM_W, 1), P(ROOM_W, 1, ROOM_H), P(0, 1, ROOM_H)], "#5d5145"));
    parts.push(moved(piece([P(0, 1), P(ROOM_W, 1), P(ROOM_W, 1, 0.3), P(0, 1, 0.3)], "#3e352c"), 0.01));
    parts.push(moved(piece([[0, ROOM_H], [ROOM_W, ROOM_H], [ROOM_W, SCREEN_Y + 1], [0, SCREEN_Y + 1]], "#33291f"), 0.02));
    parts.push(moved(piece([[0, ROOM_H], [ROOM_W, ROOM_H], [ROOM_W, ROOM_H + 0.3], [0, ROOM_H + 0.3]], "#5a4632"), 0.03));
    const k = 1 - ROOM.SHRINK, dw = 0.5 * k, dh = 1.3 * k;
    const door = models.merge(piece([[-dw - 0.06, 0], [dw + 0.06, 0], [dw + 0.06, dh + 0.06], [-dw - 0.06, dh + 0.06]], "#7b6a52"),
      moved(piece([[-dw, 0], [dw, 0], [dw, dh], [-dw, dh]], "#17110c"), 0.01));
    const bars = [], top = projectY(2.6, 1), foot = projectY(0, 1);
    for (let i = 0; i <= 12; i++) {
      const x = projectX(0.4 + (ROOM_W - 0.8) * i / 12, 1);
      bars.push(piece([[x - 0.025, foot], [x + 0.025, foot], [x + 0.025, top], [x - 0.025, top]], "#ffcf3a", 0.9));
    }
    for (const y of [foot + 0.05, top]) bars.push(piece([[projectX(0.3, 1), y - 0.04], [projectX(ROOM_W - 0.3, 1), y - 0.04], [projectX(ROOM_W - 0.3, 1), y + 0.04], [projectX(0.3, 1), y + 0.04]], "#ffe680", 0.9));
    return { shell: flat(models.merge(...parts)), door: flat(door), barrier: flat(models.merge(...bars)) };
  });

  // A stage's art in BL.raidArt by its id, or null (stage 1 and the debug test stages have none).
  const artFor = (stage) => BL.raidArt && BL.raidArt.stages[stage.id] || null;
  const geoOf = (look) => look && look.geometry || look;
  // Every type's looks for a stage's art (null for none), once a page each: the art's `skins[NAME]`, else
  // `BL.raidArt.types[NAME]`, else raid-models' look; a type with none anywhere is left without (ENEMY names types whose
  // art loads later), and `draw` throws, naming it, when a slot of it is first placed. Each art look's every builder
  // that takes no argument is built (`keyed`, by its name: `build`, `shut`, `turned`, `turnedShut`, and its extras, as a
  // bill-bat's `flap` or a searchlight's `dark`, `pool`, `poolLocked` and `cone`, or whatever its `pick` names); a
  // swelling look's `swell(k)` for each of its SWELLS; LOB's looks by attr. A look's set-back piece rides with its slot:
  // its `screw()` (a ram's screw, a press's stem, at the depth its `zByAttr[attr]` gives the look too), or for a boss
  // main with a `pick` and a variant for each of its names the stage's `boss.neck[name]` by the name picked. `all` holds every geometry, for the GPU.
  const lookTables = new Map();
  const looksFor = (art) => {
    let table = lookTables.get(art);
    if (table) return table;
    const L = raidModels.looks(), ART = BL.raidArt || { types: {} }, skins = art && art.skins || {}, neck = art && art.boss && art.boss.neck || null;
    table = { open: [], shut: [], turned: [], turnedShut: [], keyed: [], pick: [], swell: [], opening: [], turnedOpening: [], winding: [], turnedWinding: [], heat: [], turnedHeat: [], winds: [], lob: [], screw: [], zBy: [], neck: [], all: new Set() };
    for (const name of Object.keys(ENEMY)) {
      const t = ENEMY[name], src = skins[name] || ART.types[name];
      if (t === ENEMY.FREE || t === ENEMY.ITEM) continue;
      if (t === ENEMY.LOB) {
        // A lob's look goes by its attr: the stage's skin's `build(attr)` where it re-dresses lobs (the factory's molten
        // coin), else `BL.raidArt.lobs[attr]`, which the art files fill; an attr none gives stays empty, and a lob of it
        // throws when drawn (the raid art unit check holds every attr a stage throws).
        for (let a = 0; a < LOB_KINDS; a++) table.lob[a] = ART.lobs && ART.lobs[a] ? geoOf(skins.LOB ? skins.LOB.build(a) : ART.lobs[a]()) : null;
        continue;
      }
      if (src) {
        const keyed = {};
        for (const key of Object.keys(src)) if (key !== "pick" && typeof src[key] === "function" && src[key].length === 0) keyed[key] = geoOf(src[key]());
        if (!keyed.build) throw new Error(`raid scene: the look for ${name} has no build()`);
        table.keyed[t] = keyed;
        table.open[t] = keyed.build;
        table.shut[t] = keyed.shut || null;
        table.turned[t] = keyed.turned || null;
        table.turnedShut[t] = keyed.turnedShut || null;
        table.pick[t] = src.pick || null;
        table.screw[t] = keyed.screw || null;
        table.zBy[t] = src.zByAttr || null;
        // The neck goes with the boss main whose look has a variant for every name it has (the Leviathan's).
        if (neck && BOSS_MAIN[t] && src.pick && Object.keys(neck).every((key) => typeof src[key] === "function")) {
          table.neck[t] = {};
          for (const key of Object.keys(neck)) table.neck[t][key] = geoOf(neck[key]());
        }
        if (src.swell && src.SWELLS) table.swell[t] = Array.from({ length: src.SWELLS }, (_, k) => src.swell(k));
        if (src.opening && src.OPENINGS) table.opening[t] = Array.from({ length: src.OPENINGS }, (_, k) => geoOf(src.opening(k)));
        if (src.turnedOpening && src.OPENINGS) table.turnedOpening[t] = Array.from({ length: src.OPENINGS }, (_, k) => geoOf(src.turnedOpening(k)));
        // Its wind-up looks by the name of the look each winds up from: `wind` for `build`, `<name>Wind` for any other.
        const winds = {};
        for (const key of Object.keys(keyed)) { const w = key === "build" ? keyed.wind : keyed[`${key}Wind`]; if (w) winds[key] = w; }
        if (Object.keys(winds).length) table.winds[t] = winds;
      } else if (L.enemies[t]) {
        table.open[t] = L.enemies[t];
        table.shut[t] = L.shut[t] || null;
        table.turned[t] = L.turned[t] || null;
        table.turnedShut[t] = L.turnedShut[t] || null;
        table.opening[t] = L.opening[t] || null;
        table.turnedOpening[t] = L.turnedOpening[t] || null;
        table.winding[t] = L.winding[t] || null;
        table.turnedWinding[t] = L.turnedWinding[t] || null;
        table.heat[t] = L.heat[t] || null;
        table.turnedHeat[t] = L.turnedHeat[t] || null;
        if (L.wind[t]) table.winds[t] = { build: L.wind[t], turned: L.turnedWind[t] || null };
      }
    }
    for (const list of [table.open, table.shut, table.turned, table.turnedShut, table.heat, table.turnedHeat, table.lob, L.items, L.bullets, L.smoke, [L.bill, L.turnedBill], Object.values(L.tells), Object.values(L.bigTells)]) for (const geo of list) if (geo) table.all.add(geo);
    for (const map of table.winds) if (map) for (const key of Object.keys(map)) if (map[key]) table.all.add(map[key]);
    for (const map of [...table.keyed, ...table.neck]) if (map) for (const key of Object.keys(map)) table.all.add(map[key]);
    for (const list of [...table.swell, ...table.opening, ...table.turnedOpening, ...table.winding, ...table.turnedWinding]) if (list) for (const geo of list) table.all.add(geo);
    lookTables.set(art, table);
    return table;
  };
  // The types a stage can hold: what it places (its records, or each room's targets and waves) and the types any stage
  // may (`raidEnemies.COMMON`), closed over each type's declared `releases` (what its routines spawn or mount).
  const stageTypes = (stage) => {
    const types = new Set(raidEnemies.COMMON.map((name) => ENEMY[name]));
    const take = (list, stride, at) => { for (let k = at; k < list.length; k += stride) types.add(list[k]); };
    if (stage.kind === "rooms") for (const room of stage.rooms) { take(room.targets, 4, 2); take(room.waves, 3, 1); }
    else take(stage.placed, 4, 2);
    for (const t of types) for (const name of raidEnemies.TYPES[t].releases || []) types.add(ENEMY[name]);
    return types;
  };
  // A stage's art gathered once a page, built (and cached in its art file) without placing it: the sectors (the screens
  // across a side stage, or up a climb), the backdrop, the room shells, the moving pieces of a side stage or climb (its
  // lifts, crumbling planks, the gale's flags, belts, tide water and rafts, the pass's weather, the storm's zones, the
  // printing cylinders), a climb boss's lines and a side boss's dressing (`boss(stage)`), the fog, and the looks; `geos`
  // holds every geometry of it, for the GPU. The art's lifts and planks are the stage's own, in its order.
  const prepared = new WeakMap();
  const prepare = (stage) => {
    let p = prepared.get(stage);
    if (p) return p;
    const art = artFor(stage), geos = new Set(), climb = stage.kind === "climb", isRooms = stage.kind === "rooms";
    const add = (geo) => geos.add(geo);
    // Every type the stage can hold wears a look, or the stage throws as it starts, naming the type.
    const looks = looksFor(art);
    for (const t of stageTypes(stage)) {
      if (t !== ENEMY.LOB && t !== ENEMY.ITEM && !looks.open[t]) throw new Error(`raid scene: ${stage.id} places or releases ${ENEMY_NAMES[t]}, which has no look in BL.raidArt or raid-models`);
    }
    const sectors = [];
    if (!isRooms) {
      const n = art && art.screens ? art.screens(stage) : stage.cols / SCREEN_W;
      for (let screen = 0; screen < n; screen++) for (const geo of (art ? art.sector : raidModels.sector)(stage, screen)) sectors.push(geo);
    }
    sectors.forEach(add);
    const back = isRooms ? null : art && art.backdrop ? art.backdrop(stage) : raidModels.backdrop();
    if (back) for (const band of [...back.sky, ...back.layers]) add(band.geometry);
    const shells = [];
    if (isRooms && art) {
      for (let i = 0; i < stage.rooms.length; i++) {
        const r = art.roomShell(stage, i);
        if (r.wires.length > WIRES || r.lamps.length > LAMPS) throw new Error(`raid scene: ${stage.id} room ${i} holds more wires or lamps than the scene's pools`);
        shells.push(r);
        [r.shell, r.front, r.barrier, r.door].forEach(add);
        for (const w of r.wires) add(w.geometry);
        for (const l of r.lamps) add(l.geometry);
        if (r.needle) add(r.needle.geometry);
      }
    } else if (isRooms) {
      const R = roomKit();
      [R.shell, R.door, R.barrier].forEach(add);
    }
    const side = !isRooms && art;
    const lifts = side && art.lifts ? art.lifts(stage) : [], planks = side && art.planks ? art.planks(stage) : [];
    const gale = side && art.gale ? art.gale(stage) : null, boss = climb && art && art.boss && art.boss.cableAt ? art.boss : null;
    const belts = side && art.belts ? art.belts(stage) : [], water = side && art.water ? art.water(stage) : [];
    const weather = side && art.weather ? art.weather(stage) : null, storm = side && art.storm ? art.storm(stage).zones : [];
    const cylinders = side && art.cylinders ? art.cylinders(stage) : [], dress = side && typeof art.boss === "function" ? art.boss(stage) : null;
    if (side && (lifts.length !== stage.lifts.length || planks.length !== (art.planks ? stage.crumble.length : 0))) throw new Error(`raid scene: ${stage.id}'s art lifts or planks are not the stage's`);
    for (const lift of lifts) add(lift.geometry);
    for (const plank of planks) { add(plank.geometry); add(plank.split); }
    if (gale) [gale.pole, gale.limp, gale.taut, gale.tautLeft].forEach(add);
    if (boss) add(boss.cable());
    for (const belt of belts) add(belt.chevrons || belt.geometry);
    for (const basin of water) {
      [basin.body, basin.foam, basin.swell].forEach(add);
      for (const raft of basin.rafts) add(raft.geometry);
    }
    if (weather) [weather.snow, weather.aurora.geometry, weather.aurora.flare].forEach(add);
    for (const zone of storm) [zone.stir, zone.blizzard(-1), zone.blizzard(1)].forEach(add);
    for (const cylinder of cylinders) add(cylinder.geometry);
    if (dress) [dress.tower, dress.blaze].forEach(add);
    for (const geo of looks.all) add(geo);
    const fog = art && art.fog ? new Float32Array(rgb01(art.fog)) : HORIZON_RGB;
    p = { art, sectors, back, shells, lifts, planks, gale, boss, belts, water, weather, storm, cylinders, dress, fog, looks, geos };
    prepared.set(stage, p);
    return p;
  };

  // One visit's state: made in enter, dropped in leave. `chosen` is the players the title card last picked, kept for
  // the page's life.
  let home = "hub", chosen = 1;
  let renderer, go, game, world, canvas, header, root, camera, input, fx, campaign, sim, stages, resize, debugRaid, hud, raidHud, audio, controls, introEl, actLabel;
  // The page's move stick and the nav's way out, with the words it had before the visit.
  let stickEl = null;
  let skyLayer, frameLayer, roomView, barrierNode, fire, jump, walkView, playerOne, playerTwo;
  // The placed stage's gathered art (`prepare`), its backdrop's nodes' source, and the room's art (null in the minimal
  // shell); the room's own nodes beside the shell, the doors and the barrier; which lamp each door's drops blink.
  let shown = null, shownBack = null, roomArt = null, shellNode, frontNode, needleNode, lampOfDoor, lampWarn;
  let fitDirty = true, viewW = 1, viewH = 1, headerPx = 0, hudY = 0, targetY = SCREEN_Y / 2;
  let players = 1, keyMask = 0, keyMask2 = 0, pointerFire = false, debugBits = 0, debugBits2 = 0;
  let introShown = true, resultsShown = false, overFor = 0, campaignPhase = CPHASE.PLAY, lastRoom = -1, rooms = false;
  // The gate's words while the visitor is being sent back, and the seconds before they go; the run's settlement and the
  // furthest of `STAGES` it reached and the furthest it cleared (-1 for none), which lets a left run settle.
  let refusal = null, refuseIn = 0, leaving = false, unsubscribeAccount = null;
  // Shaman's Secrets: the tablet open, the toggle the keys or a pad stand on, the secrets and start as the tablet opened
  // (a change makes a new run as it closes), how far each way of entering the code has come and where a touch began;
  // the run's secrets (their ids, its CHEAT bits) and the view's three, set as each run is made.
  let secretsOpen = false, secretAt = 0, secretsWere = "", codeAt = 0, padCodeAt = 0, touchAt = 0, touchX = 0, touchY = 0;
  let runCheats = [], runBits = 0, runStart = 0, mirror = false, peels = false;
  let settled = false, newBest = false, paid = 0, furthest = 0, furthestCleared = -1, started = false;
  // The boss bar's boss main: its slot (-1 with none), type and the hit points it started with.
  let bossSlot = -1, bossType = 0, bossStart = 1;
  // Weight (see HITSTOP_PART): the hold left, the shake (its size at the start, age, life, and its own clock), the boss
  // card shown this sim (the sim it was for, and its type), and for the debug handle the last card and callout and how
  // many of each since the visit began.
  // `latched`, `latched2`: every button each player held over a hitstop's frames, handed to the first frame that steps,
  // so a key or pad tap made and let go inside the hold still reaches the sim (touch taps latch on their own).
  let latched = 0, latched2 = 0;
  let hitstop = 0, shakeAmp = 0, shakeAge = 0, shakeLife = 0, shakeT = 0, cardSim = null, cardTitle = "", cards = 0, callText = "", callCount = 0;
  const crews = [], bulletNodes = [], enemyNodes = [], layerNodes = [], layerRates = [], layerYs = [], stageNodes = [], doorNodes = [];
  // The hit and kill pools: each flash's x, y, depth, age, life and size (age past its life is free), each shard's x,
  // y, depth, velocity and age, and the next of each to take.
  const flashNodes = [], shardNodes = [], flashAt = new Float32Array(FLASHES * 6), shardAt = new Float32Array(SHARDS * 7);
  // The printers' wind-up: each enemy slot's heat node (laid over a winding printer), the smoke pool and each puff's x, y,
  // velocity, age, life, kind (0 and 1 soot, 2 an ember) and turn; each slot's wind (-1 while not winding), spin frame
  // phase and smoke owed; the sim's clock last frame and the seconds it moved since (0 while paused).
  const heatNodes = [], smokeNodes = [], smokeAt = new Float32Array(SMOKES * 8);
  let smokeNext = 0, eWind = null, eSpin = null, eSmoke = null, simWas = 0, simDt = 0;
  // The tells (see TELL_OUT): each enemy slot's ring and the sim time its wind-up began (-1 while not winding), and this
  // frame's slots winding, wearing a wind-up look and showing a ring, for the debug handle.
  const tellNodes = [], tellCues = { tell: 0, big: 0, windUp: 0 };
  let eTellAt = null, tellCount = 0, windCount = 0, ringCount = 0;
  let flashNext = 0, shardNext = 0;
  // Fixed pools made in enter: a room's tripwires and hatch lamps, the searchlights' pools and beams, a climb boss's
  // lines, and each enemy slot's set-back piece (`riderNodes`). The moving pieces of a side stage or climb, made as its
  // stage is placed: the lifts, the crumbling planks, the gale's flags (each with its zone's way, `flagWays`), the belts,
  // each tide basin's water body and surface and its rafts (each raft's basin in `raftBasins`), each storm zone's stir and
  // blizzard, the printing cylinders; the pass's aurora and snow, and a side boss's overload blaze, one each or none.
  const wireNodes = [], lampNodes = [], poolNodes = [], coneNodes = [], cableNodes = [], liftNodes = [], plankNodes = [], flagNodes = [], flagWays = [];
  const riderNodes = [], beltNodes = [], bodyNodes = [], surfaceNodes = [], raftNodes = [], raftBasins = [], stirNodes = [], blizzardNodes = [], cylinderNodes = [];
  let auroraNode = null, snowNode = null, blazeNode = null;
  const held = {};
  // Keys by what they do: player 1's own, the arrows (player 1's alone, player 2's with two), and player 2's buttons.
  const KEYS_ONE = { a: IN.LEFT, d: IN.RIGHT, w: IN.UP, s: IN.DOWN, " ": IN.JUMP, j: IN.FIRE };
  const ARROWS = { arrowleft: IN.LEFT, arrowright: IN.RIGHT, arrowup: IN.UP, arrowdown: IN.DOWN };
  const KEYS_TWO = { ",": IN.JUMP, ".": IN.FIRE };
  const KEY_BITS = { ...KEYS_ONE, ...ARROWS, ...KEYS_TWO };
  // Standard gamepads in the order they connected (no other kind is followed): each one's index (-1 for none); this
  // frame's bits (`padNow`) and last frame's (`padWas`, for presses); the bits held through a card or a release
  // (`padBlock`), kept from the sim until let go. `padsOn` counts those connected. The title card's players line and the
  // pause card's help, with their words without the pads, put back as the last pad goes and in leave.
  // `padMark` is the players the pads have marked on the title card (see padCards), shown while a pad is connected.
  const padOrder = new Int16Array(PADS).fill(-1), padNow = new Uint16Array(PADS), padWas = new Uint16Array(PADS), padBlock = new Uint16Array(PADS);
  let padsOn = 0, padMark = 1, padHelp = null, padHelpText = "", pauseHelp = null, pauseHelpText = "";
  // Last frame's state, for the sound cues; which way each enemy slot's look faces (1, mirrored), kept between frames so
  // a walker that stops keeps its facing; and the name each slot's `pick` last gave, kept once the slot has fallen so its
  // fade keeps the look it fell in (a crate or an icicle never snaps back), null for none.
  let prev = null, eTurned = null, eKey = null, eShutAt = null;
  // Each Ooga's speed through the advance, so it strides into the next room while the sim holds it still.
  const WALK = new Float32Array(PLAYERS).fill(TUNE.RUN);

  // The scene's members, registered with its deferred shell (scene-deferred.js) at the foot of the file, with the rest.
  const definition = {
    id: "raid", renderOpts: RENDER_OPTS, root: null, camera: null, input: null, debug: null, agent: null, agentControls: null,
    // The gate (`refusalFor` below), which the arcade's back door asks too, so both doors keep one rule and one wording.
    refusalFor: (account) => refusalFor(account),
    // The controls panel: player 1's keys (player 2's, and the pads, are on the title card and in the README).
    controlsHelp(touch) {
      const H = BL.controlsHelp;
      if (touch) return { title: "Ooga Raid", rows: [H.row([], "Run and aim", "Left stick"), H.row([], "Jump", "Jump! button"), H.row([], "Fire", "Hold Fire"), H.row([], "Pause", "Pause button")] };
      return { title: "Ooga Raid", rows: [H.row(["a", "d"], "Run"), H.row(["w", "s"], "Aim up, lie prone or duck"), H.row([" "], "Jump (with S, drop off a ledge)"), H.row(["j"], "Fire (or click)"),
        H.row(["p"], "Pause"), H.row(["escape"], "Pause card / leave")] };
    },
    // The controller screen (opened from this panel) hands the pad back to the page as it closes (`listen(null)`), so
    // every panel closing takes it back again while the raid is up.
    controlsHelpHold(on) {
      if (!on && campaign) BL.gamepad.listen(NO_PAD);
    },
    get inMotion() {
      if (campaign.state.paused) return fx.inMotion;
      const cp = campaign.state.phase;
      return sim.state.phase === PHASE.PLAY || sim.state.phase === PHASE.BOSS || cp === CPHASE.TRANSITION || cp === CPHASE.ENDING || fx.inMotion;
    }
  };

  const remask = () => {
    keyMask = keyMask2 = 0;
    for (const key in held) {
      if (!held[key]) continue;
      if (key in KEYS_ONE) keyMask |= KEYS_ONE[key];
      else if (key in ARROWS) {
        if (players === 2) keyMask2 |= ARROWS[key];
        else keyMask |= ARROWS[key];
      } else if (players === 2) keyMask2 |= KEYS_TWO[key];
    }
  };
  // Every held input let go: keys, the mouse, the touch buttons, the stick and the pads (kept from the sim until let
  // go). On the title card closing, a stage starting, a blur, the tab hiding and leave, so nothing held across them
  // reaches the sim as stuck.
  const releaseAll = () => {
    for (const key in held) held[key] = false;
    keyMask = keyMask2 = 0;
    latched = latched2 = 0;
    pointerFire = false;
    padBlock.fill(ALL_BITS);
    if (fire) fire.id = jump.id = -1;
    if (fire) fire.tap = jump.tap = false;
    if (controls) controls.reset();
  };
  const onVisibility = () => {
    if (document.hidden) releaseAll();
  };
  const onKeyUp = (e) => {
    const key = e.key.toLowerCase();
    if (!(key in KEY_BITS)) return;
    held[key] = false;
    remask();
  };
  const onPointerDown = (e) => {
    if (e.button === 0) pointerFire = true;
  };
  const onPointerUp = () => {
    pointerFire = false;
  };
  // Captured, so the key that closes the title card (which the director keeps from everything else) unlocks the sound
  // too, and 1 or 2 pick the players while the card shows. On the card it also follows the Konami code, which opens
  // Shaman's Secrets (the director, which keeps every key from the scene while a title card shows, follows its own code
  // for the feed panel only when no card shows, so the two never meet), and up and down pick the stage while the stage
  // select is on. While the tablet is open every key is its own: none reaches the director, which would close the card.
  const onGestureKey = (e) => {
    audio.unlock();
    if (secretsOpen) {
      e.stopImmediatePropagation();
      secretsKey(e);
      return;
    }
    if (e.repeat || introEl.hidden || refusal) return;
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
    const key = e.key.toLowerCase();
    codeAt = codeStep(SECRET_KEYS, codeAt, key);
    if (codeAt === SECRET_KEYS.length) {
      e.stopImmediatePropagation();
      openSecrets();
      return;
    }
    if (e.key === "1" || e.key === "2") choosePlayers(e.key === "1" ? 1 : 2);
    else if (key === "arrowup" || key === "arrowdown") stepStart(key === "arrowup" ? -1 : 1);
  };
  // The touches on the title card, for the code: a swipe or a tap from where the touch began to where it ended (a touch
  // event goes on through a scroll, where a pointer event is cancelled). The tap that ends the code takes no click.
  const onCardTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  };
  const onCardTouchEnd = (e) => {
    if (introEl.hidden || refusal || secretsOpen || e.touches.length > 0) return;
    const t = e.changedTouches[0], dx = t.clientX - touchX, dy = t.clientY - touchY, far = Math.max(Math.abs(dx), Math.abs(dy));
    const gesture = far < TAP_PX ? (e.target.closest("button") ? "button" : "tap")
      : far < SWIPE_PX ? null : Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? "up" : "down") : dx < 0 ? "left" : "right";
    if (gesture === null) return;
    touchAt = codeStep(SECRET_TOUCH, touchAt, gesture);
    if (touchAt === SECRET_TOUCH.length) {
      e.preventDefault();
      openSecrets();
    }
  };

  // ---- Secrets -------------------------------------------------------------------------------------------------
  // Shaman's Secrets, a carved tablet over the title card that the Konami code opens (keys, a pad's d-pad then B A, or
  // the touches), listing the secrets as toggles: the six raid-sim rules (SECRET_BITS), big heads, banana peels, the
  // stage select and mirror mode. The game's save keeps which are on and the stage select's stage, and what is earned
  // (`game.raidUnlocked`: the stage select once stage 4 is cleared, mirror mode once the loop is done, "???" until
  // then). Up and down (or a pad's d-pad) walk the toggles, Enter or Space (A) turns one on or off, Escape (B), Done or a
  // press outside closes it back to the card, and if anything changed a new run is made under the card for them. A run
  // takes its secrets as it is made (`newRun`): the rules ones into the campaign, the view's here (the crews' heads, the
  // player shots' look, mirror mode's flipped canvases with left and right swapped in every human input, so the keys
  // still go the way the screen shows), and the strip's mark while one that changes the rules is on: such a run is
  // settled with no best and no tickets (`game.settleRaid`, `game.raidCheated`), which its results say, where a run with
  // only the looks on (big heads, banana peels, mirror mode: `BL.game.RAID_LOOKS`), or the stage select starting at
  // stage 1, counts as any other. With the stage select on the card names the stage the run starts on,
  // any of the eight (clearing stage 4 earns it, and the stage a player wants to practise is most often one they have
  // not cleared), and up and down, or its buttons, step it round.
  // The next place in `list` after `token`: one on, back to one for its first entry, else none.
  const codeStep = (list, at, token) => token === list[at] ? at + 1 : token === list[0] ? 1 : 0;
  const secretIds = () => BL.game.RAID_CHEATS;
  const secretState = () => JSON.stringify([game.state.raid.cheats, game.state.raid.start]);
  // The tablet's toggles and the card's stage chooser from the save, its keys' line in the pads' words while one is on.
  const refreshSecrets = () => {
    const on = game.state.raid.cheats;
    for (const id of secretIds()) raidHud.setSecret(id, on.includes(id), !game.raidUnlocked(id));
    const start = game.state.raid.start;
    raidHud.setStart(on.includes("stages") ? `Stage ${start + 1}: ${STAGES[start].name}` : null, padsOn);
  };
  const openSecrets = () => {
    if (secretsOpen || refusal || introEl.hidden) return;
    secretsOpen = true;
    codeAt = padCodeAt = touchAt = 0;
    secretAt = 0;
    secretsWere = secretState();
    refreshSecrets();
    introEl.inert = true;
    raidHud.showSecrets(true, padsOn);
    raidHud.focusSecret(0);
    padBlock.fill(ALL_BITS);
    audio.unlock();
    audio.cues.secrets();
  };
  const closeSecrets = () => {
    if (!secretsOpen) return;
    secretsOpen = false;
    raidHud.focusSecret(-1);
    raidHud.showSecrets(false);
    introEl.inert = false;
    padBlock.fill(ALL_BITS);
    if (secretState() !== secretsWere) newRun();
  };
  // Secret i turned on or off; a locked one says so and stays off.
  const toggleSecret = (i) => {
    const id = secretIds()[i];
    secretAt = i;
    raidHud.focusSecret(i);
    if (!game.raidUnlocked(id)) {
      hud.toast("Not earned yet");
      return;
    }
    game.setRaidCheat(id, !game.state.raid.cheats.includes(id));
    refreshSecrets();
  };
  const moveSecret = (d) => {
    const n = secretIds().length;
    secretAt = (secretAt + d + n) % n;
    raidHud.focusSecret(secretAt);
  };
  // The tablet's keys: up and left back a toggle, down and right on one, Enter or Space turns the focused toggle on or
  // off (Done closes), Escape closes; Tab moves the focus as ever.
  const secretsKey = (e) => {
    const key = e.key;
    if (key === "Escape") {
      e.preventDefault();
      closeSecrets();
    } else if (key === "ArrowUp" || key === "ArrowLeft" || key === "ArrowDown" || key === "ArrowRight") {
      e.preventDefault();
      moveSecret(key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1);
    } else if ((key === "Enter" || key === " ") && !e.repeat) {
      e.preventDefault();
      const at = raidHud.el.secretButtons.indexOf(document.activeElement);
      if (at < 0 && raidHud.el.secrets.contains(document.activeElement) && document.activeElement.tagName === "BUTTON") closeSecrets();
      else toggleSecret(at >= 0 ? at : secretAt);
    }
  };
  // The stage select's stage stepped round the eight (while it is on), and a new run under the card from there.
  const stepStart = (d) => {
    if (!game.state.raid.cheats.includes("stages")) return;
    const n = STAGES.length;
    game.setRaidStart((game.state.raid.start + d + n) % n);
    refreshSecrets();
    newRun();
  };
  // Left and right swapped, for mirror mode.
  const swapLR = (bits) => bits & ~(IN.LEFT | IN.RIGHT) | (bits & IN.LEFT ? IN.RIGHT : 0) | (bits & IN.RIGHT ? IN.LEFT : 0);
  // The run's secrets, as `newRun` makes it: its ids and CHEAT bits, the crews' heads, the shots' look, mirror mode
  // (`newRun` then puts up the strip's mark for a run that changes the rules, which costs the best and the tickets).
  const takeSecrets = () => {
    runCheats = game.state.raid.cheats.slice();
    runBits = 0;
    for (const id of runCheats) if (SECRET_BITS[id]) runBits |= SECRET_BITS[id];
    for (const crew of crews) crew.bigHead(runCheats.includes("heads"));
    peels = runCheats.includes("peels");
    mirror = runCheats.includes("mirror");
    if (mirror) document.body.dataset.raidMirror = "true";
    else delete document.body.dataset.raidMirror;
  };
  const onGesture = () => {
    audio.unlock();
  };

  // The pads changed: the count, nothing held across the change presses or reaches the sim until let go, and the title
  // card's players line, its stage chooser's line and the pause card's help name the pads while one is connected.
  const padsChanged = () => {
    let on = 0;
    for (let k = 0; k < PADS; k++) if (padOrder[k] >= 0) on++;
    padsOn = on;
    padNow.fill(ALL_BITS);
    padBlock.fill(ALL_BITS);
    padHelp.textContent = on > 0 ? padHelp.dataset.pad : padHelpText;
    pauseHelp.textContent = on > 0 ? pauseHelp.dataset.pad : pauseHelpText;
    raidHud.markPlayers(on > 0 ? padMark : 0);
    refreshSecrets();
  };
  // A standard pad joined (or was found connected as the visit began): after the others, while there is room. Any
  // other mapping is never followed. One announced as it joins (`fresh`) shows up on a press, which counts: nothing is
  // taken as held before it, so its next poll sees the buttons down as pressed (still kept from the sim until let go).
  const addPad = (gamepad, fresh) => {
    if (gamepad.mapping !== "standard") return;
    let k = 0;
    while (k < PADS && padOrder[k] >= 0 && padOrder[k] !== gamepad.index) k++;
    if (k === PADS) return;
    const known = padOrder[k] === gamepad.index;
    padOrder[k] = gamepad.index;
    padsChanged();
    if (fresh && !known) padNow[k] = 0;
  };
  // A pad left: the later ones move up, keeping their order.
  const removePad = (index) => {
    let k = 0;
    while (k < PADS && padOrder[k] !== index) k++;
    if (k === PADS) return;
    for (; k < PADS - 1; k++) padOrder[k] = padOrder[k + 1];
    padOrder[PADS - 1] = -1;
    padsChanged();
  };
  const onPadOn = (e) => addPad(e.gamepad, true);
  const onPadOff = (e) => removePad(e.gamepad.index);
  // Once a frame, only while a pad is connected: each pad's bits, last frame's kept for presses, and what is
  // held through a card let go of once it is up.
  const pollPads = () => {
    if (padsOn === 0) return;
    const pads = navigator.getGamepads();
    for (let k = 0; k < PADS; k++) {
      const i = padOrder[k], pad = i >= 0 && i < pads.length ? pads[i] : null;
      padWas[k] = padNow[k];
      padNow[k] = pad && pad.connected ? padBits(pad.axes, pad.buttons) : 0;
      padBlock[k] &= padNow[k];
    }
  };
  // Any of `bits` pressed this frame on any pad.
  const padPressed = (bits) => {
    for (let k = 0; k < PADS; k++) if (padOrder[k] >= 0 && (padNow[k] & ~padWas[k] & bits) !== 0) return true;
    return false;
  };
  // The pads' bits for player p this frame, past what is held through a card: alone, every pad drives player 1; with
  // two, the first pad drives player 1 and the second player 2, or a lone one player 2.
  const padFor = (p) => {
    if (padsOn === 0) return 0;
    let bits = 0, first = -1, second = -1;
    for (let k = 0; k < PADS; k++) {
      if (padOrder[k] < 0) continue;
      if (players === 1) bits |= padNow[k] & ~padBlock[k];
      else if (first < 0) first = k;
      else if (second < 0) second = k;
    }
    if (players === 1) return p === 0 ? bits & SIM_BITS : 0;
    const k = second < 0 ? (p === 1 ? first : -1) : p === 0 ? first : second;
    return k < 0 ? 0 : padNow[k] & ~padBlock[k] & SIM_BITS;
  };
  // The players the pads mark on the title card, shown on its buttons while a pad is connected.
  const markPlayers = (n) => {
    padMark = n;
    raidHud.markPlayers(padsOn > 0 ? n : 0);
  };
  // The pads' presses on the cards: the title card's d-pad left or right marks one or two players and A or Start plays
  // the players marked; paused, A or Start resumes; in play Start pauses; at game over A or fire continues once it has
  // stood OVER_HOLD, and on the results card A starts again. A press that moves the run on lets the pads go, so the
  // button held does not reach the sim.
  const padCards = () => {
    if (padsOn === 0) return;
    // Shaman's Secrets open: up and down walk the toggles, A turns one on or off, B (either fire button) or Start closes.
    if (secretsOpen) {
      if (padPressed(IN.UP)) moveSecret(-1);
      else if (padPressed(IN.DOWN)) moveSecret(1);
      if (padPressed(IN.JUMP)) toggleSecret(secretAt);
      else if (padPressed(IN.FIRE | START_BIT)) closeSecrets();
      return;
    }
    if (!introEl.hidden) {
      // The code (the d-pad, then B A): a left or right taken by it past up up down down leaves the mark where it was,
      // and the A that ends it opens the tablet rather than the run. Up and down step the stage select's stage.
      const at = padCodeAt;
      if (padPressed(SECRET_PAD[at])) padCodeAt = at + 1;
      else if (padPressed(IN.UP | IN.DOWN | IN.LEFT | IN.RIGHT | IN.FIRE | IN.JUMP | START_BIT)) padCodeAt = padPressed(SECRET_PAD[0]) ? 1 : 0;
      if (padCodeAt === SECRET_PAD.length) {
        openSecrets();
        return;
      }
      if (padPressed(IN.UP)) stepStart(-1);
      else if (padPressed(IN.DOWN)) stepStart(1);
      const taken = at >= SECRET_LR && padCodeAt === at + 1;
      if (taken) return;
      if (padPressed(PICK_ONE)) markPlayers(1);
      else if (padPressed(PICK_TWO)) markPlayers(2);
      if (padPressed(IN.JUMP | START_BIT)) {
        choosePlayers(padMark);
        audio.unlock();
        introEl.hidden = true;
      }
      return;
    }
    if (campaign.state.paused) {
      if (padPressed(IN.JUMP | START_BIT)) setPause(false);
      return;
    }
    if (padPressed(START_BIT)) {
      setPause(true);
      return;
    }
    const phase = campaign.state.phase;
    if (phase === CPHASE.OVER && overFor >= OVER_HOLD && padPressed(IN.JUMP | IN.FIRE)) {
      proceed();
      padBlock.fill(ALL_BITS);
    } else if (phase === CPHASE.END && padPressed(IN.JUMP)) {
      newRun();
      padBlock.fill(ALL_BITS);
    }
  };

  // Last frame's state, compared with this frame's for the cues.
  const makePrev = () => ({
    pState: new Uint8Array(PLAYERS), lives: new Uint8Array(PLAYERS), volley: new Int8Array(PLAYERS),
    weapon: new Uint8Array(PLAYERS), rapid: new Uint8Array(PLAYERS), barrier: new Float32Array(PLAYERS),
    bLive: new Uint8Array(BULLETS), bAge: new Float32Array(BULLETS),
    eType: new Uint8Array(ENEMY_SLOTS), eHp: new Uint8Array(ENEMY_SLOTS), eFlags: new Uint8Array(ENEMY_SLOTS), eRoutine: new Uint8Array(ENEMY_SLOTS),
    ex: new Float32Array(ENEMY_SLOTS), ey: new Float32Array(ENEMY_SLOTS), phase: PHASE.PLAY, roomPhase: ROOM_PHASE.FIGHT,
    // The terrain's, sized to each stage as it is placed: each lift moving (1), each span's CRUMBLE phase, and the
    // current room's tripwires' WIRE states (wireRoom the room they are of, -1 off a rooms stage).
    lift: new Uint8Array(0), crumble: new Uint8Array(0), wire: new Uint8Array(0), wireRoom: -1
  });
  // Lift k of the stage moving at stage time t: its top not where it stood a step before.
  const liftMoving = (k, t) => {
    const lift = sim.stage.lifts[k];
    return liftTop(lift, t) !== liftTop(lift, t - FIXED);
  };
  // Lift k's top on the screen.
  const liftShown = (k) => {
    const s = sim.state, lift = sim.stage.lifts[k], x = lift[0] * CELL, y = liftTop(lift, s.time);
    return x + lift[1] * CELL > s.camX && x < s.camX + SCREEN_X && y > s.camY && y < s.camY + SCREEN_Y;
  };
  // The terrain's memory sized to the placed stage (once a stage, never every frame).
  const sizeTerrain = () => {
    const st = sim.stage;
    let wires = 0;
    if (st.kind === "rooms") for (const room of st.rooms) wires = Math.max(wires, room.wires.length / 6);
    prev.lift = new Uint8Array(st.kind === "rooms" ? 0 : st.lifts.length);
    prev.crumble = new Uint8Array(sim.state.crumblePhase.length);
    prev.wire = new Uint8Array(wires);
    prev.wireRoom = -1;
  };
  const sync = () => {
    const s = sim.state;
    prev.pState.set(s.pState); prev.lives.set(s.pLives);
    prev.weapon.set(s.pWeapon); prev.rapid.set(s.pRapid); prev.barrier.set(s.pBarrier);
    prev.bLive.set(s.bLive); prev.bAge.set(s.bAge);
    prev.eType.set(s.eType); prev.eHp.set(s.eHp); prev.eFlags.set(s.eFlags); prev.eRoutine.set(s.eRoutine); prev.ex.set(s.ex); prev.ey.set(s.ey);
    prev.phase = s.phase;
    prev.roomPhase = s.roomPhase;
    for (let k = 0; k < prev.lift.length; k++) prev.lift[k] = liftMoving(k, s.time) ? 1 : 0;
    prev.crumble.set(s.crumblePhase);
    prev.wireRoom = rooms ? s.room : -1;
    if (rooms) for (let k = 0, n = sim.stage.rooms[s.room].wires.length / 6; k < n; k++) prev.wire[k] = wireState(sim.stage.rooms[s.room], k, s.roomTime);
  };
  // The next flash's place in `flashAt`. The hit effects write their numbers into the pools themselves: they run too
  // seldom to be optimized, and a number handed to a call there is boxed, an allocation each time.
  const flashSlot = () => {
    const k = flashNext * 6;
    flashNext = (flashNext + 1) % FLASHES;
    return k;
  };
  // A flash where slot i was struck this frame: at the player's shot spent this frame nearest its box's middle (where it
  // was last drawn), else at the middle (a beam passing through, a barrier's touch, the clear-screen).
  const flashHit = (i) => {
    const s = sim.state, cx = s.ex[i], cy = s.ey[i] + ORIGIN_OF[s.eType[i]];
    let x = cx, y = cy, z = s.ez[i], far = 0.6 * 0.6;
    for (let b = 0; b < BULLETS; b++) {
      if (!prev.bLive[b] || s.bLive[b]) continue;
      const d = (s.bx[b] - cx) * (s.bx[b] - cx) + (s.by[b] - cy) * (s.by[b] - cy);
      if (d < far) { far = d; x = s.bx[b]; y = s.by[b]; z = rooms ? s.bz[b] : 0; }
    }
    const k = flashSlot();
    flashAt[k] = x; flashAt[k + 1] = y; flashAt[k + 2] = rooms ? z : 0; flashAt[k + 3] = 0; flashAt[k + 4] = FLASH_LIFE; flashAt[k + 5] = 1;
  };
  // A burst of SHARD_FAN's shards from slot i's box middle, under a kill's flash.
  const burstFrom = (i) => {
    const s = sim.state, x = s.ex[i], y = s.ey[i] + ORIGIN_OF[s.eType[i]], z = rooms ? s.ez[i] : 0, f = flashSlot();
    flashAt[f] = x; flashAt[f + 1] = y; flashAt[f + 2] = z; flashAt[f + 3] = 0; flashAt[f + 4] = KILL_LIFE; flashAt[f + 5] = FLASH_KILL;
    for (let n = 0; n < SHARDS_PER; n++) {
      const k = shardNext * 7;
      shardAt.set(SHARD_FAN[n], k);
      shardAt[k] = x; shardAt[k + 1] = y; shardAt[k + 2] = z;
      shardNext = (shardNext + 1) % SHARDS;
    }
  };
  // A node at the x, y and depth at[k..k+2]: off a room written straight in (handing the numbers to `place` would box
  // them every frame), in a room through `place`'s projection.
  const setAt = (node, k, at) => {
    if (rooms) { place(node, at[k], at[k + 1], at[k + 2]); return; }
    node.position.x = at[k]; node.position.y = at[k + 1]; node.position.z = 0;
    node.scale.x = node.scale.y = node.scale.z = 1;
  };
  // The flashes and shards in flight this frame, aged by dt.
  const drawHits = (dt) => {
    for (let f = 0; f < FLASHES; f++) {
      const k = f * 6, node = flashNodes[f], age = flashAt[k + 3], life = flashAt[k + 4];
      node.visible = age < life;
      if (!node.visible) continue;
      setAt(node, k, flashAt);
      const grow = flashAt[k + 5] * ((1 - FLASH_GROW) + FLASH_GROW * Math.sin(age / life * Math.PI));
      node.scale.x *= grow; node.scale.y *= grow;
      node.rotation.z = age * 9;
      node.position.z += 0.2;
      flashAt[k + 3] = age + dt;
    }
    for (let n = 0; n < SHARDS; n++) {
      const k = n * 7, node = shardNodes[n], age = shardAt[k + 6];
      node.visible = age < SHARD_LIFE;
      if (!node.visible) continue;
      shardAt[k] += shardAt[k + 3] * dt; shardAt[k + 1] += shardAt[k + 4] * dt; shardAt[k + 4] -= SHARD_G * dt;
      setAt(node, k, shardAt);
      const left = 1 - age / SHARD_LIFE;
      node.scale.x *= left; node.scale.y *= left; node.scale.z *= left;
      node.rotation.z = age * 12 + n;
      node.position.z += 0.2;
      shardAt[k + 6] = age + dt;
    }
  };
  // A winding printer's soot and embers this frame: puffs owed by its wind taken from the pool at its top, then every
  // puff in flight risen, drifted, swollen and faded (an ember shrinks), all on the sim's clock (`simDt`), so a paused run's
  // smoke hangs where it is. Math.random only places them: a puff is a throwaway effect.
  const drawSmoke = () => {
    const dt = simDt;
    const s = sim.state, L = raidModels.looks();
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const w = eWind[i];
      if (w < 0) { eSmoke[i] = 0; continue; }
      eSmoke[i] += (SMOKE_FROM + SMOKE_UP * w) * simDt;
      const face = eTurned[i] ? -1 : 1;
      for (let n = 0; n < SMOKE_STEP && eSmoke[i] >= 1; n++) {
        eSmoke[i] -= 1;
        const k = smokeNext * 8, kind = smokeNext % 3 === 2 ? 2 : smokeNext & 1;
        smokeAt[k] = s.ex[i] + face * (0.45 * Math.random() - 0.2);
        smokeAt[k + 1] = s.ey[i] + 0.6 + 0.08 * Math.random();
        smokeAt[k + 2] = face * 0.25 * (Math.random() - 0.3);
        smokeAt[k + 3] = kind === 2 ? 1.3 + Math.random() : 0.6 + 0.5 * Math.random();
        smokeAt[k + 4] = 0;
        smokeAt[k + 5] = (kind === 2 ? 0.45 : SMOKE_LIFE) * (0.75 + 0.5 * Math.random());
        smokeAt[k + 6] = kind;
        smokeAt[k + 7] = 6.28 * Math.random();
        smokeNodes[smokeNext].geometry = L.smoke[kind];
        smokeNext = (smokeNext + 1) % SMOKES;
      }
      if (eSmoke[i] > SMOKE_STEP) eSmoke[i] = SMOKE_STEP;
    }
    for (let n = 0; n < SMOKES; n++) {
      const k = n * 8, node = smokeNodes[n], age = smokeAt[k + 4], life = smokeAt[k + 5];
      node.visible = age < life;
      if (!node.visible) continue;
      smokeAt[k] += smokeAt[k + 2] * dt;
      smokeAt[k + 1] += smokeAt[k + 3] * dt;
      const t = age / life, size = smokeAt[k + 6] === 2 ? 1 - t : (0.6 + 1.9 * t) * (t > 0.7 ? (1 - t) / 0.3 : 1);
      node.position.x = smokeAt[k];
      node.position.y = smokeAt[k + 1];
      node.position.z = 0.3;
      node.scale.x = node.scale.y = node.scale.z = size;
      node.rotation.z = smokeAt[k + 7] + age * 2;
      smokeAt[k + 4] = age + dt;
    }
  };
  // Weight (see HITSTOP_PART). `hold` holds the campaign's step `seconds` (the longer of it and a hold running); `jolt`
  // starts a shake of `size` m eased out over `life` s, unless one at least as big still runs.
  const hold = (seconds) => {
    if (seconds > hitstop) hitstop = seconds;
  };
  const jolt = (size, life) => {
    if (shakeAge < shakeLife && shakeAmp * (1 - shakeAge / shakeLife) >= size) return;
    shakeAmp = size;
    shakeLife = life;
    shakeAge = 0;
  };
  // The shake this frame, once `draw` has placed the camera: the camera and the frame moved by one offset, two sines
  // under a size easing out with the square of the shake's age, so the play shakes inside a steady frame.
  const shakeView = (dt) => {
    if (shakeAge >= shakeLife) return;
    shakeAge += dt;
    shakeT += dt;
    const k = shakeAge < shakeLife ? 1 - shakeAge / shakeLife : 0, a = shakeAmp * k * k;
    const ox = a * Math.sin(shakeT * 83), oy = a * Math.sin(shakeT * 61 + 1.7);
    camera.position.x += ox;
    camera.target.x += ox;
    camera.position.y += oy;
    camera.target.y += oy;
    frameLayer.position.x += ox;
    frameLayer.position.y += oy;
  };
  // The boss card and the weapon callouts the state calls for against the last seen, after displayed frames and the
  // debug `simulate` alike: a boss with a title standing for the first time this sim, while the stage plays; and each
  // Ooga's pickup, as its state shows it: a weapon other than the one a death hands back, rapid fire turned on, or the
  // barrier lifted to its full term (never under the everlasting barrier, which refills it every step). CARDED marks
  // the types already carded this sim, so two titled types standing together each card once.
  const calls = () => {
    const s = sim.state;
    if (cardSim !== sim) {
      cardSim = sim;
      CARDED.fill(0);
    }
    if (campaign.state.phase === CPHASE.PLAY) {
      for (let i = 0; i < ENEMY_SLOTS; i++) {
        const t = s.eType[i];
        if (CARDED[t] || !TITLES[t] || s.eRoutine[i] >= DESTROYED[t]) continue;
        CARDED[t] = 1;
        cardTitle = TITLES[t];
        cards++;
        raidHud.bossCard(cardTitle, BOSS_CARD_MS);
        audio.cues.bossCard();
        break;
      }
    }
    const base = runBits & raidSim.CHEAT.SPREAD ? raidSim.WEAPON.FAN : raidSim.WEAPON.RIFLE, keep = runBits & raidSim.CHEAT.BARRIER;
    for (let p = 0; p < players; p++) {
      let kind = -1;
      if (s.pWeapon[p] !== prev.weapon[p] && s.pWeapon[p] !== base) kind = s.pWeapon[p];
      else if (s.pRapid[p] && !prev.rapid[p]) kind = CALL_RAPID;
      else if (!keep && s.pBarrier[p] > prev.barrier[p] + 0.25 && s.pBarrier[p] <= RULES.BARRIER) kind = CALL_BARRIER;
      if (kind < 0) continue;
      callText = CALLS[players === 2 ? p + 1 : 0][kind];
      callCount++;
      raidHud.callout(callText, CALL_MS);
      audio.cues.callout();
    }
  };
  // The cues this frame's state calls for against the last frame's: one shot a player volley, the Legion's shots, hits,
  // kills, a bullet spent on a shut enemy, the vault opening, items taken, extra lives, deaths, drops and the phase; a
  // boss's part destroyed (a slot linked by `eLink` to a boss that stands) and the boss's final break, the big one, once:
  // its slot reaching its destroyed routine, or emptied on the step it did (a boss that submerges or changes phase
  // breaks once); a room's barrier opening (the boss room's clear has the fanfare); a lift on the screen setting off, a
  // span's fuse starting and a tripwire's warning starting.
  const cues = () => {
    const s = sim.state, c = audio.cues;
    for (let p = 0; p < PLAYERS; p++) {
      const state = s.pState[p];
      if (state !== prev.pState[p]) {
        if (state === PSTATE.DEAD) {
          c.death();
          jolt(SHAKE_DEATH, SHAKE_LIFE);
        } else if (state === PSTATE.DROP) c.drop();
      }
      if (s.pLives[p] > prev.lives[p]) c.oneUp();
    }
    prev.volley.fill(-1);
    let clank = false;
    for (let b = 0; b < BULLETS; b++) {
      if (s.bLive[b]) {
        if (!prev.bLive[b] || s.bAge[b] < prev.bAge[b]) prev.volley[s.bOwner[b]] = s.bKind[b];
      } else if (prev.bLive[b] && !clank) {
        // Spent this frame where it was last drawn: inside a shut enemy's bullet box (at its depth, in a room), it struck
        // and did nothing.
        for (let i = 0; i < ENEMY_SLOTS; i++) {
          const t = s.eType[i];
          if (t === ENEMY.FREE || !(s.eFlags[i] & FLAG.SHUT) || (rooms && Math.abs(s.bz[b] - s.ez[i]) > 2 * ROOM.HIT_DEPTH)) continue;
          if (inBox(RULES.SHOT_BOX[TIER_OF[t]], s.bx[b] - s.ex[i], s.by[b] - s.ey[i] - ORIGIN_OF[t])) { clank = true; break; }
        }
      }
    }
    for (let p = 0; p < PLAYERS; p++) if (prev.volley[p] >= 0) c.shot(prev.volley[p]);
    if (clank) c.shut();
    let shots = false, hit = false, pop = false, boom = false, taken = false, open = false, part = false, bossDown = false, bossStood = false, big = false;
    // A wind-up starting (FLAG.WIND rising on a slot that stays its type): a printer's motor, a boss's big one, or a tick
    // (TELL_HEARD's types only; a soldier's is silent).
    let windUp = false, tellBig = false, tell = false;
    for (let i = 0; i < ENEMY_SLOTS; i++) if (isBoss(prev.eType[i]) && prev.eRoutine[i] < DESTROYED[prev.eType[i]]) bossStood = true;
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const t = s.eType[i], was = prev.eType[i];
      if (t === ENEMY.SHOT && was !== ENEMY.SHOT) shots = true;
      if (t === was && s.eFlags[i] & FLAG.WIND && !(prev.eFlags[i] & FLAG.WIND)) {
        if (t === ENEMY.PRINTER) windUp = true;
        else if (s.eFlags[i] & FLAG.BIG) tellBig = true;
        else if (TELL_HEARD[t]) tell = true;
      }
      // The boss's final break: its slot at its destroyed routine, or emptied by the clear on the step it got there.
      if (isBoss(was) && prev.eRoutine[i] < DESTROYED[was] && (t !== was || s.eRoutine[i] >= DESTROYED[was])) bossDown = true;
      if (t === was && HAS_HP[t] && s.eHp[i] < prev.eHp[i]) {
        const link = s.eLink[i];
        flashHit(i);
        if (s.eHp[i] === 0) burstFrom(i);
        if (s.eHp[i] === 0 && BIG_BOOM[t]) big = true;
        if (s.eHp[i] > 0) hit = true;
        else if (!isBoss(t)) {
          // A boss's own fall is its break, above.
          if (bossStood && link >= 0 && isBoss(prev.eType[link])) part = true;
          else if (s.eFlags[i] & FLAG.MACHINE) boom = true;
          else pop = true;
        }
      }
      if (t === ENEMY.VAULT && was === ENEMY.VAULT && prev.eFlags[i] & FLAG.SHUT && !(s.eFlags[i] & FLAG.SHUT)) open = true;
      if (was === ENEMY.ITEM && t !== ENEMY.ITEM) {
        for (let p = 0; p < PLAYERS; p++) {
          if (Math.abs(prev.ex[i] - s.px[p]) < TAKE_X && Math.abs(prev.ey[i] - s.py[p]) < TAKE_Y) taken = true;
        }
      }
    }
    if (shots) c.enemyShot();
    if (windUp) { c.windUp(TUNE.PRINTER_WINDUP); tellCues.windUp++; }
    if (tellBig) { c.tellBig(); tellCues.big++; }
    else if (tell) { c.tell(); tellCues.tell++; }
    if (hit) c.hit();
    if (pop) c.pop();
    if (boom) c.boom();
    if (bossDown) c.bossDown();
    else if (part) c.part();
    // Weight: the hold and the shake a boss's fall, a boss's part or a big blast calls for.
    if (bossDown) {
      hold(HITSTOP_DOWN);
      jolt(SHAKE_DOWN, SHAKE_DOWN_LIFE);
    } else if (part) {
      hold(HITSTOP_PART);
      jolt(SHAKE_PART, SHAKE_LIFE);
    }
    if (big) jolt(SHAKE_BOOM, SHAKE_LIFE);
    if (open) c.bossOpen();
    if (taken) c.pickup();
    if (rooms && s.roomPhase === ROOM_PHASE.OPEN && prev.roomPhase === ROOM_PHASE.FIGHT && s.room < sim.stage.rooms.length - 1) c.barrier();
    let lift = false, crumble = false, wire = false;
    for (let k = 0; k < prev.lift.length; k++) if (!prev.lift[k] && liftMoving(k, s.time) && liftShown(k)) lift = true;
    for (let k = 0; k < prev.crumble.length; k++) if (s.crumblePhase[k] === CRUMBLE.FUSE && prev.crumble[k] !== CRUMBLE.FUSE) crumble = true;
    if (rooms && s.room === prev.wireRoom && s.roomPhase !== ROOM_PHASE.ADVANCE) {
      const room = sim.stage.rooms[s.room];
      for (let k = 0, n = room.wires.length / 6; k < n; k++) if (prev.wire[k] !== WIRE.WARN && wireState(room, k, s.roomTime) === WIRE.WARN) wire = true;
    }
    if (lift) c.lift();
    if (crumble) c.crumble(TUNE.CRUMBLE_FUSE);
    if (wire) c.wire(TUNE.WIRE_WARN);
  };

  // The tune the campaign calls for: the stage's own from its start (a stage with none of its own, a test stage, plays
  // the first of its kind's), the boss's once the boss is in play (PHASE.BOSS: a side stage's or climb's boss, a rooms
  // stage's boss room), the clear's jingle through the stage card, game over's sting, the ending under its card, and
  // none on the results card, over the title card or once refused.
  const musicFor = () => {
    if (refusal || !introEl.hidden) return null;
    const cp = campaign.state.phase, phase = sim.state.phase;
    if (cp === CPHASE.END) return null;
    if (cp === CPHASE.OVER || phase === PHASE.OVER) return "over";
    if (cp === CPHASE.ENDING) return "ending";
    if (cp === CPHASE.TRANSITION || phase === PHASE.CLEAR) return "clear";
    if (phase === PHASE.BOSS) return "boss";
    return raidAudio.SONGS[sim.stage.id] ? sim.stage.id : KIND_MUSIC[sim.stage.kind];
  };

  // The lives a player has: the one in play and its reserves, the reserves alone while it lies dead (a drop in spends
  // one), none once out.
  const livesOf = (p) => {
    const s = sim.state, state = s.pState[p];
    return state === PSTATE.OUT ? 0 : state === PSTATE.DEAD ? s.pLives[p] : s.pLives[p] + 1;
  };
  const refreshHud = () => {
    const s = sim.state;
    raidHud.setLives(livesOf(0));
    raidHud.setContinues(runBits & raidSim.CHEAT.CONTINUES ? -1 : s.continues);
    raidHud.setScore(s.pScore[0]);
    raidHud.setWeapon(WEAPON_NAMES[s.pWeapon[0]], s.pRapid[0]);
    if (players === 2) raidHud.setTwo(livesOf(1), s.pScore[1], WEAPON_LINES[s.pRapid[1] ? 1 : 0][s.pWeapon[1]]);
    bossBar();
  };
  // The boss bar: the first boss standing (`isBoss`, short of its destroyed routine, with hit points left), its hit
  // points left of those it started with, the most seen in its slot since that boss appeared there (so a second boss
  // starts from its own); hidden with none, and while the campaign is not in play (game over's notice stands there).
  const bossBar = () => {
    const s = sim.state;
    let slot = -1;
    if (campaign.state.phase === CPHASE.PLAY) for (let i = 0; i < ENEMY_SLOTS; i++) if (isBoss(s.eType[i]) && s.eRoutine[i] < DESTROYED[s.eType[i]] && s.eHp[i] > 0) { slot = i; break; }
    if (slot < 0) {
      bossSlot = -1;
      raidHud.setBoss(-1);
      return;
    }
    if (slot !== bossSlot || s.eType[slot] !== bossType) {
      bossSlot = slot;
      bossType = s.eType[slot];
      bossStart = s.eHp[slot];
    } else if (s.eHp[slot] > bossStart) bossStart = s.eHp[slot];
    raidHud.setBoss(s.eHp[slot] / bossStart);
  };
  const bestScore = () => game.state.raid.best ? game.state.raid.best.score : 0;
  // The saved record to the HUD: the best score, the furthest stage reached (numbered and named) and a completed loop.
  const showBest = () => {
    const b = game.state.raid.best;
    raidHud.setBest(bestScore(), b ? `Stage ${b.stage + 1}: ${STAGES[b.stage].name}` : "", !!b && b.looped);
  };
  // The number a stage of the run goes by: its place in `STAGES` (the same as in the run but for a debug run over a
  // part of them), from 1.
  const stageNumber = (i) => {
    const at = STAGES.indexOf(stages[i]);
    return (at >= 0 ? at : i) + 1;
  };
  const runScore = () => players === 2 ? Math.max(sim.state.pScore[0], sim.state.pScore[1]) : sim.state.pScore[0];
  // The run's end, settled once as it reaches its end, whatever is shown after: a better score (the higher player's) is
  // the best, on the furthest stage reached, the loop is done once a loop has completed or its ending's card shows (a
  // run left under "Raid complete" has finished the loop), and its tickets are paid. A new run is the only thing that
  // settles again.
  const settle = () => {
    if (settled) return;
    settled = true;
    const score = runScore();
    // A run with a secret on that changes the rules (`runCheats`) saves no record and pays nothing: the game refuses it.
    const r = game.settleRaid({ score, stage: furthest, looped: campaign.state.loops > 0 || campaign.state.phase === CPHASE.ENDING, tickets: raidSim.tickets(score), cheats: runCheats, start: runStart });
    newBest = r.best;
    paid = r.paid;
    showBest();
  };
  const showResults = () => {
    const s = sim.state, st = stages[campaign.state.stageIndex];
    resultsShown = true;
    raidHud.notice("", 0);
    raidHud.card(null);
    const rows = players === 2 ? [["Player 1", s.pScore[0]], ["Player 2", s.pScore[1]]] : [["Score", s.pScore[0]]];
    rows.push(["Stage", `${stageNumber(campaign.state.stageIndex)} · ${st.name}`]);
    if (campaign.state.loops > 0) rows.push(["Loop", campaign.state.loops + 1]);
    const lives = livesOf(0) + (players === 2 ? livesOf(1) : 0);
    if (lives > 0) rows.push(["Lives left", players === 2 ? `${livesOf(0)} · ${livesOf(1)}` : lives]);
    if (!(runBits & raidSim.CHEAT.CONTINUES)) rows.push(["Continues used", RULES.CONTINUES - s.continues]);
    rows.push(["Best", bestScore()]);
    const again = `${padsOn > 0 ? "A or Again" : COARSE ? "Again" : "Enter or Again"} starts a new raid.`;
    raidHud.results(rows, BL.game.raidCheated(runCheats, runStart) ? `Secrets bent the rules · no best, no tickets · ${again}` : `+${paid} ${paid === 1 ? "ticket" : "tickets"}${newBest ? " · new best" : ""} · ${again}`, "Raid over");
    showSection("results");
  };
  // The sim's phase moved: a stage cleared stands its notice while the campaign hands over.
  const onSimPhase = (phase) => {
    if (phase !== PHASE.CLEAR) return;
    raidHud.notice("Stage clear", 0);
    const i = STAGES.indexOf(sim.stage);
    if (i > furthestCleared) furthestCleared = i;
  };
  // The campaign's phase moved: the stage card through a transition or the ending (the next stage's art built under
  // it), game over waits for a press, the run's end is settled and shows its card. The calls go in the notice, kept on
  // one line in the raid.
  const onCampaign = (phase) => {
    const press = padsOn > 0 ? "A" : COARSE ? "Fire" : "Enter";
    if (phase === CPHASE.TRANSITION) {
      const next = campaign.state.stageIndex + 1;
      raidHud.card(`Stage ${stageNumber(next)}`, stages[next].name);
      audio.cues.card(STING_AT);
      prepare(stages[next]);
    } else if (phase === CPHASE.ENDING) {
      raidHud.card(`Loop ${campaign.state.loops + 2} next`, "Raid complete");
      prepare(stages[0]);
    } else if (phase === CPHASE.OVER) {
      overFor = 0;
      raidHud.card(null);
      const left = sim.state.continues;
      raidHud.notice(runBits & raidSim.CHEAT.CONTINUES ? `Game over · ${press} continues` : left > 0 ? `Game over · ${press} continues · ${left} left` : `Game over · ${press} ends the run`, 0);
    } else if (phase === CPHASE.END) {
      settle();
      showResults();
    } else {
      raidHud.card(null);
      raidHud.notice("", 0);
    }
  };
  // Both phases against the last seen: the sim's (a stage's own), then the campaign's.
  const phases = () => {
    if (sim.state.phase !== prev.phase) onSimPhase(sim.state.phase);
    if (campaign.state.phase !== campaignPhase) {
      campaignPhase = campaign.state.phase;
      onCampaign(campaignPhase);
    }
  };

  // The backdrop's nodes for a side or climb stage's backdrop, made again only when it changes: the sky riding with the
  // camera, the far layers at their own rates.
  const showBackdrop = (back) => {
    if (back === shownBack) return;
    shownBack = back;
    for (const node of skyLayer.children) node.parent = null;
    skyLayer.children.length = 0;
    for (const node of layerNodes) removeChild(root, node);
    layerNodes.length = layerRates.length = layerYs.length = 0;
    for (const band of back.sky) addChild(skyLayer, createNode({ geometry: band.geometry, position: { x: 0, y: band.y, z: band.z } }));
    for (const layer of back.layers) {
      const node = createNode({ geometry: layer.geometry, position: { x: 0, y: layer.y, z: layer.z } });
      layerNodes.push(node);
      layerRates.push(layer.rate);
      layerYs.push(layer.y);
      addChild(root, node);
    }
  };
  // The current sim's stage placed: its sectors and the moving pieces of a side stage or climb, or a room's shell (placed
  // as each room starts); the backdrop off in a room, which covers the screen, and the shadows off there (the flat shell
  // stands metres behind what casts); the stage's fog; every pooled node back to the plane.
  const showStage = () => {
    const stage = sim.stage, p = prepare(stage);
    shown = p;
    for (const node of stageNodes) removeChild(root, node);
    stageNodes.length = liftNodes.length = plankNodes.length = flagNodes.length = flagWays.length = 0;
    beltNodes.length = bodyNodes.length = surfaceNodes.length = raftNodes.length = raftBasins.length = stirNodes.length = blizzardNodes.length = cylinderNodes.length = 0;
    auroraNode = snowNode = blazeNode = null;
    rooms = stage.kind === "rooms";
    const put = (geometry, list, x = 0, y = 0) => {
      const node = createNode({ geometry, position: { x, y, z: 0 } });
      stageNodes.push(node);
      if (list) list.push(node);
      return node;
    };
    for (const geometry of p.sectors) put(geometry);
    for (const lift of p.lifts) put(lift.geometry, liftNodes);
    for (const plank of p.planks) put(plank.geometry, plankNodes);
    if (p.gale) for (const spot of p.gale.spots) {
      put(p.gale.pole, null, spot.x, spot.y);
      put(p.gale.limp, flagNodes, spot.x, spot.y);
      // The way its zone blows (0, by turns): the zone holding the flag's row.
      const row = Math.round(spot.y / CELL), zone = stage.gusts.find((g) => row >= g[0] && row <= g[1]);
      flagWays.push(zone ? zone[2] : 0);
    }
    for (const belt of p.belts) put(belt.chevrons || belt.geometry, beltNodes);
    for (const basin of p.water) {
      put(basin.body, bodyNodes);
      put(basin.foam, surfaceNodes);
      for (const raft of basin.rafts) {
        put(raft.geometry, raftNodes);
        raftBasins.push(basin);
      }
    }
    if (p.weather) {
      auroraNode = put(p.weather.aurora.geometry);
      snowNode = put(p.weather.snow);
    }
    for (const zone of p.storm) {
      put(zone.stir, stirNodes);
      put(zone.blizzard(-1), blizzardNodes);
    }
    for (const cylinder of p.cylinders) put(cylinder.geometry, cylinderNodes);
    if (p.dress) {
      put(p.dress.tower);
      blazeNode = put(p.dress.blaze);
    }
    // What shows only by the sim's state starts hidden, until the frame draws it.
    for (const list of [stirNodes, blizzardNodes, cylinderNodes]) for (const node of list) node.visible = false;
    if (snowNode) snowNode.visible = false;
    if (blazeNode) blazeNode.visible = false;
    addChild(root, ...stageNodes);
    if (p.back) showBackdrop(p.back);
    roomView.visible = rooms;
    skyLayer.visible = !rooms;
    for (const node of layerNodes) node.visible = !rooms;
    frontNode.visible = false;
    const light = p.looks.keyed[ENEMY.SEARCHLIGHT];
    for (const node of coneNodes) node.geometry = light && light.cone || null;
    for (const node of cableNodes) node.geometry = p.boss ? p.boss.cable() : null;
    for (const node of lampNodes) node.visible = false;
    for (const node of poolNodes) node.visible = false;
    for (const node of coneNodes) node.visible = false;
    for (const node of cableNodes) node.visible = false;
    RENDER_OPTS.shadowStrength = rooms ? 0 : 1;
    RENDER_OPTS.fog.set(p.fog);
    RENDER_OPTS.clear.set(p.fog);
    lastRoom = -1;
    roomArt = null;
    eTurned.fill(0);
    eKey.fill(null);
    for (const node of riderNodes) node.visible = false;
    for (const node of bulletNodes) { node.position.z = 0; node.scale.x = node.scale.y = node.scale.z = 1; }
    for (const node of enemyNodes) { node.position.z = 0; node.rotation.z = 0; node.scale.x = node.scale.y = node.scale.z = 1; }
    const i = STAGES.indexOf(stage);
    if (i > furthest) furthest = i;
    sizeTerrain();
    bossSlot = -1;
    const s = sim.state;
    Object.assign(walkView, { pState: s.pState, pPose: s.pPose, pAim: s.pAim, pFace: s.pFace, pDuck: s.pDuck, pInvincible: s.pInvincible, pTimer: s.pTimer, px: s.px, py: s.py });
  };
  // The campaign handed over to a new sim: its stage placed, the cues' memory taken from it (so the new stage sounds
  // only its drop), and every key held let go, so nothing held under the stage card reaches it.
  const stageStarted = () => {
    sim = campaign.sim;
    showStage();
    sync();
    releaseAll();
    audio.cues.drop();
  };

  const newRun = (seed = Date.now() >>> 0) => {
    // The run's secrets from the save: the rules ones into the campaign, the stage select's stage (on the full run only).
    takeSecrets();
    const start = runStart = runCheats.includes("stages") && stages === STAGES ? game.state.raid.start : 0;
    raidHud.setCheated(BL.game.raidCheated(runCheats, start));
    campaign = raidCampaign.create({ seed, players, stages, cheats: runBits, start });
    sim = campaign.sim;
    campaignPhase = campaign.state.phase;
    furthest = 0;
    furthestCleared = -1;
    showStage();
    sync();
    resultsShown = false;
    settled = newBest = false;
    paid = 0;
    // No hold, shake, latched press, boss card or callout carries into a new run.
    hitstop = shakeAge = shakeLife = 0;
    latched = latched2 = 0;
    raidHud.clearCalls();
    raidHud.notice("", 0);
    raidHud.card(null);
    raidHud.setPaused(false);
    showSection(introShown ? null : "play");
  };
  // The run may pause once the title card has closed, while it has not ended or been refused.
  const mayPause = () => !refusal && introEl.hidden && !resultsShown && campaign.state.phase !== CPHASE.END;
  // Pause or resume: the campaign holds (no step, no button reaches the sim), the sound rests and the pause card shows;
  // every key held is let go either way, so nothing pressed under the card reaches the sim after it.
  const setPause = (on) => {
    if (on && !mayPause()) return;
    if (!!campaign.state.paused === on) return;
    campaign.pause(on);
    raidHud.setPaused(on);
    releaseAll();
    audio.pause(on);
    if (on) audio.quiet();
  };
  // One player or two, from the title card: player 2's Ooga built or dropped, its HUD shown or hidden, and a new run
  // for that many.
  const choosePlayers = (n) => {
    markPlayers(n);
    if (n === players) return;
    players = chosen = n;
    if (crews.length && n === 2 && crews.length === 1) crews.push(raidCrew.create({ root, name: playerTwo }));
    else if (n === 1 && crews.length === 2) crews.pop().dispose();
    raidHud.setPlayers(n);
    releaseAll();
    fitDirty = true;
    newRun();
  };
  // Game over: a continue while continues last, else the run ends (its card follows from the phase).
  const proceed = () => {
    if (campaign.state.phase !== CPHASE.OVER) return;
    raidHud.notice("", 0);
    if (sim.state.continues > 0) {
      campaign.continueRun();
      sync();
      audio.cues.continue();
    } else campaign.endRun();
  };
  // A touch press (Fire or Jump!) moves on from game over once it has shown OVER_HOLD, so a held thumb does not skip it.
  const onTouchPress = () => {
    if (refusal || campaign.state.paused || campaign.state.phase !== CPHASE.OVER || overFor < OVER_HOLD) return false;
    proceed();
    return true;
  };
  // A touch button held down sends its bit while a pointer holds it. `seen` notes a step sent it, so the click that
  // follows the hold does not press again; a tap too quick for any step still presses once, through its click.
  const holdButton = (el, bit) => {
    const h = { el, bit, id: -1, seen: false, tap: false, down: null, up: null };
    h.down = (e) => {
      if (h.id !== -1) return;
      h.seen = false;
      if (onTouchPress()) {
        h.seen = true;
        return;
      }
      h.id = e.pointerId;
      el.setPointerCapture(e.pointerId);
    };
    h.up = (e) => {
      if (e.pointerId === h.id) h.id = -1;
    };
    el.addEventListener("pointerdown", h.down);
    el.addEventListener("pointerup", h.up);
    el.addEventListener("pointercancel", h.up);
    el.addEventListener("lostpointercapture", h.up);
    return h;
  };
  const dropHold = (h) => {
    h.el.removeEventListener("pointerdown", h.down);
    h.el.removeEventListener("pointerup", h.up);
    h.el.removeEventListener("pointercancel", h.up);
    h.el.removeEventListener("lostpointercapture", h.up);
  };
  const clicked = (h) => {
    if (!h.seen && campaign.state.phase !== CPHASE.OVER) h.tap = true;
    h.seen = false;
  };
  // The DOM's sections: Jump! shows on touch with Fire, and the move stick, only in play, never over the title or
  // results card (the stick is the page's, so it is hidden by visibility, which its own code never sets).
  const showSection = (section) => {
    raidHud.show(section);
    hud.el.act.hidden = section !== "play" || !COARSE;
    if (stickEl) stickEl.style.visibility = section === "play" ? "" : "hidden";
  };
  const toggleMute = () => {
    audio.setMuted(!audio.muted);
    raidHud.el.mute.setAttribute("aria-pressed", String(audio.muted));
    hud.toast(audio.muted ? "Sound off" : "Sound on");
  };

  // The gate: null when this visitor may play, else the words that say why not. With accounts, only a signed-in
  // visitor; an account look that did not come back cannot confirm one, so it shuts the game too.
  const refusalFor = (account) => !account.resolved ? UNCHECKED : account.backend && !account.me ? SIGN_IN : null;
  // Refused: the run holds, the words show, and REFUSE_BEAT later the visitor goes back home (update sends them).
  const refuse = (words) => {
    if (refusal) return;
    refusal = words;
    refuseIn = REFUSE_BEAT;
    setPause(false);
    releaseAll();
    audio.quiet();
    hud.toast(words);
  };
  // A sign-out during the visit shuts the game as the gate would have.
  const onAccount = (account) => {
    const words = refusalFor(account);
    if (words) refuse(words);
  };
  // Who plays: the visitor's own Ooga when signed in, else the one that walked in if the visitor may drive it, else the
  // first on the roster they may (the arcade's rule; with no backend any may). Player 2 is the roster's next Ooga after
  // player 1's (counting from the first, when player 1's is not on it) that looks unlike player 1: a look of its own or
  // other hashed hair first, then other skin, else the plain next one, or player 1's own look again on a roster of one.
  // Picked once a visit.
  const mayPick = (c) => !BL.net.mayDrive(c.name, contributors.stateFor(c) === "working");
  const playerName = (pilot) => {
    const own = BL.net.ownCharacter();
    if (own) return own.handle;
    // The visitor's assigned Ooga, as every game plays it (`net.ownAmong`).
    const assigned = BL.net.ownAmong(contributors.activeRoster);
    if (assigned) return assigned;
    const walked = pilot && contributors.roster.find((c) => c.name === pilot);
    return walked && mayPick(walked) ? pilot : contributors.activeRoster.find(mayPick)?.name;
  };
  const secondName = (first) => {
    const list = contributors.activeRoster, at = list.findIndex((c) => c.name === first), one = contributors.traitsFor(first);
    let skin = null, next = null;
    for (let k = 1; k <= list.length; k++) {
      const name = list[(at + k) % list.length].name;
      if (name === first) continue;
      const two = contributors.traitsFor(name), custom = Object.keys(BL.characters.get(name)?.look || {}).length > 0;
      if (custom || two.hair !== one.hair) return name;
      if (skin === null && two.skin !== one.skin) skin = name;
      if (next === null) next = name;
    }
    return skin ?? next ?? first;
  };

  // The 8 by 7 screen under the header, from the canvas's CSS size; read only after a resize, never every frame. Wide
  // or tall, whichever shows the screen larger with the strip clear of it; the choice goes to the strip's stylesheet.
  const fit = () => {
    fitDirty = false;
    viewW = Math.max(1, canvas.clientWidth);
    viewH = Math.max(1, canvas.clientHeight);
    headerPx = header ? Math.min(viewH * 0.5, Math.max(0, header.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top)) : 0;
    const free = viewH - headerPx, row = ROW_PX + (players === 2 ? ROW2_PX : 0);
    // CSS pixels a metre in each layout; either keeps BOSS_PX clear over the screen for the boss bar, and wide keeps
    // the frame's bottom rim and BOSS_GAP under it in the view.
    const wide = Math.max(1e-3, Math.min(FIT_WIDE * free / SCREEN_Y, (free - BOSS_PX - 2 * BOSS_GAP) / (SCREEN_Y + RIM), (viewW - 2 * SIDE_PX) / SCREEN_X));
    const tall = Math.max(1e-3, Math.min(FIT_TALL * viewW / SCREEN_X, (free - row - BOSS_PX) / SCREEN_Y));
    const isWide = wide >= tall, scale = isWide ? wide : tall, k = 1 / scale;   // k: metres a CSS pixel
    // The screen's top edge in CSS pixels: centred in the height under the header when wide, high under it when tall,
    // and never closer to the header than the boss bar needs.
    const top = headerPx + Math.max(BOSS_PX, isWide ? (free - SCREEN_Y * scale) / 2 : TOP_GAP * scale);
    camera.orthoHeight = viewH * k;
    targetY = SCREEN_Y - (viewH / 2 - top) * k;
    // Wide, the strip's panels stand beside the frame, level with its top (`--raid-screen-edge`, the frame's distance
    // from each side of the view, which the stylesheet sets them off); tall, in a row under it, above the touch controls.
    hudY = isWide ? top - RIM * scale : top + SCREEN_Y * scale + HUD_GAP;
    raidHud.el.raid.dataset.raidFit = isWide ? "wide" : "tall";
    raidHud.el.raid.style.setProperty("--raid-hud-top", `${Math.round(hudY)}px`);
    raidHud.el.raid.style.setProperty("--raid-screen-edge", `${Math.round(viewW / 2 - (SCREEN_X / 2 + RIM) * scale)}px`);
    raidHud.el.raid.style.setProperty("--raid-card-top", `${Math.round(viewH / 2 - (SCREEN_Y * (1 - CARD_AT) - targetY) * scale)}px`);
    raidHud.el.raid.style.setProperty("--raid-boss-top", `${Math.round(top - BOSS_PX + BOSS_GAP / 2)}px`);
    // The calls (stage clear, way open, game over) hang just inside the screen's top edge in either layout, on the play
    // and never down among a phone's thumb controls.
    raidHud.el.raid.style.setProperty("--raid-notice-top", `${Math.round(top + 2 * BOSS_GAP)}px`);
    raidHud.el.raid.style.setProperty("--raid-boss-w", `${Math.round(SCREEN_X * scale * BOSS_W)}px`);
    // The weapon callout, CALL_AT of the way down the screen, over the lower play.
    raidHud.el.raid.style.setProperty("--raid-call-top", `${Math.round(top + SCREEN_Y * CALL_AT * scale)}px`);
  };

  // A room's art placed as the room starts (never every frame): its shell, front edge, barrier and doors on the back
  // wall from the sim's room data, its tripwires and hatch lamps (shown by their state each frame) and the gauge's
  // needle; the minimal shell's in a stage with no art. A door's drops blink the lamp of its hatch: the art makes one a
  // door that DROP_GUARD waves come through, in the order the waves first name them.
  const placeRoom = (room) => {
    const data = sim.stage.rooms[room], doors = data.doors, r = shown.shells[room] || null, R = r || roomKit();
    roomArt = r;
    shellNode.geometry = R.shell;
    barrierNode.geometry = R.barrier;
    frontNode.visible = !!r;
    if (r) frontNode.geometry = r.front;
    for (let i = 0; i < DOORS; i++) {
      const node = doorNodes[i];
      node.geometry = R.door;
      node.visible = i < doors.length;
      if (node.visible) node.position.x = projectX(doors[i], 1);
    }
    for (let k = 0; k < WIRES; k++) {
      wireNodes[k].visible = false;
      if (r && k < r.wires.length) wireNodes[k].geometry = r.wires[k].geometry;
    }
    for (let k = 0; k < LAMPS; k++) {
      lampNodes[k].visible = false;
      if (r && k < r.lamps.length) lampNodes[k].geometry = r.lamps[k].geometry;
    }
    lampOfDoor.fill(-1);
    if (r) for (let d = 0; d < doors.length; d++) lampOfDoor[d] = r.lamps.findIndex((lamp) => lamp.door === doors[d]);
    needleNode.visible = !!(r && r.needle);
    if (needleNode.visible) {
      needleNode.geometry = r.needle.geometry;
      needleNode.position.x = r.needle.x;
      needleNode.position.y = r.needle.y;
    }
  };
  // The nearest Ooga in play to x, by x (ties to player 0), which the shooters face; -1 with none.
  const nearest = (s, x) => {
    let best = -1, far = Infinity;
    for (let p = 0; p < PLAYERS; p++) {
      if (s.pState[p] !== PSTATE.NORMAL && s.pState[p] !== PSTATE.DROP) continue;
      const d = Math.abs(s.px[p] - x);
      if (d < far) { far = d; best = p; }
    }
    return best;
  };
  // A node at (x, y) and depth z of a room: projected, scaled and set back by its depth. Off a room, depth is 0.
  const place = (node, x, y, z) => {
    const k = 1 - ROOM.SHRINK * z;
    node.position.x = projectX(x, z);
    node.position.y = projectY(y, z);
    node.position.z = -DEPTH_Z * z;
    node.scale.x = node.scale.y = node.scale.z = k;
  };

  // `sim.state` out to the nodes. Allocation-free.
  const draw = () => {
    const s = sim.state, mid = s.camX + SCREEN_X / 2;
    camera.position.x = camera.target.x = mid;
    camera.position.y = camera.target.y = targetY + s.camY;
    camera.position.z = EYE_Z;
    camera.target.z = 0;
    RENDER_OPTS.shadowCenter.x = mid;
    RENDER_OPTS.shadowCenter.y = SCREEN_Y / 2 + s.camY;
    skyLayer.position.x = mid;
    skyLayer.position.y = s.camY;
    for (let i = 0; i < layerNodes.length; i++) {
      layerNodes[i].position.x = s.camX * (1 - layerRates[i]);
      layerNodes[i].position.y = layerYs[i] + s.camY * (1 - layerRates[i]);
    }
    frameLayer.position.x = s.camX;
    frameLayer.position.y = s.camY;
    if (rooms) {
      if (s.room !== lastRoom) {
        lastRoom = s.room;
        placeRoom(s.room);
      }
      barrierNode.visible = s.barrier !== 0;
      // The advance: the shell grows about the vanishing point, eased, until the back wall stands at the front.
      let grow = 1;
      if (s.roomPhase === ROOM_PHASE.ADVANCE) {
        const t = Math.min(1, Math.max(0, 1 - s.roomTimer / TUNE.ROOM_ADVANCE));
        grow = 1 + ADVANCE_GROW * t * t * (3 - 2 * t);
      }
      roomView.scale.x = roomView.scale.y = grow;
      roomView.position.x = VP_X * (1 - grow);
      roomView.position.y = VP_Y * (1 - grow);
      if (roomArt) roomPieces(s);
    } else sidePieces(s);
    const blinkOff = ((s.time * 12) | 0) & 1;
    const L = raidModels.looks(), K = shown.looks;
    for (let i = 0; i < BULLETS; i++) {
      const node = bulletNodes[i];
      node.visible = s.bLive[i] !== 0;
      if (!node.visible) continue;
      node.geometry = peels ? peelKit() : L.bullets[s.bKind[i]];
      if (rooms) {
        // Turned along its heading on the screen: its motion through the projection.
        const z = s.bz[i], vz = s.bvz[i], k = 1 - ROOM.SHRINK * z;
        place(node, s.bx[i], s.by[i], z);
        node.rotation.z = Math.atan2(k * s.bvy[i] + (ROOM.RISE - ROOM.SHRINK * s.by[i]) * vz, k * s.bvx[i] - ROOM.SHRINK * (s.bx[i] - ROOM.MID) * vz);
      } else {
        node.position.x = s.bx[i];
        node.position.y = s.by[i];
        node.rotation.z = Math.atan2(s.bvy[i], s.bvx[i]);
      }
      if (peels) node.rotation.z = s.bAge[i] * PEEL_SPIN;   // a peel spins as it flies
    }
    // A shut enemy wears its shut look, an item its own, a destroyed enemy blinks while it lies dying, and a look faces
    // the other way by its mirrored twin (FACES); a look with `pick` wears the one it names (and once fallen keeps the
    // last), a bill-bat flaps, a dark searchlight wears its dark look, a swelling look takes the size for the hits it has
    // taken and grows with its box, and a lob turns along its heading. A boss's parts are slots like any other (the sim
    // places them), so the art's boss placement is not read; a look's set-back piece (a screw, a stem, the Leviathan's
    // neck) rides with its slot, at the depth the look's `zByAttr` gives both.
    tellCount = windCount = ringCount = 0;
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const node = enemyNodes[i], type = s.eType[i], rider = riderNodes[i];
      if (type !== prev.eType[i]) {
        eTurned[i] = 0;
        eKey[i] = null;
        eShutAt[i] = -1;
        eTellAt[i] = -1;
      }
      node.visible = type !== ENEMY.FREE && !(HAS_HP[type] && s.eHp[i] === 0 && blinkOff);
      rider.visible = false;
      heatNodes[i].visible = false;
      tellNodes[i].visible = false;
      eWind[i] = -1;
      // Winding up to attack (FLAG.WIND), while it stands.
      const told = type !== ENEMY.FREE && (s.eFlags[i] & FLAG.WIND) !== 0 && s.eRoutine[i] < DESTROYED[type];
      if (!told) eTellAt[i] = -1;
      else tellCount++;
      if (!node.visible) continue;
      const faces = FACES[type];
      if (faces === FACE_RUN) {
        if (s.evx[i] > 0.01) eTurned[i] = 1;
        else if (s.evx[i] < -0.01) eTurned[i] = 0;
      } else if (faces === FACE_FLY) {
        if (s.evx[i] < -0.01) eTurned[i] = 1;
        else if (s.evx[i] > 0.01) eTurned[i] = 0;
      } else if (faces === FACE_NEAREST) {
        const p = nearest(s, s.ex[i]);
        if (p >= 0) eTurned[i] = s.px[p] > s.ex[i] ? 1 : 0;
      }
      // `key` names the look worn, by which its wind-up look (if it has one) is found.
      let geo = K.open[type], grow = 1, key = "build";
      if (type === ENEMY.ITEM) geo = L.items[s.eAttr[i]];
      else if (type === ENEMY.LOB) geo = K.lob[s.eAttr[i]];
      else if (K.pick[type]) {
        if (eKey[i] === null || s.eRoutine[i] < DESTROYED[type]) eKey[i] = K.pick[type](s, i);
        geo = K.keyed[type][eKey[i]];
        key = eKey[i];
      }
      else {
        const shut = s.eFlags[i] & FLAG.SHUT;
        if (shut && K.shut[type]) { geo = K.shut[type]; key = "shut"; }
        if (eTurned[i] && (shut ? K.turnedShut[type] : K.turned[type])) { geo = shut ? K.turnedShut[type] : K.turned[type]; key = shut ? "turnedShut" : "turned"; }
        // A dark searchlight and a bill-bat's flap vary the unturned, open look (neither type has a turned twin).
        else if (!shut && type === ENEMY.SEARCHLIGHT && s.eRoutine[i] === LIGHT.DARK && K.keyed[type].dark) { geo = K.keyed[type].dark; key = "dark"; }
        else if (!shut && type === ENEMY.BILL_BAT && K.keyed[type].flap && ((s.time * FLAP + i) | 0) & 1) { geo = K.keyed[type].flap; key = "flap"; }
        if (SWELL[type] > 0 && s.eBurst[i] > 0) {
          const hit = (s.eBurst[i] - s.eHp[i]) / s.eBurst[i];
          grow = 1 + SWELL[type] * hit;
          if (!shut && K.swell[type]) { geo = K.swell[type][Math.min(K.swell[type].length - 1, Math.floor(hit * K.swell[type].length))]; key = "swell"; }
        }
      }
      if (told && K.winds[type] && K.winds[type][key]) { geo = K.winds[type][key]; windCount++; }
      // An emplacement opening (routine OPENING, still shut) wears the frame for how far its EMPLACE_OPEN has run, and
      // one shut for good the frames back again over the same time from the moment it was first drawn shut (`eShutAt`).
      if (EMPLACED[type]) {
        const r = s.eRoutine[i], frames = eTurned[i] && K.turnedOpening[type] ? K.turnedOpening[type] : K.opening[type];
        let open = -1;
        if (r === DESTROYED[type] - 1) {
          if (eShutAt[i] < 0) eShutAt[i] = s.time;
          open = 1 - (s.time - eShutAt[i]) / TUNE.EMPLACE_OPEN;
        } else {
          eShutAt[i] = -1;
          if (r === OPENING && s.eFlags[i] & FLAG.SHUT) open = 1 - s.eTimer[i] / TUNE.EMPLACE_OPEN;
        }
        if (frames && open > 0) {
          const f = Math.floor(open * (frames.length + 1)) - 1;
          if (f >= 0 && f < frames.length) geo = frames[f];
        }
      }
      // A printer winding up wears its spin frames, faster and faster (its shake, heat and smoke follow below and in
      // `drawSmoke`); a printer's shot is a dollar bill, the right way up whichever way it flies.
      if (type === ENEMY.PRINTER && s.eRoutine[i] === PRINTER_WIND && K.winding[type]) {
        const left = s.eTimer[i] / TUNE.PRINTER_WINDUP, wind = s.eBurst[i] > 0 || left <= 0 ? 1 : left >= 1 ? 0 : 1 - left;
        const frames = eTurned[i] && K.turnedWinding[type] ? K.turnedWinding[type] : K.winding[type];
        eWind[i] = wind;
        eSpin[i] += (SPIN_FROM + SPIN_UP * wind * wind) * simDt;
        geo = frames[Math.floor(eSpin[i]) % frames.length];
      } else eSpin[i] = 0;
      const bill = type === ENEMY.SHOT && s.eAttr[i] >= AIMS;
      if (bill) geo = s.evx[i] < 0 ? L.turnedBill : L.bill;
      if (!geo) throw new Error(`raid scene: no look for ${ENEMY_NAMES[type]} (attr ${s.eAttr[i]}) in BL.raidArt or raid-models`);
      node.geometry = geo;
      node.rotation.z = type === ENEMY.LOB ? Math.atan2(s.evy[i], s.evx[i]) : 0;
      node.rotation.x = 0;
      if (bill) {
        node.rotation.z = Math.atan2(s.evy[i], s.evx[i]) - (s.evx[i] < 0 ? Math.PI : 0) + BILL_SWAY * Math.sin(s.time * 13 + i * 2.1);
        node.rotation.x = BILL_FLIP * Math.sin(s.time * 9 + i * 1.3);
      }
      if (rooms) place(node, s.ex[i], s.ey[i], s.ez[i]);
      else {
        node.position.x = s.ex[i];
        node.position.y = s.ey[i];
        node.position.z = K.zBy[type] ? K.zBy[type][s.eAttr[i]] || 0 : 0;
        node.scale.x = node.scale.y = node.scale.z = 1;
      }
      if (grow !== 1) {
        node.scale.x *= grow;
        node.scale.y *= grow;
        node.scale.z *= grow;
      }
      if (eWind[i] >= 0) {
        // Winding: it shakes, harder as it winds, and its heat glows up over it.
        const w = eWind[i], heat = heatNodes[i];
        node.position.x += SHAKE * w * Math.sin(s.time * 71 + i * 1.7);
        node.position.y += SHAKE * 0.5 * w * Math.sin(s.time * 57 + i);
        heat.visible = true;
        heat.geometry = eTurned[i] && K.turnedHeat[type] ? K.turnedHeat[type] : K.heat[type];
        heat.position.x = node.position.x;
        heat.position.y = node.position.y;
        heat.position.z = node.position.z;
        heat.scale.x = node.scale.x;
        heat.scale.y = node.scale.y;
        heat.scale.z = node.scale.z;
        heat.glow = HEAT_FROM + (1 - HEAT_FROM) * w * (0.85 + 0.15 * Math.sin(s.time * 37 + i));
      }
      if (told) {
        // Its tell: the ring closing on its box's middle as the wind-up runs (see TELL_OUT), a big one's spiked and turning.
        const big = (s.eFlags[i] & FLAG.BIG) !== 0, ring = tellNodes[i];
        if (eTellAt[i] < 0 || eTellAt[i] > s.time) eTellAt[i] = s.time;
        // Where the attack leaves: the box's middle, but a Warden's tower top (a big one, or its aimed shot due, `evy`
        // its timer) or the floor its spark runs from, and an Engine's pod-phase gun.
        let atX = 0, atY = ORIGIN_OF[type], radius = TELL_R[type];
        if (type === ENEMY.GRID_WARDEN) {
          const top = big || s.evy[i] <= TELL_FOR, at = top ? TELL_WARDEN_TOP : TELL_WARDEN_SPARK;
          atX = at[0]; atY = top ? at[1] : at[1] + ORIGIN_OF[ENEMY.SPARK]; radius = TELL_MUZZLE_R;
        } else if (type === ENEMY.CHAIRMAN_ENGINE && !big) {
          atX = TELL_ENGINE_TOP[0]; atY = TELL_ENGINE_TOP[1]; radius = TELL_MUZZLE_R;
        }
        const k = Math.min(1, (s.time - eTellAt[i]) / (big ? TELL_FOR_BIG : TELL_FOR)), r = radius * (TELL_OUT + (TELL_IN - TELL_OUT) * k) * (big ? TELL_BIG : 1);
        ring.visible = true;
        ring.geometry = big ? L.bigTells[TELL_FAMILY[type]] : L.tells[TELL_FAMILY[type]];
        if (rooms) {
          place(ring, s.ex[i], s.ey[i] + ORIGIN_OF[type], s.ez[i]);
          ring.position.z += TELL_Z;
        } else {
          ring.position.x = node.position.x + atX * node.scale.x;
          ring.position.y = node.position.y + atY * node.scale.y;
          ring.position.z = node.position.z + TELL_Z;
          ring.scale.x = ring.scale.y = ring.scale.z = 1;
        }
        ring.scale.x *= r;
        ring.scale.y *= r;
        ring.rotation.z = big ? s.time * TELL_SPIN : 0;
        ring.glow = 0.45 + 0.55 * k * (0.8 + 0.2 * Math.sin(s.time * TELL_PULSE + i));
        ringCount++;
      }
      let ride = K.screw[type] || null;
      if (K.neck[type]) {
        ride = K.neck[type][eKey[i]];
        if (!ride) throw new Error(`raid scene: no neck for ${ENEMY_NAMES[type]}'s look ${eKey[i]}`);
      }
      if (ride) {
        rider.visible = true;
        rider.geometry = ride;
        rider.position.x = node.position.x;
        rider.position.y = node.position.y;
        rider.position.z = node.position.z;
        rider.scale.x = node.scale.x;
        rider.scale.y = node.scale.y;
        rider.scale.z = node.scale.z;
      }
    }
    if (shown.boss) bossLines(s);
    if (cylinderNodes.length || blazeNode) bossPieces(s);
  };
  // A room's own pieces this frame: each tripwire shown while live (blinking through its warning; none through the
  // advance), a hatch's lamp blinking while a drop guard waits in its warning over that hatch's door (`lampWarn` marks
  // the lamps warning, whatever the blink), the gauge's needle toward the open twin, and each searchlight's pool on the
  // front line (red while locked, none while dark) and its beam from the lamp.
  const roomPieces = (s) => {
    const room = sim.stage.rooms[s.room], blink = ((s.time * 8) | 0) & 1, advance = s.roomPhase === ROOM_PHASE.ADVANCE;
    for (let k = 0; k < roomArt.wires.length; k++) {
      const state = wireState(room, k, s.roomTime);
      wireNodes[k].visible = !advance && (state === WIRE.LIVE || state === WIRE.WARN && blink === 1);
    }
    lampWarn.fill(0);
    if (roomArt.lamps.length) for (let i = 0; i < ENEMY_SLOTS; i++) {
      if (s.eType[i] !== ENEMY.DROP_GUARD || s.eRoutine[i] !== DROP_WARN) continue;
      for (let d = 0; d < room.doors.length; d++) if (lampOfDoor[d] >= 0 && Math.abs(room.doors[d] - s.ex[i]) < 1e-3) lampWarn[lampOfDoor[d]] = 1;
    }
    for (let k = 0; k < roomArt.lamps.length; k++) lampNodes[k].visible = lampWarn[k] === 1 && blink === 1;
    if (roomArt.needle) {
      let swing = 0;
      for (let i = 0; i < ENEMY_SLOTS; i++) {
        if (s.eType[i] !== ENEMY.TWIN_CORE || s.eHp[i] === 0 || s.eFlags[i] & FLAG.SHUT) continue;
        swing += projectX(s.ex[i], s.ez[i]) < roomArt.needle.x ? NEEDLE_SWING : -NEEDLE_SWING;
      }
      needleNode.rotation.z = Math.max(-NEEDLE_SWING, Math.min(NEEDLE_SWING, swing));
    }
    const K = shown.looks.keyed[ENEMY.SEARCHLIGHT];
    let light = 0;
    if (K && K.pool) for (let i = 0; i < ENEMY_SLOTS && light < LIGHTS; i++) {
      if (s.eType[i] !== ENEMY.SEARCHLIGHT || s.eHp[i] === 0 || s.eRoutine[i] === LIGHT.DARK) continue;
      const pool = poolNodes[light], cone = coneNodes[light];
      light++;
      pool.visible = true;
      pool.geometry = s.eRoutine[i] === LIGHT.LOCKED && K.poolLocked ? K.poolLocked : K.pool;
      pool.position.x = s.evy[i];
      pool.position.y = POOL_Y;
      pool.position.z = POOL_Z;
      cone.visible = !!K.cone && !advance;
      if (!cone.visible) continue;
      const lx = projectX(s.ex[i], s.ez[i]), ly = projectY(s.ey[i], s.ez[i]), dx = s.evy[i] - lx, dy = POOL_Y - ly;
      cone.position.x = lx;
      cone.position.y = ly;
      cone.position.z = CONE_Z;
      cone.rotation.z = Math.atan2(dx, -dy);
      cone.scale.y = Math.hypot(dx, dy);
    }
    for (; light < LIGHTS; light++) poolNodes[light].visible = coneNodes[light].visible = false;
  };
  // A side stage's or climb's moving pieces this frame, all from the stage clock: each lift at its top (`liftTop`, which
  // the sim stands riders on), each crumbling plank whole, split and shaking through its fuse, or gone, the gale's flags
  // limp in the calm and streaming the way the gust blows, each belt's band run the belt's way, each tide basin's water
  // and rafts at its level (`tideLevel`, the row the sim stands waders and rafts by; the surface heaves while the tide
  // rises), the pass's aurora flaring through a gust's warning and its snow streaming through the blow, each storm zone's
  // bills stirring from the warning and its blizzard blowing the live way (`gustDir`) through the blow.
  const sidePieces = (s) => {
    const art = shown.art, st = sim.stage, t = s.time;
    for (let k = 0; k < liftNodes.length; k++) liftNodes[k].position.y = liftTop(st.lifts[k], t);
    for (let k = 0; k < plankNodes.length; k++) {
      const node = plankNodes[k], phase = s.crumblePhase[k];
      node.visible = phase !== CRUMBLE.GONE;
      node.geometry = phase === CRUMBLE.FUSE ? shown.planks[k].split : shown.planks[k].geometry;
      node.position.x = phase === CRUMBLE.FUSE ? PLANK_SHAKE * Math.sin(t * 60) : 0;
    }
    const gust = gustPhase(t);
    if (flagNodes.length) {
      const gale = shown.gale;
      for (let k = 0; k < flagNodes.length; k++) flagNodes[k].geometry = gust === GUST.CALM ? gale.limp : gustDir(flagWays[k], t) > 0 ? gale.taut : gale.tautLeft;
    }
    for (let k = 0; k < beltNodes.length; k++) {
      const belt = shown.belts[k];
      if (art.slide) art.slide(beltNodes[k], belt, t);
      else beltNodes[k].position.x = belt.shift(t);
    }
    if (bodyNodes.length) {
      const rise = tidePhase(t) === TIDE.RISE;
      for (let k = 0; k < bodyNodes.length; k++) {
        const basin = shown.water[k], level = tideLevel(st.tide.basins[basin.index], t);
        art.bodyAt(bodyNodes[k], basin, level);
        surfaceNodes[k].geometry = rise ? basin.swell : basin.foam;
        art.surfaceAt(surfaceNodes[k], basin, level);
      }
      for (let k = 0; k < raftNodes.length; k++) {
        const basin = raftBasins[k];
        art.raftAt(raftNodes[k], basin, tideLevel(st.tide.basins[basin.index], t));
      }
    }
    if (auroraNode) {
      const w = shown.weather, a = w.aurora;
      auroraNode.position.x = s.camX * (1 - a.rate);
      auroraNode.position.y = a.y + s.camY * (1 - a.rate);
      auroraNode.position.z = a.z;
      w.auroraAt(auroraNode, t, s.camX);
      w.snowAt(snowNode, t, s.camX, s.camY);
    }
    for (let k = 0; k < stirNodes.length; k++) {
      const zone = shown.storm[k], blizzard = blizzardNodes[k], d = gustDir(zone.dir, t);
      stirNodes[k].visible = gust !== GUST.CALM;
      blizzard.visible = gust === GUST.BLOW;
      if (!blizzard.visible) continue;
      blizzard.geometry = zone.blizzard(d);
      blizzard.position.x = zone.shift(t % GUST_PERIOD - BLOW_AT, d);
    }
  };
  // A side boss's own pieces this frame, from what its slots wear: each printing cylinder rolling while the Chairman's
  // Engine at its record stands open (its pick `build`), and the Grid Warden's blaze while it overloads; neither once the
  // boss has fallen.
  const bossPieces = (s) => {
    for (let k = 0; k < cylinderNodes.length; k++) {
      const c = shown.cylinders[k], node = cylinderNodes[k];
      node.visible = false;
      for (let i = 0; i < ENEMY_SLOTS && !node.visible; i++) node.visible = s.eType[i] === ENEMY.CHAIRMAN_ENGINE && s.eRoutine[i] < DESTROYED[ENEMY.CHAIRMAN_ENGINE] && eKey[i] === "build" && Math.abs(s.ex[i] - c.x) < CELL;
      if (node.visible) node.position.y = c.shift(s.time);
    }
    if (blazeNode) {
      blazeNode.visible = false;
      for (let i = 0; i < ENEMY_SLOTS && !blazeNode.visible; i++) blazeNode.visible = s.eType[i] === ENEMY.GRID_WARDEN && s.eRoutine[i] < DESTROYED[ENEMY.GRID_WARDEN] && eKey[i] === "overload";
    }
  };
  // A climb boss's lines: from each standing winch part linked to a main (its attr the main's ring it holds) to that
  // ring, which swells with the main.
  const bossLines = (s) => {
    const B = shown.boss;
    for (let k = 0; k < CABLES; k++) cableNodes[k].visible = false;
    for (let j = 0; j < ENEMY_SLOTS; j++) {
      const main = s.eLink[j], ring = s.eAttr[j];
      if (s.eType[j] !== ENEMY.TETHER || s.eHp[j] === 0 || main < 0 || s.eType[main] === ENEMY.FREE || ring >= B.RINGS.length || ring >= CABLES) continue;
      const grow = SWELL[s.eType[main]] > 0 && s.eBurst[main] > 0 ? 1 + SWELL[s.eType[main]] * (s.eBurst[main] - s.eHp[main]) / s.eBurst[main] : 1;
      cableNodes[ring].visible = true;
      B.cableAt(cableNodes[ring], s.ex[j], s.ey[j] + B.FAIRLEAD, s.ex[main] + B.RINGS[ring][0] * grow, s.ey[main] + B.RINGS[ring][1] * grow);
    }
  };
  // The view of one frame: the nodes, each Ooga's pose (striding through a room's advance) and the HUD.
  const view = (dt) => {
    // The sim's clock since the last frame (0 while paused, and as a new stage's sim starts again from 0).
    const t = sim.state.time;
    simDt = t > simWas ? t - simWas : 0;
    simWas = t;
    draw();
    shakeView(dt);
    const s = sim.state, posed = rooms && s.roomPhase === ROOM_PHASE.ADVANCE ? walkView : s;
    for (let p = 0; p < crews.length; p++) crews[p].pose(dt, posed, p, s, rooms);
    drawHits(dt);
    drawSmoke();
    refreshHud();
  };
  // A room's barrier opening, told once (the boss room's last core clears the stage instead).
  const roomCalls = () => {
    const s = sim.state;
    if (rooms && s.roomPhase === ROOM_PHASE.OPEN && prev.roomPhase !== ROOM_PHASE.OPEN && s.room < sim.stage.rooms.length - 1) {
      raidHud.notice(COARSE ? "Way open · push the stick up" : "Way open · hold up to walk on", 1600);
    }
  };

  const update = (dt) => {
    if (fitDirty) fit();
    pollPads();
    audio.tick();
    // Refused: nothing plays, and once the words have stood the visitor goes back (asked again until a transition
    // that was running has finished).
    if (refusal) {
      if (refuseIn > 0) refuseIn -= dt;
      else if (!leaving) leaving = go(home);
      introShown = !introEl.hidden;
      audio.setMusic(null);
      view(dt);
      sync();
      return;
    }
    padCards();
    // The title card holds the run: the campaign waits, the sound rests, and whatever was held as it closes is let go.
    // The Oogas drop in as it closes.
    const intro = !introEl.hidden;
    if (intro !== introShown) {
      introShown = intro;
      releaseAll();
      if (!intro) started = true;
      if (intro) audio.quiet();
      else if (sim.state.pState[0] === PSTATE.DROP) audio.cues.drop();
      showSection(intro ? null : resultsShown ? "results" : "play");
    }
    if (intro) {
      audio.setMusic(null);
      view(dt);
      sync();
      return;
    }
    // Paused: the campaign holds and nothing is sent; the view stands.
    if (campaign.state.paused) {
      view(dt);
      sync();
      return;
    }
    // Buttons reach the sim only while a stage plays: none under the stage card or the ending.
    let bits = 0, bits2 = 0;
    if (campaign.state.phase === CPHASE.PLAY) {
      if (debugRaid.autopilot) bits = raidSim.autopilot(sim);
      else {
        bits = keyMask | debugBits | padFor(0);
        if (pointerFire) bits |= IN.FIRE;
        if (fire.id !== -1 || fire.tap) bits |= fire.bit;
        if (jump.id !== -1 || jump.tap) bits |= jump.bit;
        if (COARSE) {
          const a = controls.read();
          if (a.x > STICK) bits |= IN.RIGHT;
          else if (a.x < -STICK) bits |= IN.LEFT;
          if (a.y > STICK) bits |= IN.UP;
          else if (a.y < -STICK) bits |= IN.DOWN;
        }
      }
      bits2 = keyMask2 | debugBits2 | padFor(1);
      // Mirror mode: the picture is flipped, so the way a player pushes on screen is the other way in the sim.
      if (mirror) {
        if (!debugRaid.autopilot) bits = swapLR(bits);
        bits2 = swapLR(bits2);
      }
    }
    // A hitstop holds the campaign's step (both players alike) and banks no time, then play goes on from where it held,
    // with every button held meanwhile (`latched`) pressed on its first step.
    const holding = hitstop > 0;
    if (holding) {
      latched |= bits;
      latched2 |= bits2;
    } else {
      if (campaign.state.phase === CPHASE.PLAY) {
        bits |= latched;
        bits2 |= latched2;
      }
      latched = latched2 = 0;
    }
    campaign.setInput(bits, 0);
    if (players === 2) campaign.setInput(bits2, 1);
    let stepped = 0;
    if (holding) hitstop = Math.max(0, hitstop - dt);
    else stepped = campaign.tick(dt);
    if (stepped > 0) {
      fire.tap = jump.tap = false;
      if (fire.id !== -1) fire.seen = true;
      if (jump.id !== -1) jump.seen = true;
    }
    if (campaign.sim !== sim) stageStarted();
    else {
      cues();
      roomCalls();
    }
    calls();
    phases();
    audio.setMusic(musicFor());
    if (campaign.state.phase === CPHASE.OVER) overFor += dt;
    view(dt);
    sync();
  };

  // The HUD is the DOM's; the overlay carries only the fx.
  const NO_EXTRA = () => { };
  const overlay = (dt) => fx.drawOverlay(dt, NO_EXTRA);

  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    // Escape opens the pause card, or closes it; with nothing to pause (refused, or the run ended) it leaves.
    if (key === "escape") {
      if (campaign.state.paused) setPause(false);
      else if (mayPause()) setPause(true);
      else go(home);
      return;
    }
    if (key === "m") {
      toggleMute();
      return;
    }
    if (refusal) return;
    if (key === "p") {
      if (!e.repeat) setPause(!campaign.state.paused);
      return;
    }
    if (campaign.state.paused) return;
    if (key === "enter") {
      // Over: continue while continues last, else end the run; ended: a new run.
      const phase = campaign.state.phase;
      if (phase === CPHASE.OVER) proceed();
      else if (phase === CPHASE.END) newRun();
      return;
    }
    if (!(key in KEY_BITS)) return;
    e.preventDefault();
    held[key] = true;
    remask();
  };
  // A donation is taken as everywhere (recorded, and its bananas onto the shared pile) and thanked in a toast; it does
  // not touch the run.
  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    const bananas = BL.game.bananasFor(donation.sats), shown = counted ? counted.rounded : bananas;
    world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : bananas));
    hud.toast(`+${BL.game.formatLarge(donation.sats)} sats · ${BL.game.formatLarge(shown)} banana${shown === 1 ? "" : "s"} · ${donation.handle ? `@${donation.handle}` : "anon"}`);
  };
  const onLootCleared = () => { };

  const enter = (ctx) => {
    ({ renderer, go, game, world, canvas } = ctx);
    home = ctx.from === "arcade" ? "arcade" : "hub";
    camera = createCamera({ fov: 50, near: 0.5, far: 140, orthoMix: 1, orthoHeight: SCREEN_Y / FIT_WIDE });
    root = createNode();
    hud = hudMod.create({ signal: ctx.signal, roster: contributors.activeRoster });
    input = interactMod.create({ canvas, renderer, camera, hooks: {} });
    fx = fxMod.create({ root, renderer, camera, overlay: ctx.overlay });
    raidHud = raidHudMod.create();
    audio = raidAudio.create();
    prev = makePrev();
    eTurned = new Uint8Array(ENEMY_SLOTS);
    eKey = new Array(ENEMY_SLOTS).fill(null);
    eShutAt = new Float64Array(ENEMY_SLOTS).fill(-1);
    walkView = { pState: null, pPose: null, pAim: null, pFace: null, pvx: WALK, pDuck: null, pInvincible: null, pTimer: null, px: null, py: null };
    introEl = document.querySelector('[data-intro="raid"]');
    introShown = !introEl.hidden;
    padHelp = introEl.querySelector(".raid-players-help");
    padHelpText = padHelp.textContent;
    pauseHelp = raidHud.el.pause.querySelector(".raid-pause-help");
    pauseHelpText = pauseHelp.textContent;
    padOrder.fill(-1);
    padsOn = 0;
    padMark = chosen;
    stages = STAGES;
    players = chosen;
    raidHud.setPlayers(players);

    // The far layers (the stage's backdrop, placed with it): the sky rides with the camera, the rest at their own rates.
    skyLayer = createNode();

    // The frame: four slabs round the 8 by 7 window and a rim on its edge, in front of everything.
    const kit = frameKit();
    frameLayer = createNode();
    const slab = (geo, x, y, w, h, z) => addChild(frameLayer, createNode({ geometry: geo, position: { x, y, z }, scale: { x: w, y: h, z: 1 } }));
    slab(kit.slab, -SLAB / 2, SCREEN_Y / 2, SLAB, SLAB * 3, FRAME_Z);
    slab(kit.slab, SCREEN_X + SLAB / 2, SCREEN_Y / 2, SLAB, SLAB * 3, FRAME_Z);
    slab(kit.slab, SCREEN_X / 2, SCREEN_Y + SLAB / 2, SCREEN_X, SLAB, FRAME_Z);
    slab(kit.slab, SCREEN_X / 2, -SLAB / 2, SCREEN_X, SLAB, FRAME_Z);
    slab(kit.rim, -RIM / 2, SCREEN_Y / 2, RIM, SCREEN_Y + RIM * 2, FRAME_Z + 0.2);
    slab(kit.rim, SCREEN_X + RIM / 2, SCREEN_Y / 2, RIM, SCREEN_Y + RIM * 2, FRAME_Z + 0.2);
    slab(kit.rim, SCREEN_X / 2, SCREEN_Y + RIM / 2, SCREEN_X + RIM * 2, RIM, FRAME_Z + 0.2);
    slab(kit.rim, SCREEN_X / 2, -RIM / 2, SCREEN_X + RIM * 2, RIM, FRAME_Z + 0.2);

    // A room's shell, its doors, barrier, gauge needle and tripwires in the view the advance grows, shown on a rooms
    // stage (each given its geometry as its room starts); its front edge and hatch lamps outside it; the searchlights'
    // pools and beams; a climb boss's lines.
    roomView = createNode({ visible: false });
    shellNode = createNode({ geometry: null, position: { x: 0, y: 0, z: SHELL_Z } });
    for (let i = 0; i < DOORS; i++) doorNodes.push(createNode({ geometry: null, visible: false, position: { x: 0, y: projectY(0, 1), z: SHELL_Z + 0.05 } }));
    barrierNode = createNode({ geometry: null, visible: false, position: { x: 0, y: 0, z: SHELL_Z + 0.15 } });
    needleNode = createNode({ geometry: null, visible: false, position: { x: 0, y: 0, z: SHELL_Z + NEEDLE_Z } });
    for (let i = 0; i < WIRES; i++) wireNodes.push(createNode({ geometry: null, visible: false, position: { x: 0, y: 0, z: WIRE_Z } }));
    addChild(roomView, shellNode, ...doorNodes, barrierNode, needleNode, ...wireNodes);
    frontNode = createNode({ geometry: null, visible: false, position: { x: 0, y: 0, z: FRONT_Z } });
    for (let i = 0; i < LAMPS; i++) lampNodes.push(createNode({ geometry: null, visible: false, position: { x: 0, y: 0, z: FRONT_Z } }));
    for (let i = 0; i < LIGHTS; i++) {
      poolNodes.push(createNode({ geometry: null, visible: false }));
      coneNodes.push(createNode({ geometry: null, visible: false }));
    }
    for (let i = 0; i < CABLES; i++) cableNodes.push(createNode({ geometry: null, visible: false }));
    lampOfDoor = new Int8Array(DOORS);
    lampWarn = new Uint8Array(LAMPS);
    addChild(root, skyLayer, frameLayer, roomView, frontNode, ...lampNodes, ...poolNodes, ...coneNodes, ...cableNodes);

    // Fixed pools, written from the sim every frame: the bullets, the enemy slots and each slot's set-back piece.
    for (let i = 0; i < BULLETS; i++) bulletNodes.push(createNode({ geometry: null, visible: false }));
    for (let i = 0; i < ENEMY_SLOTS; i++) enemyNodes.push(createNode({ geometry: null, visible: false }));
    for (let i = 0; i < ENEMY_SLOTS; i++) riderNodes.push(createNode({ geometry: null, visible: false }));
    addChild(root, ...bulletNodes, ...riderNodes, ...enemyNodes);
    // The hit flashes and kill shards, idle (aged past their lives) until a hit.
    const hk = hitKit();
    for (let i = 0; i < FLASHES; i++) flashNodes.push(createNode({ geometry: hk.flash, visible: false }));
    for (let i = 0; i < SHARDS; i++) shardNodes.push(createNode({ geometry: i & 1 ? hk.spark : hk.shard, visible: false }));
    flashAt.fill(0); shardAt.fill(0);
    for (let n = 0; n < SHARDS; n++) shardAt[n * 7 + 6] = SHARD_LIFE;
    flashNext = shardNext = 0;
    addChild(root, ...flashNodes, ...shardNodes);
    // The printers' heat (one a slot) and the wind-up's smoke pool, idle until a printer winds up.
    for (let i = 0; i < ENEMY_SLOTS; i++) heatNodes.push(createNode({ geometry: null, visible: false }));
    for (let i = 0; i < SMOKES; i++) smokeNodes.push(createNode({ geometry: null, visible: false }));
    smokeAt.fill(0);
    smokeNext = 0;
    eWind = new Float32Array(ENEMY_SLOTS).fill(-1);
    eSpin = new Float32Array(ENEMY_SLOTS);
    eSmoke = new Float32Array(ENEMY_SLOTS);
    simWas = simDt = 0;
    addChild(root, ...heatNodes, ...smokeNodes);
    // The tells' rings, one a slot, idle until a slot winds up (their geometry is raid-models' rings, set as they show).
    for (let i = 0; i < ENEMY_SLOTS; i++) tellNodes.push(createNode({ geometry: null, visible: false }));
    eTellAt = new Float32Array(ENEMY_SLOTS).fill(-1);
    tellCount = windCount = ringCount = 0;
    tellCues.tell = tellCues.big = tellCues.windUp = 0;
    addChild(root, ...tellNodes);

    // Who plays, past the gate (`world.pilot` is read, not taken, so the arcade gets the same Ooga back). One crew a
    // player; a refused visitor gets none.
    refusal = null;
    leaving = false;
    started = false;
    const refused = refusalFor(BL.net.state);
    playerOne = refused ? null : playerName(ctx.world.pilot);
    playerTwo = playerOne && secondName(playerOne);
    if (playerOne) {
      crews.push(raidCrew.create({ root, name: playerOne }));
      if (players === 2) crews.push(raidCrew.create({ root, name: playerTwo }));
    }
    newRun();

    // Touch: the move stick runs and aims, Jump! jumps, Fire fires while held. Desktop keys are the scene's own.
    stickEl = document.getElementById("joy-move");
    controls = controlsMod.create({ move: stickEl });
    // The nav's way out names where it goes: the arcade's door, or the island for a visitor who came by the address.
    hudMod.leaveTo("raid", home);
    actLabel = hud.el.act.textContent;
    hud.setAct("Jump!");
    showSection(introShown ? null : "play");
    fire = holdButton(raidHud.el.fire, IN.FIRE);
    jump = holdButton(hud.el.act, IN.JUMP);
    hud.onAction((action) => {
      if (action === "leave") go(home);
      else if (action === "mute") toggleMute();
      else if (action === "raid-again" && !refusal) newRun();
      else if (action === "raid-pause") setPause(!campaign.state.paused);
      else if (action === "raid-resume") setPause(false);
      else if (action === "raid-fire") clicked(fire);
      else if (action === "act") clicked(jump);
      else if ((action === "raid-1p" || action === "raid-2p") && !refusal && !introEl.hidden) choosePlayers(action === "raid-1p" ? 1 : 2);
      else if (action.startsWith("raid-secret:") && secretsOpen) toggleSecret(secretIds().indexOf(action.slice(12)));
      else if (action === "raid-secrets-close") closeSecrets();
      else if ((action === "raid-start-prev" || action === "raid-start-next") && !refusal && !introEl.hidden) stepStart(action === "raid-start-prev" ? -1 : 1);
    });
    raidHud.el.mute.setAttribute("aria-pressed", String(audio.muted));
    showBest();
    // Shaman's Secrets: the card's stage chooser from the save, the tablet closed by a press outside it, and the card's
    // touches followed for the code.
    secretsOpen = false;
    codeAt = padCodeAt = touchAt = 0;
    refreshSecrets();
    hud.dismissOutside(raidHud.el.secrets, closeSecrets);
    introEl.addEventListener("touchstart", onCardTouchStart, { passive: true });
    introEl.addEventListener("touchend", onCardTouchEnd);
    if (refused) refuse(refused);
    unsubscribeAccount = BL.net.subscribe(onAccount);

    header = document.querySelector(".topbar");
    fitDirty = true;
    resize = new ResizeObserver(() => {
      fitDirty = true;
    });
    resize.observe(canvas);
    releaseAll();
    debugBits = debugBits2 = 0;
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onGestureKey, true);
    window.addEventListener("pointerdown", onGesture, true);
    // Pads: any already connected as the visit begins (asked once), then each joining or leaving.
    if (navigator.getGamepads) {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) addPad(pads[i]);
      window.addEventListener("gamepadconnected", onPadOn);
      window.addEventListener("gamepaddisconnected", onPadOff);
    }
    fit();
    view(0);
    debugRaid = {
      get phase() {
        return sim.state.phase;
      },
      get sim() {
        return sim;
      },
      get campaign() {
        return campaign;
      },
      get players() {
        return players;
      },
      get paused() {
        return campaign.state.paused === 1;
      },
      get audio() {
        return audio;
      },
      get crews() {
        return crews;
      },
      // Weight: the hitstop left and the shake's size now (m), the last boss card's name and callout's words, and how
      // many of each the visit has shown.
      get weight() {
        const shake = shakeAge < shakeLife ? shakeAmp * (1 - shakeAge / shakeLife) * (1 - shakeAge / shakeLife) : 0;
        return { hitstop, shake, card: cardTitle, cards, call: callText, calls: callCount };
      },
      // The gate's words while the visitor is being sent back (null while they may play), and the account handler fed a
      // net state by hand (`{ resolved, backend, me }`), as a sign-in or sign-out mid-visit would: the raid step's gate.
      get refusal() {
        return refusal;
      },
      account: (state) => onAccount(state),
      // The placed stage's gathered art, and any stage's (gathered once a page), for debugging.
      get shown() {
        return shown;
      },
      // The current room's hatch lamps by index: 1 while a drop guard waits in its warning over that lamp's door.
      get lampsLit() {
        return lampWarn ? Array.from(lampWarn.subarray(0, roomArt ? roomArt.lamps.length : 0)) : [];
      },
      // The placed stage's moving pieces as drawn this frame, for debugging: each node's x, y and whether it shows.
      // The printers' wind-up and shots as drawn this frame: slots winding, heat nodes shown, dollar bills shown, and the
      // smoke pool's soot puffs and embers in flight.
      get printer() {
        const L = raidModels.looks();
        let winding = 0, heat = 0, bills = 0, smoke = 0, embers = 0;
        for (let i = 0; i < ENEMY_SLOTS; i++) {
          if (eWind[i] >= 0) winding++;
          if (heatNodes[i].visible) heat++;
          if (enemyNodes[i].visible && (enemyNodes[i].geometry === L.bill || enemyNodes[i].geometry === L.turnedBill)) bills++;
        }
        for (const node of smokeNodes) if (node.visible) { if (node.geometry === L.smoke[2]) embers++; else smoke++; }
        return { winding, heat, bills, smoke, embers };
      },
      // The tells this frame: slots winding up (FLAG.WIND), of them those winding up a big one (FLAG.BIG), those wearing a
      // wind-up look and the rings shown (each with its family's geometry name), and the tell cues sounded this visit.
      get tells() {
        const L = raidModels.looks(), s = sim.state, families = [];
        let big = 0;
        for (let i = 0; i < ENEMY_SLOTS; i++) {
          if (s.eFlags[i] & FLAG.BIG && s.eFlags[i] & FLAG.WIND) big++;
          const ring = tellNodes[i];
          if (!ring.visible) continue;
          for (const f of Object.keys(L.tells)) if (ring.geometry === L.tells[f] || ring.geometry === L.bigTells[f]) families.push(ring.geometry === L.bigTells[f] ? `${f} big` : f);
        }
        return { winding: tellCount, big, winds: windCount, rings: ringCount, families, cues: { ...tellCues } };
      },
      get pieces() {
        const at = (list) => list.map((n) => [+n.position.x.toFixed(3), +n.position.y.toFixed(3), n.visible]);
        return { lifts: at(liftNodes), belts: at(beltNodes), water: at(bodyNodes), rafts: at(raftNodes), stir: at(stirNodes), blizzard: at(blizzardNodes), cylinders: at(cylinderNodes), aurora: auroraNode && auroraNode.geometry === shown.weather.aurora.flare, snow: !!snowNode && snowNode.visible, blaze: !!blazeNode && blazeNode.visible, riders: riderNodes.filter((n) => n.visible).length };
      },
      prepare,
      // A pad's axes and buttons (GamepadButtons, or numbers) as the sim's bits, 64 for Start, 128 and 256 for the
      // d-pad's left and right; the pads connected, in the order they connected. For debugging.
      padBits,
      get pads() {
        return Array.from(padOrder.subarray(0, padsOn));
      },
      // A new run over the given stages (a list of stage objects, `raidStages.STAGES` when left out), which the playthrough
      // step starts; `players` picks one or two as the title card does, and `seed` pins the campaign's dice (the clock's
      // when left out).
      newRun: ({ stages: list = STAGES, players: n = players, seed } = {}) => {
        stages = list;
        if (n !== players) choosePlayers(n);
        newRun(seed);
      },
      // Whole fixed steps with no frames, one at a time under the buttons the next frame would send (the autopilot's
      // read again each step), and none once the campaign leaves play, so nothing held crosses a hand-over; the view
      // follows, and no cue sounds for the steps skipped, but a phase reached or a barrier opened still posts its notice,
      // card or results.
      simulate: (seconds) => {
        let held = keyMask | (pointerFire ? IN.FIRE : 0) | debugBits | padFor(0), held2 = keyMask2 | debugBits2 | padFor(1);
        if (mirror) { held = swapLR(held); held2 = swapLR(held2); }
        let handed = false;
        for (let n = Math.round(seconds / FIXED); n > 0; n--) {
          const playing = campaign.state.phase === CPHASE.PLAY;
          campaign.setInput(!playing ? 0 : debugRaid.autopilot ? raidSim.autopilot(campaign.sim) : held, 0);
          if (players === 2) campaign.setInput(playing ? held2 : 0, 1);
          campaign.simulate(FIXED);
          if (campaign.sim !== sim) {
            stageStarted();
            handed = true;
          }
        }
        if (!handed) roomCalls();
        calls();
        phases();
        audio.setMusic(musicFor());
        view(seconds);
        sync();
      },
      // Held on top of the keys until set again; 0 lets go. `p` 1 holds player 2's.
      setInput: (bits, p = 0) => {
        if (p === 1) debugBits2 = bits & 63;
        else debugBits = bits & 63;
      },
      // Shaman's Secrets: `state` (the tablet open, the secrets on and the stage select's stage in the save, which are
      // earned, and the run's own secrets and CHEAT bits), `set(id, on)` as the tablet's toggle does (false for a locked
      // or unknown one; a new run takes it, as the tablet's closing would), and `open()` and `close()` the tablet.
      cheats: {
        get state() {
          const ids = secretIds();
          return { open: secretsOpen, on: game.state.raid.cheats.slice(), start: game.state.raid.start, unlocked: ids.filter((id) => game.raidUnlocked(id)),
            run: runCheats.slice(), bits: runBits, mirror, peels, focus: secretAt };
        },
        set: (id, on) => {
          if (!game.setRaidCheat(id, on)) return false;
          refreshSecrets();
          if (!secretsOpen) newRun();
          return true;
        },
        open: () => openSecrets(),
        close: () => closeSecrets()
      },
      autopilot: false
    };
    Object.assign(raidScene, { root, camera, input, debug: { camera, fx, audio, renderOpts: RENDER_OPTS, raid: debugRaid } });
    // The raid reads every pad itself (`padBits`), two players on two pads; the page's one-pad module would also turn
    // Start into Escape and drive the title card as a menu, so it hears nothing while the raid is up.
    BL.gamepad.listen(NO_PAD);
  };
  const NO_PAD = () => {};

  const leave = () => {
    BL.gamepad.listen(null);
    // A run left after it started and got anywhere has ended: settled as it stands (a cleared stage counts as cleared).
    if (started && !refusal && !settled && (runScore() > 0 || furthestCleared >= 0)) settle();
    unsubscribeAccount();
    resize.disconnect();
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", releaseAll);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onGestureKey, true);
    window.removeEventListener("pointerdown", onGesture, true);
    introEl.removeEventListener("touchstart", onCardTouchStart);
    introEl.removeEventListener("touchend", onCardTouchEnd);
    // Shaman's Secrets let go: the tablet shut with nothing made (the run is gone), the card live, the canvases unflipped.
    secretsOpen = false;
    introEl.inert = false;
    delete document.body.dataset.raidMirror;
    mirror = peels = false;
    runCheats = [];
    runStart = 0;
    runBits = 0;
    window.removeEventListener("gamepadconnected", onPadOn);
    window.removeEventListener("gamepaddisconnected", onPadOff);
    padHelp.textContent = padHelpText;
    pauseHelp.textContent = pauseHelpText;
    padOrder.fill(-1);
    padsOn = 0;
    padHelp = pauseHelp = null;
    releaseAll();
    dropHold(fire);
    dropHold(jump);
    controls.dispose();
    debugBits = debugBits2 = 0;
    audio.dispose();
    fx.dispose();
    for (const crew of crews) crew.dispose();
    for (const node of root.children) node.parent = null;
    root.children.length = 0;
    flashNodes.length = shardNodes.length = heatNodes.length = smokeNodes.length = tellNodes.length = 0;
    eWind = eSpin = eSmoke = eTellAt = null;
    crews.length = bulletNodes.length = enemyNodes.length = layerNodes.length = layerRates.length = layerYs.length = stageNodes.length = doorNodes.length = 0;
    wireNodes.length = lampNodes.length = poolNodes.length = coneNodes.length = cableNodes.length = liftNodes.length = plankNodes.length = flagNodes.length = flagWays.length = 0;
    riderNodes.length = beltNodes.length = bodyNodes.length = surfaceNodes.length = raftNodes.length = raftBasins.length = stirNodes.length = blizzardNodes.length = cylinderNodes.length = 0;
    auroraNode = snowNode = blazeNode = null;
    for (const node of skyLayer.children) node.parent = null;
    for (const node of roomView.children) node.parent = null;
    skyLayer.children.length = roomView.children.length = 0;
    hud.el.act.hidden = true;
    hud.setAct(actLabel);
    stickEl.style.removeProperty("visibility");
    stickEl = null;
    delete raidHud.el.raid.dataset.raidFit;
    raidHud.el.raid.style.removeProperty("--raid-hud-top");
    raidHud.el.raid.style.removeProperty("--raid-card-top");
    raidHud.el.raid.style.removeProperty("--raid-boss-top");
    raidHud.el.raid.style.removeProperty("--raid-boss-w");
    raidHud.el.raid.style.removeProperty("--raid-screen-edge");
    raidHud.el.raid.style.removeProperty("--raid-notice-top");
    raidHud.el.raid.style.removeProperty("--raid-call-top");
    hitstop = shakeAge = shakeLife = 0;
    cardSim = null;
    raidHud.dispose();
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    renderer = go = game = world = canvas = header = camera = input = fx = campaign = sim = stages = resize = debugRaid = hud = raidHud = audio = controls = introEl = null;
    skyLayer = frameLayer = roomView = barrierNode = fire = jump = walkView = playerOne = playerTwo = prev = eTurned = eKey = eShutAt = unsubscribeAccount = refusal = null;
    shown = shownBack = roomArt = shellNode = frontNode = needleNode = lampOfDoor = lampWarn = null;
    RENDER_OPTS.shadowStrength = 1;
    RENDER_OPTS.fog.set(HORIZON_RGB);
    RENDER_OPTS.clear.set(HORIZON_RGB);
    rooms = false;
    raidScene.input = raidScene.debug = null;
    return { targets: count };
  };
  // The placed stage's every geometry lives off the graph while nothing wears it: every look (shut, mirrored, swollen,
  // item and shot ones too), so a type's first spawn never uploads mid-run, and every room's shell and pieces and a
  // climb's moving pieces, so a room or a plank never uploads as it shows; and each Ooga's blinking heads.
  const liveGeometry = (set) => {
    for (const geo of shown.geos) set.add(geo);
    for (const crew of crews) crew.liveGeometry(set);
    set.add(peelKit());
  };
  const stats = () => {
    let visible = 0, all = 0, enemies = 0;
    traverseVisible(root, () => visible++);
    const count = (n) => {
      all++;
      for (const c of n.children) count(c);
    };
    count(root);
    for (let i = 0; i < ENEMY_SLOTS; i++) if (sim.state.eType[i] !== ENEMY.FREE) enemies++;
    return { visibleNodes: visible, allNodes: all, tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), phase: sim.state.phase, enemies };
  };
  // Every member together, onto the shell the director already holds (`BL.deferred.scene`).
  const raidScene = BL.deferred.scene("raid", Object.assign(definition, { enter, update, overlay, onDonation, onKey, onLootCleared, leave, stats, liveGeometry }));
  BL.scenes = BL.scenes || {};
  BL.scenes.raid = raidScene;
})();
