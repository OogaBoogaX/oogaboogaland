# Block Frenzy

Capture the flag on Fort Chaos, Bitcoin themed, reached down Ooga Arcade's upper hall, by zipline (and directly at `/blockfrenzy`).
Each side guards its Bitcoin block, a glowing cube in its team's colour on a stand inside its fort. Steal the other
side's block, carry it home and touch your own stand while your own block is home. Two Oogas a side: the visitor and
a teammate against two rivals, the three bots run by the rules module. First to three captures wins. Nobody dies,
nobody loses health and nobody is removed: paint wears off.

Solo by default. Signed-in Oogas can also play together: see Live rounds below.

## Files

| File | Job |
|---|---|
| `block-sim.js` | The rules as pure functions, no DOM or scene: the arena, actors, blocks, throws, crates, quiz traps, weather and bots, on a 1/120 s fixed step that allocates nothing. Seeded, so a seed replays a round. |
| `block-trivia.js` | 35 multiple-choice Bitcoin questions, each with a one-line fact, for the quiz traps. |
| `block-models.js` | Cached geometry: Fort Chaos, the stands, the two team blocks, crates, paint balls, grenades, rockets, nets, splats, quiz pads and bubbles, rain. |
| `scene-block.js` | The scene: the side and Ooga picker, the round, the HUD, the cameras, the quiz card and the trophy screen. Registers `BL.scenes.block`. |

