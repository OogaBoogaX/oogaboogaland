# Cloud Hopper levels: design plan

Status: proposal for review. Gameplay code has not been changed yet. Sections 1 to 6 are
recommendations; section 7 lists the decisions that need the maintainer.

Scope: fix cloud disappearance, add four selectable levels with unlocks, a separate
environment per level, new power-ups, and separate leaderboards and ghosts per level, all
in Cloud Hopper (`src/js/cloud-hopper*.js`) and its score contract.

## 1. Findings from the code

**E** marks something read in the code or measured on it. **H** marks a hypothesis to check
in play.

### 1.1 Disappearance timing (`cloud-hopper-course.js`)

- **E.** Every cloud, main or alternative, runs the same kind of cycle. Each cycle is a
  fixed 9–15 s (`cycleSeconds = 9 + r·6`). In each cycle the cloud fades over 1 s
  (`FADE_SECONDS`), stays hidden 1.2–3.2 s, then reappears over 0.45 s. No cloud is
  exempt, so every cloud disappears roughly every 12 s.
- **E.** The first fade happens at `delay (3–10 s) + fadeAt (2 s to cycle − 5.15 s)`.
  Across 200 seeds, every cloud's first loss of support came between 6.0 s and 20.4 s
  after departure. So the whole field disappears for the first time during the first
  20 seconds of the run, while the player is still on the first few clouds. This is the
  one real coupling between clouds: the start of the run is crowded with disappearances.
- **E.** Nothing warns before the fade. The 1 s fade is the only signal (the top sinks 2 m
  and `audio.fade` plays once at onset, within 50 m). A running jump with an air jump
  stays airborne for 1.5–2.6 s, longer than the warning.
- **E.** Measured over 200 seeds and 300 s: at any moment, 30.4% of clouds are not fully
  solid. A cloud that is fully solid at take-off is no longer fully solid 1.8 s later
  21.7% of the time, and has no support at all 9.6% of the time.
- **H.** That explains the complaint. The clouds are not literally coordinated (each has
  its own seed and period), but with about 38 hops a run, a player who cannot see a fade
  coming loses about 3.6 landings to "no support", and about 8 to "fading under me".
  Mid-air redirection picks another cloud that is just as likely to fail, so streaks of two
  or three happen most runs. Without warnings these streaks feel planned.
- **E.** The schedule is a closed-form function of race time (`fadeAt`, `hiddenFor`,
  `cycleRandom`). That keeps it correct at any frame rate and through long frames, and it
  should stay that way.
- **E.** Hidden tabs: `raceNow()` leaves out hidden time and `course.update` follows race
  time, so a hidden tab freezes the schedule. The unit fixture already checks this
  (`backgroundPaused`).
- **E.** Waiting before departure: no disappearance clock runs before `course.start()`
  (`time = 0`), and drift eases toward one lane edge without reversing.

### 1.2 Motion, resets and pickups

- **E.** Lateral drift is tied to the disappearance schedule. `movePassAt` advances the lane
  pass halfway through each hidden span. `driftAt` sweeps the lane from −range to +range
  between that cycle's reappearance and the next loss of support, then the cloud jumps
  back while hidden. So drift speed depends on each cycle's random fade time.
- **E.** Two pieces of code guard against that jump: rider carry is skipped when
  `movePass` changes during a frame (`cloud-hopper.js` `preUpdate`), and `touchTime`
  stops sweeping across a pass change.
- **E.** A cloud that never faded would stay in pass 0 forever. It would ease to its lane
  edge (`-expm1`) and stop there: no jump, but no movement either. A permanent cloud
  needs its own motion.
- **E.** Falling pickups detach at `firstGoneAt`, at the pass-0 drift position for that
  moment, then fall in closed form. On a cloud that never fades, a pickup would simply
  stay on it.
- **E.** `canRecover` and `canInterceptPickup` are conservative. They count every cloud,
  hidden or not, over its full lane (`2 · moveRange`). They do not depend on the schedule,
  so the new schedule cannot cause an early disqualification.

### 1.3 Course size today

All measured with the hub's values: island radius 30, finish at the pile (y 2.34),
`START_DISTANCE` 472.5, `START_HEIGHT` 232.5.

| Quantity | Today |
|---|---|
| Route distance (defined in 2.1) | 430.5 m (472.5 − 42) |
| Total descent (last cloud 18 m over the pile) | 212.2 m, slope 0.493 |
| Main landings / alternatives / total | 38 / 24 / 62 (`MAX_CLOUDS` 128) |
| Along-route spacing, drop per hop | 11.3 m, 5.6 m |
| Main cloud half-sizes | rx 2.7–3.6, rz 1.9–2.6 |
| Jetpacks, boost, bounce | 1–2 packs; boost on 22% and bounce on about 16% of eligible clouds |

- **E.** Reach: run speed 11.6 m/s, jump 4.8 m/s, gravity 9.8. From a 5.6 m drop a running
  jump spans about 19 m, or about 31 m with the air jump timed late. Today's edge-to-edge
  gaps of 4–10 m are generous. The difficulty comes from timing and drift, not from gap
  length.
- **E.** Cloud meshes are three shared variants per kind (`M.variants`), scaled per node.
  A course of any length uses at most nine cloud geometries, drawn instanced.
- **E.** Ghost capture keeps one scratch buffer of 12,001 samples × 155 floats (7.4 MB) and
  copies each best into a buffer sized to that run (about 0.6 MB per minute). Sessions
  are a page-life `Map` keyed by login, one best per login.
