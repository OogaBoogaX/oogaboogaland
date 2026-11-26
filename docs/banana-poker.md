# The Ember Den poker floor

Implemented against OogaBoogaX/oogaboogaland `rock`, inspected source snapshot
`e1c69776153a05794b3fc6da6af9b584a7820ebf`.

## Status

This build includes local practice and an **experimental encrypted-deck
multiplayer service**, private dealing, signed public hand records and an
independent verifier. It is not an audited or production-certified release.
The ten-table floor has one look, Banana Club. Read
[poker-protocol.md](poker-protocol.md) for the protocol, service commands,
security assumptions and hosting requirements.

The current interface revision adds a filtered table browser, a clearer betting
dock and live connection feedback, and the table view now shows the room
behind it, a face at every seat, the pot's chips and the dealer's own gorilla.
See [poker-interface.md](poker-interface.md)
for the interaction changes and remaining play-tests, and
[poker-integration.md](poker-integration.md) for signed-in deployment and recovery.

The local poker browser playthrough covers practice hands, the ₿IFRÖST return trip, Canvas rendering and a phone-sized layout. Player-eye captures of the Bitcoin hall and its rooms were taken on desktop WebGL. Listening to the music, evaluating motion on a physical phone and playing a live hand with two signed-in accounts still need a play-test.

## Exploring Banana Club

Follow the stream of amber blocks past the Bitcoin-orange Charging Bull to the Genesis Vault. The west bar holds a copy of the whitepaper. Walk up and use the action button or select the book to find the Cypherpunk Lounge. Look on the front of the central lectern for the founder’s pass, then take it to the layered ice door to enter Cold Storage. Inside the glacier cave, an ice carving of the ₿IFRÖST core glyph turns above a fractured plinth.

The hourglass on the west side of the promenade shows the observed block height. Gold sand drains according to the time since the tip and the recent average block interval. When a new tip arrives, the height lifts, a two-tone chime sounds, and all three diamond chandeliers cast orange light for three seconds. Opening the room on an existing tip is quiet. The sound follows the room audio controls.

Walk through the middle of the even-numbered table wall to reach the marble terrace. The brass telescope has controls for the Moon, black hole and Earth. At the portrait camera, use **Act**, take a picture and select **Save PNG**. Leaving the camera returns you to where you stood. The three plaques beside the booth rank settled player awards of at least 100 play chips observed by this browser. Returned bets are excluded. The board resets at 6 a.m. local time.

Gate 21 at the east bar leads to the rooftop. The gate opens on the twenty-first visit or when you win a share of a non-refund pot worth at least 100 play chips. That win also opens Cold Storage. Upstairs, there is a fireside bar, a second telescope and a copy of the Wall of Fame. A hooded figure walks the rail at 9:21 p.m. local time. The marked return control leads back to the gaming floor.

The vault-side jazz stage counts blocks until the next halving. The river, dome and Whale Watch aquarium also use recent transactions sampled by the existing mempool socket. A passing whale represents a transaction with at least 10 BTC in total outputs, including change. A new high in Kraken’s BTC/USD trading history brings up the hall lights and sounds a short fanfare. The first reading establishes a silent baseline.

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
players and deals. If every table is mid-hand, it keeps a seat at the table shown
and sits you down when that hand ends. Or choose any of the ten lobby table cards,
take a specific seat between hands, add up to three bots at a time, and deal when
ready. Every table has nine player seats plus a suited gorilla dealer. Two funded
seats suffice; there is no table owner or privileged host.

### Computer opponents and Ask Ooga To Move

When you walk in, every practice table nobody is playing at already has two to
five computer opponents in evening dress, spread round it, and they play real
hands among themselves whether or not you sit down. The count is fixed per table
(2, 4, 5, 3, then again), so two neighbouring tables never hold the same number.
No table ever holds more than five of them, so at least four seats stay open for
real players: **Add bots** and **Play a practice hand** stop at five. A table of
computer opponents deals its next hand five seconds after the last ends, or nine
when you are more than 25 m from it. A paused practice is left as it was.

A computer opponent's seat card in the table view reads **Ask Ooga To Move**.
Press it between hands and your Ooga walks to that chair, lifts the guest over
its head and gives you the controls back: you walk on carrying it, slower, while
it squirms. Aim with the camera at a window: the pane a throw would go through
is outlined in gold, and the bar at the bottom says what is wrong otherwise
("Aim at a window", "Too far: walk closer to the glass", "Aim higher"). Space,
the act button or **Throw** throws it: the pane shatters where the guest goes
through, the guest tumbles away into space, and the pane grows back within six
seconds. **Put down** or Escape sets the guest on its feet instead, and it walks
out through the mirror. Either way a guest walks back in through the mirror a
minute later, so the room does not empty. The seat is then free, and the panel
offers it like any other; nothing sits you there.

