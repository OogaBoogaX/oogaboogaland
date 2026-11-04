# Ooga Booga Land's live systems, for the Cloud Archive TV

An inventory of the official repository's public live feeds, statistics, tools and repository activity, taken against
official `rock` at `a1100ee`. The branch now includes a normal merge of `a1100ee`, including `players.js` and
`zone-map.js`. Each entry gives the interface the TV reads, whether the page already exposes it,
and what the TV does with it. The TV reads only what these systems already hold. It adds no polling, no socket and
no fetch of its own, and none from `update()`.

The one exception is that the arcade's records are watched (`highscores.watch`) the first time a records channel is
shown, and stay watched until the visit ends. That is the module's own scene-visit contract, and on a page with no
island server it sends nothing. Where the island server keeps records, watching does make requests, through
`highscores.js` rather than the TV:

- **First showing:** a records channel loads each game it watches. The Arcade's cabinet games come in one shared
  snapshot where the server offers it (`net.state.highscoreSnapshots`). Rally and each Cloud Hopper board load one
  at a time; Cloud Hopper is five boards, its four levels and the retired one.
- **Signed-out visitors:** every watched game is read again about every 30 s while it stays watched (`scheduleGuest`,
  rock's #437).
- **Signed-in visitors:** updates arrive on the room socket the page already holds.

So a signed-out archive visit with the island server present makes repeated record requests once a records channel
has been shown. It does not make zero additional requests.

Freshness is judged from each feed's own record of success, never from its being enabled:

| Feed | Success record | Rule |
|---|---|---|
| Oogatron | `lastAt` | 60 s cadence |
| Totems | successful `polls` observed after the initial baseline (no success timestamp) | Existing readings are HELD until a later success; 90 s step, STALE after 3 steps or an error. Failures never refresh the age clock. |
| Lightning Jet | one read | LIVE for its 30 min cache |
| Chain | per-field `*At` times | its 60 s cadence |

The words mean:

| Word | Meaning |
|---|---|
| LIVE | a good read within its cadence |
| STALE | an older read, or the newest attempt failed |
| WAITING | the feed is on but has not answered |
| HELD | a bake, a cache, or another scene's reading |
| DEMO | simulated |
| OFF | nothing here can supply it |

## Included: exposed by the page (started by the director for the page's life)

| System | Interface | Channels | Freshness shown |
|---|---|---|---|
| Chain (mempool.space, Esplora fallback; Coinbase price) | `chain.snapshot` (`at`, `heightAt`, `feesAt`, `backlogAt`, `priceAt`, `socketAt`, fields) | Chain and mining · Fees · Latest block | live within 3× its cadence, then stale; waiting before the first reading |
| Mempool socket | `mempool.state`, `mempool.subscribe` (`block` events) | Mempool (a block cuts to it when rotation is free) | the socket's state; the backlog's own age |
| Mempool island weather | `weather.STEPS` and `ARRIVALS_FRESH_MS` over `chain.snapshot.gale` / `soak` | Mempool island weather | live while arrivals are fresh |
| GitHub org stats (`/v2/stats`) | `oogatronLive` (the hanging board's subscription), a paused `jumbotron.createReader` | Oogatron pages (recent, totals, five leaderboards) · Repositories | live when the poller runs, else held (the build's bake) |
| Contributor activity | `contributors.activeRoster`, `stateFor` | Who's working | live with the poller, else held |
| Totems' repositories | `totemFeed.state` (latest merge, URL) | Bitcoin projects · latest merges (links to the PRs) | waiting until its first poll |
| The banana pile | `world.level` | Bananas and tips | always (the page's own state) |

## Included where the island's server runs (Cloudflare Worker), unavailable elsewhere

| System | Interface | Channel | Off when |
|---|---|---|---|
| Donations | `donations.state` (`tally`, `board`, `recent`: handles and amounts only, never messages) | Bananas and tips | not connected (static host, `npm run serve`) |
| Players online | `net.state`, `net.remotes` (zone only; never names, positions or voice) | Players online (counts by land; `zoneMap.landOf` where the page has it, which is official `rock` after `a1100ee`) | no backend, or the room not live |
| Arcade records | `highscores.get` and `watch`, by `highscoreRules` score type | Cabinet records (one a cabinet) · Ooga Rally records (one a track and mode) · Cloud Hopper players (one a player, keyed by login: each level's own board from `cloudHopperLevels`, and the retired pre-level board, which still reads but never updates) | `net.state.highscores` not true |

## Included when another scene has loaded it (never loaded by the TV)

| System | Interface | Channel | Off until |
|---|---|---|---|
| Timechain Sphere readings | `timechainBlocks.cache.sets.pools24h` (deferred `timechain`) | Mining pools · 24 h (shown as held, with its age) | the Sphere has been visited this page |
| Lightning Jet repository | `jetFeed.reading()` (deferred `hangar-scene`; fetch, cache or bake) | Lightning Jet | the Hangar's modules have loaded |
| Lightning Factory node | `world.factoryNode.feed.reading` | Lightning Factory · demo node | the island has built the Factory window. It is a seeded demo node and the channel says DEMO: Foundry's public feed is not connected anywhere in the page |
| The island's places | `world.archiveViews` (drawn by the hub on the climb, `hubGuide.STOPS`) | Island cam (11 places) | the beanstalk is climbed (a direct load has none) |

## Not included

| System | Why |
|---|---|
| `voice.js` | private by nature: voice content and who is speaking are never shown |
| `donation-rate.js` (2140data rate socket) | opening it would be a new socket for a price the chain feed already carries |
| `poker-live.js` | per-table play over the poker service, only inside the poker room; no public summary |
| `dsb-data.js`, `dsb-tv.js` | DSB Land's station and minute history, loaded only in DSB scenes |
| `hub-guide.js` (`/api/tess`) | a visitor's question to Tess, not a feed |
| `players.js` | its tab is the signed-in visitor's own UI; the TV takes counts from `net` instead |
| Studio, account and session data | private account details |
| Live archive growth (new commits on the shelves) | still Phase 5; the shelves are the committed snapshot at `37d9f39` |
