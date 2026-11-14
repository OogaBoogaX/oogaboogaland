# Block Frenzy

Capture the flag, Bitcoin themed, reached down Ooga Arcade's upper hall, by zipline (and directly at `/blockfrenzy`).
Each side guards its Bitcoin block, a glowing cube in its team's colour on a stand inside its fort. Steal the other
side's block, carry it home and touch your own stand, or throw it down into your capture zone, while your own block is home. Two Oogas a side: the visitor and
a teammate against two rivals, the three bots run by the rules module. First to three captures wins. Nobody dies,
nobody loses health and nobody is removed: paint wears off.

Solo by default. Signed-in Oogas can also play together: see Live rounds below.

## Files

| File | Job |
|---|---|
| `block-sim.js` | The rules as pure functions, no DOM or scene: the arena, actors, blocks, throws, crates, quiz traps, weather and bots, on a 1/120 s fixed step that allocates nothing. Seeded, so a seed replays a round. |
| `block-trivia.js` | 35 multiple-choice Bitcoin questions, each with a one-line fact, for the quiz traps. |
| `block-models.js` | Cached geometry: Fort Chaos, the stands, the two team blocks, crates, paint balls, grenades, rockets, nets, splats, quiz pads and bubbles, rain, and the arsenal: each tool's gun in a shared frame (`gun(index * 2 + team)` over `GUNS`, the grip at the origin and the muzzle along +z), the hook launcher among them, the hook's head and rope, the monkey and the ammo box. |
| `scene-block.js` | The scene: the side picker, the round, the HUD, the cameras, the quiz card and the trophy screen. Registers `BL.scenes.block`. |

