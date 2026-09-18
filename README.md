# Ooga Booga Land

A small WebGL2 floating island whose cliff caves are projects. The open cave is a lab
where donated bananas feed voxel cavemen who stand in for the contributors of
[EntropyLab](https://github.com/w-s-bitcoin/entropylab). Contributors eat when they
have committed recently, sleep when they have not, and hand-build lab equipment between
meals. Visitors can poke the crew, roll the dice, and watch donated bananas rain onto the
shared pile on the island and in the cave alike.

Everything is plain JavaScript with no dependencies, no build requirement, and no
network access in the hub. DSB Land automatically connects to public Bitcoin data feeds; payments are a simulator for now, and
all visitor state stays in the visitor's own browser (for now).

## Run it

Open `src/index.html` in a browser, or serve `src/` with any static server.

The page lands on the hub: a floating island whose cliff caves are the projects. Tap the
lit cave to enter EntropyLab; **Escape** or the **Leave cave** button brings you back.
The 9 o'clock cave is **Ooga Rally**: press **Space** nearby to open a kart race the size
of a world. Pick an Ooga, a ride (on foot, a Rock Kart or a Dino) and one of three tracks
(Banana Bay, Lava Gorge, Frost Peak), then race the crew over three laps.

The island keeps your local date and time. The sun, moon, stars, sky, light and shadows
move continuously through dawn, morning, noon, dusk, night and midnight; the torches, the fire pit and the sign lanterns light at dusk,
butterflies give way to fireflies, the crew gathers at the fire and talks about the hour,
and a shaken tree at night scatters fireflies. Climbing above the island lowers the
horizon haze, revealing more stars while their directions remain fixed in the sky.

Fly around the island with **W A S D** (or the arrows), **Q E** to turn, **R F** to tilt,
**Z** or **Space** up and **X** down; drag to orbit and scroll to zoom. On a phone the left
stick moves and the right stick looks. Double-tap a caveman to walk in their boots: the same
keys or stick walk them, and holding **both mouse buttons** walks them forward. **Space**
(or the **JUMP!** button) jumps: press once from the ground, then once more for a double
jump. Release between jumps; both reset after landing. While walking or airborne,
Space keeps its jump action. Stop beside a reachable control, bench, or Ooga Rally/Drop
launcher to use it with Space. The action button changes to
**PRESS IN**, **PRESS OUT**, **START RALLY**, or **FLY PLANE** while that control is nearby.
These actions work from every direction without needing to face them; the car's
platform and the plane's wings have room around them to activate the launcher. Click or tap
decorative props to interact with them. Walking into the lit lab cave enters it.
**Escape** lets go and **0** brings the camera home.
Landing on another Ooga carries you along with their movement. You can still
look around, walk across them, or jump off; walls and ceilings remain solid.

The jetpack starts spinning above a cloud beyond the island. Reach that cloud and jump
into the pack to collect it. Its compact button then appears at the upper left; click it
or press **J** to put the controlled Ooga's jetpack on or take it off. The button expands
to show fuel while the pack is worn. With the jetpack equipped,
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

Wandering Oogas walk around the banana pile and keep off its platform rim.
You can still walk, jump, or fly through the fruit, with walking and vertical
movement at half speed. Leaving through its side or top scatters a brief burst
of bananas that tumble away and disappear. The platform has a stone
interior that joins the ground and banana interiors without gaps.
Returning Oogas choose the nearest free eating slot and choose again if someone
takes it before they arrive. The platform and fruit interiors follow the glyph
wave, switching to black with blurred green code as it reaches them.
NPC walkers check destinations for obstructions and use a bounded local recovery
path to back out of dead ends and go around scenery that blocks their route.
They keep clear of lit firepits when walking, choosing eating spots, and planning
recovery jumps; an Ooga already too close can still move out of the flames.
They follow the midpoint curves of connected surface paths, stepping off to pass
other Oogas or make the final approach to an off-path destination such as a
fireplace seat. Routes
adapt when the growing pile changes the paths; player movement stays unrestricted.
When walkers meet, they turn the contacted shoulder back and sidestep past each
other while keeping their heads facing ahead, then return to their original lines.
This also works when overtaking: a moving Ooga bumped from behind turns that
shoulder forward. Solid scenery uses the same shoulder turn and temporary sidestep.
Centered bumps use the right shoulder; lighter grazes produce smaller turns and
sidesteps. Only moving Oogas react, and walls still limit the available space.
Routes through the lower ramps and room entrances round their corners wherever
the actual floor, walls and headroom leave enough space.
If no walking route is available, they can jump onto or over nearby items after
checking the flight and landing space. NPC recovery jumps stay outside the banana
pile and require enough headroom. Banana interior lighting includes exterior shadows at dawn.
An equipped pack stays on and recharges on the platform.
The blurred banana interior follows the daylight. In either camera view, it
shows eligible nearby outlines only through the covered part of the image.

You can fly above and beyond the island, or walk and jump off its edge. Steer through
an open window to enter HQ or the basement while falling. The windows widen toward
the outside with smooth stone reveals. Falling into the abyss plays a fall animation,
then returns your Ooga to the banana pile and turns Matrix mode off. A carried pack is lost in that fall and respawns
above another distant cloud. First person without a selected Ooga also
falls naturally and returns to the pile.

Land on the clouds to walk along their voxel tops and recharge your jetpack. A cloud
carries you as it drifts; walking off, or losing the cloud beneath you, starts a
natural fall. If the unclaimed jetpack's cloud disappears, the pack falls and then
respawns above another distant cloud. You can fly upward through clouds from below.

Scroll all the way in for first person, keeping your approach direction as the
Ooga turns to look that way. Walking has the same pace with or without a selected
Ooga, and both fall naturally when stepping off a ledge. Scroll out to return to the
trailing character view or free flight along the same viewing angle, even when
looking straight up or down. Both orbit views keep your chosen angle and distance
through the ramps. They can pass through walls, floors, and ceilings; a free orbit's
focal point can also move inside rock. Drag from floor level to directly overhead.
Rock covers the part of the view crossing a surface and fills the screen inside
stone. Its grain and color follow the actual section of rock. Faint boundary lines
and object silhouettes reveal nearby surroundings hidden from the camera. An object
gets its whole outline when any part is nearby and visible by looking around,
and the camera cannot see any part of it. Walls use the same proximity and
360-degree sight rules. The visible stretch reads as solid stone, including jagged
facets and small ledges, with a soft fill and a continuous outer outline. Its ends
fade where the wall passes out of the Ooga's sight. Ceilings and exterior window
sills, including their side panels and rock fragments, receive no outlines. The
thin wall below HQ's panoramic window and the basement shaft's open rim have cues.
Ramp wall cues meet the sloping floor along a continuous lower edge. Window
openings clip camera-visible portions precisely, preserving the wall around them.
Each wall fades at the distance limit; camera-visible portions do not receive the cue.
Walls and floors block cues from adjoining rooms
and other levels. These cues also work when the camera is outside
rock. Island stone and stone entrance frames activate the hidden-character cues;
trees, clouds, and other scenery do not activate them on their own. Those objects
remain eligible to receive outlines when stone blocks the view.
Object outlines soften near the distance limit and fade smoothly as sightlines
open or close. Nearby objects keep their eligibility as you turn or zoom the camera,
and additional characters never displace their cues. All outline cues switch off
immediately in first person or whenever any part of your Ooga is visible to the
camera, except for cues clipped to a rock or banana interior and the exterior ramp
view through windows. Small grass shoots receive no outlines. The pile's inner shell
and solid platform have separate wall-style cues, each with a soft fill and continuous border.
When part of the pile is exposed to the camera, its covered portion keeps its cue;
only the exposed pixels are removed, without drawing a new border along that cut.
Individual bananas and decorative base blocks do not participate in that cue's
visibility checks or outline rendering. A brighter outline locates your completely hidden Ooga.

The island's **PILE**, **LAB**, **MIRROR**, **HQ**, and **BSMT** buttons take your controlled Ooga,
or just your free camera, to that destination while keeping your current view mode.
**LAB** takes you to the EntropyLab entrance on the island; tap the cave or walk inside
to enter the lab. **MIRROR** takes you to the OBL mirror, **HQ** to the headquarters,
and **BSMT** directly to its basement. On narrow screens these destinations remain in
one horizontally scrollable row. Inside HQ, two curved descents connect to a shared basement with
eight unclaimed rooms around a smaller common area. Each HQ and basement room has
one floor mattress in its rear corner, sized for a sleeping Ooga. Its blanket wraps
around the mattress, and the pillow carries the same LifeHash pattern rotated 90°,
derived from that room's x, y, z coordinates. Sleepy Oogas walk down the ramps to an
available bed and lie on top of the sheet. RandyMcMillan starts sleepy in the demo.
The HQ benches and fireplace are solid. Near a free bench seat, **Space** or **SIT**
sits facing the fire; movement or **STAND UP!** gets up. Touching a lit fireplace's
flames sets the Ooga on fire. Press **Space** or **DROP & ROLL!** once to roll back and
forth until the flames go out. Flames slowly climb from the legs while the Ooga delays
rolling; each burning part heats from red embers toward the fire's bright yellow.
During the roll, the glow cools smoothly into charred body colors. Touching another Ooga spreads
the fire. Burning NPCs panic and run at twice their normal walking speed before
dropping and rolling. Some react quickly; others run long enough for the flames
to cover their body. NPCs spot burning Oogas from farther away and flee at double
speed, leaving paths while avoiding obstacles and cliffs. At a safe distance they
remember the fire's last position and wait until it goes out or moves farther away
before resuming their routines.
Afterward, smoke rises and the charred parts fade back to their original colors.
Beds support walking: stand on an available mattress and press **Space** or **SLEEP**
to lie down.
Each bed holds one Ooga. While sleeping, **A/D** face left/right as seen from the foot
of the bed, **W** turns onto the stomach, and **S** onto the back; **Space** or
**WAKE UP!** gets up. Sleeping keeps your chosen camera distance.
Sleeping Zs appear when the sleeper, their doorway, or their window is in sight.
Double-click a sleeping Ooga to control them without waking them. Leaving control
keeps them asleep; **Space** or **WAKE UP!** wakes them when you are controlling them.
A single click gets a sleepy response and sometimes makes them roll over.
Walk between the levels without leaving the island. The basement rooms and ramps have exterior windows; its common area
has no fireplace. A wide central hole opens through the island's underside, with a
beveled stone rim and a broad walking ring connecting the rooms and ramps. Step into
the hole to fall through the island into the open air below.

In Ooga Rally, **W** or **Up** accelerates, **S** or **Down** brakes and reverses, **A D**
or **Left Right** steer, **Space** held drifts (release for a boost, tap to hop), **E** or
**Shift** throws the item, **Q** looks back, **0** resets the camera behind you, **M**
mutes the synthesized sound and **Escape** pauses. Bananas on the track fill a turbo meter; crates hand out a Rock, a Peel,
a Turbo or an Ooga Shout. On a phone the left stick steers with the throttle held, **Drift**
and **Throw** buttons do the rest. Best times and medals are kept per track in your browser.
Finish on the podium and **Next track** takes you to the following track; **Cup** races
all three in a row for points and a saved cup medal. Now and then a race loads in the rain
(snow on Frost Peak) and the tarmac gets slick; the sound is synthesized in the browser,
nothing is downloaded.

On the roof of the Ooga Rally cave sits a plane: press **Space** nearby for **Ooga Drop**.
Approaching either game's launcher does not start it until you act. Pick an Ooga and
**Fly!**: the plane climbs in a circle while the island shrinks below (hold **Space** to
hurry), **GET READY!** and **JUMP SOON!** call the mark as it comes
round once a lap, **JUMP** opens it, and Space throws you
out. In freefall **W S** pitch, **A D** roll and **Q E** turn the body, and the air answers the
way it does to a flat plate: belly down is slow and steady, head down is fast, a tilt tracks
you sideways. Fall through the glowing hoops, then Space pulls the chute; **A D** steer the
canopy on the same keys: **W** dives, **S** flares, **A D** bank, **Q E** turn. Any landing under
the canopy is a good one, the target pays by distance and the banana pile is a great one. Without a
chute the impact picks its ending: spine first punches a hole, flat and fast tumbles, flat and
slow flattens. Miss the island and you are lost in the clouds. Drag to look round in every
phase, all the way round in flight, where the view eases back behind you a moment after you let
go; **0** puts the camera back, **M** mutes the synthesized engine, wind and canopy,
**Escape** returns to the board. On a phone the left stick pitches and rolls, the right stick
turns, and the button jumps, pulls and flares. The best drop is kept in your browser.

Keys: **B** add 100 test bananas, **J** toggle a collected jetpack on the controlled Ooga, **L** legendary
tip, **P** fill the pile, **1** to **9** force a contributor to eating, **Escape** leave a
cave or let go, **Shift+R** reset the demo.

URL flags: `?scene=lab` opens the lab directly, `?scene=race` the rally garage and `?scene=drop` the drop board, `?nosim=1` silences simulated tips,
`?canvas2d=1` forces the Canvas 2D fallback, `?yaw=1.2` sets the starting camera angle,
`?debug=1` exposes `window.__ooga`. In debug mode, add `&bananas=10000` (or another
non-negative amount) to preview the pile at that starting level without changing saved state,
use `&b=500` to choose how many test bananas each press of **B** adds and drops, use
`&hour=22` to pin the clock at an hour, `&day=172` to choose a day of year, or
`&daylen=120` to run a whole day in that many seconds. Use `&time=0000` for midnight
or `&time=1300` for 1 PM. `time` requires exactly four digits in valid 24-hour HHMM
format (hours 00–23, minutes 00–59); it stays fixed across scene changes and overrides
`hour` and `daylen`. Use `&view=pile`, `&view=lab`, `&view=mirror`, `&view=hq`, or
`&view=bsmt` to preload that island view, including when returning to the hub.
Add `&firstperson=1` for an initial
eye-level free camera, or `&character=w-s-bitcoin` to start controlling that contributor.
Combine them for first-person character control, including a starting location:
`?debug=1&firstperson=1&character=w-s-bitcoin&view=hq`. Add `&jetpack=1` to equip the
selected character on startup, or select the first working Ooga when `character=` is
omitted (the first roster entry if none is working). An explicit unknown handle leaves
selection untouched. With `view=hq` or `view=bsmt`, the pack stays owned with its icon
visible but disabled underground. These views skip automatic equipping and selection
while respecting an explicit `character=` or `firstperson=1`. `character`,
`firstperson`, and `jetpack` apply only on the initial page load. `&latitude=20` optionally changes
the debug latitude (bounded to 66 degrees north or south). Use `&loot=1` to exercise the loot feature. Loot ships off: `LOOT_DEFAULT` in `src/js/director.js`
turns it on for everyone. The pile holds at most ten million bananas; every count is clamped there.

## Test

```sh
npm test
```

Runs a headless Chrome suite over the DevTools protocol: real drags, clicks, and keys
against the page, with a clean console required. Needs Node 22 or newer and Chrome; the
driver looks for Chrome at the macOS application path, so on Linux or Windows set the
`CHROME` environment variable to the binary. There are no npm dependencies. A full run
takes about nine minutes.

## Build and deploy

```sh
npm run build
```

Writes `oogaboogaland.html` at the repo root, a single self-contained page with the
stylesheet and every script inlined and the content policy pinned to their hashes. It is
committed with the sources; rebuild it whenever they change. Deploy that one file, served
as `index.html`. Nothing under `src/` goes to a server.

GitHub Pages deploys through `.github/workflows/pages.yml` on pushes to `rock`, or
manually with **Actions → Deploy GitHub Pages → Run workflow**. The workflow rebuilds
the page and uploads only `_site/index.html`, a copy of `oogaboogaland.html`.
Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
The default site URL is https://oogaboogax.github.io/oogaboogaland/.
Configure a custom domain in **Settings → Pages** before pointing its DNS at GitHub;
this workflow does not need a repository `CNAME` file.

## Privacy

No analytics, no external requests, no personal data. The roster lists public
contributor handles only. The donation handle and message a visitor types are stored in
their own localStorage and nowhere else.

## Contributing

Read [AGENTS.md](AGENTS.md) first. It describes the module layout, the engine patterns
the code relies on, how to add props, swag, behaviors, and HUD elements, and the checks
every change must pass.

## DSB Land

The 10 o'clock cave opens **DSB Land**, adding the sixth active hub gate. Walk to
the back wall to enter its tunnel, then toward the arched, pale-yellow light
with W / Up or the left touch stick. Four recordings play once per visit, in order,
with the Journey kazoo cover quiet beneath them and footsteps following movement.
The passage follows the current hub YellowBrokeIt character and glances gently with
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
