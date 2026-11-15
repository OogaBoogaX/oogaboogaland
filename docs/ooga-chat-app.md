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
| `src/ooga-chat/ooga-chat-views.js` | `BL.oogaChatViews`: each tab's view, every one the island's own panel in its markup (#656): the Ooga Chat tab (sign-in, or the island's Ooga Chat panel: the zones, the roster and its footer), Bananas, Contributing Oogas, Online Oogas and The Commons, the island's account row at the foot of the last three, and the stand-in for a panel not built yet |
| `src/ooga-chat/ooga-chat-http.js` | `BL.oogaChatHttp`: the production adapter |
| `src/ooga-chat/ooga-chat-media.js` | `BL.oogaChatMedia`: voice (#654), one controller apart from the views: hearing the zone through the server's media operations and speaking from it (Voice, below) |
| `src/ooga-chat/ooga-chat-faces.js` | `BL.oogaChatFaces`: where each Ooga's face stands on `art/ooga-faces.png`, by handle, and the default Ooga's for anyone added since. Generated with the sheet by `npm run ooga-chat:faces` (`scripts/ooga-chat-faces.mjs`, the island's own renderer in the suite's Chrome), never edited; run it again when an Ooga is added or changes its look |
| `src/ooga-chat/ooga-chat-commons.js` | `BL.oogaChatCommons`: what the island's Room tells a community member (#670), checked and kept for The Commons and Online Oogas: who you are, whether lines may be sent, everyone online without a position, and the last 100 lines |
| `src/ooga-chat/ooga-chat-donor.js` | `BL.oogaChatDonor`: who Feed the Oogas says a tip is from (the name and message last given, and the names this browser's own paid tips used), the `game` the shared donation popup reads, in this app's own storage. Reopening Feed starts from the name last given, never the login or "anon" over it; a GitHub account's login is the starting name only until one is given |
| `src/ooga-chat/ooga-chat-fixtures.js` | `BL.oogaChatFixtures`: the offline adapter, review only. Its Bananas demo takes the simulated kiosk's payments (`demo.receive`, heard through `demo.subscribe`), counted as the kiosk quoted them, so a receipt shows |
| `src/ooga-chat/ooga-chat-app.js` | startup, loaded last |
| `src/ooga-chat/art/` | pictures the views show, staged under their hash. `main-island.png` is Main Island's destination mark: the island's 64px favicon keyed as `hud.js` keys it for its destination button (the suite holds the two equal) |
| `scripts/ooga-chat.mjs` | the build, the guards and `--serve` |

Shared with the island, one copy each:

| Path | What it is |
|---|---|
| `src/native.css` | the tokens, cave-sign lettering, panel title, status chip, stone slab and amber primary button, and the Bananas panel's styles. The island links it before `style.css`; `scripts/build.mjs` joins both into its one style block |
| `src/style.css` (in part) | the island's own rules for its Ooga Chat panel and its circles, Contributing Oogas, Online Oogas, The Commons, the account row, the footer buttons and the help and link lines, taken by selector when the app builds (`ISLAND_RULES` in `scripts/ooga-chat.mjs`) and joined after `native.css`, so the panels look the same from one source |
| `src/js/sign-glyphs.js` | `BL.signGlyphs`: the cave-sign alphabet (`SIGN_GLYPHS`, which `hub-models.js` re-exports) and its DOM lettering (`lettering`, `letter`), which `hud.js` uses |
| `src/js/donations.js` | `BL.donations`: the donation event contract and real mode's socket and calls over the page's own `/donations/*`. The app turns its simulator off, calls `useOrigin` and subscribes once the bootstrap says `feed` is live (#656) |
| `src/js/banana-panel.js` | `BL.bananaPanel`: the Bananas panel's markup (`build`, ids only on the island's copy) and controller (`create`, filled from `donations.js`), which `hud.js` and the app's Bananas tab both run |
| `src/js/audience-tiles.js` | The Ooga Chat roster's circles (`BL.audienceTiles`), the island's Ooga Chat panel's and this tab's alike: everyone in the zone four to a row, scrolling in its slab, each tile kept by id and only its changed fields written |
| `src/js/format-large.js`, `src/js/roster-panel.js`, `src/js/contributor-identities.js`, `src/js/activity-repos.js` | Contributing Oogas (#656): the island's own panel over `/api/chat/public/contributors` (#664), its contribution states and ages, Oogatron's reading normalized as the island normalizes it, and each Ooga's face from `art/ooga-faces.png`, loaded when a stats strip first opens and not counted in the first load (`LAZY_ART`). A contributor in The Commons sees whose Ooga is on the island now; a stale or unreadable reading says so under the list |
| `src/js/emoji-data.js`, `src/js/reaction-bar.js` | The island's own emoji panel (#655), in the Ooga Chat panel's footer: the ten reactions, the raised hand and the picker over every emoji, its skin tones and heart colours, from this browser's own choices (`ooga-reactions*`). `ooga-chat-app.js` hands it the audience socket as its connection: a tap is a `reaction` request, the hand a `hand` request an active speaker alone may make, and every reaction the server sends the zone pops over that participant's circle |
| `src/js/chat-policy.js`, `src/js/reaction-policy.js`, `src/js/zone-map.js`, `src/js/commons-log.js` | The Commons and Online Oogas for an eligible contributor (#670): the island's chat rules, the raised hand in each tone, the zones as the island's Online Oogas groups them, and the conversation's log and composer, run over the app's own `/api/chat/commons` socket (`ooga-chat-http.js` `commons`), with the island's name field at the Commons' top, saved as the island's display name (`commonsName`, `POST /api/chat/commons/name`). Their look is placed by `ooga-chat.css`; no distance, crosshair, voice link or volume, which are the island's alone |
| `src/js/qr.js`, `src/js/banana-icon.js`, `src/js/jumbotron-font.js`, `src/js/factory-kiosk-core.js`, `src/js/factory-kiosk.js`, `src/js/donation-popup.js` | Feed the Oogas: the island's donation dialog and its kiosk screen, with the QR codes, the banana and the 5x7 letters they draw. The app opens it from its Bananas tab while the feed is live (the fixture entry's demo aside), real over its own `/donations` relay, with `ooga-chat-donor.js` as its `game`; its frame is placed by `ooga-chat.css` |
| `src/js/native-icons.js` | `BL.nativeIcons`: the panel tabs' pixel icons (`bananas`, `roster`, `players`, `chat`), Ooga Chat's mark `cloud` (the tab icon on both, and the app's favicons and icons), DSB Land's destination mark `dsb` (the island's `dsb-island-icon` paths, held equal by the suite) and `voice()`, the roster's voice mark. `hud.js` fills the island's tab slots (`data-native-icon`) from it and draws its roster's voice mark with it |

A module the app may load is either `src/ooga-chat/ooga-chat-*.js` or named in `SHARED` in `scripts/ooga-chat.mjs`;
the build fails on anything else, so a renderer, scene, socket or game cannot reach the app by accident. A shared
module reads nothing at load but `window.BL` and the document.

## Load order and contracts

`sign-glyphs.js`, `native-icons.js`, `donations.js`, `banana-panel.js`, `qr.js`, `banana-icon.js`, `jumbotron-font.js`, `factory-kiosk-core.js`,
`factory-kiosk.js`, `donation-popup.js`, `chat-policy.js`, `emoji-data.js`, `reaction-policy.js`, `zone-map.js`, `commons-log.js`, `format-large.js`, `roster-panel.js`,
`contributor-identities.js`, `activity-repos.js`, `audience-tiles.js`, `reaction-bar.js`, `ooga-chat-config.js`, `ooga-chat-auth.js`, `ooga-chat-roster.js`, `ooga-chat-device.js`,
`ooga-chat-shell.js`, `ooga-chat-views.js`,
`ooga-chat-http.js`, `ooga-chat-media.js`, `ooga-chat-donor.js`, `ooga-chat-commons.js`, `ooga-chat-faces.js`, then (fixture entry only) `ooga-chat-fixtures.js`, then `ooga-chat-app.js`. The build checks that
`fixture.html` loads exactly `index.html`'s files plus the fixtures, just before the app.

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
and The Commons (while signed out, the sign-in screen's own Continue with GitHub). Bananas has none.

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
app's prefix and any older unversioned `ooga-chat.` key, so no saved screen, role or speaker flag survives.

**Faces.** A face is the account's `avatar`, loaded once at a fixed 56px circle, or the island's own Ooga face
(`nativeIcons` `roster`) when there is none or it fails: never a broken image, a generated pattern or another
person's picture, and never retried. A rename changes the words, not the face. Full names stay in the title and the
accessible name when the line is cut short.

## The space (#653)

**Zones.** Two buttons, Main Island and DSB Land, each with the island's own destination mark left of its name; the
chosen one is the native dark slab with a gold label. The server's zone policy decides who is in a zone (the outdoor
boundaries are #658's and the backend's); choosing one here never moves a character or opens an interior. The zone
already chosen changes nothing, so the microphone, the hand and any pending media stay as they are. Another zone
saves the choice, hands the voice lease to the seam (`media.zone`), empties the list and shows "Joining…" until that
zone's snapshot arrives, so no stale person or role from the old zone shows in the new one.

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
the island, purple `#b18aff` from Ooga Chat; listeners neutral), the hand's corner (#655), the name without `@` on one
line cut short with its whole self in the title and the accessible name, an app speaker's purple dot before it, and
under it a speaker's voice mark (crossed and red when source-muted) with Speaker, or Listener. The visitor's own voice
mark mutes or unmutes them while they speak; anyone else's will mute that voice for this visitor once Ooga Chat plays
them (#661). Tiles are keyed by `id` and kept: an update changes and moves only what changed, once a frame, and focus
stays on its tile. The list has one tab stop; arrow keys, Home and End move through every participant, up and down a
row of the grid. Smaller circles in a panel under 400px wide (the island's drawer, a phone). A status line under the
zones says when the list is not simply live, or is empty.

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
button in place of the island's amber Contributor sign-in; else the name, with a green dot
and how many are on the island while The Commons is live, Join voice (Mute or Unmute for a speaker), Leave voice for
a speaker, and Sign out.

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
the old zone's voices before the new zone's snapshot; a sync asked before the change plays nothing. A new audience
connection (a reconnect) ends everything held under the old one, says "Voice reconnected. Join Voice to speak again.",
and listens again; speaking is never put back by itself. The feed lost (`reconnecting`, `signed-out`, `closed`, `full`)
stops capture and receiving until its next snapshot. `release` ends speaking and keeps listening; signing out or
another principal stops both with the feed. Nothing is kept in storage.

**Not yet.** A peer's voice mark does not yet mute that voice for this visitor alone, and nothing here measures who is
speaking; both are follow-ups. iOS routes playback differently while the microphone is open, and no browser promises
audio or capture in the background.

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

**The island's panel.** The cloud tab is last, after The Commons. Main Island and DSB Land buttons at the top, one
scrolling roster of circles, speakers then listeners (`audience-tiles.js`, the app's own), the emoji bar, and a footer of the visitor's name, a fixed-width Mute or Unmute,
Join or Leave Voice and Sign out, all through the island's existing voice session. A speaker's portrait is ringed
green (`#22c55e`) from the island or purple (`#b18aff`) from Ooga Chat; listeners have no ring, and an Ooga Chat
speaker's name has a purple dot before it. Listeners appear only in this panel, never as characters in the world. Bridging the outdoor voice and the
app speakers' playback is #661; cloud speakers in the world are #659. `?debug=1&audience=fixture` shows a generated
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
microphone refused), `blocked` (playback held until a gesture), `refused` (the zone's speakers full) and `off` (a
deployment that doesn't let anyone speak). `BL.oogaChatFixtures.rtc.stats` counts captures, live tracks and playing
elements for the checks.
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
| `js/ooga-chat-<hash>.js`, `css/ooga-chat-<hash>.css` | every module and stylesheet in order, one file each |
| `art/<name>-<hash>.<ext>` | each picture under `src/ooga-chat/art/` that a view shows (the build fails on an unshown one) |
| `manifest.webmanifest` | the installable app's manifest (below), linked by `index.html` only |
| `icons/ooga-chat-<size>[-maskable]-<hash>.png` | the mark at 192, 512 and 512 maskable, for the manifest |
| `favicon-32.png`, `favicon-64.png`, `favicon.ico`, `apple-touch-icon.png`, `apple-touch-icon-precomposed.png` | the island's favicon set, at the addresses browsers and link previews ask for unprompted: the mark on a rounded square of the theme colour at 32px and 64px, both in `favicon.ico`, and the 64px one at twice its size on the theme colour as the 180px touch icon |
| `sw.js` | the service worker, its build and shell list filled in |
| `fixture.html`, `js/ooga-chat-fixture-<hash>.js` | with `--fixtures` only |
| `404.html` | sends any unknown address home, without script |
| `_headers` | the policy and security headers on every path, `no-cache` on the entry, the worker and the manifest (with its media type), a year on every hashed file |
| `build.json` | the build identity, the script list, every file's bytes and gzipped bytes, and the first-load total |

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
the build (236 KB gzipped, raised from 224 KB for the voice client and the Commons' name field) fails a build that grows past it; raise it deliberately, with the reason, when a later issue
adds weight.

## Artwork

`src/ooga-chat/art/sign-in-island.webp` (1005x670, 3:2) is the approved original illustration, sized for a Retina
display at the picture's widest (502 CSS pixels) and laid flat on the slab's own colour (`--slab-dark`, #161412), which
costs about a third of keeping its transparency. A new version replaces it under the same name; the build re-hashes it.

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
