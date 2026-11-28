// Ooga Raid's rules on a fixed step. No DOM, no scene, no geometry: the scene feeds held buttons in with
// `setInput` and draws `sim.state` out, and the suite drives the same sim in Node with no browser.
//
// Everything a run holds lives in `state`: typed arrays a player, a bullet or an enemy slot, plus a handful of
// scalars, all made in `create`. The step allocates nothing (no literals, closures, strings or boxed numbers: see
// BOUNDS), and `hash` folds every array's bytes and every scalar, so a seed replays a run exactly. Dice come from the run's own seeded
// state (`randState`, mulberry32) and nowhere else.
//
// The step is 1/120 s. `tick(dt)` banks frame time and runs at most MAX_SUBSTEPS steps, dropping the rest, so a
// tab coming back from hiding does not spiral; `simulate(seconds)` runs whole steps with no frames. `pause(true)` stops
// both: a paused sim's `tick` runs nothing, banks nothing and returns 0.
//
// Coordinates are metres: `x` to the right from the stage's left edge, `y` up from the bottom of its grid, and a
// player's `x, y` the middle of its feet. The grid is read through `raidStages.cellAt`: a ledge and water stop a
// fall from above only (the Ooga stands on water and the view sinks it), solid stops the body from every side,
// and the cell under the middle of the feet is what holds an Ooga up. Aim counts 0 to 7 anticlockwise in 45
// degree steps from 0 = right. The camera scrolls one way, following the Ooga at mid-screen, and stops at the
// stage's lock screen; the Ooga cannot walk back past its left edge, and falling below the screen's bottom kills.
//
// Stage kinds. A side stage scrolls right (`camX` to `lockX`) and `camY` stays 0, so its bottom is the grid's. A climb
// is one screen wide, so `camX` stays 0, and scrolls up instead: once the Ooga has landed, `camY` follows its feet up
// past the screen's middle and stops at `lockY`, the bottom of the lock screen, never coming down (once the stage's boss
// is in play it goes on up to `lockY` at TUNE.BOSS_SCROLL_V, but never past TUNE.TRAIL under any Ooga). The kill line is
// `camY`, so a fall below the screen's bottom kills wherever the ground below it lies, even on a step the screen
// scrolls; bullets and enemies leave by the screen's top and bottom as a side stage's leave by its sides.
//
// A rooms stage never scrolls. The view looks into one room at a time: the Oogas walk its front line (depth 0, x ROOM.FRONT_L
// to FRONT_R, on a floor at y 0), jump, and lie prone except in the boss room. Bullets and enemies carry a depth (`bz`,
// `ez`, 0 at the front line to 1 at the back wall); up and up-forward fire level into the room, every other aim along the
// front line, and a hit takes both a projected overlap (ROOM, `projectX`/`projectY`, the scene's perspective) and depths
// within ROOM.HIT_DEPTH, so a shot never meets what stands deeper or shallower than itself. A room starts with its targets
// on the back wall and sends its waves in at its doors on time (no edge spawner). Forward is into the room: up held alone,
// standing, for TUNE.ROOM_STEP_IN (`pHold`, counted again from 0 on the trigger) walks the Ooga forward through the open
// barrier, which plays ROOM_PHASE.ADVANCE for TUNE.ROOM_ADVANCE, then the next room starts. While a LEDGER_CORE stands the
// barrier is closed (`barrier` 1, ROOM_PHASE.FIGHT) and blocks the way forward, so up held there only aims. Clearing the
// boss room's cores clears the stage, as the vault's fall does. Each back-wall target type stands at most its ROOM_REACH
// entry up the wall (raid-stages.js validates it), which the sim checks at load against the highest a jump's shot meets
// that type's own box.
//
// A core is any slot whose flags hold FLAG.CORE (LEDGER_CORE is one): while one stands the barrier stays closed. A room
// with no core opens at once, but the boss room with no core among its targets waits for its boss main's fall instead.
// An item dropped in a room comes forward from its depth to the front line at TUNE.ITEM_DRIFT as it falls, and rests
// there, where it is taken. A room's `wires` are tripwires on the room's clock (`roomTime`): each is live for its `on`
// seconds and dark for its `off`, `offset` seconds into that cycle at the room's start, warning for TUNE.WIRE_WARN before
// it goes live (`wireState`, for the view), and a live one kills (`kill`) an Ooga at x0 <= x <= x1 whose body, its feet
// to RULES.BOX[pose]'s height, spans its height. Wires are no slots: nothing shoots them. An Ooga walks into a room where
// it stood in the last, so for the first TUNE.ROOM_GRACE of a room no wire is live (one its cycle would have live then
// warns instead, from the room's start, and goes live when the grace is out) and no wave comes in (each due in it comes
// as the grace runs out, a drop guard among them, so nothing lands where an Ooga walked in). Slots are kept for the
// shots: in a room nothing with hit points (a wave, a called guard, a printed bat, a boss's release) spawns unless
// TUNE.ROOM_RESERVE slots stay free after it, so a boss's volley always finds its slots, and a room's waves keep at most
// TUNE.ROOM_WAVE_MAX enemies with hit points off the back wall alive (every kind counted together); a wave that would
// pass that, or finds no slot it may take, waits, holding the waves after it, rather than being dropped.
//
// Terrain (raid-stages.js: `gusts`, `lifts`, `crumble`), on a side stage or a climb, runs on the stage clock (`time`). A
// gust cycle is calm for TUNE.GUST_CALM, warns for GUST_WARN (for the view: nothing is pushed) and blows for GUST_BLOW
// (`gustPhase`); while it blows, each Ooga in play whose feet are in a zone (its column on a side stage, its row on a
// climb), standing or in the air, is moved along x at the zone's dir (`gustDir`: dir 0 left on the first cycle, right on the
// next, by turns) times GUST_V, through the wall test as running is. Enemies and Oogas dropping in are not pushed. A lift is
// a one-way ledge with no cells: its top (`liftTop`, from the stage clock alone) is landed on from above, passed through
// from below, never blocks or crushes, and carries an Ooga or a walker (`fall`) standing on it up and down with it; down and
// jump drops through it onto ground below, as through a ledge (and further, past what a lift going down gains on a body falling
// from rest, so it never lands back on it); and it counts as ground under a drop-in or a spawner entry
// while its top is over the screen's bottom. A crumbling span's ledge cells are kept in the run's own copy of the grid
// (`cells`, empty on a stage with no span, so the shared stage is never written): an Ooga standing on any of its cells
// starts its fuse (`crumblePhase` CRUMBLE.FUSE, `crumbleTimer` the seconds left) and TUNE.CRUMBLE_FUSE later the span's
// cells read empty (CRUMBLE.GONE) for CRUMBLE_GONE, then come back whole. Everything that reads the grid in the run (the
// Oogas, walkers, shots, lobs, drop-ins and the spawner) reads the run's copy. `cells` and the spans' state are folded into
// `hash`; a gust's and a lift's state are the clock's. The stage clock's 0 is the sim's creation: a continue restarts the stage
// but not the clock, so lifts, gusts and the tide run on through it, while crumbled spans come back whole.
//
// Belts and the tide (raid-stages.js: `belts`, `tide`). An Ooga in play standing on a belt's cell (its feet on the
// top of the belt's row, in its columns) is moved at the belt's speed along x with its own run, through the same wall test
// and screen clamp as a gust's push, so running against a belt nets RUN less its speed; a walker whose def is `belted` is
// carried the same way in `fall`, as `walled` tests a step. The tide runs on the stage clock (`tidePhase`, `tideLevel`):
// each basin's level steps a row at a time between its low and high rows, and the step writes a basin into the run's
// `cells` (made whenever a stage has spans or a tide) when its level changes: an empty cell over the low row up to the
// level reads water, and a float's top water cell a ledge, a raft that can be jumped from; `startStage` writes every basin
// at the clock's level, so a continue never resets the tide. An Ooga, a walker or an item not rising whose feet stand in
// a basin's cell the tide made non-empty is set on top of the water there; when the level falls it falls. Everything that
// reads the grid reads the water, lobs landing on its top included.
//
// Lives follow the rule sheet. A death (`kill` for anything that hits, a pit for a fall, which no barrier or
// invincibility stops) takes the weapon back to the rifle and the rapid fire away, holds the Ooga dead for
// TUNE.DEAD, then spends a reserve life to drop it in from the top of the same screen, over ground on that screen, or
// puts it out; with every player out the phase is OVER, where `continueRun` restarts the stage at zero score while continues last and
// `endRun` ends.
//
// Two players. `create({ players: 2 })` joins the second Ooga; `setInput(bits, p)` holds each one's buttons in its own six
// bits of `input` (player 0 lowest, so one player's `input` is as it always was), and the player not joined stays OUT. Each
// Ooga has its own lives, score, next extra life, weapon, rapid fire, barrier and invincibility; the continues are shared.
// One out of lives stays out while the other plays, the run is OVER only when both are, and a continue brings both back
// in. The camera follows the leading Ooga but never leaves the trailing one within TUNE.TRAIL of the edge it trails by,
// so the leader waits at the screen's right edge (side) or under its top, which stops a head on a climb as a solid cell
// does while the screen can still scroll (at the lock a jump goes its full height). That holds for a player who plays, not
// for an idle one (`pIdle`, the seconds since it last held any button, to TUNE.IDLE; it starts there, so one who has
// pressed nothing since the run began is idle, and a campaign's hand-over keeps it): while the other plays (in the run and
// not idle), an idle Ooga holds neither the screen nor the Legion's fire, and once the screen has scrolled to within
// TRAIL of it, it is carried along, dropping in as a respawn does a cell to four behind the leader (`carryIn`); the screen
// catches up at TUNE.CATCH_V at most. `pIdle` is hashed only with two players. Player 2 drops in a cell or two beside
// player 1, at the start and on every respawn. In a room both walk the front line and either one walking forward
// advances. Enemies aim and run at the nearest Ooga in a straight line (`nearest(slot)`, ties to player 0), and the spawner
// keeps off an edge either one stands by. `carry()` hands a stage's players on (score, lives, next extra life, weapon,
// rapid fire, `out`, and the continues; one down spends its next life) for the next stage's `create({ carry })`, where
// every carried Ooga drops in fresh and one carried out stays out. Every drop-in, the stage's first included, lands with RESPAWN_INVINCIBLE seconds in which it cannot
// be hurt, and enemies hold their fire (`attack` 0) while any Ooga drops in or is invincible. `award` pays points
// and every extra life they cross, to LIVES_MAX, until the next threshold passes EXTRA_CUTOFF.
//
// Movement. On the ground the Ooga runs at RUN while left or right is held; in the air it drifts at RUN the way it last
// pressed (a jump takes the way held as it leaves, none going straight up), and a walk off a ledge or a drop through one
// may not steer until it has fallen LOCK_FALL (see `stepPlayer`). Off a ledge walked off a jump still goes for COYOTE
// seconds, and a jump pressed in the air fires on landing within JUMP_BUFFER seconds; neither shows.
//
// Weapons. A FIRE press fires once (the auto rifle fires again every TUNE.AUTO_GAP while held, AUTO_BREAK after every
// AUTO_RUN in a row) from the pose's muzzle point for the aim (TUNE.MUZZLE), along the aim. A shot that would take the owner's live bullets past RULES.CAPS[weapon], or find too few free
// slots (BULLETS holds every player's widest cap at once, so each always finds its own), is not fired at all: the fan's five and the beam's three segments go together or not. The fan spreads across
// TUNE.FAN_ARC about the aim; the corkscrew circles its line of flight; the beam is three segments in a line, `bKind`
// BEAM, which a kill does not stop. Rapid fire flies every shot at RAPID_V instead of SHOT_V, but never the beam. A
// bullet's line point (`blx, bly`) is what flies and what dies leaving the screen or entering a SOLID cell; `bx, by`
// is where it is drawn and hits, the same point but for the corkscrew's circle.
//
// Enemies. Sixteen slots, each running its type's numbered routines from raid-enemies.js (being destroyed is one more),
// slot 15 down to 0; `spawn` takes the first free slot from 15 down or drops the newcomer. Hits follow the reference's
// point-against-box model: the Ooga is one point by pose, an enemy a box by its tier and that pose, a player bullet a point against the
// enemy's bullet box. A slot flagged SHIELD spends, for no damage, a bullet (a beam segment too) that meets its box flying
// against its facing (`eAim` 0 right, AIMS / 2 left) flatter than 45 degrees by its line of flight; diagonals, shots from
// behind, up and down, the barrier and the clear-screen hit it as any other. An enemy shot is a SHOT or any type of the
// shot tier that is no machine (a LOB, a SPARK): a kill spends it and the barrier leaves it alone. Any touch of an enemy or an enemy shot kills (through `kill`, so a fresh Ooga walks through), but a
// `solid` enemy's (the printer's), which is a block instead: off a room its bullet box stops an Ooga's body at its sides and
// head at its underside and holds up its feet on its top, as solid ground does (no drop through it), until it is destroyed; and
// ducked under water nothing hits, while the Ooga neither moves nor fires. Every bullet does RULES.DAMAGE and is spent, but a beam segment goes on through what
// it destroys; a shut enemy takes none. Points are paid once, as the last hit point goes. Enemy shots fly along
// AIM_STEPS directions, and nothing fires while `attack` is 0.
//
// Spawning. The stage's `placed` records spawn once each, in column order, as each column's left edge scrolls into view
// (`listCursor` counts those spawned), at their column with their feet in their row; a carrier comes in from the left
// edge instead and flies across. The edge spawner's `spawnTimer` starts at the stage's `spawner.base`, less
// SPAWN_LOOP_CUT a completed loop (to SPAWN_LOOPS_MAX) and SPAWN_STRENGTH_CUT a point of the strongest weapon held, and
// drains SPAWN_DRAIN a second, SPAWN_DRAIN_SCROLLING on a step the screen scrolled. At zero it picks an edge with the
// dice, takes the other when that one is refused (an Ooga within SPAWN_CLEAR of it, or a solid entry cell or nothing
// under it, the entry cell being the one just outside that edge at the nearest Ooga's feet), sends a runner in, and
// resets. Once a boss's lock holds (PHASE.BOSS, the camera at the lock) it pauses, so no runner comes to be trapped on the
// boss's screen. A full set of slots drops whatever would spawn; the list and the timer go on regardless. On a climb the
// list runs by row, each record spawning as its row's bottom comes into view at the screen's top, and the spawner's runner
// comes in at a top corner, falling in from the screen's top in its edge column, or at a side, in the edge column at the
// nearest Ooga's feet: the dice pick the side and then corner or side, and the rest follow in turn (the same side the
// other way, then the other side). An entry is refused when its cell is solid, nothing on the screen under it holds the
// runner up, or an Ooga stands within SPAWN_CLEAR of where it lands; SPAWN_DRAIN_SCROLLING counts a step `camY` moved.
//
// Pickups. A carrier flies a sine path across the screen; a sensor shuts and opens on a timer. Either, destroyed, turns
// into its ITEM (`eAttr`) in its own slot, which pops up and falls to rest. Touching an item takes it: a weapon, rapid
// fire, the barrier (RULES.BARRIER seconds in which only a fall kills, enemy shots and machines do nothing, and a basic
// enemy touched is destroyed for its points) or the clear-screen, which destroys every basic enemy on screen for its
// points. The barrier leaves machines (FLAG.MACHINE) alone; the clear-screen deals each machine on screen one bullet's
// damage. Nothing hurts a shut enemy. A slot's starting flags are its type's (START_FLAGS), set by `spawn` itself, so a
// sensor is shut and a machine a machine from the step it appears, before any bullet of that step strikes.
//
// The boss. A boss main's record (`boss` in its def; the VAULT is one) waits for a free slot rather than being dropped,
// and its destroyed routine, `bossBreak`, clears the stage on a side stage, a climb and in a room alike. A `scaled` def
// takes its hit points as it spawns: its `hp`, plus RULES.BOSS_HP_STRENGTH a point of the strongest weapon the joined
// players hold, plus the loops completed up to RULES.BOSS_HP_LOOPS. A part with `mounts` in its def and `eLink` naming its
// main stands at the main's x, y plus its mount (by `eAttr`) each step before it acts, and dies with the main, for no
// points. The vault's guns have no mounts: the vault never moves, and its fall frees them anyway. A part whose def names
// its `main` (stages 5 to 8's) dies with its main whether or not it has mounts, and always carries `eLink` naming a slot of
// its main: stepping one short of its destroyed routine with none, or linked to a slot of another type, throws.
//
// The vault is a machine, shut until its two VAULT_GUNs are gone: it mounts them on its face itself (each with `eLink`
// naming the vault's slot, tried each step until a slot is free), and neither it nor they ever free themselves, so the
// spawner fills only the other slots.
// The phase is BOSS from the vault's first step in play; the vault's record comes into view three metres before the
// scroll locks on its screen, and the camera goes on to the lock as the Ooga walks, and on its own at TUNE.BOSS_SCROLL_V
// (as a climb's does) but never past TUNE.TRAIL inside the trailing Ooga, so every side boss's screen locks. The guns take turns firing aimed shots, and the last one
// standing fires twice as often; the vault, open, spits a spread of three from its door. Destroyed, it clears the stage
// (PHASE.CLEAR, every other slot emptied) while an Ooga plays, drops in or has a life in reserve; otherwise the run goes
// on to game over as any last death does. Once the stage is clear nothing kills, not even a pit.
//
// `autopilot(sim)` reads the state and returns player 0's buttons; it lives in raid-autopilot.js (loaded after this file),
// and `autopilot` here is a forward that reads `BL.raidAutopilot` at call time. The terrain's rules are
// written in raid-terrain.js (loaded before this file), bound to each run in `create`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const { KIND, ENEMY, ITEM, CELL, SCREEN_W, SCREEN_H, ROOM_W, ROOM_FRONT, ROOM_REACH, STAGES, cellAt } = BL.raidStages;
  // FLAG: SHUT cannot be hurt; MACHINE ignores barrier and clear-screen; CORE holds a room's barrier shut; GHOST is only
  // drawn: strike, contacts, the clear-screen and the autopilot all pass it by.
  const { FLAG, TYPES, close, bossBreak } = BL.raidEnemies;
  const { TUNE: TERRAIN, GUST, CRUMBLE, TIDE, TIDE_PERIOD, gustPhase, gustDir, liftTop, tidePhase, tideLevel, bind: bindTerrain } = BL.raidTerrain;

  const FIXED = 1 / 120, MAX_SUBSTEPS = 4;
  // Bullet slots: every player's widest cap at once (two fans, PLAYERS * max(RULES.CAPS)), since the rule sheet gives each
  // player's weapon its own cap.
  const PLAYERS = 2, BULLETS = 20, ENEMY_SLOTS = 16;
  // The numbers each sim keeps for the autopilot, on the sim as `pilot`, off `state`: seven, and two an enemy slot. The
  // room and climb pilots use them so (raid-autopilot.js's MEMO); the side pilot lays its own memory over all of them
  // (its SIDE).
  const PILOT_MEMO = 7 + 2 * ENEMY_SLOTS;
  const IN = Object.freeze({ LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, JUMP: 16, FIRE: 32 });
  const WEAPON = Object.freeze({ RIFLE: 0, AUTO: 1, CORK: 2, FAN: 3, BEAM: 4 });
  const PSTATE = Object.freeze({ DROP: 0, NORMAL: 1, DEAD: 2, OUT: 3 });
  const POSE = Object.freeze({ WATER: 0, JUMP: 1, PRONE: 2, STAND: 3 });   // also the hit box index
  const PHASE = Object.freeze({ PLAY: 0, BOSS: 1, CLEAR: 2, OVER: 3, END: 4 });
  // The pose an Ooga takes from what its feet stand on after its step (`ground`, a cell KIND, EMPTY in the air) and the
  // buttons' left-right `lr` and up-down `ud` (-1, 0 or 1): in the air, wading, prone with down alone held (never where
  // `standOnly`, the boss room), else standing; and the aim it fires along in that pose, facing right or not: up,
  // up-forward, forward, down-forward; down-forward on the ground only while running, straight down only in the air.
  // `stepPlayer` takes both from here, and raid-autopilot.js asks them what a shot it is about to fire would be.
  const poseOf = (ground, lr, ud, standOnly) =>
    ground === KIND.EMPTY ? POSE.JUMP : ground === KIND.WATER ? POSE.WATER : ud < 0 && lr === 0 && !standOnly ? POSE.PRONE : POSE.STAND;
  const aimOf = (right, lr, ud, pose) => {
    if (ud > 0) return lr === 0 ? 2 : right ? 1 : 3;
    if (ud < 0 && pose === POSE.JUMP) return lr === 0 ? 6 : right ? 7 : 5;
    if (ud < 0 && lr !== 0 && pose === POSE.STAND) return right ? 7 : 5;
    return right ? 0 : 4;
  };

  // Hit boxes, read from the reference's collision tables (bank7's collision_box_codes, tables 00 to 04) at 16 px to a
  // half-metre cell. A row is [top, left, height, width] in px about the enemy's origin, screen y down; `box` turns it
  // into [x from, x to, y from, y to] in metres, y up, for the offset of the point tested from the enemy's origin
  // (x from <= dx < x to, y from < dy <= y to). Each tier holds its four boxes by POSE, tested against the Ooga's one
  // point, then the box a player bullet's point is tested against. The tiers' codes: fodder 0 (foot troops, and the
  // ordinary enemy bullet, so an enemy SHOT takes this tier), emplacement 2 (turrets), armour 9 (the tank), boss 3 (boss
  // parts), and 1 (the reference's turret-man bullet and falling rock, which no type uses today).
  const PX = 1 / 32;
  const box = ([top, left, h, w]) => Object.freeze([left * PX, (left + w) * PX, -(top + h) * PX, -top * PX]);
  const TIER_ROWS = [
    [[-15, -9, 40, 18], [-22, -8, 30, 16], [-12, -15, 13, 30], [-13, -8, 36, 16], [-18, -11, 36, 22]],
    [[-8, -13, 26, 26], [-15, -11, 18, 22], [-20, -19, 16, 38], [-22, -11, 43, 22], [-11, -11, 22, 22]],
    [[-28, -45, 72, 90], [-36, -44, 70, 88], [-40, -51, 62, 102], [-43, -44, 91, 88], [-31, -43, 68, 86]],
    [[-14, -19, 38, 38], [-22, -18, 36, 36], [-26, -25, 28, 50], [-29, -18, 57, 36], [-17, -17, 34, 34]],
    [[-2, -7, 20, 20], [-10, -6, 12, 12], [-13, -12, 4, 24], [-16, -5, 31, 10], [-4, -4, 8, 8]]
  ];

  // The rule sheet (section 6 of the design), frame counts at 60 a second. It never changes.
  const RULES = Object.freeze({
    LIVES: 2, CONTINUES: 3, LIVES_MAX: 99,
    EXTRA_FIRST: 20000, EXTRA_STEP: 30000, EXTRA_CUTOFF: 2995200,
    RESPAWN_INVINCIBLE: 128 / 60, BARRIER: 1024 / 60,
    CAPS: Object.freeze([4, 6, 4, 10, 3]), FAN_PER_SHOT: 5, BEAM_SEGMENTS: 3, STRENGTH: Object.freeze([0, 2, 1, 3, 2]),
    DAMAGE: 1, SPAWN_STRENGTH_CUT: 5, SPAWN_LOOP_CUT: 40, SPAWN_LOOPS_MAX: 3, SPAWN_DRAIN: 120, SPAWN_DRAIN_SCROLLING: 90,
    // A scaled boss's hit points over its base: this many a point of weapon strength, and one a loop completed, to this many.
    BOSS_HP_STRENGTH: 8, BOSS_HP_LOOPS: 3,
    AIM_STEPS: 12,
    HP: Object.freeze({ RUNNER: 1, CLERK: 1, CARRIER: 1, SENSOR: 1, PRINTER: 8, VAULT_GUN: 8, VAULT: 32 }),
    POINTS: Object.freeze({ RUNNER: 100, CLERK: 300, CARRIER: 500, SENSOR: 500, PRINTER: 1000, VAULT_GUN: 1000, VAULT: 10000 }),
    // The terrain body by POSE: half width (walls meet the standing one in every pose), height for ceilings. Hits use the
    // boxes below, not this.
    BOX: Object.freeze([Object.freeze([0.19, 0.44]), Object.freeze([0.19, 0.5]), Object.freeze([0.5, 0.25]), Object.freeze([0.19, 0.94])]),
    // The hit model: the Ooga is one point PLAYER_POINT[pose] over its feet (the reference's sprite origin, 16 px up), an
    // enemy a box about its origin, ORIGIN[type] over its x, y (a walker's feet; the middle of a shot, a flier or a gun),
    // chosen by its tier and the Ooga's pose. A player bullet is a point against its enemy's SHOT_BOX.
    PLAYER_POINT: Object.freeze([0.5, 0.5, 0.5, 0.5]),
    TIER: Object.freeze({ FODDER: 0, EMPLACEMENT: 1, ARMOUR: 2, BOSS: 3, SHOT: 4 }),
    TIERS: Object.freeze({ SHOT: 0, RUNNER: 0, CLERK: 0, PRINTER: 1, CARRIER: 0, SENSOR: 0, ITEM: 0, VAULT: 3, VAULT_GUN: 1 }),
    // The vault's origin is its door, the core a standing Ooga's forward shot meets, a metre over its feet.
    ORIGIN: Object.freeze({ SHOT: 0, RUNNER: 0.5, CLERK: 0.5, PRINTER: 0.35, CARRIER: 0, SENSOR: 0.25, ITEM: 0, VAULT: 1, VAULT_GUN: 0 }),
    BOXES: Object.freeze(TIER_ROWS.map((rows) => Object.freeze(rows.slice(0, 4).map(box)))),
    SHOT_BOX: Object.freeze(TIER_ROWS.map((rows) => box(rows[4])))
  });
  if (BULLETS !== PLAYERS * Math.max(...RULES.CAPS)) throw new Error(`raid sim: ${BULLETS} bullet slots, not every player's widest cap at once`);
  // What the spike settles. RUN is the reference's one pixel a frame. The jump (wave 8, the maintainer's 1.5x) keeps
  // JUMP_V and falls at GRAVITY 14.22: it peaks at 2.25 m and carries a running jump 2.11 m, 1.5 times the 1.41 m of the
  // 21.33 before it (the reference's own is 1.84 m). LOCK_FALL is how far an Ooga falls, off a ledge it walked off or
  // through one it dropped through, before it may steer (the reference's 20 px). Two forgivenesses the reference lacks,
  // both unseen (`stepPlayer`): COYOTE, how long after walking off a ledge a jump still leaves as from the ground (the
  // LOCK_FALL lock then counts from where that ends), and JUMP_BUFFER, how long before landing a jump pressed in the air
  // still fires as it lands.
  // DEAD is how long a death holds the Ooga before it drops back in or the run is over.
  // The shots: the auto rifle's gap between held shots, and after AUTO_RUN of them in a row the longer AUTO_BREAK before
  // the next (the reference's 8 frames, and 15 after every sixth); the corkscrew's own speeds (the reference's fire gun,
  // 1.5 and 2 pixels a frame), the beam's own speed (five pixels a frame) and its segments' spacing, the fan's arc, the
  // corkscrew's circle (radius in metres, turn in radians a second).
  // MUZZLE is where a shot starts, the reference's bullet origins: MUZZLE[pose][k] is [forward, up] in metres from the
  // feet, forward the way the Ooga faces, for the aim k steps of 45 degrees anticlockwise from forward (0 forward, 1
  // up-forward, 2 up, 6 down, 7 down-forward; facing left the same aims mirrored, so k = (12 - aim) % 8). Standing: up
  // (0.16, 1.34), up-forward (0.41, 1.00), forward (0.50, 0.66), and down-forward, which only a running Ooga aims,
  // (0.41, 0.31). Prone, forward only: (0.50, 0.22). In the air, the ball: 0.5 m out from a centre 0.5 m over the feet
  // along the aim, every aim. In the water: the standing points 0.36 m lower, so the forward shot keeps 0.30 m, the rifle
  // raised over the surface. An aim a pose never takes (standing straight down, any backward aim) holds the pose's forward
  // point. A shot into a room (up and up-forward there) flies level at the pose's forward point's height, starting its
  // forward reach along the aim (see `fire`). The view poses the rifle onto these points.
  const MUZZLE_STAND = [[0.5, 0.66], [0.41, 1], [0.16, 1.34], [0.5, 0.66], [0.5, 0.66], [0.5, 0.66], [0.5, 0.66], [0.41, 0.31]];
  const ball = (k) => Object.freeze([k % 4 === 2 ? 0 : 0.5 * Math.cos(k * Math.PI / 4), k % 4 === 0 ? 0.5 : 0.5 + 0.5 * Math.sin(k * Math.PI / 4)]);
  const MUZZLE = Object.freeze([
    Object.freeze(MUZZLE_STAND.map(([f, u], k) => Object.freeze(k <= 2 ? [f, +(u - 0.36).toFixed(2)] : [0.5, 0.3]))),
    Object.freeze(Array.from({ length: 8 }, (_, k) => ball(k))),
    Object.freeze(Array.from({ length: 8 }, () => Object.freeze([0.5, 0.22]))),
    Object.freeze(MUZZLE_STAND.map((m) => Object.freeze(m.slice())))
  ]);
  const TUNE = {
    RUN: 1.875, JUMP_V: 8, GRAVITY: 14.22, LOCK_FALL: 0.625, COYOTE: 0.1, JUMP_BUFFER: 0.1, SHOT_V: 5.6, RAPID_V: 7.5, AUTO_GAP: 8 / 60, AUTO_RUN: 6, AUTO_BREAK: 0.25,
    DROP_X: 1.5, DEAD: 1, CORK_V: 2.81, CORK_RAPID_V: 3.75,
    BEAM_V: 9.375, BEAM_GAP: 0.3, FAN_ARC: Math.PI / 3, CORK_R: 0.2, CORK_SPIN: 6 * Math.PI,
    MUZZLE,
    // The enemies: an enemy shot's speed, a runner's running left and running right (the reference's 1 and 1.25 pixels a
    // frame), a clerk's first shot and its gap between shots (dealt from the dice between three quarters and five quarters
    // of it), how long a destroyed enemy lies before its slot frees, and how far off the screen an enemy may stand before its
    // slot frees.
    ENEMY_SHOT_V: 3, RUNNER_V: 1.875, RUNNER_RIGHT_V: 2.34, CLERK_FIRST: 1, CLERK_GAP: 1.5, DYING: 0.5, ENEMY_MARGIN: 1,
    // The printer, the reference's rotating gun: its first look PRINTER_FIRST[k] after it opens, k the strongest weapon the
    // joined players hold (RULES.STRENGTH: 60, 50, 40 and 30 frames, the turn's own steps a quarter longer, so an Ooga
    // standing 3 m off and tapping fire four times a second wins the duel at the rifle), then one aim step each
    // PRINTER_TURN[k] while off the nearest Ooga (the reference's 48, 40, 32 and 24 frames); on it, an attack of one shot
    // (two or three when its placed attr asks), PRINTER_BURST_GAP apart at PRINTER_SHOT_V, then PRINTER_REST[k] before it
    // looks again (128, 96, 64 and 48 frames).
    PRINTER_FIRST: Object.freeze([1, 50 / 60, 40 / 60, 0.5]), PRINTER_TURN: Object.freeze([0.8, 40 / 60, 32 / 60, 0.4]), PRINTER_BURST_GAP: 16 / 60,
    PRINTER_REST: Object.freeze([128 / 60, 1.6, 64 / 60, 0.8]), PRINTER_SHOT_V: 2.81,
    // How long a printer winds up before each attack (raid-enemies.js's PRINTER_WIND, inside the wait before it), so the
    // view can tell it coming: shorter than the shortest rest.
    PRINTER_WINDUP: 0.6,
    // An emplacement's life on a side stage or a climb (raid-enemies.js's `emplaced` types, the reference rotating gun's):
    // shut until its middle stands EMPLACE_IN inside the screen's right edge (on a climb EMPLACE_IN_CLIMB under its top),
    // opening for EMPLACE_OPEN (the reference's 16 to 24 frames), and shut again for good once it is within EMPLACE_OUT of
    // the left edge (a climb's bottom): the reference's 16, 48 and 24 pixels.
    EMPLACE_IN: 0.5, EMPLACE_IN_CLIMB: 1.5, EMPLACE_OPEN: 0.3, EMPLACE_OUT: 0.75,
    // Spawning and pickups: how near an edge an Ooga refuses the spawner that edge; a carrier's speed, the height of its
    // sway either side and the seconds a sway takes; a sensor's seconds shut and open; an item's speed up as it pops out
    // and the height of its middle over what it rests on.
    SPAWN_CLEAR: 1, CARRIER_V: 2.5, CARRIER_SWAY: 0.5, CARRIER_WAVE: 2, SENSOR_SHUT: 2, SENSOR_OPEN: 1.5, ITEM_POP: 3, ITEM_HALF: 0.25,
    // An item's speed forward through a room toward the front line (in metres a second, as a walker's).
    ITEM_DRIFT: 2,
    // A lob's fall (in metres a second squared, its own, gentler than an Ooga's) and its fastest speed along x; how long a
    // room's tripwire warns before it goes live, and the grace into a room in which no wire is live and no wave comes: the
    // warning, then the run (at RUN) from the middle of the front line's whole width (ROOM_W - 2 ROOM_FRONT) out past either
    // end, rounded up, so an Ooga walking in anywhere in a span can walk out of it once it sees the warning.
    LOB_G: 9, LOB_VX_MAX: 8, WIRE_WARN: 0.4, ROOM_GRACE: 2.4,
    // The boss: where the vault's guns sit, [x, y] from its x and feet, the upper one first; a gun's first shot (late
    // enough that a lone gun loses the duel to an Ooga 3 m off tapping four times a second) and its gap between shots (the
    // second gun half a gap behind the first); the open vault's gap between spreads.
    VAULT_GUNS: [[-1.35, 4.5], [-1.35, 3]], VAULT_GUN_FIRST: 1.4, VAULT_GUN_GAP: 1.2, VAULT_GAP: 1.6,
    // Rooms: how deep a room is in metres (a shot's or a walker's speed into it is its speed over this), how long up must be
    // held alone to walk forward through the open barrier, and how long the advance into the next room takes; a wall teller's seconds shut and open; a coin barrel's roll and a guard's run; a guard's
    // first shot once at the front line and its gap between shots (dealt as a clerk's); the slots a room keeps free for
    // shots, which nothing with hit points takes (a boss's largest volley, three shots); and the most enemies with hit points
    // off the back wall a room's waves keep alive, the next wave waiting while it is reached: two, so that even with nothing
    // spent on an Ooga (a barrier) their shots in flight leave a boss room's volleys every slot they ask for.
    ROOM_DEPTH: 5, ROOM_STEP_IN: 0.25, ROOM_ADVANCE: 1, TELLER_SHUT: 2, TELLER_OPEN: 1.2, ROOM_RESERVE: 3, ROOM_WAVE_MAX: 2,
    BARREL_V: 1.5, GUARD_V: 1.875, GUARD_FIRST: 0.6, GUARD_GAP: 1.5,
    // Two players: the least the screen leaves between the trailing Ooga and the edge it trails by (left on a side stage,
    // the bottom on a climb) as it scrolls; how fast a climb's screen goes on up to its lock once its boss is in play; the
    // seconds with no button held after which a player is idle, and the fastest the screen catches up on the leader once
    // the idle one stops holding it.
    TRAIL: 0.3, BOSS_SCROLL_V: 2, IDLE: 5, CATCH_V: 4,
    // A side or climb stage's boss fight: the slots kept free for shots, which nothing with hit points but a boss main and
    // its parts takes while the run is in PHASE.BOSS: the largest volley a boss there fires at once, the Inflation
    // Balloon's ring of six (the Chairman's Engine's spread is five, the Grid Warden's discharge five, the rest three).
    BOSS_RESERVE: 6,
    // Terrain: raid-terrain.js's own TUNE (GUST_*, CRUMBLE_*), the same keys and values.
    ...TERRAIN
  };

  const SCREEN_X = SCREEN_W * CELL, HALF_SCREEN = SCREEN_X / 2, SCREEN_Y = SCREEN_H * CELL, HALF_SCREEN_Y = SCREEN_Y / 2;
  const EPS = 1e-4, DROP_THROUGH = 0.01;
  // Rooms. The fixed perspective a room is seen in, which the scene draws with too: a point at depth z (0 at the front
  // line, 1 at the back wall) shows at x' = MID + (x - MID) * (1 - SHRINK * z), y' = y * (1 - SHRINK * z) + RISE * z.
  // A shot meets a target when they stand within HIT_DEPTH of each other's depth and the shot's point, projected, falls
  // in the target's box projected (shrunk as its depth shrinks it). The Oogas walk the front line from FRONT_L to FRONT_R.
  const ROOM = Object.freeze({ MID: ROOM_W / 2, SHRINK: 0.35, RISE: 2.2, HIT_DEPTH: 0.08, FRONT_L: ROOM_FRONT, FRONT_R: ROOM_W - ROOM_FRONT });
  const ROOM_PHASE = Object.freeze({ FIGHT: 0, OPEN: 1, ADVANCE: 2 });
  const projectX = (x, z) => ROOM.MID + (x - ROOM.MID) * (1 - ROOM.SHRINK * z);
  const projectY = (y, z) => y * (1 - ROOM.SHRINK * z) + ROOM.RISE * z;
  // Wire k of a parsed room at `time` on the room's clock: live, warning (the last WIRE_WARN of its dark time) or dark; in
  // the room's first ROOM_GRACE never live, warning instead while its cycle has it live. The step works the same out in place.
  const WIRE = Object.freeze({ DARK: 0, WARN: 1, LIVE: 2 });
  const wireState = (room, k, time) => {
    const w = room.wires, i = k * 6, on = w[i + 3], period = on + w[i + 4], at = (time + w[i + 5]) % period;
    if (at < on) return time < TUNE.ROOM_GRACE ? WIRE.WARN : WIRE.LIVE;
    return at >= period - TUNE.WIRE_WARN ? WIRE.WARN : WIRE.DARK;
  };
  // The eight aims as unit vectors, exact on the axes so a level shot has no vertical speed at all.
  const H = Math.SQRT1_2;
  const AIM_X = Object.freeze([1, H, 0, -H, -1, -H, 0, H]), AIM_Y = Object.freeze([0, H, 1, H, 0, -H, -1, -H]);

  // The twelve directions an enemy aims along, exact on the axes (`aimAt` picks the nearest of them to an offset).
  const AIMS = RULES.AIM_STEPS, AIM_ARC = 2 * Math.PI / AIMS;
  const SHOT_X = Object.freeze(Array.from({ length: AIMS }, (_, k) => k % (AIMS / 4) === 0 ? [1, 0, -1, 0][k / (AIMS / 4)] : Math.cos(k * AIM_ARC)));
  const SHOT_Y = Object.freeze(Array.from({ length: AIMS }, (_, k) => k % (AIMS / 4) === 0 ? [0, 1, 0, -1][k / (AIMS / 4)] : Math.sin(k * AIM_ARC)));
  // RULES' tables by type name as arrays by ENEMY value, where a type registered in raid-enemies.js with its own `field`
  // takes that instead. The types are all registered by now, so the registry closes (a later registration throws); every
  // ENEMY value but FREE must have a def, a def may not give a number RULES already names for its type, and a type RULES
  // names nowhere gives all four.
  close();
  const FIELDS = [["hp", "HP"], ["tier", "TIERS"], ["points", "POINTS"], ["origin", "ORIGIN"]];
  const HP_FIELD = (def, name) => def.hp !== undefined ? def.hp : RULES.HP[name] || 0;
  for (const name of Object.keys(ENEMY)) {
    const def = TYPES[ENEMY[name]];
    if (ENEMY[name] === ENEMY.FREE) continue;
    if (!def) throw new Error(`raid sim: enemy ${name} (${ENEMY[name]}) has no def in raid-enemies.js`);
    const named = FIELDS.some(([, table]) => name in RULES[table]);
    for (const [field, table] of FIELDS) {
      if (def[field] !== undefined && name in RULES[table]) throw new Error(`raid sim: enemy ${name}'s def gives ${field}, which RULES.${table} already names`);
      if (!named && typeof def[field] !== "number") throw new Error(`raid sim: enemy ${name}'s def leaves out ${field}, and RULES names no ${name}, so its def gives hp, tier, points and origin`);
    }
    if (def.boss && def.routines[def.destroyed] !== bossBreak) throw new Error(`raid sim: enemy ${name} is a boss main, so its destroyed routine must be bossBreak`);
    if (def.swell !== undefined && !(typeof def.swell === "number" && def.swell >= 0 && HP_FIELD(def, name) > 0)) throw new Error(`raid sim: enemy ${name}'s swell ${def.swell} is not a share of 0 or more of a type with hit points`);
    if (def.main !== undefined && !(TYPES[def.main] && TYPES[def.main].boss)) throw new Error(`raid sim: enemy ${name}'s main ${def.main} is no boss main`);
  }
  const byType = (table, field) => {
    const out = new Array(Object.keys(ENEMY).length).fill(0);
    for (const name of Object.keys(table)) out[ENEMY[name]] = table[name];
    for (let t = 0; t < out.length; t++) if (TYPES[t] && TYPES[t][field] !== undefined) out[t] = TYPES[t][field];
    return Object.freeze(out);
  };
  const HP_OF = byType(RULES.HP, "hp"), POINTS_OF = byType(RULES.POINTS, "points"), TIER_OF = byType(RULES.TIERS, "tier"), ORIGIN_OF = byType(RULES.ORIGIN, "origin");
  // The back wall's types (ROOM_REACH names them), which a room's wave cap leaves out: its targets, never what comes in.
  const WALL = new Uint8Array(HP_OF.length);
  for (const name of Object.keys(ROOM_REACH)) if (ENEMY[name] !== undefined) WALL[ENEMY[name]] = 1;
  // The flags a slot starts with, set by `spawn` (a sensor starts shut, the vault shut until its guns are gone), the
  // routine each type goes to at 0 hit points, and each type's routines.
  const START_FLAGS = byType({}, "flags"), DESTROYED = byType({}, "destroyed"), ROUTINES = byType({}, "routines");
  // The types a kill spends and the barrier leaves alone: SHOT, and every type of the shot tier that is no machine (a LOB,
  // a SPARK; a VENT is a machine). A belt carries a `belted` walker; a boss part names its `main`, the main's ENEMY value.
  const SHOTLIKE = Uint8Array.from(TIER_OF, (tier, t) => t === ENEMY.SHOT || (tier === RULES.TIER.SHOT && !(START_FLAGS[t] & FLAG.MACHINE)) ? 1 : 0);
  const BELTED = Uint8Array.from(byType({}, "belted"), Number), MAIN_OF = Uint8Array.from(byType({}, "main"), Number);
  // A type whose def is `standTouch` meets an Ooga with the standing pose's touch box whatever its pose, so lying prone
  // under it is no escape (the Bailout Mech's feet).
  const STAND_TOUCH = Uint8Array.from(byType({}, "standTouch"), Number);
  // A `solid` type (the PRINTER) is a block to the Oogas off a room and its touch is never tested: SOLID_AT[type * 4] its
  // bullet box about its origin as [x from, x to, y from, y to] over its x and feet (see `stepPlayer`).
  const SOLID = Uint8Array.from(byType({}, "solid"), Number), SOLID_AT = new Float64Array(SOLID.length * 4);
  for (let t = 0; t < SOLID.length; t++) {
    if (!SOLID[t]) continue;
    const b = RULES.SHOT_BOX[TIER_OF[t]];
    SOLID_AT.set([b[0], b[1], ORIGIN_OF[t] + b[2], ORIGIN_OF[t] + b[3]], t * 4);
  }
  // What a side or climb boss fight's slot reserve holds back (TUNE.BOSS_RESERVE): a type with hit points that is neither a
  // boss main nor a boss part, a part being a type naming its `main` or one of the older bosses' parts, the vault's guns
  // and the balloon's tethers, which predate it. So edge runners, placed troops and a boss's own releases wait.
  const RESERVED = Uint8Array.from(HP_OF, (hp, t) => hp > 0 && !(TYPES[t] && TYPES[t].boss) && MAIN_OF[t] === 0 && t !== ENEMY.VAULT_GUN && t !== ENEMY.TETHER ? 1 : 0);
  // Boss mains (whose records wait for a slot), scaled hit points, and each part type's mounts, MOUNT_AT[(type *
  // MOUNT_MAX + attr) * 2] its dx and dy, MOUNT_N[type] how many (0 for a type that follows nothing).
  const BOSS_MAIN = Uint8Array.from(byType({}, "boss"), Number), SCALED = Uint8Array.from(byType({}, "scaled"), Number);
  // A swelling type's boxes (its bullet box and its touch boxes) grow about its origin as it is hit, by 1 + SWELL[type]
  // times the share of its hit points gone, so to 1 + SWELL[type] * (1 - 1 / its hit points at spawn) times their size at
  // its last hit point: the sim keeps its hit points at spawn in `eBurst` (0 for every other type).
  const SWELL = Float64Array.from(byType({}, "swell"));
  const MOUNT_N = Uint8Array.from(byType({}, "mounts"), (m) => m ? m.length : 0), MOUNT_MAX = Math.max(1, ...MOUNT_N);
  const MOUNT_AT = new Float64Array(MOUNT_N.length * MOUNT_MAX * 2);
  for (let t = 0; t < MOUNT_N.length; t++) for (let a = 0; a < MOUNT_N[t]; a++) MOUNT_AT.set(TYPES[t].mounts[a], (t * MOUNT_MAX + a) * 2);
  // A room's reach: the highest a shot into the room flies (standing, or at a jump's top) and, for each back-wall type
  // ROOM_REACH names, the highest its target point (its x, y as authored, the box's origin ORIGIN_OF over it) may stand
  // and still take that shot in its bullet box, met at the same depth. Its ROOM_REACH entry, which validate holds its
  // targets to, must not pass that, or a core could stand where nothing hits it.
  {
    const top = Math.max(TUNE.MUZZLE[POSE.STAND][0][1], TUNE.JUMP_V * TUNE.JUMP_V / (2 * TUNE.GRAVITY) + TUNE.MUZZLE[POSE.JUMP][0][1]);   // the forward points' heights
    for (const name of Object.keys(ROOM_REACH)) {
      const t = ENEMY[name];
      if (t === undefined || HP_OF[t] === 0) throw new Error(`raid sim: ROOM_REACH names ${name}, which is no enemy with hit points`);
      const reach = top - ORIGIN_OF[t] - RULES.SHOT_BOX[TIER_OF[t]][2];
      if (ROOM_REACH[name] > reach) throw new Error(`raid sim: ROOM_REACH.${name} ${ROOM_REACH[name]} m passes the ${reach.toFixed(3)} m a shot into a room meets ${name} at`);
    }
  }
  // The weapon each weapon item gives.
  const ITEM_WEAPON = new Uint8Array(Object.keys(ITEM).length + 1);
  ITEM_WEAPON[ITEM.AUTO] = WEAPON.AUTO; ITEM_WEAPON[ITEM.CORK] = WEAPON.CORK; ITEM_WEAPON[ITEM.FAN] = WEAPON.FAN; ITEM_WEAPON[ITEM.BEAM] = WEAPON.BEAM;

  // mulberry32 over the run's own state, so a seed replays the same dice. The spawner and enemies draw from it: `roll(s)`
  // draws the next into DICE[0] rather than returning it, since a number returned from a call the compiler leaves out of
  // line is boxed, an allocation a draw.
  const DICE = new Float64Array(1);
  const roll = (s) => {
    s.randState = s.randState + 0x6D2B79F5 | 0;
    let t = Math.imul(s.randState ^ s.randState >>> 15, 1 | s.randState);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    DICE[0] = ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  // Shaman's Secrets, the cheats the title card's tablet turns on that change the rules (`create({ cheats })`, these bits
  // or'd; scene-raid.js keeps the view's own): LIVES starts each Ooga with CHEAT_TUNE.LIVES in reserve (30 in all) and
  // a continue gives them back; CONTINUES never spends one; SPREAD and RAPID hand the fan and rapid fire wherever the
  // rifle and plain fire would be (each stage's start and every death); SLOW runs every shot-like slot (SHOTLIKE) at
  // CHEAT_TUNE.SHOT_SLOW of the step, so the Legion's shots and lobs fly slower over the same paths; BARRIER keeps every
  // Ooga in play under the barrier. Both players alike. The bits live in `state.cheats`, which `hash` folds only when
  // not 0, so a run with none hashes as it always has.
  const CHEAT = Object.freeze({ LIVES: 1, CONTINUES: 2, SPREAD: 4, RAPID: 8, SLOW: 16, BARRIER: 32, ALL: 63 });
  const CHEAT_TUNE = Object.freeze({ LIVES: 29, SHOT_SLOW: 0.5 });
  // The slowed step worked out once, so a slowed slot's step is a number already made (one worked out each call would be
  // a new heap number every slot, every step).
  const SLOW_FIXED = FIXED * CHEAT_TUNE.SHOT_SLOW;
  // The state's scalars that hold fractions or large integers (see `create`).
  const FRACTIONAL = Object.freeze(["time", "acc", "camX", "camY", "spawnTimer", "roomTime", "roomTimer", "randState"]);
  const create = ({ seed = 1, stage = 0, loops = 0, players = 1, carry = null, cheats = 0 } = {}) => {
    const st = typeof stage === "number" ? STAGES[stage] : stage, climb = st.kind === "climb", rooms = st.kind === "rooms";
    if (players !== 1 && players !== 2) throw new Error(`raid sim: ${players} players; a run takes 1 or 2`);
    if (!Number.isInteger(cheats) || (cheats & ~CHEAT.ALL) !== 0) throw new Error(`raid sim: cheats ${cheats} are not CHEAT bits`);
    // The cheats' rules: the reserve each Ooga starts with and a continue gives back, its weapon and rapid fire at a stage's
    // start and after a death, and whether shots run slow and the barrier stays.
    const START_LIVES = cheats & CHEAT.LIVES ? CHEAT_TUNE.LIVES : RULES.LIVES, BASE_WEAPON = cheats & CHEAT.SPREAD ? WEAPON.FAN : WEAPON.RIFLE;
    const BASE_RAPID = cheats & CHEAT.RAPID ? 1 : 0, SLOW_SHOTS = (cheats & CHEAT.SLOW) !== 0, KEEP_BARRIER = (cheats & CHEAT.BARRIER) !== 0;
    if (carry) {
      for (const key of ["score", "lives", "nextLife", "weapon", "rapid", "out"]) {
        if (!carry[key] || carry[key].length < players) throw new Error(`raid sim: carry.${key} holds fewer than ${players} players`);
      }
      if (!Number.isFinite(carry.continues)) throw new Error(`raid sim: carry.continues ${carry.continues} is no finite number`);
    }
    // Terrain, flat for the step (none on a rooms stage): gust zones three numbers each (from, to, dir), lifts six (col,
    // width, lowRow, highRow, speed, hold) and crumbling spans three (col0, col1, row).
    const flat = (list, size, out) => { list.forEach((record, k) => out.set(record, k * size)); return out; };
    const gusts = rooms ? [] : st.gusts, lifts = rooms ? [] : st.lifts, spans = rooms ? [] : st.crumble;
    const GUSTS = flat(gusts, 3, new Int16Array(gusts.length * 3)), LIFTS = flat(lifts, 6, new Float64Array(lifts.length * 6));
    const SPANS = flat(spans, 3, new Int16Array(spans.length * 3)), NLIFT = lifts.length, NSPAN = spans.length;
    // Belts four numbers each (col0, col1, row, v), tide basins four (col0, col1, lowRow, highRow) and floats two (col0, col1).
    const belts = rooms ? [] : st.belts, basins = rooms ? [] : st.tide.basins, floats = rooms ? [] : st.tide.floats;
    const BELTS = flat(belts, 4, new Float64Array(belts.length * 4)), BASINS = flat(basins, 4, new Int16Array(basins.length * 4));
    const FLOATS = flat(floats, 2, new Int16Array(floats.length * 2)), NBELT = belts.length, NBASIN = basins.length;
    const s = {
      px: new Float32Array(PLAYERS), py: new Float32Array(PLAYERS), pvx: new Float32Array(PLAYERS), pvy: new Float32Array(PLAYERS),
      pState: new Uint8Array(PLAYERS), pPose: new Uint8Array(PLAYERS), pAim: new Uint8Array(PLAYERS), pWeapon: new Uint8Array(PLAYERS),
      pRapid: new Uint8Array(PLAYERS), pLives: new Uint8Array(PLAYERS), pFace: new Int8Array(PLAYERS),
      pInvincible: new Float32Array(PLAYERS), pBarrier: new Float32Array(PLAYERS), pTimer: new Float32Array(PLAYERS),   // pTimer: seconds left dead
      pScore: new Float64Array(PLAYERS), pNextLife: new Float64Array(PLAYERS),
      bLive: new Uint8Array(BULLETS), bOwner: new Uint8Array(BULLETS), bKind: new Uint8Array(BULLETS),
      bx: new Float32Array(BULLETS), by: new Float32Array(BULLETS), bvx: new Float32Array(BULLETS), bvy: new Float32Array(BULLETS),
      blx: new Float32Array(BULLETS), bly: new Float32Array(BULLETS), bAge: new Float32Array(BULLETS),   // line point, seconds flown
      pFireGap: new Float32Array(PLAYERS),   // seconds until a held auto rifle fires again
      eType: new Uint8Array(ENEMY_SLOTS), eRoutine: new Uint8Array(ENEMY_SLOTS), eHp: new Uint8Array(ENEMY_SLOTS),
      eFlags: new Uint8Array(ENEMY_SLOTS), eAttr: new Uint8Array(ENEMY_SLOTS),
      ex: new Float32Array(ENEMY_SLOTS), ey: new Float32Array(ENEMY_SLOTS), evx: new Float32Array(ENEMY_SLOTS), evy: new Float32Array(ENEMY_SLOTS),
      eTimer: new Float32Array(ENEMY_SLOTS), eLink: new Int8Array(ENEMY_SLOTS),
      eAim: new Uint8Array(ENEMY_SLOTS), eBurst: new Uint8Array(ENEMY_SLOTS),   // a shooter's aim step (0 to AIM_STEPS - 1), a burst's shots left
      pDuck: new Uint8Array(PLAYERS),   // ducked under water, where nothing hits
      // The air: the drift latched along x (-1, 0 or 1, times RUN), 1 while a walk off a ledge or a drop through one may not
      // steer, and the height that lock ends at; and the auto rifle's held shots in a row (see AUTO_RUN).
      pDrift: new Int8Array(PLAYERS), pLock: new Uint8Array(PLAYERS), pLockY: new Float32Array(PLAYERS), pAutoRun: new Uint8Array(PLAYERS),
      // The forgivenesses: seconds left in which a walk off a ledge may still jump (COYOTE), and in which a jump pressed in
      // the air fires on landing (JUMP_BUFFER); 0 for none. Hashed only while either is not 0 (see `hash`).
      pCoyote: new Float32Array(PLAYERS), pBuffer: new Float32Array(PLAYERS),
      // Two players: the seconds since each last held any button, to TUNE.IDLE (see the header). Hashed only with two.
      pIdle: new Float32Array(PLAYERS),
      phase: PHASE.PLAY, continues: RULES.CONTINUES, loops, time: 0, acc: 0, camX: 0, lockX: climb || rooms ? 0 : st.lockScreen * SCREEN_X,
      camY: 0, lockY: climb ? st.lockScreen * SCREEN_Y : 0,   // a climb's scroll up and where it locks; 0 on a side stage
      spawnTimer: 0, listCursor: 0, randState: seed | 0, input: 0, attack: 0,
      prevInput: 0,   // last step's buttons, so a press is told from a hold (both packed six bits a player, player 0 lowest)
      players, paused: 0,   // the players joined (the rest stay OUT), and 1 while paused
      cheats,   // the CHEAT bits this run plays under, 0 for none (hashed only when not 0)
      // Rooms: a bullet's and a slot's depth (0 at the front line, 1 at the back wall) and its change a second; the room played, its ROOM_PHASE, the barrier (1 while closed), the seconds since
      // the room started, the seconds the advance has left, and the waves spawned. All 0 on other stages.
      bz: new Float32Array(BULLETS), bvz: new Float32Array(BULLETS), ez: new Float32Array(ENEMY_SLOTS), evz: new Float32Array(ENEMY_SLOTS),
      pHold: new Float32Array(PLAYERS),   // and seconds up has been held alone to walk forward
      room: 0, roomPhase: ROOM_PHASE.FIGHT, barrier: 0, roomTime: 0, roomTimer: 0, waveCursor: 0,
      // Terrain: the run's own copy of the grid, which crumbling spans and the tide write (empty on a stage with neither,
      // which reads the stage's), and each span's CRUMBLE phase and the seconds left in it.
      cells: NSPAN || NBASIN ? Uint8Array.from(st.cells) : new Uint8Array(0), crumblePhase: new Uint8Array(NSPAN), crumbleTimer: new Float32Array(NSPAN)
    };
    // The scalars that come to hold fractions, and `randState`, an int32 often past V8's small integers. V8 lays out a
    // field first stored a small integer for small integers, and the first fraction stored there changes the state's
    // shape, which sends every function reading the state back through V8's slower tiers (where every number is boxed)
    // for tens of seconds of play: so each is stored a fraction once here, then its start value, and the state keeps one
    // shape for the whole run. The values, and so `hash`, are unchanged.
    for (const key of FRACTIONAL) { const start = s[key]; s[key] = 0.5; s[key] = start; }
    s.pState.fill(PSTATE.OUT);
    s.pPose.fill(POSE.JUMP);
    s.pFace.fill(1);
    s.pLives.fill(START_LIVES);
    s.pNextLife.fill(RULES.EXTRA_FIRST);
    s.pIdle.fill(TUNE.IDLE);

    // The edge spawner's timer: the stage's base, cut for each loop completed and for the strongest weapon held.
    const spawnPeriod = () => {
      let strength = 0;
      for (let p = 0; p < PLAYERS; p++) strength = Math.max(strength, RULES.STRENGTH[s.pWeapon[p]]);
      return st.spawner.base - RULES.SPAWN_LOOP_CUT * Math.min(s.loops, RULES.SPAWN_LOOPS_MAX) - RULES.SPAWN_STRENGTH_CUT * strength;
    };
    // The stage from its start: every joined Ooga dropping in over `start` with the rifle, the screen and both pools empty.
    // A rooms stage has no start or spawner: the Oogas drop in over the middle of the front line, and its first room starts.
    const startStage = () => {
      if (NSPAN) restore();
      if (NBASIN) placeTide();
      if (NLIFT) placeLifts(0);
      s.bLive.fill(0);
      s.eType.fill(ENEMY.FREE); s.eRoutine.fill(0); s.eHp.fill(0); s.eFlags.fill(0); s.eAttr.fill(0);
      s.ex.fill(0); s.ey.fill(0); s.evx.fill(0); s.evy.fill(0); s.eTimer.fill(0); s.eLink.fill(-1); s.eAim.fill(0); s.eBurst.fill(0);
      s.ez.fill(0); s.evz.fill(0);
      for (let p = 0; p < s.players; p++) {
        s.pHold[p] = 0;
        s.pState[p] = PSTATE.DROP; s.pPose[p] = POSE.JUMP; s.pFace[p] = 1; s.pAim[p] = 0;
        s.pWeapon[p] = BASE_WEAPON; s.pRapid[p] = BASE_RAPID; s.pInvincible[p] = 0; s.pBarrier[p] = 0; s.pTimer[p] = 0; s.pFireGap[p] = 0; s.pDuck[p] = 0;
        s.pDrift[p] = 0; s.pLock[p] = 0; s.pLockY[p] = 0; s.pAutoRun[p] = 0;
        s.px[p] = rooms ? ROOM.MID : (st.start.col + 0.5) * CELL;
        s.py[p] = rooms ? SCREEN_Y : st.start.row * CELL;
        s.pvx[p] = 0; s.pvy[p] = 0;
      }
      s.camX = clamp(s.px[0] - HALF_SCREEN, 0, s.lockX);
      s.camY = 0;   // a climb starts on its bottom screen, where its start stands
      if (s.players > 1) s.px[1] = besideX(s.px[0], startFits);
      s.spawnTimer = !rooms && st.spawner.base > 0 ? spawnPeriod() : 0; s.listCursor = 0; s.phase = PHASE.PLAY; s.attack = 0;
      if (rooms) startRoom(0);
    };

    // The cells bodies collide with: the stage's grid (the run's own copy where spans crumble or a tide runs, read as
    // `cellAt` reads the stage's), or a room's floor (y 0) and side walls, open above.
    const grid = s.cells, cols = rooms ? 0 : st.cols, rowsOf = rooms ? 0 : st.rows;
    const cell = rooms ? (col, row) => col < 0 || col >= SCREEN_W || row < 0 ? KIND.SOLID : KIND.EMPTY
      : NSPAN || NBASIN ? (col, row) => col < 0 || col >= cols ? KIND.SOLID : row < 0 || row >= rowsOf ? KIND.EMPTY : grid[row * cols + col]
        : (col, row) => cellAt(st, col, row);
    // The screen's edges in the world, by the camera: a side stage's top is its grid's, a climb's and a room's the camera's.
    const screenLeft = () => s.camX, screenRight = () => s.camX + SCREEN_X, screenBottom = () => s.camY;
    const screenTop = climb || rooms ? () => s.camY + SCREEN_Y : () => st.rows * CELL;
    // The same four edges, [left, right, bottom, top], as numbers the step reads without a call: `bounds` writes them at
    // the step's start and again once the camera has moved, and nothing else in the step moves it. The step's loops, and
    // the routines through `ctx.bounds`, read these, because a number returned from (or passed to) a call the compiler leaves
    // out of line is boxed, an allocation each time.
    const BOUNDS = new Float64Array(4);
    const bounds = () => { BOUNDS[0] = s.camX; BOUNDS[1] = s.camX + SCREEN_X; BOUNDS[2] = s.camY; BOUNDS[3] = climb || rooms ? s.camY + SCREEN_Y : st.rows * CELL; };
    const colOf = (x) => Math.floor(x / CELL);
    // A solid cell in column col from row lo to row hi; in the column at x anywhere from the feet to the head. The step's
    // walkers ask `solidRows` with the rows worked out in place, so no number is passed to a call (see BOUNDS).
    const solidRows = (col, lo, hi) => {
      for (let row = lo; row <= hi; row++) if (cell(col, row) === KIND.SOLID) return true;
      return false;
    };
    const wallAt = (x, y, h) => solidRows(colOf(x), Math.floor((y + EPS) / CELL), Math.floor((y + h - EPS) / CELL));
    // Something to land on somewhere under `row` in this column.
    const groundBelow = (col, row) => {
      for (let r = row - 1; r >= 0; r--) if (cell(col, r) !== KIND.EMPTY) return true;
      return false;
    };

    // Climb: the row a body at height y stands in, and the row over the highest non-empty cell under it on the screen
    // (where a fall from y comes to rest, its top over `camY`), or -1 when nothing on the screen holds it up.
    const rowAt = (y) => Math.floor(y / CELL + EPS);
    const landRow = (col, y) => {
      for (let r = rowAt(y) - 1, low = Math.floor(screenBottom() / CELL); r >= low; r--) if (cell(col, r) !== KIND.EMPTY) return r + 1;
      return -1;
    };

    // Lifts, crumbling spans, belts and the tide: the run's terrain steps over its own arrays (raid-terrain.js's `bind`,
    // which tells each).
    const {
      LY0, LY1, LIFTQ, placeLifts, liftStood, liftUnder, liftBelow, stepCrumble, blows, turn, restore,
      BELTQ, beltStood, TIDEQ, TOPS, basinAt, stepTide, placeTide, tideLift
    } = bindTerrain({ s, st, grid, cols, LIFTS, SPANS, BELTS, BASINS, FLOATS, NLIFT, NSPAN, NBELT, NBASIN, PLAYERS, PSTATE, POSE, EPS });

    // Where a drop-in falls: above ground in its column, the top row open; on a climb, from the top of the current
    // screen onto ground on that screen, the screen's top row open; in a room, anywhere on its floor. The drop column
    // first, then every second column rightward across the screen, and the drop column again when the screen has none.
    const dropGround = (col) => {
      if (rooms) return true;
      if (climb) return cell(col, rowAt(screenTop()) - 1) !== KIND.SOLID && (landRow(col, screenTop()) >= 0 || NLIFT > 0 && liftBelow(col, screenTop()) >= 0);
      return cell(col, st.rows - 1) !== KIND.SOLID && (groundBelow(col, st.rows - 1) || NLIFT > 0 && liftBelow(col, st.rows * CELL) >= 0);
    };
    const dropX = () => {
      const x0 = screenLeft() + TUNE.DROP_X, last = colOf(screenRight() - EPS);
      for (let x = x0; colOf(x) <= last; x += 2 * CELL) if (dropGround(colOf(x))) return x;
      return x0;
    };
    // The second Ooga drops in beside the first's point: two cells ahead, one ahead, one behind, two behind, the first column
    // on the screen that `fits` it, so two Oogas dropping in never share an x; the point itself when none does. At the start
    // a column fits with its start cell open and ground under it (on a climb, on the screen); in a room every column does.
    const BESIDE = [2, 1, -1, -2];
    const besideX = (x, fits) => {
      const first = colOf(screenLeft()), last = colOf(screenRight() - EPS);
      for (let k = 0; k < BESIDE.length; k++) {
        const nx = x + BESIDE[k] * CELL, col = colOf(nx);
        if (col >= first && col <= last && fits(col)) return nx;
      }
      return x;
    };
    const startFits = (col) => rooms || cell(col, st.start.row) !== KIND.SOLID &&
      ((climb ? landRow(col, st.start.row * CELL) >= 0 : groundBelow(col, st.start.row)) || NLIFT > 0 && liftBelow(col, st.start.row * CELL) >= 0);
    const dropAt = (p, x) => {
      s.px[p] = x; s.py[p] = screenTop(); s.pvx[p] = 0; s.pvy[p] = 0;
      s.pState[p] = PSTATE.DROP; s.pPose[p] = POSE.JUMP; s.pDrift[p] = 0; s.pLock[p] = 0;   // it falls straight until steered
      s.pCoyote[p] = 0; s.pBuffer[p] = 0;
    };
    const dropIn = (p) => dropAt(p, p === 0 ? dropX() : besideX(dropX(), dropGround));
    // Two players: p idle (see the header) while the other is in the run and not, so the screen does not wait on p.
    const idleBy = (p) => {
      const q = 1 - p, qs = s.pState[q];
      return s.players === 2 && s.pIdle[p] >= TUNE.IDLE && s.pIdle[q] < TUNE.IDLE && (qs === PSTATE.NORMAL || qs === PSTATE.DROP);
    };
    // The idle Ooga carried along: dropped in, as a respawn is, over ground a cell to four behind the leader (behind the
    // way it faces on a climb, whose screen scrolls up), clear of the screen's trailing TRAIL, else at the drop point.
    const carryIn = (p) => {
      const q = 1 - p, back = climb ? -s.pFace[q] : -1, lo = BOUNDS[0] + (climb ? 0 : TUNE.TRAIL), hi = BOUNDS[1];
      let x = dropX();
      for (let k = 1; k <= 4; k++) {
        const nx = s.px[q] + back * k * CELL;
        if (nx > lo && nx < hi && dropGround(colOf(nx))) { x = nx; break; }
      }
      dropAt(p, x);
    };
    // Any death: the weapon back to the rifle, rapid fire and the barrier gone, then TUNE.DEAD seconds down.
    const die = (p) => {
      s.pState[p] = PSTATE.DEAD; s.pTimer[p] = TUNE.DEAD;
      s.pWeapon[p] = BASE_WEAPON; s.pRapid[p] = BASE_RAPID; s.pBarrier[p] = 0; s.pInvincible[p] = 0;
      s.pvx[p] = 0; s.pvy[p] = 0; s.pHold[p] = 0; s.pCoyote[p] = 0; s.pBuffer[p] = 0;
    };
    // A hit from an enemy or its shot. A dropping, invincible or barriered Ooga walks through it. A pit calls `die`.
    // Once the stage is clear nothing kills, pit or hit, so a death there cannot leave the phase behind it.
    const kill = (p) => {
      if (s.phase === PHASE.CLEAR || s.pState[p] !== PSTATE.NORMAL || s.pInvincible[p] > 0 || s.pBarrier[p] > 0) return false;
      die(p);
      return true;
    };
    // Points to player p, and a life for every threshold they cross while thresholds stay under the cut-off (`lives`).
    // `hurt`, which every kill by a bullet goes through, adds its points itself and calls `lives` only on a crossing: a
    // call it made for every kill would run out of line in code the engine seldom optimizes (a kill comes every few
    // hundred steps), where every score read from the state is a new heap number.
    const lives = (p) => {
      while (s.pScore[p] >= s.pNextLife[p] && s.pNextLife[p] < RULES.EXTRA_CUTOFF) {
        if (s.pLives[p] < RULES.LIVES_MAX) s.pLives[p]++;
        s.pNextLife[p] += RULES.EXTRA_STEP;
      }
    };
    const award = (p, points) => { s.pScore[p] += points; lives(p); };

    // The fan's five directions for each aim, evenly across FAN_ARC, the middle one the aim itself.
    const FAN_X = new Float64Array(8 * RULES.FAN_PER_SHOT), FAN_Y = new Float64Array(8 * RULES.FAN_PER_SHOT);
    for (let aim = 0, mid = (RULES.FAN_PER_SHOT - 1) / 2; aim < 8; aim++) {
      for (let k = 0; k < RULES.FAN_PER_SHOT; k++) {
        const a = aim * Math.PI / 4 + (k - mid) * TUNE.FAN_ARC / (RULES.FAN_PER_SHOT - 1), i = aim * RULES.FAN_PER_SHOT + k;
        FAN_X[i] = k === mid ? AIM_X[aim] : Math.cos(a); FAN_Y[i] = k === mid ? AIM_Y[aim] : Math.sin(a);
      }
    }
    // One bullet into a free slot, which `fire` has made sure of, from SHOT: at x, y and, in a room, depth z, along dx, dy
    // and dz into it (z and dz 0 along the front line and on other stages), at speed v. `fire` fills SHOT in place, so
    // no number is passed to a call (see BOUNDS).
    const SHOT = new Float64Array(7);   // x, y, z, dx, dy, dz, v
    const shoot = (p, kind) => {
      let b = 0;
      while (s.bLive[b]) b++;
      const v = SHOT[6];
      s.bLive[b] = 1; s.bOwner[b] = p; s.bKind[b] = kind; s.bAge[b] = 0;
      s.blx[b] = s.bx[b] = SHOT[0]; s.bly[b] = s.by[b] = SHOT[1]; s.bz[b] = SHOT[2];
      s.bvx[b] = SHOT[3] * v; s.bvy[b] = SHOT[4] * v; s.bvz[b] = SHOT[5] * v / TUNE.ROOM_DEPTH;
    };
    // A shot of player p's weapon from the muzzle along its aim, whole or not at all: from MUZZLE's point for the pose and
    // the aim (mirrored facing left). The corkscrew flies at its own CORK_V (CORK_RAPID_V with rapid fire).
    const fire = (p) => {
      const w = s.pWeapon[p], n = w === WEAPON.FAN ? RULES.FAN_PER_SHOT : w === WEAPON.BEAM ? RULES.BEAM_SEGMENTS : 1;
      let mine = 0, free = 0;
      for (let b = 0; b < BULLETS; b++) if (!s.bLive[b]) free++; else if (s.bOwner[b] === p) mine++;
      if (mine + n > RULES.CAPS[w] || free < n) return false;
      const aim = s.pAim[p], face = s.pFace[p], table = TUNE.MUZZLE[s.pPose[p]], dx = AIM_X[aim], dy = AIM_Y[aim];
      const v = w === WEAPON.CORK ? (s.pRapid[p] ? TUNE.CORK_RAPID_V : TUNE.CORK_V) : s.pRapid[p] ? TUNE.RAPID_V : TUNE.SHOT_V;
      if (rooms && dy > 0) {
        // Up and up-forward fly into a room: the aim's rise is depth, and the shot flies level at the height of the pose's
        // forward point, starting that point's forward reach along the aim.
        const reach = table[0][0], x = s.px[p] + reach * dx, y = s.py[p] + table[0][1], z = reach * dy / TUNE.ROOM_DEPTH;
        SHOT[1] = y; SHOT[4] = 0;
        if (w === WEAPON.FAN) {
          SHOT[0] = x; SHOT[2] = z; SHOT[6] = v;
          for (let k = 0, i = aim * n; k < n; k++, i++) { SHOT[3] = FAN_X[i]; SHOT[5] = FAN_Y[i]; shoot(p, w); }
        } else if (w === WEAPON.BEAM) {
          SHOT[3] = dx; SHOT[5] = dy; SHOT[6] = TUNE.BEAM_V;
          for (let k = 0; k < n; k++) { SHOT[0] = x + k * TUNE.BEAM_GAP * dx; SHOT[2] = z + k * TUNE.BEAM_GAP * dy / TUNE.ROOM_DEPTH; shoot(p, w); }
        } else { SHOT[0] = x; SHOT[2] = z; SHOT[3] = dx; SHOT[5] = dy; SHOT[6] = v; shoot(p, w); }
        return true;
      }
      const muzzle = table[face > 0 ? aim : (12 - aim) & 7], x = s.px[p] + face * muzzle[0], y = s.py[p] + muzzle[1];
      SHOT[2] = 0; SHOT[5] = 0;
      if (w === WEAPON.FAN) {
        SHOT[0] = x; SHOT[1] = y; SHOT[6] = v;
        for (let k = 0, i = aim * n; k < n; k++, i++) { SHOT[3] = FAN_X[i]; SHOT[4] = FAN_Y[i]; shoot(p, w); }
      } else if (w === WEAPON.BEAM) {
        SHOT[3] = dx; SHOT[4] = dy; SHOT[6] = TUNE.BEAM_V;
        for (let k = 0; k < n; k++) { SHOT[0] = x + k * TUNE.BEAM_GAP * dx; SHOT[1] = y + k * TUNE.BEAM_GAP * dy; shoot(p, w); }
      } else { SHOT[0] = x; SHOT[1] = y; SHOT[3] = dx; SHOT[4] = dy; SHOT[6] = v; shoot(p, w); }
      return true;
    };
    // An enemy slot takes one bullet's damage from player `owner`, none while shut. True when that hit destroyed it: the
    // points go to `owner` then, once, and the slot to its type's DESTROYED routine, where nothing hits it again.
    const hurt = (slot, owner) => {
      if (s.eFlags[slot] & FLAG.SHUT) return false;
      s.eHp[slot] = Math.max(0, s.eHp[slot] - RULES.DAMAGE);
      if (s.eHp[slot] > 0) return false;
      s.pScore[owner] += POINTS_OF[s.eType[slot]];   // `award` written out (see there)
      if (s.pScore[owner] >= s.pNextLife[owner]) lives(owner);
      s.eRoutine[slot] = DESTROYED[s.eType[slot]];
      return true;
    };
    // Slot i destroyed outright for owner's points, by the barrier's touch or the clear-screen; nothing while shut.
    const destroy = (i, owner) => {
      if (s.eFlags[i] & FLAG.SHUT) return;
      s.eHp[i] = 0;
      award(owner, POINTS_OF[s.eType[i]]);
      s.eRoutine[i] = DESTROYED[s.eType[i]];
    };
    // A room's hit: the point HIT (x, y at depth z) against slot i's box `b`, both projected (projectX and projectY written
    // out), the box shrunk by the slot's depth, and only within HIT_DEPTH of the slot's depth, so nothing deeper or
    // shallower than the point is met. The point comes in HIT, and every box test here and in `strike` and `contacts` is
    // written in place, because a number passed to or returned from a call the compiler leaves out of line is boxed: an
    // allocation every step.
    const HIT = new Float64Array(3);
    const roomHit = (b, i) => {
      const x = HIT[0], y = HIT[1], z = HIT[2], ez = s.ez[i];
      if (Math.abs(z - ez) >= ROOM.HIT_DEPTH) return false;
      const t = s.eType[i], k = 1 - ROOM.SHRINK * ez, kz = 1 - ROOM.SHRINK * z;
      let dx = (ROOM.MID + (x - ROOM.MID) * kz) - (ROOM.MID + (s.ex[i] - ROOM.MID) * k);
      let dy = (y * kz + ROOM.RISE * z) - ((s.ey[i] + ORIGIN_OF[t]) * k + ROOM.RISE * ez);
      if (SWELL[t] > 0) { const g = 1 + SWELL[t] * (s.eBurst[i] - s.eHp[i]) / s.eBurst[i]; dx /= g; dy /= g; }   // the box grown, as the offset shrunk
      return dx >= b[0] * k && dx < b[1] * k && dy > b[2] * k && dy <= b[3] * k;
    };
    // Bullet b's point against every live enemy's bullet box, through `hurt`. True when the bullet is spent: on any hit,
    // but a beam segment that destroyed what it hit goes on.
    const strike = (b) => {
      const x = s.bx[b], y = s.by[b];
      HIT[0] = x; HIT[1] = y; HIT[2] = s.bz[b];
      for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
        const t = s.eType[i];
        if (HP_OF[t] === 0 || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & FLAG.GHOST) continue;   // free slots, shots, items, the destroyed and ghosts
        const box = RULES.SHOT_BOX[TIER_OF[t]];
        let dx = x - s.ex[i], dy = y - s.ey[i] - ORIGIN_OF[t];
        if (SWELL[t] > 0) { const g = 1 + SWELL[t] * (s.eBurst[i] - s.eHp[i]) / s.eBurst[i]; dx /= g; dy /= g; }   // the box grown, as the offset shrunk
        if (rooms ? !roomHit(box, i) : !(dx >= box[0] && dx < box[1] && dy > box[2] && dy <= box[3])) continue;
        if (s.eFlags[i] & FLAG.SHIELD) {
          // A front shield spends a bullet flying against its facing flatter than 45 degrees (by its line), for no damage.
          const a = s.eAim[i], face = a === 0 ? 1 : a === AIMS / 2 ? -1 : 0, vx = s.bvx[b], vy = s.bvy[b];
          if (face === 0) throw new Error(`raid sim: slot ${i} has a shield but faces aim ${a}, wants 0 or ${AIMS / 2}`);
          if (vx * face < 0 && Math.abs(vy) < Math.abs(vx)) return true;
        }
        return !hurt(i, s.bOwner[b]) || s.bKind[b] !== WEAPON.BEAM;
      }
      return false;
    };
    // Bullet b's direction of flight into UNIT: its velocity over Math.hypot of it, the hypot written out as V8 computes it
    // (the largest magnitude, then the root of the squared ratios' sum, times it; equal to the bit), since the builtin
    // allocates on every call. A velocity no shot has (zero, infinite or NaN) takes the builtin itself.
    const UNIT = new Float64Array(2);
    const unit = (b) => {
      const vx = s.bvx[b], vy = s.bvy[b], ax = Math.abs(vx), ay = Math.abs(vy), m = ax > ay ? ax : ay;
      if (!(m > 0 && m < Infinity) || ay !== ay) { UNIT[0] = vx / Math.hypot(vx, vy); UNIT[1] = vy / Math.hypot(vx, vy); return; }
      const nx = ax / m, ny = ay / m, v = Math.sqrt(nx * nx + ny * ny) * m;
      UNIT[0] = vx / v; UNIT[1] = vy / v;
    };
    // A bullet leaves by the screen's edges, a solid cell or, in a room, past the back wall.
    const stepBullets = (dt) => {
      const left = BOUNDS[0], right = BOUNDS[1], bottom = BOUNDS[2], top = BOUNDS[3];
      for (let b = 0; b < BULLETS; b++) {
        if (!s.bLive[b]) continue;
        const x = s.blx[b] + s.bvx[b] * dt, y = s.bly[b] + s.bvy[b] * dt, z = s.bz[b] + s.bvz[b] * dt;
        if (x < left || x >= right || y < bottom || y >= top || z > 1 || cell(Math.floor(x / CELL), Math.floor(y / CELL)) === KIND.SOLID) { s.bLive[b] = 0; continue; }
        s.blx[b] = x; s.bly[b] = y; s.bz[b] = z; s.bAge[b] += dt;
        if (s.bKind[b] === WEAPON.CORK && s.bvz[b] !== 0) {
          // Into a room: round its line in the screen's plane.
          const turn = s.bAge[b] * TUNE.CORK_SPIN;
          s.bx[b] = x + TUNE.CORK_R * Math.cos(turn); s.by[b] = y + TUNE.CORK_R * Math.sin(turn);
        } else if (s.bKind[b] === WEAPON.CORK) {
          // Round the line of flight, turning the same way on screen whichever way the Ooga faces.
          unit(b);
          const ux = UNIT[0], uy = UNIT[1], f = ux < -EPS ? -1 : 1;
          const turn = s.bAge[b] * TUNE.CORK_SPIN, c = TUNE.CORK_R * Math.cos(turn), n = TUNE.CORK_R * Math.sin(turn);
          s.bx[b] = x + c * ux - n * uy * f; s.by[b] = y + c * uy + n * ux * f;
        } else { s.bx[b] = x; s.by[b] = y; }
        if (strike(b)) s.bLive[b] = 0;
      }
    };

    // Enemies. A live slot runs its type's routine `eRoutine` (raid-enemies.js) each step, slot 15 down to 0, with `ctx`:
    // index 0 sets it up, the last frees it, and DESTROYED[type] is where it goes at 0 hit points. `spawn` takes the first
    // free slot from 15 down and returns -1, dropping the newcomer, when none is free; it never takes a live slot.
    // Shooters aim at the nearest Ooga in play, snapped to AIM_STEPS directions, and fire nothing while `attack` is 0.
    const free = (i) => {
      s.eType[i] = ENEMY.FREE; s.eRoutine[i] = 0; s.eHp[i] = 0; s.eFlags[i] = 0; s.eAttr[i] = 0;
      s.ex[i] = 0; s.ey[i] = 0; s.evx[i] = 0; s.evy[i] = 0; s.eTimer[i] = 0; s.eLink[i] = -1; s.eAim[i] = 0; s.eBurst[i] = 0;
      s.ez[i] = 0; s.evz[i] = 0;
    };
    // AT is a point handed to `spawnAt` and `nearestAt` in place of x, y arguments (see BOUNDS): `spawn(type, x, y, attr)`
    // and `nearest(i)` fill it from their own, the step's callers and the routines (`ctx.at`) write it directly.
    const AT = new Float64Array(2);
    const spawnAt = (type, attr) => {
      if (rooms && HP_OF[type] > 0) {   // in a room, nothing with hit points takes a slot ROOM_RESERVE keeps for shots
        let open = 0;
        for (let i = 0; i < ENEMY_SLOTS; i++) if (s.eType[i] === ENEMY.FREE) open++;
        if (open - 1 < TUNE.ROOM_RESERVE) return -1;
      } else if (RESERVED[type] && s.phase === PHASE.BOSS && !reserveOpen()) return -1;   // a boss fight's shots keep BOSS_RESERVE
      if (SHOTLIKE[type]) SHOTS[0]++;
      for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
        if (s.eType[i] !== ENEMY.FREE) continue;
        free(i);
        s.eType[i] = type; s.eHp[i] = SCALED[type] ? scaledHp(type) : HP_OF[type]; s.eFlags[i] = START_FLAGS[type]; s.eAttr[i] = attr; s.ex[i] = AT[0]; s.ey[i] = AT[1];
        if (SWELL[type] > 0) s.eBurst[i] = s.eHp[i];
        if (SHOTLIKE[type]) SHOTS[1]++;
        if (RUNNING[0] >= 0 && MISSILE[type]) FIRED[RUNNING[0]]++;
        return i;
      }
      return -1;
    };
    const spawn = (type, x, y, attr) => { AT[0] = x; AT[1] = y; return spawnAt(type, attr); };
    // On a side or climb stage in PHASE.BOSS: whether a slot may go to something the reserve holds back, BOSS_RESERVE
    // staying free after it. The shots asked for and those given a slot, for the suite (the sim's `shots`, off `state`).
    const reserveOpen = () => {
      let open = 0;
      for (let i = 0; i < ENEMY_SLOTS; i++) if (s.eType[i] === ENEMY.FREE) open++;
      return open - 1 >= TUNE.BOSS_RESERVE;
    };
    const SHOTS = new Float64Array(2);
    // The attacks each slot's own routines have made since the sim's creation, for the suite (the sim's `fired`, off
    // `state`, so `hash` never reads it): a spawn of a shot-like type, a crate or a coin barrel while the slot's routine
    // runs (RUNNING[0] the slot whose routine runs, -1 outside the enemies' step).
    const FIRED = new Float64Array(ENEMY_SLOTS), RUNNING = new Int8Array(1).fill(-1);
    const MISSILE = Uint8Array.from(SHOTLIKE, (v, t) => v || t === ENEMY.DROP_CRATE || t === ENEMY.COIN_BARREL ? 1 : 0);
    // A scaled boss's hit points as it spawns: its base, RULES.BOSS_HP_STRENGTH a point of the strongest weapon a joined
    // player holds, and the loops completed up to RULES.BOSS_HP_LOOPS.
    const scaledHp = (type) => {
      let strength = 0;
      for (let p = 0; p < s.players; p++) { const k = RULES.STRENGTH[s.pWeapon[p]]; if (k > strength) strength = k; }
      return Math.min(255, HP_OF[type] + RULES.BOSS_HP_STRENGTH * strength + Math.min(s.loops, RULES.BOSS_HP_LOOPS));
    };
    // Past ENEMY_MARGIN beyond the screen's sides, or under the screen; on a climb, past ENEMY_MARGIN under it.
    const offScreen = (i) => s.ex[i] < BOUNDS[0] - TUNE.ENEMY_MARGIN || s.ex[i] > BOUNDS[1] + TUNE.ENEMY_MARGIN ||
      s.ey[i] < BOUNDS[2] - (climb ? TUNE.ENEMY_MARGIN : 0);
    // The nearest Ooga dropping in or in play to the point AT (its feet), straight-line, ties to the lower player; or -1.
    // `nearest(i)` asks it of slot i's x, y, which the routines ask every step. SIDE[0] is 1 when that Ooga stands left of
    // the point (its x under the point's), else 0: a routine run once a spawn (the runner's first step) reads it rather
    // than comparing the two itself, since there, run too seldom for the engine to optimize, each x read is a new heap
    // number.
    const SIDE = new Uint8Array(1);
    const nearestAt = () => {
      const x = AT[0], y = AT[1];
      let best = -1, far = 0;   // `far` means nothing until `best` is set: no infinite start, which would box it
      for (let p = 0; p < PLAYERS; p++) {
        if (s.pState[p] !== PSTATE.NORMAL && s.pState[p] !== PSTATE.DROP) continue;
        const dx = s.px[p] - x, dy = s.py[p] - y, d = dx * dx + dy * dy;
        if (best < 0 || d < far) { far = d; best = p; SIDE[0] = dx < 0 ? 1 : 0; }
      }
      return best;
    };
    const nearest = (i) => { AT[0] = s.ex[i]; AT[1] = s.ey[i]; return nearestAt(); };
    // The aim step from slot i's origin to Ooga p's point, the nearest of the AIMS directions; a type spawned at slot i's
    // origin, and a shot from there along its aim.
    const aimAt = (i, p) => {
      const dx = s.px[p] - s.ex[i], dy = s.py[p] + RULES.PLAYER_POINT[s.pPose[p]] - s.ey[i] - ORIGIN_OF[s.eType[i]];
      return (Math.round(Math.atan2(dy, dx) / AIM_ARC) + AIMS) % AIMS;
    };
    const spawnFrom = (type, i, attr) => { AT[0] = s.ex[i]; AT[1] = s.ey[i] + ORIGIN_OF[s.eType[i]]; return spawnAt(type, attr); };
    const shootFrom = (i) => spawnFrom(ENEMY.SHOT, i, s.eAim[i]);
    // A walker's feet under gravity, held up by the highest non-empty cell top it crosses, as the Ooga's are.
    // A walker standing on a lift moves with it, and one falling onto a lift's top lands on it.
    // A belted walker standing on a belt's cell moves at the belt's speed along x for dt, unless its standing body would run
    // into a solid cell there (the test `walled` makes of its own step); the speed is read from BELTS in place.
    const ride = (i, dt) => {
      BELTQ[0] = s.ey[i];
      const k = beltStood(Math.floor(s.ex[i] / CELL));
      if (k < 0) return;
      const half = RULES.BOX[POSE.STAND][0], height = RULES.BOX[POSE.STAND][1], v = BELTS[k * 4 + 3], x = s.ex[i] + v * dt, y = s.ey[i];
      const lead = v > 0 ? x + half : x - half;
      if (!solidRows(Math.floor(lead / CELL), Math.floor((y + EPS) / CELL), Math.floor((y + height - EPS) / CELL))) s.ex[i] = x;
    };
    const fall = (i, dt) => {
      // A rising tide sets a walker not rising whose feet stand in water it made on top of it; a belt carries a belted one.
      if (NBASIN && s.evy[i] <= 0) { TIDEQ[0] = s.ey[i]; if (tideLift(Math.floor(s.ex[i] / CELL))) { s.ey[i] = TIDEQ[0]; s.evy[i] = 0; } }
      if (NBELT && BELTED[s.eType[i]] && s.evy[i] <= 0) ride(i, dt);
      const was = s.ey[i], col = Math.floor(s.ex[i] / CELL);
      let from = was;
      if (NLIFT && s.evy[i] <= 0) { LIFTQ[0] = was; const k = liftStood(col); if (k >= 0) from = was + LY1[k] - LY0[k]; }
      let y = from + s.evy[i] * dt - 0.5 * TUNE.GRAVITY * dt * dt, vy = s.evy[i] - TUNE.GRAVITY * dt, landed = false;
      const fell = y;
      for (let k = Math.floor(from / CELL + EPS); k * CELL > y; k--) {
        if (cell(col, k - 1) === KIND.EMPTY) continue;
        y = k * CELL; vy = 0; landed = true;
        break;
      }
      if (NLIFT) {
        LIFTQ[0] = was; LIFTQ[1] = fell;
        const k = liftUnder(col);
        if (k >= 0 && (!landed || LY1[k] > y)) { y = LY1[k]; vy = 0; }
      }
      s.ey[i] = y; s.evy[i] = vy;
    };
    // A walker in slot i moving at its evx for dt runs its standing body into a solid cell (wallAt at its x after the move
    // and its leading half width, its feet to its head), asked of the slot so no number is passed. The leading edge is
    // x + half or x - half (the same sum as x + -half), never a choice between half and -half: that mixes a stored number
    // with a computed one and boxes the computed one.
    const walled = (i, dt) => {
      const half = RULES.BOX[POSE.STAND][0], height = RULES.BOX[POSE.STAND][1], x = s.ex[i] + s.evx[i] * dt, y = s.ey[i];
      const lead = s.evx[i] > 0 ? x + half : x - half;
      return solidRows(Math.floor(lead / CELL), Math.floor((y + EPS) / CELL), Math.floor((y + height - EPS) / CELL));
    };
    // What the routines reach the run through (raid-enemies.js lists it), made once here and never per step.
    const ctx = Object.freeze({
      state: s, stage: st, RULES, TUNE, PHASE, PSTATE, POSE, PLAYERS, ENEMY_SLOTS, HALF_SCREEN,
      AIMS, SHOT_X, SHOT_Y, origin: ORIGIN_OF, ROOM,
      roll: () => roll(s), dice: DICE, cellAt: cell, colOf, wallAt, walled, fall, liftq: LIFTQ, liftUnder, liftTops: LY1, basinAt, tideTops: TOPS,
      spawn, spawnFrom, spawnAt, at: AT, free, nearest, side: SIDE, aimAt, shootFrom, offScreen,
      bounds: BOUNDS
    });
    // A part (a type with mounts, `eLink` its main) stands at its main's x, y plus its mount each step before it acts; the
    // main destroyed or gone, the part goes to its own destroyed routine with no points, and stays where it stood. A part
    // whose def names its `main` dies with it so, mounted or not.
    const follow = (i) => {
      const m = s.eLink[i], mt = s.eType[m], t = s.eType[i];
      if (mt === ENEMY.FREE || s.eRoutine[m] >= DESTROYED[mt]) {
        if (s.eRoutine[i] < DESTROYED[t]) { s.eHp[i] = 0; s.eRoutine[i] = DESTROYED[t]; }
        return;
      }
      const a = s.eAttr[i];
      if (a >= MOUNT_N[t]) return;
      const k = (t * MOUNT_MAX + a) * 2;
      s.ex[i] = s.ex[m] + MOUNT_AT[k]; s.ey[i] = s.ey[m] + MOUNT_AT[k + 1];
    };
    const stepEnemies = (dt) => {
      for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
        const t = s.eType[i];
        if (t === ENEMY.FREE) continue;
        if ((MOUNT_N[t] > 0 || MAIN_OF[t] !== 0) && s.eLink[i] >= 0) follow(i);
        if (MAIN_OF[t] !== 0 && s.eRoutine[i] < DESTROYED[t] && (s.eLink[i] < 0 || s.eType[s.eLink[i]] !== MAIN_OF[t])) {
          throw new Error(`raid sim: slot ${i}, a part (type ${t}), steps with no eLink to a slot of its main (type ${MAIN_OF[t]})`);
        }
        RUNNING[0] = i;
        if (SLOW_SHOTS && SHOTLIKE[t] === 1) ROUTINES[t][s.eRoutine[i]](ctx, i, dt === FIXED ? SLOW_FIXED : dt * CHEAT_TUNE.SHOT_SLOW);
        else ROUTINES[t][s.eRoutine[i]](ctx, i, dt);
      }
      RUNNING[0] = -1;
    };
    // The clear-screen: every basic enemy on screen destroyed for owner's points, every machine on screen dealt one
    // bullet's damage (barely hurt, as the rule sheet has it); shots and items stay.
    const clearScreen = (owner) => {
      for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
        const t = s.eType[i];
        if (HP_OF[t] === 0 || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & FLAG.GHOST || s.ex[i] < BOUNDS[0] || s.ex[i] > BOUNDS[1]) continue;
        if (climb && (s.ey[i] < BOUNDS[2] || s.ey[i] > BOUNDS[3])) continue;
        if (s.eFlags[i] & FLAG.MACHINE) hurt(i, owner);
        else destroy(i, owner);
      }
    };
    // Player p takes the item in slot i.
    const collect = (p, i) => {
      const a = s.eAttr[i];
      free(i);
      if (a === ITEM.RAPID) s.pRapid[p] = 1;
      else if (a === ITEM.BARRIER) s.pBarrier[p] = RULES.BARRIER;
      else if (a === ITEM.CLEAR) clearScreen(p);
      else s.pWeapon[p] = ITEM_WEAPON[a];
    };
    // Any touch of an enemy or its shot kills (but a `solid` one's, which is never tested): the Ooga's one point for its
    // pose against each live enemy's box for that pose, by the enemy's tier. Ducked under water there is no test at all; `kill` refuses a dropping or invincible Ooga,
    // which walks through; a shot that kills is spent. An item touched is taken. Under the barrier nothing touched kills:
    // a basic enemy is destroyed for its points, and a shot or a machine does nothing.
    const contacts = () => {
      for (let p = 0; p < PLAYERS; p++) {
        if (s.pState[p] !== PSTATE.NORMAL || s.pDuck[p]) continue;
        const pose = s.pPose[p], x = s.px[p], y = s.py[p] + RULES.PLAYER_POINT[pose];
        HIT[0] = x; HIT[1] = y; HIT[2] = 0;
        for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
          const t = s.eType[i];
          if (t === ENEMY.FREE || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & FLAG.GHOST || SOLID[t]) continue;   // a solid one is a block, not a touch
          const box = RULES.BOXES[TIER_OF[t]][STAND_TOUCH[t] ? POSE.STAND : pose];   // a `standTouch` type: the standing box
          let dx = x - s.ex[i], dy = y - s.ey[i] - ORIGIN_OF[t];
          if (SWELL[t] > 0) { const g = 1 + SWELL[t] * (s.eBurst[i] - s.eHp[i]) / s.eBurst[i]; dx /= g; dy /= g; }
          if (rooms ? !roomHit(box, i) : !(dx >= box[0] && dx < box[1] && dy > box[2] && dy <= box[3])) continue;
          if (t === ENEMY.ITEM) { collect(p, i); continue; }
          const shot = SHOTLIKE[t] === 1;   // a lob or a spark is a shot here
          if (s.pBarrier[p] > 0) { if (!shot && !(s.eFlags[i] & FLAG.MACHINE)) destroy(i, p); continue; }
          if (!kill(p)) continue;   // walked through: an item further down is still taken
          if (shot) free(i);
          break;
        }
      }
    };
    // The placed list: each record spawns once, in order, as its column's left edge comes into view, or on a climb its
    // row's bottom at the screen's top. A carrier comes in from the left edge at its row's height, the rest at their
    // column with their feet in their row.
    const spawnPlaced = () => {
      const list = st.placed, edge = climb ? BOUNDS[3] : BOUNDS[1], along = climb ? 1 : 0;
      while (s.listCursor * 4 < list.length && list[s.listCursor * 4 + along] * CELL < edge) {
        const k = s.listCursor * 4, type = list[k + 2];
        const slot = spawn(type, type === ENEMY.CARRIER ? s.camX - CELL / 2 : (list[k] + 0.5) * CELL, list[k + 1] * CELL, list[k + 3]);
        // A boss main waits for a free slot instead of being dropped, and so does a record the boss fight's reserve holds back.
        if (slot < 0 && (BOSS_MAIN[type] || RESERVED[type] && s.phase === PHASE.BOSS)) break;
        s.listCursor++;
      }
    };
    // An edge open to the spawner at this row: no Ooga in play within SPAWN_CLEAR of it, and the entry cell just outside
    // it neither solid nor over nothing.
    const edgeOpen = (side, row) => {
      const edge = side < 0 ? BOUNDS[0] : BOUNDS[1], col = Math.floor((edge + side * CELL / 2) / CELL);
      for (let p = 0; p < PLAYERS; p++) {
        if ((s.pState[p] === PSTATE.NORMAL || s.pState[p] === PSTATE.DROP) && Math.abs(s.px[p] - edge) < TUNE.SPAWN_CLEAR) return false;
      }
      return cell(col, row) !== KIND.SOLID && (groundBelow(col, row) || NLIFT > 0 && liftBelow(col, row * CELL) >= 0);
    };
    // A climb's entry in column col at height y: its cell not solid, something on the screen under it, and no Ooga in
    // play within SPAWN_CLEAR of where the runner lands.
    const entryOpen = (col, y) => {
      const land = landRow(col, y), lift = NLIFT ? liftBelow(col, y) : -1;   // a lift on the screen under it is ground too
      if (cell(col, rowAt(y)) === KIND.SOLID || (land < 0 && lift < 0)) return false;
      const x = (col + 0.5) * CELL, ground = lift >= 0 && (land < 0 || LY1[lift] > land * CELL) ? LY1[lift] : land * CELL;
      for (let p = 0; p < PLAYERS; p++) {
        if (s.pState[p] !== PSTATE.NORMAL && s.pState[p] !== PSTATE.DROP) continue;
        if (Math.abs(s.px[p] - x) < TUNE.SPAWN_CLEAR && Math.abs(s.py[p] - ground) < TUNE.SPAWN_CLEAR) return false;
      }
      return true;
    };
    // The edge spawner, while the stage is played or fought: at zero, a runner in at an edge the dice pick (the other when
    // that is refused, none when both are) at the nearest Ooga's feet, and the timer set again. In a boss fight, while the
    // reserve would refuse the runner, the timer waits at zero and nothing is drawn; and once the boss's lock holds (PHASE.BOSS
    // with the camera at its lock) the spawner pauses, its timer where it stood, until the phase leaves BOSS.
    const stepSpawner = (dt, scrolled) => {
      if (st.spawner.base <= 0 || (s.phase !== PHASE.PLAY && s.phase !== PHASE.BOSS)) return;
      if (s.phase === PHASE.BOSS && (climb ? s.camY >= s.lockY : s.camX >= s.lockX)) return;
      s.spawnTimer -= (scrolled ? RULES.SPAWN_DRAIN_SCROLLING : RULES.SPAWN_DRAIN) * dt;
      if (s.spawnTimer > 0) return;
      if (s.phase === PHASE.BOSS && !reserveOpen()) { s.spawnTimer = 0; return; }
      s.spawnTimer = spawnPeriod();
      if (climb) {
        // The four entries in turn from the dice's pick: a top corner or the side at the nearest Ooga's feet, each side.
        roll(s);
        const first = DICE[0] < 0.5 ? -1 : 1;
        roll(s);
        const high = DICE[0] < 0.5;
        AT[0] = s.camX + HALF_SCREEN; AT[1] = s.camY + HALF_SCREEN_Y;   // nearestAt(), as `nearest` asks it
        const p = nearestAt();
        if (p < 0) return;
        const feet = Math.min(st.rows - 1, Math.floor(s.py[p] / CELL + EPS)) * CELL;   // rowAt, written out (see BOUNDS)
        for (let k = 0; k < 4; k++) {
          const side = k < 2 ? first : -first, col = side < 0 ? 0 : SCREEN_W - 1, y = ((k & 1) === 0) === high ? BOUNDS[3] : feet;
          if (!entryOpen(col, y)) continue;
          AT[0] = (col + 0.5) * CELL; AT[1] = y;
          spawnAt(ENEMY.RUNNER, 0);
          return;
        }
        return;
      }
      roll(s);
      const first = DICE[0] < 0.5 ? -1 : 1;
      AT[0] = s.camX + HALF_SCREEN; AT[1] = s.camY + HALF_SCREEN_Y;
      const p = nearestAt();
      if (p < 0) return;
      const row = Math.min(st.rows - 1, Math.floor(s.py[p] / CELL + EPS));
      for (let k = 0, side = first; k < 2; k++, side = -side) {
        if (!edgeOpen(side, row)) continue;
        AT[0] = side < 0 ? BOUNDS[0] - CELL / 2 : BOUNDS[1] + CELL / 2; AT[1] = row * CELL;
        spawnAt(ENEMY.RUNNER, 0);
        return;
      }
    };

    // Rooms. Room r from its start: the bullets and every slot emptied, its barrier closed, its targets on the back wall
    // and its waves to come; the boss room puts the run in PHASE.BOSS.
    const startRoom = (r) => {
      const room = st.rooms[r], t = room.targets;
      s.bLive.fill(0);
      for (let i = 0; i < ENEMY_SLOTS; i++) free(i);
      s.room = r; s.roomPhase = ROOM_PHASE.FIGHT; s.barrier = 1; s.roomTime = 0; s.roomTimer = 0; s.waveCursor = 0;
      s.pHold.fill(0);
      for (let k = 0; k < t.length; k += 4) {
        const i = spawn(t[k + 2], t[k], t[k + 1], t[k + 3]);
        if (i >= 0) s.ez[i] = 1;
      }
      if (room.boss && s.phase === PHASE.PLAY) s.phase = PHASE.BOSS;
    };
    // Forward through the open barrier: the room is done, so its bullets and slots empty, and the advance runs TUNE.ROOM_ADVANCE.
    const startAdvance = () => {
      s.roomPhase = ROOM_PHASE.ADVANCE; s.roomTimer = TUNE.ROOM_ADVANCE;
      s.bLive.fill(0);
      for (let i = 0; i < ENEMY_SLOTS; i++) free(i);
    };
    // The advance's time, then the next room, the Oogas on its front line where they stood; otherwise the room's clock and
    // its waves, each in at its door on the back wall at its time, none before ROOM_GRACE (those due wait for it) and none
    // once the stage is clear; a wave waits, and the waves after it with it, while the room has ROOM_WAVE_MAX enemies with
    // hit points off the back wall alive or no slot it may take (see `spawnAt`).
    const stepRoom = (dt) => {
      if (s.roomPhase === ROOM_PHASE.ADVANCE) {
        s.roomTimer -= dt;
        if (s.roomTimer > dt / 2) return;
        startRoom(s.room + 1);
        return;
      }
      s.roomTime += dt;
      if (s.roomTime < TUNE.ROOM_GRACE || s.phase === PHASE.CLEAR) return;
      const room = st.rooms[s.room], w = room.waves;
      let alive = 0;
      for (let j = 0; j < ENEMY_SLOTS; j++) { const t = s.eType[j]; if (HP_OF[t] > 0 && !WALL[t] && s.eRoutine[j] < DESTROYED[t]) alive++; }
      while (s.waveCursor * 3 < w.length && w[s.waveCursor * 3] <= s.roomTime + EPS && alive < TUNE.ROOM_WAVE_MAX) {
        const k = s.waveCursor * 3, i = spawn(w[k + 1], room.doors[w[k + 2]], 0, 0);
        if (i < 0) break;
        s.ez[i] = 1; s.waveCursor++; alive++;
      }
    };
    // Once the last core (a slot flagged CORE) in the room is destroyed the barrier opens (at once in a room with none, but
    // for the boss room with no core among its targets, which waits for its boss main's fall). In the boss room the stage
    // clears then, every slot but the cores' emptied, while an Ooga plays, drops in or is down with a life in reserve. A
    // stage cleared by a boss main's fall (`bossBreak`) opens the barrier too.
    const CORED = new Uint8Array(rooms ? st.rooms.length : 0);   // 1 for a room with a core among its targets
    for (let r = 0; r < CORED.length; r++) {
      const tg = st.rooms[r].targets;
      for (let k = 0; k < tg.length; k += 4) if (START_FLAGS[tg[k + 2]] & FLAG.CORE) CORED[r] = 1;
    }
    const checkCores = () => {
      if (s.roomPhase !== ROOM_PHASE.FIGHT) return;
      if (s.phase === PHASE.CLEAR) { s.roomPhase = ROOM_PHASE.OPEN; s.barrier = 0; return; }
      for (let i = 0; i < ENEMY_SLOTS; i++) if (s.eFlags[i] & FLAG.CORE && s.eRoutine[i] < DESTROYED[s.eType[i]]) return;
      if (st.rooms[s.room].boss && !CORED[s.room]) return;
      s.roomPhase = ROOM_PHASE.OPEN; s.barrier = 0;
      if (!st.rooms[s.room].boss) return;
      let on = false;
      for (let p = 0; p < PLAYERS; p++) {
        const ps = s.pState[p];
        if (ps === PSTATE.NORMAL || ps === PSTATE.DROP || (ps === PSTATE.DEAD && s.pLives[p] > 0)) on = true;
      }
      if (!on) return;
      s.phase = PHASE.CLEAR;
      for (let i = 0; i < ENEMY_SLOTS; i++) if (!(s.eFlags[i] & FLAG.CORE)) free(i);
    };
    // A live tripwire kills an Ooga in its span whose body spans its height (see the header); none while walking forward,
    // nor in the room's first ROOM_GRACE.
    const stepWires = () => {
      if (s.roomPhase === ROOM_PHASE.ADVANCE || s.roomTime < TUNE.ROOM_GRACE) return;
      const w = st.rooms[s.room].wires, time = s.roomTime;
      for (let k = 0; k < w.length; k += 6) {
        if ((time + w[k + 5]) % (w[k + 3] + w[k + 4]) >= w[k + 3]) continue;   // dark
        const h = w[k + 2];
        for (let p = 0; p < PLAYERS; p++) {
          if (s.pState[p] !== PSTATE.NORMAL) continue;
          const x = s.px[p], y = s.py[p];
          if (x >= w[k] && x <= w[k + 1] && y <= h && h <= y + RULES.BOX[s.pPose[p]][1]) kill(p);
        }
      }
    };

    // This step's gust cycle (`gustPhase` and `gustDir` written out at the step's start): whether it blows, and which way a
    // dir 0 zone blows.
    let blowing = false, gustTurn = -1;

    const stepPlayer = (p, bits, pressed, dt) => {
      const lr = (bits & IN.RIGHT ? 1 : 0) - (bits & IN.LEFT ? 1 : 0);   // both held: neither
      const ud = (bits & IN.UP ? 1 : 0) - (bits & IN.DOWN ? 1 : 0);
      const wasPose = s.pPose[p], airborne = wasPose === POSE.JUMP;
      let x = s.px[p], y = s.py[p], vy = s.pvy[p];
      // A rising tide sets an Ooga not rising whose feet stand in water it made on top of it.
      if (NBASIN && vy <= 0) { TIDEQ[0] = y; if (tideLift(Math.floor(x / CELL))) { y = TIDEQ[0]; vy = 0; } }
      // A gust pushes an Ooga in play whose feet stood in its zone at the step's start (its column, or row on a climb).
      let push = 0;
      if (blowing && s.pState[p] === PSTATE.NORMAL) {
        const at = climb ? Math.floor(y / CELL + EPS) : Math.floor(x / CELL);
        for (let k = 0; k < GUSTS.length; k += 3) {
          if (at < GUSTS[k] || at > GUSTS[k + 1]) continue;
          push = GUSTS[k + 2] === 0 ? gustTurn : GUSTS[k + 2];
          break;
        }
      }
      // A belt stood on at the step's start carries an Ooga in play with its own run, as a gust pushes it.
      let belt = 0;
      if (NBELT && s.pState[p] === PSTATE.NORMAL && !airborne) { BELTQ[0] = y; const k = beltStood(Math.floor(x / CELL)); if (k >= 0) belt = BELTS[k * 4 + 3]; }
      // A lift stood on at the step's start carries the Ooga with it, unless it drops through.
      let stood = -1;
      if (NLIFT && !airborne) { LIFTQ[0] = y; stood = liftStood(Math.floor(x / CELL)); }

      // `jumped` a jump taken this step, `dropped` a drop through a ledge or off a lift, and `top` the height either left.
      let jumped = false, dropped = false;
      const top = y;
      // The forgivenesses: `coyote` the time left as the step starts in which a walk off a ledge may still jump, and
      // `buffered` a jump pressed in the air within JUMP_BUFFER, now landed. Both count down by the step, to 0 under half a
      // step so Float32's remainder adds none; a walk off whose coyote time runs out still falling locks from there, so
      // LOCK_FALL counts from where it ended.
      const coyote = s.pCoyote[p], buffered = !airborne && s.pBuffer[p] > 0;
      if (coyote > 0) {
        const c = coyote - dt;
        s.pCoyote[p] = c < dt / 2 ? 0 : c;
        if (s.pCoyote[p] === 0 && airborne && s.pLock[p] === 1) s.pLockY[p] = y - TUNE.LOCK_FALL;
      }
      if (s.pBuffer[p] > 0) { const b = s.pBuffer[p] - dt; s.pBuffer[p] = buffered || b < dt / 2 ? 0 : b; }
      // In the air, not pressing down: within coyote time a jump goes as from the ground, taking the way held; otherwise
      // the press waits JUMP_BUFFER for a landing. Down and jump in the air is neither (a drop through needs the ground),
      // and a buffered press only ever jumps: landing with down held, it is spent and does nothing.
      if (airborne && pressed & IN.JUMP && ud >= 0) {
        if (coyote > 0) { vy = TUNE.JUMP_V; jumped = true; s.pCoyote[p] = 0; s.pLock[p] = 0; s.pDrift[p] = lr; }
        else s.pBuffer[p] = TUNE.JUMP_BUFFER;
      }
      if (!airborne && (pressed & IN.JUMP || buffered && ud >= 0)) {
        const row = Math.round(y / CELL), col = Math.floor(x / CELL), under = cell(col, row - 1);
        if (ud < 0) {
          // Down and jump drops through a ledge or a lift, and only onto something.
          if (under === KIND.LEDGE && groundBelow(col, row - 1)) { y -= DROP_THROUGH; vy = 0; dropped = true; }
          else if (stood >= 0 && groundBelow(col, Math.floor(y / CELL + EPS))) {
            // Off a lift, also past the most a lift going down at its speed gains on a body falling from rest (speed² over
            // twice GRAVITY), or one going down, or starting down from its wait, would land it straight back on.
            const v = LIFTS[stood * 6 + 4];
            y -= DROP_THROUGH + v * v / (2 * TUNE.GRAVITY); vy = 0; stood = -1; dropped = true;
          }
        } else if (under !== KIND.WATER) { vy = TUNE.JUMP_V; jumped = true; }
      }

      // In the air the Ooga drifts along x at RUN the way it last pressed (`pDrift`): a press latches it, a release keeps
      // it, the other way reverses it, and it never comes back to rest; a jump takes the way held as it leaves (none: it
      // goes straight up until one is pressed). Walking off a ledge it keeps the way it walked, and dropping through one it
      // goes straight down, and neither may steer (nor turn) until it has fallen LOCK_FALL.
      const locked = airborne && s.pLock[p] === 1 && y > s.pLockY[p];
      if (airborne && !locked && lr !== 0) s.pDrift[p] = lr;
      if (lr !== 0 && !locked) s.pFace[p] = lr;
      // Ducked under water the Ooga holds still, and a drop through a ledge or off a lift leaves straight down, its own
      // step included. Walls meet the standing half width in every pose, so getting up from prone beside a wall is not
      // pushed off it.
      const ducked = wasPose === POSE.WATER && ud < 0;
      // A gust's push and a belt move the Ooga with its own run, through the same wall test; `pvx` stays its own run.
      const vx = ducked || dropped ? 0 : (airborne ? s.pDrift[p] : lr) * TUNE.RUN, move = vx + push * TUNE.GUST_V + belt, half = RULES.BOX[POSE.STAND][0], height = RULES.BOX[wasPose][1];
      x += move * dt;
      const lo = Math.floor((y + EPS) / CELL), hi = Math.floor((y + height - EPS) / CELL);   // wallAt's rows
      if (move > 0 && solidRows(Math.floor((x + half) / CELL), lo, hi)) x = Math.floor((x + half) / CELL) * CELL - half;
      else if (move < 0 && solidRows(Math.floor((x - half) / CELL), lo, hi)) x = (Math.floor((x - half) / CELL) + 1) * CELL + half;
      // A solid enemy's side stops the body as a wall does: met from outside, it stands at the side; already inside (one
      // came up round it), a step takes it no further in.
      if (!rooms && move !== 0) {
        for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
          const t = s.eType[i];
          if (SOLID[t] === 0 || s.eRoutine[i] >= DESTROYED[t]) continue;
          const k = t * 4, ex = s.ex[i], left = ex + SOLID_AT[k], right = ex + SOLID_AT[k + 1];
          if (y >= s.ey[i] + SOLID_AT[k + 3] - EPS || y + height <= s.ey[i] + SOLID_AT[k + 2] + EPS || x + half <= left + EPS || x - half >= right - EPS) continue;
          const was = s.px[p];
          if (was + half <= left + EPS) x = left - half;
          else if (was - half >= right - EPS) x = right + half;
          else if (move > 0 ? was < ex : was > ex) x = was;
        }
      }
      x = rooms ? Math.min(ROOM.FRONT_R, Math.max(ROOM.FRONT_L, x)) : Math.min(BOUNDS[1], Math.max(BOUNDS[0], x));   // clamp, written out

      const lifted = y;   // before a lift carries it: where a landing on a lift is judged from
      if (stood >= 0) y += LY1[stood] - LY0[stood];
      const from = y;
      y += vy * dt - 0.5 * TUNE.GRAVITY * dt * dt;
      vy -= TUNE.GRAVITY * dt;
      let ground = KIND.EMPTY;
      if (vy > 0) {
        // A solid cell stops the head, and on a climb so does the screen's top while the screen can still scroll up, so an
        // Ooga ahead waits under it; at the lock nothing waits on the screen, and a jump goes its full height.
        const head = y + RULES.BOX[POSE.JUMP][1];
        if (cell(Math.floor(x / CELL), Math.floor(head / CELL)) === KIND.SOLID) { y = Math.floor(head / CELL) * CELL - RULES.BOX[POSE.JUMP][1]; vy = 0; }
        else if (climb && s.camY < s.lockY && head > BOUNDS[3]) { y = BOUNDS[3] - RULES.BOX[POSE.JUMP][1]; vy = 0; }
        // A solid enemy's underside stops a head rising into it from below, the body over it.
        if (!rooms) {
          for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
            const t = s.eType[i];
            if (SOLID[t] === 0 || s.eRoutine[i] >= DESTROYED[t]) continue;
            const k = t * 4, bottom = s.ey[i] + SOLID_AT[k + 2];
            if (from + RULES.BOX[POSE.JUMP][1] > bottom + EPS || y + RULES.BOX[POSE.JUMP][1] <= bottom || x + half <= s.ex[i] + SOLID_AT[k] + EPS || x - half >= s.ex[i] + SOLID_AT[k + 1] - EPS) continue;
            y = bottom - RULES.BOX[POSE.JUMP][1]; vy = 0;
          }
        }
      } else {
        // The highest cell top crossed on the way down that is not empty holds the feet, or a lift's top over it.
        const col = Math.floor(x / CELL), fell = y;
        for (let k = Math.floor(from / CELL + EPS); k * CELL > y; k--) {
          const kind = cell(col, k - 1);
          if (kind === KIND.EMPTY) continue;
          y = k * CELL; vy = 0; ground = kind;
          break;
        }
        if (NLIFT) {
          LIFTQ[0] = lifted; LIFTQ[1] = fell;
          const k = liftUnder(col);
          if (k >= 0 && (ground === KIND.EMPTY || LY1[k] > y)) { y = LY1[k]; vy = 0; ground = KIND.LEDGE; }
        }
        // A solid enemy's top crossed on the way down holds up a body over it (the standing half width, as walls meet it),
        // as solid ground does, unless higher ground already has: so an Ooga lands on a printer, stands and walks on it
        // and walks off its edge once its body is clear, and falls once it is destroyed. Down and jump drop through nothing.
        if (!rooms) {
          for (let i = ENEMY_SLOTS - 1; i >= 0; i--) {
            const t = s.eType[i];
            if (SOLID[t] === 0 || s.eRoutine[i] >= DESTROYED[t]) continue;
            const k = t * 4, top = s.ey[i] + SOLID_AT[k + 3];
            if (from < top - EPS || fell >= top || (ground !== KIND.EMPTY && top <= y) || x + half <= s.ex[i] + SOLID_AT[k] + EPS || x - half >= s.ex[i] + SOLID_AT[k + 1] - EPS) continue;
            y = top; vy = 0; ground = KIND.SOLID;
          }
        }
      }

      s.px[p] = x; s.py[p] = y; s.pvx[p] = vx; s.pvy[p] = vy;
      // Below the screen's bottom: the grid's on a side stage, the camera's on a climb, whatever ground lies further down.
      if (y < BOUNDS[2]) { if (s.phase !== PHASE.CLEAR) die(p); return; }
      if (ground !== KIND.EMPTY && s.pState[p] === PSTATE.DROP) { s.pState[p] = PSTATE.NORMAL; s.pInvincible[p] = RULES.RESPAWN_INVINCIBLE; }

      // Leaving the ground: a jump latches the way held, a walk off a ledge the way walked and a drop through one none, the
      // last two locked until LOCK_FALL under the top they left; landing lets both go.
      if (ground !== KIND.EMPTY) { s.pDrift[p] = 0; s.pLock[p] = 0; s.pCoyote[p] = 0; }
      else if (!airborne) {
        s.pDrift[p] = dropped || ducked ? 0 : lr;
        s.pLock[p] = jumped ? 0 : 1; s.pLockY[p] = top - TUNE.LOCK_FALL;
        s.pCoyote[p] = jumped || dropped ? 0 : TUNE.COYOTE;   // a walk off a ledge (or off what gave way) may still jump
      }
      const pose = poseOf(ground, lr, ud, rooms && st.rooms[s.room].boss === true);   // never prone in the boss room
      s.pPose[p] = pose;
      s.pDuck[p] = pose === POSE.WATER && ud < 0 ? 1 : 0;
      s.pAim[p] = aimOf(s.pFace[p] > 0, lr, ud, pose);

      // Rooms: up held alone, standing, with no left or right, walks forward through the open barrier, and after
      // ROOM_STEP_IN the advance starts (not from the last room); the trigger, a turn or leaving the ground counts it again
      // from 0, so a tap-shot up never gets there. The closed barrier blocks the way, so there up only aims.
      if (rooms && s.pState[p] === PSTATE.NORMAL) {
        const forward = ud > 0 && lr === 0 && pose === POSE.STAND && !(bits & IN.FIRE) && s.roomPhase === ROOM_PHASE.OPEN && s.room < st.rooms.length - 1;
        s.pHold[p] = forward ? s.pHold[p] + dt : 0;
        if (s.pHold[p] >= TUNE.ROOM_STEP_IN - dt / 2) { s.pHold[p] = 0; startAdvance(); }
      }

      // A press fires once; only the auto rifle fires again while held, as soon as its gap is up and the cap allows.
      // Ducked under water nothing fires.
      if (s.pState[p] !== PSTATE.NORMAL || s.pDuck[p]) return;
      // The auto rifle counts its held shots in a row (a press starts the count again), and after every AUTO_RUN of them
      // waits AUTO_BREAK, not AUTO_GAP, before the next.
      if (pressed & IN.FIRE) { s.pAutoRun[p] = fire(p) ? 1 : 0; s.pFireGap[p] = TUNE.AUTO_GAP; }
      else if (bits & IN.FIRE && s.pWeapon[p] === WEAPON.AUTO) {
        s.pFireGap[p] -= dt;
        if (s.pFireGap[p] <= EPS * FIXED) {
          if (fire(p)) { s.pAutoRun[p] = s.pAutoRun[p] % TUNE.AUTO_RUN + 1; s.pFireGap[p] += s.pAutoRun[p] === TUNE.AUTO_RUN ? TUNE.AUTO_BREAK : TUNE.AUTO_GAP; }
          else s.pFireGap[p] = 0;
        }
      }
    };

    const step = (dt) => {
      bounds();
      if (NLIFT) placeLifts(dt);
      if (NBASIN) stepTide();
      if (GUSTS.length) { blowing = blows(); gustTurn = turn(); }
      const pressed = s.input & ~s.prevInput;
      if (s.players === 2) for (let p = 0; p < 2; p++) s.pIdle[p] = (s.input >>> 6 * p & 63) !== 0 ? 0 : Math.min(s.pIdle[p] + dt, TUNE.IDLE);
      let attack = 1, out = 0;
      for (let p = 0; p < PLAYERS; p++) {
        const state = s.pState[p];
        if (state === PSTATE.DROP || state === PSTATE.NORMAL) {
          // Both to zero under half a step, so Float32's remainder adds no step.
          const invincible = s.pInvincible[p] - dt, barrier = s.pBarrier[p] - dt;
          s.pInvincible[p] = invincible < dt / 2 ? 0 : invincible;
          s.pBarrier[p] = KEEP_BARRIER ? RULES.BARRIER : barrier < dt / 2 ? 0 : barrier;
          let bits = s.input >>> 6 * p & 63, press = pressed >>> 6 * p & 63;
          if (rooms && s.roomPhase === ROOM_PHASE.ADVANCE) { bits = 0; press = 0; }   // walking forward, no button counts
          stepPlayer(p, bits, press, dt);
        } else if (state === PSTATE.DEAD) {
          s.pTimer[p] -= dt;
          if (s.pTimer[p] <= 0) {
            s.pTimer[p] = 0;
            if (s.pLives[p] > 0) { s.pLives[p]--; dropIn(p); } else s.pState[p] = PSTATE.OUT;
          }
        }
        if ((s.pState[p] === PSTATE.DROP || s.pInvincible[p] > 0) && !idleBy(p)) attack = 0;
        if (s.pState[p] === PSTATE.OUT) out++;
      }
      if (NSPAN) stepCrumble(dt);
      s.attack = attack;
      if (out === PLAYERS && (s.phase === PHASE.PLAY || s.phase === PHASE.BOSS)) s.phase = PHASE.OVER;
      // The camera follows the leading Ooga (on a climb only a landed one, since a drop-in comes from the screen's top), but
      // never so far that the trailing one, landed or dropping in, ends up within TRAIL of the edge it trails by. `led` and
      // `trailed` say whether any Ooga set them (an infinite starting value would box both numbers, an allocation a step).
      // An idle Ooga (`idleBy`) sets no trail, and the screen then catches up at CATCH_V at most (`idled`).
      const cam = s.camX, camY = s.camY;
      let lead = 0, trail = 0, led = false, trailed = false, idled = false;
      for (let p = 0; p < PLAYERS; p++) {
        const ps = s.pState[p];
        if (ps !== PSTATE.NORMAL && ps !== PSTATE.DROP) continue;
        const at = climb ? s.py[p] : s.px[p];
        if (idleBy(p)) idled = true;
        else if (!trailed || at < trail) { trail = at; trailed = true; }
        if ((!led || at > lead) && (ps === PSTATE.NORMAL || !climb)) { lead = at; led = true; }
      }
      if (led) {
        if (climb) {
          let want = Math.min(lead - HALF_SCREEN_Y, trail - TUNE.TRAIL);
          // At a climb's boss the screen goes on up to its lock at BOSS_SCROLL_V, as far as the trailing Ooga allows.
          if (s.phase === PHASE.BOSS) want = Math.max(want, Math.min(s.camY + TUNE.BOSS_SCROLL_V * dt, trail - TUNE.TRAIL));
          if (idled) want = Math.min(want, s.camY + TUNE.CATCH_V * dt);
          if (want > s.camY) s.camY = Math.min(want, s.lockY);
        } else {
          let want = Math.min(lead - HALF_SCREEN, trail - TUNE.TRAIL);
          // At a side stage's boss the screen goes on to its lock at BOSS_SCROLL_V too, as far as the trailing Ooga allows.
          if (s.phase === PHASE.BOSS && !rooms) want = Math.max(want, Math.min(s.camX + TUNE.BOSS_SCROLL_V * dt, trail - TUNE.TRAIL));
          if (idled) want = Math.min(want, s.camX + TUNE.CATCH_V * dt);
          if (want > s.camX) s.camX = Math.min(want, s.lockX);
        }
      }
      bounds();
      // The screen moved past an idle Ooga's trailing TRAIL: it is carried along (never in a room, whose screen stands).
      if (idled && !rooms && (s.camX !== cam || s.camY !== camY)) {
        for (let p = 0; p < PLAYERS; p++) {
          const ps = s.pState[p];
          if ((ps === PSTATE.NORMAL || ps === PSTATE.DROP) && idleBy(p) && (climb ? s.py[p] < s.camY + TUNE.TRAIL : s.px[p] < s.camX + TUNE.TRAIL)) carryIn(p);
        }
      }
      if (rooms) stepRoom(dt);
      else {
        spawnPlaced();
        stepSpawner(dt, s.camX !== cam || s.camY !== camY);
      }
      stepBullets(dt);
      stepEnemies(dt);
      contacts();
      if (rooms) { stepWires(); checkCores(); }
      s.prevInput = s.input;
      s.time += dt;
    };

    startStage();
    // A carried run: each joined player's score, lives, next extra life, weapon and rapid fire, and the continues, from the
    // stage before, each Ooga dropping in fresh (one carried out stays out); the spawner's timer then counts the weapons.
    if (carry) {
      for (let p = 0; p < players; p++) {
        s.pScore[p] = carry.score[p]; s.pLives[p] = carry.lives[p]; s.pNextLife[p] = carry.nextLife[p];
        s.pWeapon[p] = carry.weapon[p]; s.pRapid[p] = carry.rapid[p];
        if (carry.out[p]) s.pState[p] = PSTATE.OUT;
      }
      s.continues = carry.continues;
      if (!rooms && st.spawner.base > 0) s.spawnTimer = spawnPeriod();
    }

    // hash reads every array's bytes through views made here, and the scalars through one Float64 scratch. Every scalar
    // includes `acc` (frame time banked by `tick`) and `paused`, so two runs stepping alike under `tick` with different frame
    // lengths, or one paused, hash differently; `simulate`, which the campaign and the replays drive, banks nothing.
    const views = [], scalars = [];
    const FORGIVE_BYTES = [new Uint8Array(s.pCoyote.buffer), new Uint8Array(s.pBuffer.buffer)], IDLE_BYTES = new Uint8Array(s.pIdle.buffer);
    for (const key of Object.keys(s)) {
      const v = s[key];
      if (key === "cheats" || key === "pCoyote" || key === "pBuffer" || key === "pIdle") continue;   // folded by `hash` itself, only when not 0 (pIdle: with two players)
      if (ArrayBuffer.isView(v)) views.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      else scalars.push(key);
    }
    const scalarValues = new Float64Array(scalars.length);
    views.push(new Uint8Array(scalarValues.buffer));

    return {
      state: s,
      stage: st,
      // The autopilot's scratch for this run, PILOT_MEMO numbers each -1 until it writes one; off `state`, so `hash`
      // never reads it and a run replays the same whoever steers it.
      pilot: new Float64Array(PILOT_MEMO).fill(-1),
      // Shot-like spawns (SHOT, LOB, SPARK) asked for and given a slot since the sim's creation; off `state`, for the suite.
      shots: SHOTS,
      // Each slot's attacks since the sim's creation (see FIRED); off `state`, for the suite.
      fired: FIRED,
      // Player p's held buttons, in its six bits of `input`.
      setInput(bits, p = 0) {
        if (p !== 0 && p !== 1) throw new Error(`raid sim: no player ${p}`);
        s.input = s.input & ~(63 << 6 * p) | (bits & 63) << 6 * p;
      },
      // A paused sim runs no step and banks no time: `tick` returns 0 and `simulate` does nothing.
      pause(on) { s.paused = on ? 1 : 0; },
      tick(dt) {
        if (s.paused) return 0;
        s.acc = Math.min(s.acc + dt, FIXED * MAX_SUBSTEPS);
        let steps = 0;
        while (s.acc >= FIXED - EPS * FIXED && steps < MAX_SUBSTEPS) {
          s.acc = Math.max(0, s.acc - FIXED);
          step(FIXED);
          steps++;
        }
        return steps;
      },
      simulate(seconds) {
        if (s.paused) return;
        for (let n = Math.round(seconds / FIXED); n > 0; n--) step(FIXED);
      },
      award: (points, p = 0) => award(p, points),
      spawn: (type, x, y, attr = 0) => spawn(type, x, y, attr),
      // From game over: a continue starts the stage again with every joined player back in, its score at zero and its
      // lives and next extra life back at their start. `continues` counts those left, shared, so the fourth game over has none.
      continueRun() {
        if (s.phase !== PHASE.OVER || s.continues <= 0) return;
        if (!(s.cheats & CHEAT.CONTINUES)) s.continues--;
        for (let p = 0; p < s.players; p++) { s.pScore[p] = 0; s.pLives[p] = START_LIVES; s.pNextLife[p] = RULES.EXTRA_FIRST; }
        startStage();
      },
      // What the next stage's sim takes as `carry`: each joined player's score, lives, next extra life, weapon and rapid
      // fire, `out` 1 for one out of lives (out, or down with none in reserve), and the continues. One down with lives in
      // reserve hands on one fewer, the life its drop-in would have spent, so a hand-over never refunds a death. Called at
      // a hand-over, never in the step.
      carry() {
        const n = s.players, pick = (a) => Array.from(a.subarray(0, n)), lives = pick(s.pLives), out = [];
        for (let p = 0; p < n; p++) {
          const down = s.pState[p] === PSTATE.DEAD;
          out.push(s.pState[p] === PSTATE.OUT || (down && lives[p] === 0) ? 1 : 0);
          if (down && lives[p] > 0) lives[p]--;
        }
        return { score: pick(s.pScore), lives, nextLife: pick(s.pNextLife), weapon: pick(s.pWeapon), rapid: pick(s.pRapid), out, continues: s.continues };
      },
      endRun() { if (s.phase === PHASE.OVER) s.phase = PHASE.END; },
      hash() {
        for (let i = 0; i < scalars.length; i++) scalarValues[i] = s[scalars[i]];
        let h = 0x811c9dc5;
        for (const bytes of views) for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
        if (s.cheats !== 0) h = Math.imul(h ^ s.cheats, 0x01000193);
        // The forgivenesses' timers, only while one runs, so a run that never meets them hashes as before they were.
        let forgiving = false;
        for (let p = 0; p < PLAYERS; p++) if (s.pCoyote[p] !== 0 || s.pBuffer[p] !== 0) forgiving = true;
        if (forgiving) for (const bytes of FORGIVE_BYTES) for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
        // The idle timers with two players only, so a one-player run hashes as before they were.
        if (s.players === 2) for (let i = 0; i < IDLE_BYTES.length; i++) h = Math.imul(h ^ IDLE_BYTES[i], 0x01000193);
        return h >>> 0;
      }
    };
  };

  // The tickets a run pays at its results card: one for every 2000 points, a hundred at most.
  const tickets = (score) => Math.min(100, Math.floor(score / 2000));

  // HP_OF, TIER_OF, POINTS_OF and ORIGIN_OF are the per-type tables by ENEMY value, from RULES or each type's def;
  // DESTROYED each type's destroyed routine and BOSS_MAIN 1 for a boss main (a frozen copy: the sim keeps its own typed
  // array), by ENEMY value too, and EPS the step's tolerance, and PILOT_MEMO the size of a sim's `pilot`, which
  // raid-autopilot.js reads. `autopilot` forwards to raid-autopilot.js at call time. TIDE, TIDE_PERIOD,
  // `tidePhase` and `tideLevel` are raid-terrain.js's.
  BL.raidSim = {
    FIXED, MAX_SUBSTEPS, PLAYERS, BULLETS, ENEMY_SLOTS, IN, WEAPON, ITEM, PSTATE, POSE, PHASE, ENEMY, FLAG, RULES, TUNE, ROOM, ROOM_PHASE, WIRE,
    GUST, CRUMBLE, TIDE, TIDE_PERIOD, HP_OF, TIER_OF, POINTS_OF, ORIGIN_OF, projectX, projectY, wireState, gustPhase, gustDir, liftTop,
    tidePhase, tideLevel, poseOf, aimOf, create, CHEAT, CHEAT_TUNE,
    autopilot: (sim) => BL.raidAutopilot.autopilot(sim), tickets,
    DESTROYED, BOSS_MAIN: Object.freeze(Array.from(BOSS_MAIN)), EPS, PILOT_MEMO
  };
})();
