# The Ember Den poker floor

Implemented against OogaBoogaX/oogaboogaland `rock`, inspected source snapshot
`e1c69776153a05794b3fc6da6af9b584a7820ebf`.

## Status

This build includes local practice and an **experimental encrypted-deck
multiplayer service**, private dealing, signed public hand records and an
independent verifier. It is not an audited or production-certified release.
The existing ten-table floor and five cave themes remain. Read
[poker-protocol.md](poker-protocol.md) for the protocol, service commands,
security assumptions and hosting requirements.

The current interface revision adds a filtered table browser, a clearer betting
dock and live connection feedback, and the table view now shows the room
behind it, a face at every seat, the pot's chips and the dealer's own gorilla.
See [poker-interface.md](poker-interface.md)
for the interaction changes and remaining play-tests, and
[poker-integration.md](poker-integration.md) for signed-in deployment and recovery.

Browser playthrough, fallback rendering, touch layout, audio, automatic hand
progression, the theme picker and visual appearance, scene round trips, and the
changed hub entry remain unverified:
the available Chromium lost its DevTools connection on both previous attempts
before assertions could run. The repository's consecutive-failure rule requires
stopping; the handoff includes the unchanged failure ledger. No browser test was
retried for this revision. This document does not authorize another retry.

## Play

For shared play, run `npm run poker:serve` and open
`http://127.0.0.1:8787/?scene=poker&pokerLive=1` in separate tabs. Take seats and
press **Deal hand**. Every participant contributes an encrypted shuffle.
Verification runs in a background worker. A missing contribution or action
cancels the hand after 90 seconds without progress, refunds committed chips,
and releases missing players' seats. Stay connected after folding; stand
between hands before exiting. No keys are sent to the server for recovery.
There are no live-mode bots or automatic deals.

The following controls describe local practice:

Build with `npm run build`, then open `oogaboogaland.html`, or run
`npm run serve` and open `http://127.0.0.1:8080/?scene=poker`.
For a direct file preview, append `?scene=poker` to the file URL.

In the island, possess an Ooga and enter ₿IFRÖST. Walk through The Ember Den's
window beside the DSB Land window: its arch glows in the room's felt colour and
it shows a picture of the room. The same Ooga appears directly in the room,
without a title card or transition animation. The return mirror brings them
back to ₿IFRÖST, in front of that window.

**Play a practice hand** takes a free seat, adds enough computer opponents for four
players and deals. Or choose any of the ten lobby table cards, take a specific seat,
add three bots at a time, and deal when ready. You can also run a bots-only table
while spectating. Every table has nine player seats plus a suited gorilla
dealer. Two funded seats suffice; there is no table owner or privileged host.

Choosing a table opens a focused oval-table view over the room. On desktop the
room shows dimly through its backdrop and keeps moving; on phones the backdrop
is solid. Your seat stays at the bottom. Every occupied seat shows its
character's face, and player stacks, round bets, dealer and blind markers,
folds, all-ins and the acting player appear around the stitched leather rail.
Community cards and the pot sit in the center, with chip stacks that grow with
the pot. The dealer shows the room's own gorilla and dips to deal each hand.
Your private cards and actions are in the lower dock. See
[poker-interface.md](poker-interface.md) for the table view's details and its
remaining play-tests.
Public showdown cards appear at the eligible players' seats. A winner banner
shows chips collected, including returned contributions, rather than claiming
that the full award is profit.

Use Fold, Check/Call, or Bet/Raise. The numeric field and slider set a **total for
the current betting round**. Min, half-pot, three-quarter-pot, pot and all-in
presets only select an amount: they never submit a bet. A pot raise includes the
call before sizing the raise. The rules still enforce minimums, all-in caps and
raise rights. Submitted UI actions carry the displayed table version so a stale
click is rejected. The sizing helper also shows the additional chips and your
remaining stack. Live actions stay disabled until their own request is
acknowledged in a refreshed, verified state. There is no time limit on the
human's turn in practice.

Auto deal defaults on and waits at least five seconds after settlement. It
refills busted computer seats for free between hands. A busted human stops the
loop and chooses a free refill explicitly. Auto deal can be disabled per table;
Pause practice pauses all local tables. Optional synthesized deal/turn/win sounds
start only after opting in, with no audio downloads. The room's own music and
sound play without opting in once the page has had a click or key (see Sound).
The history keeps the last twelve completed public hand summaries per table
during this floor visit; it never archives a player's private or folded cards.
Card motion and the dealer's deal gesture respect the reduced-motion preference.

