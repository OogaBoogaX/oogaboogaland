# Architect mirror cave

Draft PR #827 implements the maintainer-authorized mirror observatory, starting
from upstream `rock` at `45e02fd428cc0734b3c9a3f8f173bf741d68a094`.

## Walking through

The driven Ooga crosses the existing mirror at one o'clock into an enclosed,
circular chamber with black walls and a stark white ceiling, 608 small framed monitors, a pale
polished floor and a sculpted black swivel chair. A reflecting mirror behind the arrival matches
the island cave's
five-metre-wide, three-metre-high visible opening. Walking through its glass
returns the same Ooga outside the island mirror. The mirror and its complete black frame
follow the circular wall, meeting the jambs and wall above without the former
flat lintel or soffit. The glass retains its 32 strips behind the recessed frame. The return threshold follows the curved glass
at the center and sides. One tangent-plane reflection capture projects onto the
curved mesh; this is a bounded approximation, not a separate capture per strip
or a full simulation of curved-mirror optics.
For the curved pane, the capture faces through the tangent plane, and its crop
comes from the portion of glass clipped to the player's view. Reflected rays
may extend beyond the player's original frustum at close oblique angles, so
their bounds must not be cut back to that frustum. Sampling retains the actual
glass positions; flipping those positions exposed a dark reflection of the
nearby surround. The physical glass, frame and traversal stay curved, with no
additional reflection captures or textures and the same tier resolution caps.
Focused Chrome rendering checks covered both reported oblique camera angles at
Low, Medium and High, plus the opposite side at High. Comparing frozen views
against the original crop reproduced the edge streaks and confirmed their
removal without the dark surround strip. The console was clean; screenshots
and the report are in `untracked/architect-mirror-edge-v2/`. This is scoped visual
coverage, not a full-suite result. Build and edited-JavaScript syntax checks pass.
Crossing rotates the body and the complete camera pose between the doorway frames,
preserving look direction, pitch, zoom and view mode in both directions. Backing
through arrives facing the mirror and continues backward away from it. Physical
crossings start at the destination glass and animate the original walking gait
to the existing landing point over roughly a second, easing into and out of the
walk. Movement and interactions wait until that walk finishes; held movement is
not reset and resumes on the next controllable frame. View direction and mode
stay intact; the room keeps the third-person camera inside its wall while the
body emerges. Losing the actor, a relocation or scene teardown cancels the walk
and releases its input ownership. Explicit debug relocations remain immediate.
This arrival animation has build/syntax validation; in-room acceptance is pending.
The shared pilot also restores still-held WASD/arrow keys
and sprint on its first controllable frame after a carried land arrival; keys
released during loading, blur or Tab cancellation are not replayed.
The nominal casing gaps are 0.025 metres. Visible image-to-image spacing also
includes two facing bezels. The floor and ceiling each get one extra bezel's
height so their image-to-boundary margins match that combined spacing (about
0.114 metres). Ceiling height follows the grid (about 9.114 metres). Four rows
span the mirror opening; eight more continue above it. Both monitor
width and height are halved, preserving the earlier widescreen proportions. Light strips
at the ceiling and floor are removed. The circular shell has eight subdivisions
per monitor column (416 around the room), and each screen, casing and glass face
curves across eight strips. The four columns above the mirror follow the circle
too; the face-camera-only infill uses the same curved mounts.
The black mirror border shares the TV bezel color. Its bottom and top outer edges
match the first and fourth TV rows (about 0.069 and 3.044 metres above the floor); its left
and right outer edges match the four columns above it at the TV casing's front
radius. Frame thickness follows the TVs' bezel dimensions. A bottom rail and
closed curved side/top sections join into a dark surround, sealing the original
opening behind the frame without reflective slivers. The five-by-three-metre
glass and walk-through threshold remain intact. These spacing/frame updates have
build/syntax validation; final visual alignment still needs in-room acceptance.

The pale floor has finer, darker grout and one softened planar reflection using
the hangar's existing glossy-reflector path, with lower strength (0.3). It reflects
the chair, Ooga and screens through the renderer's bounded, quality-scaled capture
passes. This adds one floor reflection target; the 32 area cameras are unchanged.
Glossy sheets use ordinary near-plane clipping and raster depth, while doorway
mirrors retain their aperture-depth handling. Their capture clips exactly at the
sheet: the doorway tolerance could admit the backing floor only 14 mm below it
and obscure parts of the reflection. Reflection strength and floor color are unchanged.
TV glass uses the existing view-dependent grazing highlights and light glints,
not per-screen scene captures. Two shared glass/casing shapes serve all monitors.
The housings are 0.10 local units deep instead of 0.32, with near-black casings
and black bezels. Mounts and glass move closer to the wall together (about 7 cm
of total projection instead of 24 cm), preserving cylindrical alignment, screen
sizes, grid margins and feed-only mirror infill.
The Canvas 2D fallback retains the pale floor without the reflection overlay.
A brief black fade softens the crossing. Startup and scene-loading holds are plain
black, and unready TV feeds have a black placeholder without loading labels. The old glyph room remains retired;
shots and melee still ripple the unbreakable mirror. NPCs respect its barrier.

