# Cloud Archive · build plan

A hidden white archive above the island. Jetpack up to one marked cloud and shoot it, and a beanstalk grows from the
meadow to it. Climb the stalk and you come out through the cloud floor into a bright, empty white space. Shelves run
off toward the horizon, one for each day of Ooga Booga Land's history. Each book is a commit. Tap a shelf, or face it
and press Space, to read that day: its commits, their PR-head matches and their authors as git recorded them, with
links to GitHub.

Branch: `feature/cloud-archive`, cut from the official `OogaBoogaX/oogaboogaland` `rock` (37d9f39, 2026-10-31). It stays
behind the director's existing WIP flag (`?wip=cloudarchive`) until the phases below are done. Nothing is proposed
upstream until Phase 4 passes.

## What the repository already gives us

This is what inspecting `rock` turned up. Each item is something the archive reuses, not rebuilds.

| Need | Existing system | Where |
|---|---|---|
| Hidden until ready | `wip: true` on a scene; the director drops it unless `?wip=<id>` or `wip=1` | `director.js` top, `scene-deferred.js` |
| Code that loads only when visited | deferred groups (`data-defer="<group>"`), `BL.deferred.load(group)` from a scene's `prepare` | `deferred.js`, `scripts/build.mjs`, `scene-timechain.js` |
| A walkable interior with one Ooga, the pilot's views, footsteps, the shared HUD and a clean `leave` | the Timechain Sphere room is the template, especially its shell and interior split | `scene-timechain.js`, `timechain-interior.js` |
| Climbing | crew ladder planes (`ctx.ladders`: `x, z, nx, nz, width, top, bottom, inset`), which mount and dismount automatically with W/S, A/D and Space | `crew.js` `runLadder`; the Factory uses them |
| Jetpack | **J** equips it and Space climbs; fuel lasts about 8 s at 7 m/s, so the island's ceiling sits around 70 m | `crew.js` `runJet`, `scene-hub.js` `FLY` |
| A shootable thing that starts something in the HUB | the restless ghost: an `addTarget` owner that `shared.weaponInteraction` lets bullets hit, and that `weaponImpact` hands on | `ghost-entry.js`, `scene-hub.js` `weaponImpact` |
| Clouds | 18 drifting `hubModels.cloud` nodes on two tracks | `scene-hub.js` `buildClouds` |
| Use-key actions and Space prompts | `nearbyAction`, `useNearbyAction`, `enterScene(view, id)` | `scene-hub.js` |
| Returning the same Ooga | `world.pilot` and the `handsBack` list in the hub's two arrival paths | `scene-hub.js` (two copies, one for each hub policy) |
| Readable boards | `hud.openBoard(board)`, a paged canvas with `note` text and `links` | `hud.js`, AGENTS.md "A HUD element" |
| Tests | `npm test -- <scene>` with a `scene(id, { steps })` registration in `test/run.mjs`, plus the round-trip contract | AGENTS.md "Testing" |

## Data: what counts as verified

The rules live in `scripts/cloud-archive-lib.mjs` (pure functions, checked in the suite's global tier) and run through
`scripts/cloud-archive.mjs`:

```sh
npm run archive -- --rev <full official rock SHA>
```

Add `--pull-refs <file>` (saved `git ls-remote https://github.com/OogaBoogaX/oogaboogaland 'refs/pull/*/head'` output)
to regenerate against exactly that PR-ref snapshot.

- **Which history.** One explicit revision, given as a full SHA, never whichever HEAD is checked out. The script reads
  the official branch's tip with `git ls-remote https://github.com/OogaBoogaX/oogaboogaland refs/heads/rock` (no refs
  are written). It refuses a revision that isn't on that branch, a revision or tip missing from the clone, and a
  shallow clone. The snapshot records its `provenance` (repository, branch, revision, official tip, and the rules
  below), and every commit link points at `OogaBoogaX/oogaboogaland`, where that revision lives. The current snapshot
  is generated from `rock` at `37d9f3947bbff844f792595471e3eb99ab13e7f9`.
