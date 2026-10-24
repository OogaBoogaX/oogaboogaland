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

The engine, both renderers, the sound and the hub's wiring. Fireworks launch only under `?debug=1`, through
`__ooga.fireworks.launch(kind, id, { slot, at })`. Buying them (bananapayserver's purchase path, the Worker's
calls, the stand by the pile, its leaderboard plaque, the countdown toast and WebLN) is the next step.

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

The stand goes in that meadow, on the right of the stairs and about 10 m out from the wall, so a visitor standing at it
looks up the stairs to the show above the Sphere. Pressed against the wall, the rock would fill the view. The buyer's
view glides up from the stand to watch, with the Sphere at the foot of the frame.

## Timing

`launch` takes `at` in scene seconds. With the purchase path, a firework bought on any page will arrive with a
server-stamped `launchAt` a few seconds after settlement, which each page maps onto its own clock, so everyone
sees the bursts together and a visitor who arrives mid-show sees the rest of it.

## Checks

The global tier runs the engine in Node: two pages write the same show from the same id, each tier holds its cap
with three shows and every kind bought at once, a show keeps to three neighbouring slots, and the sky ends empty
with its buffer released. The hub's `distant effects` session launches each kind and the show pack and checks the
hub holds nothing before or after; the Canvas 2D tour draws a show and leaves it mid-air. The perf lane holds a show pack in full view to its frame-rate floor while an Ooga moves.
