# Block Frenzy

Capture the flag on Fort Chaos, Bitcoin themed, as a fifth stage cabinet in Ooga Arcade (and at `/blockfrenzy`).
Each side guards its Bitcoin block, a glowing cube in its team's colour on a stand inside its fort. Steal the other
side's block, carry it home and touch your own stand while your own block is home. Two Oogas a side: the visitor and
a teammate against two rivals, the three bots run by the rules module. First to three captures wins. Nobody dies,
nobody loses health and nobody is removed: paint wears off.

It is a single-player game for now. Multiplayer is described under Open questions.

## Files

| File | Job |
|---|---|
| `block-sim.js` | The rules as pure functions, no DOM or scene: the arena, actors, blocks, throws, crates, quiz traps, weather and bots, on a 1/120 s fixed step that allocates nothing. Seeded, so a seed replays a round. |
| `block-trivia.js` | 35 multiple-choice Bitcoin questions, each with a one-line fact, for the quiz traps. |
| `block-models.js` | Cached geometry: Fort Chaos, the stands, the two team blocks, crates, paint balls, grenades, rockets, nets, splats, quiz pads and bubbles, rain. |
| `scene-block.js` | The scene: the side and Ooga picker, the round, the HUD, the cameras, the quiz card and the results. Registers `BL.scenes.block`. |

Shared files touched, each by the smallest change: `arcade-models.js` (a fifth game in `GAMES`, its cabinet paint,
marquee loop, pictographs and poster; the stage arc's step closes from 0.265 to 0.22 so five cabinets fit),
`game.js` (a `block` save slot: rounds, wins, fastest win, validated on load), `routes.js` (`/blockfrenzy`),
`director.js` (`block` in the debug handle list), `src/index.html` (script tags, the nav, `#block` and its title
card), `src/style.css` (the game's panels, appended), `test/run.mjs` (rules in the global tier, a `block` scene) and
`AGENTS.md` (the module and test rows).

## Rules

- **Blocks.** Touch the rivals' block, on its stand or wherever it lies, to carry it. A carrier who is splatted,
  trapped or drops it (`K`) leaves it where they stood, and it stays there, as long as it takes: the carrier's
  teammates can grab it and run on, and its own side must pick it up and carry it all the way back to its stand.
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
- **Weather.** A seeded run of clear, windy and stormy spells. The wind gusts and wanders, pushes Oogas (hard in the
  air, a little on the ground) and bends throws; storms darken the light and bring rain and lightning.
- **Movement.** Jump, and jump again in the air: a double jump reaches 2.55 m and clears the forts' 2.4 m walls, the
  stilt huts' floors and the centre deck, carrying or not. Shift sprints for up to 4 s, refilling after a rest. C
  crouches: slower, shorter, under chest-height paint.

## Towers, ziplines and ammo caches

- **Sniper towers.** One beside each end on every map: four posts, an open platform 6.4 m up (`TOWER_TOP`) with a
  parapet, and a ladder up its inward side (a climb zone, not a block). Standing on either tower's platform hands you
  the sniper rifle off its rack; stepping off puts it back. The rifle fires only from a platform: fast, flat and long
  (60 m/s, semi-automatic: a shot a click, 0.35 s apart, no ammunition). Up the tower the view drops into first person
  through a scope with four zoom steps (34°, 20°, 11° and 6° of view; right click, wheel, two-finger swipe or `+` `−`), and leaving the tower restores the
  tool and view you had. The results card names the round's longest sniper hit.
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

R has nothing to do here: the Ooga AK reloads itself when its magazine runs dry, and no other tool reloads.

Touch: the left stick moves, the right stick turns, Jump and Throw! buttons, a tool bar (its Ride button uses a
zipline, catapult or wallet machine) and a View button; Sides goes back to the board. A gamepad drives the sticks and
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

On 2026-11-01, after merging rock, the global tier passes 363 of 363, including a check that every retro cabinet
still maps to its own retro game and score ID behind the fifth live cabinet. Browser scenes have not been run for this
head: `npm test -- block arcade` needs real Chrome on real hardware before merge.

## High scores

Rock's shared high-score registry (`highscore-rules.js` and the Worker) does not know Block Frenzy, so its cabinet
carries no `scoreId` (`null` in `arcadeModels.GAMES`) and submits nothing. Its best stays local through
`game.recordBlock`. Registering it is a maintainer question.


## Upstream issue 362: game-only piggyback

Per w-s-bitcoin's review, piggyback remains local Block Frenzy gameplay. This contribution
does not add shared-island riding, human-player invitations or a new network protocol.
Mounted riders keep their existing trap/blast behaviour, but their knockback and soot
clocks now expire normally while riding. The existing piggyback proof checks intermediate
and completed expiry without dismounting. Multiplayer, low-ceiling/overhang geometry,
physical touch controls and browser performance still require verification.
