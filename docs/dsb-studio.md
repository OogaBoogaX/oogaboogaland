# DSB Studio (Milestone 9A)

Only DSB Studio is added to the reusable DSB interior registry. The Meme Factory builder and exterior geography are unchanged.

## Visit and controls

The Studio exterior door uses Space / the existing action button / the contextual touch button. The room begins at elevation 3 in a dim corridor, with the DSB Spaces jukebox (decoration only) to the left and an enterable ticket booth with a corridor-facing service window to the right. A rear gallery overlooks four rows of eight audience seats and central/side stairs. Two side balconies add four sittable lounge chairs with small tables; their entrances connect to the rear landing. The lower stage has a brick sign wall, stand-up microphone and stool, two audience-facing talk-show chairs, a coffee table, mugs and rug, a separate wooden host desk with its own chair, plus a visible ceiling lighting rig.

Approach the front of a seat and use the same interaction to sit. Space or the single normal **STAND UP!** action button returns to the clear row aisle. Seated walking input is ignored; look, weapon selection, aiming and fire remain available. The seated view uses the existing first-person camera and restores the follow/shoulder view on standing. **T** or **Throw tomato** uses the shared crew projectile pool. Lighting is authored; there is no stage-light control.

Audience and balcony seats use the existing crew seat contract with opt-in `allowWeapons` and `lockMovement`. Camp seating retains its prior behavior. All three stage chairs use that same contract. The guest chairs turn 0.3 radians (about 17°) toward the host while presenting to the audience. Each has a clear outside approach/stand point; the host uses the open right side of the desk, with its existing seated anchor behind the desk.

## DSB Spaces archive (removed)

Removed on 2026-10-21. The jukebox used to open a player for the DSB Spaces recordings, listed by a third-party WordPress page (`hodlerhiq.net`, a PHP endpoint) and played from that site. The project no longer calls any external PHP page, so the dialog, its fetch and its media permission (`media-src https://hodlerhiq.net`) were taken out. The cabinet and its sign stay as set dressing with no prompt. The validation notes below predate the removal.

## Rendering and lifecycle

Room geometry builds lazily once per DSB scene visit. Shared dressing meshes cache each chair/prop type; repeated seats and brick colors use the renderer's existing geometry instancing. There are three non-shadow-casting point lights, no new framebuffer and no decoration updates per frame. Existing low-quality light limits comfortably include all three lights. Scene exit releases room nodes and player/seat references. Audio and projectiles do not cross the door transition.

## Correction design references

