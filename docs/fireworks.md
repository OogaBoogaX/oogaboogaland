# Fireworks

Fireworks are bought, one Lightning payment each, and burst in the sky above the Timechain Sphere for everyone
on the island. They are a purchase, not a donation: they make no bananas, feed no pile and join no
donation tally.

| Kind | Price | What bursts |
|---|---|---|
| `pop` (Ooga Pop) | 10 sats | a peony in the board's colours, lower than the rest |
| `bolt` (Lightning Bolt) | 69 sats | a forked strike of electric sparks with its thunder |
| `mega` (₿ Mega Blast) | 100 sats | a gold ₿ inside a ring, glitter and coloured side bursts (four on the high tier) |
| `show` (the show pack) | 300 sats | two Megas, two Bolts and three Pops over about 8 s on three neighbouring slots |

## What is here

The engine, both renderers, the sound and the hub's wiring, and the stand that sells them: its screen, the page's
side of the purchase path (the Worker's two calls, `donations.js`, the director's `onFirework`), the countdown toast,
the plaque and the buyer's view. Under `?debug=1`, `__ooga.fireworks.launch(kind, id, { slot, at })` sets one off
without paying and `__ooga.fireworks.openStand()` opens the stand. With no API behind the page the stand simulates.

## Buying one

Space at the stand, or a tap on it, opens its screen in the donation popup's dialog: the four kinds at the API's
prices (`status.catalogue.firework`). Choosing one asks for its Lightning invoice at once (`POST /purchases/buy`,
the page sending only `{ category: "firework", item }`); the invoice offers the browser's own wallet in one click where it has one (WebLN, only
ever inside the visitor's click), OPEN WALLET, the QR and COPY. While only signed-in visitors may buy, a signed-out
visitor sees SIGN IN TO BUY; PREVIEW is free and only that visitor sees it.

When it is paid, every page hears it on the donation socket (a `purchase` in the `firework` category, with the
`slot` and `launchAt` fireworks add) and launches it at the server's `launchAt`,
3 s after settlement, on its own estimate of the server's clock. The toast counts down to it, naming the buyer. The
buyer's dialog closes and their view glides up from the stand to the arc over the Sphere, holds while the sky is lit
(Escape comes back early) and glides home. A page that hears a firework after its shells have risen skips them, and
a sound already past is dropped. The plaque on the stand's post is the API's top ten signed-in buyers
(`purchaseBoard` for `firework`), repainted only when it changes; a tap opens it in the board dialog.

The stand is generic over its items, and bananapayserver's purchase API over its categories, so the stand can become
the island's store when there is demand; only the items and what happens after a payment (here, watching the show)
are fireworks'.

- `fireworks.js` plans a launch once, from its id: `mulberry32(fnv1a(id))` draws every spark, so two pages
  given the same id draw the same show. A planned launch is admitted while the tier's cap (`CAPS`) and the
  65,536-sprite ring have room, otherwise it waits in a queue of 32. Admitted bursts are written in slices of
  at most 1 ms a frame.
- Each sprite is 16 floats: origin and start time, velocity and life, colour and size, drag, gravity, trail
  delay and kind. The flight is analytic, `p = o + v (1 - e^(-k t)) / k` with gravity under the same drag, so
  nothing moves on the CPU once a burst is written.
- `gl-renderer.js` draws the ring's ranges as additive, velocity-aligned quads after the line pass. The targets
  are 8-bit, so each sprite's colour is compressed (`c/(1+c)`) before it is written, and a share goes to the
  bloom target. The bursts' flashes light the island's meshes (`flash`), the four brightest glint on the sea and
  glow in the sky (`glints`), and the hub dims its sky while a show is up (`showLevel`).
- `canvas-renderer.js` draws at most 1,500 of the sparks alight as glowing squares: no streaks, glints or flash.
- `fireworks-audio.js` schedules every burst's sound from the engine's cues: report, body, crackle, sizzle,
  zap, thunder, launch thump and whistle, delayed by distance at the speed of sound.

## Cost

Nothing before the first launch: no sprite program, buffer or data, and no audio context. The program compiles
with the first launch, and the buffer and its data go 30 s after the sky has emptied. During a show the
tier's cap bounds the work, the writing takes at most 1 ms a frame, and the auto-tier takes no evidence from
those frames (`holdTier`), so a show never costs a visitor their quality tier.

| Tier | Cap | Pop | Bolt | Mega | Show pack |
|---|---|---|---|---|---|
| high | 60,000 | 983 | 3,867 | 9,512 | 29,701 |
| medium | 30,000 | 323 | 1,873 | 3,313 | 11,345 |
| low and Canvas 2D | 15,000 | 225 | 1,706 | 2,404 | 8,899 |

Sprites a burst writes, by tier. On an Apple M5 at 1536x1152 the standalone prototype's finale peak drew in
1.7 to 1.9 ms against 0.9 to 1.2 ms for the sky and island alone.

## Where it is seen

