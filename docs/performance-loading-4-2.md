# Deferred scene implementations (task 4.2)

The hosted page no longer carries the Lightning Factory, Ooga Arcade, Rally, Drop, Mine and Orbit implementations, the Canvas 2D renderer, the Lab wallpaper's JPEG or the donation kiosk. Each scene keeps a stable shell in `BL.scenes` (`deferred.scene`), and its `prepare` fetches the scene's group, after its base group where it has one (`factory-scene` after `kiosk`, `arcade-scene` after `arcade`, and so on), then runs the real `prepare` under the scene's model scope. The Factory and Arcade model files are split so the hub's shared pieces (the 2 o'clock tunnel and window, the two cabinets, the blaze, the kiosk's glass size) stay inline. HUD portraits draw with a small `icon-renderer.js` copied from the fallback's face path, and the full Canvas renderer loads only when WebGL fails or `canvas2d=1` asks for it. The director's boot became an async IIFE for that one await. The portable page and the source tree still carry every module inline and fetch nothing. PR263's DSB modules and PR265's eleven Race/Mine/Orbit extractions are untouched.

| Hosted `index.html` | Before | After |
|---|---:|---:|
| HTML | 8,039,086 B | 6,540,344 B |
| HTML gzip 6 | 2,298,268 B | 1,758,980 B |
| Inline executable JS | 7,594,144 B | 6,095,402 B |
| Inline JS gzip 6 | 2,209,798 B | 1,670,000 B |
| Deferred chunks | 5 (2.50 MB) | 14 (4.03 MB) |

Cold hub boot on a local server is unchanged (ready at 4,468 / 4,457 ms before, 4,394 / 4,496 ms after): the island's own build dominates it, so the gain is transfer size, not boot time here. The 3 MB inline / 1 MB gzip targets remain unmet.

Drop and Orbit release their island cache on departure, so each entry rebuilds it behind the fade. [The review](https://github.com/OogaBoogaX/oogaboogaland/pull/277#pullrequestreview-5637032827) reports about 1.6–1.9 seconds for that rebuild on the reviewer's machine. This is an entry cost, separate from the transfer-size saving above; it has not been independently remeasured here.

Hosted behaviour, ARM64 Chrome against the staged site served as Pages serves it (`untracked/performance/loading-probe.mjs`):

- A cold hub fetches only the Lab wallpaper, which it draws on the island; no scene, kiosk or Canvas chunk.
- Every routed scene (`/lightning`, `/oogaarcade`, `/oogarally`, `/oogadrop`, `/oogamine`, `/oogaorbit`) boots cold with a clean console, goes home and back, and fetches each chunk once. Hub to each scene, Thro-ball and Coconut Invaders and back also works.
- A 503 on `factory-scene`, `kiosk`, `arcade-scene` or `race-scene` fades back to the hub with "That place could not be opened · try again", keeps drawing, and the same entry works once the chunk is served. A failed chunk on a direct route lands on the hub.
- `canvas2d=1` fetches the Canvas chunk and tours the factory; a 503 there replaces the spinner with "The island could not open. Try again".
- The donation popup shows "Opening donation screen…", then the kiosk; with a 503 it says it could not load, closes, and opens on the next try.

The patch broke the unit tier three ways, all in fixtures that load modules by name: the Node loader now records a rejected async module as skipped, as it did a throwing one; the jackpot wheel check also loads `arcade-scene-models`; the kiosk check loads `factory-kiosk-core` first and stubs `deferred` as present. Two hosted checks counted chunks by the prefix `/js/drop-`, which now also matches `drop-scene`; they match each group's file exactly, and the orbit check also requires `drop-scene` once.

Suites: unit 269/269; race, drop, orbit, mine, arcade, lab, skee and invaders pass; the hub's Canvas 2D tour and the factory's Canvas check pass. Factory 339/342, all three the factory greeter tour, failing exactly as it did before this change; hub 544/550, five of them failing before this change (gorilla rage throw, hub matrix, hub mirror, timechain crossing, carry orbit) and one first failure, birds-eye combat. Those six are now STOP or first-failure entries in the ledger for the maintainer; none is in code this change touches. The timechain crossing session was already STOP before this run and ran again only because it is part of `npm test -- hub`. Raw rows: `untracked/performance/evidence/performance-loading-4-2-evidence.json`.