WASD/sticks move the spectator; drag/look controls use the shared pilot. The
central aisle and passages between table rows remain walkable. **Walk the floor**
closes the playing view. Fold the lobby to see more of the room. All physical
tabletop hole cards are identical backs; walking behind a seat reveals nothing.
A spectator can watch the focused view, return to walking, and select another
table. Taking a second seat requires leaving the first.

**Walk the floor** moves a seated visitor into the aisle while keeping their
seat and normal turns. The lobby's **Your seat** button returns to the table;
it shows when it is time to act. Walking does not check or fold for you.
**Leave seat** is a separate control under Table options. During a practice
hand it checks when free and folds when facing a bet, then releases the seat
after settlement. Already all-in chips remain eligible. Live seats can leave
only between hands. Escape closes the focused view; a second Escape while
seated requests leaving the seat. Unseated visitors can return through the
mirror to ₿IFRÖST. Leaving the scene pauses its local tables; returning resumes
them. Reloading resets practice chips.

## Visual revision: the marble hall

Banana Club is a white marble hall. The floor is laid in large white marble
tiles with grey veins, ringed by a border of darker marble, with the gold inlay
lines and the gold-edged green runner on top. The long walls are veined white
panels in two tiers above a darker base, the arched wall lights are glazed warm
white, and round marble columns with gold bases and capitals stand down both
walls. The ceiling beams are cream with a gold edge, and the far wall's
lettering stands on a deep green marble field framed in gold, so it never sits
light on light. Every vein is a thin flat strip laid from a fixed seed: there
are no textures or images.

The light is warmer and brighter than the old dim hall, with less bloom so the
white stone does not glare, and each of the ten tables still sits in its own
pool of light: over its felt its own lamp reaches further than any other light.
Three tiered diamond chandeliers hang down the room, and their crystal rings
glint, each ring on its own beat. A two-wing bar with a marble front and a nero
marble top stands backlit on the far wall, a brass cashier cage with marble
counters stands on the side wall near the mirror end, and the two far corners
are lounges with oxblood leather sofas, marble-topped low tables and palms.
Table 10 is the high-roller table: it stands on a red rosso marble inlay edged
in gold and keeps its glowing gold pinstripe. A short velvet rope between two
brass posts stands on the aisle side at each end of the table, not all round
it, and the stretch by the chairs is left open.

The tables are ornate in this style only: a turned marble pedestal with gold
bands, an oxblood padded rail round the felt, gold inlay rings on the green
felt and walnut chairs with carved backs, padded seats and gold finials. Each
floating TABLE name hangs on a dark green marble plate framed in gold. The
cave styles keep their stone tables.

The furniture, the fountain and the statues' plinths collide with walkers and
exist only in Banana Club. Switching theme while standing moves the visitor to
the nearest spot clear of the new room's furniture. The lowest renderer tier
still spends its ten point lights on the ten tables; the room's three lights
follow, then the bar's two and the cage's, and the fountain's soft warm light
comes last.

### The fountain

A round marble basin stands at the room's centre, between tables 5 and 6: a
darker foot, a white wall with a gold line under a raised white rim 2.3 m in
radius, and a pedestal rising out of the pool. On the pedestal a marble Ooga in
a toga and a leaf ring tips an urn. The figure and its water are turned a
little off the room's long axis, so from the mirror end it stands in
three-quarter view beside its water rather than behind it. Water pours from
the urn in five thin strands onto the pool's surface, where twelve droplets
splash and fall back. The water is the island lake's moving translucent
material, on both renderers. The figure is the same invented Ooga every time,
baked into one marble piece.

The basin is solid. The visitor, other players and the crowd walk round it,
and standing up from table 5 or 6 puts the visitor on open floor beside the
pool, not in it. A remote player whose last pose lies where the pool now
stands is not moved by this page.

₿IFRÖST's window shows the room with the fountain, the statues and the
fountain's light, but its picture is taken once, so the water stands still
there.

### The road to Bitcoin

Eight marble statues stand along the two long walls, four a side, 18 and 6 m
either side of the room's middle, between the columns, each on a stepped
plinth facing the centre aisle. They run in order from the mirror toward the
bar, odd numbers on the left wall as seen from the mirror and even on the
right. Every statue is the
same stylised figure in a toga, with one plain face shared by all eight; they
are told apart only by their pose and the object each holds. The Satoshi
figure is hooded, and its hood is empty: there is no face inside, only a dark
recess. A statue's walk block covers its plinth and everything it holds out
over the aisle, so nobody walks into a held piece.