Pressed during a hand, the request waits: the card reads "Moves after this hand"
(a seat cannot empty during a hand) and your Ooga goes when the hand ends. If you
are sitting at a practice table when it starts, you stand and give up that seat
first, so the next hand cannot deal you in while your hands are full. Opening a
table view, taking a seat or switching between practice and live while carrying
puts the guest down; leaving the room drops it and heals every pane at once. A
seat you cleared stays empty for the rest of your visit.

On live tables there are no computer opponents and the server owns the seats.
There, up to five seats no player holds keep a seated guest's figure, the same
pattern of seats as practice, and Ask Ooga To Move works on those figures too:
only the figure moves, no seat changes. A figure is gone the moment a player
sits in its seat. While you are seated at a live table it asks you to leave the
seat first.

All of this is your page's own. Nothing about it is sent to the room: other
players see your Ooga walking as usual (the room is sent its place and head
pitch, not its arms), never the guest it carries. Nothing here
reads any seat's private cards: the opponents are the rules' own computer
players, and the figures read only who sits where.

Not verified: the live-table figures and Ask Ooga To Move on them (built behind
the same seam the live stand-ins use, but no check and no Worker has run them); how the throw
feels with a pad or on a phone; how a long walk to a far chair reads.

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

## Earlier marble hall design

This section records the hall before the Bitcoin interior pass. The Charging Bull now occupies the old fountain footprint, and the black marble promenade carries the transaction river. The room guide above describes the current layout.

Banana Club is a white marble hall, now a glass pavilion adrift in space, lit
for the evening. Its polished floor is a
diamond checker of white and nero marble, half of each, ringed by a border of
darker marble and divided by gold inlay lines. Down the middle runs a runner of
inlaid Bitcoin-orange marble, flush with the stone and framed each side by a
gold line and a band of nero, with a quiet rosette of Bitcoin marks in the
stone: square tiles, four across, each with four marks turned round its middle
and small light diamonds at its middle and corners, a shade darker than the
orange so they show when looked for and never shout from above. Three inlaid
compass roses on the same orange lie under the fountain, in the arrival band
and before the bar. Each side aisle is the same orange marble, framed in gold and
nero with one rosette tile across it, and each lounge stands on a framed orange
panel of two by two tiles; the high-roller table's inlay is orange too. There is
no red or maroon anywhere on the floor, and the gloss covers all of it but the
fountain's basin. Every vein and every mark is a flat piece laid from a
fixed seed: there are no textures or images.

There are no walls. On all four sides glass stands from a low veined white sill
to the cornice, in bays on slim gold posts and mullions with one gold transom,
between round marble columns with gold bases and capitals, each with a marble
abacus under the cornice, a gilt twin sconce whose candles flicker and two
small glowing uplight cups at its foot. At each end the posts stand under the
lunette's mullions, so the end reads as one window from sill to ridge. Outside
runs a narrow white marble terrace behind a gold balustrade, catching the
moonlight as a pale edge against space; below it, through the balusters, the
stars go on. The signs float where they were: the BANANA POKER lettering and
its welcome line on their deep green marble field, framed and backed in gold
and hung from the cornice on gold rods, the table names, the cashier's sign and
the ₿IFRÖST board over the arrival mirror, whose stone arch now stands free as
a gate with a marble back and an entablature. The bar's shelves and the cage
are finished behind, since they are seen through the glass.

The glass is the renderer's reflective glass: nearly clear face on, with a
faint cool tint, paler and catching a glint of the moon toward a glancing view,
so a wall seen down its length shimmers while a pane seen square on stays
clear; it takes little of the haze. The lower panes catch the lit hall as a
window at night does, a warm sheen fading up from the sill, which runs together
into a warm line along the walls.

There is no ceiling. From a stepped marble and gold cornice at the wall tops a
glass barrel vault rises along the hall to a ridge 16 m up: flat panes, nearly
clear with a faint cool tint, on slim gold ribs over the old beam lines, gold
purlins along the facet joins and a heavier gold ridge beam. Each end wall is
closed above the cornice by a glazed half-round lunette on fine gold mullions,
its middle left open. The chandeliers hang from the ridge on gold chains, and
each table lamp's cable from the purlin over its row on slim gold rods.