- **E.** The camera's far plane is 900 m. During play the hub sets fog to 900–2000 m
  (`scene-hub.js`, `cloudPlaying()` branch), and the world bound is `START_DISTANCE + 80`.
- **H.** Typical completion time today is about 90–130 s. It has not been measured, so it
  should be confirmed from play-test times before tuning (step 2 in section 5).

### 1.4 Scores and ghosts

- **E.** `highscore-rules.js` has one attributed game, `cloud-hopper`, with one machine,
  `cloud-hopper-1`. Its D1 row (`0003_highscores.sql`) keys `highscores`, `achieved` and
  the private `owners` by lowercase GitHub login and keeps the top 1,024.
- **E.** The rename, login-reuse and deletion triggers update **every** row with
  `score_type = 'ooga'`, not just `cloud-hopper`. A new attributed row is therefore covered
  by the existing identity cleanup with no new trigger.
- **E.** The Worker answers a game only if its D1 row exists and matches the registry
  (`readScores`), and otherwise returns 503 `closed`. A new game therefore needs a
  migration that inserts its row.
- **E.** Ghosts and session results exist only for the page's life and are never uploaded.
  A recording stores `seed` and `driftTime`, but replay follows the recorded poses, not the
  course, so a ghost does not depend on the course it was set on.

### 1.5 Selection flow and saves

- **E.** Rally's garage (`race-hud.js`, `#garage`) lists tracks as button rows with a medal,
  a local-best note and a shared-best note. Cloud Hopper's intro is a `<dialog>` built in
  `cloud-hopper-hud.js`, with Start ride, Not now, a shared board and the fresh-press guard
  for Enter and Space.
- **E.** Saves live in one localStorage document (`oogaboogaland.v1`, `game.js`), checked
  field by field in `load` and reset by `resetAll`. Rally's cup and mirror progress are
  stored there per browser, not per login.

## 2. Levels

### 2.1 What "distance" means