Each plinth carries a brass plaque with the figure's name carved on it. To
read a placard, hover over the plaque for its name, tap or click it, or press
the act button while standing within 2 m of a plinth (not while seated). The
placard opens in the board dialog the jumbotron uses, titled The road to
Bitcoin, and its arrows page through all eight in order.

| # | Figure | Holds | Placard |
| --- | --- | --- | --- |
| 1 | Ralph Merkle | a branching tree | Merkle's puzzles, 1974. Merkle trees, 1979, as a Stanford graduate student. |
| 2 | David Chaum | a sealed envelope | Blind signatures, 1982. Ecash, and DigiCash, founded in Amsterdam about 1990. DigiCash went bankrupt in 1998. |
| 3 | Adam Back | a stamp and hammer | Proposed hashcash in 1997. The whitepaper cites Adam Back's Hashcash. |
| 4 | Wei Dai | a coin marked b | B-money, 1998. It is the whitepaper's very first citation. |
| 5 | Nick Szabo | a gold bar | Bit gold: designed 1998, published 2005. Chained proofs of work. |
| 6 | Hal Finney | a tablet marked 170 | Reusable proofs of work, 2004. First to write back that the paper seemed promising. Received 10 bitcoin in block 170, 12 January 2009. |
| 7 | Satoshi Nakamoto | a scroll | Signed the whitepaper under a pen name. Mined the genesis block on 3 January 2009. To this day, nobody knows who that is. |
| 8 | Laszlo Hanyecz | two pizza boxes | Paid 10,000 bitcoin for two pizzas in 2010. 22 May is Bitcoin Pizza Day. |

Every placard line is a fact the project already states in its Bitcoin
lectures, or for Pizza Day in its block trivia; the placards add nothing about
anyone. The statues are stylised, not likenesses: no face, body or trait is
modelled on a person, and the figure is an invented Ooga under a name no GitHub
login can hold. Because named statues go a step past the lectures, this was
flagged for the maintainers under the Privacy rule in `AGENTS.md`.

### The lite set

On Canvas 2D, which paints every face on the CPU, Banana Club builds a lighter
set of the same room: half the marble veins (at least one each), half the
turning on the columns, the table pedestals, rails and inlay rings, plainer
chairs, a coarser fountain basin and pool, three water strands and six
droplets instead of five and twelve, and a lighter leaf ring and skirt on each
statue. The fountain and its figure, all eight statues, their plinths, plaques,
carved names and placards stay. WebGL draws the full set on every quality tier.

### Still to play-test

These are open until checked by eye in the built page:

- glare from the white stone, the fountain's light and the white figures under
  bloom, on each quality tier;
- the fountain's figure in three-quarter view beside its water, and whether the
  thin water strands read clearly;
- each statue's pose and held object from the aisle, and the carved names on
  the plaques;
- the table labels' new backing plates, and the padded rail against cards,
  chips and the dealer button;
- marble veins on large floor slabs on Canvas 2D (a vein can sort behind its
  slab there);
- the room in the ₿IFRÖST window's picture;
- a remote player whose last pose is where the pool now stands;
- the frame-rate lane with a full crowd in the hall.

Cards now have rounded paper edges, proper suit shapes, corner ranks at both
ends, traditional numbered pip layouts, original double-ended Jack/Queen/King
portraits and identical navy-and-gold banana backs. `poker-cards.js` supplies
one cached vector design to both the tabletop meshes and inline HUD SVGs.
There are no card textures, remote fonts, external images or extra requests.
Only public community cards use face-up meshes; private tabletop cards remain
backs. The hand display has larger cards and accessible full card names.

The original card artwork remains in this poker-interface revision. Its appearance still needs local play-testing under the existing
browser-test stop instruction below.

## Cave themes

Choose **Cave theme** under the lobby's **Room style & connection options** or
the table's **Room style** section. The lobby
also offers five visual swatches. A theme changes the whole local room's stone,
chairs, felt, architectural details and lighting together with the poker HUD.
The original Banana Club remains the default.