Outside the glass is ₿IFRÖST's night sky, the same sky its chamber shows, and
here it goes on below the horizon too, so every direction has stars:
twinkling stars and the brightest in halos, glinting stars, the galaxy band's
soft clouds crossing the vault and running on round under the hall, shooting
stars, and the ₿ ship that sails out of the ringed giant to the glinting stars
round it and back, with its exhaust. The band's clouds and the halos are drawn
rounder here than in ₿IFRÖST's chamber. The sky is composed for this hall.
Walking in from the mirror, the amber ringed giant hangs over the bar end, a
little to the right, clear of the chandeliers, its rings well open. A world
hangs low off each long side, so a seated player can look out at one: the red
world, large, off the left side toward the bar, a small ice world off the left
side toward the mirror, and the ice world, half lit, off the right side toward
the bar. The planets hold still while the stars turn slowly behind them. On
WebGL the renderer's own sky pass adds its deep blue gradient, its star field
and the moon, full and lit from the front, high to the left over the bar end.

On WebGL the polished stone mirrors the room, the orange runner included: the
chandeliers, lamps, tables, chairs, people and the bottle wall show upside down
in the floor, stronger at a glancing angle, while the carpets and rugs stay
matte. The reflection is one gloss sheet over the stone, added only on WebGL,
sharing the frame's two reflection captures with the
arrival mirror. The reflection now carries the roof too: the gold ribs as arcs
across the runner, the stars as specks, the ringed giant's glow in the orange.
The night is dark, so the reflected sky adds little light: the floor shows the
sky where it is darkest, over the nero diamonds and the runner's frame. Canvas
2D has no reflection.

The light is an evening's: the room's fill comes down and the lamps do the
work, warm pools under the chandeliers and over each table, darker floor
between, more bloom on the crystal, bottles and signs. Each of the ten tables
still sits in its own pool of light: over its felt its own lamp reaches further
than any other light. At the edges, where the marble walls' warm wash was, each
statue stands lit warm from a light low before its plinth, glowing against the
night, and that light catches the sill and the glass round it. The main light
is the moon's: it comes cool through the glass from the moon's direction, high
over the bar end to the left, as an accent beside the warm lamps; the columns,
ribs and furniture cast its soft shadows, while the glass frames and the
purlins cast none, so no grid lies over the floor. A thin warm haze deepens down the hall, thin enough
that the bar reads from the mirror, and the crystals, lantern glass, candle
flames, the cashier's sign and the whole sky stay crisp through it; the glass
takes little of it. On Canvas
2D, with no reflection, bloom or glow to carry an evening room, the room
keeps a brighter warm fill and no haze, and the sky is the renderer's night
gradient under the lighter sky's own stars and planets (Canvas 2D draws no sky
pass stars).

Three tiered diamond chandeliers hang down the room, and their crystal rings
glint, each ring on its own beat. A two-wing bar with a marble front and a nero
marble top stands backlit on the far wall, a brass cashier cage with marble
counters stands on the side wall near the mirror end, and the two far corners
are lounges with oxblood leather sofas, marble-topped low tables and palms.
Table 10 is the high-roller table: it stands on a red rosso marble inlay edged
in gold and keeps its glowing gold pinstripe. A short velvet rope between two
brass posts stands on the aisle side at each end of the table, not all round
it, and the stretch by the chairs is left open.

The tables are ornate: a turned marble pedestal with gold
bands, an oxblood padded rail round the felt, gold inlay rings on the green
felt and walnut chairs with carved backs, padded seats and gold finials. Each
floating TABLE name hangs on a dark green marble plate framed in gold.

Everything in the room is built for an Ooga at the game's own scale (a
middle-height Ooga stands 1.625 m, its hip 0.455 m up), and every figure in the
room is drawn at that scale. The felt lies at 0.78 m and the padded rail's top
at 0.915 m, so a standing Ooga looks down onto the felt and a seated one sees
well over the rail. In plan each table is 0.45 of the size it was built at for
a larger body: the felt is 3.94 by 2.52 m, nine chairs stand 1.42 to 1.47 m
apart round it with 2.8 m left for the dealer, and a card is 0.27 by 0.38 m and
a chip 0.15 m across, sized to an Ooga's hands. The padded rail keeps its
forearm-sized tube. The table view comes in with the table, so the felt fills it
as before. A chair's seat is 0.47 m high with 0.45 m of usable depth. A seated Ooga bends
at the knees, with the thighs over the cushion and the calves below its front edge. The
back pad meets the Ooga's back and its carved crest stands at 1.06 m, about a
seated Ooga's shoulder. Each chair's front is about 0.15 m from the rail, so a
seated Ooga is at the table. The table lamps hang 0.6 m lower than before, as
the tables came down 0.6 m, and closer together over the smaller felt. Fifteen
high-top cocktail tables (a small marble top at 0.95 m on a gold stem) stand
beside the tables, where guests gather in threes with their drinks, and each
table has two rings of watchers' places. The dealer
gorilla stands about as tall as a standing guest. Bar stools are 0.62 m at a
0.95 m counter whose marble is set back under the top; the cashier's counter is
0.95 m; the lounges' sofas and armchairs seat at 0.40 m with backs at 0.85 m;
the low tables are 0.38 m and the rope posts 0.9 m. Everyone seated, at a table,
on a stool or in a lounge, rests the hip about 0.16 m over the seat.

