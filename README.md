# Ooga Booga Land

A WebGL2 floating island whose cliff caves are games. Voxel cavemen stand in for the contributors of [OogaBoogaX](https://github.com/OogaBoogaX); donated bananas feed them, the live Bitcoin mempool makes the weather, and a once-a-minute poll of the oogatron stats keeps the rim jumbotron's numbers live. Plain JavaScript, no dependencies, no build requirement, read-only network connections only. Payments are a simulator for now; visitor state stays in the visitor's own browser.

## Run it

Open `src/index.html` in a browser, or serve `src/` with any static server.

```sh
npm run serve   # build, then serve the built page at http://127.0.0.1:8080/
npm run watch   # the same, rebuilding on every change under src/
```

`/` is the built page as GitHub Pages serves it and `/src/` the unbundled sources; `PORT` picks another port and `HOST=0.0.0.0` opens the server to the network. Reload the tab after a rebuild.

## The island

The page lands on the hub. Fly with **W A S D**, **Q E** to turn, **Z**/**Space** up and **X** down; drag to orbit, scroll to zoom. On a phone the left stick moves and the right stick looks. Double-tap an Ooga to walk in their boots: **Space** (or **JUMP!**) jumps, twice for a double jump, and uses the control, bench or launcher beside you. **Escape** lets go.

With an Ooga selected, **X** or the face button switches between combat and carry.
Combat has **first-person**, **shoulder**, and **birds-eye** views. Scroll outward
from shoulder to move directly overhead, initially halfway to the maximum height;
scroll farther out to rise, or inward to descend and smoothly return to shoulder.
In birds-eye, the mouse points the Ooga toward the world position under the cursor;
it does not rotate the camera. Roofs and upper floors blocking the current level
are cut away for this view, including inside caves, HQ, and the basement, and aiming
uses that visible level. Carry mode retains its freely angled orbit camera. Debug links accept
`mode=birds-eye` and `combat=1|0`; copied pose links use the same combat terminology.

The island keeps your local time from dawn to midnight. Roster labels show yellow for clank (a contribution within the hour), orange for chill (24 hours) and gray for sleep; commits, pull requests, reviews, merges and comments across every OogaBoogaX repository count, and a fresh contribution wakes its sleeper. Working Oogas load banana ammunition at the pile, run to their project's cave and shoot into it. Tap the jumbotron's screen for a close-up you can page through.

The 11 o'clock cave is **EntropyLab**, the 9 o'clock cave **Ooga Rally**, the plane on the rally roof **Ooga Drop**, and the rope bridge off the south rim leads to **Ooga Orbit**. A vine bridge at 4 o'clock reaches the **Mempool island**, whose cave reads the chain out in stone. Every game opens on a title card; **Enter** or its button starts it, **Escape** or **Leave** brings you back.

Two ramps inside HQ lead to a basement of beds: **Space** lies down, **WAKE UP!** gets up. Walk off the edge and you fall through an open window into HQ, or into the abyss and back to the pile; land on the clouds to walk their tops. A jetpack spins above a cloud beyond the island: jump into it to collect it, **J** puts it on, hold **Space** to climb. 2140data has thrusters in his feet, and his plating runs green while the coin is up on the day and red while it is down.

Repository activity is tracked separately for each character and project. After a
magazine and a refill, workers visit their next recently active repository's open
cave in turn. Workers fan out on either side of the entrance, forming staggered
rows when the front row fills. They keep their rifles selected throughout the work cycle
and leave the central path open. Firing places have a clear view through the doorway;
workers reposition if cover blocks their muzzle rather than spending ammunition on the wall.
After the last shot they briefly hold their empty rifle aimed, then lower it across
the body for the return to the pile. A worker with ammunition in their spare swaps it
in and empties it at the cave first, then returns to fill the AK and spare before the next trip.
The rifle stays held while filling its own magazine and goes on the back while filling the spare.
Each clank or chill Ooga has a full-sized gorilla companion. Working gorillas run on
all fours outside. Crossing EntropyLab's entrance instantly gives them an upright
posture and lab coat. They rotate between coding at desks, using wall touchscreens,
and taking glassware from the benches to inspect and swirl before returning it.
Incoming bananas disappear at the entrance with the mirror's glyph ripples;
crossing bodies leave the same shaped glyph outline on that plane. The center
monitor shows the supplied EntropyLab wallpaper and is never a workstation.
The lab has a larger, full-height interior with solid rock around it. In other work
caves, gorillas take banana hits across their bodies, stand, beat their chests, jump,
and pound the floor to build equipment. Inside caves, arms and shoulders may pass
through other gorillas while torsos avoid each other and full bodies avoid scenery.
A gorilla stays inside when its Ooga reloads for the same cave.
When the next cave changes, it runs ahead on all fours and waits inside that cave.
Gorillas take direct routes across grass and paths. The banana pile and the circular
path around it stay off limits.
They look ahead with their full body and arm clearance and follow a consistent
side around obstacles. Under low tree crowns they stay on all fours and back out
without turning when the passage is too tight. They run through entrances rather
than jumping at the doorway.
Chilling companions favor the unused cave roofs, occasionally climbing down to
rest on the outer grass away from the banana pile. They sit, lie on their backs or
either side, lean back on one or both arms, and sometimes sit together to pick bugs
from a companion's back. Occasional slow glances and arm adjustments break up their rest.
They are already in place when the world appears. Gorillas can cross the mirror
with its normal contact ripples.
Gorilla control is temporarily disabled. When enabled, double-tap a companion to control it. WASD or the move stick walks it;
Shift runs. In carry mode, move the cursor to select things or drag to turn the camera;
ordinary clicks do not attack. **X** or the gorilla's face button toggles combat/carry
without changing the camera view. Scroll between orbit and shoulder views. Combat
hides the cursor, mouse movement turns the view, and the gorilla faces forward.
Hold left-click or the smash button to charge a ground pound; release to bring
both fists down. Right-click beats its chest, and the drag button grabs a nearby
Ooga by the foot for two seconds. The action buttons work in either mode.
Escape or Tab frees the combat cursor; the next click
on the island recaptures it without attacking. Hold Space or the jump button
to crouch and charge, then release to leap. A full charge reaches three times an
Ooga's single-jump height; gorillas cannot jump again in midair. Gorillas can land on
solid props and walk off them again, and Oogas can jump onto a gorilla and ride its
moving body. Near a wall or ledge, Space and the action button offer **CLIMB UP**
or **CLIMB DOWN** instead of charging a jump. On the wall **W** climbs up and **S** climbs down (the move
stick's forward/back directions do the same). The torso stays close to the wall,
with spread hands and legs extending down. At the top it folds over the lip onto
all fours; at the bottom it lowers and turns away before walking off. Walking over
a ledge turns the gorilla toward the wall to descend; release forward, then press **S** to continue.
The edge grab also works when there is no known landing below: the gorilla stays
attached to the cliff instead of walking into freefall. Away from climbable edges,
holding and releasing Space still charges a jump. Hold the face button, or press Escape with the cursor already
free, to return the gorilla to its owner's routine. Gorillas catch fire
on contact with flames: Space or the jump button becomes drop-and-roll until
the fire is out, leaving soot that fades. Uncontrolled gorillas roll automatically.
Working Oogas favor their right side of each curved path and leave room for one another.
Returning workers peel off near the pile for the closest open reload slot;
chilling Oogas and those heading to sleep go around active firing areas.
Chilling Oogas take direct routes across grass and paths and do not eat or reload
automatically. They rest for a staggered 30–90 seconds between strolls, while still
moving promptly out of active work areas and responding to control or new activity.
Chilling walkers wait before crossing an approaching worker's route, then continue
once the worker has passed. Releasing a working Ooga sends them straight back to
their cave if they have ammunition, or to a free pile slot if empty, avoiding
obstacles on the way. Normal path-following resumes after that trip.
NPC movement has an independent progress check: a blocked walker starts backing
up or sidestepping within about a second, clearing stale routes and waiting
claims. Lab gorillas take turns making room with short, collision-checked moves.
A checked clear position is the fallback after eight seconds of failed recovery.
A brief speech bubble marks recovery; intentional rest, active lab work and
player control are left alone.
EntropyLab is the first registered work cave; adding a repository to
an open cave's `repo` field includes it in this rotation. See
[the activity data contract](docs/activity-contract.md) for the Oogatron snapshot
integration. Historical snapshot dates do not imply current activity.
Debug mode seeds three workers, three chilling Oogas, and two sleepers.
A separate dot before each roster name is green while a human controls that Ooga
and gray while offline; activity labels stay visible in either case. Hovered names
keep their existing dot colors: green while human-controlled, otherwise the activity
color. Future live global state can use the same presence indicator.

**Weapons.** **G** switches, **1** is the club, **2** the rifle. Right-click enters the shooting view. **Left mouse** fires or swings: a tap pokes, a press swings, a hold charges to double damage. **R** swaps magazines, **Space** beside the pile reloads. Boxes, barrels and rocks break and drop pickups. The OBL mirror cracks, breaks panel by panel and heals when left alone.

## Ooga Rally

**W** accelerates, **S** brakes, **A D** steer, a held **Space** drifts (orange, blue, then purple the longer you hold; release for the boost), **E** throws the item (brake while throwing a rock to send it backward, or while dropping a peel to lay it ahead), **Q** looks back, **Escape** pauses. Hold **W** through the last count for a rocket start; hold it earlier and the wheels spin. Every lap reads against your record lap. Trackside rocks and trees stop a kart.

Pick an Ooga, a ride and one of three tracks, then race three laps. On foot boosts hardest and recovers fastest from a spin, a Dino charges its drift quickest, a Rock Kart is simply fastest. Bananas fill a turbo meter, crates hand out items, snowballs roll across the peak's ice, and some races load in the rain. A podium offers the next track, **Cup** races all three, and a gold Cup opens **Mirror**.

## Ooga Drop

Pick an Ooga and **Fly!**. The plane climbs in a circle (hold **Space** to hurry), counts 3, 2, 1 and calls JUMP; **Space** throws you out high above the first hoop. In freefall **W S** pitch, **A D** roll, **Q E** turn: belly down is slow, head down is fast, a tilt tracks you sideways. A marker on the next hoop shows where you are heading; through the middle is a bullseye, all eight a clean sweep. **Space** pulls the chute, **W** dives, **S** flares, **A D** bank. Any landing under the canopy is good and the pile is best; a soft touchdown and a low pull pay extra. Every jump lays its own course.

## Ooga Orbit

Build a rocket, engine at the bottom and pod on top: tap or drag parts onto it. **Launch!** counts down and **Space** in the green lets go of the clamps. On the way up **W S** push while the autopilot flies the arc; **A D** steer, **G** flies by hand. Push or lean too hard in thick air and it tears apart. **Space** drops a dry stage; drop one still burning and its fuel goes down with it.

At the Sky Top, 500 up, the sky hook holds you over the island. **Space** drops the rest, then **V** climbs out on a tether with forty seconds of air to measure the space rock, somewhere new each launch. **Space** again drops home: shield first survives, nose first burns, **Space** pulls the chute at the call and **A D** steer it to the pad. A cheaper rocket that still makes it scores thrift, a quick climb scores pace, a hand-flown climb scores too, and a fireball never medals.

## Ooga Mine

Not open yet: its cave stays sealed, but `?wip=mine` opens it for anyone.

A Bitcoin mining tycoon, and the lesson is margin: every machine earns hash and burns power, and the profit bar says whether the operation is making money. Drag gear from the shop onto a lit spot or tap to place it. Crack the banana rock (**C**), take a loan, put up a Rack and drag a Thunder Box into it. Newer models launch through the hour, each doing more hash for the same power; when the pads run out, dig into the Rack Hall and the Big Cave.

The network climbs every few minutes (buy just after a retarget for the whole epoch at the old difficulty), and at 30:00 the reward halves. Power comes off the grid at a moving price: lock it with a contract, build your own, keep a battery for outages. Each chamber has its own circuit and cooling: overload trips a breaker, heat slows machines and starts fires. Fires eat along a rack and jump to the next; take a Fire Stopper off the wall (**Space** beside it) and carry it over, or beat it out by hand for five seconds. A box about to melt down glows red for ten seconds: pull it in time and it only dies.

You are the Ooga you walked in as: **W A S D** walk, the mouse or **Q E** turn, **Space** (**WORK** on a phone) works on whatever is beside you, **V** looks round the cave. Tap a job in the list to look at it. Mine 21 coin before the hour is out; the faster, the better the medal, and the hour plays on with the score still counting. **Shift+S** sells coin, **P** pauses, the run saves as you go, and the cave waits while you are away.

## The Agent

Double-click the Agent to play it; double-click again or press **Escape** to let it go. **W A S D** walk, **Shift** gallops, **Space** jumps, **H** switches gaits, **C** beats its chest. Three quick clicks show its code.

## Weather

The weather is the mempool and it stands over the Mempool island. **Soak** (the backlog paying at least 1 sat/vB, averaged over ten minutes) sets how hard it rains in six steps: dry, drizzle, light rain, rain, heavy rain, downpour. **Gale** (how many vbytes a second arrive) sets the wind. Every block strikes lightning and rolls thunder, and a downpour throws extra. The sky stays as the clock paints it until the rain is falling hard.

## Debug

`?scene=lab`, `race`, `drop`, `orbit` or `mine` opens that scene; `?nosim=1` silences the simulator and every feed, `?mempool=0` the socket alone, `?chain=0` the REST polling and the price socket, `?oogatron=0` the stats poll; `?canvas2d=1` forces the Canvas 2D fallback; `?debug=1` exposes `window.__ooga`. **B** adds test bananas, **L** a legendary tip, **P** fills the pile, **Shift+R** resets. The Konami code opens the live feed panel. AGENTS.md lists every flag and fixture.

## Test

```sh
npm test
```

A headless Chrome suite over the DevTools protocol, a clean console required. Needs Node 22 or newer and Chrome (`CHROME` points at the binary off macOS). `npm test` is the fast lane; `npm run test:full` the full gate.

## Build and deploy

```sh
npm run build
```

Writes `oogaboogaland.html`, one self-contained page with the content policy pinned to its hashes. It is gitignored: pull requests carry sources, CI commits the page back after each merge to `rock`, and GitHub Pages serves it as `index.html` at https://oogaboogax.github.io/oogaboogaland/. Nothing under `src/` goes to a server.

To add your Ooga, add one file to `src/characters/` named after your GitHub handle; click **2140data** on the island for a prompt that describes the whole job. `npm run characters` lists everyone.

## Privacy

No analytics and no personal data. Read-only requests, nothing about the visitor sent: the mempool.space websocket and REST API (falling back to blockstream.info's Esplora), Coinbase Exchange's websocket feed for the live price and the day's open (falling back to Coinbase Exchange, Kraken, Coinbase spot and mempool.space over REST), and the oogatron stats worker. The roster lists public contributor handles only; the donation handle and message stay in localStorage.

DSB Land additionally contacts public Bitcoin feeds and radio/media services. Radio song requests and invoice monitoring contact the station; payment remains an explicit action in the visitor's wallet. Zuzu uses local mock replies and deterministic fallback and sends no conversations to an AI provider. Its provider-neutral backend is prepared but not deployed.

## License

Public domain under [The Ooga Booga License](LICENSE), a caveman-speak dedication with the meaning of The Unlicense.

## Contributing

Read [AGENTS.md](AGENTS.md) first: the module layout, the engine patterns, how to add things, and the checks every change must pass.

## DSB Land

**DSB Land has no cave slot. Ooga Mine owns c10.** To visit DSB, control an
Ooga and use the chest-height Dialer beside the basement Pit Stargate. Destination
1 is DSB Land; destinations 2–5 are disabled: “Quarantined - Replicator Infestation -
Clean Up In Progress”. Activation takes approximately two seconds, followed by a
ten-second ACTIVE traversal window. Physically cross downward through the active
Pit to travel. An inactive Pit retains its ordinary abyss behavior.

Outbound travel uses the one-way white-light transit cave. Hold W / Up or push the
left touch stick forward, then cross the **back** of the upright Stargate. Only
that crossing constructs DSB Land. Ordinary hub play, opening the Dialer, dialing,
activation and waiting construct no DSB Land; transit has no land rides, shops,
TV, Zuzu, land data subscription or outdoor radio. Four recordings accompany the
passage when audio is available; audio never blocks movement or completion.
The selected Ooga is rebuilt with its current canonical model. Safe emergence
leads into the skippable 13-second, 360-degree arrival tour; reduced motion skips it.

To return, use the DSB Dialer beside the same upright gate. Destination 1 is
OogaBoogaLand; 2–5 remain quarantined. After the same two-second activation, cross
the **front** during its ten-second ACTIVE window. Return goes directly to the hub,
without the transit cave. The receiving Pit is active while the Ooga rises through
it, moves outward and lands safely beside the Dialer. Controls resume and the gate
shuts down without an immediate reverse transition. Escape can cancel an unfinished
transit; it does not bypass the return Stargate from DSB Land.

The upright Stargate is at (0, 2, 28), with its Dialer at (3.7, 0, 27). The Meme Shop
at (-14, 0, 18), facing +90°, and NodeRunner TV at (14, 0, 18), facing -90°, face the
central plaza. Their collision, interactions, radio source and Zuzu destinations
follow their landmark transforms.

WASD moves, dragging looks around, and the mouse wheel adjusts the shared camera.
**Turtle view** shows the whole world; **Walk** restores the player view. The river
is the outer ring, with a southern boat dock and a marked **Bitcoin coaster**
station. Both rides stop for eight seconds at their stations. Approach and use
**Take a ride** while a vehicle waits. Both have a forward first-person view with
limited mouse dragging; **Leave ride** disembarks at the station.

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

The Bitcoin sky and current BTC/USD price consume the existing page-owned chain
service: vsize (mapped as `Math.min(1, vsize / 1e8)`), recommended `fastestFee`, tip
height and price. DSB opens no duplicate Mempool polling or live Coinbase socket.
Freshness uses separate observation timestamps: 90 seconds for backlog, fees and
price, 180 seconds for height; zero means unknown. Stale values are labelled and
retained, with demo defaults where no usable observation exists.

The ride retains its DSB-owned real Coinbase one-minute OHLC request: once per
live-data activation, bounded to 48 candles with a ten-second timeout and cancelled
on exit. Shared price observations update the current candle after history loads.
Each lap uses a stable snapshot of completed candles, replaced at the station;
prices are scaled and clamped for safe clearance. History failures are labelled,
with no background retry loop; toggle **Live data on / off** to request it again.
The toggle controls DSB consumption, not the shared service. Leaving DSB removes
its subscription and visit resources without stopping page-owned feeds. NodeRunner
metadata, song requests, payment monitoring and radio remain DSB-owned. Automated
feed checks use fixtures and do not establish live-provider availability.

A direct visit is `?scene=dsb`; `?debug=1&scene=dsb` exposes `__ooga.dsb`.

### Zuzu

Zuzu is DSB Land's physical black cat. Approach her and choose **Talk to Zuzu** for a compact free-form conversation panel. Replies are currently clearly labelled local mocks, with deterministic fallback; no real AI provider is connected. Conversation history resets when leaving DSB. The provider-neutral backend foundation is documented in [server/zuzu/README.md](server/zuzu/README.md); it is not deployed or bundled into the game.
