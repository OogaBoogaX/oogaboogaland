# Ooga Booga Land

A small WebGL2 floating island whose cliff caves are projects. The open cave is a lab where donated bananas feed voxel cavemen who stand in for the contributors of [EntropyLab](https://github.com/OogaBoogaX/entropylab). Working Oogas load banana ammunition at the pile, run to their project's cave and shoot into it from outside, then return to reload. Visitors can poke the crew, roll the dice and watch donated bananas rain onto the shared pile.

Everything is plain JavaScript with no dependencies. The base project reads public chain data for the Mempool island's weather and polls the oogatron stats worker once a minute to keep the rim jumbotron's OogaBoogaX numbers live and launch fireworks when a fresh contribution lands. The chain snapshot sets rain, snow and wind; transactions gust the precipitation and mined blocks strike lightning and roll thunder. The mapping is in [Weather](#weather). The time of day stays the island's real clock. Donations are a simulator for now, and visitor state stays in the visitor's own browser.

DSB Land additionally uses public Bitcoin feeds, radio and media services as described below. Zuzu currently uses local mock replies and deterministic fallback; its provider-neutral backend is prepared but not deployed.

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

The island keeps your local time and moves through dawn, morning, noon, dusk, night and midnight: torches light at dusk, butterflies give way to fireflies, and the crew gathers at the fire. Roster labels show yellow for clank (a contribution within the hour), orange for chill (through 24 hours) and gray for sleep, with a green dot while a human is in control. Commits, pull requests, reviews, merges and comments across every OogaBoogaX repository all count, and the live oogatron poll wakes a sleeper into a walk out of the HQ minutes after they contribute. See the [activity data contract](docs/activity-contract.md) for the snapshot.

## The island

Fly around the island with **W A S D** (or the arrows), **Q E** to turn, **R F** to tilt,
**Z** or **Space** up and **X** down; drag to orbit and scroll to zoom. On a phone the left
stick moves and the right stick looks. Double-tap a caveman to walk in their boots: the same
keys or stick walk them. **Right-click** while carrying a weapon enters third-person
shooting view with that weapon. **Space**
(or the **JUMP!** button) jumps: press once from the ground, then once more for a double
jump. Release between jumps; both reset after landing. While walking or airborne,
Space keeps its jump action. Stop beside a reachable control, bench, or Ooga Rally/Drop
launcher to use it with Space. The action button changes to
**PRESS IN**, **PRESS OUT**, **START RALLY**, or **FLY PLANE** while that control is nearby.
These actions work from every direction without needing to face them; the car's
platform and the plane's wings have room around them to activate the launcher. Click or tap
decorative props to interact with them. Walking into the lit lab cave enters it.
**Escape** lets go. Camera modes are **first-person**, **shoulder**, **orbit**, and
**detached**. The first three stay focused on the selected Ooga; detached is free roaming.
The leftmost equipment button shows only a face-on portrait while an Ooga is selected.
Press the portrait to switch between battle and carry mode without changing the camera
mode; **X** performs the same toggle. Hold it until the orange underline fills to detach. Detached mode shows the roaming
compass with five dots below it for Pile, Lab, Mirror, HQ, and Basement: press the compass to cycle
them, or press a dot to go directly there. The active dot turns orange and its destination
name briefly appears below the button.
Trees stay compact: you can walk through the lower half of their foliage and
stand on their upper canopy. Trunks and roots remain solid.
The banana pile's stone platform requires a jump; walking into its edge stops you.
The primary-weapon and **AK-47** buttons appear above the jetpack controls while driving an awake Ooga.
The primary icon matches that character's melee weapon. Click either button to select
its weapon without changing your view. In zoomed-out carry view, pressing the selected
primary button charges a swing and releasing strikes; a quick release pokes instead.
Its compact vertical gauge starts at 50% damage, rises to 100% for a brief press, and
fills to 200% when fully charged. The selected primary button also pokes, swings, and charges
in every battle view. Clicking the selected AK button targets the closest visible
shootable item along the character's facing direction in carry view, adjusting vertically
as needed (or firing straight ahead if none is present), and uses the reticle in battle mode. **G** still
switches between weapons. When the rifle is put away, its compact count
shows loaded and spare rounds together. Equipping a weapon keeps your
current view. In carry mode, the stock rests by the front of the leg,
with the right hand lowered on the grip and the barrel angled up toward the
left hand, which turns to cradle the wooden grip.
Scrolling in changes orbit to shoulder view. In orbit battle mode the pointer stays captured,
the Ooga faces the view, and the reticle snaps vertically to the nearest clear target directly
ahead. The ring stays the same size and draws over the selected Ooga when their body
covers the target. Shot spread still grows with distance; a target beside the Ooga is hit
automatically. With no target, shots travel horizontally ahead. Right-click enters
shoulder view while retaining an acquired target. Third person uses an
above-head right-shoulder camera that keeps the whole character visible, with the
crosshair near the top of the head and over the right arm; first person keeps the
eye view. A page loaded directly in first person starts in battle mode with mouse-look focused;
the first canvas click upgrades it to unrestricted pointer lock. Shoulder and first-person
show a centered aiming reticle only in battle mode; switching to carry hides it without
moving the camera. While aiming, the left arm hangs naturally and swings with
walking. In battle mode, **WASD**
strafe and backpedal relative to the view without turning away from the target.
**Left mouse** fires the equipped gun or swings the primary melee weapon. A quick
click fires three bananas; holding continues into full auto at the same shot cadence.
Releasing during full auto stops immediately, keeping the exact remaining ammo.
Hold **right mouse** to aim down the gun's sights
or focus melee aim, tightening the view and slowing mouse sensitivity. Left-click
still attacks while right-click is held. **Space** reloads beside the pile and jumps
elsewhere (hold it to climb with a jetpack); **R** swaps the AK's loaded magazine with your fullest spare
while in shooting mode. In third-person battle view, tap **Shift** to smoothly switch shoulders,
or hold **Shift** with **A/D** to plant your feet and lean. **Escape** or **Tab**
frees the mouse for UI controls and pauses mouse aiming. The next click on the island
hides the cursor without attacking; subsequent clicks fire or swing while it is hidden.
**1** selects the club or assigned primary melee skin; **2** selects the rifle and
carries the primary weapon diagonally across the back. Neither key changes the camera; **X** toggles
battle and carry without changing it. In battle mode the club is held outward: a quick left-click
release pokes forward for half damage; a brief press swings for normal damage.
Hold longer to raise the weapon and charge up to double damage, then release to strike.
The same duration-based gestures work with a mouse, trackpad, or the melee button.
Focused aim boosts an ordinary swing to 150%; a full charge reaches 200%, without multiplying those bonuses.
The arm and wrist extend toward the aimed spot for the weapon's full reach. An orange
melee reticle selects the object that receives the hit. Axe pokes preserve the blade's
orientation. After an attack in carry view, the weapon stays ready for half a second,
then smoothly lowers back into its carry pose over a quarter second.
Scroll inward from orbit to the closest view to enter shoulder view with the
last selected melee weapon or rifle, swooping toward the point under your cursor.
The pointer glides into the centered aiming dot along with that camera transition.
In shoulder and first-person views, four separated arcs show the rifle's shot spread: bananas cluster around the dot
with a normal distribution bounded by the circle. Holding right-click tightens
both the circle and the spread smoothly while the dot stays centered. Focused rifle fire sends
one banana per click, including successive quick clicks.
The center dot turns green over reachable friendly characters and orange over
reachable interactive objects; red is reserved for enemies. It stays neutral when
the target is blocked or beyond the equipped weapon's reach. A brief pulse in the
target's color confirms an actual banana or club hit. The club uses its extended
reach. Characters take damage from hits; shots to the head or helmet deal twice
body-shot damage. MrHodlX's entire helmet and mask count as part of his head.
If a wall between the camera and character blocks that view, the camera moves
into shoulder position while the character keeps their existing aim.
Each scroll gesture stops at shoulder aim;
pause, then scroll inward again for first person.
Scroll outward once for shoulder aim, then again for centered navigation and
further zooming out; one large outward scroll from shoulder aim can pull all the
way back. Zoom follows your chosen angle with a gentle added downward tilt,
keeping the distant view shallow. Leaving shoulder view beneath a ceiling starts horizontally;
after you adjust the orbit angle, further zooms preserve that angle.
Zooming out keeps your selected weapon equipped. Mouse clicks on the island attack
only in battle mode; the weapon buttons also work in carry mode.
Focus returns to the character at the start of the outward zoom, even if you stop scrolling partway.
Moving the mouse moves the pointer; drag to rotate the camera as before.
**Escape** or **Tab** releases the normal browser cursor.
Burning keeps your selected weapon and equipment, and you can still shoot, poke, or swing.
Press **Space** to drop and roll. First-person follows the rolling head, with embers and
then soot covering the view according to the fire's severity.
**V** also uses the selected weapon. Each rifle burst has one kick and flash per banana.
While you control a worker, putting the rifle away carries it on their back. The expanded control shows an
exact count out of **30** and thirty tiny banana indicators. The rifle's magazine window holds nine banana marks,
each representing three shots, with another three shots in the hidden chamber.
Each character keeps their ammunition between cave visits.

A vine bridge off the south-east rim crosses to the **Mempool island**, a rainforest islet where a cave reads the chain out in stone: the fee ladder as a rank of stalagmites, the five fee tiers as torches burning at their own heights, the tip carved on a tablet under a stalactite that fills between blocks, and the difficulty epoch as a wall of notches. A board across the hole from the bridge gives you the block height, the price, the mempool count and the fastest fee without going down, and the small post beside it opens the weather key. A stairwell winds down the middle of the island; tap it to go down. **LADDER**, **TIERS**, **CHAIN** and **EPOCH** move the camera between the readings, and **Escape**, **Leave cave** or the lit stair mouth (tapped or flown into) brings you back. Poke the jaguar, the monkey and the toucan, and shake the trees, ferns, bushes, flowers and fallen logs the way you would at home.

The banana pile passes at half speed. Rock covers the part of the view crossing a surface, and faint outlines show what your Ooga can see while the camera cannot.

Repository activity is tracked separately for each character and project. After a
magazine and a refill, workers visit their next recently active repository's open
cave in turn. Workers fan out on either side of the entrance, forming staggered
rows when the front row fills. They keep their rifles selected throughout the work cycle
and shoot at different points inside the cave, leaving the central path open.
After the last shot they briefly hold their empty rifle aimed, then lower it across
the body for the return to the pile. A worker with ammunition in their spare swaps it
in and empties it at the cave first, then returns to fill the AK and spare before the next trip.
The rifle stays held while filling its own magazine and goes on the back while filling the spare.
Walkers favor their right side of each curved path and leave room for one another.
Returning workers peel off near the pile for the closest open reload slot;
chilling Oogas and those heading to sleep go around active firing areas.
Chilling Oogas rest for a staggered 30–90 seconds between strolls, while still
moving promptly out of active work areas and responding to control or new activity.
Chilling walkers wait before crossing an approaching worker's route, then continue
once the worker has passed. Releasing a working Ooga sends them straight back to
their cave if they have ammunition, or to a free pile slot if empty, avoiding
obstacles on the way. Normal path-following resumes after that trip.
EntropyLab is the first registered work cave; adding a repository to
an open cave's `repo` field includes it in this rotation. See
[the activity data contract](docs/activity-contract.md) for the Oogatron snapshot
integration. Historical snapshot dates do not imply current activity.
Debug mode seeds three workers, three chilling Oogas, and two sleepers.
A separate dot before each roster name is green while a human controls that Ooga
and gray while offline; activity labels stay visible in either case. Hovered names
keep their existing dot colors: green while human-controlled, otherwise the activity
color. Future live global state can use the same presence indicator.

Walk off the edge and you fall: steer through an open window into HQ or the basement on the way down, or drop into the abyss and come back to the pile. Land on the clouds to walk their tops. 2140data needs no pack: he has thrusters in his feet and flies whenever he likes.

Two ramps inside HQ lead to a basement of rooms, each with a mattress whose pillow carries a LifeHash of its coordinates. Stand on a free one and **Space** or **SLEEP** lies down; **W S** turn onto stomach and back, **A D** face left and right, **WAKE UP!** gets up. Near a bench **Space** sits. Touch the fire and you burn: **Space** drops and rolls until it is out, and fire spreads by touch.

The jetpack starts spinning above a cloud beyond the island. Reach that cloud and jump
into the pack to collect it. The pack belongs to the Ooga who collects it: its compact
button appears only while that Ooga is selected, and stays hidden in detached mode or while
controlling another Ooga. Click it or press **J** to put that Ooga's jetpack on or take it off. The compact button
keeps a vertical fuel gauge visible and expands to the width of both weapon buttons to show a yellow fuel bar while the pack is worn. With the jetpack equipped,
tap **Space** on the ground for a weighted hop, half the height of a normal jump,
or hold it to keep climbing under thrust. Clicking an Ooga still shows a talking
bubble without making them hop.
A fresh press while airborne resumes thrust without adding another jump; a nearby
action still takes priority on its press. Thrust beneath the island glides outward
along the rock, past its stepped underside.
The jetpack icon and fuel bar on the left show the remaining fuel. A full tank lasts
eight seconds using **Space** or sixteen seconds using directional movement while
airborne. Combining both adds their fuel costs, lasting about 5.33 seconds. Walking
on the ground uses no fuel. Directional flight emits sparks at half the rate of Space;
combining both adds their spark rates too. Releasing the controls pauses fuel use
while airborne. Fuel refills in four seconds on the ground, including while the pack
is off. Empty fuel stops thrust and lets the Ooga fall without granting extra jumps.
Without thrust, falling uses the same gravity and speed with or without a jetpack,
regardless of its remaining fuel.
Landing with less than 20% fuel puts the jetpack in recovery until fuel recharges above
20%. During recovery, **Space** and the **JUMP!** button perform the standard double
jump even with the pack equipped; nearby controls still take priority. Toggling the
pack does not refill it or clear recovery. Entering the underground HQ, basement, or
their access ramps takes the pack off without losing it; it cannot be equipped there, except
inside the basement's central shaft. Fly up through that opening from below the
island; the pack comes off once you clear its lip onto the basement walking ring. The
compact button remains visible but disabled underground, and can equip the pack again
after returning above ground.
When its owner sleeps, the pack rests against the wall behind the bed beside their
primary and secondary weapons.

## Weapons

**G** switches between weapons; **1** selects the club or primary melee weapon and **2** the rifle. In battle mode, **left mouse** fires or swings: a quick release pokes for half damage, a brief press swings for normal damage, and a full charge reaches double damage. Hold **right mouse** to aim down the sights. **V** attacks as well, **R** swaps the loaded magazine for your fullest spare, and **Space** beside the pile eats and loads, six shots at a time up to 30. **Escape** or **Tab** frees the cursor.

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

**B** adds 100 test bananas, **L** a legendary tip, **P** fills the pile, **1** to **9** force a contributor to eat, **Shift+R** resets and **Shift+A** adds a roaming Agent in the hub or plays the Agent in other scenes. The Konami code (up, up, down, down, left, right, left, right, B, A) opens a panel showing the live mempool.space socket: its state, message counts, the chain tip and next-block fee, the island's overcast and the last events.

`?scene=lab`, `race`, `drop` or `orbit` opens that scene, `?nosim=1` silences simulated tips and both live feeds, `?mempool=0` only the weather feed, `?oogatron=0` only the stats poll, `?canvas2d=1` forces the Canvas 2D fallback, and `?debug=1` exposes `window.__ooga`. AGENTS.md lists every debug flag: the clock, the starting view, character, weapon and ammunition fixtures, and the pile level.

Add `&status=clankin`, `&status=chillin`, or `&status=sleepin` with `debug=1` to force
every character's activity for the session. The setting survives hub/lab visits and
activity refreshes, and clankin characters can work at EntropyLab. It also applies with
`solo`; selecting a sleepin character keeps them asleep until you wake them normally.
Taking control still works, and releasing the character returns them to the chosen activity.

## Weather

The weather is the Bitcoin mempool, and it stands over the Mempool island as a cell rather than following you around: from the home island you watch it rain or snow over there under your own clear sky, and it closes in once you cross the bridge. Three readings come out of the chain and name one of
eight standing states, so it rains for as long as the pool is full rather than in bursts.

- **Soak** is how full the mempool is: its backlog in whole blocks, on a log scale, mixed with the
  fee pressure of the next projected block. It sets how hard it comes down.
- **Chill** is how slowly blocks are landing. Block spacing is erratic by nature, so a slow run is a
  cold snap and the rain turns to snow; a negative difficulty retarget leans the same way.
- **Gale** is how fast transactions are arriving. It sets the wind, which leans the rain and blows
  the snow sideways.

| State | When |
|---|---|
| sunny | an empty or nearly empty pool |
| light rain / rain | a filling pool, blocks landing on time |
| thunderstorm | a full pool |
| monsoon | a full pool with transactions pouring in |
| flurries / snow | a filling pool while blocks run slow |
| blizzard | a full pool, slow blocks and a hard arrival rate — the island whites out |

**Lightning is blocks.** Every block mined while the page is open strikes a bolt over the island,
flashes the sky twice and rolls a rumble half a second to a second and a half later, whatever the
weather is doing — a clear sky included. A thunderstorm also strikes on its own between blocks. No
two bolts look alike: eight forked shapes are built once and picked at random, turned and mirrored.

**The sky is separate from the rain.** It stays exactly as the island's real-time clock paints it
until the soak passes a clear band — a quarter at night, just over half by day — so a shower can
fall under a clear noon sky and a quiet night stays a clear starry night. The clock itself is never
touched.

The feeds are off under `?nosim=1`; `?mempool=0` stops the socket and `?chain=0` the REST polling.
`?chain=esplora` pins the fallback provider, and `?chain=https://host/api` points at your own.
The Konami code from the Debug section opens a panel with the live socket, the pool, the three axes
and the current state.

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

No analytics. The base project reads public data from these endpoints; services receive normal network request information:

- the mempool.space websocket, for public chain events;
- mempool.space's REST API for the mempool backlog, fees, difficulty and hashrate, falling back to a public Esplora instance (blockstream.info) if it stops answering;
- Coinbase for the bitcoin price, falling back to Kraken and then mempool.space;
- the oogatron stats worker, for public org activity numbers.

`?nosim=1` silences these base-project feeds, and `?chain=0` stops the REST polling alone. The roster lists public contributor handles only. The donation handle and message a visitor types are stored in their own localStorage and nowhere else.

DSB Land also contacts the feed, radio and media services described below; its live-data toggle controls its Bitcoin feeds separately. Radio song requests and invoice monitoring contact the station. Zuzu currently uses local mock replies and deterministic fallback and sends no conversations to an AI provider; the provider-neutral backend is not deployed.

## License

Ooga Booga Land is released into the public domain under [The Ooga Booga License](LICENSE) — a caveman-speak dedication of the software to the public domain, with the same meaning as The Unlicense: free to copy, modify, publish, use, compile, sell, or distribute, in source or binary form, for any purpose and by any means, with no warranty of any kind. Any and all copyright interest in the software is dedicated to the public at large.

## Contributing

Read [AGENTS.md](AGENTS.md) first. It describes the module layout, the engine patterns the code relies on, how to add props, swag, behaviors, and HUD elements, and the checks every change must pass.

For a character of your own, click **2140data** on the island: he hands over a prompt that describes the whole job, ready to paste.

## DSB Land

The 10 o'clock cave opens **DSB Land**, adding the sixth active hub gate. Walk to
the back wall to enter its tunnel, then toward the arched, pale-yellow light
with W / Up or the left touch stick. Four recordings play once per visit, in order,
with the Journey kazoo cover quiet beneath them and footsteps following movement.
The passage preserves the selected hub Ooga using its current canonical model and glances gently with
each voice. A skippable 13-second arrival tour shows the plain and supporting turtle;
reduced-motion preferences skip the tour automatically.

WASD moves, dragging looks around, and the mouse wheel adjusts the shared hub camera.
**Turtle view** shows the whole world; **Walk** returns to the entrance area.
The river is the outer ring. Beside the southern dock are the stone return cave and
marked **Bitcoin coaster** station. The raised coaster circles the plain inside the
river, clear of the cave and dock roofs. Both vehicles run continuously and stop for
eight seconds at their stations. Walk near a station and use **Take a ride** when the
vehicle is waiting; an unavailable button announces its next arrival. Both rides have
a forward first-person view with limited mouse dragging. **Leave ride** disembarks at
the station. Enter the stone cave to reveal **Return to Ooga Booga Land**.

Walk near the meme stand and choose **Visit meme shop**. Each visit starts with 20 demo
tokens: bananas and tomatoes cost one, banana bread costs three, with nine of each
allowed. **Eat snack** / B eats bread or a banana; **Throw tomato** / T throws a tomato,
and tapping a local Ooga aims at them. Shop purchases are simulated; characters are local.

The nearby **Use TV** button opens a centered five-channel menu. Channel 1 is Noderunners
Radio; 2-5 say **Soon added**. The station supplies current song, queue and recent history,
refreshed every 15 seconds with outages labelled. Search for a song inside channel 1,
select it to request the station's Lightning invoice, then scan its QR, copy it or open
a Lightning wallet. Payment remains an explicit action in the visitor's wallet; the TV
polls the station for payment and queue confirmation. Closing an invoice stops local
monitoring; it does not cancel an invoice at the station. An official jukebox link and
QR remain available. Audio buffering can delay playback behind the displayed metadata.

Closing the TV keeps its broadcast audible across DSB Land, louder nearby and quieter
farther away. **Music** and **Ambient** are independent; **Mute** silences everything.
The Journey track plays only in the tunnel. Radio outages retry while ambient sound
continues. **Play radio** resumes playback if the browser requires a gesture. Procedural
river, waterfalls, boat motor, crowd and wildlife sounds follow nearby sources.

The Bitcoin sky and coaster connect automatically. mempool.space supplies backlog,
fees and block height; Coinbase Exchange supplies BTC-USD one-minute candles and ticker
updates. Each coaster lap uses a stable snapshot of completed candles, replaced at the
station. Prices are scaled and clamped for safe track clearance. Feed outages retain
last received data; unavailable initial data is explicitly labelled demo. **Live data
on / off** pauses or resumes these feeds. All connections and visit resources close on exit.

A direct visit is `?scene=dsb`; `?debug=1&scene=dsb` exposes `__ooga.dsb`.

### Zuzu

Zuzu is DSB Land's physical black cat. Approach her and choose **Talk to Zuzu** for a compact free-form conversation panel. Replies are currently clearly labelled local mocks, with deterministic fallback; no real AI provider is connected. Conversation history resets when leaving DSB. The provider-neutral backend foundation is documented in [server/zuzu/README.md](server/zuzu/README.md); it is not deployed or bundled into the game.