The furniture, the fountain and the statues' plinths collide with walkers. The lowest renderer tier
still spends its ten point lights on the ten tables; the room's three lights
follow, then the bar's two and the cage's, and the fountain's soft warm light;
the statues' eight lights come last, then the lounges' two lamps, used on the
top WebGL tier only (27 lights there, 17 on every other tier), so no tier lights some statues and
not their neighbours.

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
there. The picture shows the glass vault and the night over it:
the sky pass's gradient and stars and the planets where the room hangs them
(without the ship).

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
set of the same room: the checker cut into each floor tile's own top (its sort
cannot draw a flat laid over a larger face), the orange runner without its
marks, half the marble veins (at least one each), half the
turning on the columns, the table pedestals, rails and inlay rings, plainer
chairs, a coarser fountain basin and pool, three water strands and six
droplets instead of five and twelve, and a lighter leaf ring and skirt on each
statue, and a vault of three facets a side instead of five, with half the
purlins, a plain cornice band in place of the dentils and fewer lunette
mullions, and glass walls with posts and transoms but no mullions between them,
plain bars for balusters, no sconces, plain panes without the warm sheen
(Canvas 2D sorts translucent faces by depth and drew the sheen over the sill). The fountain and its figure, all eight statues, their plinths,
plaques, carved names and placards stay. WebGL draws the full set on every
quality tier. The sky is lighter on Canvas 2D and on the low tier (fewer stars,
plain band clouds, still planets).

### Still to play-test

These are open until checked by eye in the built page:

- glare from the white stone, the orange runner, the fountain's light and the
  white figures under the evening bloom, on each quality tier;
- the fountain's figure in three-quarter view beside its water, and whether the
  thin water strands read clearly;
- each statue's pose and held object from the aisle, and the carved names on
  the plaques;
- the table labels' new backing plates, and the padded rail against cards,
  chips and the dealer button;
- marble veins on large floor slabs on Canvas 2D (a vein can sort behind its
  slab there);
- the room in the ₿IFRÖST window's picture (now with the glass walls and the
  sky below the horizon), seen only as the encoded picture;
- a remote player whose last pose is where the pool now stands;
- the frame-rate lane with a full crowd in the hall;
- the evening hall and its reflection, judged so far only from still pictures
  taken by a capture script on one Mac: not yet watched in motion (flicker, the
  reflection's refresh every other frame on medium and every fourth on low,
  a resized window), not on another GPU, not on a phone;
