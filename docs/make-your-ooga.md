# Make your Ooga

For a player and the AI helping them. If someone has asked you for a character in Ooga Booga
Land, in any words ("make me a character in Ooga Booga Land", "add me to the game", "make my
Ooga"), this page is the whole job: follow it in order, from section 1.

An Ooga is one file, `src/characters/<handle>.js`, in the repository
[OogaBoogaX/oogaboogaland](https://github.com/OogaBoogaX/oogaboogaland). This page says how
to get the player set up, what to ask before writing the file, what each kind of change
costs in review, and how to show them the result before sending it. `AGENTS.md` (Adding
things, A contributor) holds the full build contract and
[character-bundles.md](character-bundles.md) the intake rules; this page is the short way in.

Tell the player at the start what it takes from them, and do the rest yourself:

- make a GitHub account, if they have none, and approve one sign-in in their browser;
- answer a few questions at a time, and send a picture or two if they have them;
- look at their Ooga in the studio, a page on their own computer, and say what to change;
- say yes before anything is sent.

## 1. Get set up

Do this first, before the file. Every step runs on the player's own computer. Ask before
installing anything and before opening their browser. Never ask for a password, a token or
a code: the player types those into GitHub themselves.

**An agent that runs commands.** The studio, the check and the PR all run on the player's
computer. A chat assistant that cannot run commands there can still hold the interview
(section 2) and write the file, but say so plainly and offer the easy way on: a coding agent
that works on their computer (Claude Code, Codex or another), started in an empty folder with
the same request. A player who wants only plain data (section 4) can also send it from the
browser without seeing it first: on GitHub, in the repository's `src/characters` folder,
**Add file**, **Create new file** named `<login>.js`, paste the file, **Propose changes**, and
open the pull request. GitHub makes the fork and the PR in their name.

**A GitHub account.** The Ooga belongs to one: its handle is the account's login, only that
account (or a maintainer) can change it, and signing in on the island with it is what hands
the player their own Ooga to drive. Ask whether they have one. If not, they make it
themselves at [github.com/signup](https://github.com/signup): it is free, with their own
email and password, and the email confirmed. The login is their Ooga's name on the island
(a display name can differ), so suggest one they are happy to be called.

**Sign in on this computer.** GitHub's own tool, `gh`, signs them in once for everything
after:

```bash
gh auth status
```

If `gh` is missing, install it with their OK (`brew install gh` on a Mac,
`winget install --id GitHub.cli` on Windows, [cli.github.com](https://cli.github.com) for
the rest). If it says they are not signed in:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

Tell them what happens: a one-time code shows here, a page opens on github.com, and they
sign in there and type the code. That is all. If your shell cannot wait on a prompt, ask
them to run those two lines in their own terminal. Then ask GitHub who they are:

```bash
gh api user --jq .login
```

That answer is the handle. Use it, never a login typed in the chat, and show it to them to
check it is the account they mean: the intake takes the PR's author as the character's
owner, and refuses a file named for anyone else.

**The tools.** `git --version`, and `node --version` for Node 22 or newer. Install what is
missing with their OK (Node from [nodejs.org](https://nodejs.org), or `brew install node`).
Nothing else: there is no `npm install`.

**Their copy of the repository.** Players cannot push to OogaBoogaX's repository; every Ooga
arrives as a PR from the player's own fork:

```bash
gh repo fork OogaBoogaX/oogaboogaland --clone --default-branch-only
cd oogaboogaland
git switch -c ooga/<login>
```

A player who already has the clone: `git switch rock`, `gh repo sync`, `git pull`, then the
branch.

**Commits in their name.** The intake reads every commit that changes the file, and each
must belong on GitHub to the account that opens the PR; a commit whose author GitHub cannot
match to an account is refused. Set this clone, and not the computer's other settings, to
their GitHub no-reply address, which always matches:

```bash
git config user.name "$(gh api user --jq .login)"
git config user.email "$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')"
```

**Open the studio now.** With their OK, start it and leave it running in the background for
the whole session (section 7 says what it shows):

```bash
npm run character:studio -- <login>
```

With no file yet it shows the Ooga their login already gets, which is the place to start
the interview: this is you today; what should change?

## 2. Interview first

Do not write the file from one sentence. Ask a few questions at a time, in plain words,
never as a form, and wait for the answers.

**Pictures first.** Ask for anything to work from: a photo of themselves, their avatar, a
drawing, a character or an outfit they like. Several help, and front, side and back help
most. If you can see images, say back what you take from each (colours, hair, clothes, what
they hold, a pet) and check it with them; if you cannot, ask them to describe it. Without a
picture, offer the Oogas already on the island: the studio's list at the top right puts any
of them on the pad, and "like that one, but" is a good start.

Then, part by part, with the picture beside you:

- **Build.** A male or a female Ooga? (`build: "normal"` or `build: "slim"`.) The studio's
  **Female** button shows a file-less Ooga in the other build, and
  `npm run character:preview -- <login> <login>:slim` draws both as a still.
- **Body.** Skin, hair and fur colours; taller or shorter; a beard, a smirk, a plain nose or
  no face feature; bald or not; eye colour, and whether the eyes glow.
- **Outfit.** What they wear on the chest, hips, legs and feet.
- **Head.** Hair shape, a hat, a crown, glasses, earrings.
- **In the hand.** A club is the default. A sword, an axe, a staff, a guitar, a bouquet?
- **Company.** A pet at their heel? A bag, a shield, a pack?
- **Voice.** One line for when they are poked and up to 24 idle lines, 160 characters each.
  Ask what they are like and what they would say: a catchphrase, a joke, how they talk.
- **Name.** The handle is their GitHub login (section 1). A `display` name is cosmetic.
- **How long they will wait.** Plain data merges on its own the next day. Anything
  drawn in code waits for a maintainer.

Before building, say the whole plan back in a few lines, sorted as section 3 sorts it, and
wait for a yes.

## 3. Sort every wish before you build

Tell the player which column each wish falls in, and offer the nearest plain-data choice
where a wish does not fit.

| | What it covers | What happens to the PR |
|---|---|---|
| **Plain data** | Colours, build, height, face, eyes, voice (section 4) | Merges automatically with the next daily bundle, at or after the following midnight UTC |
| **Custom code** | Any shape the stock Ooga does not have: clothes, hair, a hat, a held item, a pet, a bag (section 5) | A maintainer reads the exact file and merges it by hand. It can take days and rounds of notes |
| **Not from a character file** | Anything that happens over time or that the game must know about (section 6) | Needs a change to the game itself: ask a maintainer first |

One line of code moves the whole file to custom review. If the player wants to be in the
game tomorrow, send the plain-data Ooga first and the custom work as a second PR.

## 4. Plain data

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
  - `portrait` (`min` and `max` corners), which only frames the face icon.
- `voice` is `poke` and 1 to 24 `idle` lines, plain text, 160 characters at most.

`cigarette`, `gasMask`, `stoneAxe`, `skater` and `pumpkin` are also accepted as true or
false, but each only switches on behaviour for a part that custom code builds (a board to
ride, a mask to breathe through). On a plain-data Ooga they add nothing to see.

A value outside these sends the file to custom review even though it holds no code.
`npm run character:check` says so and names the field.

## 5. Custom code

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

Leave comments out. They count toward the 32,768 bytes, the screen reads them, and they ship
in every visitor's page. Say what each part is for in the PR's description instead.

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

## 6. What a character file cannot do

A character file builds a shape once. It has no say in what happens afterwards. These need
a change to the game, reviewed as ordinary code, so ask a maintainer before promising them:

- a new animation, pose, reaction or idle habit, for the Ooga or its pet;
- sound;
- anything other players' pages must agree on beyond the shape itself;
- a change to the shared bodies (how shoulders, hands or hips are built for everyone);
- a new plain-data option.

If the wish is close to something an Ooga already does, say which one, and build on that.

## 7. Show, check, repeat

**The studio.** Opened in section 1, with the player's OK, since it opens a page in their
browser:

```bash
npm run character:studio -- <handle>
```

puts their Ooga alone on a wide pad with a chair, a bed, a hammock and a fire, and reloads
the page every time the file is saved, back in the same place and view. Leave it running
for the whole session. It serves the repository to this machine only (127.0.0.1), with
every live feed off; `--no-open` prints the address instead of opening it, and Ctrl+C
stops it. Its address is the studio and nothing else (the island is not there):
`?scene=studio&character=<handle>`. A handle with no file yet shows the default Ooga,
and `<handle>:slim` its female build.

- The buttons down the left side put the Ooga in each place without the walk: **Stand**,
  **Chair**, **Bed**, **Hammock**, **Fire** (sitting on the ground beside it, as the
  island's Oogas do). **1st person** looks out of its own eyes and **3rd person** from
  behind and a little above (in combat, X, over its shoulder). **Free cam** gives the
  player a camera of their own while the Ooga stays as it is: W A S D fly it, Space and
  X lift and lower it, a drag turns it, the wheel moves it in and out, and Escape gives
  the view back. **Day** turns to **Night** and back, **Female** switches a file-less
  Ooga's build, and **Speak** says its voice lines in turn.
- In the top banner are the game's own buttons: its portrait as the game frames it, the
  jetpack (or J) and what it holds (1 and 2: the rifle puts the held thing on its back).
  The list at the top right puts any other Ooga on the pad, A to Z, in the same place
  and view and with no reload: useful for seeing how others solved the same problem.
- The player can walk it too: W A S D, Space beside a place to sit, sleep or rest and again
  to get up, the wheel to zoom in to its own eyes, a drag to look round it. Asleep, the
  movement keys turn it over.
- **This Ooga**, the panel on the right, lists everything the file gives the Ooga on the
  pad: its plain-data look and voice (a click on a colour copies its value), each custom
  hook (its name's tooltip says what such a hook does), and the parts it builds (a pet, its
  own jetpack, a board, a shield). Under them it shows how much of the
  32,768 bytes the file takes, with each hook's share, and the lane the intake puts it in.
  It is read again on every save. It stands against the right edge: drag its left edge to
  make it wider or narrower, and its arrow folds it to a tab on the edge.
- Each reload says what the intake's screen makes of the file (its lane, how full it is,
  or what would be refused). A file that no longer parses is named with its line and the
  page stays as it was; a hook that throws is named at the foot of the page, with the
  default Ooga standing in until it is mended.

**Taking notes.** Tell the player how to give them: say what to change in plain words and
where they saw it ("in the chair, the skirt cuts through her legs"), or send a screenshot of
the studio. Take one note at a time, save, let the page reload in front of them, and ask
whether it is right before the next.

Look at every round in each place, because each shows something else: standing from all
round; the rifle out, for how the held thing lies on the back; the jetpack on, for the
pack over hair and clothes and a pet's flight or ride; the chair and the ground by the
fire, for hems, skirts and legs; the bed, on each side, for hair and hats on the pillow and the gear
stood beside it; the hammock, for the pet lying down beside it; night, for anything that
glows; its own eyes, for what the hand holds.

**A picture.** For a still to send or to set beside a reference:

```bash
npm run character:preview -- <handle>
```

draws the Ooga from the front, three-quarter, side and back, with its head, trunk, legs,
held thing and pet close up, to `untracked/character-preview/<handle>.png`. Take the
player's notes one at a time. Expect many small rounds.

**The check.**

```bash
npm run character:check -- <handle>
```

runs the intake's own screen on the file and says which lane it lands in, why, and how
full the file is. It cannot check ownership: GitHub settles that from the PR.

```bash
npm run test:unit
```

must pass before the PR. It builds every Ooga and checks their stowed gear.

## 8. The PR, and what the bot does

Ask the player before pushing: it puts their file on GitHub, in public. From their branch:

```bash
git add src/characters/<login>.js
git commit -m "Add <login>'s Ooga"
git push -u origin ooga/<login>
gh pr create --repo OogaBoogaX/oogaboogaland --base rock --head <login>:ooga/<login> --draft \
  --title "<login>'s Ooga" --body "<the plan from section 2, sorted as section 3 sorts it, and what was checked>"
```

`gh pr ready` marks it ready once the work and the checks are done.

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
- Once it is merged and the site next deploys, the player signs in on
  [oogabooga.land](https://oogabooga.land) with GitHub (**Contributor sign-in**, in the
  Contributing Oogas panel), and the island hands them their own Ooga to drive.