| Theme | Room character |
| --- | --- |
| Banana Club | White marble hall, gold columns, ornate tables, a centre fountain and eight statues, with diamond chandeliers, a backlit bar, cashier cage, lounge corners and a roped high-roller table. |
| Crystal Grotto | Blue stone, cyan/amethyst wall crystals, teal lanterns and lagoon felt. |
| Ember Cavern | Basalt colors, glowing amber fissures, copper trim and warm red felt. |
| Jungle Ruins | Mossy limestone bands, hanging vines, rune stones and fern-green felt. |
| Moonstone Hollow | Pale mineral bands, silver trim, cool lanterns and violet felt. |

₿IFRÖST's window into the room follows the theme last chosen here: its arch
glows in the theme's felt, lifted to glow, and its picture shows the room in
that theme.

These decorate the underground floor reached through ₿IFRÖST's Ember Den window;
no repository cave slot is claimed. The cave finishes follow the mine's
banded-rock architecture, with lanterns, vines and rune stones from the shared
`BL.dressing` kit. Glowing fissures are visual decoration, not walking hazards.
New wall formations sit beyond the existing spectator movement boundary, and
the central and cross aisles retain the same footprint.

The preference is saved under `ooga-poker-theme` in localStorage. Unknown values
fall back to Banana Club; blocked storage still permits changing the current
visit's theme. This is a cosmetic preference, not a chip balance or hand save.
The scene swaps cached scenery and furniture geometry in place: it does not
re-create table instances, seats, dealers, card nodes, input targets or betting
controls, or reset the bot timer. A theme may be selected during a hand without
submitting or resizing a bet. Card faces and identical card backs stay consistent
across themes. No additional images, fonts, dependencies or network calls are
used.

`poker-themes.js` contains the five palettes and validated preference lookup.
Scenery is built lazily and cached for at most those five themes. Retired scenery
nodes leave the graph for the renderer's existing housekeeping; no new per-frame
geometry, particles or allocations were introduced by theme switching.

## The floor

A crowd walks the floor in every theme. Its cast has 29 invented characters,
none of them a contributor: twelve walking guests, five gorilla staff and twelve
seat-only opponents. Every name ends in `/ember-den`, so none can match a GitHub
login, and none is registered as a character or joins the roster.

- **Guests.** Two high rollers in dinner jackets with cigars, three businessmen
  with briefcases, three ladies in gowns with clutches and heels, two old Oogas
  on canes, one on a walking frame and one comic drunk with a glass and a tilted
  hat. Each type walks its own way: the businessmen hurry, the ladies sway, the
  canes plant upright at every other step, the frame lifts and shuffles, the
  drunk weaves.
- **Staff.** Two waiters with a tray of drinks held out level, the pit boss and
  two security in dark glasses.
- **Opponents.** Twelve characters who only ever sit at a table. Every
  computer opponent sits as one of them, never twice at one table, and a seat
  keeps its opponent for good. A human seat shows the hashed
  `Banana Bot <seat>` stand-in unless that player sits there as their own Ooga
  (below). When a seat changes hands, empties or is the visitor's, its old
  figure leaves the table.

How many walk follows the renderer: 16 on the high tier, 10 on medium, 6 on the
lowest and on Canvas 2D. The day picks who walks, the same on every page: a
waiter and security always, the pit boss and the second waiter and security on
a full floor, then guests in the day's order, with at most one drunk and one
frame. Members are built one at a time as they first appear.

Guests walk to the table rails, the bar stools, the lounge sofas, the cashier
cage and the ropes, sit down by a short slide, watch a table for a while and
move on. The waiters make rounds of a stool and three tables, the pit boss
keeps the middle of the floor, and security stands at the doors and ropes. When
a theme without the bar or lounges comes in, anyone seated stands and walks on.

The crowd reads only what every player sees of a table: its pot, phase, hand
number, winner and whether anyone is all in. It never sees a card. A big pot
brings the pit boss to that table and leans the watchers in, an all in puts a
hand to their heads, and a win makes them cheer. Members speak short lines, at
most two bubbles at a time, greet a visitor who comes close, and the drunk
mutters. After his third stumble, security walks him to a sofa.

Members give way to the visitor's Ooga and to other players. A guest held up
for a few seconds goes somewhere else; it does not plan a way round. Members
are never walk blocks, so nobody is ever stuck behind one.

On an M-series Mac the full crowd of 16 costs about 164 draw calls and 77,000
triangles a frame over the empty floor; the lowest tier's six cost about 69
draw calls and 30,000 triangles. Building a member takes 4 to 8 ms, one every
0.15 s.

