# Ooga Chat app

Ooga Chat is a standalone, mobile-first page for `ooga.chat` (#650): authenticated listeners hear the outdoor
conversation in Ooga Booga Land, and verified GitHub contributors can speak from a cloud. It lives in this repository
as its own entry, build and output, and shares the island's native look and components without loading the island.

This document covers the foundation (#651): the entry, the build, the shell, the configuration contract and the
fixture entry; sign-in (#652): the session contract, the sign-in return and the account lifecycle; and the space
(#653): the zones, the audience contract, the roster's order and the footer's controls; and the installable app
(#657): the manifest, the service worker's cache contract, offline and update behaviour, and the release runbook. The roster and controls (#653), voice (#654), reactions (#655), the shared panels and
Feed the Oogas (#656) and the installable app (#657) build on it. Nothing here deploys anything: Cloudflare resources,
the domain, bindings and secrets belong to #662 and its owner.

## Commands

| Command | What it does |
|---|---|
| `npm run build:ooga-chat` | stages the app into `untracked/ooga-chat` |
| `npm run build:ooga-chat -- <dir>` | stages it into `<dir>` |
| `npm run build:ooga-chat -- --fixtures` | also stages `fixture.html` and its own script, for review |
| `npm run build:ooga-chat -- --fixtures --serve` | stages, then serves the folder on `http://127.0.0.1:8090/` (`PORT` to change) with its `_headers` applied, unknown paths answered by `404.html` with a 404, and no backend |
| `node test/run.mjs ooga-chat-app` | the page itself in the suite's Chrome (#656), outside the unit tier: its fixture entry built into a temporary folder and served from loopback; every tab inside its frame at 320, 390 and 1024 pixels with one frame height and no wider page, the tabs offered signed out, to an X listener and to a contributor, every registered Ooga reachable with its sort and details, an unreadable list saying so, thirty tab switches leaving no duplicate id, interval, growing DOM or WebGL context, and Feed the Oogas on the demo walked by the visitor's own keys (68 sats refused and 69 taken, the name on its own screen, paid, the focus back on its button, the tip counted in the Bananas panel, the name kept for the next tip, a message carried only at 1,000 sats), its amount, quote, details and invoice screens inside the screen at each width; and on `real-payment`, with the suite's server standing in for the relay (unreachable, refusing, or answering with an invoice), the real kiosk asking the API each time and never simulating, marking paid or counting a payment, and with the service unreachable no Feed at all. Each tab and screen at each width is saved to `untracked/ooga-chat-app` for review |

From source, with no build: open `src/ooga-chat/index.html` from disk (no backend there, so it shows its unavailable
mode) or `src/ooga-chat/fixture.html?state=contributor`. The island's own build (`npm run build`, `npm run build:site`)
is unchanged and never stages the app.

## Files

| Path | What it is |
|---|---|
| `src/ooga-chat/index.html` | the production entry: its policy, the title, the frame, and the script list |
| `src/ooga-chat/fixture.html` | the review entry: the same files plus `ooga-chat-fixtures.js`, its root marked `data-adapter="fixture"` |
| `src/ooga-chat/ooga-chat.css` | the app's layout; the look comes from `src/native.css` |
| `src/ooga-chat/ooga-chat-config.js` | `BL.oogaChatConfig`: the bootstrap and session contracts and their parsers, the sign-in return, zones, storage keys and their sweep, the build identity |
| `src/ooga-chat/ooga-chat-auth.js` | `BL.oogaChatAuth`: the account lifecycle (`create`) and what an account may do (`gates`) |
| `src/ooga-chat/ooga-chat-roster.js` | `BL.oogaChatRoster`: one zone's audience from snapshots and deltas, and the space's order |
| `src/ooga-chat/ooga-chat-device.js` | `BL.oogaChatDevice`: the network, install help, a waiting update, the worker's registration and the M key |
| `src/ooga-chat/service-worker.js` | the service worker, staged as `/sw.js` with its build and file list filled in |
| `src/ooga-chat/ooga-chat-shell.js` | `BL.oogaChatShell`: the tabs and the views they keep |
| `src/ooga-chat/ooga-chat-chunks.js` | `BL.oogaChatChunks`: the deferred chunks (Load order, below): `load(group)`, `ready(group, fn)`, `prefetch()` once the first view has painted, and `stale` once a chunk was found gone after a deploy |
| `src/ooga-chat/ooga-chat-views.js` | `BL.oogaChatViews`: the Ooga Chat tab (sign-in, or the island's Ooga Chat panel: the zones, the roster and its footer), the stand-in for a tab whose chunk is on its way (`deferred`), the stand-in for a panel not built yet, and the kit the chunks' views build with. Every view is the island's own panel in its markup (#656) |
| `src/ooga-chat/ooga-chat-bananas.js` | in the `bananas` chunk: the Bananas tab's view |
| `src/ooga-chat/ooga-chat-panels.js` | in the `panels` chunk: Contributing Oogas, Online Oogas and The Commons, with the island's account row at their foot |
| `src/js/chat-hosts.js`, `src/chat-hosts.css`, `src/ooga-chat/ooga-chat-hosts.js` | the `hosts` chunk, with its own stylesheet: hosted chats ([ooga-chat-hosts.md](ooga-chat-hosts.md)) where the bootstrap lists `features.chats`. The views and their look are shared with the island's cloud tab (`chat-hosts.js`, `chat-hosts.css`): the Chats list, the Start a chat dialog, and in a chat its bar, Requests chip and queue, invite card, tile menu, the footer's Request to speak, End chat and Leave, and one polite notice line. `ooga-chat-hosts.js` hands them the app's chats, voice and face sheet and links the stylesheet |
| `src/ooga-chat/ooga-chat-http.js` | `BL.oogaChatHttp`: the production adapter |
| `src/ooga-chat/ooga-chat-media.js` | `BL.oogaChatMedia`: voice (#654), one controller apart from the views: hearing the zone through the server's media operations and speaking from it (Voice, below) |
| `src/ooga-chat/ooga-chat-faces.js` | `BL.oogaChatFaces`: the bundled fallback index for `art/ooga-faces.png`, by handle, with a default face. Generated with the sheet by `npm run ooga-chat:faces` (`scripts/ooga-chat-faces.mjs`, the island's own renderer in the suite's Chrome), never edited |
| `src/ooga-chat/ooga-chat-portraits.js` | `BL.oogaChatPortraits`: lazy face crops from the bundled fallback or a validated catalog's same-origin immutable atlas. The index and image change together after the image loads; failed reads retry at a bounded cadence while the last complete pair remains usable. Visible signed-in Listen views refresh even when their speaker crops are cached; Contributing Oogas also refreshes through its public-data reads |
| `src/ooga-chat/ooga-chat-commons.js` | `BL.oogaChatCommons`: what the island's Room tells a community member (#670), checked and kept for The Commons and Online Oogas: who you are, whether lines may be sent, everyone online without a position, and the last 100 lines |
| `src/ooga-chat/ooga-chat-donor.js` | `BL.oogaChatDonor`: who Feed the Oogas says a tip is from (the name and message last given, and the names this browser's own paid tips used), the `game` the shared donation popup reads, in this app's own storage. Reopening Feed starts from the name last given, never the login or "anon" over it; a GitHub account's login is the starting name only until one is given |
| `src/ooga-chat/ooga-chat-fixtures.js` | `BL.oogaChatFixtures`: the offline adapter, review only. Its Bananas demo takes the simulated kiosk's payments (`demo.receive`, heard through `demo.subscribe`), counted as the kiosk quoted them, so a receipt shows |
| `src/ooga-chat/ooga-chat-app.js` | startup, loaded last |
| `src/ooga-chat/art/` | pictures the views show, staged under their hash |
| `scripts/ooga-chat.mjs` | the build, the guards and `--serve` |

Shared with the island, one copy each:

| Path | What it is |
|---|---|
| `src/native.css` | the tokens, cave-sign lettering, panel title, status chip, stone slab and amber primary button, and the Bananas panel's styles. The island links it before `style.css`; `scripts/build.mjs` joins both into its one style block |
| `src/style.css` (in part) | the island's own rules for its Ooga Chat panel and its circles, Contributing Oogas, Online Oogas, The Commons, the account row, the footer buttons and the help and link lines, taken by selector when the app builds (`ISLAND_RULES` in `scripts/ooga-chat.mjs`) and joined after `native.css`, so the panels look the same from one source |
| `src/js/sign-glyphs.js` | `BL.signGlyphs`: the cave-sign alphabet (`SIGN_GLYPHS`, which `hub-models.js` re-exports) and its DOM lettering (`lettering`, `letter`), which `hud.js` uses |
| `src/js/donations.js` | `BL.donations`: the donation event contract and real mode's socket and calls over the page's own `/donations/*`. The app turns its simulator off, calls `useOrigin` and subscribes once the bootstrap says `feed` is live (#656) and the Bananas chunk is here |
| `src/js/banana-panel.js` | `BL.bananaPanel`: the Bananas panel's markup (`build`, ids only on the island's copy) and controller (`create`, filled from `donations.js`), which `hud.js` and the app's Bananas tab both run |
| `src/js/audience-tiles.js` | The Ooga Chat roster's circles (`BL.audienceTiles`), the island's Ooga Chat panel's and this tab's alike: everyone in the zone as many to a row as fit at 76 px or more a column (six in a 600 px panel), scrolling in its slab, each tile kept by id and only its changed fields written |
| `src/js/format-large.js`, `src/js/roster-panel.js`, `src/js/contributor-identities.js`, `src/js/activity-repos.js` | Contributing Oogas (#656): the island's own panel over `/api/chat/public/contributors` (#664), its contribution states and ages, Oogatron's reading normalized as the island normalizes it, and lazy faces supplied by `ooga-chat-portraits.js`: a revision-matched catalog atlas or bundled `art/ooga-faces.png` fallback, outside the first-load budget. Open stats strips repaint when the atlas changes. A contributor in The Commons sees whose Ooga is on the island now; a stale or unreadable reading says so under the list |
| `src/js/emoji-data.js`, `src/js/reaction-bar.js` | The island's own emoji panel (#655), in the Ooga Chat panel's footer: the ten reactions, the raised hand and the picker over every emoji, its skin tones and heart colours, from this browser's own choices (`ooga-reactions*`). `ooga-chat-app.js` hands it the audience socket as its connection: a tap is a `reaction` request, the hand a `hand` request an active speaker alone may make, and every reaction the server sends the zone pops over that participant's circle |
| `src/js/voice-handoff.js` | The voice switch prompt's card, the island's and Ooga Chat's alike (Voice on another device, below): Switch here inside its click, Not now, and no focus taken by itself |
| `src/js/chat-policy.js`, `src/js/reaction-policy.js`, `src/js/zone-map.js`, `src/js/commons-log.js` | The Commons and Online Oogas for an eligible contributor (#670): the island's chat rules, the raised hand in each tone, the zones as the island's Online Oogas groups them, and the conversation's log and composer, run over the app's own `/api/chat/commons` socket (`ooga-chat-http.js` `commons`), with the island's name field at the Commons' top, saved as the island's display name (`commonsName`, `POST /api/chat/commons/name`). Their look is placed by `ooga-chat.css`; no distance or crosshair, which are the island's alone. Online Oogas shows no voice links (a chat's voice is the only voice here, and no link reaches it) and, while the public conversation runs, Main Island's Ooga Chat listeners after its players in gray |
| `src/js/qr.js`, `src/js/banana-icon.js`, `src/js/jumbotron-font.js`, `src/js/factory-kiosk-core.js`, `src/js/factory-kiosk.js`, `src/js/donation-popup.js` | Feed the Oogas: the island's donation dialog and its kiosk screen, with the QR codes, the banana and the 5x7 letters they draw. The app opens it from its Bananas tab while the feed is live (the fixture entry's demo aside), real over its own `/donations` relay, with `ooga-chat-donor.js` as its `game`; its frame is placed by `ooga-chat.css` |
| `src/js/native-icons.js` | `BL.nativeIcons`: the panel tabs' pixel icons (`bananas`, `roster`, `players`, `chat`), Ooga Chat's mark `cloud` (the tab icon on both, and the app's favicons and icons), DSB Land's destination mark `dsb` (the island's `dsb-island-icon` paths, held equal by the suite) and `voice()`, the roster's voice mark. `hud.js` fills the island's tab slots (`data-native-icon`) from it and draws its roster's voice mark with it |

A module the app may load is either `src/ooga-chat/ooga-chat-*.js` or named in `SHARED` in `scripts/ooga-chat.mjs`;
the build fails on anything else, so a renderer, scene, socket or game cannot reach the app by accident. A shared
module reads nothing at load but `window.BL` and the document.

## Load order and contracts

`sign-glyphs.js`, `native-icons.js`, `donations.js`, `banana-panel.js`, `qr.js`, `banana-icon.js`, `jumbotron-font.js`, `factory-kiosk-core.js`,
`factory-kiosk.js`, `donation-popup.js`, `chat-policy.js`, `emoji-data.js`, `reaction-policy.js`, `zone-map.js`, `commons-log.js`, `format-large.js`, `roster-panel.js`,
`contributor-identities.js`, `activity-repos.js`, `audience-tiles.js`, `reaction-bar.js`, `voice-handoff.js`, `duel-listening.js`, `ooga-chat-config.js`, `ooga-chat-auth.js`, `ooga-chat-roster.js`, `ooga-chat-device.js`,
`ooga-chat-shell.js`, `ooga-chat-chunks.js`, `ooga-chat-views.js`,
`ooga-chat-http.js`, `ooga-chat-media.js`, `ooga-chat-donor.js`, `ooga-chat-commons.js`, `ooga-chat-faces.js`, `ooga-chat-portraits.js`, `ooga-chat-bananas.js`, `ooga-chat-panels.js`, then (fixture entry only) `ooga-chat-fixtures.js`, then `ooga-chat-app.js`. The build checks that
`fixture.html` loads exactly `index.html`'s files plus the fixtures, just before the app, each in the same group.

**Chunks.** A script tagged `data-defer="bananas"`, `data-defer="panels"`, `data-defer="emoji"` or `data-defer="hosts"` in both entries
leaves the first load in a staged build. `bananas` is `donations.js`, `banana-panel.js`, Feed the Oogas (`qr.js` through `donation-popup.js`),
`ooga-chat-donor.js` and `ooga-chat-bananas.js`; `panels` is `zone-map.js`, `commons-log.js`, `format-large.js`,
`roster-panel.js`, `contributor-identities.js`, `activity-repos.js` and `ooga-chat-panels.js`; `emoji` is
`chat-hosts.js` and `ooga-chat-hosts.js` are `hosts`, hosted chats, asked for once a signed-in account's service offers them; a stylesheet
tagged the same way (`../chat-hosts.css`) is staged as that group's own `css/ooga-chat-<group>-<hash>.css`, named in
`BL.oogaChatScripts` as `<group>.css`, and linked by the group's code as it runs. `emoji` is
`emoji-data.js` and `reaction-bar.js`, the emoji bar and its picker over the whole list, which only a signed-in visitor
sees, so the app asks for it as soon as an account is signed in (until then a view's bar waits, its slot hidden, and a
reaction heard is let go; `reaction-policy.js` stays and reads the list only when first asked). Each runs after the whole
first load, so it may read any of it at load; nothing in the first load may read a chunk's modules at load (the app
waits with `BL.oogaChatChunks.ready`, and a tab's view is `deferred` until its chunk is here). The Commons' model
(`ooga-chat-commons.js`, with `chat-policy.js`) stays in the first load, since its socket is the app's. From source the
tags change nothing: every module is on the page in order and `load` answers at once.

**Adapter.** `{ kind, bootstrap(), session(boot), signIn(boot, provider), signOut(boot), audience(boot, handlers), commons(boot, handlers), media(boot), contributors(), dispose() }`. `bootstrap`
resolves to a parsed bootstrap (below), never throws. `session` resolves to a parsed session or `null` for signed
out, and throws for any other failure, which the app shows as a recoverable error. `signIn` navigates (production)
or returns a session (fixtures). `signOut` resolves only when the server confirms and throws otherwise. `dispose`
aborts what is still in flight. `audience` opens the audience feed (below) and returns `{ zone(id), resync(), request(type, fields), dispose() }`, `request` sending one with an id the server answers with a `result` (a `reaction` or the `hand`, #668), 0 while the socket is not open. `media` returns voice's broker, `{ call(op, body) }`: one `POST /api/chat/media/<op>` resolving to the server's JSON and throwing `{ code, retryable }` on a refusal (the fixture's answers from its own state, with its fake WebRTC as `rtc`). `contributors` resolves to the
edge's public `/api/chat/public/contributors` reply (the cast and Oogatron's reading, each with its state), or `null` when it
cannot be read, which Contributing Oogas says under its list.

**Shell.** `create({ root, tabs, ctx, selected, onSelect })` returns `{ update(state), select(id), dispose() }`. A
tab is `{ id, label, icon, visible(state), view }`. A view is `view(ctx)` returning `{ node, update(state), dispose() }`:
built the first time its tab is chosen, then kept. Switching tabs hides it, and `update` passes it the new state, so
a view's own nodes and listeners (a sort, a draft, a voice control) survive both. `dispose` is the only teardown.

**State.** `{ mode, boot, session, auth, notice, busy, zone, voice, audience }`, `mode` being `loading`, `live`,
`unavailable` or `stale`, and `auth`, `notice` and `busy` the account's (below). `zone` is the outdoor zone, `main` or
`dsb`, saved. `voice` is the voice controller's `{ role, muted, phase, busy, notice, blocked, hearing }` (Voice, below). `audience` is `{ status, zone, list, version }`: the feed's
status (`off`, `connecting`, `joining`, `live`, `reconnecting`, `full`, `closed`, `unavailable`, `stale`) and the list
in the space's order.
Public tabs: Ooga Chat, Bananas, Contributing Oogas. Online Oogas and The Commons show only while `gates` says
`contributor`. Choosing a tab never signs in, signs out, changes the zone or touches voice. Every tab is the island's own
panel, under its own carved title (the page's `h1` is for assistive technology only), and every tab is one height, as
the island's drawer is: the frame takes the page's height (up to 900px), the panel the frame's, and the panel's slab
whatever its fixed parts leave, scrolling its own overflow. The account controls sit where the island keeps them: the
Ooga Chat panel's footer while signed in, and the island's account row at the foot of Contributing Oogas, Online Oogas
and The Commons (while signed out, the sign-in screen's own Continue with GitHub). Bananas has none. With hosted chats
on and no chat joined, those three tabs' emoji bars stand down (`outOfChat`, `data-chat="none"`): a reaction belongs to
a chat.

## The bootstrap contract (v1)

The page asks `GET /api/bootstrap` on its own origin, with credentials, no cache and an 8 s limit. The backend owns
this address (#662, #663); the path is a proposal for the owner to confirm.

```json
{
  "version": 1,
  "build": "e310d64685e87b14",
  "protocols": { "identity": [1], "audience": [1], "media": [1] },
  "features": { "github": true, "x": true, "voice": false, "feed": false },
  "paths": {
    "session": "/api/session",
    "logout": "/api/logout",
    "login": { "github": "/auth/github", "x": "/auth/x" }
  }
}
```

- `version` must be 1. Another integer is `stale`: the page offers Reload. Anything else is `unavailable`.
- `protocols` lists the revisions the server accepts. Each of the page's (`PROTOCOLS` in `ooga-chat-config.js`) must
  be listed, or the page is `stale` and starts nothing.
- `features` turns things on. A provider is on only with its login path. `feed` must be `true` to be live; the
  fixture adapter alone may answer `"demo"`, which production rejects, so an outage never becomes a simulated payment.
- `paths` are same-origin absolute paths (no `//host`, no scheme, no `..`). The page never holds a secret, token or
  SFU credential; OAuth runs entirely on the server, reached by a top-level navigation to the login path.
- `island`, only with `features.chats`: the island's https origin (the edge's `ISLAND_ORIGIN`, nothing else in it),
  which a Main Island chat's Go there opens ([ooga-chat-hosts.md](ooga-chat-hosts.md), The island view). The one
  address the page names off its own origin; anything not a bare https origin is dropped and Go there stays off.
- `build`, if it names a deployment other than the page's own (`<meta name="ooga-chat-build">`), adds "A newer Ooga
  Chat is out" with Reload.

A 404, a page that is not JSON, a timeout or no network makes the app `unavailable`: the sign-in buttons stay
disabled and the page says the service can't be reached. It never assembles a room from sample people.

## Sign-in and the session (identity protocol 1)

Sign-in is the server's (#663): providers, PKCE, the callback, the token exchange, cookies and the contributor policy.
The page never sees an OAuth code, verifier, provider token or session token, and stores none of them anywhere.

**Signing in.** A provider button is a top-level navigation to `paths.login[provider]`, offered only when the
bootstrap turns that provider on (X can be off while GitHub stays on: the button says X sign-in is unavailable).
The server's callback ends by sending the browser back to the app's own page with a result and nothing else:

```
/?signin=ok&provider=github
/?signin=denied&provider=x        denied | failed | unavailable | rate-limited
```

The app reads it once (`parseReturn`), takes it out of the address with `history.replaceState` before anything
else runs, opens the Ooga Chat tab, and checks the session. Any other `signin` value reads as `failed`; an unknown
provider as none. A failed or cancelled return says so with Try again, which signs in with the same provider.

**Session** (`paths.session`, proposed `/api/chat/me`): 401 is signed out; otherwise

```json
{ "identity": { "principal": "pr_7f3a…", "participant": "gh:583231", "provider": "github", "providerUserId": "583231",
                "login": "someone", "display": "Someone", "avatar": "/avatars/pr_7f3a.png" },
  "capabilities": { "speak": true, "contributor": true },
  "eligibility": { "state": "eligible", "checkedAt": 1763000000000, "staleAfter": 900 },
  "expiresAt": 1763086400000 }
```

- `principal` is the server's opaque, stable identity (up to 128 of `[A-Za-z0-9_:.-]`), required. Equality,
  deduplication and anything kept per person key on it, never on `login`, which a rename changes. Signing out and in
  with the other provider is a different principal: there is no GitHub to X linking.
- `participant` is how the audience lists the account, `gh:<github id>` or `x:<x id>` for its own provider; the
  visitor's own row is the one with that id. Anything else is dropped, and the visitor is then not marked.
- `providerUserId` is optional, a string (an X id does not fit a safe integer), never compared as a number.
- `login` is the handle (`[\w.-]{1,39}`), `display` the shown name (cleaned of control and direction characters,
  50 at most, the login when empty), `avatar` a same-origin path or nothing (below).
- `eligibility.state` is `eligible`, `ineligible`, `unknown` (contributions could not be checked) or `revoked`;
  missing means `unknown`, and an X account is always `ineligible`. `checkedAt` (ms) and `staleAfter` (s, bounded to
  3600) are the server's stale policy: past it an `eligible` answer counts as `unknown` until checked again. The page
  invents no grace period of its own.
- `capabilities.speak` and `capabilities.contributor` count only for a GitHub account whose state is `eligible`.
  Neither a paid donation, a matching X handle nor anything the page saved can set them.
- `expiresAt` (ms) is when the session ends; a session already past it is signed out.

Speaking itself is not in the session: a speaker is someone holding an acknowledged media lease (#654, #665), and the
server checks the capability again at every privileged operation.

**Account lifecycle** (`BL.oogaChatAuth.create({ adapter, media, now, timers, onChange })`). `auth` is:

| `auth` | When | Join Voice | Contributor tabs |
|---|---|---|---|
| `checking` | before the first answer | no | no |
| `signed-out` | no session | (Continue with GitHub) | no |
| `listener` | X, or GitHub `ineligible` or `revoked` | off, saying why | no |
| `unknown` | GitHub, eligibility unknown or stale | off, saying why | no |
| `eligible` | GitHub, server says eligible | on when voice is ready | when `contributor` |
| `signing-out` | sign-out sent | (Sign out says Signing out) | no |
| `error` | the session could not be checked | off, saying why | as last answered |

Every sign-in lands as a listener, microphone closed: no choice panel, no automatic capture. The session is checked
before any control shows, then again at its nearest deadline (expiry, or the end of an eligible answer's stale
window: one timer, clamped to 5 s – 1 h), when the page becomes visible or the network returns (at most every 30 s),
and when the browser restores the page from its cache. A lost session reads "Your sign-in expired"; a failed check
reads "can't check your sign-in" with Try again, so an expired login and an outage never look alike. Public tabs keep
working through both.

**The voice seam** is the voice controller (`ooga-chat-media.js`, Voice below). `available` is whether this deployment
lets contributors speak (the bootstrap's `speak` and an audience path) in a browser that can; without it Join Voice
stays off ("Voice opens here soon", or that the browser can't). The account controller calls `release` first whenever
the account stops being the one that may speak: sign-out (before the logout request), another principal, an expired
session, a capability lost or gone stale, a failed check. Join Voice asks `gates` again at the click.

**Signing out** stops capture, clears the session from the page and returns to Ooga Chat's sign-in at once, then posts
`paths.logout`. If the server does not confirm, the page stays signed out and says so with Try again; the server ends
the session when it expires. Until then no check takes a session back: one that still finds it keeps the page signed
out and offers Sign out again, and one that finds none is the confirmation and clears the notice.

**Storage.** Only `tab` and `zone` are kept (`ooga-chat.v1.<name>`). At start `sweep` removes any other key under the
app's prefix and any older unversioned `ooga-chat.` key, so no saved screen, role or speaker flag survives. Session
storage holds one thing, for the tab alone and at most a minute: a speaker's word to the page that replaces it (Voice,
Staying a speaker).

**Faces.** A face is the account's `avatar`, loaded once at a fixed 56px circle, or the island's own Ooga face
(`nativeIcons` `roster`) when there is none or it fails: never a broken image, a generated pattern or another
person's picture, and never retried. A rename changes the words, not the face. Full names stay in the title and the
accessible name when the line is cut short.

## The space (#653)

**Zones.** Main Island alone for now, named by a tag in the corner of the panel's title, as the island's other panels
tag theirs; the space has no zone buttons, and every visit starts there whatever an earlier one chose. The server's
zone policy decides who is in a zone (the outdoor boundaries are #658's and the backend's). The protocol, the
controller and the server still carry both zones (`actions.zone`, `media.zone`): another zone hands the voice lease to
the seam, empties the list and shows "Joining…" until that zone's snapshot arrives.

**The audience feed (audience protocol 1).** `paths.audience` in the bootstrap (optional: without it the space says
live audio isn't open yet and shows no one). One same-origin WebSocket; the page sends
`{ "type": "join", "zone": "main", "protocol": 1 }` (again on every zone change) and `{ "type": "resync", "zone" }`
after a gap. The server sends:

```json
{ "type": "snapshot", "zone": "main", "epoch": 7, "revision": 120, "participants": [ … ] }
{ "type": "delta", "zone": "main", "epoch": 7, "revision": 121, "upsert": [ … ], "remove": [ { "id": "…", "generation": 3 } ] }
```

A participant is `{ id, generation, source, role, login, display, face, contributions, muted }`: `id` the provider
id, `gh:<id>` or `x:<id>`, one row a person (the visitor is the participant whose `id` is their session's
`participant`, never its `principal`),
`generation` the source generation (an integer that rises when the same person comes back from a new source),
`source` `world` (speaking from the island) or `app` (Ooga Chat), `role` `speaker` or `listener`, `face` a same-origin
path (a world speaker's native Ooga portrait, an app participant's profile picture) or nothing, `contributions` a world
speaker's total or nothing (unknown, not zero), `muted` a speaker's source mute. A snapshot replaces the list; a
delta must carry the next revision of the same epoch. An older epoch or revision is dropped; a later revision, a newer
epoch or a delta that does not parse whole is a gap, applied not at all, and the page asks for a snapshot. A removal
applies only to the generation it names or older. Close codes: 4401 the session ended (the page checks it again and
marks the list reconnecting), 4426 another protocol revision (stale), 4429 the zone is full (the page waits 30 s),
4503 listening is off (`closed`; the page waits about 3 minutes). Otherwise, 1013 (try again) included, it
reconnects, backing off from 1 s to 30 s, and shows the list as reconnecting, never as live. The edge refuses by
opening a socket and closing it at once, so only a frame from the zone resets the backoff, never the socket's opening.

**Order.** One continuous four-column list of circles, the island's Ooga Chat panel's (`audience-tiles.js`, which
`cloud-panel.js` draws with too), speakers first, with no headings, gap or pages between roles: the whole list scrolls
in its slab. World speakers by contribution total, most first, a missing total after every known one (zero included),
ties alphabetical by login, case-insensitive, then by id; then app speakers, the visitor first among them and the rest
alphabetical; then listeners, the visitor first and the rest alphabetical. The visitor never moves ahead of a world
speaker. Totals sort; they grant nothing.

**Tiles.** A circle portrait (the server's same-origin picture, the island's Ooga face when there is none or it fails,
asked for once and only as it scrolls near), a speaker's 3px source ring outside a 3px dark gap (green `#22c55e` from
the island, purple `#b18aff` from Ooga Chat; listeners neutral), the hand over the portrait's centre (#655), the name without `@` on one
line cut short with its whole self in the title and the accessible name (the ring alone says where a speaker speaks
from), and under it a speaker's voice mark (crossed and red when source-muted) with Speaker, or Listener. The visitor's own voice
mark mutes or unmutes them while they speak here; anyone else's mutes that voice for this visitor alone. The same
buttons, tooltips, local mute marks and speaking indicators appear in Online Oogas and Contributing Oogas. A microphone
held on another device stays under that device's control. Local mutes keep measuring the voice, as on the island, and
apply before a replacement track plays. They survive reconnects and reloads in this browser, keyed by listener and
speaker provider ids (at most 512 choices per listener), with separate fixture storage; signing out clears the active
choices. Nothing is sent to the server. Tiles are keyed by `id` and kept: an update changes and moves only what changed, once a frame, and focus
stays on its tile. The list has one tab stop; arrow keys, Home and End move through every participant, up and down a
row of the grid. Smaller circles in a panel under 400px wide (the island's drawer, a phone). A status line under the
zones says when the list is not simply live, or is empty.

**Per-player volume.** Click another speaker's name in the Ooga Chat grid to open their Volume control below it,
or another player's name in Online Oogas to expand the same slider under their row. The default is 100%, with 5%
steps from 0% to 200% where Web Audio is available, otherwise 100% maximum, as on the island. Volume and mute are
independent and saved together per listener and participant id; earlier mute-only saves remain valid. The receiver
uses the island's gain smoothing and boosted-peak limiter, with only one playback path per voice. Meters run before
the gain, so a quieted or muted speaker still shows as speaking. Replacement tracks start at the saved level;
disconnecting releases their source, gain and limiter. The fixture's synthetic tracks use the element path.

**Duel listening.** In both apps, Online Oogas → Advanced settings has **Automatically mute duelists**, unchecked
by default and remembered for the signed-in account in that browser. It temporarily silences both players in every
active duel except the listener's own pair; other duels still mute while the listener is dueling. Manual mute and
volume remain independent, so ending a duel or disabling this choice restores those choices. `duel-listening.js`
keeps the bounded active pairs for both voice controllers. OBL reads its existing duel feed; OC reads only the pair
ids from the Commons welcome and sanitized start/end frames. Losing that feed clears temporary mutes; reconnecting
replaces the list from the server. This setting never captures audio or sends a mute to anyone else.

**Footer.** The island's emoji panel (`reaction-bar.js`, #655) left of the account controls where there is room and
above them where not, as the design has it: the ten reactions any signed-in account may send while the audience is
live, the hand only an active speaker raises (disabled, never hidden, for a listener), the picker on a long press. Then
the island's Ooga Chat panel's account controls, the name over the buttons: the name (a purple dot
only while speaking from Ooga Chat), the microphone (always first, 84px wide whatever it says: a disabled Unmute for a
listener, explaining voice must be joined first; Mute or Unmute for a speaker), Join Voice for a listener the server
allows to speak (Leave Voice for a speaker), and Sign out. A disabled button says why on itself. The voice controller's state says who is a speaker: only the
server's acknowledged lease makes one. While joining the button reads Joining… and while leaving Leaving…, both off.

**Account row.** The island's (`hud.js` `showAccount`), at the foot of Contributing Oogas, Online Oogas and The
Commons: while signed out (and GitHub sign-in is on), the sign-in screen's own Continue with GitHub, the design's sign-in
button in place of the island's amber Contributor sign-in; else the name, always with a purple dot (the member is
online here, in Ooga Chat), how many are online while The Commons is live (the island's players, everyone in hosted
chats through Ooga Chat, and the member while in no chat and not on the island), Join voice (Mute or Unmute for a
speaker), Leave voice for a speaker, and Sign out. With hosted chats on, voice is a chat's, as in the Ooga Chat tab:
outside a chat, or in one that has not given the member leave to speak, the row has neither Unmute nor Join voice; a
chat's host keeps Mute but never Leave voice, since a host steps down only by handing the chat to a co-host or ending
it ([ooga-chat-hosts.md](ooga-chat-hosts.md)).

## Voice (#654)

`BL.oogaChatMedia.create({ broker, rtc, request, allowed, onChange })` is one controller for the page's life, apart from
any view. It speaks the server's media operations (media protocol 1, `docs/ooga-chat-backend.md`, Media) under the
audience feed's own connection (the snapshot's `connection`), and names nothing else: never a session, track or
anyone's publication. Audio goes publisher to SFU to listener, on the island's own Realtime app: no browser mesh, no
mix, and an island speaker and an Ooga Chat speaker in the same zone hear each other.

**Listening.** A signed-in page whose feed is live listens: `ice`, `receive/open`, a receive-only peer connection, and
`receive/sync`, which pulls every speaker of the zone the server allows (island outdoor speakers and Ooga Chat
speakers, never the visitor) and answers the SFU's offer with `renegotiate`. It syncs on each snapshot and whenever the
server says so over the feed, `{ type: "media", op: "sync", closed? }` (a speaker going live, an island publication
arriving or changing); a `closed` mid is dropped at once, its transceiver stopped. Each voice plays in an `<audio>`
element of its own. A browser that holds playback until a gesture sets `blocked`, the space says "Tap anywhere to
hear this zone.", and the next tap or key plays every voice. A receiver that fails opens again, backing off from 1 s to
30 s six times, then the space says it can't hear the zone with Try again. A listener never asks for a microphone.

**Speaking.** Join Voice, for an account `you.speak` says is `eligible`, asks for the microphone first, inside the
click, and turns its track off before anything can carry it; then asks the feed for a lease (`setRole: speaker`, whose
`result` names the lease's generation, `you.lease`); then `publish/open`, `publish/offer` (one sendonly audio track)
and, once connected, `publish/ready`. Only that acknowledgement makes a speaker, muted. A denied, missing or busy
microphone, a refusal (`speaker_capacity`, `source_in_use`, `capability_required`) or a failed connection returns to
listening with nothing held, the lease given back with `publish/close`, and says why in the space's status line.
Mute and Unmute (the footer, the visitor's own circle, M) flip the track at once and tell the server (`setMic`).
Leave Voice stops and releases the microphone, then `publish/close`, and keeps listening. A `you` that no longer says
`pending` or `active` (an expiry, a revocation, the island's own voice taking the identity) stops capture at once.

**Changes.** Another zone ends speaking (capture stops before the join, which ends the lease at the server) and drops
the old zone's voices before the new zone's snapshot; a sync asked before the change plays nothing. The feed lost for
good (`signed-out` to another account or none, `closed`, `full`) stops capture and receiving until its next snapshot.
`release` ends speaking and keeps listening; signing out or another principal stops both with the feed. Nothing is kept
in storage but a speaker's word to the page that replaces it at once (A refresh, below) and how this browser connects
(Connecting, below).

**Connecting.** Each connection lists the STUN server and, where the server hands credentials out (`ice`), the TLS
relay. A credentials request that failed is asked again by the next connection (an answer with no relay stands a
minute), and every voice call's body is read inside the call's 12 s bound. WebKit on an IPv6-only mobile network
reaches only the first IPv4 address a connection sends to, the STUN server when one is listed
([WebKit 330921](https://bugs.webkit.org/show_bug.cgi?id=330921)), so a connection that never comes up is tried next
without the STUN server, as on the island (Voice in `docs/auth-and-presence.md`): Join Voice makes its publish once
more that way on the same microphone and lease, a receive connection on its next try, and the way that last worked is
kept in localStorage (`voice-bare` under the app's prefix). `media.stats` says which (`bare`) and whether a relay is in
hand (`relay`).

**Staying a speaker.** A loss that was not the visitor's choice never makes a speaker a listener by itself: a phone
that goes to another app, a network change, a microphone another app takes.
- *A dropped socket.* The feed's `reconnecting`, and the new audience connection after it, end what was held under the
  old one at the server. The page keeps its microphone, off (released after two minutes with nothing to publish it on,
  and captured again then), and once the new connection's snapshot says `eligible` it asks for a lease again by itself:
  `setRole` with `replaces`, every connection it may still hold a lease under (the one it came back from, and any a
  join was under way on when its socket dropped, three at most), so its own stale lease does not refuse it. It
  publishes, and how it lands follows what it had: back within 60 s (`RETURN_MS`) of the loss with the microphone open
  before it, the microphone is open again and the server told (`setMic`): "Voice reconnected. Your microphone is on."
  Muted before, or back later than that, it lands muted: "Voice reconnected. You're muted." A try that fails for a
  passing reason (no answer, a busy or unreachable server, a publishing connection that would not come up) is made
  again after 2 s, then 4 s, three tries in a row at most; a refusal says why and listens. The same account's feed
  restarting after a session check (4401) is such a reconnect too, and so is a socket turned away for a moment
  (4429, the feed's `full`): the wish to speak is kept for the connection after it.
- *A refresh.* A new page remembers nothing, so a speaker whose page is hidden or leaves (`visibilitychange`,
  `pagehide`) has the controller leave word in the tab's session storage (`remember`: `ooga-chat.v1.speaker`, the
  participant id, zone, audience connection and time, nothing else), taken back when the same page is shown again, so
  it is there only for a page that replaces this one. That page's first audience connection reads it once and removes
  it. The same account in the same zone, no more than 60 s (`RETURN_MS`) after it was left, speaks again as after a
  dropped socket: it asks for the microphone, `setRole` with `replaces`, and lands as it left, the microphone open
  again if the word says it was open (`open`), muted otherwise, with the same words. A microphone the browser no
  longer allows, or a refusal, listens: "Voice reconnected. Join Voice to speak again."
  Leave Voice, a lease the server ended, signing out, another tab and a later return leave no word and stay listeners.
- *A dead socket.* A socket the page was away from can read open long after it died. When the page is shown again or
  back online (`feed.wake`), or after 75 s of silence, the feed asks for a pong, and with no frame in 4 s closes the
  socket itself and opens another at once.
- *A network change* (another Wi-Fi, Wi-Fi to cellular). The same loss, found sooner. A voice connection that drops
  (`disconnected`) is the first sign, long before the feed's socket is known dead, so the controller asks the feed to
  check its socket at once (`stall`, the feed's `wake(true)`: a pong within 2.5 s or the socket is closed and opened
  again; one still opening on the old network after 4 s is opened afresh). The connection's type changing
  (`navigator.connection`, where the browser has it) asks the same. A dead socket's new connection then speaks again
  by itself, as above. Under a feed that lives, a publishing connection still down after 5 s is published again
  without waiting for the browser to call it failed. A lease asked for over a socket that never answers is that dead
  socket too: the feed is checked, and the first such silence under a connection is not counted as a try. A wait
  after a failed try ends with the connection it failed under.
- *A failed publishing connection.* The lease is given back and asked for again the same way.
- *An unsure answer.* A session check the server itself answers `unknown` (the island could not be asked for a while)
  closes Join Voice and leaves a lease already held, as a stale window or a failed check does.
- *A microphone the browser takes away* (another app, a call: the track's `ended`). The visitor stays a speaker, muted,
  with nothing captured: "Your microphone was interrupted. Unmute to speak again." Unmute, a click, captures it again
  onto the same publication (`replaceTrack`).

Whether a microphone stays open while the page is in the background is the browser's and the system's to decide: where
they keep the page running (a desktop browser, Chrome on Android, a Safari tab on a call) the speaker goes on talking,
since nothing here stops on hiding. Where the system suspends the page (an iOS home screen app, a phone that sleeps)
nothing a web page does keeps it capturing; the visitor comes back as a muted speaker instead of a listener.

**Voice on another device.** An account speaks from one device at a time. `you.elsewhere` says where its voice is
while it is not here: `island` (the island's voice) or `app` (another Ooga Chat page's lease). A page whose first
audience connection finds it asks once (`voice-handoff.js`, the island's own card): "Voice is on another device", with
Switch here and Not now. Switch here, inside its click, joins with `setRole`'s `takeover`: the other page's lease ends
(its `you` carries `reason: "moved"`, and it says "Voice moved to your other device."), or the island's page leaves
voice. Not now changes nothing, and the visitor goes on listening. Join Voice pressed while the voice is elsewhere asks
the same question. A voice that goes elsewhere later, while this page is open, asks nothing.

**Not yet.** A peer's voice mark does not yet mute that voice for this visitor alone; a follow-up. iOS routes playback
differently while the microphone is open.

## The audience contract (v1)

Who speaks and who listens in each outdoor zone. The backend owns it (#665, #668); this is the page side's proposal
for the owner to confirm, and the shape the island's panel (#660, `src/js/audience.js`, `src/js/cloud-panel.js`) reads
today. The app's roster (#653) reads the same messages. Nothing here is live until the room advertises it.

**Gate.** The island's room lists `audience-v1` in `welcome.features` (`net.state.audience`); the app's bootstrap lists
`audience: [1]`. Without it the page sends nothing below and the island shows no cloud tab, so older backends keep the
panels they had. Zones are `main` (Main Island) and `dsb` (DSB Land); which outdoor zone a player stands in is #658's.

**Page to room.** Both only where the gate is open:

```json
{ "t": "audience-view", "v": 1, "zone": "dsb" }
{ "t": "audience-resync", "v": 1, "zone": "dsb", "epoch": 3, "rev": 41 }
```

`audience-view` asks to see and hear a zone: sent once the room is live (the visitor's own outdoor zone at first) and
whenever the visitor picks the other zone. Picking the zone already asked for sends nothing. It asks for a view and a
receive scope only: it never moves the visitor's Ooga or publishes their microphone anywhere. `audience-resync` asks
for a fresh snapshot after a gap.

**Room to page.** One message type, `t: "audience"`, `v: 1`, in three kinds:

```json
{ "t": "audience", "v": 1, "kind": "snapshot", "epoch": 3, "rev": 41, "zone": "main", "part": 0, "parts": 1,
  "you": { "speak": "eligible" }, "rows": [ { "id": "gh:1", "login": "someone", "provider": "github", "role": "listener", "self": true } ] }
{ "t": "audience", "v": 1, "kind": "delta", "epoch": 3, "rev": 42, "base": 41, "zone": "main",
  "upsert": [ { "id": "gh:7", "login": "maker", "provider": "github", "role": "speaker", "source": "world", "character": "maker", "contributions": 120, "mic": "on" } ],
  "remove": ["x:9"] }
{ "t": "audience", "v": 1, "kind": "react", "epoch": 3, "zone": "main", "id": "gh:7", "e": "🔥" }
```

- **Epoch and revision.** `epoch` is the room's roster generation (a restart or reset starts a new, larger one);
  `rev` counts changes within it. A message from an older epoch is dropped. A delta applies only when its `base` is
  the page's `rev`; otherwise the page sends one `audience-resync` and shows the roster as stale until a snapshot comes.
  A new socket forgets the epoch.
- **Chunks.** A large snapshot may come in `parts` (at most 64) with the same `epoch`, `rev` and `zone`, each with its
  `part` index. The page shows it only once every part has come, so the roster never mixes revisions. The page does
  not cap the roster: it pages it, 50 rows at a time.
- **Rows.** `id` (the server's stable participant id, at most 64 characters: one id is one row, so nobody is listed
  twice), `login` (no `@`, at most 39), `display` (defaults to `login`), `provider` (`github` or `x`), `role`
  (`speaker` or `listener`), and for speakers `source` (`world`, an island player; `chat`, an Ooga Chat speaker),
  `mic` (`on`, `muted` by its owner, or `off`), `speaking` and `hand` (the pinned emoji, empty when down). `character`
  is the canonical roster handle of a world speaker's Ooga, whose face the page draws; `avatar` a same-origin picture
  path (the island's panel leaves it out: the room names Ooga Chat's own paths, which only its edge serves);
  `contributions` a count for ordering only, never proof of anything; `self` marks the visitor. A row that breaks any
  of this is dropped, not guessed at.
- **You.** `you.speak` is the room's word on the visitor: `eligible` (may Join Voice), `pending`, `denied`, `active`
  or `none`. Only `eligible` enables Join Voice; pending or denied never briefly enables publishing.
- **Reactions.** `react` is a transient emoji for one row, shown in that row's column for its own lifetime over any
  hand. It changes no revision.

**Order.** World speakers by `contributions`, most first; then Ooga Chat speakers, the visitor first; then listeners,
the visitor first; names alphabetical (lowercased display name) within each, the `id` breaking ties. Mic, speaking
and hand changes never reorder.

**The island's panel.** The cloud tab is last, after The Commons. A Main Island tag in the title's corner (the panel
shows that zone alone for now, wherever the visitor's Ooga stands), one
scrolling roster of circles, speakers then listeners (`audience-tiles.js`, the app's own), the emoji bar, and a footer of the visitor's name, a fixed-width Mute or Unmute,
Join or Leave Voice and Sign out, all through the island's existing voice session. A speaker's portrait is ringed
green (`#22c55e`) from the island or purple (`#b18aff`) from Ooga Chat; listeners have no ring. Listeners appear only in this panel, never as characters in the world. Bridging the outdoor voice and the
app speakers' playback is #661. Cloud speakers in the world (#659): with the island's and the edge's `cloud` on, the
room sends every page the `clouds` list (`{ id, character, zone, seat, lease, mic, hand, login, display }`, net.js
`state.clouds`); the hub seats each speaker's own Ooga three to a cloud, one to a third (the outer two drawn in), on a
flat bench across the cloud's top (three cells deep, no deeper than a seat's glow reaches, so the purple runs to its
front and back edges), centred front to back, facing the banana pile, sitting as an Ooga sits by the fire
with no weapon in hand, with a purple glow on the cloud round them, their NPC a ghost meanwhile, a nameplate with a purple dot,
and their reactions and raised hand over them (remote-players.js); Online Oogas lists them with purple dots and a
crosshair to their cloud (players.js), and Contributing Oogas gives their rows the same purple dot (roster-panel.js,
`online(row)` answering `"cloud"`). The app's two panels do the same from its own audience list: an Ooga Chat speaker
is purple in Contributing Oogas and has a purple row with the main island's players in Online Oogas, and the member's
own row is purple in both whether or not they speak, since they are online through Ooga Chat; the emoji bar sits under the list in both, on the island's Contributing Oogas too. `?debug=1&clouds=a,b,c` seats sample speakers for review. `?debug=1&audience=fixture` shows a generated
roster of named samples for review and sends nothing.

## Fixtures

`fixture.html?state=` picks the canned answers: `signed-out`, `listener` (an X account, listening, whose handle and
answer both claim to be a contributor's), `contributor` (an eligible GitHub contributor, with the five tabs),
`ineligible`, `unknown` and `revoked` (GitHub accounts the server does not let speak), `provider-disabled` (X sign-in
off), `expiring` (a contributor whose session ends 20 s after load), `signout-fails` (the server never confirms a
sign-out), `demo-payment` (feed answered in demo mode), `real-payment` (feed answered live, as the service does: the real kiosk over this origin's `/donations/*`, which the fixture's own server answers with its 404, so the kiosk shows its error and nothing more) and `unavailable`. Signing in with GitHub lands on the state's
own kind of account, and with X on the X listener. A return can be tried by adding `&signin=denied&provider=github`.
`&roster=` picks what a signed-in account hears: `mixed` (the default: world and app speakers with a tie, a missing
total and a source mute, listeners with a duplicate and a long name, then a join, a rename, a gap the page must
resync over and a leave, one every 4 s), `empty`, `crowd` (300 listeners), `reconnecting` (drops after 6 s and comes
back in a new epoch), `full` and `none` (no audience address).
`&voice=` picks how voice answers, through a fake broker and fake WebRTC that never open a microphone or play
anything: `ok` (the default: every speaker of the zone pulled, and Join Voice lands a muted speaker), `denied` (the
microphone refused), `blocked` (playback held until a gesture), `refused` (the zone's speakers full), `off` (a
deployment that doesn't let anyone speak) and `elsewhere` (the account's voice is on the island, on another device,
until the visitor takes it with the prompt's Switch here). `BL.oogaChatFixtures.rtc.stats` counts captures, live tracks and playing
elements for the checks.
`&chats=on` offers hosted chats ([ooga-chat-hosts.md](ooga-chat-hosts.md)) from an in-memory directory: two sample
chats (one with a host, a co-host, a muted speaker, two requests and an invite out; the other with an open stage), their
previews from the same state, the roles' rules on a chat's feed (the host's open stage and Allow back among them),
and sample hosts that answer as a host would: a request is approved 1.5 s after it is made, and a microphone opened
there is muted by its host 2.5 s later. A chat the visitor starts fills with two samples who ask to speak; one invited
takes the stage a second later; End chat ends it.
The accounts are named samples with no picture, never real people. Fixtures are isolated three ways:

- a separate entry: `index.html` never loads `ooga-chat-fixtures.js`, and the build refuses one that does or that
  carries `data-adapter`;
- a separate artifact: only `--fixtures` stages `fixture.html` and its script, and the production script holds no
  fixture code;
- separate storage: keys are `ooga-chat.v1.<name>` in production and `ooga-chat.fixture.v1.<name>` in review.

## Output

`scripts/ooga-chat.mjs` writes:

| File | What it is |
|---|---|
| `index.html` | the entry, its build identity filled in |
| `js/ooga-chat-<hash>.js`, `css/ooga-chat-<hash>.css` | every first-load module and every stylesheet in order, one file each; the script begins by naming the chunks (`BL.oogaChatScripts`) |
| `js/ooga-chat-bananas-<hash>.js`, `js/ooga-chat-panels-<hash>.js` | each deferred group's modules in order, fetched when a tab needs them or once the first view has painted and the page is idle; shared by both entries and kept by the service worker with the rest of the shell. Each begins by returning if its group is here already, so a late copy after a timeout runs once |
| `art/<name>-<hash>.<ext>` | each picture under `src/ooga-chat/art/` that a view shows (the build fails on an unshown one) |
| `manifest.webmanifest` | the installable app's manifest (below), linked by `index.html` only |
| `icons/ooga-chat-<size>[-maskable]-<hash>.png` | the mark at 192, 512 and 512 maskable, for the manifest |
| `favicon-32.png`, `favicon-64.png`, `favicon.ico`, `apple-touch-icon.png`, `apple-touch-icon-precomposed.png` | the island's favicon set, at the addresses browsers and link previews ask for unprompted: the mark on a rounded square of the theme colour at 32px and 64px, both in `favicon.ico`, and the 64px one at twice its size on the theme colour as the 180px touch icon |
| `sw.js` | the service worker, its build and shell list filled in |
| `fixture.html`, `js/ooga-chat-fixture-<hash>.js` | with `--fixtures` only |
| `404.html` | sends any unknown address home, without script |
| `_headers` | the policy and security headers on every path, `no-cache` on the entry, the worker and the manifest (with its media type), a year on every hashed file |
| `build.json` | the build identity, the script list, each chunk's file, modules and gzipped bytes, every file's bytes and gzipped bytes, and the first-load total |

It refuses to stage into the repository root, `src/`, `_site/`, `untracked/site/`, `cards/`, `worker/`, `scripts/`,
`test/` or `docs/`, and into any non-empty folder without its own `build.json`, so the app and the island's artifacts
cannot overwrite one another.

## Content policy

`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self';
worker-src 'self'; base-uri 'none'; form-action 'none'`, with `frame-ancestors 'none'` added in `_headers`. The page has no inline script, style or
handler (the build checks), no remote font, script or CDN, and uses the native monospace stack. `connect-src 'self'`
covers the same-origin API and a same-origin WebSocket. WebRTC media is not governed by `connect-src`; the SFU is
reached through the backend's same-origin paths, as the island's voice is. `Permissions-Policy` allows the microphone
to the page's own origin only.

## Size

Measured from the staged installable app (#657): a first visit is 5 requests (`index.html` 1.2 KB, script 77.6 KB,
stylesheet 16.9 KB, sign-in picture 57.9 KB, Main Island's mark 3 KB): about 157 KB, 90 KB gzipped (the foundation
alone was 71 KB, with sign-in 78 KB, with the space 88 KB). The manifest and icons are fetched by the browser when it
considers installing, and the worker then keeps the same files once more in its cache, off the first paint. For comparison, the island's portable page is about
39.7 MB (23 MB gzipped). The app loads no 3D engine, terrain, cabinets, replays or live feeds. `FIRST_LOAD_BUDGET` in
the build fails a build whose first load grows past it; raise it deliberately, with the reason, when a later issue
adds weight. It was raised from 224 KB to 236 KB for the voice client and the Commons' name field, then to 244 KB for
each player's volume and mute, the optional duel muting and the voice handoffs of #766, when the first load measured
240.2 KB gzipped (script 149.3 KB). Every tab but Ooga Chat then moved into a chunk of its own (Chunks, above):
`bananas` 42.3 KB and `panels` 25.7 KB gzipped, fetched once the first view has painted and the browser is idle (never
under Save-Data, where a tab's first opening fetches its chunk and shows Opening… meanwhile). That took the first load
to 176.6 KB (`index.html` 0.6 KB, script 85.7 KB, stylesheet 12.6 KB, sign-in picture 77.7 KB at its largest; 29.7 or
42.1 KB on most phones and 1x screens, Artwork below), and the budget down to 180 KB, just above it, so a tab's code cannot slip back into the first load unnoticed. The emoji bar and its picker
with the whole emoji list (`emoji`, 24.4 KB), wanted only signed in, followed once `reaction-policy.js` read the list
when first asked rather than at load (the island and the Worker load it first anyway): the first load came to 153.3 KB
(script 62.4 KB), 154.1 KB with the voice links and listeners in Online Oogas (#861), about 155.9 KB with hosted chats' glue (their views in the `hosts` chunk), and the budget is 256 KB, raised by the maintainer on 2026-11-23. A chunk that cannot be fetched offers Try again; one gone after a deploy (a 404
to a HEAD, on a page the service worker does not keep) offers Reload.

## Artwork

`src/ooga-chat/art/sign-in-island.webp` (1005x670, 3:2) is the approved original illustration, sized for a Retina
display at the picture's widest (506 CSS pixels) and laid flat on the slab's own colour (`--slab-dark`, #161412), which
costs about a third of keeping its transparency. `sign-in-island-520.webp` (29.7 KB) and `sign-in-island-680.webp`
(42.1 KB) are the same picture made smaller (`cwebp -m 6 -q 80 -resize <w> <h>` from it), offered with it in the
view's `srcset` with the `sizes` its layout gives (up to 420px wide the page less 86px, then less 114px, up to 506px),
so the browser fetches one: 520w on a 1x screen and a 320px phone at 2x, 680w on other 2x phones, the original on 3x
phones and 2x desktops. It chooses by screen alone; a static page cannot choose by network speed, and the browsers
that report one are not Safari's. A new version replaces all three under the same names; the build re-hashes them,
and counts only the original in the first load (`ALTERNATE_ART`), the most a visit can fetch.

## The installable app (#657)

The first release is the web app at `ooga.chat`, not a store binary. Installing changes nothing about identity,
zones, roles or privacy, grants no background microphone, and never gates listening or the public panels.

**Manifest.** `manifest.webmanifest`: `id` and `start_url` `/`, `scope` `/`, `display` `standalone`, name and short
name Ooga Chat, background and theme `#0a0a0b`, icons at 192, 512 and 512 maskable, plus the 32px and 64px favicons
and the 180px Apple touch icon linked from the page. Every icon is Ooga Chat's mark (`nativeIcons.cloud`: the cloud
under three dots in the purple of its speakers) drawn pixel for pixel by whole-number scaling, with its outline taking
the colour of what it outlines so it reads on black: the manifest's icons on the theme colour, the maskable one inside
the platform's safe circle, and the favicons on a rounded square of it (`cloudIcon` and `favicon` in the build). Direct navigation, reload and an installed launch all land on `/`;
an unknown path gets `404.html`, which sends it home. The sign-in return is `/` with a result code, so it works from
the browser and from the installed app alike (on iOS an installed app may finish OAuth in its own browser sheet).

**Install help** follows what the browser offers: Install Ooga Chat (the browser's own prompt) where it sends
`beforeinstallprompt`, a one-line Share then Add to Home Screen hint on Safari for iOS, and nothing elsewhere or once
installed.

**The cache contract** (`service-worker.js`, registered as `/sw.js` with scope `/`, only by the production entry of a
staged build on a secure origin, `updateViaCache: "none"`):

| Request | What the worker does |
|---|---|
| a hashed file of this build (`/js/`, `/css/`, `/art/`, `/icons/`) | from its cache, kept at install |
| the page (`/` or `/index.html`, a navigation) | from the network; from its cache only when the network fails |
| anything else: `/api/*`, sign-in and its return's server routes, logout, session, the audience WebSocket, media and SDP, donations and invoices, `fixture.html`, `manifest.webmanifest`, `build.json`, any query string, any other origin | untouched: the browser asks the network as if there were no worker |
| anything that is not a GET | untouched, never replayed |

It keeps only responses that are OK, same-origin and not marked `no-store` or `private`, and an install fails whole if
any shell file cannot be kept, leaving the previous version in place. It holds no account data, so nothing private is
cached for another account to see, and sign-out has no cache to clear. Each version's cache is
`ooga-chat-<build>`; taking over deletes every older one, and nothing else.

**Offline** shows the shell with "You're offline. Ooga Chat reconnects when you're back.", sign-in and Join Voice
off, and the list marked reconnecting rather than live: no saved state claims a current list, a speaker seat, a raised
hand, live audio or a valid session. Back online, the session and capabilities are checked again, the audience feed
rejoins and sends a fresh snapshot, and voice returns only through the voice client's own lifecycle, never unmuted by
itself.

**Updates.** A new version installs in the background and waits. The page says "A newer Ooga Chat is ready" with
Reload, which hands over to the new worker and reloads once; while the visitor speaks, Reload waits until they leave
voice. Nothing reloads by itself, so an open page keeps its own compatible files until it reloads, and the bootstrap's
protocol list keeps an old page from speaking to a server that has moved on (it goes stale instead).

**The M key** mutes or unmutes a speaker's own microphone, and does nothing while typing in a field or editable
text, composing with an IME, holding a modifier or repeating.

**Background and interruptions.** Mobile browsers and installed web apps may suspend JavaScript, playback and capture
when the screen locks, the app goes to the background, a call comes in or the audio device changes. Ooga Chat does not
try to keep running there. On return it checks the session (`visibilitychange`, the page cache's `pageshow`), the feed
reconnects and resyncs, and nothing shows as live until the server says so again. Observed behaviour per platform
belongs in the matrix below.

**Release runbook.**

1. Stage with `npm run build:ooga-chat`; `build.json` names the build, every file and the first-load total.
2. The owner deploys the staged folder to staging (#662) and runs the acceptance below against the real backend.
3. Production rollout is the bootstrap's `features` (server-side): turn providers and voice on in stages (#669).
4. Rollback: redeploy the previous staged folder. Its `sw.js` differs, so open pages see an update and new visits get
   the old version; nothing is pinned in a cache beyond one reload online, because the page is always asked of the
   network first.

**Supported-browser matrix** (to fill in from real devices; nothing here is assumed):

| Platform | Browser | Version | Install | Sign-in return | Offline shell | Update | Background, lock, call |
|---|---|---|---|---|---|---|---|
| Android | Chrome | not yet tested | | | | | |
| iOS / iPadOS | Safari | not yet tested | | | | | |
| macOS | Safari | not yet tested | | | | | |
| Windows, macOS | Chrome, Edge | not yet tested | | | | | |
| Windows, macOS, Linux | Firefox | not yet tested (no install) | | | | | |

**Acceptance evidence** to record here, without credentials, tokens, private SDP or payment control tokens in any
capture: 320, 390 and 1024px captures of sign-in, listener, speaker, Bananas, the full contributor list and each
donation stage; keyboard and screen-reader passes over the tabs, the roster, the footer and the panels; offline,
reconnect and update runs showing the excluded requests never cached; background and interruption runs; and startup
requests, bytes and time to useful content on a representative phone.

## What the backend owner provides

Each item is a proposal for the owner (`w-s-bitcoin`, #662, #663) to confirm or change; the page changes with it.

- `GET /api/bootstrap` (v1, above), with `features.github`/`features.x` and `paths.login`, `paths.session`,
  `paths.logout` on the app's origin.
- The provider routes: `paths.login[provider]` starts OAuth (PKCE, state, cookies all server-side) and the callback
  ends with a 303 to `/?signin=<result>&provider=<provider>`, `result` one of `ok`, `denied`, `failed`,
  `unavailable`, `rate-limited`, and nothing else in the address.
- `GET paths.session` (proposed `/api/chat/me`): 401 signed out, or the identity protocol 1 answer above, with
  `Cache-Control: no-store`. The contributor policy decides `eligibility` and the capabilities; X is never eligible.
- `POST paths.logout`: revokes the session and any media lease, answers 2xx only once done.
- `paths.audience` and the audience feed (protocol 1, above, #665): authoritative membership by the zone policy,
  roles from acknowledged leases, ids as `participant`s, generations per source, world speakers' contribution totals and
  same-origin native portraits, and the close codes. Listening never takes a world-player slot or makes a body.
- Serving the staged folder on `ooga.chat` over HTTPS with its `_headers` (#662): `sw.js` and `manifest.webmanifest`
  at the root with `no-cache`, the manifest as `application/manifest+json`, and every API answer `no-store`, so no
  cache between the page and the server keeps one either.
- Profile pictures on the app's origin (proxied or stored, `img-src 'self'`), at a path that changes when the picture
  does, so a face is never another principal's.

## Rollout and rollback

This foundation authorizes no deployment. When the owner deploys (#662), the Worker for `ooga.chat` serves the staged
folder. The rollout switch is the bootstrap's `features`, which the server owns: with a feature off, the page shows it
disabled. Rolling back is redeploying the previous staged folder, identified by its `build.json`. Hashed files are
immutable, and a page left open keeps its own script, so an old tab keeps working until it reloads.
