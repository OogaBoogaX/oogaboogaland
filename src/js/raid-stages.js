// Ooga Raid's stages: the cell grid the rules collide with and the view cuts its meshes from, and the enemies laid
// along it. Pure data and readers, loadable in Node; `raid-sim.js` reads it and the scene draws from it.
//
// A stage has a `kind`: "side" scrolls right, "climb" scrolls up and "rooms" looks into rooms one after another.
// `parse` takes a stage without a kind as a side stage.
//
// Side and climb stages are whole screens of SCREEN_W by SCREEN_H cells, CELL metres square, so a screen is 8 m wide
// by 7 m tall. `cells[row * cols + col]` holds a KIND with row 0 at the bottom. A ledge and water stop a fall from
// above only; solid stops movement from every side. Outside the grid is wall to either side, open air above and a
// pit below.
//
// Side: authored as `rows`, SCREEN_H strings, top row first, one character a cell: `.` empty, `=` ledge, `~` water,
// `#` solid; as wide as its longest row, rounded up to whole screens. `parse` reads them once at load. `placed`
// holds four numbers a record, `col, row, type, attr`, sorted by `col`: `type` is an ENEMY value, `attr` an ITEM
// value for carriers and sensors, else 0. `row` is the cell an enemy's feet stand in (the first empty cell over its
// ground), or the height a flier crosses at. `start` is the cell the Ooga drops in above, `lockScreen` the screen the
// scroll stops on, and `spawner.base` the edge spawner's timer at the rifle on the first loop (0: no edge spawner).
// The bases rise in pressure from stage to stage and never fall back: the reference's outdoor levels 3, 5, 6 and 7
// generate soldiers on timers of 216, 208, 200 and 192 frames (its levels 2, 4 and 8 have none, as our rooms have none),
// so stages 3, 5, 6 and 7 take those, stage 8 the next step down, 184, and stage 1 stage 3's 216 (the reference's level 1
// runs at 144, faster than any later level, which a curve that never eases cannot keep).
// validate names a placed type with no def (raid-enemies.js must have loaded) or one that is a part naming its `main`, a
// carrier's or a sensor's attr that is no ITEM (a room's sensor target's too), and a spawner base that is neither 0 nor
// over the most the sim's loop and weapon cuts take (raid-sim.js must have loaded for a stage with a spawner).
//
// Climb: authored as `screens`, listed bottom first, each SCREEN_H strings of SCREEN_W, top row first, in the same
// characters; one screen wide (`cols` is SCREEN_W) and `screens.length * SCREEN_H` rows, row 0 at the bottom. It
// takes `start`, `lockScreen` (screens counted from the bottom), `spawner` and `placed` as a side stage does, but
// `placed` is sorted by `row`, the way it scrolls, and the start stands on the bottom screen. Parsed, it keeps each
// screen's string count in `screenRows`, so validate names a screen that is not SCREEN_H rows.
//
// Terrain, on a side stage or a climb: four optional lists and the tide, kept on the parsed stage as frozen lists of frozen
// records exactly as authored (an empty list when left out), which the sim and the view both read.
//   gusts    `[from, to, dir]`: a gust zone over columns `from` to `to` on a side stage, rows on a climb, by an Ooga's
//            feet; `dir` -1 blows left, 1 right, 0 left then right by turns, a cycle each (raid-sim.js runs the cycle)
//   lifts    `[col, width, lowRow, highRow, speed, hold]`: a one-way ledge `width` cells wide from column `col`, whose top
//            cell row runs between `lowRow` and `highRow` at `speed` m/s and waits `hold` s at each end, from the low end
//            at time 0 (the sim's creation); its top surface is (row + 1) * CELL
//   crumble  `[col0, col1, row]`: a span of ledge cells that crumbles under an Ooga and comes back
//   belts    `[col0, col1, row, v]`: a belt over the cells of `row` from `col0` to `col1`, carrying what stands on them at
//            `v` m/s along x (negative to the left)
//   tide     `{ basins: [[col0, col1, lowRow, highRow]], floats: [[col0, col1]] }`: each basin's water, drawn as `~` in
//            its low row, rises to its high row and falls again on the stage clock (raid-terrain.js), and in a float's
//            columns the top water cell is a raft; kept as `{ basins, floats }`, each list frozen as the others (none: both
//            empty)
// validate names a record of the wrong length; a zone's columns or rows outside the grid or the wrong way round, or a dir
// other than -1, 0 or 1; a lift's columns or rows outside the grid (`lowRow` under `highRow`), a speed not over 0 or a
// negative hold, or a solid cell on its path (its cells from lowRow to highRow and the two rows a rider stands in over its
// high end); zones that overlap; a span outside the grid or over a cell that is no ledge; a belt's cells outside the grid
// or the wrong way round, or an empty one, a speed of 0 or not under the sim's TUNE.RUN either way (validate reads it, so
// raid-sim.js must have loaded for a stage with belts), and belts that overlap in a row; a basin's columns or rows outside
// the grid, a low row not under its high row, a low row cell that is no water, a solid or ledge cell over the low row up to
// the high row, and a basin that shares a column with another basin, a crumbling span or a lift; and a float in no basin's
// columns.
//
// Rooms: authored as `rooms`, each `{ targets, doors, waves, boss, wires }`, and no cells. `targets` are `[x, y, type,
// attr]`: `x` metres along the room's back wall from its left end (0 to ROOM_W) and `y` metres up it (0 to ROOM_H),
// `type` and `attr` as in `placed`. `doors` are the `x`s on the back wall where enemies come in. `waves` are `[at,
// type, door]`, sorted by `at`, the seconds after the room starts, `door` an index into `doors`. Every room but a boss
// room holds a target, and the last room is the boss room. `wires`, optional, are tripwires along the front line,
// `[x0, x1, h, on, off, offset]`: from x0 to x1 metres along it (x0 < x1), at h metres up (over 0), live for `on`
// seconds (over 0) then dark for `off` (0 or more) on the room's clock, starting `offset` seconds (0 or more) into that
// cycle, its span reaching onto the front line (ROOM_FRONT to ROOM_W - ROOM_FRONT); the sim kills an Ooga in a live
// wire's span whose body spans its height. The boss room must be able to end: a target whose type is flagged CORE, or a
// target or wave whose type is a boss main (validate reads the types' defs, so raid-enemies.js must have loaded). Each
// back-wall target is seen and shot whole: no two targets' bullet boxes overlap, and none stands in front of a door's
// opening, ROOM_DOOR (validate reads each type's box from the sim, so raid-sim.js must have loaded too). Parsed, each room's targets, doors,
// waves and wires are flat Float64Arrays of four, one, three and six numbers a record (no wires: an empty one). A record
// of any other length, here or in `placed`, is parsed as missing numbers (NaN here, MISSING in `placed`) and validate
// names it.
//
// Rooms carry no `start`, `spawner`, `lockScreen` or core marker; the sim's defaults stand in for them. The Ooga drops
// in over the middle of the front line (x ROOM_W / 2, depth 0) at the stage's start, and a room's waves are all the
// enemies that come: there is no edge spawner. A room's cores are its targets whose type is flagged CORE (raid-enemies.js;
// LEDGER_CORE is one), and its barrier opens when the last of them is destroyed (at once in a room with none but the boss
// room, which a boss main's fall clears instead). A target's `x, y` is the middle of its box on the back
// wall (depth 1). A shot into the room flies level at its muzzle's height, so only the lower wall can be hit. The back
// wall's targets are the types ROOM_REACH names, each standing at most its entry's metres up the wall: validate refuses a
// target of any other type and one above its type's entry, and the sim checks each entry at load against the highest a
// jump's shot meets that type's box, so no core stands out of reach. Waves send COIN_BARRELs and GUARDs in at their
// door's x on the back wall; they are never targets.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const KIND = Object.freeze({ EMPTY: 0, LEDGE: 1, WATER: 2, SOLID: 3 });
  // Named here because the stage data names them and this file loads first; raid-sim.js re-exports these objects.
  // The rooms' types (to GUARD) follow the side stages' so no earlier value moves, then LOB, the lob any thrower throws
  // (raid-enemies.js), and each later stage's own types follow in the order the stages come (stage 2's, The Counting
  // House's, from PRESS_DIE: raid-legion-counting.js; stage 3's, The Hashrate Tower's, from COIN_DRONE:
  // raid-legion-tower.js; stage 4's, The Treasury Vaults', from BILL_BAT: raid-legion-treasury.js). Stages 5 to 8's follow
  // in the stage specs' table order, from AUDITOR, each registered by its owner's file: raid-legion-field.js (AUDITOR,
  // TAX_COLLECTOR, REPO_TRUCK, SPARK), raid-legion-factory.js (ARC_PYLON, CAPACITOR, GRID_WARDEN), raid-legion-lake.js
  // (FEE_EEL, LEVIATHAN), raid-legion-pass.js (SHARD_THROWER, ICICLE, MECH, MECH_POD, DROP_CRATE) and
  // raid-legion-reserve.js (RAM, ENGINE_PRESS, ENGINE_POD, CHAIRMAN_ENGINE). Code and data name every type by its key, never its number.
  const ENEMY = Object.freeze({
    FREE: 0, SHOT: 1, RUNNER: 2, CLERK: 3, PRINTER: 4, CARRIER: 5, SENSOR: 6, ITEM: 7, VAULT: 8, VAULT_GUN: 9,
    LEDGER_CORE: 10, WALL_TELLER: 11, COIN_BARREL: 12, GUARD: 13, LOB: 14, PRESS_DIE: 15, MINT_COUNTER: 16,
    COIN_DRONE: 17, LOBBYIST: 18, BOND_MORTAR: 19, VENT: 20, TETHER: 21, BALLOON: 22,
    BILL_BAT: 23, DROP_GUARD: 24, SHUTTER_CORE: 25, TWIN_CORE: 26, SEARCHLIGHT: 27, PRINT_HEAD: 28, PRINTER_KING: 29,
    AUDITOR: 30, TAX_COLLECTOR: 31, REPO_TRUCK: 32, ARC_PYLON: 33, FEE_EEL: 34, SHARD_THROWER: 35, SPARK: 36, ICICLE: 37,
    RAM: 38, CAPACITOR: 39, GRID_WARDEN: 40, LEVIATHAN: 41, MECH: 42, MECH_POD: 43, ENGINE_PRESS: 44, ENGINE_POD: 45,
    CHAIRMAN_ENGINE: 46, DROP_CRATE: 47
  });
  const ITEM = Object.freeze({ AUTO: 1, CORK: 2, FAN: 3, BEAM: 4, RAPID: 5, BARRIER: 6, CLEAR: 7 });
  const CELL = 0.5, SCREEN_W = 16, SCREEN_H = 14, ROOM_W = 8, ROOM_H = 4.5;
  const ROOM_FRONT = 0.5;   // the front line, where the Oogas walk, runs from this far in at either end of a room
  // The types a room's back wall holds, and the highest each may stand up it, in metres: a comfortable jump-shot window
  // under the reach the sim works out for that type's own box at load (about 2.14 m for the core, the teller and the Mint
  // Press's die, and the Treasury's shutter, twin, searchlight and print head, 2.11 m for the sensor, a pickup there,
  // 2.33 m for the press's counter and the Printer King), which it throws on passing.
  const ROOM_REACH = Object.freeze({
    LEDGER_CORE: 2, WALL_TELLER: 2, SENSOR: 2, PRESS_DIE: 2, MINT_COUNTER: 2,
    SHUTTER_CORE: 2, TWIN_CORE: 2, SEARCHLIGHT: 2, PRINT_HEAD: 2, PRINTER_KING: 2
  });
  // A door's opening on a room's back wall: HALF metres either side of its x and TOP metres up from the floor, which the
  // view's doorways fit inside. No back-wall target's bullet box may stand in front of it.
  const ROOM_DOOR = Object.freeze({ HALF: 0.48, TOP: 1.4 });
  const ENEMY_NAME = Object.freeze(Object.keys(ENEMY).reduce((out, name) => { out[ENEMY[name]] = name; return out; }, []));
  const CHAR = Object.freeze({ ".": KIND.EMPTY, "=": KIND.LEDGE, "~": KIND.WATER, "#": KIND.SOLID });
  const BAD = 255;   // a cell a short row leaves out or an unknown character wrote; validate names its row
  const MISSING = -32768;   // fills a placed record of the wrong length (rooms' records take NaN); validate names it

  // One authored row into the grid; a character past the grid's width marks the row's last cell bad.
  const fillRow = (cells, cols, row, line) => {
    const base = row * cols;
    for (let c = 0; c < line.length; c++) cells[base + Math.min(c, cols - 1)] = c < cols ? CHAR[line[c]] ?? BAD : BAD;
  };

  // Records of `size` numbers into `flat`, one after another; a record of any other length fills its slot with `missing`.
  const flatRecords = (records, size, flat, missing) => {
    for (let i = 0; i < records.length; i++) {
      if (records[i].length === size) flat.set(records[i], i * size);
      else flat.fill(missing, i * size, (i + 1) * size);
    }
    return flat;
  };

  // A grid stage's terrain features, each a frozen list of frozen records exactly as authored (none: an empty list), for
  // the sim and the view alike; validate names a record of the wrong length or out of range.
  const records = (list = []) => Object.freeze(list.map((record) => Object.freeze(Array.from(record))));
  const terrain = ({ gusts, lifts, crumble, belts, tide = {} }) => ({
    gusts: records(gusts), lifts: records(lifts), crumble: records(crumble), belts: records(belts),
    tide: Object.freeze({ basins: records(tide.basins), floats: records(tide.floats) })
  });

  const gridStage = (id, name, kind, screens, cols, rows, cells, start, lockScreen, spawner, placed, extra) => Object.freeze(Object.assign({
    id, name, kind, screens, cols, rows, cells,
    start: Object.freeze({ col: start.col, row: start.row }), lockScreen,
    spawner: Object.freeze({ base: spawner.base }), placed: flatRecords(placed, 4, new Int16Array(placed.length * 4), MISSING)
  }, extra));

  const parseSide = (def) => {
    const { id, name, rows: text, start, lockScreen, spawner, placed } = def;
    const rows = text.length;
    let width = 0;
    for (const line of text) width = Math.max(width, line.length);
    const screens = Math.ceil(width / SCREEN_W), cols = screens * SCREEN_W;
    const cells = new Uint8Array(cols * rows).fill(BAD);
    for (let i = 0; i < rows; i++) fillRow(cells, cols, rows - 1 - i, text[i]);
    return gridStage(id, name, "side", screens, cols, rows, cells, start, lockScreen, spawner, placed, terrain(def));
  };

  const parseClimb = (def) => {
    const { id, name, screens: blocks, start, lockScreen, spawner, placed } = def;
    let rows = 0;
    for (const block of blocks) rows += block.length;
    const cols = SCREEN_W, cells = new Uint8Array(cols * rows).fill(BAD);
    let bottom = 0;   // the row this screen's last string lands on
    for (const block of blocks) {
      for (let i = 0; i < block.length; i++) fillRow(cells, cols, bottom + block.length - 1 - i, block[i]);
      bottom += block.length;
    }
    const screenRows = Object.freeze(blocks.map((block) => block.length));
    return gridStage(id, name, "climb", blocks.length, cols, rows, cells, start, lockScreen, spawner, placed, { screenRows, ...terrain(def) });
  };

  const parseRooms = ({ id, name, rooms }) => Object.freeze({
    id, name, kind: "rooms",
    rooms: Object.freeze(rooms.map((room) => Object.freeze({
      targets: flatRecords(room.targets, 4, new Float64Array(room.targets.length * 4), NaN), doors: Float64Array.from(room.doors),
      waves: flatRecords(room.waves, 3, new Float64Array(room.waves.length * 3), NaN), boss: room.boss === true,
      wires: flatRecords(room.wires ?? [], 6, new Float64Array((room.wires ?? []).length * 6), NaN)
    })))
  });

  const parse = (def) => {
    const kind = def.kind ?? "side";
    if (kind === "side") return parseSide(def);
    if (kind === "climb") return parseClimb(def);
    if (kind === "rooms") return parseRooms(def);
    throw new Error(`raidStages.parse: ${def.id} has unknown kind ${kind}`);
  };

  const cellAt = (stage, col, row) => {
    if (col < 0 || col >= stage.cols) return KIND.SOLID;
    if (row < 0 || row >= stage.rows) return KIND.EMPTY;
    return stage.cells[row * stage.cols + col];
  };

  // A placed record's or a room target's type and attr: an enemy with a def (raid-enemies.js) that is no part a main
  // mounts, and a carrier's or a sensor's attr the ITEM it turns into. One string a fault.
  const ITEM_VALUES = new Set(Object.values(ITEM));
  const placedType = (id, what, type, attr) => {
    const def = type === ENEMY.FREE ? undefined : BL.raidEnemies.TYPES[type], name = ENEMY_NAME[type];
    if (!def) return [`${id}: ${what} is type ${type}, which is no registered enemy`];
    if (def.main !== undefined) return [`${id}: ${what} is a ${name}, a part its main ${ENEMY_NAME[def.main]} puts on, which is never placed`];
    if ((type === ENEMY.CARRIER || type === ENEMY.SENSOR) && !ITEM_VALUES.has(attr)) return [`${id}: ${what} is a ${name} carrying ${attr}, which is no ITEM`];
    return [];
  };
  const validateGrid = (stage) => {
    const { id, kind, screens, cols, rows, cells, start, lockScreen, placed } = stage, errors = [];
    const climb = kind === "climb";
    if (climb) {
      for (let s = 0; s < screens; s++) {
        if (stage.screenRows[s] !== SCREEN_H) errors.push(`${id}: screen ${s} from the bottom is ${stage.screenRows[s]} rows, wants ${SCREEN_H}`);
      }
    } else if (rows !== SCREEN_H) errors.push(`${id}: ${rows} rows, wants ${SCREEN_H}`);
    if (cols !== (climb ? 1 : screens) * SCREEN_W || cells.length !== cols * rows) errors.push(`${id}: ${cells.length} cells is not ${climb ? 1 : screens} whole screens of ${SCREEN_W} by ${rows}`);
    else {
      for (let i = 0; i < rows; i++) {
        const base = (rows - 1 - i) * cols;
        for (let col = 0; col < cols; col++) {
          if (cells[base + col] <= KIND.SOLID) continue;
          errors.push(`${id}: row ${i} from the top is not ${cols} cells or holds an unknown character at column ${col}`);
          break;
        }
      }
    }
    let ground = false;
    if (start.col >= 0 && start.col < cols && start.row >= 0 && start.row < rows) {
      for (let row = start.row - 1; row >= 0 && !ground; row--) ground = cellAt(stage, start.col, row) !== KIND.EMPTY;
    }
    if (!ground) errors.push(`${id}: no ledge, water or solid under the start at column ${start.col}, row ${start.row}`);
    if (climb && !(start.row >= 0 && start.row < SCREEN_H)) errors.push(`${id}: the start at row ${start.row} is not on the bottom screen, rows 0 to ${SCREEN_H - 1}`);
    const along = climb ? 1 : 0, axis = climb ? "row" : "column";   // placed records run the way the stage scrolls
    if (placed.length > 0 && !BL.raidEnemies) throw new Error(`raidStages.validate: ${id} places enemies, whose types are raid-enemies.js's; load it first`);
    for (let i = 0; i < placed.length; i += 4) {
      if (placed[i] === MISSING) { errors.push(`${id}: placed record ${i / 4} is not four numbers, col, row, type, attr`); continue; }
      const col = placed[i], row = placed[i + 1];
      if (col < 0 || col >= cols || row < 0 || row >= rows) errors.push(`${id}: placed record ${i / 4} at column ${col}, row ${row} is outside the grid`);
      if (i > 0 && placed[i + along] < placed[i - 4 + along]) errors.push(`${id}: placed record ${i / 4} at ${axis} ${placed[i + along]} comes after ${axis} ${placed[i - 4 + along]}`);
      errors.push(...placedType(id, `placed record ${i / 4}`, placed[i + 2], placed[i + 3]));
    }
    if (!(Number.isInteger(lockScreen) && lockScreen >= 0 && lockScreen < screens)) errors.push(`${id}: scroll lock on screen ${lockScreen}, wants 0 to ${screens - 1}`);
    if (stage.spawner.base !== 0) {
      // The spawner's period is its base less the loop and strength cuts, with no floor, so a base must stay over the
      // largest cut (the most loops counted and the strongest weapon) or a late loop would send a runner every step.
      if (!BL.raidSim) throw new Error(`raidStages.validate: ${id} has an edge spawner, whose cuts are raid-sim.js's; load it first`);
      const { RULES } = BL.raidSim, most = RULES.SPAWN_LOOP_CUT * RULES.SPAWN_LOOPS_MAX + RULES.SPAWN_STRENGTH_CUT * Math.max(...RULES.STRENGTH);
      if (!(stage.spawner.base > most)) errors.push(`${id}: spawner base ${stage.spawner.base} is neither 0 nor over ${most}, the most its loop and weapon cuts take`);
    }
    const whole = (...values) => values.every(Number.isInteger);
    const shaped = (record, size) => record.length === size && record.every(Number.isFinite);
    const span = climb ? rows : cols;   // a gust zone runs along columns on a side stage, rows on a climb
    stage.gusts.forEach((g, k) => {
      if (!shaped(g, 3)) { errors.push(`${id}: gust ${k} is not three numbers, from, to, dir`); return; }
      const [from, to, dir] = g, wrong = [];
      if (!(whole(from, to) && from >= 0 && from <= to && to < span)) wrong.push(`its ${axis}s ${from} to ${to} are not whole ${axis}s within 0 to ${span - 1}, low to high`);
      if (!(dir === -1 || dir === 0 || dir === 1)) wrong.push(`it blows ${dir}, wants -1, 0 or 1`);
      if (wrong.length) errors.push(`${id}: gust ${k}: ${wrong.join("; ")}`);
      else {
        // Zones may not overlap, so no Ooga stands in two (each sound earlier zone is compared).
        for (let j = 0; j < k; j++) {
          const o = stage.gusts[j];
          if (shaped(o, 3) && whole(o[0], o[1]) && o[0] >= 0 && o[0] <= o[1] && o[1] < span && o[0] <= to && from <= o[1]) errors.push(`${id}: gust ${k} overlaps gust ${j}, ${axis}s ${Math.max(from, o[0])} to ${Math.min(to, o[1])}`);
        }
      }
    });
    stage.lifts.forEach((l, k) => {
      if (!shaped(l, 6)) { errors.push(`${id}: lift ${k} is not six numbers, col, width, lowRow, highRow, speed, hold`); return; }
      const [col, width, lowRow, highRow, speed, hold] = l, wrong = [];
      if (!(whole(col, width) && col >= 0 && width >= 1 && col + width <= cols)) wrong.push(`its columns ${col} to ${col + width - 1} are not whole columns within 0 to ${cols - 1}, left to right`);
      if (!(whole(lowRow, highRow) && lowRow >= 0 && lowRow < highRow && highRow < rows)) wrong.push(`its rows ${lowRow} to ${highRow} are not whole rows within 0 to ${rows - 1}, low under high`);
      if (!(speed > 0)) wrong.push(`it moves at ${speed} m/s, wants over 0`);
      if (!(hold >= 0)) wrong.push(`it waits ${hold} s at each end, wants 0 or more`);
      // Its path: its own cells from lowRow to highRow and the two rows a standing rider takes over its high end, clear of
      // solid, which would carry a rider into a ceiling.
      if (!wrong.length) {
        let hit = "";
        for (let row = lowRow; row <= highRow + 2 && !hit; row++) {
          for (let c = col; c < col + width && !hit; c++) if (cellAt(stage, c, row) === KIND.SOLID) hit = `its path crosses a solid cell at column ${c}, row ${row}`;
        }
        if (hit) wrong.push(hit);
      }
      if (wrong.length) errors.push(`${id}: lift ${k}: ${wrong.join("; ")}`);
    });
    stage.crumble.forEach((c, k) => {
      if (!shaped(c, 3)) { errors.push(`${id}: crumbling span ${k} is not three numbers, col0, col1, row`); return; }
      const [col0, col1, row] = c;
      if (!(whole(col0, col1, row) && col0 >= 0 && col0 <= col1 && col1 < cols && row >= 0 && row < rows)) {
        errors.push(`${id}: crumbling span ${k}: its cells, columns ${col0} to ${col1} in row ${row}, are not whole cells within the grid, left to right`);
        return;
      }
      for (let col = col0; col <= col1; col++) {
        if (cellAt(stage, col, row) === KIND.LEDGE) continue;
        errors.push(`${id}: crumbling span ${k}: column ${col} in row ${row} is no ledge`);
        break;
      }
    });
    // Belts: each one's cells whole and within the grid, none empty, a speed either way under the run's, and no two
    // sharing a cell (each sound earlier belt is compared).
    const sound = [];
    stage.belts.forEach((b, k) => {
      if (!shaped(b, 4)) { errors.push(`${id}: belt ${k} is not four numbers, col0, col1, row, v`); return; }
      if (!BL.raidSim) throw new Error(`raidStages.validate: ${id} has belts, whose speeds are held under the run's in raid-sim.js; load it first`);
      const [col0, col1, row, v] = b, wrong = [], run = BL.raidSim.TUNE.RUN;
      if (!(whole(col0, col1, row) && col0 >= 0 && col0 <= col1 && col1 < cols && row >= 0 && row < rows)) wrong.push(`its cells, columns ${col0} to ${col1} in row ${row}, are not whole cells within the grid, left to right`);
      else {
        for (let col = col0; col <= col1; col++) if (cellAt(stage, col, row) === KIND.EMPTY) { wrong.push(`column ${col} in row ${row} is empty`); break; }
        for (const [j, o] of sound) if (o[2] === row && o[0] <= col1 && col0 <= o[1]) wrong.push(`it overlaps belt ${j}, columns ${Math.max(col0, o[0])} to ${Math.min(col1, o[1])}`);
      }
      if (!(v !== 0 && Math.abs(v) < run)) wrong.push(`it moves at ${v} m/s, wants not 0 and under the run's ${run} m/s either way`);
      if (wrong.length) errors.push(`${id}: belt ${k}: ${wrong.join("; ")}`);
      else sound.push([k, b]);
    });
    // The tide: each basin within the grid, its low row water under its high row, nothing solid over the low row up to the
    // high row, and no column shared with another basin, a crumbling span or a lift; each float within a basin's columns.
    const basins = [], spread = (list, size, from, to) => list.filter((r) => shaped(r, size) && whole(r[from], r[to]));
    stage.tide.basins.forEach((b, k) => {
      if (!shaped(b, 4)) { errors.push(`${id}: basin ${k} is not four numbers, col0, col1, lowRow, highRow`); return; }
      const [col0, col1, lowRow, highRow] = b, wrong = [];
      if (!(whole(col0, col1) && col0 >= 0 && col0 <= col1 && col1 < cols)) wrong.push(`its columns ${col0} to ${col1} are not whole columns within 0 to ${cols - 1}, left to right`);
      if (!(whole(lowRow, highRow) && lowRow >= 0 && highRow < rows)) wrong.push(`its rows ${lowRow} to ${highRow} are not whole rows within 0 to ${rows - 1}`);
      else if (!(lowRow < highRow)) wrong.push(`its low row ${lowRow} is not under its high row ${highRow}`);
      if (!wrong.length) {
        for (let col = col0; col <= col1; col++) if (cellAt(stage, col, lowRow) !== KIND.WATER) { wrong.push(`column ${col} in its low row ${lowRow} is no water`); break; }
        // Over the low row only water and open air: the tide lifts a body only out of its own water, so a ledge there would
        // hold one under it while the water rose past.
        let solid = "";
        for (let row = lowRow + 1; row <= highRow && !solid; row++) {
          for (let col = col0; col <= col1 && !solid; col++) {
            const kind = cellAt(stage, col, row);
            if (kind === KIND.SOLID || kind === KIND.LEDGE) solid = `column ${col} in row ${row} is ${kind === KIND.SOLID ? "solid" : "a ledge"}`;
          }
        }
        if (solid) wrong.push(solid);
        for (const [j, o] of basins) if (o[0] <= col1 && col0 <= o[1]) wrong.push(`it shares columns ${Math.max(col0, o[0])} to ${Math.min(col1, o[1])} with basin ${j}`);
        spread(stage.crumble, 3, 0, 1).forEach((c) => { if (c[0] <= col1 && col0 <= c[1]) wrong.push(`it shares columns ${Math.max(col0, c[0])} to ${Math.min(col1, c[1])} with the crumbling span over columns ${c[0]} to ${c[1]}`); });
        spread(stage.lifts, 6, 0, 1).forEach((l) => { if (l[0] <= col1 && col0 < l[0] + l[1]) wrong.push(`it shares columns ${Math.max(col0, l[0])} to ${Math.min(col1, l[0] + l[1] - 1)} with the lift at column ${l[0]}`); });
      }
      if (wrong.length) errors.push(`${id}: basin ${k}: ${wrong.join("; ")}`);
      else basins.push([k, b]);
    });
    stage.tide.floats.forEach((f, k) => {
      if (!shaped(f, 2)) { errors.push(`${id}: float ${k} is not two numbers, col0, col1`); return; }
      const [col0, col1] = f;
      if (!(whole(col0, col1) && col0 <= col1 && stage.tide.basins.some((o) => shaped(o, 4) && whole(o[0], o[1]) && o[0] >= 0 && o[1] < cols && o[0] <= col0 && col1 <= o[1]))) errors.push(`${id}: float ${k}: its columns ${col0} to ${col1} lie in no basin's columns, left to right`);
    });
    return errors;
  };

  const validateRooms = ({ id, rooms }) => {
    const errors = [], last = rooms.length - 1;
    for (let r = 0; r <= last; r++) {
      const { targets, doors, waves, boss, wires } = rooms[r];
      if (!boss && targets.length === 0) errors.push(`${id}: room ${r} has no target`);
      if (boss && r < last) errors.push(`${id}: room ${r} is a boss room before the last room`);
      for (let i = 0; i < targets.length; i += 4) {
        if (Number.isNaN(targets[i])) { errors.push(`${id}: room ${r}: target ${i / 4} is not four numbers, x, y, type, attr`); continue; }
        const x = targets[i], y = targets[i + 1];
        if (ROOM_REACH[ENEMY_NAME[targets[i + 2]]] !== undefined) {
          if (!BL.raidEnemies) throw new Error(`raidStages.validate: ${id} holds targets, whose types are raid-enemies.js's; load it first`);
          errors.push(...placedType(id, `room ${r}: target ${i / 4}`, targets[i + 2], targets[i + 3]));
        }
        if (!(x >= 0 && x <= ROOM_W && y >= 0 && y <= ROOM_H)) errors.push(`${id}: room ${r}: target ${i / 4} at ${x} m along and ${y} m up is off the back wall, 0 to ${ROOM_W} by 0 to ${ROOM_H}`);
        else {
          const name = ENEMY_NAME[targets[i + 2]], reach = ROOM_REACH[name];
          if (reach === undefined) errors.push(`${id}: room ${r}: target ${i / 4} is a ${name ?? `type ${targets[i + 2]}`}, which no back wall holds; wants one of ${Object.keys(ROOM_REACH).join(", ")}`);
          else if (y > reach) errors.push(`${id}: room ${r}: target ${i / 4}, a ${name}, at ${y} m up is above the ${reach} m a shot into the room reaches it at`);
        }
      }
      for (let i = 0; i < doors.length; i++) {
        if (!(doors[i] >= 0 && doors[i] <= ROOM_W)) errors.push(`${id}: room ${r}: door ${i} at ${doors[i]} m is off the back wall, 0 to ${ROOM_W}`);
      }
      for (let i = 0; i < waves.length; i += 3) {
        if (Number.isNaN(waves[i])) { errors.push(`${id}: room ${r}: wave ${i / 3} is not three numbers, at, type, door`); continue; }
        const at = waves[i], door = waves[i + 2];
        if (!(at >= 0)) errors.push(`${id}: room ${r}: wave ${i / 3} at ${at} s comes before the room starts`);
        if (i > 0 && at < waves[i - 3]) errors.push(`${id}: room ${r}: wave ${i / 3} at ${at} s comes after ${waves[i - 3]} s`);
        if (!(Number.isInteger(door) && door >= 0 && door < doors.length)) errors.push(`${id}: room ${r}: wave ${i / 3} comes through door ${door}, wants 0 to ${doors.length - 1}`);
      }
      for (let i = 0; i < wires.length; i += 6) {
        if (Number.isNaN(wires[i])) { errors.push(`${id}: room ${r}: wire ${i / 6} is not six numbers, x0, x1, h, on, off, offset`); continue; }
        const [x0, x1, h, on, off, offset] = wires.subarray(i, i + 6), wrong = [];
        if (!(x0 >= 0 && x0 < x1 && x1 <= ROOM_W)) wrong.push(`its span ${x0} to ${x1} m is not within 0 to ${ROOM_W}, left to right`);
        if (!(h > 0 && h <= ROOM_H)) wrong.push(`its height ${h} m is not over 0 and at most ${ROOM_H}`);
        if (!(on > 0)) wrong.push(`it is live ${on} s, wants over 0`);
        if (!(off >= 0)) wrong.push(`it is dark ${off} s, wants 0 or more`);
        if (!(offset >= 0)) wrong.push(`it starts ${offset} s into its cycle, wants 0 or more`);
        else if (x1 < ROOM_FRONT || x0 > ROOM_W - ROOM_FRONT) wrong.push(`its span ${x0} to ${x1} m misses the front line, ${ROOM_FRONT} to ${ROOM_W - ROOM_FRONT}`);
        if (wrong.length) errors.push(`${id}: room ${r}: wire ${i / 6}: ${wrong.join("; ")}`);
      }
      // Each back-wall target is seen and shot whole: no two of their bullet boxes overlap, and none stands in front of a
      // door's opening. The boxes are the sim's, its type's tier box about its origin (RULES.SHOT_BOX, TIER_OF, ORIGIN_OF).
      if (!BL.raidSim) throw new Error(`raidStages.validate: ${id} is a rooms stage, whose targets' boxes come from raid-sim.js; load it first`);
      const { RULES, TIER_OF, ORIGIN_OF, ENEMY_SLOTS, TUNE } = BL.raidSim, boxes = [];
      // Targets spawn as anything with hit points does, so a room holds no more than the slots its shot reserve leaves.
      const room = ENEMY_SLOTS - TUNE.ROOM_RESERVE;
      if (targets.length / 4 > room) errors.push(`${id}: room ${r} holds ${targets.length / 4} targets, more than the ${room} slots a room leaves them (${ENEMY_SLOTS} less its ROOM_RESERVE of ${TUNE.ROOM_RESERVE}), so the rest would never stand`);
      for (let i = 0; i < targets.length; i += 4) {
        const x = targets[i], y = targets[i + 1], t = targets[i + 2], name = ENEMY_NAME[t];
        if (!(x >= 0 && x <= ROOM_W && y >= 0 && y <= ROOM_H) || ROOM_REACH[name] === undefined) continue;
        const b = RULES.SHOT_BOX[TIER_OF[t]], o = y + ORIGIN_OF[t];
        boxes.push([i / 4, name, x + b[0], x + b[1], o + b[2], o + b[3]]);
      }
      for (let a = 0; a < boxes.length; a++) {
        const [k, name, x0, x1, y0, y1] = boxes[a];
        for (let c = a + 1; c < boxes.length; c++) {
          const o = boxes[c];
          if (x0 < o[3] && o[2] < x1 && y0 < o[5] && o[4] < y1) errors.push(`${id}: room ${r}: targets ${k} and ${o[0]}, a ${name} and a ${o[1]}, overlap on the back wall`);
        }
        for (let d = 0; d < doors.length; d++) {
          const x = doors[d];
          if (x >= 0 && x <= ROOM_W && x0 < x + ROOM_DOOR.HALF && x - ROOM_DOOR.HALF < x1 && y0 < ROOM_DOOR.TOP) errors.push(`${id}: room ${r}: target ${k}, a ${name}, stands in front of door ${d} at ${x} m`);
        }
      }
      if (boss) {
        // The boss room ends when its cores fall or a boss main does: it needs one or the other.
        const { TYPES, FLAG } = BL.raidEnemies;
        let ends = false;
        for (let i = 0; i < targets.length; i += 4) { const def = TYPES[targets[i + 2]]; if (def && (def.flags & FLAG.CORE || def.boss)) ends = true; }
        for (let i = 0; i < waves.length; i += 3) { const def = TYPES[waves[i + 1]]; if (def && def.boss) ends = true; }
        if (!ends) errors.push(`${id}: room ${r} is the boss room, but no target is a core and no target or wave a boss main, so it never clears`);
      }
    }
    if (last < 0 || !rooms[last].boss) errors.push(`${id}: the last room is no boss room`);
    return errors;
  };

  // One string a fault; empty when the stage is sound.
  const validate = (stage) => {
    if (stage.kind === "rooms") return validateRooms(stage);
    if (stage.kind === "side" || stage.kind === "climb") return validateGrid(stage);
    return [`${stage.id}: unknown kind ${stage.kind}`];
  };

  // A stage drawn a screen at a time: each block is SCREEN_H strings of SCREEN_W, top row first, joined into rows.
  const joinScreens = (blocks) => {
    const rows = [];
    for (let i = 0; i < SCREEN_H; i++) rows.push(blocks.map((block) => block[i]).join(""));
    return rows;
  };

  const { RUNNER, CLERK, PRINTER, CARRIER, SENSOR, VAULT, LEDGER_CORE, WALL_TELLER, COIN_BARREL, GUARD, PRESS_DIE, MINT_COUNTER } = ENEMY;
  const { COIN_DRONE, LOBBYIST, BOND_MORTAR, VENT, BALLOON } = ENEMY;
  const { DROP_GUARD, SHUTTER_CORE, TWIN_CORE, SEARCHLIGHT, PRINT_HEAD, PRINTER_KING } = ENEMY;

  // Stage 1, Jungle Shore. A beach landing, a pit, a rise and the first canopy; down to a lagoon a screen and a
  // quarter wide with a ledge out over it; a second pit under a ledge that runs onto a rise, a stacked canopy,
  // a cliff top, the boulders, and the vault against a rock wall on the last screen. Low ground stands at 1.5 m,
  // the rises at 2.5 m and the cliff at 3.5 m, and the lagoon lies flush with the low ground, so wading in and out
  // takes no jump; ledges hang at rows 4, 6 and 8, each a metre over what it is reached from, and the pits are a
  // metre wide. Each of the seven items is carried or guarded once along the way.
  const JUNGLE_SHORE = joinScreens([
    [ // 0: the landing beach; the Ooga drops in at column 3
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........=====..",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 1: the first pit, then the first rise
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...........#####",
      "...........#####",
      "######..########",
      "######..########",
      "######..########"
    ],
    [ // 2: off the rise under the canopy, two ledges up
      "................",
      "................",
      "................",
      "................",
      "................",
      "........=====...",
      "................",
      ".=======........",
      "................",
      "#####...........",
      "#####...........",
      "################",
      "################",
      "################"
    ],
    [ // 3: the lagoon opens, a ledge out over the water
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....======......",
      "................",
      "###~~~~~~~~~~~~~",
      "################",
      "################"
    ],
    [ // 4: the lagoon's far shore and a boulder
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..====.....##...",
      "...........##...",
      "~~~~~~~#########",
      "################",
      "################"
    ],
    [ // 5: the second pit under a ledge that runs onto a rise
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...=========####",
      "............####",
      "######..########",
      "######..########",
      "######..########"
    ],
    [ // 6: the stacked canopy over the rise
      "................",
      "................",
      "................",
      "................",
      "................",
      ".......=====....",
      "................",
      ".======.........",
      "................",
      "################",
      "################",
      "################",
      "################",
      "################"
    ],
    [ // 7: up onto the cliff top and down off its far side
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....#########...",
      "....#########...",
      "#############...",
      "#############...",
      "################",
      "################",
      "################"
    ],
    [ // 8: the low canopy
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "........=====...",
      "................",
      "..=====.........",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 9: the boulders
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "........###.....",
      "...##...###.....",
      "################",
      "################",
      "################"
    ],
    [ // 10: the run-up to the vault
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......======....",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 11: the vault against the rock wall, where the scroll locks
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      "..=====......###",
      ".............###",
      "################",
      "################",
      "################"
    ]
  ]);


  // Stage 3, The Hashrate Tower: Ooga Mine's rig tower, seized by the Legion, climbed ten screens up its scaffold to the
  // mining deck, where the Inflation Balloon (raid-legion-tower.js) is tethered. Every ledge stands in an even row, so
  // each surface is a whole metre over the one below, and the path rises a metre at a time over a gap of a cell at most;
  // some ledges on every screen run to a wall, so the spawner's top corners have ground. Screens 0 and 1 teach the
  // zigzag; a cable lift must be ridden on screens 2 and 5 (each 4 m at 1 m/s, waiting 1.2 s at either end); five
  // crumbling planks on the path punish standing still, a ledge a metre under each to catch a fall; vents puff up through
  // the planks from the foot; and from row 84 up the gale blows, left then right, where no gap is wider than a cell.
  // Snipers take the racks and perches from screen 2, coin drones dive from screen 3 and a mortar holds screen 5. The
  // wall perches at rows 36 and 76 are spawner landings off the path, and the left-wall racks are reached only by
  // dropping onto them. The deck is a wall-to-wall grating with the tethers' winches on it, and over it a perch either
  // side a metre up and a middle perch a metre over those.
  const HASHRATE_TOWER = [   // bottom first
    [ // 0: the tower's foot; the Ooga drops in at column 7, a steam vent under the right-hand planks
      "................",
      "=====...........",
      "................",
      "......======....",
      "................",
      "...........=====",
      "................",
      "....=======.....",
      "................",
      "=====......====.",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 1: the first racks: a printer's rack on the left wall, a crumbling plank on row 18
      "................",
      "....======......",
      "................",
      "###.......======",
      "###.............",
      "......====......",
      "................",
      "======..........",
      "................",
      ".....======.....",
      "................",
      ".........=======",
      "................",
      "...======......."
    ],
    [ // 2: the first cable lift, columns 8 to 10, riding rows 32 to 40; spawner perches on both walls at row 36
      "................",
      "...=====........",
      "................",
      "................",
      "................",
      "==............==",
      "................",
      "................",
      "................",
      "............====",
      "................",
      ".....=======....",
      "................",
      "=====..........."
    ],
    [ // 3: the sniper's rack on the left wall and a crumbling plank on row 48
      "................",
      "............====",
      "................",
      "......======....",
      "................",
      "======..........",
      "................",
      "......=====.....",
      "................",
      "###.......======",
      "###.............",
      ".....=====......",
      "................",
      "=====..........."
    ],
    [ // 4: zigzag up the cooling stacks, a crumbling plank on row 60 (the ledge over its far end from column 12, so it
      // can be crossed inside its fuse)
      "................",
      "........======..",
      "................",
      "========........",
      "................",
      "........=====...",
      "................",
      "............====",
      "................",
      ".......======...",
      "................",
      "=======.........",
      "................",
      ".......=====...."
    ],
    [ // 5: the second cable lift, columns 9 to 11, riding rows 72 to 80; spawner perches at row 76
      "................",
      "......======....",
      "................",
      "............====",
      "................",
      "................",
      "................",
      "===..........===",
      "................",
      "................",
      "................",
      "................",
      "................",
      "========........"
    ],
    [ // 6: into the wind: the gale blows from row 84 up; a crumbling plank on row 94
      "................",
      "..........======",
      "................",
      ".....=====......",
      "................",
      "=====...........",
      "................",
      ".....======.....",
      "................",
      "...........=====",
      "................",
      "......=====.....",
      "................",
      "======.........."
    ],
    [ // 7: the windy middle, a vent on row 103
      "................",
      "...=====........",
      "................",
      "===.............",
      "................",
      "...======.......",
      "................",
      ".........=======",
      "................",
      "....=====.......",
      "................",
      "====............",
      "................",
      "....======......"
    ],
    [ // 8: the last racks under the deck, a crumbling plank on row 120
      "................",
      "......======....",
      "................",
      "............====",
      "................",
      ".......=====....",
      "................",
      "=======.........",
      "................",
      ".......======...",
      "................",
      ".............===",
      "................",
      "........=====..."
    ],
    [ // 9: the mining deck on row 128, wall to wall, where the scroll locks and the balloon flies: a grating over the ledge
      // under it (columns 0 to 6, so a drop through lands over the locked screen's bottom) and solid plate beyond; perches
      // a metre up either side (row 130) and a middle one a metre over them (row 132)
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".....======.....",
      "................",
      ".====......====.",
      "................",
      "=======#########",
      "................",
      "=======........."
    ]
  ];

  // Stage 5, The Lightning Factory Floor. The Factory's hall taken over by the Legion: belts that run against
  // the Ooga, arc pylons (raid-legion-factory.js) sending sparks along the floor, open floor hatches two cells wide, the
  // forge, and the Grid Warden against the far wall. The low floor stands at 1.5 m (its top row 2, so feet in row 3), the
  // machine deck and the blocks at 2.5 m, and each gantry a metre over what it is reached from; the boss screen's gantry
  // is on row 4 (feet 2.5 m), where the stage spec's text and its reach put it. Screens 0 to 3 teach one idea each (a
  // belt back, a hatch under a gantry, the first pylon), 4 to 7 combine them (a forward belt into a hatch, two pylons on
  // the deck, a belt under a gantry, three hatches), 8 to 10 are the forge's crucible, the cooling line and the run-up.
  const LIGHTNING_FACTORY = joinScreens([
    [ // 0: the loading bay; the Ooga drops in at column 3
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "........======..",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 1: the first belt, running back toward the bay, and a transformer block
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..======........",
      "................",
      "...........###..",
      "...........###..",
      "################",
      "################",
      "################"
    ],
    [ // 2: the first floor hatch under a gantry
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....=======.....",
      "................",
      "#####..#########",
      "#####..#########",
      "#####..#########"
    ],
    [ // 3: the first arc pylon on open floor; a gantry over it to wait the spark out
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........=====..",
      "................",
      "..=====.........",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 4: the forward belt carrying toward a hatch
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..........======",
      "................",
      "##########..####",
      "##########..####",
      "##########..####"
    ],
    [ // 5: up onto the machine deck, two pylons on it
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..======........",
      "................",
      "....############",
      "....############",
      "################",
      "################",
      "################"
    ],
    [ // 6: the deck's far edge and a belt below it
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".......======...",
      "................",
      "#####...........",
      "#####...........",
      "################",
      "################",
      "################"
    ],
    [ // 7: the hatch run, three hatches and the gantries over them
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".======..======.",
      "................",
      "###..####..###..",
      "###..####..###..",
      "###..####..###.."
    ],
    [ // 8: the forge's apron and its crucible on a plinth
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....======......",
      "................",
      "..........###...",
      "..........###...",
      "################",
      "################",
      "################"
    ],
    [ // 9: the cooling line: a belt back and two pylons
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..=====.........",
      "................",
      "..........=====.",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 10: the run-up to the Warden
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...=====........",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 11: the Grid Warden against the far wall, where the scroll locks; its gantry on row 4
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      "..=====......###",
      ".............###",
      "################",
      "################",
      "################"
    ]
  ]);
  // Stage 6, Mempool Lake. Over the vine bridge to the Mempool island: a rainforest shore cut by pools that
  // fill and drain with the backlog (the tide, F12), a tunnel under the ridge (screens 5 and 6, its roof only drawn, so no
  // solid cell hangs over a drop-in), the cliff steps, the lakeside pool and the Backlog Leviathan's lake under the rock
  // wall. Banks stand at 1.5 m (feet in row 3), the raised bank, the tunnel's far floor and the cliff at 2.5 and 3.5 m.
  // Each pool's drawn `~` is its low water, a metre under its banks, where an Ooga cannot jump out; its high water is flush
  // with them (the sump's, in the tunnel, with its raised banks), and a raft a cell from a bank jumps out at low water.
  const MEMPOOL_LAKE = joinScreens([
    [ // 0: the bridge's landing on the shore; the Ooga drops in at column 3
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........=====..",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 1: the first pool: four cells, one raft, the bank a metre over low water
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...........====.",
      "................",
      "#####....#######",
      "#####....#######",
      "#####~~~~#######"
    ],
    [ // 2: the raised bank under the first canopy
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".......=====....",
      "................",
      "...######.......",
      "...######.......",
      "################",
      "################",
      "################"
    ],
    [ // 3: the long pool begins: ten cells, rafts two cells apart
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......=====.....",
      "................",
      "####............",
      "####............",
      "####~~~~~~~~~~~~"
    ],
    [ // 4: the long pool's far bank and the tunnel mouth
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......=======...",
      "................",
      "..##############",
      "..##############",
      "~~##############"
    ],
    [ // 5: in the tunnel: two sinkholes and the stalagmites
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...=====.....===",
      "................",
      "##..#####..###..",
      "##..#####..###..",
      "##..#####..###.."
    ],
    [ // 6: the tunnel's sump, a metre under the banks at low water and flush at high, roots over it to cross dry
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...====.====....",
      "................",
      "##..........####",
      "##..........####",
      "##~~~~~~~~~~####",
      "################",
      "################"
    ],
    [ // 7: out of the tunnel and up the cliff steps
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..........######",
      "..........######",
      ".....###########",
      ".....###########",
      "################",
      "################",
      "################"
    ],
    [ // 8: the lakeside: down off the cliff to the shore and the lakeside pool
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "####............",
      "####............",
      "####............",
      "####............",
      "#######.........",
      "#######.........",
      "#######~~~~~~~~~"
    ],
    [ // 9: the pool's far bank, where the repo truck drives the shore road
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "............====",
      "................",
      "...#############",
      "...#############",
      "~~~#############"
    ],
    [ // 10: the run-up to the lake, over the last canopy
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......=====.....",
      "................",
      "..=====.........",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 11: the Leviathan's lake under the rock wall, where the scroll locks; the drop-in column at the lock (179) is bank
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".....====....###",
      ".............###",
      ".====....====###",
      ".............###",
      "####.......#####",
      "####.......#####",
      "####~~~~~~~#####"
    ]
  ]);
  // Stage 7, Bifrost Pass. The crystal pass up to the ₿IFRÖST gate: shelves of rock, two crystal bridges over
  // fatal chasms in the gale (planks a cell apart), the low plank bridge with two planks missing, an icicle gallery under
  // a crystal roof, the ridge road, and the Bailout Mech's landing ground under the cliff (raid-legion-pass.js). The
  // surface steps through 1.5, 2.5 and 3.5 m (the bridge heads, the plateau and the ridge road at 3.5 m, feet in row 7),
  // and every rise is a metre at most. The crystal arches (rows 9 and 10 of screens 2 and 7) are solid, their tops stood
  // on (feet in row 11); no row 13 cell is solid. Every gap inside the two gust zones (columns 48 to 111 and 160 to 191,
  // blowing left into the Ooga's face) is one cell, which a jump against the gust still crosses.
  const BIFROST_PASS = joinScreens([
    [ // 0: the foot of the pass; the Ooga drops in at column 3
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "........=====...",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 1: the first shelf of the pass
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...........=====",
      "................",
      "......##########",
      "......##########",
      "################",
      "################",
      "################"
    ],
    [ // 2: the second shelf, under the first crystal arch
      "................",
      "................",
      "................",
      ".......#####....",
      ".......#####....",
      "................",
      "................",
      "......##########",
      "......##########",
      "################",
      "################",
      "################",
      "################",
      "################"
    ],
    [ // 3: the high chasm and the crystal bridge over it, planks a cell apart, into the gale
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "####.====.====.=",
      "####............",
      "####............",
      "####............",
      "####............",
      "####............",
      "####............"
    ],
    [ // 4: the crystal plateau and its sniper perch
      "................",
      "................",
      "................",
      "................",
      "................",
      "......====......",
      "................",
      "################",
      "################",
      "################",
      "################",
      "################",
      "################",
      "################"
    ],
    [ // 5: down the far side in two steps
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "#####...........",
      "#####...........",
      "##########......",
      "##########......",
      "################",
      "################",
      "################"
    ],
    [ // 6: the low chasm, a plank bridge flush with the road and two planks missing
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......====......",
      "................",
      "###=.=====.=####",
      "###.........####",
      "###.........####"
    ],
    [ // 7: the icicle gallery under the crystal roof
      "................",
      "................",
      "................",
      "..########......",
      "..########......",
      "................",
      "................",
      "................",
      "................",
      "..........=====.",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 8: up again onto the ridge road
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "........########",
      "........########",
      "....############",
      "....############",
      "################",
      "################",
      "################"
    ],
    [ // 9: the ridge road, where the repo truck drives
      "................",
      "................",
      "................",
      "................",
      "................",
      "=====...........",
      "................",
      "################",
      "################",
      "################",
      "################",
      "################",
      "################",
      "################"
    ],
    [ // 10: the second high bridge into the gale
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........====...",
      "................",
      "###.====.====.==",
      "###.............",
      "###.............",
      "###.............",
      "###.............",
      "###.............",
      "###............."
    ],
    [ // 11: the bridge lands on the crag and the road drops toward the arch
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "==.#####........",
      "...#####........",
      "...##########...",
      "...##########...",
      "...#############",
      "...#############",
      "...#############"
    ],
    [ // 12: under the Bifrost arch, the run-up
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....======......",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 13: the Bailout Mech's landing ground under the cliff, where the scroll locks
      "..............##",
      "..............##",
      "..............##",
      "..............##",
      "..............##",
      "..===.........##",
      "..............##",
      "====..........##",
      "..............##",
      ".===..........##",
      "..............##",
      "################",
      "################",
      "################"
    ]
  ]);
  // Stage 8, The Reserve (stage-8.md): the Legion's printing works under the island, ten screens. The floor's top stands at
  // 1.5 m and the press deck's at 2.5 m; the gallery's at 4.5 m, stepping down a metre at a time to the boss screen. The
  // first ram over open floor; a belt running back by the sump; up onto the press deck under its ram; the paper storm over
  // stacks a cell apart above fatal slots, the bales and a perch, then the forward belt; two rams in a row; the Chairman's
  // lift (columns 133 to 135, its shaft floored at 1 m, so a missed lift is a half-metre dip), the only way up the 3 m wall
  // to the gallery, flush with the floor at its low end and the gallery at its high end; and the Chairman's Engine in the
  // far wall, with two perches beside it. No solid ceilings: the hall's roof is backdrop art.
  const THE_RESERVE = joinScreens([
    [ // 0: inside the Reserve's door; the Ooga drops in at column 3
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........=====..",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 1: the first press over open floor
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "=====...........",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 2: the bill belt runs back toward a sump
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....=====.......",
      "................",
      "..........=====.",
      "................",
      "###########..###",
      "###########..###",
      "###########..###"
    ],
    [ // 3: up onto the press deck
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........======.",
      "................",
      "..##############",
      "..##############",
      "################",
      "################",
      "################"
    ],
    [ // 4: the paper storm begins: the deck breaks into stacks a cell apart
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...=====...=====",
      "................",
      "#####.###.###.##",
      "#####.###.###.##",
      "#####.###.###.##",
      "#####.###.###.##",
      "#####.###.###.##"
    ],
    [ // 5: off the stacks among the bales, a perch over them
      "................",
      "................",
      "................",
      "................",
      "................",
      "........=====...",
      "................",
      "......=====.....",
      "................",
      "##.####.....###.",
      "##.####.....###.",
      "################",
      "################",
      "################"
    ],
    [ // 6: the storm's end and the forward belt
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "..=====.........",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 7: two presses in a row
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "################",
      "################",
      "################"
    ],
    [ // 8: the Chairman's lift up to the gallery, and down its steps
      "................",
      "................",
      "................",
      "................",
      "................",
      "........####....",
      "........####....",
      "........######..",
      "........######..",
      "........########",
      "........########",
      "#####...########",
      "################",
      "################"
    ],
    [ // 9: the Chairman's Engine in the far wall, where the scroll locks
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      ".............###",
      "...====......###",
      ".............###",
      ".====........###",
      ".............###",
      "################",
      "################",
      "################"
    ]
  ]);

  const STAGES = Object.freeze([
    parse({
      kind: "side", id: "shore", name: "Jungle Shore", rows: JUNGLE_SHORE, start: { col: 3, row: 12 }, lockScreen: 11, spawner: { base: 216 },
      placed: [
        [20, 3, CLERK, 0],
        [29, 5, SENSOR, ITEM.AUTO],
        [46, 3, PRINTER, 0],
        [60, 10, CARRIER, ITEM.FAN],
        [67, 5, CLERK, 0],
        [84, 10, CARRIER, ITEM.CORK],
        [93, 5, PRINTER, 0],
        [106, 9, CLERK, 0],
        [120, 7, PRINTER, 0],
        [134, 3, CLERK, 0],
        [136, 10, CARRIER, ITEM.BARRIER],
        [139, 7, SENSOR, ITEM.BEAM],
        [148, 4, SENSOR, ITEM.CLEAR],
        [150, 3, CLERK, 0],
        [156, 3, PRINTER, 0],
        [164, 3, SENSOR, ITEM.RAPID],
        [168, 5, CLERK, 0],
        [172, 3, CLERK, 0],
        [186, 3, VAULT, 0]
      ]
    }),
    // Stage 2, The Counting House: the Legion's bank cut into the cliff, six rooms one behind another, the last the press
    // hall where the Mint Press stamps fiat. It teaches the rooms: up fires into the room, the cores break the barrier and
    // holding up walks on. A core low enough for a standing shot in the Lobby; a high one, for a jump's shot, and the first
    // sensor in the Ledger Hall; a low tripwire in the Gallery; the barrels' doors under the high cores in the Coin Chute,
    // so barrels roll down the lanes the shots fly up; three cores, barrel lanes under the tellers and two high tripwires
    // taking turns on the Counting Floor; and the Mint Press (raid-legion-counting.js), whose two dies, shot standing in
    // their lanes while raised, open the counter, shot jumping in its lane. The waves run to about 28 s a room, their gaps
    // tightening from about 2 s to 1.2 s, and a guard comes every 4 s through the boss fight. A target that stands over a
    // door stands at 1.8 m, its box clear of the doorway (ROOM_DOOR) and still under a jump's shot. The wires keep the
    // stage specs' timing: the Gallery's live 2 s and dark 1.5 s, the Floor's two each live half the time, taking turns; the
    // sim's room grace (raid-sim.js TUNE.ROOM_GRACE) keeps them harmless while an Ooga that walked in under one walks out.
    parse({
      kind: "rooms", id: "counting", name: "The Counting House",
      rooms: [
        { // 0: the Lobby
          targets: [[4, 0.75, LEDGER_CORE, 0], [1.5, 1.25, WALL_TELLER, 0], [6.5, 1.25, WALL_TELLER, 0]],
          doors: [2.5, 5.5],
          waves: [
            [1, GUARD, 0], [3, COIN_BARREL, 1], [5, GUARD, 1], [7.5, COIN_BARREL, 0],
            [9, GUARD, 0], [11, GUARD, 1], [13, COIN_BARREL, 1], [15.5, GUARD, 0],
            [18, COIN_BARREL, 0], [20, GUARD, 1], [23, GUARD, 0], [25, COIN_BARREL, 1],
            [28, GUARD, 1]
          ],
          boss: false
        },
        { // 1: the Ledger Hall
          targets: [[2, 0.75, LEDGER_CORE, 0], [6, 1.5, LEDGER_CORE, 0], [4, 0.75, WALL_TELLER, 0], [4, 1.75, SENSOR, ITEM.AUTO]],
          doors: [1, 7],
          waves: [
            [0.5, GUARD, 1], [2, COIN_BARREL, 0], [3.5, GUARD, 0], [5, COIN_BARREL, 1],
            [6, GUARD, 1], [8, COIN_BARREL, 0], [9, GUARD, 0], [10.5, COIN_BARREL, 1],
            [12, GUARD, 1], [14, GUARD, 0], [15, COIN_BARREL, 0], [17, GUARD, 1],
            [19, COIN_BARREL, 1], [21, GUARD, 0], [23, COIN_BARREL, 0], [25, GUARD, 1],
            [27, GUARD, 0]
          ],
          boss: false
        },
        { // 2: the Tripwire Gallery, a low wire across the middle of the front line
          targets: [[1.5, 0.75, LEDGER_CORE, 0], [6.5, 0.75, LEDGER_CORE, 0], [4, 1.8, WALL_TELLER, 0]],
          doors: [4],
          wires: [[2.5, 5.5, 0.15, 2, 1.5, 0]],
          waves: [
            [1, GUARD, 0], [3, COIN_BARREL, 0], [5, GUARD, 0], [6.5, COIN_BARREL, 0],
            [8, GUARD, 0], [10, COIN_BARREL, 0], [11.5, GUARD, 0], [13, COIN_BARREL, 0],
            [15, GUARD, 0], [17, GUARD, 0], [18.5, COIN_BARREL, 0], [20, GUARD, 0],
            [22, COIN_BARREL, 0], [24, GUARD, 0], [26, COIN_BARREL, 0], [28, GUARD, 0]
          ],
          boss: false
        },
        { // 3: the Coin Chute, both cores high over the barrels' doors
          targets: [[3, 1.8, LEDGER_CORE, 0], [5, 1.8, LEDGER_CORE, 0], [1, 1, WALL_TELLER, 0], [7, 1, WALL_TELLER, 0], [4, 0.75, SENSOR, ITEM.RAPID]],
          doors: [3, 5],
          waves: [
            [0.5, COIN_BARREL, 0], [1.5, COIN_BARREL, 1], [3, GUARD, 0], [4, COIN_BARREL, 1],
            [5, COIN_BARREL, 0], [6.5, GUARD, 1], [7.5, COIN_BARREL, 0], [8.5, COIN_BARREL, 1],
            [10, GUARD, 0], [11, COIN_BARREL, 1], [12, COIN_BARREL, 0], [13.5, GUARD, 1],
            [15, COIN_BARREL, 0], [16, COIN_BARREL, 1], [17.5, GUARD, 0], [19, COIN_BARREL, 1],
            [20, COIN_BARREL, 0], [22, GUARD, 1], [24, COIN_BARREL, 0], [25, COIN_BARREL, 1],
            [27, GUARD, 0]
          ],
          boss: false
        },
        { // 4: the Counting Floor, guards from the outer doors and barrels down the tellers' lanes, high wires at either end
          targets: [[1.5, 0.75, LEDGER_CORE, 0], [4, 1.8, LEDGER_CORE, 0], [6.5, 0.75, LEDGER_CORE, 0], [2.75, 1.8, WALL_TELLER, 0], [5.25, 1.8, WALL_TELLER, 0], [4, 0.6, SENSOR, ITEM.AUTO]],
          doors: [0.5, 2.75, 5.25, 7.5],
          wires: [[0.5, 3, 0.6, 1.5, 1.5, 0], [5, 7.5, 0.6, 1.5, 1.5, 1.5]],
          waves: [
            [1, GUARD, 0], [2, COIN_BARREL, 1], [3, COIN_BARREL, 2], [4.5, GUARD, 0],
            [5.5, GUARD, 3], [7, COIN_BARREL, 1], [8.5, GUARD, 3], [9.5, COIN_BARREL, 1],
            [10.5, COIN_BARREL, 2], [12, GUARD, 0], [13, GUARD, 3], [14.5, COIN_BARREL, 2],
            [16, GUARD, 0], [17, COIN_BARREL, 1], [18, COIN_BARREL, 2], [19.5, GUARD, 0],
            [20.5, GUARD, 3], [22, COIN_BARREL, 1], [24, GUARD, 3], [26, COIN_BARREL, 1],
            [26, COIN_BARREL, 2], [28, GUARD, 0]
          ],
          boss: false
        },
        { // 5: the Mint Press, its dies low either side, its counter between them at jump height
          targets: [[2, 0.75, PRESS_DIE, 0], [6, 0.75, PRESS_DIE, 1], [4, 1.25, MINT_COUNTER, 0]],
          doors: [0.5, 7.5],
          waves: [
            [2, GUARD, 0], [6, GUARD, 1], [10, GUARD, 0], [14, GUARD, 1],
            [18, GUARD, 0], [22, GUARD, 1], [26, GUARD, 0], [30, GUARD, 1],
            [34, GUARD, 0], [38, GUARD, 1], [42, GUARD, 0], [46, GUARD, 1],
            [50, GUARD, 0], [54, GUARD, 1], [58, GUARD, 0]
          ],
          boss: true
        }
      ]
    }),
    parse({
      kind: "climb", id: "tower", name: "The Hashrate Tower", screens: HASHRATE_TOWER, start: { col: 7, row: 3 }, lockScreen: 9, spawner: { base: 216 },
      lifts: [[8, 3, 32, 40, 1, 1.2], [9, 3, 72, 80, 1, 1.2]],
      crumble: [[5, 10, 18], [6, 10, 48], [7, 12, 60], [5, 9, 94], [7, 11, 120]],
      gusts: [[84, 139, 0]],
      placed: [
        [12, 3, VENT, 0],
        [13, 5, CLERK, 0],
        [14, 9, CLERK, 0],
        [3, 13, SENSOR, ITEM.AUTO],
        [12, 17, CLERK, 0],
        [0, 20, CARRIER, ITEM.CORK],
        [1, 25, PRINTER, 0],
        [13, 25, CLERK, 0],
        [7, 31, VENT, 0],
        [14, 33, LOBBYIST, 0],
        [4, 41, CLERK, 0],
        [7, 45, SENSOR, ITEM.RAPID],
        [1, 47, LOBBYIST, 0],
        [14, 47, CLERK, 0],
        [8, 50, COIN_DRONE, 0],
        [10, 53, CLERK, 0],
        [2, 59, VENT, 0],
        [14, 63, LOBBYIST, 0],
        [4, 67, CLERK, 0],
        [0, 68, CARRIER, ITEM.FAN],
        [3, 71, BOND_MORTAR, 0],
        [1, 77, CLERK, 0],
        [14, 77, CLERK, 0],
        [13, 81, LOBBYIST, 0],
        [8, 83, SENSOR, ITEM.CLEAR],
        [13, 89, VENT, 0],
        [2, 93, CLERK, 0],
        [8, 95, COIN_DRONE, 0],
        [12, 97, CLERK, 0],
        [6, 99, LOBBYIST, 0],
        [0, 102, CARRIER, ITEM.BARRIER],
        [5, 103, VENT, 0],
        [12, 105, CLERK, 0],
        [1, 109, LOBBYIST, 0],
        [8, 112, COIN_DRONE, 0],
        [14, 115, CLERK, 0],
        [10, 117, VENT, 0],
        [3, 119, SENSOR, ITEM.BEAM],
        [13, 123, CLERK, 0],
        [8, 125, LOBBYIST, 0],
        [8, 136, BALLOON, 0]
      ]
    }),
    // Stage 4, The Treasury Vaults: eight rooms deeper in the Legion's bank, down to the Treasury floor where the Printer
    // King prints bill-bats (raid-legion-treasury.js). It builds on the Counting House with four new rules: shuttered cores
    // (wait for the shutter to roll up), twin cores on one yoke (one of the pair open at a time, swapping every 2 s),
    // searchlights sweeping the front line (stand still in a pool and a guard is called in) and guards dropping through
    // the ceiling hatch over a door. The Antechamber's one low shutter; the Twin Hall's pair and an AUTO sensor; the
    // Searchlight Gallery's two jump-height cores under a light, guards dropping from the middle hatch; the Shutter Bank's
    // three shutters out of step and a CLEAR sensor; the Drop Room's core at the top of a jump, guards dropping through two
    // hatches all through it, and a BARRIER sensor; the Twin Searchlights' jump-height pair between two lights and an AUTO
    // sensor (a fan, whose pellets mostly miss a back-wall box, would swell the Printer King by its strength); the Bullion Store's every rule at once, with a low tripwire across its middle and a RAPID sensor; and the
    // Printer King, whose three heads print bats, his core opening when they fall. Targets at jump height go from none in
    // the first room to five of six in the Bullion Store, and the waves' gaps tighten from 1.5 s to 1.25 s. Each back-wall
    // box stands clear of the others and of every door (ROOM_DOOR): the Shutter Bank's doors are at the wall's ends and its
    // sensor under its top shutter; the Drop Room's tellers stand outside its hatches; and the Bullion Store's doors stand
    // between its cores and the wire's span, its shutter and its sensor either side of the middle door, both still in the
    // span. The wire starts dark, since an Ooga walks into a room where it stood in the last.
    parse({
      kind: "rooms", id: "treasury", name: "The Treasury Vaults",
      rooms: [
        { // 0: the Antechamber, one shuttered core low in the middle, tellers high either side
          targets: [[4, 0.75, SHUTTER_CORE, 0], [2, 1.5, WALL_TELLER, 0], [6, 1.5, WALL_TELLER, 0]],
          doors: [1, 7],
          waves: [
            [1, GUARD, 0], [2.5, COIN_BARREL, 1], [4, GUARD, 1], [5.5, COIN_BARREL, 0],
            [7, GUARD, 0], [8.5, GUARD, 1], [10, COIN_BARREL, 1], [12, GUARD, 0],
            [13.5, COIN_BARREL, 0], [15, GUARD, 1], [17, GUARD, 0], [18.5, COIN_BARREL, 1],
            [20, GUARD, 1], [22, COIN_BARREL, 0], [24, GUARD, 0], [26, GUARD, 1],
            [28, COIN_BARREL, 0]
          ],
          boss: false
        },
        { // 1: the Twin Hall, twin cores at the ends, a pickup high in the middle
          targets: [[1.5, 1, TWIN_CORE, 1], [6.5, 1, TWIN_CORE, 1], [4, 0.75, WALL_TELLER, 0], [4, 1.75, SENSOR, ITEM.AUTO]],
          doors: [2.75, 5.25],
          waves: [
            [1, GUARD, 0], [2, COIN_BARREL, 1], [3.5, GUARD, 1], [4.5, COIN_BARREL, 0],
            [6, GUARD, 0], [7, GUARD, 1], [8.5, COIN_BARREL, 1], [10, GUARD, 0],
            [11, COIN_BARREL, 0], [12.5, GUARD, 1], [14, GUARD, 0], [15, COIN_BARREL, 1],
            [16.5, GUARD, 1], [18, COIN_BARREL, 0], [19.5, GUARD, 0], [21, GUARD, 1],
            [22.5, COIN_BARREL, 1], [24, GUARD, 0], [26, COIN_BARREL, 0], [28, GUARD, 1]
          ],
          boss: false
        },
        { // 2: the Searchlight Gallery, two cores at jump height under a light, guards dropping from the middle hatch
          targets: [[2.5, 1.25, LEDGER_CORE, 0], [5.5, 1.25, LEDGER_CORE, 0], [4, 2, SEARCHLIGHT, 0]],
          doors: [1, 4, 7],
          waves: [
            [1, GUARD, 0], [2.5, DROP_GUARD, 1], [4, COIN_BARREL, 2], [5.5, GUARD, 2],
            [7, DROP_GUARD, 1], [8.5, COIN_BARREL, 0], [10, GUARD, 0], [11.5, DROP_GUARD, 1],
            [13, COIN_BARREL, 2], [14.5, GUARD, 2], [16, DROP_GUARD, 1], [17.5, COIN_BARREL, 0],
            [19, GUARD, 0], [20.5, DROP_GUARD, 1], [22, COIN_BARREL, 2], [23.5, GUARD, 2],
            [25, DROP_GUARD, 1], [27, COIN_BARREL, 0], [28.5, GUARD, 0]
          ],
          boss: false
        },
        { // 3: the Shutter Bank, three shuttered cores out of step, so one is always about to open
          targets: [[1.5, 0.75, SHUTTER_CORE, 0], [4, 1.75, SHUTTER_CORE, 1], [6.5, 0.75, SHUTTER_CORE, 2], [2.75, 1.25, WALL_TELLER, 0], [5.25, 1.25, WALL_TELLER, 0], [4, 0.5, SENSOR, ITEM.CLEAR]],
          doors: [0.5, 7.5],
          waves: [
            [1, COIN_BARREL, 0], [2.5, GUARD, 1], [4, COIN_BARREL, 1], [5.5, GUARD, 0],
            [7, GUARD, 0], [8.5, COIN_BARREL, 1], [10, GUARD, 1], [11.5, COIN_BARREL, 0],
            [13, GUARD, 0], [14.5, GUARD, 1], [16, COIN_BARREL, 1], [17.5, GUARD, 0],
            [19, COIN_BARREL, 0], [20.5, GUARD, 1], [22, GUARD, 1], [23.5, COIN_BARREL, 0],
            [25, GUARD, 0], [26.5, COIN_BARREL, 1], [28, GUARD, 1]
          ],
          boss: false
        },
        { // 4: the Drop Room, a core at the top of a jump, guards dropping through two hatches all through the room
          targets: [[4, 2, LEDGER_CORE, 0], [1, 0.75, WALL_TELLER, 0], [7, 0.75, WALL_TELLER, 0], [4, 0.75, SENSOR, ITEM.BARRIER]],
          doors: [2, 6],
          waves: [
            [0.5, DROP_GUARD, 0], [1.5, DROP_GUARD, 1], [3, COIN_BARREL, 0], [4, DROP_GUARD, 1],
            [5, DROP_GUARD, 0], [6.5, COIN_BARREL, 1], [7.5, DROP_GUARD, 0], [8.5, DROP_GUARD, 1],
            [10, COIN_BARREL, 0], [11, DROP_GUARD, 1], [12, DROP_GUARD, 0], [13.5, COIN_BARREL, 1],
            [14.5, DROP_GUARD, 0], [15.5, DROP_GUARD, 1], [17, COIN_BARREL, 0], [18, DROP_GUARD, 1],
            [19, DROP_GUARD, 0], [20.5, COIN_BARREL, 1], [22, DROP_GUARD, 0], [23, DROP_GUARD, 1],
            [25, COIN_BARREL, 0], [26.5, DROP_GUARD, 1], [28, DROP_GUARD, 0]
          ],
          boss: false
        },
        { // 5: the Twin Searchlights, twin cores at jump height and a light in each top corner
          targets: [[2, 1.5, TWIN_CORE, 1], [6, 1.5, TWIN_CORE, 1], [1, 2, SEARCHLIGHT, 0], [7, 2, SEARCHLIGHT, 0], [4, 1, SENSOR, ITEM.AUTO]],
          doors: [3, 5],
          waves: [
            [1, GUARD, 0], [2.5, COIN_BARREL, 1], [4, DROP_GUARD, 1], [5.5, GUARD, 0],
            [7, COIN_BARREL, 0], [8.5, GUARD, 1], [10, COIN_BARREL, 1], [11.5, DROP_GUARD, 0],
            [13, GUARD, 0], [14.5, COIN_BARREL, 1], [16, GUARD, 1], [17.5, COIN_BARREL, 0],
            [19, DROP_GUARD, 0], [20.5, GUARD, 1], [22, COIN_BARREL, 1], [23.5, GUARD, 0],
            [25, COIN_BARREL, 0], [26.5, DROP_GUARD, 1], [28, GUARD, 1]
          ],
          boss: false
        },
        { // 6: the Bullion Store, cores at both ends, a shutter beside the middle door, high tellers and a low tripwire
          targets: [[1, 1, LEDGER_CORE, 0], [7, 1, LEDGER_CORE, 0], [5, 1.25, SHUTTER_CORE, 3], [2.5, 2, WALL_TELLER, 0], [5.5, 2, WALL_TELLER, 0], [3.1, 0.5, SENSOR, ITEM.RAPID]],
          doors: [2, 4, 6],
          wires: [[3, 5, 0.15, 1.5, 2, 1.5]],
          waves: [
            [0.5, GUARD, 0], [1.75, COIN_BARREL, 2], [3, DROP_GUARD, 1], [4.25, COIN_BARREL, 1],
            [5.5, GUARD, 2], [6.75, GUARD, 0], [8, GUARD, 0], [9.25, COIN_BARREL, 2],
            [10.5, DROP_GUARD, 1], [11.75, COIN_BARREL, 1], [13, GUARD, 2], [14.25, GUARD, 0],
            [15.5, GUARD, 0], [16.75, COIN_BARREL, 2], [18, DROP_GUARD, 1], [19.25, COIN_BARREL, 1],
            [20.5, GUARD, 2], [21.75, GUARD, 0], [23, GUARD, 0], [24.25, COIN_BARREL, 2],
            [25.5, DROP_GUARD, 1], [26.75, COIN_BARREL, 1], [28, GUARD, 2]
          ],
          boss: false
        },
        { // 7: the Printer King, three print heads (low, top and low) and the King's core under the top head
          targets: [[1.5, 0.75, PRINT_HEAD, 0], [4, 1.75, PRINT_HEAD, 1], [6.5, 0.75, PRINT_HEAD, 2], [4, 0.75, PRINTER_KING, 0]],
          doors: [0.5, 7.5],
          waves: [
            [3, GUARD, 0], [7, GUARD, 1], [11, GUARD, 0], [15, GUARD, 1],
            [19, GUARD, 0], [23, GUARD, 1], [27, GUARD, 0], [31, GUARD, 1],
            [35, GUARD, 0], [39, GUARD, 1], [43, GUARD, 0], [47, GUARD, 1],
            [51, GUARD, 0], [55, GUARD, 1], [59, GUARD, 0]
          ],
          boss: true
        }
      ]
    }),
    // Stage 5, The Lightning Factory Floor: belts back on screens 1, 6 and 9 and forward into the hatch at
    // columns 74 and 75 on screen 4, each on the floor's top row (row 2); five pickups; and the Grid Warden's record on
    // the lock screen, which comes into view three metres before the scroll locks, as the vault's does.
    parse({
      kind: "side", id: "factory", name: "The Lightning Factory Floor", rows: LIGHTNING_FACTORY, start: { col: 3, row: 12 }, lockScreen: 11, spawner: { base: 208 },
      belts: [[16, 31, 2, -0.9], [64, 73, 2, 0.9], [101, 111, 2, -0.9], [144, 153, 2, -0.9]],
      placed: [
        [20, 3, CLERK, 0],
        [27, 5, SENSOR, ITEM.AUTO],
        [39, 3, ENEMY.TAX_COLLECTOR, 0],
        [41, 5, CLERK, 0],
        [54, 3, ENEMY.ARC_PYLON, 0],
        [60, 10, CARRIER, ITEM.CORK],
        [67, 3, ENEMY.AUDITOR, 0],
        [76, 5, LOBBYIST, 0],
        [83, 7, CLERK, 0],
        [87, 5, ENEMY.ARC_PYLON, 0],
        [94, 5, ENEMY.ARC_PYLON, 0],
        [104, 3, ENEMY.AUDITOR, 0],
        [106, 7, SENSOR, ITEM.RAPID],
        [118, 3, ENEMY.TAX_COLLECTOR, 0],
        [123, 5, CLERK, 0],
        [124, 10, CARRIER, ITEM.FAN],
        [129, 3, ENEMY.TAX_COLLECTOR, 0],
        [131, 8, COIN_DRONE, 0],
        [136, 3, ENEMY.AUDITOR, 0],
        [139, 5, BOND_MORTAR, 0],
        [147, 3, ENEMY.ARC_PYLON, 0],
        [148, 7, SENSOR, ITEM.BARRIER],
        [155, 3, ENEMY.ARC_PYLON, 0],
        [158, 5, LOBBYIST, 0],
        [164, 3, ENEMY.AUDITOR, 0],
        [168, 7, COIN_DRONE, 0],
        [172, 3, CLERK, 0],
        [186, 3, ENEMY.GRID_WARDEN, 0]
      ]
    }),
    // Stage 6, Mempool Lake (raid-legion-lake.js's fee eels and Backlog Leviathan). Eels and the Leviathan stand in the
    // cell over their pool's drawn low water. The repo truck parks clear of the ledge at columns 156 to 159. `art` names
    // the screens the art dresses as the tunnel and the cliff steps (raid-art-lake.js reads them; the grid carries
    // neither), kept beside the parsed stage, which has no field for them.
    Object.freeze({
      ...parse({
        kind: "side", id: "mempool", name: "Mempool Lake", rows: MEMPOOL_LAKE, start: { col: 3, row: 12 }, lockScreen: 11, spawner: { base: 200 },
        tide: {
          basins: [[21, 24, 0, 2], [52, 65, 0, 2], [98, 107, 2, 4], [135, 146, 0, 2], [180, 186, 0, 2]],
          floats: [[23, 23], [55, 56], [59, 60], [63, 64], [99, 99], [106, 106], [137, 138], [141, 142], [145, 145], [182, 182], [185, 185]]
        },
        placed: [
          [20, 3, CLERK, 0],
          [22, 1, ENEMY.FEE_EEL, 0],
          [28, 5, SENSOR, ITEM.AUTO],
          [36, 5, LOBBYIST, 0],
          [42, 3, ENEMY.TAX_COLLECTOR, 0],
          [46, 10, CARRIER, ITEM.CORK],
          [50, 3, ENEMY.AUDITOR, 0],
          [57, 1, ENEMY.FEE_EEL, 0],
          [61, 1, ENEMY.FEE_EEL, 0],
          [64, 9, COIN_DRONE, 0],
          [71, 5, CLERK, 0],
          [78, 3, ENEMY.AUDITOR, 0],
          [84, 3, ENEMY.TAX_COLLECTOR, 0],
          [86, 5, LOBBYIST, 0],
          [92, 3, SENSOR, ITEM.RAPID],
          [94, 5, CLERK, 0],
          [100, 3, ENEMY.FEE_EEL, 0],
          [104, 3, ENEMY.FEE_EEL, 0],
          [105, 7, CLERK, 0],
          [118, 5, ENEMY.AUDITOR, 0],
          [124, 10, CARRIER, ITEM.FAN],
          [125, 7, BOND_MORTAR, 0],
          [129, 7, CLERK, 0],
          [136, 1, ENEMY.FEE_EEL, 0],
          [140, 1, ENEMY.FEE_EEL, 0],
          [140, 9, COIN_DRONE, 0],
          [144, 1, ENEMY.FEE_EEL, 0],
          [150, 3, ENEMY.TAX_COLLECTOR, 0],
          [157, 5, LOBBYIST, 0],
          [158, 3, ENEMY.REPO_TRUCK, 0],
          [163, 5, SENSOR, ITEM.BARRIER],
          [167, 7, CLERK, 0],
          [170, 3, ENEMY.TAX_COLLECTOR, 0],
          [174, 3, ENEMY.AUDITOR, 0],
          [183, 1, ENEMY.LEVIATHAN, 0]
        ]
      }),
      art: Object.freeze({ tunnel: Object.freeze([5, 6]), cliff: Object.freeze([7, 8]) })
    }),
    parse({
      kind: "side", id: "bifrost", name: "Bifrost Pass", rows: BIFROST_PASS, start: { col: 3, row: 12 }, lockScreen: 13, spawner: { base: 192 },
      gusts: [[48, 111, -1], [160, 191, -1]],
      placed: [
        [18, 3, CLERK, 0],
        [25, 5, ENEMY.SHARD_THROWER, 0],
        [29, 7, SENSOR, ITEM.AUTO],
        [35, 5, ENEMY.TAX_COLLECTOR, 0],
        [41, 8, ENEMY.ICICLE, 0],
        [44, 7, ENEMY.SHARD_THROWER, 0],
        [46, 10, CARRIER, ITEM.CORK],
        [50, 7, LOBBYIST, 0],
        [56, 9, COIN_DRONE, 0],
        [61, 9, COIN_DRONE, 0],
        [67, 7, ENEMY.AUDITOR, 0],
        [71, 9, LOBBYIST, 0],
        [75, 7, ENEMY.TAX_COLLECTOR, 0],
        [78, 7, CLERK, 0],
        [84, 7, BOND_MORTAR, 0],
        [88, 5, ENEMY.SHARD_THROWER, 0],
        [93, 3, ENEMY.AUDITOR, 0],
        [98, 3, SENSOR, ITEM.RAPID],
        [104, 5, CLERK, 0],
        [109, 3, ENEMY.TAX_COLLECTOR, 0],
        [116, 8, ENEMY.ICICLE, 0],
        [117, 3, ENEMY.SHARD_THROWER, 0],
        [119, 8, ENEMY.ICICLE, 0],
        [124, 5, LOBBYIST, 0],
        [130, 10, CARRIER, ITEM.BARRIER],
        [134, 5, ENEMY.SHARD_THROWER, 0],
        [140, 7, CLERK, 0],
        [146, 7, PRINTER, 0],
        [146, 9, SENSOR, ITEM.FAN],
        [158, 7, ENEMY.REPO_TRUCK, 0],
        [161, 7, LOBBYIST, 0],
        [166, 9, COIN_DRONE, 0],
        [171, 9, ENEMY.SHARD_THROWER, 0],
        [174, 9, COIN_DRONE, 0],
        [181, 7, ENEMY.AUDITOR, 0],
        [186, 5, ENEMY.TAX_COLLECTOR, 0],
        [190, 3, SENSOR, ITEM.CLEAR],
        [196, 10, CARRIER, ITEM.BEAM],
        [198, 5, CLERK, 0],
        [202, 3, ENEMY.SHARD_THROWER, 0],
        [205, 3, ENEMY.TAX_COLLECTOR, 0],
        [218, 3, ENEMY.MECH, 0]
      ]
    }),
    // Stage 8, The Reserve: the last stage, shorter than stage 7 and denser, with the lowest spawner base. Its rams
    // (raid-legion-reserve.js) slam the floor each stands on, their feet clear of every ledge; a belt runs back on screen
    // 2 and one forward on screen 6; the paper storm blows left over screens 4 to 6; the Chairman's lift carries the Ooga
    // up to the gallery; and the Chairman's Engine waits on the lock screen. Three weapons and two extras are handed out,
    // none after screen 6.
    parse({
      kind: "side", id: "reserve", name: "The Reserve", rows: THE_RESERVE, start: { col: 3, row: 12 }, lockScreen: 9, spawner: { base: 184 },
      belts: [[32, 42, 2, -0.9], [96, 111, 2, 0.9]],
      gusts: [[64, 111, -1]],
      lifts: [[133, 3, 2, 8, 1.0, 1.5]],
      placed: [
        [12, 5, CLERK, 0],
        [18, 5, SENSOR, ITEM.AUTO],
        [24, 3, ENEMY.RAM, 0],
        [29, 3, ENEMY.AUDITOR, 0],
        [34, 3, ENEMY.TAX_COLLECTOR, 0],
        [38, 7, LOBBYIST, 0],
        [44, 5, CLERK, 0],
        [47, 3, PRINTER, 0],
        [52, 5, ENEMY.AUDITOR, 0],
        [53, 5, ENEMY.RAM, 0],
        [58, 10, CARRIER, ITEM.CORK],
        [60, 7, SENSOR, ITEM.RAPID],
        [66, 5, ENEMY.TAX_COLLECTOR, 0],
        [69, 7, LOBBYIST, 0],
        [75, 5, ENEMY.AUDITOR, 0],
        [78, 7, CLERK, 0],
        [85, 5, CLERK, 0],
        [89, 9, LOBBYIST, 0],
        [90, 10, CARRIER, ITEM.FAN],
        [93, 5, BOND_MORTAR, 0],
        [100, 5, SENSOR, ITEM.BARRIER],
        [104, 3, ENEMY.AUDITOR, 0],
        [108, 8, COIN_DRONE, 0],
        [116, 3, ENEMY.RAM, 0],
        [120, 3, ENEMY.TAX_COLLECTOR, 0],
        [124, 3, ENEMY.RAM, 0],
        [126, 9, COIN_DRONE, 0],
        [130, 3, CLERK, 0],
        [138, 9, PRINTER, 0],
        [141, 7, ENEMY.AUDITOR, 0],
        [154, 3, ENEMY.CHAIRMAN_ENGINE, 0]
      ]
    }),
  ]);

  // Small stages of the other kinds for the suite's checks, never played: a three-screen scaffold climbed by ledges
  // that step from side to side, with a post on the middle screen and a deck at the top; and two rooms and a boss room,
  // each core and teller low on the back wall where a standing Ooga's shot meets it, and no door in a core's lane.
  const TEST = Object.freeze({
    climb: parse({
      kind: "climb", id: "test-climb", name: "Test Climb", start: { col: 3, row: 3 }, lockScreen: 2, spawner: { base: 0 },
      screens: [
        [ // 0: the foot of the scaffold; the Ooga drops in at column 3
          "................",
          ".........=====..",
          "................",
          "...=====........",
          "................",
          "........=====...",
          "................",
          "..======........",
          "................",
          ".........=====..",
          "................",
          "################",
          "################",
          "################"
        ],
        [ // 1: more ledges and a post on the right
          "................",
          "..======........",
          "................",
          ".........=====..",
          "................",
          "...=====........",
          "..............##",
          "........=====.##",
          "................",
          "..======........",
          "................",
          ".........=====..",
          "................",
          "...=====........"
        ],
        [ // 2: a ledge out to the right and the deck over it, where the scroll locks
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "....########....",
          "................",
          "............====",
          "................",
          "........=====..."
        ]
      ],
      placed: [
        [11, 5, CLERK, 0],
        [4, 19, SENSOR, ITEM.AUTO],
        [7, 33, PRINTER, 0]
      ]
    }),
    rooms: parse({
      kind: "rooms", id: "test-rooms", name: "Test Rooms",
      rooms: [
        {
          targets: [[2, 0.75, LEDGER_CORE, 0], [4, 0.75, WALL_TELLER, 0], [6, 0.75, LEDGER_CORE, 0]],
          doors: [1, 5],
          waves: [[1, GUARD, 0], [2, COIN_BARREL, 1], [4, GUARD, 1], [5, COIN_BARREL, 0]],
          boss: false
        },
        {
          targets: [[1.5, 0.75, WALL_TELLER, 0], [4, 0.75, LEDGER_CORE, 0], [6.5, 0.75, WALL_TELLER, 0]],
          doors: [2.5, 5.5],
          waves: [[0.5, COIN_BARREL, 0], [1.5, GUARD, 1], [3, GUARD, 0], [4.5, COIN_BARREL, 1]],
          boss: false
        },
        {
          targets: [[2.5, 0.75, LEDGER_CORE, 0], [5.5, 0.75, LEDGER_CORE, 0]],
          doors: [1, 4, 7],
          waves: [[1, GUARD, 1], [2, COIN_BARREL, 0], [3, COIN_BARREL, 2], [5, GUARD, 1]],
          boss: true
        }
      ]
    })
  });

  BL.raidStages = { KIND, ENEMY, ITEM, CELL, SCREEN_W, SCREEN_H, ROOM_W, ROOM_H, ROOM_FRONT, ROOM_REACH, ROOM_DOOR, STAGES, TEST, parse, cellAt, validate };
})();