The host desk adapts the broad wooden front, shallow top and host-behind-desk arrangement from the [Carson set](https://entertainment.ha.com/itm/movie-tv-memorabilia/memorabilia/johnny-carson-s-iconic-home-base-interview-desk-swivel-chair-guest-chair-guest-couch-coffee-table-and-full-array-of-set-el-total-17/a/7318-89236.s), [Leno desk](https://entertainment.ha.com/itm/movie-tv-memorabilia/props/jay-leno-s-home-base-interview-desk-from-the-tonight-show-with-jay-leno-nbc-tv-1992-2014-/a/7318-89237.s) and [Conan interview composition](https://www.newscaststudio.com/2018/01/16/conan-new-set/). It uses original block geometry, not copied set imagery.

Review views (with `scene=dsb&debug=1&interior=dsb-studio`): default corridor, `studio-reveal`, `studio-balcony`, `studio-stage`, `studio-seat`, `studio-host`, `studio-booth`, `studio-mic`. Use the named `dsb-preview/index.html` deployment route.

## Concept polish — pending browser validation

The supplied concept board guides the lower dark ceiling and corridor, burgundy runner, dark balcony lattice rails, smaller maroon seat backs, warm aisle lights, folded curtains, stacked gold DSB / STUDIO lettering and microphone emblem directly against brick. The guest conversation area sits to the left, the lowered wooden host desk to its right, and the stand-up mic at the far right. Furniture remains original cached block geometry. The stage rig is lowered to frame the backdrop; the room retains its existing walk surfaces and three lights.

Measured Yellow: body height 1.370, body radius 0.697, standing face/head range approximately 0.881–1.288 above the floor. The ticket opening is 0.75–1.40 above the booth floor. The mic head is 0.949 above the stage, at the model's lower face. Desk top is 1.04 above the stage; seated host face starts at 1.279 above it. The host chair shares the existing seat interaction, with an audience-facing initial view and a clear stand point behind the desk. There are 39 seat anchors: 32 audience, four balcony, two guest and one host.

Available validation: normal build, syntax checks and whitespace checks pass. A headless geometry audit using the real room builder and interior collision function passes ten checks, including all stand points, booth/corridor/balcony access, host approach, window/desk scale and light budget. The existing browser checkpoint is updated to include the host in repeated seated weapon/archive cycles.

Browser validation is **not complete** for this polish. Chrome could not start because required local sockets were denied; the environment rejected escalated execution. No current visual captures, touch/gameplay, live media, or repeated renderer/listener lifecycle results are claimed. The user authorized publishing this existing correction after rerunning the available build/static/geometry checks, with interactive browser validation remaining manual. Manual review covers concept similarity; booth face alignment; microphone, desk and chair scale; host Sit / single Stand Up; seated gun/tomato actions; touch controls; jukebox playback/attenuation; and repeated entry/exit isolation and cleanup. Prior results below describe the earlier correction only.

## Previous correction validation

- Build and syntax/static checks pass.
- 25/25 focused touch checks pass at 390×844, including three complete seated gun/tomato/archive cycles, one stand-up control, sound cues, attenuation/return, exit cleanup and full DSB departure/re-entry.
- Desktop interaction/lifecycle checks pass. An initial navigation fixture aimed beyond the safe room edge for Yellow's measured 0.697-unit body radius; the fixture now targets the balcony aisle. The final desktop navigation audit confirms both complete balcony aisles, all seat approaches, corridor and ticket-booth access.
- All 28 seats sit and stand successfully; held movement reaches the stage and returns to the entrance. Standing and seated tomato throws trigger the generated throw/splat sounds. Renderer records and listener counts stay bounded across repeated visits.
- Meme Factory passes movement, current-weather restoration, ten room cycles and AudioContext disposal. Noderunner TV/radio/jukebox regression checks pass. The one console-only failure is the known software-GPU ReadPixels stall warning; no application error was logged.
- A real Year-five MP3 decoded under the Pages origin and CSP. Playback advanced from 4.85 to 7.70 seconds across silent theater / audible cabinet positions without replay; pause and exit disposal passed. The public archive returned 32 entries.
- Final corridor, upper reveal, balconies, stage, booth and mobile seated views were inspected. No lighting UI remains; three authored point lights remain.

## Original implementation validation (before correction)

- Normal build, JavaScript syntax checks and whitespace checks pass.
- Studio focused lifecycle: 17/17 desktop and 17/17 at 390×844 with real touch events. Three complete enter/sit/fire/throw/stand/play/exit cycles, then a full DSB departure/re-entry; no listener or warmed renderer-record growth.
- All 24 seats sit and stand successfully. Held movement traverses the center stairs down to the stage and back to the corridor. Seated look changes direction; keyboard V fires three existing gun rounds and T throws from the shared projectile pool.
- Live Year-five JSON supplies 32 entries. A real MP3 decoded and advanced with duration 42:07; exit left zero media elements, requests or cached archive items in the controller. Other archive routes and public CORS headers were verified with small requests.
- Existing Meme Factory functional checks pass, including ten door cycles and restoration of current night/rain. Noderunner radio/TV/jukebox correction checks pass. One Meme Factory console-only assertion encountered the known software-GPU ReadPixels stall warning; no application error was logged.
- The global unit run still encounters the pre-existing cave-dimension and mirror failures, then the unrelated breakables fixture exception. These were not changed.
- Desktop/phone layout inspection keeps all player controls visible with an independently scrolling archive list. Visuals were inspected in clear light, low quality and storm/late-day exterior conditions.

Physical-device sound balance, hardware GPU performance and final artistic approval remain human review items. No other venue interior is implemented.

## Stage-chair correction

All three stage chairs register with the existing crew seat system; no new UI or seating implementation is introduced. The browser checkpoint now exercises each stage chair individually through its existing seated gun, tomato, single stand-control and lifecycle checks. Browser interaction remains a manual review item because local Chrome IPC is unavailable. Deterministic seat checks cover the real crew sit/stand functions with the room collision function, all 39 anchors, stage approaches and chair-facing alignment.