- the glass hall (glass walls, terrace, the warm sheen, the sky below
  the horizon, the statues' lights), judged only from still pictures taken by a
  capture script on one heavily loaded Mac at 1280 by 720: not watched in motion
  (the candles' flicker, the sheen at the sill while walking), not on another GPU, a phone or another aspect;
- whether the glass reads as glass to a player: face on it is nearly invisible,
  and it shows itself through its frames, the warm sheen low on the panes and
  a pale sheen far down a wall;
- the ringed giant from the arrival and the promenade still has vault ribs and
  purlins crossing it (a glass house's lattice); it is clear of the chandeliers;
- the hall's frame cost with the statues' eight lights and the softened sky: the measurements were taken while other programs loaded the
  machine and are noisy (see the Task C report);
- the sky's composition from every seat (pictured from one side table and the
  middle table's seat only);
- the orange runner on the low tier, where it reads browner;
- the bar's bottles under the haze (they do not pierce it, being one mesh with
  the bar's wood);
- the ₿IFRÖST window's picture of the room, now in the room's evening light and
  haze, with the vault's night but without the gloss sheet or the ship; seen
  only in a capture of the encoded picture, never in the chamber itself;
- the glass vault and its night, judged from still pictures on one Mac at 1280
  by 720: not yet watched in motion (the ship's crossing, shooting stars, the
  slow turn of the stars, the sky in the floor while walking), not on another
  GPU, not on a phone or at another aspect;
- the composition after a long visit: the stars and galaxy band turn behind the
  still planets, about a degree every 12 seconds, so the band crosses the vault
  differently half an hour in;
- the sky on the low tier when the page boots there: the lighter sky is chosen
  at entry, and the captures forced the tier after entry, so they showed the
  full sky on low;
- the moon's light raking through the vault: its soft rib and column shadows on
  the floor, at 0.55 strength, and whether they read as pattern or clutter on
  the orange runner and the tables;
- the camera's long reach (450 m): no
  shimmer showed on the floor's inlays, marks or veins in the pictures, but it
  has not been watched on a GPU with a 16-bit depth buffer.

Cards now have rounded paper edges, proper suit shapes, corner ranks at both
ends, traditional numbered pip layouts, original double-ended Jack/Queen/King
portraits and identical navy-and-gold banana backs. `poker-cards.js` supplies
one cached vector design to both the tabletop meshes and inline HUD SVGs.
There are no card textures, remote fonts, external images or extra requests.
Only public community cards use face-up meshes; private tabletop cards remain
backs. The hand display has larger cards and accessible full card names.

The original card artwork remains in this poker-interface revision. Its appearance still needs local play-testing under the existing
browser-test stop instruction below.

## Banana Club

The room has one look, Banana Club: an evening white marble glass pavilion,
glass on all four sides under a glass vault, open to the ₿IFRÖST night sky
above and below, with a polished checker floor and a dark inlaid river,
gold columns, ornate tables, the polished orange Charging Bull, diamond
chandeliers, a backlit bar, a cashier cage, lounge corners and a roped
high-roller table.

₿IFRÖST's window into the room glows in the room's felt, lifted to glow, and its
picture shows the room. The chamber takes that picture once a page.

The room is reached through ₿IFRÖST's Ember Den window; no repository cave slot
is claimed. `poker-themes.js` holds the room's one palette and light record
(`club`), with `light` and `hang`. An older page saved a chosen look under
`ooga-poker-theme` in localStorage; nothing reads that key now. The lunar surface loads with the room. Its embedded NASA atlas rotates once in about 126 seconds. Overlapping impact craters form a darker ₿ in the near-side terrain.

## The floor

A crowd walks the floor, all dressed for an evening at a grand
casino. Every character is invented: every name ends in `/ember-den`, so none
can match a GitHub login, none is registered as a character or joins the
roster, and no display name is a contributor's handle.

- **Guests.** 56 who can walk: fifteen high rollers in dinner jackets (black,
  midnight, white, burgundy or green velvet) with bow ties and pocket squares,
  eighteen businessmen in dark suits and ties, twenty-two ladies in short cocktail
  dresses (some sequined, some with pearls) with heels and their hair up or
  down, and one comic drunk with a glass and a tilted hat. Many hold a clutch,
  a tumbler or a flute. The businessmen hurry, the ladies sway, the drunk weaves.
- **Cigars.** One suited man in ten smokes, chosen by a hash of his name (three
  today, walking or seated). A thin wisp rises from the lit end, and every 10
  seconds the smoke gathers slowly into a faint, soft Bitcoin B about a head's
  size over his head, holds about a second while it drifts, and comes apart: a
  wisp that only suggests the letter. The B is a grid of puffs on the floor's own
  mark, turned to face the view, so it never reads mirrored; Canvas 2D shows the
  wisp alone.
- **Staff.** Waiters with a tray of drinks held out level, security in dark
  glasses and one pit boss: four, three and one on a full floor.
- **Opponents.** Twelve characters who only ever sit at a table. Every
  computer opponent sits as one of them, never twice at one table, and a seat
  keeps its opponent for good. A human seat shows the hashed
  `Banana Bot <seat>` stand-in unless that player sits there as their own Ooga
  (below). When a seat changes hands, empties or is the visitor's, its old
  figure leaves the table.
- **The lounges.** Each lounge is a sofa and four oxblood armchairs round its
  low table, and every seat holds a woman in a little black dress with a
  martini (seven a lounge, outside the crowd's count). Each sips on her own
  timer and turns her head to whoever speaks or passes. Canvas 2D fills the
  sofas only. Two table lamps with glowing silk shades stand on each low table,
  and on the high tier each lounge has a warm light of its own. Security's
  strolls stop short of the lounges, so nobody stands among the armchairs.

How many walk follows the renderer: 64 on the high tier, 40 on medium, 24 on
the lowest and 12 on Canvas 2D. The day picks who walks, the same on every page:
the staff for that size, then guests in the day's order, with at most one
drunk; a smaller floor is always part of a larger one. Members are built at
least one a frame within a few milliseconds, so the room fills in about a
second.

Guests walk to the table rails, the bar stools, places standing at the bar,
conversation groups in the arrival band, by the fountain and down the
promenade, places at the side glass looking out at the planets, the cashier
cage and the ropes. They sit by a short slide, watch, talk and move on. The
waiters collect a Pizza Day Negroni and a HODL Old Fashioned at Whale Watch, deliver
them at two rails, and visit a third table before returning. The pit boss keeps the middle
of the floor, and security stands at the doors and ropes.

The crowd reads only what every player sees of a table: its pot, phase, hand
number, winner and whether anyone is all in. It never sees a card. A big pot
brings the pit boss to that table and leans the watchers in, an all in puts a
hand to their heads, and a win makes them cheer. Members speak short lines, at
most two bubbles at a time, greet a visitor who comes close, and the drunk
mutters. After his third stumble, security walks him to a bar stool.

Members give way to the visitor's Ooga, to other players and to the members
round them (looked up in a two-metre grid, not the whole crowd). A guest held
up for a few seconds goes somewhere else. The router serves up to six routes a
frame within 1.5 ms. Members are never walk blocks.

On an M-series Mac the high tier with 64 walking and 14 in the lounges draws
about 1,550 draw calls and 400,000 visible faces in the promenade view, at
about 9 ms a frame (8.85 ms measured; 48 walking measured 9.6 ms).

## The gaming floor

Between the poker tables stand two roulette tables and two craps tables, for
watching. They are set dressing: nobody can bet at them, they take no chips,
pay nothing, keep no score, save nothing and send nothing anywhere, and nothing
about them reaches the poker tables or anything a player can win or lose.
Hovering one says "Roulette · watch a spin" or "Craps · watch a throw"; a tap,
or the act button within a step of one, says only that they are for watching.

Each gaming table and its dealer share a space centered between poker rows
at x ±11, z ±6, with roulette and craps alternating
corner to corner, each a walk block with 2.3 m and more of walkway round it to
the poker tables' chairs. The cross aisles at z ±18 stay open. Each roulette
wheel and each craps table's far wall faces the promenade. A lamp hangs over
each from the same purlin as the poker tables' lamps, and on the top WebGL tier
each lamp casts a light, including in the ₿IFRÖST window picture. On arrival, guests
spread across the four rails within the current crowd budget and leave an approach open.
From the terrace, a floating bank of air-cooled mining rigs is visible low to the southeast.

The tables are at an Ooga's scale. The roulette table is 3.2 by 1.3 m on six
turned marble legs, its top at 0.88 m and its padded oxblood rail at 0.92 m (the
poker tables' rail height), with a wheel 0.86 m across set into one end: a dark
wood bowl, a rotor of 37 pockets (red, black and one green) with gold frets and
a gold turret, and a white ball. Its layout is the number grid in red and black
cells with the numbers lettered in the carved signs' alphabet, the column bets,
the dozens and the even-money bets ruled in white. The craps table is 3.8 by
1.6 m, its padded rail at 0.95 m over a chip groove, the felt sunk 0.2 m to
0.75 m, a wall of gold diamonds at each end, gold mounts at the corners, and a
flat-colour layout: pass lines, field, come box, the place numbers and a
proposition box. Its dice are 0.08 m cubes (real dice are about 0.016 m; at that
size they vanish from standing height), the shared die mesh with pips.

Each table is run by a gorilla in the dealers' jacket, at the dealers' scale:
the croupier stands behind the roulette wheel, the stickman at the middle of the
craps table's far long side with his curved stick. Guests are the room's own
crowd: six places round each roulette layout and seven along the craps rails
with the shooter's place at the end, taken through the crowd's places like any
other, so a table fills and empties as people stroll by. A table with nobody at
it still runs its cycle with its croupier alone.

- **Roulette, every 20 s:** the guests reach in and put chips down; the
  croupier calls no more bets and spins; the rotor turns one way and the ball
  runs the rim the other, slows, rattles down and drops into a pocket; a marker
  goes on the winning number; one or two guests cheer and the rest groan or
  shrug; the croupier sweeps the chips away.
- **Craps, every 15 s:** the stickman pushes the dice to whoever stands at the
  shooter's place (or to himself, with nobody there); the shooter shakes and
  throws; the dice fly down the table, hit the far wall and tumble to rest;
  the crowd leans in and cheers a 7 or 11 on the come-out, groans at 2, 3 or 12
  or a seven-out, and murmurs at a point (marked by the white puck on its
  number); the stickman rakes the dice back.

Now and then a guest says something ("Red again!", "Seven!", "Come on..."),
inside the crowd's two-bubble cap. The ball's rattle and drop, the dice on the
felt and the crowd's roar or murmur come from the room's own pooled voices,
placed by distance and side, well under the music, and not at all from a table
further than 18 m from the view.

Every outcome is for show: the wheel's pocket and the dice are drawn from the
module's own seeded generator, from the table and a running count of its spins
or throws, so no two tables match and nothing is shared with anyone. The wheel
is eased to stop on the pocket drawn and the dice to rest on the faces drawn.
Two tables of a kind run half a cycle apart. A table further than 30 m from the
view keeps its clock and outcomes but leaves its staff's arms still.

On Canvas 2D the tables are built plainer: fewer sides on the legs and the
wheel, no frets or numbers, half the diamonds; the wheel, ball and dice still
move and the guests still stand at them.

The module is `src/js/poker-games.js`. Not verified: how the tables feel to walk
round in live play with a full crowd, their look on a phone, the sounds by ear,
and the Canvas 2D set beyond one picture.

## Sound

The room plays four recorded lounge tracks by Kevin MacLeod (CC BY 4.0; see
[CREDITS.md](../CREDITS.md)). “Lobby Time” starts on entry, followed by “Cool Vibes,”
“Vibing Over Venus,” and “Bossa Antigua” in shuffled order. The hosted site
fetches the stereo recordings individually. The downloadable page includes
compact mono recordings for offline play. Each version decodes one track at a time.
On a direct launch, the first player gesture enables sound. When a track starts, a small line under the header names it for
six seconds ("♪ "Lobby Time" · Kevin MacLeod"); a tap on it, or on the brass
**Music** plate on the front of the bar, opens the credits, a page a track. The
synthesized music is the fallback, and fills the gap between tracks: a bass, a
piano and brushes in swing time, three tunes in turn with a short rest between
them. A browser that cannot decode the recordings hears the synthesized music
alone. Under it is the murmur of
the room, louder near the bar and the tables, with chips clicking at the tables
and glasses at the bar. The ladies' heels are heard where they step, quieter further away and to the side they are on.

The music plays on the speaker panel's **Music** row, the one every place's
music shares, and while you are in the room the panel shows **Room hum** for
the murmur and every placed sound. The table's own deal, turn and win sounds
keep their **Poker table** row. The page mute silences all of them.

The music dips while a table's playing view is open, and dips further for a
moment when a hand ends at the table you sit at or watch, then comes back. It
does not dip for a hand that had already ended when you came in.

Everything but the four recordings is synthesized in the page
(`src/js/poker-audio.js`); the recordings come from the page's own origin, never
another site. Nothing sounds until the page has had a click or a key, and
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
always has; a position at chair height (soles about 0.18 m up, within 0.1 m) on
a chair's spot reads as that chair (`poker-presence.js`), so nothing new goes
over the wire. A page from before the Ooga-scale chairs sends soles at 0.45 m
on the old, wider ring; for one release this page reads that as the same chair
too, though the old page still sees a newer player standing. One sitting pose
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
the sitting pose by eye.

## Table emotes

A player in the table view can send one of ten emotes from the Emote button
(`poker-emotes.js`). Each is one emoji sent as the room's existing reaction,
under the room's existing limit, so the protocol is unchanged and nothing new
goes over the wire. Six of them have a gesture, which the sender's seated Ooga
acts out over about a second and a half:

| Emote | Emoji | Gesture |
|---|---|---|
| Nice hand | 👍 | knocks the table twice |
| Good game | 🤝 | none |
| Wow | 😮 | both arms up |
| Phew | 😅 | none |
| Laugh | 😂 | none |
| Groan | 😩 | head in hands |
| Slow clap | 👏 | three slow claps |
| Thinking | 🤔 | none |
| Shrug | 🤷 | shrugs |
| Salute | 🫡 | salutes |

The emoji shows over the sender's face at their seat for as long as a reaction
shows on the floor, popping in and fading out (no motion under reduced motion).
A newer emote from the same seat replaces the older one, so a burst shows one at
a time. Any other emoji a player sends from the ordinary reaction bar also shows
at their seat, with no gesture. Every gesture starts and ends on the sitting
pose; one cut short by a newer gesture, by the player standing or by the chair
changing hands leaves no arm turned and no head bowed.

Who sees what:

| Sender | Their seat in the table view | On the floor |
|---|---|---|
| The visitor, seated | the emoji at their own seat | the emoji over their head, and their Ooga gestures |
| A live player matched at the viewed table | the emoji at their seat, for players and watchers of that table alike | the emoji over their head, and their Ooga gestures |
| A player seated in a chair that is open on this page's table | nothing (the seat shows as open) | the emoji over their head, and their Ooga gestures |
| A matched player at another table | nothing in this view; it shows there when the view switches to that table | as above |
| A watcher on the rail, or anyone with no chair (the visitor too) | nothing at any seat | the emoji over their head |

Computer opponents and live players' stand-ins do not emote. On a practice table
the visitor's emote shows at their own seat on their own page only, since that
table exists only there.

The button shows only while the page has a live room connection that takes
reactions and the visitor is driving an Ooga, which is when the room would
accept one; with no backend, or signed out, it never appears, and if the
connection drops it goes, taking an open menu with it. When the room refuses a
send (the page's own limit, or the connection just dropped) the button reads
"Not sent" until the menu next opens. The menu closes on a choice, on a press
outside it, when the table view closes, and on Escape; Escape closes the menu
first and leaves the table view only on the next press.

Still to play-test: two real accounts trading emotes at a live table; each
gesture by eye and on a wide-headed or hatted Ooga (so far only
Groan, Salute and Wow have been looked at, on one Ooga); the
knock, the slow clap and the shrug; the phone menu on a small phone; and a burst
at the room's limit.

## Tells and fidgets

Every seated figure, the visitor's Ooga, signed-in players, live players'
stand-ins and computer opponents alike, shows body language that follows the
hand without anyone choosing it (`poker-tells.js`):

| Tell | When | What shows |
|---|---|---|
| Sweat | the seat has been on its turn 5 seconds; two beads at 10 | a bead on the brow, then two, gone when the turn moves or the seat acts |
| Gulp | the turn reaches a seat facing a bet of half the pot or more | a short head dip and shoulder hunch |
| Fold toss | the seat's last action becomes Fold | the right hand flicks; its two card backs slide to the middle, shrinking away |
| All-in push | the seat's last action becomes All in | both arms sweep forward; a chip stack slides from its pile to the middle |
| Cheer | the hand's result names the seat a winner | both arms up |
| Slump | the hand's result shows the seat in the hand with no chips left | head down, arms dropped |

A blind is not a bet: the gulp needs a seat to have bet or raised, or gone all
in for at least the current bet, so a short stack's all in that only calls
does not count. Computer opponents never sweat. Turn time is counted on each
page from when it sees the turn reach the seat, so on a live table a bead may
appear a moment apart on two screens.

While a seat is in the hand and another seat is acting, it fidgets now and
then: riffling its chips, drumming the rail, or, once folded, only turning its
head toward the seat on turn. Fidgets come every 4 to 11 seconds, chosen at
random on each page, so they do not match across pages. Reduced motion turns
fidgets off and keeps the tells; it is read once, when the room is entered.

A chosen emote always wins over a tell; under it the fold toss, all-in push,
cheer and slump come first, then the gulp, then fidgets. Sweat is a mark, not a
pose, so it shows alongside any of them. Every tell and fidget starts and ends
on the sitting pose, and one cut short by an emote, by the player standing or
by the chair changing hands leaves no arm turned and no head bowed. On Canvas
2D the poses stay and the beads, cards and chips do not show.

On a practice table a computer opponent facing a big bet waits one second
longer before acting, so its gulp can play. Pausing a practice game holds every
tell where it stands.

Nothing goes over the wire: each page works the tells out from the table state
it already has, with no Worker, room or protocol change. The fairness boundary
is binding: the tells are handed only a public view of each table (the phase,
hand number, whose turn, the pot and current bet, and for each seat its round
bet, stack, last action, whether it is in the hand or folded, whether it is a
computer opponent, and the result's winners). No card is on it, so no tell, and
no computer opponent's wait, can differ with what a seat holds.

The browser checks for the tells passed in the controller's run. Still to
play-test: each tell and fidget on screen in the grand hall, and whether a full
table looks alive or twitchy; the bead's fit on a short, a tall and a remote
Ooga; the toss and push; the poses on Canvas 2D; two real
accounts at a live table; the frame-rate lane.

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
and public blind metadata.
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
