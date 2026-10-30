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
  trapped or drops it (`G`) leaves it where they stood, and it stays there, as long as it takes: the carrier's
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
- **Weather.** A seeded run of clear, windy and stormy spells. The wind gusts and wanders, pushes Oogas (hard in the
  air, a little on the ground) and bends throws; storms darken the light and bring rain and lightning.
- **Movement.** Jump, and jump again in the air: a double jump reaches 2.55 m and clears the forts' 2.4 m walls, the
  stilt huts' floors and the centre deck, carrying or not. Shift sprints for up to 4 s, refilling after a rest. C
  crouches: slower, shorter, under chest-height paint.

## Fort Chaos

44 by 74 m, mirrored half round between the halves so neither side is favoured. Each fort has a back wall, side
walls and a gated front wall, 2.4 m high, a stand inside and an alley behind with a crate to climb from. Between
them: tall banded walls across the approach to break the long sight line, low cover, side rocks, a stilt hut on each
side of each half (a floor at 2 m, walls with a window band at eye height, open to the sky, an open side), and an open centre
deck with gaps in its parapets. Blocks carry `[x0, x1, z0, z1, top, bottom]`, so floors, roofs and upper wall bands
float and anything whose top an Ooga reaches is somewhere to stand.

## Controls

| Desktop | Action |
|---|---|
| W / S | Run forward and back along where the Ooga faces |
| A / D, Q / E | Turn; the chase camera swings round behind by itself (no mouse needed) |
| Click the view, then move the mouse | Locks the mouse; moving it turns and aims. Escape lets go |
| Left click or Enter | Throw the chosen tool at the crosshair (the crate, when holding one) |
| R, right click, wheel, 1 to 4 | Switch weapon: paint, grenade, rocket or net |
| Space, Space again in the air | Jump, double jump |
| Shift (held) | Sprint |
| Tab or T | Pass the block |
| B | Place a new crate from your stock |
| F | Lift the crate in front, or set the held one down (stacking it) |
| G | Drop the block |
| C (held) | Crouch |
| V | Chase camera or first person |

Touch: the left stick runs and turns, the right stick turns, Jump and Throw! buttons, a tool bar, and a View button.
A gamepad drives the sticks and A jumps, through the shared controls.

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

The global tier passes (271 of 271). Browser scenes could not finish in the sandbox this was built in (software
rendering, and the existing `drop` scene timed out there too), so `npm test -- block arcade` needs a run on real
hardware before merge.