`architect-cave.js` owns the chamber. Its volume is below the island at y=-48,
in the existing hub graph and `mirror` zone. This is a separate physical room,
not a second simulation: donations, NPC ownership, remote interpolation and
live feeds continue through their existing owners. It creates no new backend,
subscription, scene retention override or independently simulated crew. The
main hub's existing release/retention policy still applies when leaving it.

The room supplies explicit render roots for its fixtures and occupants without
reparenting them. Main views and room reflections exclude outdoor geometry, sky
and sea; its fixed indoor lighting disables outdoor sun, point lights and shadow
passes. The apparent rectangular floor-reflection clipping was reproduced even
with the reflection hidden: outdoor shadow-map lighting caused those patches.
The isolated lighting removes them while retaining the glossy floor reflection.

Only a scheduled island security-camera capture collects and uploads the outdoor
graph. Capture-only instances stay outside the room's draw range even when they
share geometry with an occupant. Separate observer graphs retain their existing
capture budgets. Between captures, outdoor transforms are not traversed by the
renderer. Outdoor wildlife, clouds, lake/weather effects and distant view-detail
tracking pause inside; shared gameplay, presence and feed data continue. Geometry
needed for camera views and returning outside remains retained; this does not
claim that all outdoor memory is unloaded. Normal outdoor rendering resumes on
exit. [Issue #838](https://github.com/OogaBoogaX/oogaboogaland/issues/838) proposes
making this isolation standard and auditing other self-contained interiors.

Walking and airborne collision keep the Ooga within the walls and below the
ceiling. The chair has rounded black leather cushions, three padded back panels
with recessed seams, a gently reclined shell, metal back and arm supports, rounded
armrests and an under-seat adjustment lever. Each arm support is one capped,
rounded tube entering the seat shell at both ends, with its top run embedded in
the pad. Shared cross-section rings continue through bends rather than joining
separate square-ended beams. The back stays and five tapered pedestal spokes use
the same construction; spoke tips overlap the caster forks. Rubber wheels retain
their dark finish.

The frame, pedestal, forks and wheel hubs use chrome shading with moving bright
ceiling bands, dark wall reflections and sharp glints. This is an inexpensive
analytic approximation of the room's light/dark surfaces, not a live capture of
objects or TV content. It adds no reflection targets or passes. Canvas 2D uses
the bright silver base color. The latest chair/TV pass has build/syntax checks;
visual acceptance of the joints and chrome finish remains pending. The seat, back and armrests rotate
together over the fixed base; the seat height stays 0.72 m and the back collision
extends to the new shell. Move and jump onto the cushion, then press
Space to sit (or sit from nearby on the floor). First person and combat looking
swivel the occupied chair; combat zoom-out stays in the shoulder camera with the
chair back facing it. Third-person carry orbits independently while the chair,
body and head keep facing forward, including during zoom-out. The seat opts into
combat camera control only; weapons remain parked. Movement or Space stands up
into clear floor ahead of it.
Sitting places a pen slightly higher through the center of the Ooga’s existing
right fist, clear of the thumb and exposing more of its barrel. Third person
keeps the default seated arm pose. First person solves the rigid arm's shoulder
arc against the actual camera eye and field of view, aiming the fist into the
lower view (75% down from its center). The shoulder levels its yaw/roll during
first-person entry, then lifts only in pitch, keeping the original elbow bend,
wrist and fist orientation within that rigid arm. As it lifts, the whole arm
slides toward the body center without swiveling, using the actual viewport aspect
and field of view to aim the fist toward 74% of the half-screen width. The shift
is bounded to 75% of that character's shoulder offset and eases in with the lift;
the shoulder's height and forward position stay unchanged. No offsets accumulate
across frames or repeated updates. Third-person zoom-out, standing and removal
restore the normal arm placement.

Shoulder rotation still stops at 90 degrees forward; looking farther up can let
the fist leave the vertical view. Looking down returns it to the original seated
rest and never lowers it further. The solve uses the character's own geometry
and blends with the first-person camera transition. Nothing is screen-anchored.
The revised pose has build/syntax validation; widescreen framing and appearance
still need visual acceptance. Existing pen regressions now cover inward movement,
level yaw/roll, rigid grip, no accumulating offsets and third-person restoration;
these revised assertions have not been run.
The character’s default fist, including its thumb, stays unchanged; the pen
sticks out of that fist. Clicking depresses the pen button and springs it back
over 170 ms. The same hand appears in the room, reflections and face feed.
Right-click over a TV (or tap it on touch devices) toggles area feeds and the
face broadcast. The clicked tile changes first, then a wave grows above, below
and around both sides of the curved wall, with randomized row speeds and tile
timing. The center crosshair picks the TV while pointer-locked. Clicks on the
mirror, floor, chair and bezels do nothing. The chosen view stays until the next
right-click; a click during a sweep queues that view and its clicked origin
until the sweep completes, without redirecting the wave already in progress.
Desktop left-click selects the TV under the cursor (the center crosshair while
pointer-locked) and expands its camera picture across a nearby 7×7 region,
including when that TV shows the Ooga’s face. An enlarged face is one continuous
image across 49 TVs, with the room background and bounded nested screens intact.
Clicking that enlargement restores the saved smaller grids; clicking another
picture restores the old region and enlarges the new one. Only one enlargement
is visible at a time. Right-click switches views and clears the enlargement, so
returning shows the original smaller area grids or independent face screens.
The outgoing enlarged picture stays intact until its last tile switches, then
its temporary geometry and detail priority are released. Clicking a different face moves its
patch; clicking the enlarged face restores the independent face screens. Both
use the existing ready-image tile wave and bounded temporary geometry.
Standing removes the pen, restores both layouts and
resumes automatic transitions. The existing crew sitting/standing lifecycle
owns cleanup.

Primary and secondary weapons, ammunition and jetpack ownership are parked for
the visit. Their HUD buttons disappear and equipment keys cannot bring them out.
Leaving restores the saved loadout using the same weapon parking path as Bifrost
and the Factory; changing the controlled actor and scene cleanup also release it.
The camera stays inside the chamber. Leaving the controlled Ooga returns the free camera outside. Restoring a pose within the
chamber activates its room presentation.

## Preparing on approach

Within 18 world units of the mirror, and six vertically, the hub prepares the
room geometry and uploads its meshes. Repeated approaches reuse that work.
No network asset is required: this is prebuilding and GPU warming, rather than
a network fetch. Captures and audio begin only on entry. A direct debug arrival
uses the same preparation path if nothing has been warmed yet.

The room remains prepared for the hub visit, with at most 34 small camera targets (32 area feeds and a clean face seed and a live face buffer);
leaving the hub releases them with their owning geometries. Context restoration
recreates targets and quality changes select the current target size.

## Live camera screens

The 608 screens share **32 simultaneous camera slots**. Every 15 seconds inside
the room, one slot takes the next view that is not already on the wall. All slots
take their turn, including those behind the viewer; rendering still skips feeds
with no visible screens. Rotation pauses outside the room and in hidden tabs,
with no catch-up burst. Rotation also pauses during face broadcasts, prewarming and tile waves. A changed
slot retains its last captured picture until the replacement has rendered; switches
do not insert a CONNECTING or blank frame. Initial startup still needs a first capture.

The catalog in `observatory-cameras.js` currently contains **34 views**: the
original eleven (pile, lake, Merge Rock, Bifrost chamber, five cave entrances,
Sphere exterior and Bifrost islet), seven public Timechain rooms, B.C.A. office,
EntropyLab floor, HQ, HQ basement, Mempool chamber, Library nook, HQ window gallery
and north pass, plus three Factory views, three Arcade views and two Hangar views.
These are 34 camera views, not 34 distinct protocol zones.
The wall mixes single screens with 2×2 and 3×3 mosaics. Each mosaic divides one
image across its panels, allowing for the bezel gaps and cropping without
stretching. Labels beneath the screens are removed. Independent groups share
slot textures, with balanced random placement forbidding matching neighbors,
including diagonals and the wrap around the room. Adjacent tiles of one deliberate
mosaic are the exception. New groups exclude neighboring channels from both the
old and new layouts, preserving this separation during the wave too. A proposed
3×3 that exhausts the available choices splits into singles rather than repeating
a neighboring channel.

While area feeds are selected without an enlargement, one local patch is chosen every 3–6 seconds after
the previous patch finishes. At most nine screens change: a 3×3 may split into
nine singles or a mix including a 2×2, and a region containing complete smaller
groups may combine into a new mosaic. A patch never cuts an existing neighboring
group, crosses the mirror gap or replaces screens elsewhere on the wall.
Destination pictures warm before the patch's roughly 1.1-second wave. Within
that patch, tiles change in outward row order with lower rows leading and small
row/tile jitter. The rest of the wall keeps its current layout and live feeds.
Each replaced tile briefly flashes over its ready image, using the existing
per-instance highlight with a 160 ms fade; untouched tiles do not flash.
The return mirror marks flash onset, fade and completion as changed, taking the
existing first reflection slot while visible even between low-tier cadence frames.
Medium/low reflections retain Observatory feed images and their instance highlights.
This adds no capture targets and keeps the two-pass reflection ceiling; ordinary
cadence resumes once the settled image has been captured. Hidden mirrors do not refresh.

Splitting a 3×3 preserves its remaining old image tiles until their individual
turns; assembling one replaces the nine old tiles individually. Each tile checks
its destination again before switching. A delayed capture holds the outgoing
picture and the transition waits to finish. Channel rotation pauses throughout,
so an outgoing mosaic cannot lose or change its backing channel mid-wave.
A pen click during regrouping queues the requested face/area view after that patch.
Only the face-view switch sweeps the whole room; returning restores the existing
mosaic arrangement. Travel or changing actor cancels an unfinished patch back to
its last complete assignment.

The chair-selected enlargement uses the nearest complete 7×7 region containing
the selected mosaic, wrapping around the circular wall when needed. It avoids
the return mirror and accounts for the narrower columns above it in its image
coordinates. When it partly covers a 2×2 or 3×3 mosaic, the uncovered tiles are
retiled into complete smaller pictures. The displaced shot survives once in the
largest smaller square that fits (2×2 for a 3×3 when possible, otherwise one
screen); other exposed tiles receive new single-screen shots. New shots exclude
neighboring incoming/outgoing feeds and the enhanced feed. Unaffected mosaics
stay unchanged. The enlargement and these edge repairs save their original
assignments, restoring them together when closed or moved. Each affected tile switches and flashes on
its own deadline, retaining its outgoing image until the destination is ready.
Selection waits while a tile wave or global view transition is active. The selected
camera's channel stays pinned while the remaining slots rotate. Switching the
broadcast clears the enlargement and restores its saved layout for the next visit.

An enlargement adds 49 temporary image surfaces, sharing the existing camera
target. Switching views releases that selection once the outgoing tiles are gone.
A move can briefly retain another 49 outgoing
surfaces until the wave finishes; then those geometries are released. Restoring, leaving or changing
actor releases the enhancement surfaces. No extra camera targets or network
subscriptions are created. Edge repairs reuse the existing small-panel cache,
which remains bounded to 28 variants per camera slot.

Selected public Sphere interiors (rooms 1–7), the Factory, Arcade and Hangar
now load authored scenery through `observatory-detail.js`. This replaces the
camera stand-ins with the actual furniture, exhibits, aircraft and architecture.
Only the selected source owns these extra GPU meshes. Other angles of that same
room still capture its reduced adapter. Models build in scheduled capture slices;
resumable builders and uploads target 2 ms, with at most four geometry uploads per
capture. Some existing model-building steps are synchronous and can exceed that
target; measured slow frames pause construction and the lowest adaptive tier
releases the richer source. Looking away pauses it; changing selection, hiding
the page, standing or leaving releases it, including its exclusively owned model
caches. A cancelled deferred load cannot attach scenery later.

The current image stays visible during construction. Ready scenery batches fade
into the selected picture over 450 ms, at least 550 ms apart, using the existing
one-previous-texture limit and capture cadence. Sphere rooms publish their complete
authored shell and furniture together; workshops add further equipment in batches.
With a visible enlargement, other area feeds refresh at most once per second and
receive at most detail level 1; the total detail budget falls from 24 to 12 on the
highest adaptive tier (8 points reserved for the selected feed), or 8 to 5 on the
middle tier. Forced replacement captures can still run early to avoid blank tiles.
The selected feed retains its adaptive resolution and roughly 15 Hz ceiling.

These are authored visual models plus the already available public visitor poses,
not additional live scene instances. No extra player subscriptions, private rooms,
film/lecture playback, audio, machine simulation or source-scene entry is started.
The Bifrost and island-based views retain their existing adapters for now.

Hovering a TV from the chair warms just that feed after the cursor and camera
have moved slowly for 450 ms. Precise screen picking runs at most ten times a
second after settling; a different speculative target is admitted at most once
per 1.25 seconds. Fast movement, leaving the view, standing, face broadcasts and
layout waves cancel the speculative request. Pointer lock uses the center ray,
so looking across the wall follows the same settling rule. The hovered channel
stays pinned while warming. This prepares existing local observer geometry and
a sharper camera capture; it does not fetch another zone or subscribe to players.

Speculative high detail requires measured frame intervals below 22 ms, a
nonzero adaptive tier and enough remaining detail budget after the selected
enhancement. It gets one early capture when it needs a resolution upgrade,
within the existing global limit, without acquiring the enhanced 15 Hz cadence.
An explicit click admits enhanced detail immediately at the current adaptive
tier and holds the tile wave until its first enhanced capture is ready. It no
longer expands a low-quality frame and waits two seconds for that admission.

Resolution changes on an enhanced or hovered feed retain its previous color
texture for a 450 ms smooth fade into the new live texture. The screen shader
mixes them every displayed frame, including in room reflections, independently
of the camera's capture cadence. Each changing feed retains at most one previous
color texture, released when the fade expires, the feed is disposed or context
resources are reset. No additional scene capture or depth target is required.

The focused chair browser check passes twenty checks covering mouse selection,
progressive replacement, holding unready images, exact layout restoration,
retargeting over the mirror columns, screen-only right-click face toggling,
radial growth and queued origins, 49-tile face expansion/restore/retargeting,
independent saved area/face layouts, shared high-resolution portrait capture,
adaptive detail,
capture/geometry bounds, enhanced refresh priority under healthy/slow frame
timing, hover settling/cancellation, resolution fading, complete smaller shots
along partially covered 2×2/3×3 mosaics, standing cleanup, and clearing the
island basement voice blend inside the room, plus a clean console. In six seconds of controlled
16.7 ms frame intervals, the enhanced picture received 90 captures and the
others shared 90. At controlled 50 ms intervals, each received 20 captures over
six seconds, with the enhanced view reduced to 304×171. These verify scheduling
and adaptation, not actual device FPS. Its saved
views are `untracked/architect-focus/enhanced-7x7.png` and
`untracked/architect-focus/enhanced-face-7x7.png`. The expanded focused session
passed in 26.7 seconds and emitted the runner’s advisory 25-second slow-session
notice; it is not a real-device frame-rate benchmark. The warm-up and shader
changes also passed all 805 global unit checks, with only the intentional
fragment shader snapshot updated for `uCanvasBlend`/`uCanvasPrevious` (the blend
is zero on every other surface). The 7×7 sizing and edge repairs passed
build/syntax and the twenty focused checks above, including 1200×675
admission preserving the old 6×6 pixel density. Three additional startup
checks verify that ordinary loading remains black, failure of both renderers
reveals a focused and clickable retry, and retry reloads a playable island
with a clean console. The full browser suite was not rerun.

Warmups include off-screen destinations, alternating with the face camera when
needed so neither starves on a slow frame budget. They use the existing 32 targets
and the same global capture limit. UV meshes are cached in a bounded set of at most
28 variants per slot (14 tile positions across two wall pitches); regrouping does
not add cameras, textures, readbacks or per-frame geometry allocations.
Adding catalog entries does not allocate additional screen targets. There are no pixel reads, image encoding or additional
WebGL contexts.

- Adaptive area-feed levels: lightweight 192 x 108, furnished 256 x 144, and
  close-detail 512 x 288. Low caps at lightweight, Medium at furnished, High
  permits close-detail. The ordinary portrait stays at 256 x 144 (192 x 108
  on Low). Selecting a face for enlargement admits the shared live portrait
  to the same enhanced detail budget and refresh priority as an area feed. Its
  clean recursion seed stays at the original small size.
- Detail follows measured frame intervals, not a hardware-name guess. It starts
  furnished, sheds one level after 500 ms above a smoothed 24 ms/frame (200 ms
  above 40 ms/frame), then waits six seconds before accumulating upgrade time.
  Each upward step needs eight continuous seconds below 18.5 ms/frame. This
  measures frame cadence, not GPU time or available VRAM.
- A chair-selected 7×7 receives detail first: up to 1200×675 on the highest
  adaptive level, 608×342 on the middle and 304×171 on the lowest. Capture
  dimensions scale with the selected grid to retain the original 6×6 pixel
  density; hover warming uses the same dimensions. It spends
  eight, four or one detail steps respectively, leaving less detail for other
  visible feeds. The lowest level grants that single step only to the selected
  view. Its highest tier includes island objects down to a 0.08-metre radius
  and the observer models' existing finest detail; excluded effects and objects
  absent from those models remain excluded. Adaptive tier recovery still uses
  its cooldown; explicit selection bypasses the ordinary two-second admission
  delay within the tier already available.
- After that selected view, visible 3×3 mosaics receive detail first, then 2×2s, then singles. Within each
  group the largest projected picture leads; mosaic span counts toward picture
  size, rather than treating its tiles as independent small images. Distant
  pictures remain lightweight. The adaptive budget admits eight detail steps at
  the middle level and 24 at the highest: furnished costs one, close-detail two.
  This promotes selected feeds instead of upgrading the whole wall together.
  Ordinary upgrades also require two seconds of stable admission;
  downgrades are immediate. Targets resize only as their next capture renders,
  preserving the existing image until replacement. At most one resizes a frame.
- The enhanced picture requests a capture every two global capture slots, with
  priority over ordinary area refreshes and warmups. That permits about 15
  updates/second with headroom, about 7.5 above 24 ms/frame and 4 or less above
  40 ms/frame. Other feeds share the remaining slots in their existing rotation;
  face captures retain precedence. Invisible enhancements remain idle, and
  restoring or moving the selection immediately removes its old cadence priority.
  These are scheduling ceilings, not measured device FPS.
- At most one visible or explicitly prewarming feed per displayed frame, rotating fairly between ordinary due cameras.
  Total capture work is also limited to about 30 captures/second, dropping to 15
  when average frame time exceeds 24 ms, then 8 or less above 40 ms. This is based
  on smoothed render-frame intervals, not a GPU timer or a promised frame rate.
  Without an enhancement, with all 32 slots visible, the 30-capture limit permits roughly 0.94 updates per
  feed per second; 15 permits roughly 0.47. These are ceilings, not measurements.
- Nearby screens request a refresh no sooner than 160 ms, medium screens 350 ms,
  and distant screens 700 ms, multiplied by 1.5 on low quality. The largest visible
  duplicate determines a slot's cadence. Off-screen feeds are idle except for a requested layout warmup; no catch-up burst.
- Only the source selected for this frame's capture updates visitors and transforms,
  joins the renderer's records, or uploads instances. Source captures traverse only
  that source's record list, instead of scanning all hub geometry in every pass.
  Angles of one room share its geometry and visitor pool. Camera proximity no longer
  activates the hub's optional portal/particle effects or the lake's cosmetic effects.
- Captures stop outside the chamber and while the document is hidden. A feed
  with no visible screen stays idle unless it is warming for the next layout.
- Each feed has its own view, frustum and short far plane. The current world is
  updated once. Captures reuse its instance buffers and omit new shadow maps,
  postprocessing, recursive screens, mirrors, portal pictures and light beams.
- Island capture size filtering admits successively smaller objects at the
  furnished/close levels (radius cutoffs 1.25, 0.65 and 0.25 metres), preserving
  character parts and the pile explicitly. Shadows, recursive views and heavy
  effects remain excluded at every level.
  Existing foliage silhouettes remain; the pile uses its distant banana shell.
- Canvas 2D draws the room with honestly labelled offline screens.

Thirty-two area color targets use 2.53 MiB at lightweight, 4.5 MiB at furnished,
and 18 MiB if all retain close-detail targets, before depth attachments.
An enhanced target uses about 3.09 MiB. Repeatedly enhancing different slots can leave
their larger images retained until a later scheduled capture resizes them; the
absolute bound for all 32 area color targets is therefore about 98.9 MiB before depth.
The active detail budget admits at most twelve close-detail feeds at once; old
off-screen targets keep their images until their next scheduled capture resizes
them. The shared face camera adds two
buffers totaling 0.28 MiB as it starts capturing, rising to about 3.23 MiB
when its live image is enhanced to 1200×675; its seed remains 256×144. Source world
geometry and simulation dominate the memory budget; screen count does not
multiply the number of cameras or textures.

### Face broadcast

While nobody is controlling the chair, a randomized 34–56 seconds of regular
feeds is followed by an approximately 2.8-second wave (1.5× the previous speed) that replaces
individual screens with the same live close-up of the controlled Ooga. It begins
at the return mirror and spreads away around both sides. Middle rows tend to
lead, with a small speed difference toward the ceiling and floor and fresh
random row speeds and tile jitter. A brief warm flash fades over each new image;
it uses the existing instance highlight, adding no flash geometry or textures.
The old image remains until its destination is ready. Every
screen holds the complete face for a randomized 6–10 seconds, then the same outward pattern
restores the current mosaic arrangement. The timer pauses in hidden tabs and resets on
travel or changing the controlled character. Automatic transitions are disabled
while the player sits in the chair; clicking owns the choice until they stand.

One camera follows the actual authored head transform and proportions, including
looking and swiveling. It includes the actual room behind the Ooga: walls, floor,
chair and the TV wall, with its camera kept inside the chamber. Background TVs show the Ooga’s face with recursion capped at one nested layer.
The prewarm captures a clean image before any screen switches to faces; that
image is held inside the background TVs for the whole transition. The foreground
close-up stays live in a separate buffer. The deepest image therefore contains
ordinary area feeds, never another face broadcast. This prevents feedback from
deepening over time and avoids sampling the framebuffer being written; it adds
no nested captures. In this camera image only, sixteen extra face screens fill
the return-mirror opening. The clean seed uses an area feed in those tiles,
so they cannot introduce another recursive layer. The real room’s mirror stays
visible and usable. Mirror reflections and portal effects remain excluded. Its image is shared by every panel. It prewarms before the
wave and waits for its first valid capture. During the broadcast it requests up
to ten captures per second (less on low quality or slow frames), within the same
global capture budget; it never adds an extra capture pass to a frame. Area feeds
with no visible panels stop capturing. No separate avatar or simulation is made.
The debug position display's `data-observatory` reports the phase and changed
panel count alongside the existing camera counters.

### Separate areas and eventual coverage

`observatory-bifrost.js` is the first separate-area observer. It reuses the
entrance window's reduced chamber model in a camera-only graph, with independent
geometry identities, lighting and no shadows. Source identity excludes that
graph from the hub, every other feed and the main view. It never enters Bifrost's
interactive scene or opens a second simulation, audio graph or network session.

A fixed pool of 32 simple Ooga silhouettes (`observatory-visitors.js`) reads the public chamber poses already
received by `net.remotes`, at 10 Hz. Bodies with missing or mismatched `poseZone`
are hidden. There are no invented visitors. Chamber motion is a lightweight
approximation: rings and glyph move locally, and travel-window charge follows
visitor proximity. Exact machine phase, gaze, costumes and recursive world
windows are omitted. Multiplayer observation still needs acceptance testing.

`observatory-timechain.js` supplies the seven non-lockable Sphere rooms. It takes
their sphere dimensions, floors and raked seating from `timechain-rooms.js`, with
very simple furniture silhouettes for the museum, temple, workout room, party
stage and planetarium projector. These are reduced structural representations,
not full-fidelity room captures. Museum exhibits and other furnishings are
approximate. The dome stays blank: films, lecture slides, sky playback, decorative
effects and interactive machine state are omitted rather than invented. Only
existing public remote poses animate the room views. No interactive room scene,
deferred Timechain bundle, media session or extra subscription is started. The
Conference Room is excluded by the catalog and rejected by the observer factory.

`observatory-workshops.js` adds the public Factory hall, Arcade hall and Hangar.
Factory cameras share its existing entrance-window model; Arcade cameras share
its authored hall, mezzanine and cabinet layout with simplified furniture. The
Hangar is a low-poly representation of its public hall, runway, workshop and Jet
silhouette; dimensions mirror `hangar-models.js` without loading that bundle.
Cabinet games, factory forwards/flashes, engine tests and projector media are
omitted. Locked Hangar side rooms are absent. Public visitors use the existing
zone-checked silhouette pool; no NPC activity or machine state is invented.

Observer models are built only while selected inside the Observatory, updated
only when captured, and released when their last angle rotates out or on exit. The shared
catalog and fixed slots let future adapters add areas without retaining every
interactive scene or increasing texture count. Additional observer models still
need geometry budgets. DSB Land, its buildings, Ember Den and game interiors remain
future work; each needs a camera representation and an available-state check.
The goal is eventual coverage of every eligible area, respecting room access.

The adaptive furnishing layers add arcade control decks, coin slots, mezzanine
rails and pool-table surrounds; Hangar gangways, stairs, trestles, engine intake
faces and workbench fittings; and Sphere-room seat frames, treadmill rows, bike
consoles/pedals, museum exhibit grilles, temple steps/beams, speaker faces and
projector fittings. These are static camera representations, not synchronized
game or machine activity. Layers share the source's ownership and are hidden
before collection when their tier is not selected. Bifrost, Factory, and the
other public observers share richer generic visitor faces/hands/feet above the
lightweight level; these do not claim full character likenesses. No new network
subscriptions, player limits, private-room access or media sessions are added.
Debug feeds expose `adaptiveLevel`, `detail`, `captureWidth`, `captureHeight`,
`frameMs`, `draws` and `triangles` for device acceptance work.

### Geometry observations

The pile camera now reaches 60 metres so the cave wall behind the bananas is
inside its far plane. The Mempool chamber camera sits on the chamber rim and
looks upward at the lake's underside, with the mined cube's emergence and drop
in frame. A visible lake or chamber feed advances the existing water animation
and receives the existing mined-block event; weather, wildlife and chamber
painting updates stay asleep for the Observatory. Hidden lake feeds do not queue
new block shows. There is no additional connection or simulation.
Focused browser validation passed 2/2 checks (including clean console), covering
hidden/visible demand, block completion and outdoor-effects isolation. Actual
1200×675 captures on the enhanced 7×7 wall verified both angles; a synthetic
block event verified the cube on screen. Screenshots are in
`untracked/architect-lake-camera/`, and the two gallery images were refreshed.

Initial local browser captures, at noon with the simulator and network disabled,
showed the entrance cameras at roughly 403k (B.C.A.), 494k (Arcade) and 467k
(mirror) submitted triangles. The wider pile view varied with passing Oogas and
reached roughly 837k; it was subsequently narrowed and moved closer to the pile.
These are renderer submission counts, **not GPU timing or device benchmarks**.

One island terrain draw contributes 223,115 triangles to each of these views.
Additional cave/terrain sections also survive their shared broad bounds. In the
wider pile view, one character mesh alone contributed 110,080 triangles. This
explains why resolution alone is not enough, and why tight entrance framing is
cheaper than a broad crowd view. The implementation does not repartition the
shared terrain or simplify other contributors' character geometry.

The expanded catalog's Bifrost observer submitted **7 draw calls / 11,098
triangles** without visitors in the local browser. Merge Rock was about 294k
triangles. Hub entrance feeds still include the large terrain batches above;
the adapter approach is substantially cheaper for separate interiors. These
figures are individual captures, not a sustained performance benchmark.

Initial reduced Timechain captures submitted about 840–10,344 triangles per
view without visitors. The underlying hub interiors remain heavier (roughly
96k–532k in this preview); the slot scheduler does not make each hub capture
cheaper. Real device performance and multiplayer fidelity still need acceptance.

With `debug=1&pos=1`, the existing position display's `data-cameras` contains
current per-camera capture, draw-call and triangle counts, plus the five largest
mesh contributors from its first capture. The normal page does not allocate
that profiling map. Before the denser mosaic layout, a local 32-feed snapshot showed a smoothed render-frame interval of about 13.3 ms
at the arrival view, with all slots capturing and no console warnings/errors.
Factory views submitted 16,195–18,267 triangles; Arcade 1,056; Hangar 744,
without visitors. This is one desktop preview, not a before/after benchmark,
GPU timing or a claim about mobile performance. Representative device acceptance
remains before merging.

## Sound

`architect-audio.js` follows Bifrost's layered, spatial, room-responsive approach
and pooled lifecycle, with an original palette. The close-pitched electrical
beats are replaced by a quieter 49/98 Hz foundation and soft 147/196 Hz rack
harmonics and filtered ventilation. Area/face screen changes no longer alter the
foundation, air level or filter brightness, removing the face-view swell.
Slow level and filter motion gives the bed some movement without a rhythmic
heartbeat. The rack remains a quiet spatial anchor; sitting reduces it.

Looking up smoothly introduces a 73.5/245 Hz ceiling harmony while reducing the
foundation by up to 35%. Looking down fades that layer away. Holding a gaze on a
new wall sector for 0.7 seconds answers with a short glass resonance, spatially
panned from that sector, with eight pitches around the room. The gaze intersects
the actual cylindrical wall and ignores floor/ceiling views. A four-second
cooldown and the held-gaze requirement prevent rapid head turns or boundary
jitter from retriggering continuously. A more audible background resonance plays
every 8–16 seconds; interactive tones reset that timer so cues do not pile up.
Each resonance has a quieter inharmonic partial and a finite decay.

Received voices or local speaking lower all ambient and interactive layers to
55%, leaving the pen and crossing cues clear. This follows Bifrost's gaze-responsive
layering without reusing its motif, world chord, heartbeat or recordings.

Ten oscillators and one looping noise source are built once after browser audio
activation. Slow controls update at 10 Hz, with no per-frame or per-cue node
allocation. The pen’s two-part click retains its separate pooled noise bands for
the plastic body and crisp mechanism, with a short spring resonance. The down-click
lands at the button stop (50 ms); after a gap, the brighter up-click lands at its
return stop (170 ms). Small intensity and pitch changes vary repeated clicks.

`room-acoustics.js` adds a parallel, local-only reflection path to the driven
Ooga's footsteps, the room's cues and received conversation. Three stereo taps
at 37, 67 and 113 ms pass through 180 Hz high-pass and 2.6 kHz low-pass filters.
There is no feedback, microphone monitoring or change to transmitted voice.
Voices get 60% of the footstep reflection strength, ambience/cues 40%; dry audio
stays intact. Each received voice's echo enters before its existing gain and
limiter, so local mute, hearing cutoff and receive volume also control the tail.
Voice still bypasses the environment mute as before, except for the existing
overheard-voice policy. Without Web Audio, voice retains its dry element fallback.

The reflection graph is allocated only when needed in this room, reused on
return and disconnected on source disposal. The wet output is cut immediately
on leaving, so this room's echo does not follow the listener onto the island.
The room's **Room hum** channel and master mute still control ambience and pen
clicks; footsteps retain their own channel. Weather is disabled inside, and the
camera pictures have no soundtrack or duplicated outdoor voice. Ambient sound
fades out and its context suspends on leaving or hiding the tab; returning reuses
it, and hub disposal closes it and removes listeners. Headphone/laptop listening,
voice intelligibility and long-session balance remain maintainer acceptance work. The revised gaze-responsive
palette has build/syntax validation; its audible balance still needs in-room
listening acceptance.

## Validation and preview

The adaptive camera-detail pass has build/syntax validation and a separately
authorized focused browser check: **11/11 checks passed**, with a clean console.
The renderer was exercised with controlled frame intervals to verify promotion,
load-driven reduction, cooldown/recovery, the Low quality ceiling and off-screen
capture suspension, 3×3-before-2×2-before-single detail admission, and redistribution
to smaller pictures when the large mosaics leave view. Eleven source models restored their baseline visibility and
released their owned meshes; nine gained optional furnishing geometry. The Arcade
capture ranged from 1,056 triangles at 192×108 to 2,448 at 512×288. This checks the
controller and rendering paths, not actual device FPS or multiplayer capacity.
Evidence is in `untracked/architect-feed-detail/` (`report.json` and the detailed
and lightweight Arcade screenshots).

The browser-free unit lane passed **805/805 checks** after initializing the
extracted mirror/collection fixtures with the renderer's ordinary capture/scope
flags and intentionally re-baselining the fragment shader for `uCanvasFeed` and
`uChrome` (`edd7c63c…`). Vertex and shadow shader hashes remain unchanged.

The maintainer authorized focused (`fast`) browser checks. The latest room-isolation
and mirror-quality run passed **5/5 checks**, and the focused floor reflection run
passed **2/2 checks**, both with a clean console. Build and syntax checks passed. It checks
that room-only frames leave outdoor transforms untouched, skip outdoor instances
and shadow passes, and use indoor lighting; a scheduled live island feed alone
collects outside; shared indoor/outdoor geometry stays separated; leaving restores
normal daylight rendering. The existing mirror quality checks also pass.

The reported view was reproduced in isolated Chrome. Disabling the glossy layer
left the rectangular patches visible, identifying outdoor shadows as their cause.
After isolation, a fresh screenshot shows a continuous floor reflection without
those patches. An isolated room frame had about **340 active render records versus
1,180 before**, with zero shadow passes. These are workload counts from one desktop
view, not FPS, GPU timings or a mobile benchmark.

An earlier broader mirror run passed **16/19 checks**. The mosaic assembly and
seated pen body-anchored assertions failed. The mosaic failure remains unresolved;
the pen assertion has since been updated for the requested inward movement and
third-person restoration, but has not been rerun. The third failure, the
synthetic floor pixel fixture, is now corrected and passing after explicit
maintainer approval to continue beyond its STOP. Its 0.3 reflection strength on
black produced a maximum red value of 37 at the elevated view, below the fixture's
40 signal cutoff. The fixture now uses full reflection strength to expose clipping
clearly and a reflection-disabled control to exclude directly visible ceiling
pixels. Production reflection strength, pixel cutoff, coverage minimum and
backing/seam tolerances are unchanged. The full mirror suite is not claimed green.

Earlier manual review covered entry/return, wall collision, live camera slots,
chair jumping, sitting, swiveling and standing. Final mosaic split/assembly and
no-blank switching, pen framing and stationary clicking, seated combat/carry zoom,
backward crossings and held movement, face-background recursion, and reflected
flashes still need complete acceptance against the final layout. Build and syntax
checks do not replace that acceptance. The standalone audio checks and the full
suite have not been run. Listening, multiplayer, context-loss recovery and
lower-tier/mobile performance remain pending. Keep the PR draft; nothing deployed.

Local source preview after building:
`src/index.html?debug=1&view=architect&character=w-s-bitcoin&nosim=1&net=0&welcome=0&pos=0&hour=12&firstperson=1`