## Sound

The room plays quiet lounge music: a bass, a piano and brushes in swing time,
three tunes in turn with a short rest between them. Under it is the murmur of
the room, louder near the bar and the tables, with chips clicking at the tables
and glasses at the bar. The crowd's heels, canes and walking frame are heard
where they step, quieter further away and to the side they are on.

The music plays on the speaker panel's **Music** row, the one every place's
music shares, and while you are in the room the panel shows **Room hum** for
the murmur and every placed sound. The table's own deal, turn and win sounds
keep their **Poker table** row. The page mute silences all of them.

The music dips while a table's playing view is open, and dips further for a
moment when a hand ends at the table you sit at or watch, then comes back. It
does not dip for a hand that had already ended when you came in.

Everything is synthesized in the page (`src/js/poker-audio.js`): no audio files
and no network. Nothing sounds until the page has had a click or a key, and
leaving the room stops it.

## Chips and rules

- No-limit Texas Hold'em; blinds 5/10, free starting stack 1,000.
- Best five of seven cards, including ace-low straights; heads-up blind/action order.
- Integer chip accounting, side pots, uncalled excess refunds, ties and odd chips
  clockwise from the dealer button. Zero rake.
- The Raise input is the **total contribution for this betting round**, not the
  additional amount. A short raise is allowed only when all in. A short all-in
  does not reopen a player's raise rights unless cumulative action faced reaches
  a full raise. No betting into an uncontested dry side pot.
- Refills are free between hands when below 1,000. Auto deal refills busted bots;
  a busted human must choose a refill. Play a practice hand refills the visitor for free.
- These bananas are disposable play points, separate from the world's donation
  bananas. No purchase, cash value, player transfers, prizes or redemption.
- No Spark, wallet, payment processing, cash conversion, or outside-settlement
  feature was added. This is a product scope statement, not a legal assessment.

## Local practice shuffle and privacy

Each hand uses a fresh Fisher-Yates shuffle driven by `crypto.getRandomValues`.
Bounded integers reject the modulo-bias tail. If secure randomness is absent,
dealing fails before balances or the current hand are mutated. There is no
fallback to `Math.random`, no production seed override and no published deck.
Random cosmetic movement in existing avatar code is unrelated to cards.

The local module keeps its deck inside a closure and returns copied, filtered
snapshots. Bots use only their own filtered view. This reduces accidental
disclosure; it is **not a security boundary against the owner of the browser**.
The browser can replace code, ask for another viewer's snapshot, or change its
local state. Do not call this demo cheat-proof or provably fair. Simulation and
statistical tests cannot prove a particular hand was honestly shuffled.

## Local and shared table boundaries

`BL.pokerRules.create()` provides the local table implementation:

| Method | Meaning |
| --- | --- |
| `join(id, name, bot, seatIndex)` | Take a free seat between hands; default index selects the first free seat. |
| `leave(id)` | Stand between hands; rejects mid-hand removal. |
| `refill(id)` | Free refill below 1,000 between hands. |
| `start()` | Deal with at least two funded seats; reject overlapping hands. |
| `act(id, action, amount)` | `fold`, `check`, `call`, or `raise` to a total integer amount. |
| `snapshot(viewerId)` | Copied public state plus that viewer's cards and legal action. |
| `version`, `playing` | Change counter and active-hand status. |

Local practice owns ten instances under `world.poker`. Shared mode connects to
`server/poker/server.mjs` and uses `createSealed()` on the server and each client
verifier. Rules deal encrypted-deck positions. Plaintext enters the server only
through authorized community/showdown openings. Each browser decrypts its own
hole cards locally. Clients cannot select a remote snapshot viewer ID.

The service includes seat reservations, signed commands, per-table queues,
version/idempotency checks, deadlines, refunds and basic request limits.
The integration branch adds account binding, encrypted browser recovery, shared
walking presence and table/floor voice; see [poker-integration.md](poker-integration.md).
Durable server storage, deployment, production hardening and capacity beyond
the existing 32-person shared room remain separate work.

The new protocol uses proofs without publishing whole-deck seeds or private
keys. Folded-card privacy depends on the assumptions in the protocol document.
Independent review remains required. Refunds do not eliminate selective-abort
bias or collusion.

## Players at the tables