Shared files touched, each by the smallest change: `arcade-models.js`, `arcade-scene-models.js` and `scene-arcade.js` (the entry hall: `BLOCK_HALL`, its walk, sight and light, and its zipline off the ledge; the stage stays rock's four cabinets, and the Rally poster moved just beside the mouth),
`game.js` (a `block` save slot: rounds, wins, fastest win, validated on load), `routes.js` (`/blockfrenzy`),
`director.js` (`block` in the debug handle list; `runsBehindPanels`, an opt-in that keeps a live session stepping behind the controls panels with the player's Ooga idle), `src/index.html` (script tags, the nav, `#block` and its title
card), `src/style.css` (the game's panels, appended), `test/run.mjs` (rules in the global tier, a `block` scene) and
`AGENTS.md` (the module and test rows).

## Rules

- **Blocks.** Touch the rivals' block, on its stand or wherever it lies, to carry it. A carrier who is splatted,
  trapped or drops it (`K`) leaves it where they stood, and it stays there, as long as it takes: the carrier's
  teammates can grab it and run on, and its own side must pick it up and carry it all the way back to its stand.
  A loose block lies on what it came down onto (`restOn`): the ground, or a top a body can stand on, such as a cave's
  roof, a hut's floor, the centre deck, a wall, a tower's platform or a crate. It never passes through a roof or a
  floor into the cave or the space underneath, and one thrown up into a roof or a floor from underneath falls back
  where it was. Where it can't lie as it fell (against a parapet, in a hut's window) it lies at the nearest spot on
  the same top where a body can stand. Only a top above the loose-block placement limit
  (`LOOSE_TOP`, still 7 m after the jetpack upgrade: the higher jungle canopies and the towers' rails) sends it
  to the nearest open ground beside (`restSpot`), as does a carrier falling past the island's edge. A block on a crate falls when the crate goes.
  Bots fetch a block from a top (`fetchUp`): to the open ground beside it on their own side (`launchSpot`), a jump
  and the jetpack straight up from a full tank until their feet clear the top, then straight at the block.
  A carrier can't pick the same block up again until they have left its circle.
- **Scoring.** Their block onto your stand, by the round's rule, the board's Scoring setting. "Block must be home
  (classic)", the default: your own block must be home; reaching your stand while yours is away scores nothing yet (a
  NOT YET! banner says why), and a carrier who waits there scores the moment it returns. "Block doesn't need to be
  home": it scores at once. The rule is one flag on the sim (`anyTime`), set as the round starts and never changed in
  it; bots carry home and score the same way under both, waiting on the stand only where the rule makes them. Solo, the
  visitor picks it and it is remembered with the other picks. In a live round the first in picks it (`opt`'s `r`; the
  match carries `rule`, which every page and the host's sim read; other boards show it and can't change it). Until the
  first in picks, a lobby of exactly two people, who are dealt one a side and would otherwise each sit on the other's
  block, plays "doesn't need to be home" and any other count plays classic (`blockWire.ruleFor`); the pick leaves with
  whoever made it, however they stop being first in (the Worker keeps who picked, `picker`, and `pickOf` counts it only
  while they are `reg[0]`). The first in waiting through a round can pick for the next. The lobby's status line, the start of the round, the status strip and the help card all name the rule.
  A throw scores too, by the same rule: their block coming down in your capture zone (within `STAND_R` of your stand, or
  `GOAL_R` of a map's own scoring spot, on the ground rather than a roof over it, including falling there off a wall) is
  a capture for whoever threw it, and wins the Golden AKs as a carried one does. Under classic, if your own block isn't
  home the same banner says so and the block lies where it landed. A side can't score by throwing its own block, and a
  block off a hook's rope is not a throw.
- **Passing.** `Tab` (or `T`, or the Pass button) throws the carried block about 12 m ahead in an arc. Anyone who
  could pick it up can catch it in the air, so a teammate can take a pass and a rival can intercept. Uncaught, it
  lands and lies as a dropped block, unless it comes down in the thrower's capture zone (Scoring, above); caught, it is
  carried as usual and scores nothing by the throw. Bots pass when a rival closes in and a free teammate stands nearer home.
- **Flight.** Paint and the AKs fly nearly straight (`TOOLS`, `flatPitch` cancels what lob and fall remain), as the Ghost Hunter's rounds do. Carrying a block costs a player no speed; bots still carry at their old pace (`BOT_CARRY`). Rounds move in pieces no longer than `SHOT_STEP`, so a fast one can't pass through a thin wall.
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
  the chase camera comes in front of (or over) leaves as it does walls. The two trees before each tower stand
  low (3.5 m), so a scope up there sees over them.
- **Weather.** A seeded run of clear and stormy spells. Storms darken the light and bring rain and lightning.
- **Movement.** Jump, and jump again in the air: a double jump reaches 2.55 m and clears the forts' 2.4 m walls, the
  stilt huts' floors and the centre deck, carrying or not. Shift sprints for up to 4 s, refilling after a rest. C
  crouches: slower, shorter, under chest-height paint.

## Play-test additions

Each map has its own time of day and weather mix (`MAP_WEATHER`, seeded): Fort Chaos at sunset, Ooga Town at midday, Gorilla Jungle cloudy and always raining with puddles that slip you, Haunted Hollow at night on a brick field. Storms warn a spot and then strike whoever stays with lightning (`bolt`), once per `BOLT_COOL` each. A busy network (fees at the storm rate) brings a storm over a map's own weather; calmer fees change nothing. Haunted Hollow has lamps, neon on the cave walls, a few open graves to fall in and step out of with a skeleton and a ghost. The Detail setting on the menu turns off foliage, rain, lightning effects and that dressing; the rules stay. `N` hides the mini-map, `?` or Help opens the in-play help. Ooga Town's block stand is at the back of its building, under the upper floor. Haunted Hollow's scoring ring is out behind each house at the back of the map, its tall iron gate is solid with the way round either end, and its open graves are too deep for one jump: a double jump, the jetpack or the hook gets you out.

## Towers, ziplines and ammo caches

- **Towers.** One beside each end on every map: four posts, an open platform 6.4 m up (`TOWER_TOP`) with a
  parapet, and a ladder up its inward side (a climb zone, not a block). A good perch for the sniper rifle, which no
  longer needs one; the rack on the platform is dressing.
- **Ziplines.** Each tower's cable leaves from the platform's ladder side and runs down into the other end. `Space` (or the
  Zip button) by the cable rides it at 15 m/s, hands on the cable; at its end, or on a jump, you let go and fall. From
  your own tower it is a raid into their fort; with their block in hand, their tower's line takes you home. Closed
  while fortifying and while holding a crate. Reaching the cable says which way it rides. The bar fits the modelled
  Ooga's shoulder width and its hanging pose uses its actual arm reach, restoring its hip when it lets go; the shared
  ride path and speed are the same for every body. First person follows that hanging eye height.
- **The rivals' zipline is a trap door unless your own block is home.** Grab the other side's line while your own
  block is anywhere but its stand (carried, dropped, flying) and it throws you off the island instead (`zipSprings`,
  event `ziptrap`): the enemy catapult's throw (`flingOff`), outward from that line's handle past the rim, no
  parachute; jetpack or hook back, or fall. A block in hand follows `flung` as the catapult's does. It is checked only
  at the grab: a rider already sliding rides on, whatever happens to their block meanwhile. Your own line is never
  trapped. A lamp on each handle shows it from your side, green to ride, red when it would spring. Bots only choose
  the zip home with their own block home, and drop that route if it goes. The event appended to `EVENT_TYPES` made
  `WIRE` 5.
- **Ammo caches.** Five on Fort Chaos (each stilt hut's floor and the centre deck; the other maps place their own).
  Walking onto one refills grenades, rockets, nets and the crate stock as your stand does, then it goes dark for 15 s
  (`CACHE_S`). A real Bitcoin block found while you play makes every cache and quiz pad ready again.

## The trophy's most valuable Ooga

The trophy screen has one picture of the winners, its own stage. The most valuable Ooga of the winning side (`SIM.mvp`)
stands on top of the heap hoisting the golden block, is crowned in its side's table and named on the Round MVP medal
with what its worth counts: the most worth (`SIM.worth`: three a block mined, two a block brought home, one a splat
landed), a tie going to more mined, then more brought home, then the lower seat. It reads only what every frame
already carries (the winner and each Ooga's counts) and the round's seat map (kept by the scene until the board shows
again, since a guest's results can come after the lobby message ends the round), and the podium's places and the tables'
order break ties by seat too, so every page of a live round shows the same and the wire is unchanged; solo, a seat is
an actor's index. The tables show blocks mined, blocks brought home and splats, a name on one line; on a wide screen
they run the card's width with the medals three across under them, and the card's buttons hold to its foot.

## Your record

The game's save slot (`game.state.block`, in the page's one save under `oogaboogaland.v1`, validated on load) keeps the
visitor's own running tally in this browser: rounds played (`games`) and won (`wins`), the fastest win in milliseconds
(`best`), and their own blocks mined (`mined`), blocks brought home (`home`), splats landed (`splats`), times splatted
(`splatted`) and rounds as the most valuable Ooga (`mvps`). A finished round adds to it once, solo or live
(`SIM.tallyOf`, the same per-actor counts the trophy card shows, into `game.recordBlock`); a round left early isn't
over and adds nothing, nor does one watched from the chairs. A save from before the tally keeps its rounds and best
and starts the new counts at 0. Nothing is sent anywhere: a record across devices needs the server and is not built.
The board's Record panel shows it under Your record, and the trophy card's last medal in short.

## The board's weapons preview

On a wide screen the board shows, with the visitor's Ooga turning on its cloud, each tool of the arsenal in turn
(`SIM.ARSENAL`: tool, name, a line on what it does): its held model turning over the Ooga's head in the chosen side's
colours, drawn in the scene as the Ooga is, and a card with its name, its line and previous and next buttons. It steps
on every 4.5 s; a press steps it and holds it 12 s; a drag turns it with the Ooga. Reduced motion neither turns nor
steps it. Neither the card nor the weapon shows while the title card is up: they come with the board itself. Where
the card would cover the weapon (a view less wide for its height) the card keeps further right and the scene holds
the weapon left of the card's edge. Narrow screens, where the Ooga isn't shown either, don't show it. It is hidden with the board and in a round.

## Held weapons

The weapons bar has a slot a weapon in key order (`1` to `8`), each named in its title and drawn side-on from its model in
the visitor's team colours. The slot in hand stands larger, grown in place, with its name standing over it for as long as
it is chosen, following the choice. A slot's state is the rules' (`slotState`, `slotCount`): not yours yet is dim, grey and dashed with no
count; yours and out stays lit with a red 0; counts show only where a tool runs out or reloads.

Keys `1` to `7` pick paint, grenade, rocket, net, sniper rifle, Golden Dual AKs and Ooga AK; `G` cycles through the
ones you can use.

- **Ooga AK** (`7`). The island's rifle: a tap fires one round, a held trigger fires on full auto every 0.09 s, from a
  30-round magazine that reloads itself in 1.4 s when it runs dry.
- **Golden Dual AKs** (`6`). One in each hand, full auto, both firing every round, never empty. Two pairs a round
  (`GOLD_GUNS`), won by mining blocks and taken only by a hook (see Each block wins Golden AKs and The special weapons
  take each other).
- **Sniper rifle** (`5`). In every Ooga's arsenal from the start of a round, on every map, solo and live, and fired
  from anywhere (`sniper` on an actor is 1 throughout): fast, flat and long (160 m/s, about 50 m, semi-automatic: a shot
  a click, 0.35 s apart, no ammunition and no reload). With it out, right click brings up a first-person scope with four
  zoom steps (34°, 20°, 11° and 6° of view; right click, wheel, two-finger swipe or `+` `−`); in first person it is
  always scoped. Putting it away restores any view the scope changed. A guest's shot is a `fire` action of kind
  `sniper`, checked on the host as any other; the wire is unchanged (the `rifle` and `unrifle` events keep their
  places in `EVENT_TYPES` and are no longer sent). Bots don't use it. The results card names the round's longest
  sniper hit.

Paint balls, the AKs and the rifle splat as paint does; nobody is removed and nobody has health.

## Floating islands (BF2.1)

Every map is an oval floating island in OBL's voxel style (`W`, `L` its half sizes, a good way past the playing field `fieldW`, `fieldL`; `onIsland`, `edgeDist`), with a grass-and-rock cliff around its open edge, the rock under it deepening toward the middle (`isleDepth`, the same function the mesh uses), the hub's clouds beneath it and the sea far below at the hub's height. Walking or being blown off an edge drops an Ooga past the rim: its feet below `RIM` the island no longer holds it, and the rock under the rim keeps it out. Every Ooga has its jetpack: hold Space in the air (or Jump on touch) and steer back over the edge. The team pack scales with its Ooga and sits on the modelled body's own back, following it while crouching and hanging from a zipline; its flames stay attached to its nozzles. Its power is the island's: once the jump has lost its lift it thrusts up to `JET_RISE` (7 m/s) at a net +11 m/s² for `JET_FUEL` seconds, and eases to a hover at `JET_CEILING` (15 m). A throw or a bounce already rising faster than that keeps its speed. An Ooga that falls past `FALL_FLOOR` (40 m) comes back in its own block zone with a full tank and a moment's protection. A block carried over the edge drops at the edge the carrier left it (`EDGE_HOME_S` later it goes home by itself unless someone picks it up); a grappling hook lost over the edge goes back into hiding. Bots fly back the same way. A carrier flung by the other side's catapult keeps the block through the flight (`flung`): back on the island it is still theirs; fallen all the way, it falls with them and goes straight back to its stand rather than dropping at the edge.

## Terrain (BF2.1b)

Each map has hub-style terrain in the island's own rock (`terrain`, half a map turned half round so the maps stay mirrored), the map's own pieces and, round every field, `ringTerrain`'s massifs: walk-through caves that join up (flanks and behind each fort, `massif`), cliffs (`cliff`), and more mounds and outcrops. The pieces: a two-tier grassy mound (`mound`: 1 m then 2 m, each a jump up, for high ground), a walk-through rock cave (`cave`: 3 m wide, walls and a roof to stand on, cover and a flanking way, never a dead end), and a tall outcrop breaking a long lane (`outcrop`), mossy boulders from the hub's kit at its foot. They stand on a half-metre grid so the voxel island meshes exactly what the sim collides with (`rocks`, joined to `BLOCKS`), clear of every fort, stand, catapult, ladder, zipline and spot the game uses; the bots steer round them as they do any building.

## Each block wins Golden AKs

There are two pairs of Golden AKs a round (`GOLD_GUNS`), never more: the pool (`goldLeft`) and the pairs held always
add up to two. Each block mined wins one pair (`winGold`, called from the capture in `touchFlags`): for the miner, or
if the miner has a pair, for the teammate nearest them without one (the lower number on a tie; the host's sim decides,
so every page agrees); from the pool while any are left, else from a rival who holds one (the sim's seeded pick). A
side that holds both pairs wins nothing more. The feed and a notice name who received it (`gold` with the miner as
`by`, or `goldsteal` naming who lost it). Mining takes no hook.

## The special weapons take each other

Only the two special weapons take each other, and only out of a rival's hands (`heldOf`: the tool selected, `wield`,
the host's own each frame and a guest's sent as a `wield` action when it changes, its tool's index in the action's kind
slot, checked on the host against what the Ooga owns; for a bot, the last it fired; a hook in use always counts). The
frame carries it for every Ooga (one byte: the tool chosen and the last fired), so guests draw what each has in hand
and a page that takes over as host keeps it:

- A hook that reaches a rival with the Golden AKs in hand takes the pair straight into the thrower's arsenal, if they
  have none, and comes back (`goldhook`). With the AKs put away, the hook passes them by.
- Golden AK fire that splats a rival with the hook in hand, or out, takes the hook straight to the shooter, if they have
  none (`hooksteal`).

Nothing else takes either: paint, the Ooga AK, the sniper rifle, grenades, rockets, nets, thrown crates, the monkeys,
laser eyes, gorillas and bonks all splat as before and the victim keeps what they hold. Nothing is dropped on a splat.
Bots now and then hook a rival who has the Golden AKs out, in reach and in sight, and fire the Golden AKs whenever they
hold them, so a hook holder in their sights can lose it. The frame no longer carries dropped pairs but carries
what each Ooga has in hand, and the drop events are gone: `WIRE` was 4 (5 since the zipline trap's event).

## The grappling hook (BF2.1c)

A special weapon, two a round, hidden at seeded spots from each map's hand-checked `hookSpots` (in the cave, on the mound's top, behind the outcrop, up a jungle tree): one in each half, the same spot turned half round. Walk over one to take it (it shows on the hip, and as its launcher in the hand while it is the chosen tool or out); `R` or tool `8` then fires it at the crosshair (range 24 m). Cloud Hopper's hook head, rope and flight (`BL.grapple.toward`, shared; the sim keeps its own state, `hk`): a bite on rock, a tree, a wall or the island's edge pulls the Ooga in on a rope that only shortens (`BL.grapple.pullSpeed` and `tether`), swinging it under the bite (hold C to stop the pull and swing), until it arrives or lets go (R again, or a jump), keeping its speed. A block, on its stand, loose or held by a rival (after a moment's warning, `hookwarn`), is pulled in along the rope into the thrower's hands (the hook must reach it before anything solid: within `HOOK_BLOCK_R` of a loose block, or anywhere on the stand of one at home, `HOOK_STAND_R`, so a low aim brings the block and never bites the stand under it; a wall between bites first): the rival block is carried, your own loose block goes home, as touching them would; hands already full, it lands on reachable ground beside them. Anything else the hook meets that is not an Ooga pulls the Ooga to it. A teammate is ignored and the hook can miss. There is no recharge: the hook fires again the moment it is back in the hand, after a miss, a let-go or a block pulled in, and only one is out at a time (a bot still waits between throws, `HOOK_BOT_WAIT`). A gorilla hooked is stunned and drops its captive, with a cooldown before the hook can do that again. Only Golden AK fire takes it from a rival (see The special weapons take each other), and bots fetch the ground-level ones, hook carriers and captors in reach, and bite the rim to pull themselves back after a fall.

## Gorillas (BF2.2, BF2.3)

Three or four on every map (`gorillas`): wicked's hub gorilla (`BL.agent.create` managed rig, posed with `poseManaged` and its `dragging`/`throwProgress` motion flags). A gorilla roams its home, charges an Ooga on the ground that comes within sight and grabs it, the block (and any crate) dropping where it was grabbed. It then drags the captive by the leg down a route round the terrain (`dragFor`, worked out once a map) to the nearest edge it can throw from, winds up and throws it off, released past the rim (`thrown`), and the Ooga jetpacks back (its tank is filled for the throw). A captive fills a struggle meter (`grabFill`, shown on screen while held): each distinct press (Space, E, Enter, a click or a tap, never a held key) adds one, it drains over time, and full breaks free at any point. Only that or the hook (which stuns the gorilla, with a cooldown) frees a captive; paint and bursts stun a free gorilla but never a grip. Bots mash by the same rule at their skill's rate, shoot a charging gorilla and fly back.

| `SKILLS[k].gorilla` | sight | charge | reach | drag | rest s | need | drain /s | bot mash /s |
|---|---|---|---|---|---|---|---|---|
| easy | 6 | 6.5 | 1.05 | 6 | 9 | 6 | 0.8 | 3.5 |
| normal | 8 | 8 | 1.2 | 7.5 | 6 | 10 | 1.4 | 5 |
| hard | 10 | 9.5 | 1.35 | 8.5 | 4 | 15 | 2 | 6.5 |
| expert | 12 | 11 | 1.5 | 9.5 | 2.5 | 22 | 2.4 | 9 |

## Ooga Town

High noon on Main Street, 44 by 74 m, red's half blue's turned half round. A bank at each end, cream stone banded in
its team's colour under a stepped pediment with a clock stopped at noon (BANK OF OOGA, BOOGA RESERVE): the block's
stand at the back of its hall under a mezzanine reached by stairs. Three ways in: the front doors, the back door
behind the stand, and the hole in the side wall where the cash machine was. A saloon and a general store in each
half, each walked straight through (a front and a back door at its street end, a side door onto the street; no
building is a dead end, so the bots find their way by steering alone), their upper floors joined by a footbridge
over the street, each front door under a solid sign board. Two market stalls before the bank, a counter under an
awning a double jump reaches; a cart for cover in the square; and in the middle the fountain with a gold coin on a
column, edge-on to the street, which also breaks the sight line from footbridge to footbridge. A trampoline behind
each saloon reaches its upper floor and one in the square reaches the footbridge. No quiz pad lies on the straight
line between the stands. A catapult drops its Ooga into the other bank's hall.

`kinds` in the map's data names each box (`bank`, `pediment`, `saloon`, `store`, `saloonSign`, `storeSign`, `floor`,
`rail`, `step`, `bridge`, `bridgeRail`, `post`, `stall`, `awning`, `cart`, `basin`, `column`, `coin`) and `townBlock`
draws by name in plain boxes. The lettering, posters, swing doors and the store's awning are one merged mesh
(`townDress`) behind the Detail setting: no lights, nothing animated.

## Fort Chaos

Retired from play: no longer offered on the board or accepted on the wire (`blockWire.FIRST_MAP`). Its map stays in the sim for the rules' tests.

44 by 74 m, mirrored half round between the halves so neither side is favoured. Each fort has a back wall, side
walls and a gated front wall, 2.4 m high, a stand inside and an alley behind with a crate to climb from. Between
them: tall banded walls across the approach to break the long sight line, low cover, side rocks, a stilt hut on each
side of each half (a floor at 2 m, walls with a window band at eye height, open to the sky, an open side), and an open centre
deck with gaps in its parapets. Blocks carry `[x0, x1, z0, z1, top, bottom]`, so floors, roofs and upper wall bands
float and anything whose top an Ooga reaches is somewhere to stand.

## Gorilla Jungle

The same 44 by 74 m field, halves turned half round. The floor belongs to the gorillas and the trees to the Oogas: a
treetop walkway runs down the middle 3.2 m up, from each half's tree house (four trunks under one crown, a cargo net up
each side) along a rope bridge to the Great Tree's ring platform (a net up its east and west sides). A gorilla takes
nobody above 1.4 m, so the walkway is safe from them and in plain view of both sniper towers; the ground lanes either
side run past the gorillas' homes and the banana hoard at the Great Tree's foot. Each end is a ruined temple: Fort
Chaos's 2.4 m walls, and over the gate a stone gorilla head on two pillars (a block from 3.4 to 5 m: walking in and
a single jump pass under it, and its top is somewhere to stand), eyes in its team's colour. A fallen log crosses each
ground lane and bushes stand before each gate. Hook spots: behind the log (the only one on the ground, in the open),
on the mound, up a tree and on a tree house's crown.

`kinds` in the map's data names each of its own boxes for the models (`jungleBlock`), and `drawn` says the models put
its cargo nets and puddles into the map's one mesh (`jungleDress`, with the crowns, the hoard and the signs), so the
scene places no node for them. The trees round the rim are one mesh too (`jungleRing`, Detail: Full) in place of the
hub's trees. Nothing on the map is lit or animated beyond what every map has.

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
| 1 to 7, G | Pick a weapon (paint, grenade, rocket, net, sniper rifle, Golden Dual AKs once won, Ooga AK); G steps through the ones you can use |
| Right click | Aim, as the island's precision aim: held, the view narrows; with the sniper rifle out it brings up the scope and steps it in (four steps); in the Island view it returns to the chase camera |
| Space, Space again in the air | Jump, double jump; held in the air, the jetpack |
| Space beside a zipline or catapult | Use it (as Space uses what is beside you on the island) |
| Shift (held) | Sprint |
| Tab or T | Throw what is in hand: the block to a teammate, or a held crate |
| K | Drop the block |
| H | Climb on a teammate's back, or hop off |
| J | Call a teammate to climb on your back |
| 0 | Level the camera |
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
zipline or catapult) and a View button; Main menu goes back to the board. A gamepad drives the sticks and
A jumps, through the shared controls.

The board's All controls list (`CONTROL_GROUPS` in `scene-block.js`, also the in-play Help) shows these as five whole groups, Move, Weapons, Hook, Block and crates, View and game, in a grid three, two or one across by its width, each row key caps and a short action; a unit check holds it to the keys the scene really handles, both ways.

## Characters

The board has no Ooga picker: a signed-in visitor plays their own Ooga, anyone else the one they drove in (`world.pilot`) or the roster's first, and the board shows it turning (wide screens) with its name. A companion
a character file hangs on its Ooga as `parts.dog` is let off the lead in this scene and trots along behind it
(`poseCompanions`); everywhere else it stays where the character file put it.

Held weapons attach to the modelled forearms at the fists, including the second Golden AK, with the slim arm's
scale accounted for. The first-person camera uses the Ooga's own head height. The trophy block rests on the MVP's
raised hands using that body's hip, shoulders and arm length.

## Checks

The global tier plays the rules through the sim's own calls: pickup, a drop held until you step out, scoring only
with your own block home, a splat dropping the carrier's block, which stays until its own side carries it home, a
quiz trap holding and shielding, a net slowing and grounding, a crate pushed, a pass caught, a throw home (scoring and crediting the thrower at a stand and a map's own spot, with no score with
your own block away, for a side's own block, just outside the zone, when caught, or off a hook; ending the round at
its target), a crate lifted, stacked and thrown to stun, and a seeded round on
autopilot replaying exactly to three captures. The `block` scene runs the title card and Escape, W S and A D on screen,
a quiz trap through a wrong and a right answer, an autopilot round to its saved results, and the round trip.

The entry hall's Node checks cover the stage's four cabinets, the hall reaching the ledge, the zipline's survey and the Rally poster's move; the `arcade` step walks it. The Block Frenzy browser checks also measure each weapon's
grip, zipline bar and raised trophy against regular, slim and wide Oogas' actual fists, including letting go of the
bar. Both teams' Ride controls and warning lamps are checked with their own block home and away; the trap event
also crosses the binary wire into an opposing client's actor numbering. The phone session checks the board,
play and results at portrait, landscape and narrow sizes, including a real touch event that fires Throw and the
shared controls reference. Throw sits above the sticks and Jump, with the weapons bar above it.

## The trophy screen

When a round ends (`finish` in `scene-block.js`) the results card is a trophy screen in Cloud Hopper's results style:
"Ooga Arcade" over the gold pixel-block title, a banner naming the winning side, the final score big in team colours
beside the round's time in gold, the two sides' tables (every Ooga and bot: blocks mined, blocks brought home and splats, long names wrapping so touch users can read them; the winners'
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

- **Registry** (`worker/src/block.js`, contract in `block-wire.js`): one match a room. `reg`/`unreg`/`ready`/`opt` in the lobby; the first in picks the map, size and scoring rule (2v2 to 4v4, `MIN_SIDE` to `MAX_SIDE`; NPCs fill any empty seat, so there is never a 1v1); `reg` carries the map already picked on their board, and registered players' boards follow the match's map, grown if more have registered than it seats. With two or more registered, everyone ready starts a 3 s countdown. One person alone chooses: Start with NPCs (`alone`, at once with NPCs) or Wait for players (marks them ready, which starts nothing until someone else registers and readies). If the others leave, the choice comes back.
- **Teams:** random and as even as can be (`split`); empty seats are NPCs.
- **Host:** one seated page runs `block-sim.js`, chosen by the room (longest in the room, a visible page first). If it leaves, the next seated page continues from its last snapshot, and a block in the air at that handover lands without scoring, since frames don't say who threw it; if no seated human is left, the round ends. A leaver's seat goes to an NPC.
- **No joining mid-round.** Late arrivals sit in the viewing chairs (`block-viewer.js`, `phase === "watch"`), a row of plain chairs in a blank white space above the game, as do visitors sent by `BL.blockLive.openWatchDeck(go)`. A viewer has no body, sends no input or position and is local to its page; it asks for the feed (`watch`) and receives every other frame, drawn smoothly between them, and only the match draws. The wheel, a pinch or the scope's +/- keys zoom the view (local only, stopping at the default view); a dark sports-style scoreboard in the corner, with a small table per player of blocks mined, stolen (counted on the viewer from who starts carrying the other side's block) and splats landed and the block-mined sound (once per capture, read from the score) come from the same match state. It has no voice in this version. It can register for the next round from there.
- **Wire:** binary frames (`"BFZ1"`, round tag, host epoch, sequence, at most 2048 bytes, 12/s), JSON inputs (20/s, at most four actions a message). Nothing reaches storage: the match rides one socket attachment.
- **Voice:** zone `block-frenzy`, its own voice group, blended in from the arcade down the zipline (`voice-blend.js`), isolated on arrival.
