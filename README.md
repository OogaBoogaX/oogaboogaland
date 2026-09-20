# Ooga Booga Land

A small WebGL2 floating island whose cliff caves are projects. The open cave is a lab where donated bananas feed voxel cavemen who stand in for the contributors of [EntropyLab](https://github.com/OogaBoogaX/entropylab). Working Oogas load banana ammunition at the pile, run to their project's cave and shoot into it from outside, then return to reload. Visitors can poke the crew, roll the dice and watch donated bananas rain onto the shared pile.

Everything is plain JavaScript with no dependencies, no build requirement and two network connections: a websocket to mempool.space that makes the island's weather, and a once-a-minute poll of the oogatron stats worker that keeps the rim jumbotron's OogaBoogaX numbers live and launches fireworks from the board when a fresh contribution lands. Every transaction the Bitcoin mempool accepts rains on the hub, with bigger drops for heavier transactions, every mined block strikes lightning and rolls thunder, and the fee for the next block sets the weather, from sunny and dry to a full grey storm; the mapping is in [Weather](#weather). The time of day stays the island's real clock. Nothing is sent but the subscription. Payments are a simulator for now, and all visitor state stays in the visitor's own browser.

## Run it

Open `src/index.html` in a browser, or serve `src/` with any static server.

```sh
npm run serve   # build, then serve the built page at http://127.0.0.1:8080/
npm run watch   # the same, rebuilding on every change under src/
```

`/` is the built page as GitHub Pages serves it and `/src/` the unbundled sources, which
gives DevTools real file names; `PORT` picks another port. The server listens on loopback
only; `HOST=0.0.0.0` opens it to the network. Reload the tab after a rebuild.

The page lands on the hub. Tap the lit cave for EntropyLab; **Escape** or **Leave cave** brings you back. The 9 o'clock cave is **Ooga Rally**, a kart race — press **Space** nearby. A plane on its roof flies **Ooga Drop**, a skydive back onto the island, and a rope bridge off the south rim leads to the pad for **Ooga Orbit**.

The island keeps your local time and moves through dawn, morning, noon, dusk, night and midnight: torches light at dusk, butterflies give way to fireflies, and the crew gathers at the fire. Roster labels show yellow for clankin (a contribution within four hours), orange for chillin (through 48) and gray for sleepin, with a green dot while a human is in control. See the [activity data contract](docs/activity-contract.md) for the snapshot.

## The island

**W A S D** or the arrows fly, **Q E** turn, **R F** tilt, **Z** or **Space** up and **X** down; drag to orbit and scroll to zoom. On a phone the left stick moves and the right stick looks. Double-tap a caveman to walk in their boots, **Escape** to let go. **Space** jumps, and again in the air for a double jump. Stop beside a control, a bench or a launcher and **Space** uses it, the button reading **PRESS IN**, **PRESS OUT**, **START RALLY** or **FLY PLANE**. Scroll all the way in for first person, out for the trailing view and free flight. **PILE**, **LAB**, **MIRROR**, **HQ** and **BSMT** take your Ooga, or just the camera, to that destination. **FLYBY** flies the camera round the island along its trails, pausing at the gate, every cave, the plane and the launch pad, and going down through the headquarters and the basement on the way, before settling over the pile; any drag, scroll or key takes the camera back.

Walk through the lower half of a tree's foliage and stand on its canopy; trunks stay solid. The banana pile passes at half speed. Rock covers the part of the view crossing a surface, and faint outlines show what your Ooga can see while the camera cannot.

Walk off the edge and you fall: steer through an open window into HQ or the basement on the way down, or drop into the abyss and come back to the pile. Land on the clouds to walk their tops. One jetpack spins above a distant cloud — jump into it to collect it, then **J** wears it and a held **Space** climbs. A tank is eight seconds of **Space** or sixteen of directional flight, refilling in four on the ground. It comes off underground. 2140data needs no pack: he has thrusters in his feet and flies whenever he likes.

Two ramps inside HQ lead to a basement of rooms, each with a mattress whose pillow carries a LifeHash of its coordinates. Stand on a free one and **Space** or **SLEEP** lies down; **W S** turn onto stomach and back, **A D** face left and right, **WAKE UP!** gets up. Near a bench **Space** sits. Touch the fire and you burn: **Space** drops and rolls until it is out, and fire spreads by touch.

## Weapons

**G** equips or puts away the AK; **1** selects the club or primary melee weapon and **2** the rifle. **Left mouse** fires or swings, and holding a melee swing about a second charges it for half again the reach and damage. Hold **right mouse** to aim down the sights. **V** attacks as well, **R** swaps the loaded magazine for your fullest spare, and **Space** beside the pile eats and loads, six shots at a time up to 30. **Escape** or **Tab** frees the cursor.

A full spare magazine hides in a bush or a tree: click the hiding place, then touch it to collect. A character carries two and keeps them between scenes. Boxes, barrels and rocks break under weapons and drop a banana pickup, a magazine or a jetpack, the tougher ones more often; vegetation is not a target.

Bananas and club strikes pass through the OBL mirror with green glyph ripples. The first 20 damage spreads its cracks, then each of the 48 panels breaks under one melee hit or two AK bananas, leaving holes into the glyph room. Glass left standing heals after three quiet seconds; fully shattered, it stays broken until the page reloads and the gate controls entry.

## Ooga Rally

**W** accelerates, **S** brakes and reverses, **A D** steer, a held **Space** drifts (release for a boost, tap to hop), **E** or **Shift** throws the item, **Q** looks back, **0** resets the camera, **M** mutes and **Escape** pauses. Pick an Ooga, a ride (on foot, a Rock Kart or a Dino) and one of three tracks — Banana Bay, Lava Gorge, Frost Peak — then race three laps. Bananas fill a turbo meter and crates hand out a Rock, a Peel, a Turbo or an Ooga Shout. A podium finish offers the next track and **Cup** races all three. Now and then a race loads in the rain and the tarmac turns slick.

## Ooga Drop

Pick an Ooga and **Fly!**. The plane climbs in a circle (hold **Space** to hurry) and calls the mark once a lap; **Space** throws you out. In freefall **W S** pitch, **A D** roll and **Q E** turn, and the air answers like a flat plate: belly down is slow and steady, head down is fast, a tilt tracks you sideways. Fall through the hoops, then **Space** pulls the chute — **W** dives, **S** flares, **A D** bank. Any landing under the canopy is a good one and the pile is a great one; without a chute the impact picks its own ending. **0** resets the camera, **M** mutes, **Escape** returns to the board.

## Ooga Orbit

Build a rocket, engine at the bottom and pod on top: Volcano Jugs and a Tusk Nozzle push, Barrels and Nut Pods hold fuel, Vine Knots cut spent stages loose, fins keep the nose pointed and a shield sits under the pod. **Launch!** counts down and **Space** in the green lets go of the clamps. On the way up **W S** push while the autopilot flies the arc along the yellow line; **A D** steer and **G** flies by hand. Lean too hard in thick air and it tears apart. **Space** drops a dry stage and lights the next.

At low orbit, 500 up, the sky hook steadies the rocket over the islands. **Space** drops the rest and keeps the pod, then **Space** or **V** climbs out on a tether: **W A S D** fly where you look, **Q E** down and up, **Space** measures the space rock. One more **Space** leaves orbit, where **W A S D** turn the pod on puffs of air — shield first it survives, nose first it burns up. At **CHUTE**, **Space** pulls the leaf chute and **A D** steer it down. **0** resets the camera, **M** mutes, **Escape** returns to the builder.

## The Agent

Double-click the Agent to play it, exactly as you take an Ooga; double-click it again, double-click the ground or press **Escape** and it wanders off. Three quick clicks show its true colours for nine seconds, and inside the Matrix it always wears its code. **W A S D** walk, **Shift** gallops, **Space** jumps, **H** switches knuckle-walking and walking hunched, **C** beats its chest.

## Debug

**B** adds 100 test bananas, **L** a legendary tip, **P** fills the pile, **1** to **9** force a contributor to eat, **Shift+R** resets and **Shift+A** plays the Agent anywhere. The Konami code (up, up, down, down, left, right, left, right, B, A) opens a panel showing the live mempool.space socket: its state, message counts, the chain tip and next-block fee, the island's overcast and the last events.

`?scene=lab`, `race`, `drop` or `orbit` opens that scene, `?nosim=1` silences simulated tips and both live feeds, `?mempool=0` only the weather feed, `?oogatron=0` only the stats poll, `?canvas2d=1` forces the Canvas 2D fallback, and `?debug=1` exposes `window.__ooga`. AGENTS.md lists every debug flag: the clock, the starting view, character, weapon and ammunition fixtures, and the pile level.

## Weather

The hub's weather is the Bitcoin mempool, live over one websocket to mempool.space.

- **Rain** is transactions. Every transaction the mempool accepts falls as drops around the
  view, two to eight of them, bigger and faster for a heavier transaction (by virtual size,
  on a log scale from 140 vB). Big drops splash.
- **Thunder** is blocks. Every block mined while the page is open strikes a bolt near the
  view, flashes the sky twice and rolls a rumble half a second to a second and a half later.
  A toast names the block and its transaction count.
- **Overcast** is fee pressure: the median fee of the projected next block, on a log scale
  from 0.1 sat/vB (or an empty mempool), which is clear, to 20 sat/vB, the full storm. It
  scales how much each transaction rains; any overcast rains at least one drop. The first
  projection after connecting sets it at once, later ones walk there over 1.5 seconds, and
  swings under 0.05 are ignored.
- **The sky** is separate from the rain. It stays exactly as the island's real-time clock
  paints it until the overcast passes a clear band: a quarter at night, just over half by
  day, blended through dawn and dusk. Above the band the sky, ground and light grey and dim
  and fog closes in, in proportion. The clock itself is never touched, so a shower can fall
  under a clear noon sky and clear weather at 3 AM is a clear starry night.

| Next-block fee | Overcast | Rain | Daytime sky | Night sky |
|---|---|---|---|---|
| empty mempool | 0.00 | dry | clear | clear |
| 0.34 sat/vB | 0.23 | drizzle, one drop a transaction | clear | clear |
| 1 sat/vB | 0.43 | light | clear | light cloud |
| 2 sat/vB | 0.57 | moderate | first cloud | cloudy |
| 5 sat/vB | 0.74 | steady | partly grey | grey |
| 10 sat/vB | 0.87 | heavy | grey | dark grey |
| 20 sat/vB and up | 1.00 | full | full storm | full storm |

The socket is off under `?nosim=1` and `?mempool=0`. The Konami code from the Debug section above
opens a panel with the live socket state, counters, the chain tip and next-block fee, the
overcast and cloud values, and the last events.

## Test

```sh
npm test
```

Runs a headless Chrome suite over the DevTools protocol: real drags, clicks, and keys against the page, with a clean console required. Needs Node 22 or newer and Chrome; the driver looks for Chrome at the macOS application path, so on Linux or Windows set the `CHROME` environment variable to the binary. There are no npm dependencies. `npm test` runs the fast lane; the full gate is `npm run test:full`.

## Build and deploy

```sh
npm run build
```

Writes `oogaboogaland.html` at the repo root, a single self-contained page with the stylesheet and every script inlined and the content policy pinned to their hashes. The page is gitignored: pull requests carry only sources, and CI commits the deployed page back after each merge to `rock`. Deploy that one file, served as `index.html`. Nothing under `src/` goes to a server.

To add your Ooga, add one file to `src/characters/` named after your GitHub handle; the existing files show the shape and AGENTS.md lists every option. `npm run characters` lists everyone, and `npm run characters:json` prints the same cast as database rows.

GitHub Pages deploys through `.github/workflows/pages.yml` on pushes to `rock`, every ten minutes after refreshing the Oogatron activity snapshot, or manually with **Actions → Deploy GitHub Pages → Run workflow**. It rebuilds the page and uploads only `_site/index.html`, a copy of `oogaboogaland.html`, to https://oogaboogax.github.io/oogaboogaland/. The repository's **Settings → Pages** source is **GitHub Actions**, and no `CNAME` file is needed for a custom domain.

## Privacy

No analytics, no personal data, and two external connections: the mempool.space websocket, which receives public chain data, and the oogatron stats worker, which serves public org activity numbers; neither sends anything about the visitor. The roster lists public contributor handles only. The donation handle and message a visitor types are stored in their own localStorage and nowhere else.

## License

Ooga Booga Land is released into the public domain under [The Ooga Booga License](LICENSE) — a caveman-speak dedication of the software to the public domain, with the same meaning as The Unlicense: free to copy, modify, publish, use, compile, sell, or distribute, in source or binary form, for any purpose and by any means, with no warranty of any kind. Any and all copyright interest in the software is dedicated to the public at large.

## Contributing

Read [AGENTS.md](AGENTS.md) first. It describes the module layout, the engine patterns the code relies on, how to add props, swag, behaviors, and HUD elements, and the checks every change must pass.

For a character of your own, click **2140data** on the island: he hands over a prompt that describes the whole job, ready to paste.
