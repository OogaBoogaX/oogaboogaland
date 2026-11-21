# The island's world on the server

The island's Oogas nobody drives run today on one elected browser page, the room's NPC host (`npc-sync.js`).
Every other signed-in page follows that host's frames. This moves them onto the server, the way the ghost hunt
moved (`docs/game-host.md`). One Durable Object runs their routine, and every signed-in page follows it. Players
stay out of it: each page still owns its own Ooga, and the room still relays it.

## Why

A browser host costs every follower its own frame time and its tab's whims. A hidden or busy host stalls the
crew, a host that leaves hands the crew over mid-walk, and a host on another build leaves its followers frozen.
The ghost hunt showed what a server host gives instead: one clock, frames that arrive evenly, and nobody's tab in
the way.

## What runs where

| Piece | Where | What it does |
|---|---|---|
| `src/js/island-layout.js` | page and Worker, baked | The hub's routine tables: the meadow's paths, fire seats, stroll spots, each work cave's fan of places that every Ooga may shoot from, and the sealed caves' fronts. `scripts/island-layout.mjs` bakes it from the real hub in the suite's Chrome, because those tables depend on props and geometry only the page builds. The hub's "island layout" check fails when the hub and the file disagree. |
| `src/js/island-sim.js` | page and Worker | The passive routine (below) over those tables, with no terrain, props or collision. It runs fixed 50 ms steps, is seeded and allocates nothing per step. Its output is one `game-wire.js` row per Ooga. |
| `worker/src/games/island.js` | Worker | Kind `island`, venue `main`, on `game-host.js`. It takes the cast from `characters.gen.json`, and states and caves from Oogatron's stats through the `OOGATRON` binding, read every minute while it runs, as a page polls them. Until the first reading it starts from the snapshot every deploy bakes into the page (`jumbotron-data.js`), as a page does, so a world that cannot reach Oogatron shows what a page would. The snapshot stays the page script the bot rebakes; the Worker lends it a `window` for its evaluation alone (`lend-window.js`, `return-window.js`). It sends motion at 10 Hz, skips frames while nothing moves (at most 2 s apart), and sends the cast's names as its state. It runs only while a page follows it, and keeps no record: a restart starts the routine afresh. |
| `src/js/island-world.js` | page | Follows the world on the island, behind `?islandworld=1` for now (next section). |

### The routine

This reproduces the hub crew's passive routine (`npcPassive` in `crew.js`, mapped in this PR's notes):

- **Working.** The Ooga takes the caves it is active at in turn. On each trip it walks out along the meadow
  planner's paths (`npc-paths.js` `fixed`, the same planner) to the cave's trail, then straight to the first free
  place in the cave's fan. It aims, fires a magazine (10 bursts, 0.44 s apart) and walks back to the nearest free
  slot of the reload fan round the pile. There it eats the magazine back (6 s). The moment its contributor stops
  being active at a cave, it heads back. Walking speed is 2.8 m/s.
- **Chilling.** The Ooga idles a staggered 120–240 s at a fire seat, a spot by the HQ ramps or a meadow spot, then
  strolls to another at 1.3–1.8 m/s. Nobody idles inside a working cave's zone or within the pile's ring. A worker
  that stops working walks back by its cave's trail and round the pile first.
- **Sleeping and away.** Nothing is shown. The page's own crew beams a sleeper into its bed, which it chooses
  deterministically, as it does today.
- Every other change of state is a beam, as the passive crew's is.

### The row

Each row is a `game-wire.js` row: type 0, the Ooga's roster index, the low 16 bits of its name's hash, then x and
z. **y carries the cave its gorilla goes ahead to, plus one, in metres**; the page stands the Ooga on its own
ground. Then come the heading and the flags. The flags hold what the Ooga does in the low three bits (hidden,
stand, sit, walk, aim, fire, reload), its state in the next two, and the cave it works, plus one, in the top
three. A frame for 60 Oogas is about 750 bytes.

## Known approximations

- **The pile's size.** The ring, reload fan and starting spots depend on the pile's platform radius. The server
  reads the pile from bananapayserver (its `pile` message, `{ bananas, at, eatPerHour }`) through the `DONATIONS`
  binding when the world starts and every 5 minutes while it runs, and sizes it from a table baked from the hub
  (`island-layout.js` `pile`). Between donations the pile only shrinks at its stated rate, so a reading is exact
  until the next donation, and at most 5 minutes behind after one. Without the binding (donations simulated) it keeps
  a nominal pile (`PLATFORM`, 2.4 m, about 30,000 bananas). A signed-out page's own world takes the page's pile.
- **The gorillas.** On a page, a worker waits to fire until its gorilla is in the cave. The server cannot see the
  gorillas, so its workers fire on their own schedule. Pages still run their own gorillas from the trips each row
  names.
- **Static checks only.** Spots and places are baked with the checks that never change. The loose props' and other
  bodies' checks are left out, so an Ooga can stand where a knocked-over prop now lies.
- **Night.** At night the page crew leans towards the fire (`RENDER_OPTS.stars`). The server keeps no visitor's
  hour, so it does not.

## The page

`island-world.js` runs in the hub while `?islandworld=1` is set:

- **Signed in, with the Worker offering `island`.** It follows the server's world over `game-net.js`.
- **Otherwise.** It runs `island-sim.js` itself, from the page's own contributors (`stateFor`) and the crew's own
  cave rule (`siteActive`). The crew has already placed its Oogas by then, so each Ooga the crew shows goes to the
  world only once the crew has placed it, with where it stands (`place`): the world takes it up from there, and a
  chiller on a seat or spot stays on it. One the crew has not placed within 2 s goes regardless. Its rows are ignored
  until then, so it is never hidden as away meanwhile.

Either way the rows go into one `game-timeline.js` and are drawn 150 ms behind the newest (two steps behind for the
local world), eased between frames, as the ghost hunt draws.

Each Ooga is then handled according to its row:

- **Working or chilling, and shown.** The Ooga is followed. `island-world.js` writes its `follow` (where it stands,
  its heading, what it does, the cave it works) before the crew's update. The crew's `runFollow` then poses it with
  the crew's own code: `walkPose` for walking, the idle pose for standing and sitting (with its lines and the
  donation cheer), and for working, aiming into the cave, `fireWeapon`'s bursts there, and `startReload` at the
  pile. Its tint, nunchaku, pumpkin glow and weapon pose come from the crew's per-frame update as they always have.
  There is one way of posing an Ooga, the crew's, so nothing has to be kept in step by hand.
- **Sleeping or away.** The Ooga takes the row's state as `worldState`, which `stateOf` reads first. The page's own
  crew beds a sleeper and hides the away, as it always has. An Ooga leaving bed is beamed to its routine
  (`refreshStates`) before it is followed.
- **Gorillas.** Each working Ooga's gorilla is told the cave it goes ahead to, whenever that changes.

While the world runs, a page never follows the room's crew host (`npc-sync.js`), since the world places its
Oogas. While it is the host itself, it goes on sending the crew as the world moves it, so pages without the world
see the same crew. The props still sync through the room's host (`prop-sync.js`).

### Left to do

- **Turning it on.** Make it the default, and retire `npc-sync.js` for the Oogas, once play-testing says so.

## Cost

A page follows the world only while it is on the island. The object is awake while any page follows. It sends one
encoded frame to every follower each tick that something moved: about 7.5 KB/s a follower while the crew walks,
nothing while it does not. Nothing is written to storage (`game-host.js` skips the write for a game that keeps no
record). Oogatron is read once a minute while the world runs.
