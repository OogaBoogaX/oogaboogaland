# Ooga Booga Land

A small WebGL2 floating island whose cliff caves are projects. The open cave is a lab
where donated bananas feed voxel cavemen who stand in for the contributors of
[EntropyLab](https://github.com/w-s-bitcoin/entropylab). Contributors eat when they
have committed recently, sleep when they have not, and hand-build lab equipment between
meals. Visitors can hand-feed bananas, poke the crew, roll the dice, and open loot
crates to dress the cavemen in swag, on the island and in the cave alike.

Everything is plain JavaScript with no dependencies, no build requirement, and no
network access. The page cannot make a request, payments are a simulator for now, and
all visitor state stays in the visitor's own browser (for now).

## Run it

Open `src/index.html` in a browser, or serve `src/` with any static server.

The page lands on the hub: a floating island whose cliff caves are the projects. Tap the
lit cave to enter EntropyLab; **Escape** or the **Leave cave** button brings you back.

Fly around the island with **W A S D** (or the arrows), **Q E** to turn, **R F** to tilt,
**Z** or **Space** up and **X** down; drag to orbit and scroll to zoom. On a phone the left
stick moves and the right stick looks. Double-tap a caveman to walk in their boots: the same
keys or stick walk them, **Space** (or the Ooga! button) eats from the pile, opens a crate,
pokes a neighbour, shakes a tree, rustles a bush, rolls a die or flips a card, and walking
into the lit cave enters it. **Escape** lets go. Lost? **0** or the **Reset view** button
brings the camera home.

One jetpack is hidden on the island, under a different bush, rock, crate, barrel or flower on
every load. Shake the right one and it drops; walk an Ooga into it to put it on. After that,
**hold Space** (or the **Blast off!** button) to climb, and fly with the same keys or stick.

Keys: **B** test tip, **L** legendary tip, **P** fill the pile, **1** to **9** force a
contributor to eating, **Escape** leave a cave or let go, **Shift+Delete** clear the loot
locker, **Shift+R** reset the demo.

URL flags: `?scene=lab` opens the lab directly, `?nosim=1` silences simulated tips,
`?canvas2d=1` forces the Canvas 2D fallback, `?yaw=1.2` sets the starting camera angle,
`?debug=1` exposes `window.__ooga`.

## Test

```sh
npm test
```

Runs a headless Chrome suite over the DevTools protocol: real drags, clicks, and keys
against the page, with a clean console required. Needs Node 22 or newer and Chrome; the
driver looks for Chrome at the macOS application path, so on Linux or Windows set the
`CHROME` environment variable to the binary. There are no npm dependencies. A full run
takes about five minutes.

## Build and deploy

```sh
npm run build
```

Writes `oogaboogaland.html` at the repo root, a single self-contained page with the
stylesheet and every script inlined and the content policy pinned to their hashes. It is
committed with the sources; rebuild it whenever they change. Deploy that one file, served
as `index.html`. Nothing under `src/` goes to a server.

## Privacy

No analytics, no external requests, no personal data. The roster lists public
contributor handles only. The donation handle and message a visitor types are stored in
their own localStorage and nowhere else.

## Contributing

Read [AGENTS.md](AGENTS.md) first. It describes the module layout, the engine patterns
the code relies on, how to add props, swag, behaviors, and HUD elements, and the checks
every change must pass.
