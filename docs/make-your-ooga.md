# Make your Ooga

For a player and the coding agent helping them. An Ooga is one file,
`src/characters/<handle>.js`. This page says what to ask before writing it, what
each kind of change costs in review, and how to look at the result before sending it.
`AGENTS.md` (Adding things, A contributor) holds the full build contract and
[character-bundles.md](character-bundles.md) the intake rules; this page is the short way in.

## 1. Interview first

Do not write the file from one sentence. Ask, and wait for the answers:

- **Build.** A male or a female Ooga? (`build: "normal"` or `build: "slim"`.) Show both:
  `npm run character:preview -- <login> <login>:slim` draws the Ooga that login gets with no
  file at all, in each build.
- **Body.** Skin, hair and fur colours; taller or shorter; a beard, a smirk, a plain nose or
  no face feature; bald or not; eye colour, and whether the eyes glow.
- **Outfit.** What they wear on the chest, hips, legs and feet.
- **Head.** Hair shape, a hat, a crown, glasses, earrings.
- **In the hand.** A club is the default. A sword, an axe, a staff, a guitar, a bouquet?
- **Company.** A pet at their heel? A bag, a shield, a pack?
- **Voice.** One line for when they are poked and up to 24 idle lines, 160 characters each.
- **Name.** The handle is their GitHub login. A `display` name is cosmetic.
- **A reference picture**, if they have one. Work from it part by part.
- **How long they will wait.** Plain data merges on its own the next day. Anything
  drawn in code waits for a maintainer.

## 2. Sort every wish before you build

Tell the player which column each wish falls in, and offer the nearest plain-data choice
where a wish does not fit.

| | What it covers | What happens to the PR |
|---|---|---|
| **Plain data** | Colours, build, height, face, eyes, voice (section 3) | Merges automatically with the next daily bundle, at or after the following midnight UTC |
| **Custom code** | Any shape the stock Ooga does not have: clothes, hair, a hat, a held item, a pet, a bag (section 4) | A maintainer reads the exact file and merges it by hand. It can take days and rounds of notes |
| **Not from a character file** | Anything that happens over time or that the game must know about (section 5) | Needs a change to the game itself: ask a maintainer first |

One line of code moves the whole file to custom review. If the player wants to be in the
game tomorrow, send the plain-data Ooga first and the custom work as a second PR.

## 3. Plain data

The automatic lane takes exactly this wrapper and nothing beside it: no code, no
comments you need kept (the bundle rewrites the file from its data).

```js
(() => {
  "use strict";
  const BL = window.BL;
  BL.characters.add({
    handle: "your-login",
    joined: 1700000000,
    lastCommit: 1700000000,
    look: { build: "slim", skin: "#c98a5b", hair: "#3a2412", eyeColor: "#ff2438", eyeGlow: 0.8 },
    voice: { poke: "Ooga!", idle: ["Ooga build.", "Stack sats."] }
  });
})();
```

- `handle` is the GitHub login, `github` the owning login where the handle differs from it,
  `display` a name of at most 39 characters.
- `joined` and `lastCommit` are Unix seconds in the past. `joined` orders the roster. If the
  game already made a file for the player, keep its dates.
- `look` may hold, and nothing else:
  - colours as six-digit hex: `skin`, `hair`, `fur`, `eyeColor`;
  - `build`: `"slim"` (female) or `"normal"` (male, the default);
  - `face`: `"nose"`, `"beard"`, `"smirk"` or `"none"`;
  - `height` from 0.8 to 1.3 (a hashed Ooga is 0.92 to 1.16);
  - `eyeGlow` from 0 to 1, with `eyeColor`, for eyes that shine;
  - true or false: `bald`, `hairless`, `cleanShaven`, `noBrow`, `wideEyes`, `noPupils`;
  - `hatY` (-4 to 20) and `portrait` (`min` and `max` corners), which only place a hat and
    frame the face icon.
- `voice` is `poke` and 1 to 24 `idle` lines, plain text, 160 characters at most.

`cigarette`, `gasMask`, `stoneAxe`, `skater` and `pumpkin` are also accepted as true or
false, but each only switches on behaviour for a part that custom code builds (a board to
ride, a mask to breathe through). On a plain-data Ooga they add nothing to see.

A value outside these sends the file to custom review even though it holds no code.
`npm run character:check` says so and names the field.

## 4. Custom code

Custom code is a `dress` object of hooks beside the data. `AGENTS.md` lists them and what
each means under the modelled look. In short: `torso` and `gear` paint blocks that the
body wears as bands of colour; `crown`, `skull`, `eyes` and `mark` build the head in
blocks; `club`, `headgear` and `extras` add pieces; `model(k, wear)` builds what blocks
cannot say and lifts it off the body with `BL.heroBody.trunk(slim)`.