Over the Timechain Sphere. Six slots on an arc 200 m out along the Sphere's bearing, 12° apart and 150 m up, so even
the lowest Pop bursts well above the Sphere's top (`FIREWORK_SLOTS` in `scene-hub.js`). A launch takes the next slot
round the arc, a show three neighbouring ones. Seen from the pile, the meadow before the Sphere's stairs, the south
by the totems, the east rise and the north side, the whole show stands above the Sphere, day or night.

Rockets leave the rock north of the Sphere's stairs (`FIREWORK_LAUNCH`, 23 m out on the Sphere's bearing and 9 m to
its right). From the meadow below, every flight climbs too shallow to clear that 7 m wall; from its top, every flight
to every slot clears the rock by more than 20 m and the Sphere's shell by more than 8.

The stand stands with its back to the rock wall in front of the sealed cave at 9 o'clock, just right of the
Sphere's stairs, its booth over the sealed doorway and its front to the island's middle at the end of the path that
leads to that mouth (`FIREWORK_STAND_OUT` out of it, in `scene-hub.js`). `caves.js` marks that slot as the stand's
(`stand: "fireworks"`), and a check in the global tier keeps it sealed, since giving it a cave would put the stand
in the doorway; the stand is built only while it stays sealed. Its ground and the strip before it are claimed, so
palms and scatter stay off them. The rockets go up from the cliff top just behind it, and the buyer's view glides up
from the stand to watch, with the Sphere at the foot of the frame.

## The stand

A small attraction, readable from across the island (`stand-models.js`), built to the concept in
`images/fireworks-concept-stand.webp` and its four detail renders; the first concept sheet, with the three
fireworks, is `images/fireworks-concept-sheet.webp`:

- **Below:** a plinth of two courses of chunky mauve-grey stones with mortar joints, the upper set back, and a paving
  of warm bricks in grout inside a stone border. It is the stand's floor, half a metre up: a visitor steps onto it and
  walks the paving to the counter. A rope fence on posts runs round the paving, the two posts either side of the way
  in lit; painted crates of fireworks with bundles of rockets stand at its corners, and flowering greenery grows round
  the plinth's front corners and sides.
- **Above:** the FIREWORKS sign in big gold letters with a marquee of bulbs chasing round it, LIGHT UP OBL under it
  with a sparkle at either end, and four oversized voxel rockets standing on it before a palisade of stakes, a
  sparkle over each tip in its own colour and gold bursts in the greenery at the sign's corners, all twinkling.
- **In the middle:** a timber booth with a red and white striped canopy and a scalloped valance; a merchant counter
  with the terminal (BUY HERE), a painted cloth of the island under a burst and rockets on its ends; shelves stocked
  with boxes and bundles behind, a purple and a red starburst on them; and the vendor, an Ooga of no one's in a straw
  hat, looking about.
- **Either side:** a board in a heavy frame, its face from the counter's height up, greenery on its cap, and open
  framing behind it to the wall with a shelf of fireworks and a barrel. Tall corner posts fly blue sunburst banners
  that rock in the wind and string lantern ropes to the sign.
- **Left:** BUY A FIREWORK, the three fireworks with their icons and the server's prices (the show pack is on the
  terminal's screen, not the board), and how to buy.
- **Right:** TOP LAUNCHES under a gold crown: the fireworks ranked by launches over the last seven days
  (`purchaseCounts`), the show pack joining them once it has launches. A tap opens it in the board dialog, whose
  second page is the top buyers (`purchaseBoard`). With no API behind the page it counts this page's own launches.
- Lanterns at the canopy's corners light the counter at night and the fence's two lit posts the paving; the lantern
  ropes' four only glow.
- Within 30 m its stars twinkle, the marquee chases and sparks now and then fly from a rocket's tip; beyond, nothing
  of it moves. Its models build in two slices of the hub's sliced build (the plinth and greenery, 15 to 21 ms; the
  booth, 10 to 12 ms) and the stand in a third (about 25 ms). It is about 23,500 faces on 69 nodes, under 2% of the
  hub's 1.2 million, four pictures (about half a million texels, uploaded once and repainted only when prices or
  counts change) and four lights.
- On Canvas 2D the boards' faces, the banners' sunbursts and the pieces laid on faces sort nearer than what they lie
  on, and the plinth a little nearer than the ground; it draws the plinth in voxels, without the joints. The island's
  large ground polygons can still paint over the plinth's lowest course from some angles.

Space at the counter, or a tap on it or on the menu board, opens the stand's screen.

## Timing

`launch` takes `at` in scene seconds. With the purchase path, a firework bought on any page will arrive with a
server-stamped `launchAt` a few seconds after settlement, which each page maps onto its own clock, so everyone
sees the bursts together and a visitor who arrives mid-show sees the rest of it.

## Checks

The global tier runs the engine in Node: two pages write the same show from the same id, each tier holds its cap
with three shows and every kind bought at once, a show keeps to three neighbouring slots, and the sky ends empty
with its buffer released. The hub's `distant effects` session launches each kind and the show pack and checks the
hub holds nothing before or after; the Canvas 2D tour draws a show and leaves it mid-air. The perf lane holds a show pack in full view to its frame-rate floor while an Ooga moves.