- **Author identities come from GitHub's own records.** `--github-authors <file>` is the REST commits API's author per
  commit, saved with:

  ```sh
  gh api --paginate "repos/OogaBoogaX/oogaboogaland/commits?sha=37d9f3947bbff844f792595471e3eb99ab13e7f9&per_page=100" --jq '.[] | {sha: .sha, login: .author.login, id: .author.id, type: .author.type}' > docs/cloud-archive/inputs/github-authors-37d9f39.ndjson
  ```

  A linked commit shows its login, one identity per account id. One GitHub links to no account is an "unlinked
  contributor". A git display name is never used. The `[bot]` and reviewed-agent rules stay, and GitHub's `Bot` and
  `Organization` types set those kinds. The committed snapshot uses the records saved 2026-11-01: 2,022 of 2,029 commits
  linked; 17 account identities, 1 unlinked contributor. Without such a file (`--provisional`) the noreply rules below
  give the only account links. These are GitHub's records when read, not proof of
  current ownership. Every count is of identities, never of unique people or bots.
  - **Accounts:** a numbered GitHub noreply address (`<id>+<login>@users.noreply.github.com`) is one identity per
    account number, labelled by the newest login it was recorded under, so a renamed account shows its later login.
  - **Unnumbered noreply addresses:** the older form (`<login>@users.noreply.github.com`) joins a numbered identity only
    through a reviewed alias (`login` + `noreplyId` in the mapping). Without one, while the same login also appears
    numbered, it stays a separate identity of the same kind (account, automation, agent or organisation), marked
    `uncertain` and labelled "<login> (unnumbered address, unconfirmed)". It may be that account, or an earlier
    holder of the login.
  - **Unlinked contributors:** every other author is its own identity per exact address, labelled neutrally
    ("unlinked contributor", numbered). No git name is shown, and two people sharing a name stay two.
  - **No addresses:** no address, and no hash of a personal address, is written out. Every exported title and label
    (git names and the mapping's labels alike) has any run of non-space text with something on both sides of an
    "@" replaced. That catches Unicode, local-domain and bracketed-IP addresses a narrow pattern misses, and leaves
    "@mentions" alone. No two exported labels are the same.
- **Kinds.** A `[bot]` login (GitHub reserves that suffix for apps) is automation. AI agents and organisations are only
  what `scripts/cloud-archive-identities.json` names after review, by login or by the SHA-256 of a service address;
  today that is Claude Code's and Codex's commit identities. Display names alone never decide a kind. Automation,
  agents and organisations are counted apart from authors.
- **Pull requests: PR-head matches, not "merged PRs".** A merge commit shows PR #n when its second parent is the head
  GitHub publishes for exactly that one PR, `refs/pull/<n>/head`, read with `git ls-remote`. That proves the merge
  brought in PR n's head commit. It does not prove GitHub marked PR n merged: open, closed-unmerged or duplicate PRs
  can share a head. So the page says "PR-head match", and a head several PRs share is credited to none (on today's
  `rock`, PRs #40 and #65 share one merged head). Subjects such as `Merge pull request #n from owner/branch` or a
  `(#n)` suffix prove nothing on their own. PR authorship is not shown: neither a branch's owner nor the merged
  commit's author is taken as a PR's author. Links name the matched PR number apart from the merge message's own
  words.
- **The PR-ref snapshot.** Matches depend on the PR refs as they were read, not only on `--rev`: PRs open and heads
  move. The snapshot records when and from where they were read, how many there were and a deterministic SHA-256
  digest of the `<n> <sha>` lines. `prHeadMatches` counts distinct PR numbers, and `prHeadMatchRows` counts merge commits
  with a match (one head can be merged more than once). The current snapshot: 324 refs read 2026-11-01 02:29 UTC,
  digest `9734213d…a763a1`, giving 257 PR numbers over 261 merges, plus 1 shared-head merge credited to none.
- **Why not the API.** Verified account links for private addresses, PR authors and signature badges need the GitHub
  API. This build container has no API access to the official repository, so the archive makes the narrower,
  checkable claims above. The page says so in every day's note.
- **Days** are UTC, by committer date. Each day links to GitHub's history from its last commit (an exact SHA), not
  to a date filter, which GitHub would read in the viewer's time zone.
- **Shelves** hold 4 x 48 = 192 books (the generator's `SHELF`, which the models check at load). A busier day keeps 191
  books and one overflow binder; the plaque and board count the binder's commits. No day in today's snapshot
  overflows (the busiest, 2026-10-25, has 184).

## Phases

### Phase 1 · small playable slice (this branch, now)

1. `cloud-archive-entry.js` (HUB, only when the scene is registered): one marked cloud that never drifts, high over
   the west meadow, about 26 m up. It is an `archivecloud` weapon target. A round from the player's own Ooga makes it
   flash (not under reduced motion) and grows the beanstalk from the meadow up to it. The stalk is a prop with a
   tooltip, and **Space, or the CLIMB button, at its foot** climbs in: the view moves in and the scene changes.
2. `scene-cloudarchive.js` shell (`wip: true`) and a deferred `cloudarchive` group with `cloud-archive-data.js`,
   `cloud-archive-models.js` and `cloud-archive-interior.js`.
3. The interior starts at the bottom of a shaft under the cloud floor. A **ladder plane up the beanstalk** (the
   crew's own climbing) brings the Ooga up into a white void. A long aisle has one shelf unit per day, alternating
   sides, each with a dated plaque and one book per commit, coloured by contributor. Walking, views, first person
   and footsteps all come from the pilot and the crew, as in the Sphere.
4. Tapping a shelf, or facing one on the floor and pressing Space (READ), opens the day's board. Space and READ do
   one thing at a time, whichever of a faced shelf and a free chair is nearer. The board shows the date, the commit,
   PR-head match and author counts, the authors and the commits, and the arrow keys page through the days without
   moving the Ooga. Its links open the day's history from its last commit, and its PRs, on GitHub.
5. Going home is always deliberate: climb all the way down the stalk, press Space (ISLAND) at its foot after having
   been up, or use Leave or Escape. Falling into the shaft only leaves the Ooga at its foot, with a hint. The same Ooga
   returns beside the beanstalk, which stands from then on, even for a page that opened straight in the archive.
6. Done when it is built, `node --check` passes on every touched file, and a manual run reaches the archive, reads
   a board and returns without console noise.

**Status (2026-11-01): playable behind `?wip=cloudarchive`, reviewed and repaired.** See `REVIEW-REPAIRS.md` beside
this plan for each finding, its fix and its evidence.

Known limits:

- The day board's canvas clips long titles and lists the first commits of a busy day; the rest is one link away on
  GitHub. The DOM note and links carry the summary.
- The browser suite has no `cloudarchive` scene yet (Phase 4). The repairs were checked with the global tier and
  scripted browser sessions on software GL, whose timings say nothing about real hardware.

Try it:

```sh
npm run serve
```

Then open `http://127.0.0.1:8080/?wip=cloudarchive&scene=hub` for the island (J for the jetpack, then shoot the gold-rimmed
cloud over the west meadow), or `?wip=cloudarchive` to land straight in the archive.

### Phase 2 · finish the walk

- A real climb up the stalk in the HUB too (a ladder plane in the hub's crew context). This replaces Space-to-enter.
- The reveal is saved per browser (`localStorage`, `ooga-cloud-archive`) so a returning visitor finds the stalk grown.
  It resets with Right Shift+R.
- A route (`/archive`), its preview card (`npm run cards`) and a `routes.js` entry, only once the WIP flag comes off.
- Contributor pages: tap a book to go to that commit, and tap a name to light up every book by that person.
- Signed-in visits: the shared zone, presence and remote players, following the Sphere's shared/solo rules.

### Phase 3 · content and polish

- **The lounge (done, v1).** Two leather armchairs and a small TV at the aisle's far end. Space beside a chair sits in
  it, looking at the screen. The TV shuffles island-cam pictures (the banana pit, the Factory, the Arcade, the Lab,
  the north gate and the beanstalk), drawn by the hub once each while the view moves in on the climb
  (`world.archiveViews`). Tapping the TV opens them as a board. Next: a live feed. Under the hub's `keep` policy the
  island stays in memory, so it could be re-rendered every few seconds from the archive.
- **The hanging Oogatron (done, v2).** The island's own live GitHub board (`jumbotron.js`) hangs on two ropes over
  the aisle, two-sided (two boards back to back, the back on the front's page) and larger than v1. It rests over the
  aisle's middle but never more than 24 m from the walker, gliding along as the Ooga walks, so it stays in reach as
  the aisle grows with the history. It is the same module, built flat without
  its posts (`stand: false`). It starts from the baked stats and takes the live poller's readings as the hub's board
  does (`oogatronLive.subscribe`); the archive never fetches anything itself. Its sides page it where it hangs. A tap
  on its screen, or Space (READ) looking down the aisle at it, opens the same floating close-up as on the island.
- **LOAD (done, v1).** On a page's first climb the floor holds only the sign and the lounge. Space (or LOAD) rolls
  the racks in out of the white past the armchairs, down both sides like two trains braking into place, to "dive"
  (`cloud-archive-audio.js`): a synthesized warp, chosen by Billy from three candidates, written after the character
  of a reference clip but not from it. It dives from 300 Hz to the sub-bass, warbles while the racks run, swoops back
  up as they lock, with a thunk. It follows the page's sound rules (pooled voices built once, opened only after a
  gesture, page mute, closed on leave); no recording ships. Under reduced motion the racks appear in place. Later
  visits in the same page find them loaded.
- **The TV channel guide (done, v4; issue #385, draft PR #386).** The TV is a channel guide to the island's live
  systems: Bitcoin (chain and mining, fees, mempool, latest block, mining pools from the Sphere), the island (who's
  working, players online, the weather, bananas and tips, the Factory's demo node), the arcade (cabinet records, Rally
  records, Cloud Hopper players, each by its own score type), GitHub (every Oogatron page, repositories, the totems'
  latest merges, Lightning Jet) and the island's places. T, the TV guide button or a tap on the TV opens the guide:
  channels by category with each one's status (LIVE, STALE, HELD, DEMO, WAITING, OFF). A pick tunes the TV and opens
  its board (the Oogatron's own for GitHub). Rotation is optional, starts off under reduced motion, and holds while
  the guide or a board is open. `LIVE-SYSTEMS.md` is the inventory of what is included, what needs another scene and
  what is not available.
- **Sitting from anywhere in the lounge (fixed).** Before, you had to stand right behind a chair; between the two the
  choice flickered. Now anywhere in the lounge offers SIT and picks the chair for you (the one you face, else the one
  already offered while both are about as near, else the nearer; the middle goes to the left), and a tap on either
  chair takes it.
- **Taking your Ooga back (fixed).** Escape lets the Ooga go, as on the island; W A S D, Space, the act button or its
  portrait now take it back, and a hint says so. Before, nothing in the archive did, and play was stuck.
- **View assist (done in the archive).** `view-assist.js` is a scene-agnostic slice of the hub's visibility stack.
  When the racks, the floor or the lounge furniture hide your Ooga, its outline is drawn in the hub's own rim
  (`camera-cover.js`). A scene supplies only `solidAt(x, y, z)`. Next: Block Frenzy. Later: the nearby-scenery outlines,
  which need the object registry.

- Milestone plinths for the days scenes opened (the Arcade, the Factory, the Sphere, ₿IFRÖST, the ghost hunt) as
  hand-written entries checked against the history.
- An ambient hum and page-turn sounds that follow the page-wide mute.
- Set dressing, with any look from the reference stills used as mood only. It stays our own design: the armchairs and
  the TV are generic voxel pieces, not replicas of anything in a film, and there are no costumes.

### Phase 4 · before proposing upstream

- **Cleanup:** the `leave` contract. Two round trips under `?debug=1` hold nothing new: targets, tweens, GPU
  geometry, timers and listeners. The hub's entry disposes with the hub.
- **Performance:** about 2,000 books are baked into one merged mesh per shelf, with no per-book nodes, and `update`
  allocates nothing. Check the frame rate on the Low tier and on Canvas 2D (`hub canvas2d` boots every scene).
- **Accessibility:** the boards are DOM text with real links. Every action has a keyboard path (Space, the arrows,
  Escape) and a touch path (tap and the ACT button: CLIMB, READ, SIT, ISLAND). Under `prefers-reduced-motion` the
  cloud neither flashes nor pulses, the stalk stands at once, and the TV holds its picture until changed by hand.
  Still to do: a contrast check of the plaques on real displays.
- **Suite:** `scene("cloudarchive", { steps })` in `test/run.mjs` covers a playthrough (climb in, open a board, climb
  out), keys on screen, and `trip("cloudarchive")`. Add a `hub` step for the cloud: a shot grows the stalk, and Space
  at the foot enters. Then run `npm test -- cloudarchive hub` and `hub canvas2d`.
- **Docs:** add the new modules to AGENTS.md's module table and the Testing scene table, and put the controls in the
  README. Then remove `wip`.

## Rules this follows (from AGENTS.md)

Vanilla IIFEs on `window.BL`, no dependencies, no external requests (GitHub is only a link the visitor chooses to
open), no console noise, the smallest change in shared files (`scene-hub.js` gets hooks only, and the logic lives in
`cloud-archive-entry.js`), and a scene contract that leaves nothing behind. Unrelated projects and scenes stay
untouched.

## Open questions for the maintainer

1. (Decided: authors come from GitHub's records; unlinked ones are labelled neutrally.) Should they instead appear without a name ("an unlinked
   author"), given AGENTS.md's privacy section? Their names are already public in the repository's history.
2. If the GitHub API becomes available to whoever regenerates the snapshot, should unlinked authors be linked to
   accounts through it, and PR authors shown? Today neither is claimed.
3. Is the west meadow, about 26 m up (about half a tank of jetpack fuel), the right place for the cloud?