Every signed-in player seated at a table is drawn once, as the Ooga they drive,
sitting in their chair. The visitor's own Ooga sits in its chair while seated
and stands up when it walks the floor. Each page sends where its Ooga is, as it
always has; a position at chair height on a chair's spot reads as that chair
(`poker-presence.js`), so nothing new goes over the wire. One sitting pose
(`pokerModels.sitPose`, undone by `standPose`) seats the visitor, the stand-ins
and the cast members alike.

What a viewer sees depends on whether they are connected to the live tables:

- **Live.** A player is drawn seated only when the live table holds a human in
  that chair under the same name as the player's display name. Their own Ooga
  takes the seat, the stand-in is not built (or is taken down within a frame),
  and the table view shows their own Ooga's face. Anyone else at a chair, such
  as a player sitting at their own practice table, is hidden until they stand,
  so no figure stands in a seat the viewer can still take.
- **Not live.** A player at a chair is drawn seated when that chair is empty on
  this page, and hidden when this page's practice table has someone in it.

Two players at one chair: the lower room id is drawn, the other hidden. The
visitor's own chair is never given to anyone else.

A live seat falls back to the stand-in, with the stand-in's face, when the
player is not matched: their room connection is down or paused, the room
already shows 32 other players (the pool's cap), their body is hidden (for
example they drive the same Ooga as the visitor), or their display name
differs between the room and the poker service. When a match starts or ends
with no table event (a page drops, a player stands), the figure and the face
follow within a frame. A page with no backend sees the floor exactly as before.

Still to play-test: two real accounts at a live table; a rename between the two
services; a full table of nine real players; a player sitting down from the
aisle (their Ooga eases into the chair already in the sitting pose); cast
members' held items against the rail now that seated arms reach forward; and
the sitting pose by eye in each theme.

## Files and validation handoff

Floor modules: `poker-rules.js`, `poker-cards.js`, `poker-themes.js`,
`poker-models.js`, `poker-hud.js`, `scene-poker.js`. Shared-play additions:
`poker-crypto.js`, `poker-match.js`, `poker-worker.js`, `poker-live.js` and
`server/poker/`. Integration edits: `src/index.html`, `src/style.css`,
`src/js/scene-hub.js`, `package.json`.
Checks live in the existing `test/run.mjs`; no test framework or dependency was
added. The repository's browser driver and shared renderers were not modified.

The combined run passed **124/124 Node checks**: the 119 existing checks and
five protocol checks, including a nine-party encrypted hand, side pots,
folded-card privacy, native P-256 interoperability, tampering/replay rejection,
independent record replay and real worker clients over HTTP. The final focused
protocol run also passed **5/5 checks** after disconnect cleanup, including
release of abandoned seats and retention of cancellation/refund records. The build and syntax checks also passed. Existing checks cover payouts, odd
chips, secure-entropy failure, rejection sampling, turn/seat validation, snapshot
isolation, heads-up order, 300 nine-player settlements, spectator collision
lanes, pot presets including the call, short-all-in caps, closed raise rights,
public blind metadata and theme switching. The theme contract switches through
all five looks twice, checking that table pick targets, chairs, dealers and dealt
card nodes remain intact and that the scene returns to its original node count.
This is not a browser rendering or appearance test. Browser selectors were
updated for the lobby and focused view in the previous revision; those browser
sessions remain unrun.

Blocked: the three registered poker browser sessions (`poker floor and play`,
`poker canvas2d`, `poker phone`) each have streak 2 with
`DevTools socket closed: Chrome is gone`. No browser assertions completed.
The hub browser suite has not been run. Screenshots/performance/120 simultaneous
human players have not been validated. A maintainer should play-test the floor,
phone controls, and ₿IFRÖST mirror round trip before accepting or publishing.

For integration, apply the supplied patch to the pinned base or reconcile the
changed source/document/test files onto the latest `rock`. Do not overwrite
new upstream work with the whole snapshot. The source snapshot is supplied for
reproducibility, not as permission to revert upstream changes. The built HTML is
for local preview; the existing CI rebuilds the deploy artifact after merge.

## Interaction references

The original UI uses established table conventions, not copied branding or
site assets. Reference documentation consulted for this revision:

- PokerStars table appearance: https://www.pokerstars.com/help/articles/table-appearance-feature/
- PokerStars bet slider: https://www.pokerstars.com/is/help/articles/bet-slider-options/11042/?ooac=1
- GGPoker mobile controls: https://legal.ggpoker.com/blog/all-about-the-ggpoker-mobile-app/

No real-money features, promotions or cashier flows were carried into this game.