**Route distance R** is the horizontal distance along the course axis (the ray from the
island's centre through the dock) from the launch cloud's centre to the final cloud's
centre. The final cloud always sits at `mainlandRadius + 12` = 42 m from the centre, so
`R = startRadius − 42`.

These are left out on purpose:

- **Altitude**, which each level sets with its own slope.
- **Lateral zigzag**, which is a difficulty setting and is bounded per hop.
- **The last stretch to the pile** (the same 42 m in every level). Including it would
  break the 1.42 ratio.

The path actually flown is longer than R, but grows in step with it, because the number of
hops is proportional to R and the sideways travel per hop is capped.

Following your note, Level 1 is 21% shorter than today: **D = 0.79 × 430.5 = 340.1 m.**

| Level | Factor | Route R | Start radius | vs. today's route |
|---|---|---|---|---|
| L1 | 1 | 340.1 m | 382.1 m | 0.79× |
| L2 | 1.42 | 482.9 m | 524.9 m | 1.12× |
| L3 | 2.0164 | 685.8 m | 727.8 m | 1.59× |
| L4 | 2.863288 | 973.8 m | 1,015.8 m | 2.26× |

How the rest scales:

- **Main landing count**: `ceil(R / step)`, where `step` is the level's along-route
  spacing. It is never below `2·maxRadius + 1.5`, the existing swept-clearance minimum.
- **Altitude**: `endY + slope · R`. The slope goes down with level (fewer metres of drop
  per hop means less air time). Every gap stays inside the reach envelope from 1.3
  (checked in Node, criterion A9).
- **Alternatives**: about 55% of the main count (today 24 of 38 is 63%), spread over
  stratified segments as now.
- **Expected time**: `hops × pace`. It grows a little faster than R, because harder levels
  take longer per hop.

### 2.2 Recommendation: four levels

Each level adds one new kind of challenge, so no level is just a longer copy of the one
before it:

| Level | The new skill |
|---|---|
| L1 | Learn to jump and read the warnings |
| L2 | Judge timing (today's challenge, made fair) |
| L3 | Deliberate movement and route choice (crumble clouds, forks, smaller clouds) |
| L4 | Plan a route with poor visibility (haze and rain) |

Putting haze into L3 would combine the hardest movement with the worst visibility on a 2×
course. It would also merge "moonlit aurora" and "storm" into one muddled scene. Four
levels keep each environment readable and give X-ray a natural place to matter most.

The cost of the fourth level:

- **Length**: L4 is 2.26× today's route, about 4.5 minutes, so a late disqualification
  hurts more.
- **Scope**: rain, haze and the Anchor power-up.
- **Cloud count**: about 120 clouds, so `MAX_CLOUDS` goes from 128 to 160.

L4 is the **last milestone**, with a go/no-go after L1–L3 have been play-tested. If you
choose three levels, L3 keeps its movement challenge and gets light haze in its distance
only (`fogNear` 180 m), and the Anchor power-up is dropped.

### 2.3 Level comparison

Today's course is shown for reference. All numbers are starting values, to be adjusted in
play-testing within the stated bounds.

| | Today | L1 Bluebird Hop | L2 Amber Spires | L3 Aurora Heights | L4 Thunderhead |
|---|---|---|---|---|---|
| Route R | 430.5 m | 340.1 m | 482.9 m | 685.8 m | 973.8 m |
| Start radius / height | 472.5 / 232.5 m | 382.1 / 190 m | 524.9 / 247 m | 727.8 / 308 m | 1015.8 / 390 m |
| Slope (drop ÷ R) | 0.493 | 0.50 | 0.47 | 0.42 | 0.38 |
| Along-route step | 11.3 m | 12.0 m | 11.4 m | 12.2 m | 12.5 m |
| Main / alternatives / total | 38 / 24 / 62 | 29 / 16 / 45 | 43 / 24 / 67 | 57 / 32 / 89 | 78 / 42 / 120 |
| Drop per hop | 5.6 m | 5.9 m | 5.3 m | 5.1 m | 4.7 m |
| Main half-sizes (rx, rz) | 2.7–3.6, 1.9–2.6 | 3.1–4.1, 2.2–3.0 | today's | 2.3–3.1, 1.6–2.2 | today's |
| Lateral turn target / per-hop limit | ±40 / 7 m | ±25 / 5 m | ±40 / 7 m | ±50 / 8 m | ±50 / 8 m |
| Lifetime classes P / L / O / C (2.4) | 0 / 0 / 100 / 0 | 30 / 30 / 40 / 0 | 18 / 27 / 55 / 0 | 10 / 25 / 50 / 15 | 12 / 28 / 45 / 15 |
| Permanent spine (2.5) | none | ≤1 hop to a P | ≤2 hops | ≤2 hops | ≤2 hops |
| Ordinary solid span per cycle | 4–12 s | 12–40 s | 7–30 s | 5–24 s | 5–24 s |
| Long-lived solid span | — | 70–150 s | 50–120 s | 40–100 s | 40–100 s |
| Warning, then fade | none, then 1 s | 3.0 s, then 1 s | 2.5 s, then 1 s | 2.0 s, then 1 s | 2.0 s, then 1 s |
| Hidden | 1.2–3.2 s | 1.5–3 s | 1.5–3.5 s | 2–4 s | 2–4 s |
| Boost / bounce | 22% / ~16% | 20% / ≤1 cloud | 22% / 16% | 18% / 18% | 18% / 16% |
| Power-ups | jetpack 1–2 | jetpack 2 | jetpack 1–2, X-ray 2 | jetpack 1–2, X-ray 2, Updraft 1–2 | jetpack 2, X-ray 3, Updraft 1, Anchor 2 |
| Hazards | — | — | — | crumble clouds, forks | crumble clouds, forks, haze, rain |
| Visibility (fog) | 900–2000 m | clear | clear | clear night | haze 70–260 m |
| Expected time (H) | ~90–130 s | ~60–90 s | ~110–140 s | ~170–210 s | ~240–300 s |
| Camera far / world bound | 900 / 552 m | 900 / 462 m | 900 / 605 m | 940 / 808 m | 1240 / 1096 m |

Notes on the table:

- **Classes**: P permanent, L long-lived, O ordinary, C crumble (see 2.4).
- **Alternatives** include fork detour chains in L3 and L4.
- **Camera far** is `max(900, hypot(startRadius, startHeight) + 150)`, set on entering
  Cloud Hopper and restored on exit. **World bound** is `startRadius + 80`.
- **Harder levels stay harder despite their tools.** Pickups per 100 m go 0.59 → 0.72 →
  0.73 → 0.82. Meanwhile permanent clouds thin out (30% → 10–12%), warnings shorten,
  clouds shrink (L3), sideways moves grow and visibility drops (L4). Every tool is
  temporary or single-use, and none is needed to finish.

### 2.4 Lifetime classes

Each cloud gets a class from a **new seeded stream** (`seed ^ salt`), so adding classes
does not shift any other stream's positions:

- **P, permanent.** Never fades. It is never marked in the world (only X-ray shows it), so
  the course does not become predictable.
- **L, long-lived.** Each cycle's solid span is drawn from the level's long range. Its
  first solid span is at least 1.6× the estimated arrival time (`hop index × pace`) plus
  20 s, so an ordinary run almost never sees it disappear.
- **O, ordinary.** Each cycle's solid span is drawn **log-uniformly** from the level's
  range and drawn afresh every cycle, so lifetimes vary widely, from brief to long.
- **C, crumble (L3 and L4).** Ordinary until touched. A landing starts the cloud's own
  1.8–2.5 s countdown, with the warning shown from that moment. It is visibly different
  before landing: grey, cracked puffs. A crumble cloud never counts toward the spine and
  never carries a pickup.

Fixed placements:

- The first two landings and the final two are **P**.
- Clouds carrying a pickup are **P or L** in L1, and any class from L2 on.

### 2.5 Fairness: why no failure is forced

1. **Warnings outlast a jump.** Every loss of support follows a visible warning of W
   seconds, then the 1 s fade (during which the cloud still holds you, sinking). W + 1 s
   is longer than an ordinary jump's flight (1.5–2.6 s; the slopes in 2.3 keep it there).
   So a cloud that is not warning when you jump still holds you when you land, even if its
   warning starts mid-air. A failure then comes from a misjudged jump or from ignoring a
   warning, not from the clock. Boost and bounce launches fly longer and are excluded on
   purpose. They are a deliberate choice, and their landing zones are generated with a P or
   L cloud inside the launch's reach.
2. **There is always a safe way forward.** At generation, a forward reach graph is built:
   cloud *a* reaches *b* if *b* is no higher than a full jump above *a* and the edge gap is
   within the level's guaranteed reach. Reach is conservative: 70% of the running-jump
   envelope from 1.3. Every main landing must reach a P cloud within *k* hops (k = 1 in
   L1, 2 in L2–L4). Every alternative must reach the main line or a P cloud in one hop. A
   cloud that breaks this promotes the nearest forward neighbour to P (or to L in L3 and
   L4), then is checked again. This runs once per course: about 120² pair tests, with the
   neighbour lists in a flat `Int16Array`.
3. **Neighbouring clouds do not fade together.** In the first cycles, two O clouds that
   reach each other may not start warnings within 3 s of each other. At generation the
   later one's phase is shifted by up to half its period. This is soft: after a few cycles
   the different periods drift apart naturally. It removes the 6–20 s pile-up at the start
   (finding 1.1), and the run's first 4 s has no warnings within reach of the launch cloud.
4. **Why streaks stop.** If the cloud you redirect to is not warning, it holds you for the
   whole flight (rule 1). If every visible option is warning, rule 2 still leaves a P cloud
   within *k* hops. So two failures in a row need two separate misjudgements. Independent
   misjudgements are not streaks the clock created.
5. **Why it stays unpredictable.** Classes are seeded per run. P clouds look like any
   other. Lifetimes are broad and drawn again each cycle. Positions, turns and yaw change
   every play. Waiting to see which clouds never fade costs time on a raced clock, and
   that trade is the intended route choice.

Tradeoffs:

- Warnings make the field easier to read, which lowers L2's difficulty. L2 makes up for it
  with a longer course, shorter ordinary spans (from 7 s) and today's drift.
- The spine is a hard guarantee only along the main line and the alternatives. Fork detour
  chains in L3 and L4 are made of P and L clouds by design.
- A P cloud's motion still keeps it within its lane, so "safe" never means "close".

### 2.6 Warnings, made clear

- **Visual.** For W seconds the cloud's `smokeOpacity` pulses between 1 and 0.72, faster
  as it goes (2 Hz → 6 Hz), and its puffs shimmer. This uses the node's existing
  `smokeOpacity`: no new geometry, and support is unchanged. Then the existing 1 s fade
  runs, with its sinking top. The warning is shown by both the pulse and the thinning, not
  by colour alone, and it reads the same on both renderers.
- **Audio.** A soft rising airy whistle at warning onset, within 40 m, at most one new cue
  per frame, on a pooled voice. The existing fade cue stays.
- **Crumble clouds** show cracks spreading over their countdown and play the same cue.

### 2.7 Timing consistency

- **Pure function of race time.** Each cloud's state (warning, fade, hidden, appear, the
  height of its top, its position) depends only on the seed, level, race time, the time a
  crumble cloud was touched, and any anchor hold. Everything is evaluated in closed form
  each frame, so it is identical at 30, 60 or 144 Hz and through a 5 s frame. A frame
  longer than the warning still reaches the right state; only the visual pulse is missed.
- **Variable spans in O(1).** Each cloud keeps a fixed slot length T. The solid span,
  warning position and hidden length inside each slot are drawn from `cycleRandom(seed,
  slot)`, as `fadeAt` does today. T is drawn per cloud from the class range, so gaps
  between disappearances range from about 0.5 T to 1.7 T.
- **Waiting before departure** does not start the schedule, as today.
- **Hidden tabs** freeze the schedule and motion through `raceNow()`, as today.
- **Anchor holds** stay closed form (`tEff = t` before the hold, `holdFrom` during it,
  `t − holdSeconds` after). A cloud has at most one hold, and a later anchor extends it.
- **Crumble countdowns** store `touchedAt` in race time on the cloud record, which is
  allocated once.

### 2.8 Motion

**Recommended: one smooth model for every class.** Drift no longer depends on
disappearance:

`offset(t) = range · sin(ω t + φ)`, with `range` 5–8 m (today's lane) and
`ω = speed / range`, where `speed` is 0.9–1.5 m/s (today's `moveSpeed`).

- **No jumps for any class.** Rider carry, `touchTime` and pickups no longer need
  `movePass`, and permanent clouds keep moving without ever teleporting.
- **Always inside the measured lane.** The offshore, swept-clearance and recovery checks
  already use the lane's ends, so they hold unchanged.
- **Waiting cannot move a cloud out of reach**, because it never leaves its lane. Motion
  time runs from course creation and continues through departure (`start()` keeps
  returning the phase saved with ghosts).
- **Falling pickups** detach at `firstGoneAt` (∞ for P clouds) at `offset(firstGoneAt)`,
  exactly as before.

This changes one rule in AGENTS.md: clouds currently cross their lane "without reversing".
With a sine they turn around smoothly at the ends. The alternative is a hybrid: O and C
clouds keep the one-way crossing with a reset while hidden, and only P and L clouds swing.
That keeps today's feel for ordinary clouds, at the cost of two motion models and keeping
the `movePass` guards. Decision 3 in section 7.

## 3. Power-ups

### 3.1 Ideas considered

| Idea | Verdict | Why |
|---|---|---|
| X-ray vision | **Yes, from L2** | It reads the real schedule and makes timing a skill. It matters most in L4's haze, but no route needs it |
| Emergency updraft | **Yes, from L3** | A rescue that fits L3's deliberate hazards. It uses Space, which would otherwise do nothing |
| Cloud anchor | **Yes, L4 only** | It lets you stop and scout in haze. It applies itself on landing, so it needs no key or targeting |
| Air dash | No | It needs a new key, touch button and gamepad mapping. It adds a horizontal impulse that undoes L3's precise movement, and it overlaps with the jetpack |
| Wind shield | No | No wind is proposed. Wind would be a physics change, to suggest separately |

### 3.2 How each works

| | X-ray | Updraft | Anchor |
|---|---|---|---|
| First level | L2 (then L3, L4) | L3 (then L4) | L4 |
| Where it is | a pickup on a cloud, about 0.4 of the way down; it falls with an O cloud like a jetpack | a pickup on L or O clouds before a crumble or fork stretch | a pickup on L clouds before a long stretch of haze |
| Activation | on pickup | Space in the air when the air jump is spent and no fuelled pack is worn | on pickup it is held; it applies to the next cloud you land on (not the launch cloud) |
| Effect | 12 s (15 s in L4): the remaining solid time of nearby clouds, read from the real schedule | sets vertical speed to +13 m/s (about 8.6 m of lift), keeping horizontal speed | that cloud stops fading and drifting for 12 s; if it was warning or fading, it goes back to solid at once |
| Stacking | another pickup refreshes it to full; the time does not add up | one held at a time; a second pickup stays in place, like a full tank's jetpack | one held at a time; a second stays in place |
| Visual | thin cyan edges on screen; per-cloud gauges (3.3); its HUD icon blinks for the last 2 s | a leaf spiral from the fx pool under the Ooga; HUD icon while held | a vine and stone tether hangs from the cloud, with a gold rim on the overlay; HUD icon while held, ring while active |
| Audio | shimmer up, then shimmer down 2 s before the end | wind whoosh | stone thunk and vine creak, then a creak 2 s before the end |
| Interactions | shows anchored clouds as held, crumble countdowns, and hidden clouds' time until they return | counts as an extra jump in `canRecover` (still conservative), and its pickup counts as a rescue like a jetpack's | moves the schedule by the hold (2.7); X-ray and the fade cue read the moved schedule; no effect on pickups already falling |

- **Controls.** No new key. The HUD shows at most three small icons under the timer (jet
  fuel, X-ray ring, held item), and only while they apply.
- **Introductions.** The first time a level is played in a session, a short guide card
  presents its new item. Both ways out of the guide mark it seen for the session, as
  `ooga-cloud-hopper-guide-v1` does.

### 3.3 The X-ray display

- **Reads the real schedule.** It reads `course.solidLeft(cloud)` and `course.phase(cloud)`,
  the same functions that drive opacity and support. Nothing is estimated separately.
- **Which clouds.** Up to 8 clouds within 60 m (120 m in L4), or 5 on a coarse pointer or
  a screen narrower than 600 px. The nearest are chosen with a fixed-size insertion buffer
  (`Int16Array` and `Float32Array`), so drawing allocates nothing.
- **Permanent clouds** get a gold diamond with ∞ inside, recognisable by shape as well as
  colour.
- **Other clouds** get a ring that empties over 20 s, with whole seconds written in it.
  Above 99 s it reads "99+", and while warning the ring is red and pulses.
- **Hidden clouds** get a dashed outline (a projected ellipse of 16 points) and the time
  until they return.
- **Crumble clouds** get a crack icon and their countdown in seconds from touch.
- **Through haze (L4)**, outlines are drawn on the overlay for clouds beyond `fogNear` and
  inside the radius, so the fog does not hide them.
- **Overlap.** A label that would overlap one already drawn is skipped (at most 64 pair
  checks). Text uses the ghost nameplate's outlined 11 px monospace.

## 4. Environments, weather and visibility

- **How it is drawn.** In `scene-hub.js`, the `cloudPlaying()` branch already overrides
  clouds and fog. Each level adds a preset there. It calls `daylight.sample` at a fixed
  hour into `RENDER_OPTS` instead of the live clock: L1 11:00, L2 18:45, L3 00:30 with the
  moon and stars, and L4 a dark storm grade on a dusk sample. It then sets fog and bloom.
  The island and its sea are drawn under the same preset.
- **Landing surfaces stay white.** L3 and L4 use night-readable cloud variants with an
  emissive floor. That adds three cached variants per kind and lighting mood, so the number
  of geometries stays bounded.
- **L1 Bluebird Hop.** Warm blue midday sky. Floating grassy islets with small palms hang
  well below and beside the lanes. They are built with the hub's cached foliage, marked
  `sightHidden`, have no collision, and are never under a cloud's footprint.
- **L2 Amber Spires.** Sunset with amber light. Towering cumulus spires stand far outside
  the course, built from the hub's cloud variants scaled up and placed beyond every lane.
- **L3 Aurora Heights.** Clear moonlit night. A few large aurora curtains (emissive glass
  ribbons, cached, gently waving) and silent lightning far off on the horizon.
- **L4 Thunderhead.** Storm haze with `fogNear` 70 m and `fogFar` 260 m.
  - Within 70 m nothing is fogged. At 120 m (about four hops) a cloud is 26% fogged, so
    nearby landings and their warnings stay clear. Beyond 260 m clouds are hidden, which is
    the route-planning challenge.
  - Rain uses a fixed-capacity instanced batch around the camera: 240, 160 and 80 streaks
    on the High, Medium and Low tiers, and none on Canvas 2D. `weather.js` already builds
    a tier-scaled rain batch and eight cached bolt variants. Those builders are exposed and
    reused, not copied.
  - Lightning flashes and far bolts are decorative only. Nothing strikes the player or the
    clouds.
- **Fair visibility rules (L4).** Fog is the same on every quality tier and both renderers
  (Canvas 2D already supports fog). No cloud within the level's guaranteed reach is ever
  more than 30% fogged. The banana pile marker on the overlay stays readable through the
  haze, so the direction is never lost. X-ray only adds outlines from 70 m to 120 m:
  nothing essential depends on it.
- **No physics changes.** No slippery surfaces, wind or gusts. If wanted later, they would
  be a separate proposal.

## 5. Unlocks, selection, scores and ghosts

### 5.1 Unlocks and personal bests (local)

- **Save.** `game.state.cloudHopper = { unlocked: 1..4, players: { "<login>" | "": [ms, ms, ms, ms] } }`
  inside the existing `oogaboogaland.v1` save, with 0 meaning "no best" and `""` the
  signed-out player. `game.load` checks it (integer levels, times within the registry limit,
  logins in GitHub's format), `resetAll` clears it, and a new `recordCloudHopper(login,
  level, ms)` saves it.
- **Personal bests persist between sessions, per player.** Each player's best for each
  level is kept across reloads and visits, keyed by the GitHub login the run was played
  under (the same key the session results and ghosts already use), or by `""` signed out.
  At most eight players are kept; the one who played least recently is dropped first.
  These are the bests the level cards and the result card show, whatever the shared
  board says.
- **Unlocking.** Only Level 1 starts unlocked. A clean finish unlocks the next level and
  can set that player's best. A disqualification does neither.
- **Offline and signed out.** This never depends on the shared board. A valid finish
  signed out, offline, or with the account changed during the run still unlocks the next
  level.
- **Unlocks per browser, bests per player.** Unlocks match Rally's cup and mirror and need
  no server state. Ghost recordings stay in the page session (a five-minute ghost is about
  3 MB, too much for localStorage).

### 5.2 Selection flow (modelled on Rally's garage)

- **Intro card.** Between the title and Start ride, the card shows one picture card per
  level (chosen layout B, refined). Each card shows:
  - a preview of the level's environment, with the level's number in the picture's
    top-left corner;
  - the level's name alone on its own single row;
  - its route length and status (New, the player's best, or a lock and "Complete Level N
    to unlock") on the rows below.
- **Layout.** Four cards in a row on desktop, a 2×2 grid on phones.
- **Choosing.** Arrows or Tab move between rows, a click or tap selects, and Enter or Space
  starts, keeping the existing fresh-press guard.
- **Locked rows** still show the preview, with a lock and the line "Complete Level N to
  unlock". Start ride is disabled while one is selected.
- **Default selection.** The level played last this session, otherwise the highest
  unlocked level not yet completed, otherwise the highest unlocked.
- **Shared board.** The panel below shows the selected level's shared board, switching its
  watch only when the selection changes.
- **After a clean finish**, the result card offers, in order:
  - **Next level**, the default button, when the next level exists and is now unlocked;
  - **Replay**;
  - **Level select**, which reopens the rows inside the same card.

  Return to dock stays as the last button and on Escape.
- **After a disqualification**, the buttons are Play again, Level select and Return to dock.
- **Changing level from the top** moves the platform to the new start at once, as Play
  again does today. A 0.4 s CSS fade hides the change of sky. Only the first ride of a
  visit rises from the dock.

### 5.3 Shared leaderboards

**Recommended (the smallest compatible change): one attributed game per level.**

- In `highscore-rules.js`, add `cloud-hopper-l1` to `cloud-hopper-l4`, each
  `{ scoreType: "ooga", direction: "asc", unit: "milliseconds", max: 3600000 }` with one
  machine of the same name.
- Migration `0004_cloud_hopper_levels.sql` inserts their four rows.
- The existing triggers, the 1,024 cap, the SQL comparison, the rate limits, the API shape
  and the client's `accept`/`publish` all work unchanged, because all of them work per row
  and per `score_type = 'ooga'`.

Rejected alternatives:

- **One row keyed `login:level`.** It breaks the login-keyed rename and deletion triggers,
  the client's `validLogin` check and the bound per board (four levels would share 1,024
  entries).
- **Raising `cloud-hopper`'s version.** It would erase the existing scores, and it gives
  one board, not four.

Existing scores:

- **Legacy.** No level matches today's course: L1 is shorter and L2 is longer, and the
  new timing makes both easier to read. So existing times stay where they are as a legacy
  board. The `cloud-hopper` row is kept with its data, and its registry entry gains
  `retired: true`. `valid()` then refuses writes (400) while GET keeps working. The
  triggers keep handling renames and deletions on it.
- **Whether to show it** is decision 4. The recommendation is a small "Classic course
  (retired)" link under L2's board.

Versions and identity:

- **Course and scoring versions.** Each level's configuration carries a `courseVersion`.
  A change that alters a level's difficulty bumps that level's registry `version`, and a
  migration resets that row with `revision` kept increasing (the policy already in
  `docs/highscores.md`). Purely visual changes do not bump it. Each level is versioned
  separately, so retuning L3 never touches L1's board.
- **Account changes, deletion, offline play.** These are unchanged. The ticket is taken
  with the level's game id at departure. Signing out or switching accounts during the run
  makes it local only, and deleting an account clears it from every `ooga` row, the legacy
  one included.

### 5.4 Session results and ghosts

- **Session results.** `sessions` (a page-life `Map` by login) becomes
  `{ levels: [{ runs, scores, best, lastSeed }, ...] }`, with the existing ten-row results
  list for each level. The `Map` keeps at most four logins (the oldest is dropped), which
  bounds memory to about 16 ghost recordings, roughly 20 MB in the worst case of four
  five-minute bests per login.
- **Ghost choice.** A recording is tagged `{ level, courseVersion }`. `stageGhost` plays only
  this login's best for the selected level with the same course version. A ghost is never
  shown on another level, and never after a retune.
- **The HUD** labels the ghost "Best ghost · L2 · 01:52.40 · original route".
- **Never across lengths.** Results, local bests, shared boards and the ghost line always
  name their level. No screen ranks times from different levels together. The intro rows
  show each level's own best.

## 6. Implementation plan

The disappearance fix comes first. Each milestone is its own commit on this branch. Under
the default testing mode, each ends with `npm run build` and `node --check` on every file
it touches.

| # | Milestone | Main files |
|---|---|---|
| 1 | This plan | `docs/cloud-hopper-levels-plan.md` |
| 2 | Lifetime classes, closed-form schedule with warnings, smooth drift, safety spine, neighbour spacing, `solidLeft`/`phase` | `cloud-hopper-course.js`, `test/run.mjs` (drift and schedule rules) |
| 3 | Warning pulse and cue, simpler rider carry, pickups on permanent clouds | `cloud-hopper.js`, `cloud-hopper-audio.js`, `cloud-hopper-hud.js` (guide card wording) |
| 4 | Level data module and course scaled by level | new `cloud-hopper-levels.js` (pure data, loadable in Node, loaded before the course), `cloud-hopper-course.js`, `cloud-hopper.js`, `src/index.html` (script tag), `scene-hub.js` (bound, camera far) |
| 5 | Unlocks, level selector, result actions | `game.js`, `cloud-hopper-hud.js`, `cloud-hopper.js`, `src/style.css` |
| 6 | Sessions and ghosts per level | `cloud-hopper.js`, `cloud-hopper-ghost.js`, `cloud-hopper-hud.js` |
| 7 | Shared boards per level, legacy board retired | `highscore-rules.js`, `worker/migrations/0004_cloud_hopper_levels.sql`, `worker/test/highscores.test.mjs`, `docs/highscores.md`, `cloud-hopper-hud.js` |
| 8 | Environments for L1–L3 | `scene-hub.js` (presets), new `cloud-hopper-sky.js` (decor), `cloud-hopper-models.js` (night variants, previews) |
| 9 | X-ray | `cloud-hopper-course.js`, `cloud-hopper.js`, `cloud-hopper-models.js`, `cloud-hopper-audio.js`, `cloud-hopper-hud.js` |
| 10 | Updraft | the same, plus a crew hook for a Space press with no other use |
| 11 | L3 hazards: crumble clouds and forks | `cloud-hopper-course.js`, `cloud-hopper-models.js`, `cloud-hopper.js` |
| 12 | L4: haze, rain, lightning, Anchor (go/no-go first) | `scene-hub.js`, `weather.js` (expose rain and bolt builders), `cloud-hopper-sky.js`, power-up files |
| 13 | Docs | `AGENTS.md` (Cloud Hopper row, the `highscore-rules.js` row, testing table), README controls, `docs/highscores.md` |

Milestones 2–3 could ship alone, ahead of the levels, but only by retiring or resetting
today's board at the same time (decision 7).

## 7. Decisions for you

| # | Decision | Recommendation |
|---|---|---|
| 1 | Three or four levels | **Four**, with L4 as the last milestone after an L1–L3 play-test |
| 2 | What the 21% means | **Route distance R** (2.1). If it means the start radius, L1 starts at 373.3 m (route 331.3 m) |
| 3 | Drift model | **One smooth swing for every cloud** (2.8), dropping AGENTS.md's "without reversing" rule; the alternative is the hybrid |
| 4 | Legacy board | **Keep it read-only**, with a small "Classic course (retired)" link |
| 5 | Permanent clouds unmarked without X-ray | **Yes** |
| 6 | Unlocks per browser or per account | **Per browser**, like Rally's progress |
| 7 | Ship the disappearance fix before the levels | **No**: ship them together, so the legacy board retires once |
| 8 | Power-up set | **X-ray (L2), Updraft (L3), Anchor (L4)**; no air dash or wind shield |
| 9 | Updraft activation | **Space when the air jump is spent**, not automatic |
| 10 | Crumble clouds as L3's hazard | **Yes** |
| 11 | Level names and expected times | As in 2.3; to be confirmed after a play-test measures today's times |
| 12 | Personal bests kept across visits | **Decided: yes**, per level and per player in the existing save (5.1) |

## 7a. Chosen looks (decided 2026-10-31)

Picked from real gameplay frames of each candidate. The candidates live in the temporary,
debug-only `src/js/cloud-hopper-looks.js` (`?debug=1&hopperlook=<tokens>`), which goes once
the chosen looks move into the level modules (milestones 8–12).

| What | Choice |
|---|---|
| L1 Bluebird Hop | **B**: 08:15 morning, floating grassy islets with trees under soft painted cumulus |
| L2 Amber Spires | **A**: 17:30 golden hour, towering cumulus stacks far around the island, light painted clouds |
| L3 Aurora Heights | **A**: 00:30 moonlit night, stars, green aurora curtains |
| L4 Thunderhead | **B**: dark storm, haze 50–200 m that also hazes out the sea, rain, nearer lightning |
| X-ray | **A**: ring gauge emptying over 20 s with seconds inside; a gold ∞ diamond on permanent clouds |
| Warning | **A**: the cloud thins in a dithered pulse that quickens as its time runs out |
| Pickups | **B set**: stone goggles (X-ray), sky feather (Updraft), bone anchor (Anchor) |
| Level select | **B, refined**: picture cards with the number in the picture's corner and the name on its own row |

The storm's haze needed one renderer change: the sea, drawn in the sky pass, now follows the
scene's fog when a scene asks for it (`seaFog`, WebGL). The Canvas 2D sea follows in
milestone 12.

## 8. Acceptance criteria

### Timing and fairness

Checked in Node, in the global tier:

- **A1.** Every cloud's state (support, top height, opacity, phase, `solidLeft`, position)
  is the same for frame steps of 1/30, 1/60 and 1/144 s and for a single 5 s step, over 20
  seeds per level.
- **A2.** No cloud loses support without first showing a warning of at least the level's W,
  followed by the 1 s fade. Sampled every 50 ms for 3× the expected time, 50 seeds per
  level.
- **A3.** Each level's class shares are within ±5 points of its targets over 50 seeds. The
  first two and last two landings are P.
- **A4.** Every main landing reaches a P cloud within *k* forward hops, and every
  alternative reaches the main line or a P cloud, under the conservative reach graph.
- **A5.** At every sampled moment, every main landing can reach a forward cloud that holds
  and is not warning.
- **A6.** In the first two cycles, no two reachable O clouds start warnings within 3 s of
  each other, and nothing within reach of the launch cloud warns in the first 4 s.
- **A7.** Smooth drift never leaves its lane and never jumps (position changes by at most
  `speed · dt`). Offshore, swept clearance and region balance still pass. Waiting 3,600 s
  before departure leaves every cloud solid and inside its lane, and departure is
  continuous.
- **A8.** A hidden tab freezes the race clock, the schedule, motion and the ghost, and
  resumes them exactly. This extends the existing fixture.
- **A9.** Every main gap, at the level's slope and spacing, stays inside 70% of the running
  jump's reach without the air jump (L1) or with it (L2–L4).

### Levels and progression

- **A10.** For each level, `R = startRadius − 42` matches 340.1 × factor within 0.5 m, and the
  cloud count stays within `MAX_CLOUDS`.
- **A11.** In a fresh save only L1 is unlocked. A clean finish unlocks the next level, also
  when signed out and offline. A disqualification unlocks nothing. Reloading keeps it, and
  `resetAll` clears it.
- **A12.** A locked row shows its preview and "Complete Level N to unlock", and cannot be
  started. Any unlocked level can be chosen and replayed.
- **A13.** After a clean finish, Next level, Replay and Level select appear in that order,
  with Return to dock still available.

### Scores and ghosts

- **A14.** Each level submits only to its own game id. Worker checks cover: levels kept
  separate, a rename moving the scores on every level row, deletion clearing every level
  row and the legacy one, and the legacy row refusing writes while still answering reads.
- **A15.** Session results, local bests and ghosts are kept per (login, level). A ghost
  from another level, or from another course version, is never staged.

### Power-ups and visibility

- **A16.** X-ray reads the same time left as the schedule (equal to within float
  precision). It draws at most 8 labels (5 on phones) and allocates nothing per frame.
- **A17.** Updraft takes one Space press only when no air jump and no fuelled worn pack
  remain, and `canRecover` treats it conservatively. Anchor holds exactly one cloud, and
  the schedule picks up again afterwards with a full warning.
- **A18.** In L4 no cloud within reach is more than 30% fogged on any tier or renderer.
  Rain is a fixed-capacity batch (none on Canvas 2D), and the pile marker stays visible.
- **A19.** Frame rate holds on the existing performance floor, with L4's 120 clouds and
  rain on the High tier (play-test or `npm run test:perf` when asked).

## 9. Validation plan (following AGENTS.md)

- **Default "wait" mode.** Every milestone ends with `npm run build` and `node --check` on
  every touched file. No scene runs, probes or screenshots unless you ask for them.
- **When you ask for "fast"**:
  - `npm run test:unit` after milestones 2, 4, 9–11 (Cloud Hopper's checks are in the
    global tier, about 3 s);
  - `npm test -- hub` after milestones 3, 5, 8 and 12 (the hub hosts Cloud Hopper);
  - `cd worker && npm test` after milestone 7.
- **Checks are changed, not stacked.** The existing drift rule check (`oneWay`,
  `hiddenResets`) belongs to the removed motion model, so it is replaced in the same
  commit by A7. Its other parts (offshore, clearance, balance, waiting, falling pickups)
  are kept and extended. The new schedule checks (A1–A6, A9–A10) join the existing Cloud
  Hopper rule group rather than adding a new one.
- **Your play-test checklist** at each milestone:
  - the warnings read clearly at 60 and 120 Hz, and on a phone;
  - nothing turns into an unavoidable streak over several runs per level;
  - selector and result buttons work by keyboard, touch and gamepad;
  - unlocks persist after a reload;
  - the right ghost appears for each level;
  - the shared board per level works on staging;
  - L4 can be navigated with and without X-ray;
  - the portable `oogaboogaland.html` still works.
- **No deploy.** Nothing in this plan merges or deploys. Staging verification of migration
  0004 goes through the existing **Deploy Cloudflare staging** workflow when you choose.
