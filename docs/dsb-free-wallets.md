# Free Hardware Wallets · permanent address VAC 2

Source checkpoint: `19080eb9d236733d262c8012468005027b04210e`.

VAC 2 is now occupied by **Free Hardware Wallets**. Its historical geography identity is still `VACANT 20`, at x=26 m, z=60 m, yaw 0.1244, with the same 4 × 4 m exterior footprint. The existing facade plaque now reads `Free Hardware Wallets`; the house, its door, steps, terrain, collision, plants and routes are unchanged. VAC 1, VAC 3–6 and VAC 8–35 keep their original numbers, identities and signs, and VAC 7 stays SVRN Society. There are 33 remaining vacant properties.

The plaque is 3.7 × 0.42 m, centred 0.77 m above the address's original mounting height (3.55 m above the floor), clear of the facade's two lanterns at ±1.6 m and 2.6 m, with the same DSB sign glyphs in cream on the venue blue.

The shared interior controller enters from this property's existing facade and returns the same player to its approach (x≈26.4, z≈63.5; height sampled from existing terrain).

## Why VAC 2

VAC 1–6 line the lower, harbour-facing edge. VAC 2 stands in the front row on the beach beside DSB Studio Stage, its door facing the sand and the sea: the plaque reads from the waterfront, and the open, level promenade in front of it is where a device is set down or thrown. It lies 23 m along the same promenade from VAC 1 (Free Puppies Rescue, if both establishments land). VAC 5 faces inland with a market stall in front of its door, VAC 6 faces west behind olive trees, and VAC 4 is a 3 × 3 m house; VAC 7 is SVRN Society's.

## The store

`wallets-room.js` builds a 14 × 16 m larger-inside store with a 4.6 m ceiling: whitewashed walls with a blue band, a chequer of cream and blue tiles, timber beams. It is crammed and a little dubious:

- **The vending machine** at the back under its own red marquee, `FREE WALLETS` (`wallets-models.js`: a red cabinet on a plinth, a glowing window of devices in rows, a coin slot and the tray they drop into).
- **The small print** on the wall beside it: `100% legit.` / `Trust me bro.`
- **Full shelves**: boxed devices along both side walls with overstock cartons on top, a steel stock rack packed to the ceiling at the back, two double-sided island shelves down the middle with red toppers, open crates by the machine and heaps of taped cartons in three corners.
- **The till**: the counter marked `FREE` with a register (its display reads zeros) and a card reader.
- **Display cases** of the two devices themselves, lit from below behind glass, each named on its plinth.
- **The dubious touches**: a pink `FREE` neon over the left shelves that stutters out now and then (the lamp beside it flickers with it), starburst stickers slapped on askew (`FREE!`, `-100%`, `0 SATS`, `100% OFF`), posters (`NO REFUNDS`, `SEED PHRASE PRE-FILLED`, `SMILE, YOU'RE ON CCTV`), two security cameras with blinking lights watching from opposite corners, a staff door taped shut, and in the back corner a charred crate and a scorch behind caution tape on a post.
- Planters, five point lights and one light slot kept for a blast's flash. Everything is cached shared geometry from one kit; the neon and the camera lights only change a node's glow (`flicker`, called from the scene's frame), so nothing allocates.

`%`, `'` and `,` are cut on the sign alphabet's 3x5 grid in `dsb-models.js`'s text, since the island's carved alphabet has none.

The existing `dsb-interiors` transition, lighting and audio gates, contextual menu zones and the shared menu shell are reused; the room uses the existing shop ambience. Space or the touch context button anywhere in the store, or a tap on the machine, opens the machine.

## The machine and the devices

The machine's dialog (`wallets-menu.js`) shows the two devices as pictures and names alone, **ClownCard** and **Rektdger**, and **Take**. Nothing is said about what they do.

`wallet-bombs.js` owns the devices:

- **Take** puts the chosen device over the driven Ooga's head, its name and countdown floating over it and a line along the top of the view: `Carrying ClownCard · 21 s · Click the ground to place ·` with a **Throw** button. On a desktop the take also says `Press Y to throw · Click the ground to place`; on a phone it only names the device and the Throw button stays beside the sticks. One device at a time, the next after three seconds.
- **Set down**: a click or tap on open ground walks the Ooga there and sets the device down exactly where clicked, in the store or out in the Chora. A tap on one lying out picks it up again (it is walked to first).
- **Throw**: **Y** or the Throw button lobs it about three and a half metres; in a room it bounces off the walls.
- **Fuse**: 21 s from the take, wherever it is. The lights blink faster and the beep quickens and grows louder under ten and under five seconds; the countdown turns red from ten. One still held at zero goes off in the Ooga's hands, knocks it back, blackens it with soot (`crew.soot`) and says `Rekt`.
- **Chain**: a blast sets off every live device within 2.5 m, chained, as one merged blast that widens by the square root of their number and hits by their count (capped at eight): knock-back, a fireball, debris and smoke from the fx pool, a scorch mark that fades over 25 s and a flash of point light. No camera shake.
- **Spaces**: a device or a scorch is in the Chora or in one room. A carried one goes with its Ooga; the rest are drawn and picked only in the visitor's space. One left in another space keeps its fuse and goes off unseen and unheard, setting off only those in its own space.

Keys: **Y** throws ("YEET!", as the Ooga says). T is taken in DSB (the seat rooms' tomato) and on the island (switching between the Ooga and its gorilla), and G switches an Ooga's weapons on the island, in the lab and in the Lightning Factory; Y is bound nowhere in the scenes, the pilot, the controls or the director. Escape closes the machine's dialog.

Fixed pools: 16 devices in typed arrays, 24 scorches, 4 fireballs, one instanced batch per look plus the halos, scorches and fireballs, 16 pick targets made once a visit and removed in `dispose`, prebuilt labels and carry lines. Sound is two synthesized, pooled voices on one AudioContext opened only after a gesture, silent while DSB is muted, closed when DSB is left. The frame loop allocates nothing.

## Privacy and resilience

Everything is local and offline: no requests, no remote images, no accounts, nothing saved. The devices and their parody names are made up; no real product is named.

## Deterministic review links

Base: any build of this branch (`oogaboogaland.html`, or `npm run serve`).

- Exterior: `?scene=dsb&debug=1&view=wallets-door&weather=clear&time=1200`
- The promenade in front of the store: `?scene=dsb&debug=1&view=wallets-plaza&weather=clear&time=1200`
- Interior: `?scene=dsb&debug=1&interior=free-wallets&view=<view>&weather=clear&time=1200`
- Views: `wallets-entrance`, `wallets-machine`, `wallets-sign`, `wallets-wide`; `wallets-dialog` opens the machine.
- Debug helpers: `__ooga.dsb.wallets` (`spawn`, `timer`, `cool`, `take`, `throwCarried`, `setDown`, `list`, `stats`, `detonate`), `__ooga.dsb.takeWallet(look)`.

Focused checks: `node test/run.mjs wallets-unit` (chain and blast rules, fuse, address, room navigation and zones, hands, spaces, the Chora's chain, a held device, pools, disposal and the machine's dialog); permanent addresses: `node test/run.mjs vacancy-unit`. Browser sessions, each well inside two minutes: `ONLY="wallets checkpoint" npm test -- dsb` (real door, the machine, Take, a floor click, Y in the store), `ONLY="wallets chora" npm test -- dsb` (carried out, set down and thrown in the Chora, one left inside going off unseen, a chained blast with its flash), `ONLY="wallets phone dialog" npm test -- dsb` and `ONLY="wallets phone carrying" npm test -- dsb`.