Shared files touched, each by the smallest change: `arcade-models.js`, `arcade-scene-models.js` and `scene-arcade.js` (the entry hall: `BLOCK_HALL`, its walk, sight and light, and its zipline off the ledge; the stage stays rock's four cabinets, and the Rally poster moved just beside the mouth),
`game.js` (a `block` save slot: rounds, wins, fastest win, validated on load), `routes.js` (`/blockfrenzy`),
`director.js` (`block` in the debug handle list; `runsBehindPanels`, an opt-in that keeps a live session stepping behind the controls panels with the player's Ooga idle), `src/index.html` (script tags, the nav, `#block` and its title
card), `src/style.css` (the game's panels, appended), `test/run.mjs` (rules in the global tier, a `block` scene) and
`AGENTS.md` (the module and test rows).

## Rules

- **Blocks.** Touch the rivals' block, on its stand or wherever it lies, to carry it. A carrier who is splatted,
  trapped or drops it (`K`) leaves it where they stood, and it stays there, as long as it takes: the carrier's
  teammates can grab it and run on, and its own side must pick it up and carry it all the way back to its stand.
  A loose block always comes to rest on open ground the bots can reach (`restSpot`): dropped or landing on a roof or the
  centre deck, it ends on the ground under it or nearest it.
  A carrier can't pick the same block up again until they have left its circle.
- **Scoring.** Their block onto your stand while your own block is home. Reaching your stand while yours is away
  scores nothing yet (a NOT YET! banner says why), and a carrier who waits there scores the moment it returns.
- **Passing.** `Tab` (or `T`, or the Pass button) throws the carried block about 12 m ahead in an arc. Anyone who
  could pick it up can catch it in the air, so a teammate can take a pass and a rival can intercept. Uncaught, it
  lands and lies as a dropped block. Bots pass when a rival closes in and a free teammate stands nearer home.
- **Tools.** Paint without end; three paint grenades (lobbed, burst on landing), one paint rocket (straight, bigger
  burst) and three nets (slow a rival and stop their jumps for 4 s). A paint hit or burst splats a rival for 2 s, then
  2.5 s of protection. Grenades, rockets and nets refill on your own stand.
- **Crates.** Wooden crates anyone can push by walking into them, stand on, pick up (`F`), carry overhead, set down
  or stack three high (`F` again), or throw (click): a thrown crate that hits a rival stuns them as paint does (BONK!),
  then lands as a crate. Each fort starts with some, each Ooga
  has three to place (`B`) on its own half, and a round opens with 20 s of fortifying with each side kept to its own
  half and the blocks locked: the bots plug their gates three deep and block their alleys, so getting in takes a push,
  a double jump over the wall, or the alley behind the fort. No crate lands on a stand.
- **Quiz traps.** Eight green Matrix pads. Step on one and a bubble closes round you: you can't move, throw, pick up or
  score, a carrier drops the block, and nobody can paint you. Answer a Bitcoin question to break out; a wrong answer
  locks the card for 2.5 s and brings another question; the bubble wears off by itself after 25 s. Bots "think" for a
  seeded 3.5 to 8 s.
- **Trees (Gorilla Jungle).** Every canopy has a one-way ledge at its leaves' top: fly or jump up through the leaves
  from below, and come down on top to stand there. The leaves themselves stay decor, so nobody hides inside them, and
  the chase camera comes in front of (or over) leaves as it does walls. The two trees before each sniper tower stand
  low (3.5 m), so the scope sees over them.
- **Weather.** A seeded run of clear and stormy spells. Storms darken the light and bring rain and lightning.
- **Movement.** Jump, and jump again in the air: a double jump reaches 2.55 m and clears the forts' 2.4 m walls, the
  stilt huts' floors and the centre deck, carrying or not. Shift sprints for up to 4 s, refilling after a rest. C
  crouches: slower, shorter, under chest-height paint.

## Play-test additions

Each map has its own time of day and weather mix (`MAP_WEATHER`, seeded): Fort Chaos at sunset, Ooga Town at midday, Gorilla Jungle cloudy and always raining with puddles that slip you, Haunted Hollow at night on a brick field. Storms warn a spot and then strike whoever stays with lightning (`bolt`), once per `BOLT_COOL` each. A busy network (fees at the storm rate) brings a storm over a map's own weather; calmer fees change nothing. Haunted Hollow has lamps, neon on the cave walls, a few open graves to fall in and step out of with a skeleton and a ghost. The Detail setting on the menu turns off foliage, rain, lightning effects and that dressing; the rules stay. `N` hides the mini-map, `?` or Help opens the in-play help. Ooga Town's block stand is at the back of its building, under the upper floor. Haunted Hollow's scoring ring is out behind each house at the back of the map, its tall iron gate is solid with the way round either end, and its open graves are too deep for one jump: a double jump, the jetpack or the hook gets you out.

## Towers, ziplines and ammo caches

- **Sniper towers.** One beside each end on every map: four posts, an open platform 6.4 m up (`TOWER_TOP`) with a
  parapet, and a ladder up its inward side (a climb zone, not a block). Standing on either tower's platform puts
  the sniper rifle within reach as one more weapon (`5` or `G`); nothing changes by itself on arrival. The rifle fires only from a platform: fast, flat and long
  (60 m/s, semi-automatic: a shot a click, 0.35 s apart, no ammunition). With it out, right click brings up a first-person
  scope with four zoom steps (34°, 20°, 11° and 6° of view; right click, wheel, two-finger swipe or `+` `−`), and stepping off the platform with it out restores the
  tool you had and any view the scope changed. The results card names the round's longest sniper hit.
- **Ziplines.** Each tower's cable leaves from the platform's ladder side and runs down into the other end. `Space` (or the
  Zip button) by the cable rides it at 15 m/s, hands on the cable; at its end, or on a jump, you let go and fall. From
  your own tower it is a raid into their fort; with their block in hand, their tower's line takes you home. Closed
  while fortifying and while holding a crate. A carrier who climbs their tower keeps the rifle on `5` and is told the
  zipline is the way home.
- **Ammo caches.** Five on Fort Chaos (each stilt hut's floor and the centre deck; the other maps place their own).
  Walking onto one refills grenades, rockets, nets and the crate stock as your stand does, then it goes dark for 15 s
  (`CACHE_S`). A real Bitcoin block found while you play makes every cache and quiz pad ready again.

## Held weapons

Keys `1` to `7` pick paint, grenade, rocket, net, sniper rifle, Golden Dual AKs and Ooga AK; `G` cycles through the
ones you can use.

- **Ooga AK** (`7`). The island's rifle: a tap fires one round, a held trigger fires on full auto every 0.09 s, from a
  30-round magazine that reloads itself in 1.4 s when it runs dry.
- **Golden Dual AKs** (`6`). One in each hand, full auto, both firing every round, never empty. Two pairs a round:
  scoring a capture wins a pair while any are left, and a wallet bomb stuck on whoever holds a pair takes it when it
  goes off.
- **Sniper rifle** (`5`). Tower-only, above.

Paint balls, the AKs and the rifle splat as paint does; nobody is removed and nobody has health.

## Floating islands (BF2.1)

Every map is an oval floating island in OBL's voxel style (`W`, `L` its half sizes, a good way past the playing field `fieldW`, `fieldL`; `onIsland`, `edgeDist`), with a grass-and-rock cliff around its open edge, the rock under it deepening toward the middle (`isleDepth`, the same function the mesh uses), the hub's clouds beneath it and the sea far below at the hub's height. Walking or being blown off an edge drops an Ooga past the rim: its feet below `RIM` the island no longer holds it, and the rock under the rim keeps it out. Every Ooga has its jetpack: hold Space in the air (or Jump on touch) and steer back over the edge. An Ooga that falls past `FALL_FLOOR` (40 m) comes back in its own block zone with a full tank and a moment's protection. A block carried over the edge drops at the edge the carrier left it (`EDGE_HOME_S` later it goes home by itself unless someone picks it up); a grappling hook lost over the edge goes back into hiding. Bots fly back the same way. A carrier flung by the other side's catapult keeps the block through the flight (`flung`): back on the island it is still theirs; fallen all the way, it falls with them and goes straight back to its stand rather than dropping at the edge.

## Terrain (BF2.1b)

Each map has hub-style terrain in the island's own rock (`terrain`, half a map turned half round so the maps stay mirrored), the map's own pieces and, round every field, `ringTerrain`'s massifs: walk-through caves that join up (flanks and behind each fort, `massif`), cliffs (`cliff`), and more mounds and outcrops. The pieces: a two-tier grassy mound (`mound`: 1 m then 2 m, each a jump up, for high ground), a walk-through rock cave (`cave`: 3 m wide, walls and a roof to stand on, cover and a flanking way, never a dead end), and a tall outcrop breaking a long lane (`outcrop`), mossy boulders from the hub's kit at its foot. They stand on a half-metre grid so the voxel island meshes exactly what the sim collides with (`rocks`, joined to `BLOCKS`), clear of every fort, stand, catapult, ladder, zipline and spot the game uses; the bots steer round them as they do any building.

## The grappling hook (BF2.1c)

A special weapon, two a round, hidden at seeded spots from each map's hand-checked `hookSpots` (in the cave, on the mound's top, behind the outcrop, up a jungle tree): one in each half, the same spot turned half round. Walk over one to take it (it shows on the hip); `R` or tool `8` then fires it at the crosshair (range 24 m). Cloud Hopper's hook head, rope and flight (`BL.grapple.toward`, shared; the sim keeps its own state, `hk`): a bite on rock, a tree, a wall or the island's edge pulls the Ooga in on a rope that only shortens (`BL.grapple.pullSpeed` and `tether`), swinging it under the bite (hold C to stop the pull and swing), until it arrives or lets go (R again, or a jump), keeping its speed. A block, on its stand, loose or held by a rival (after a moment's warning, `hookwarn`), is pulled in along the rope into the thrower's hands: the rival block is carried, your own loose block goes home, as touching them would; hands already full, it lands on reachable ground beside them. Anything else the hook meets that is not an Ooga pulls the Ooga to it. A teammate is ignored and the hook can miss; it then recharges for `HOOK_COOL`. A gorilla hooked is stunned and drops its captive, with a cooldown before the hook can do that again. It can be stolen with a wallet bomb exactly as the Golden AKs are (`hooksteal`), and bots fetch the ground-level ones, hook carriers and captors in reach, and bite the rim to pull themselves back after a fall; expert bots aim wallet bombs at hook holders.

## Gorillas (BF2.2, BF2.3)

Three or four on every map (`gorillas`): wicked's hub gorilla (`BL.agent.create` managed rig, posed with `poseManaged` and its `dragging`/`throwProgress` motion flags). A gorilla roams its home, charges an Ooga on the ground that comes within sight and grabs it, the block (and any crate) dropping where it was grabbed. It then drags the captive by the leg down a route round the terrain (`dragFor`, worked out once a map) to the nearest edge it can throw from, winds up and throws it off, released past the rim (`thrown`), and the Ooga jetpacks back (its tank is filled for the throw). A captive fills a struggle meter (`grabFill`, shown on screen while held): each distinct press (Space, E, Enter, a click or a tap, never a held key) adds one, it drains over time, and full breaks free at any point. Only that or the hook (which stuns the gorilla, with a cooldown) frees a captive; paint and bursts stun a free gorilla but never a grip. Bots mash by the same rule at their skill's rate, shoot a charging gorilla and fly back.

| `SKILLS[k].gorilla` | sight | charge | reach | drag | rest s | need | drain /s | bot mash /s |
|---|---|---|---|---|---|---|---|---|
| easy | 6 | 6.5 | 1.05 | 6 | 9 | 6 | 0.8 | 3.5 |
| normal | 8 | 8 | 1.2 | 7.5 | 6 | 10 | 1.4 | 5 |
| hard | 10 | 9.5 | 1.35 | 8.5 | 4 | 15 | 2 | 6.5 |
| expert | 12 | 11 | 1.5 | 9.5 | 2.5 | 22 | 2.4 | 9 |

## Fort Chaos

44 by 74 m, mirrored half round between the halves so neither side is favoured. Each fort has a back wall, side
walls and a gated front wall, 2.4 m high, a stand inside and an alley behind with a crate to climb from. Between
them: tall banded walls across the approach to break the long sight line, low cover, side rocks, a stilt hut on each
side of each half (a floor at 2 m, walls with a window band at eye height, open to the sky, an open side), and an open centre
deck with gaps in its parapets. Blocks carry `[x0, x1, z0, z1, top, bottom]`, so floors, roofs and upper wall bands
float and anything whose top an Ooga reaches is somewhere to stand.

## Controls

The keys follow the island's (README, Controls) through the shared `controls.js`, and the sound follows the
page-wide mute (`sound.js`: the banner speaker and M). Keys only Block Frenzy needs keep letters the island leaves free.

| Desktop | Action |
|---|---|
| W A S D | Move forward, back, left and right of where the Ooga faces (as on the island) |
| Q / E, ← / → | Turn; the chase camera swings round behind |
| X, or a click on the view | Capture the mouse to turn and aim (the island's combat look); X again or Escape lets go |
| Left click or Enter | Throw the chosen tool at the crosshair (the crate, when holding one) |
| U | Hide or show the weapons bar (its handle drags it; both remembered on this device; on touch it stays put) |
| 8, R | With the grappling hook found: 8 picks it (then click fires), R fires it at the crosshair; press again, or jump, to let go |
| 1 to 7, G | Pick a weapon (paint, grenade, rocket, net, sniper rifle on a tower, Golden Dual AKs once won, Ooga AK); G steps through the ones you can use |
| Right click | Aim, as the island's precision aim: held, the view narrows; up a tower it steps the sniper scope in (four steps); in the Island view it returns to the chase camera |
| Space, Space again in the air | Jump, double jump; held in the air, the jetpack |
| Space beside a zipline, catapult or FREE WALLETS machine | Use it (as Space uses what is beside you on the island) |
| Shift (held) | Sprint |
| Tab or T | Throw what is in hand: the block to a teammate, a held crate, or a wallet bomb (which can take a rival's Golden Dual AKs) |
| K | Drop the block (or set a held wallet down) |
| B | Place a new crate from your stock |
| F | Lift the crate in front, or set the held one down (stacking it) |
| C (held) | Crouch |
| + / −, wheel | Zoom the sniper scope; elsewhere the wheel zooms the camera |
| V | Chase camera, first person or the Island view |
| P | Pause, or play on. While paused nothing acts (keys, the tool bar, touch Throw!, the act button); only play on, Sides (the board) and Sound respond, and no held key, stick or trigger carries through |
| Escape | One step back at a time: the captured mouse, then the view, then a pause, then the board (the round is given up), then the Arcade |
| Tab outside a round | The page's own: moves the focus. In a round Tab throws (a game choice; Escape or X frees the mouse) |

R fires the grappling hook at the crosshair (or lets it go), when you have one; the Ooga AK reloads itself when its magazine runs dry, and no other tool reloads.

Touch: the left stick moves, the right stick turns, Jump and Throw! buttons, a tool bar (its Ride button uses a
zipline, catapult or wallet machine) and a View button; Main menu goes back to the board. A gamepad drives the sticks and
A jumps, through the shared controls.

## Characters

The board picks the visitor's Ooga from the roster, alphabetically; a signed-in visitor plays their own. A companion
a character file hangs on its Ooga as `parts.dog` is let off the lead in this scene and trots along behind it
(`poseCompanions`); everywhere else it stays where the character file put it.

## Checks

The global tier plays the rules through the sim's own calls: pickup, a drop held until you step out, scoring only
with your own block home, a splat dropping the carrier's block, which stays until its own side carries it home, a
quiz trap holding and shielding, a net slowing and grounding, a crate pushed, a pass caught, a crate lifted, stacked
and thrown to stun, and a seeded round on
autopilot replaying exactly to three captures. The `block` scene runs the title card and Escape, W S and A D on screen,
a quiz trap through a wrong and a right answer, an autopilot round to its saved results, and the round trip.

The entry hall's Node checks cover the stage's four cabinets, the hall reaching the ledge, the zipline's survey and the Rally poster's move; the `arcade` step walks it. Browser scenes have not been run for this
head: `npm test -- block arcade` needs real Chrome on real hardware before merge.

## The trophy screen

When a round ends (`finish` in `scene-block.js`) the results card is a trophy screen in Cloud Hopper's results style:
"Ooga Arcade" over the gold pixel-block title, a banner naming the winning side, the final score big in team colours
beside the round's time in gold, the two sides' tables (every Ooga and bot: blocks mined and splats; the winners'
table lit, their MVP crowned, the visitor's row marked), medals for the round's MVP, most splats and longest sniper
shot plus the visitor's round, fastest win and rounds won, and the same three buttons.

Its picture is drawn live in the game's own 3D, so the players' real looks show. The card is a frame round an open
window (`#block-trophy-stage`), and the camera frames the trophy stage in it: up in the board's sky on its cloud, the
winning side's Oogas stand on a heap of mined blocks in their colour, the winners' MVP on top hoisting the golden block
(`goldBlock`), the two beside them waving the Golden Dual AKs, with the side's sunburst (`trophyRays`) turning behind
and confetti from the scene's fx, in a warm light. The window is measured when the card shows and on a resize, never
per frame. The winner is the sim's, so every page in a live round shows the same side; a page whose side lost sees the
winners celebrate with a line for the next round. The title drops in, the score counts up and the confetti bursts;
with reduced motion the picture holds still and nothing animates. No raster art: all of it is the game's own models.

## High scores

Rock's shared high-score registry (`highscore-rules.js` and the Worker) does not know Block Frenzy, so it submits nothing. Its best stays local through
`game.recordBlock`. Registering it is a maintainer question.


## Upstream issue 362: game-only piggyback

Per w-s-bitcoin's review, piggyback remains local Block Frenzy gameplay. This contribution
does not add shared-island riding, human-player invitations or a new network protocol.
Mounted riders keep their existing trap/blast behaviour, but their knockback and soot
clocks now expire normally while riding. The existing piggyback proof checks intermediate
and completed expiry without dismounting. Multiplayer, low-ceiling/overhang geometry,
physical touch controls and browser performance still require verification.

## Live rounds
Signed-in Oogas only, on a Worker that lists `block-v1` in welcome; anywhere else the game is solo as before.

- **Registry** (`worker/src/block.js`, contract in `block-wire.js`): one match a room. `reg`/`unreg`/`ready`/`opt` in the lobby; the first registered picks the map and size (1v1 to 4v4, `MAX_SIDE`); `reg` carries the map already picked on their board, and registered players' boards follow the match's map, grown if more have registered than it seats. With two or more registered, everyone ready starts a 3 s countdown. One person alone chooses: Start alone (`alone`, at once with NPCs) or Wait for players (marks them ready, which starts nothing until someone else registers and readies). If the others leave, the choice comes back.
- **Teams:** random and as even as can be (`split`); empty seats are NPCs.
- **Host:** one seated page runs `block-sim.js`, chosen by the room (longest in the room, a visible page first). If it leaves, the next seated page continues from its last snapshot; if no seated human is left, the round ends. A leaver's seat goes to an NPC.
- **No joining mid-round.** Late arrivals sit in the viewing chairs (`block-viewer.js`, `phase === "watch"`), a row of plain chairs in a blank white space above the game, as do visitors sent by `BL.blockLive.openWatchDeck(go)`. A viewer has no body, sends no input or position and is local to its page; it asks for the feed (`watch`) and receives every other frame, drawn smoothly between them, and only the match draws. The wheel, a pinch or the scope's +/- keys zoom the view (local only, stopping at the default view); a dark sports-style scoreboard in the corner, with a small table per player of blocks mined, stolen (counted on the viewer from who starts carrying the other side's block) and splats landed and the block-mined sound (once per capture, read from the score) come from the same match state. It has no voice in this version. It can register for the next round from there.
- **Wire:** binary frames (`"BFZ1"`, round tag, host epoch, sequence, at most 2048 bytes, 12/s), JSON inputs (20/s, at most four actions a message). Nothing reaches storage: the match rides one socket attachment.
- **Voice:** zone `block-frenzy`, its own voice group, blended in from the arcade down the zipline (`voice-blend.js`), isolated on arrival.