The limits a maintainer cannot waive:

- **One file, 32,768 bytes**, comments included. The check prints how full it is.
- **The screen reads comments and strings too.** None of these words anywhere, in any
  letter case: `eval`, `function`, `fetch`, `XMLHttpRequest`, `WebSocket`, `import`,
  `require`, `process`, `globalThis`, `document`, `localStorage`, `sessionStorage`,
  `navigator`, `location`, `constructor`, `__proto__`, `prototype`, `setTimeout`,
  `setInterval`, `Worker`, `atob`; no `window` except `window.BL`; no web addresses; no
  `\x` or `\u` escapes. Hooks are written as methods and arrows. Write "an opening in
  her hair", not "a window".
- **Your own identity in every commit.** The intake reads each commit, not only the last.
  Start from the wrapper above or from the file the game made for you. Never start from a
  copy of another character's file: a commit that holds someone else's handle closes the PR.
- **Nothing else in the PR.** A character PR changes its one file.

What tends to go wrong, from the Oogas already here:

- **Clothes floating or cut by the body.** A garment is a piece of its own that follows the
  trunk a little off it. Loft it through `trunk().ring(y)` with a ring at each of
  `trunk().heights`, and lift flat pieces with `trunk().lift`.
- **A held thing that does not sit in the fist.** Keep its butt short, set `rest` and `carry`,
  and say how it lies on the back: `slingTurn` lays a blade flat, `slingHiltUp` puts the
  grip over the shoulder. A slim build's fist is three quarters the size.
- **A pet that slides.** Build it as `parts.dog`, standing at `-k.legH`, and list its four
  `legs` (hinged at the hips) and its `tail` on the node, with `packAt` for its jetpack.
  The crew then walks it, wags it, flies it and lays it down beside the hammock.
- **A face that does not match the body.** A block head carries the renderer's block detail;
  the modelled body is one flat colour.
- **Random detail that moves other Oogas.** Vary by a fixed hash of the cell, never by
  drawing from `k.rand` out of turn.
- **Rounded, bubbly shapes.** The look is flat planes with crisp bevels.

## 5. What a character file cannot do

A character file builds a shape once. It has no say in what happens afterwards. These need
a change to the game, reviewed as ordinary code, so ask a maintainer before promising them:

- a new animation, pose, reaction or idle habit, for the Ooga or its pet;
- sound;
- anything other players' pages must agree on beyond the shape itself;
- a change to the shared bodies (how shoulders, hands or hips are built for everyone);
- a new plain-data option.

If the wish is close to something an Ooga already does, say which one, and build on that.

## 6. Show, check, repeat

After every round of changes:

```bash
npm run character:preview -- <handle>
```

draws the Ooga from the front, three-quarter, side and back, with its head, trunk, legs,
held thing and pet close up, to `untracked/character-preview/<handle>.png`. Show the
player the picture, beside their reference if there is one, and take their notes one at a
time. Expect many small rounds.

```bash
npm run character:check -- <handle>
```

runs the intake's own screen on the file and says which lane it lands in, why, and how
full the file is. It cannot check ownership: GitHub settles that from the PR.

Then look at it moving. Open `src/index.html?debug=1&solo=1&character=<handle>` after a
build and walk, run, take the rifle out (the held thing goes on the back), sit, and lie in
the hammock. Add `&oogastyle=0` once to see that the block look still builds.

```bash
npm run test:unit
```

must pass before the PR. It builds every Ooga and checks their stowed gear.

## 7. The PR, and what the bot does

- Open the PR against `rock` as a **draft** with the one file. Keep it draft while
  building or debugging. Mark it **ready for review** only after the work and authorized
  checks are complete, and record the validation and any remaining acceptance work in
  its description. Return it to draft for substantial new work; small review fixes can
  stay ready. Batch related fixes before pushing. Commit as the player. Do not
  force-push over commits the bot has read.
- The bot reads the file as text and never runs it. It copies an accepted file into one of
  two standing bundle PRs, says which and why, and **closes your PR on purpose**: the
  bundle carries the change from there.
- Plain data rides the daily bundle. Custom code waits in the manual bundle for
  w-s-bitcoin or 2140data.
- A refusal is a policy finding, with the reason in the bot's comment. Fix it and reopen,
  or, when an earlier commit is what was refused, open a new PR from a fresh branch that
  adds only the file.
- Only the GitHub owner of a character, or a maintainer, can change it.
