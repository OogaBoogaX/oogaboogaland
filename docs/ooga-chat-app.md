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
| `src/ooga-chat/ooga-chat-views.js` | `BL.oogaChatViews`: the Ooga Chat view (sign-in, or the zones and the roster), the account footer, faces and the stand-ins for the shared panels |
| `src/ooga-chat/ooga-chat-http.js` | `BL.oogaChatHttp`: the production adapter |
| `src/ooga-chat/ooga-chat-fixtures.js` | `BL.oogaChatFixtures`: the offline adapter, review only |
| `src/ooga-chat/ooga-chat-app.js` | startup, loaded last |
| `src/ooga-chat/art/` | pictures the views show, staged under their hash. `main-island.png` is Main Island's destination mark: the island's 64px favicon keyed as `hud.js` keys it for its destination button (the suite holds the two equal) |
| `scripts/ooga-chat.mjs` | the build, the guards and `--serve` |

Shared with the island, one copy each:

| Path | What it is |
|---|---|
| `src/native.css` | the tokens, cave-sign lettering, panel title, status chip, stone slab and amber primary button. The island links it before `style.css`; `scripts/build.mjs` joins both into its one style block |
| `src/js/sign-glyphs.js` | `BL.signGlyphs`: the cave-sign alphabet (`SIGN_GLYPHS`, which `hub-models.js` re-exports) and its DOM lettering (`lettering`, `letter`), which `hud.js` uses |
| `src/js/native-icons.js` | `BL.nativeIcons`: the panel tabs' pixel icons (`bananas`, `roster`, `players`, `chat`), Ooga Chat's outlined `cloud`, DSB Land's destination mark `dsb` (the island's `dsb-island-icon` paths, held equal by the suite) and `voice()`, the roster's voice mark. `hud.js` fills the island's tab slots (`data-native-icon`) from it and draws its roster's voice mark with it |

A module the app may load is either `src/ooga-chat/ooga-chat-*.js` or named in `SHARED` in `scripts/ooga-chat.mjs`;
the build fails on anything else, so a renderer, scene, socket or game cannot reach the app by accident. A shared
module reads nothing at load but `window.BL` and the document.

## Load order and contracts

`sign-glyphs.js`, `native-icons.js`, `ooga-chat-config.js`, `ooga-chat-auth.js`, `ooga-chat-roster.js`, `ooga-chat-device.js`,
`ooga-chat-shell.js`, `ooga-chat-views.js`,
`ooga-chat-http.js`, then (fixture entry only) `ooga-chat-fixtures.js`, then `ooga-chat-app.js`. The build checks that
`fixture.html` loads exactly `index.html`'s files plus the fixtures, just before the app.

**Adapter.** `{ kind, bootstrap(), session(boot), signIn(boot, provider), signOut(boot), audience(boot, handlers), dispose() }`. `bootstrap`
resolves to a parsed bootstrap (below), never throws. `session` resolves to a parsed session or `null` for signed
out, and throws for any other failure, which the app shows as a recoverable error. `signIn` navigates (production)
or returns a session (fixtures). `signOut` resolves only when the server confirms and throws otherwise. `dispose`
aborts what is still in flight. `audience` opens the audience feed (below) and returns `{ zone(id), resync(), dispose() }`.

**Shell.** `create({ root, tabs, ctx, selected, onSelect })` returns `{ update(state), select(id), dispose() }`. A
tab is `{ id, label, icon, visible(state), view }`. A view is `view(ctx)` returning `{ node, update(state), dispose() }`:
built the first time its tab is chosen, then kept. Switching tabs hides it, and `update` passes it the new state, so
a view's own nodes and listeners (a sort, a draft, a voice control) survive both. `dispose` is the only teardown.

**State.** `{ mode, boot, session, auth, notice, busy, zone, voice, audience }`, `mode` being `loading`, `live`,
`unavailable` or `stale`, and `auth`, `notice` and `busy` the account's (below). `zone` is the outdoor zone, `main` or
`dsb`, saved. `voice` is the voice seam's `{ role, muted }`. `audience` is `{ status, zone, list, version }`: the feed's
status (`off`, `connecting`, `joining`, `live`, `reconnecting`, `full`, `unavailable`, `stale`) and the list in the
space's order.
Public tabs: Ooga Chat, Bananas, Contributing Oogas. Online Oogas and The Commons show only while `gates` says
`contributor`. Choosing a tab never signs in, signs out, changes the zone or touches voice. The account footer sits
under every tab while signed in, and not at all while signed out.

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
{ "identity": { "principal": "pr_7f3a…", "provider": "github", "providerUserId": "583231",
                "login": "someone", "display": "Someone", "avatar": "/avatars/pr_7f3a.png" },
  "capabilities": { "speak": true, "contributor": true },
  "eligibility": { "state": "eligible", "checkedAt": 1763000000000, "staleAfter": 900 },
  "expiresAt": 1763086400000 }
```

- `principal` is the server's opaque, stable identity (up to 128 of `[A-Za-z0-9_:.-]`), required. Equality,
  deduplication and anything kept per person key on it, never on `login`, which a rename changes. Signing out and in
  with the other provider is a different principal: there is no GitHub to X linking.
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
| `signed-out` | no session | (no footer) | no |
| `listener` | X, or GitHub `ineligible` or `revoked` | off, saying why | no |
| `unknown` | GitHub, eligibility unknown or stale | off, saying why | no |
| `eligible` | GitHub, server says eligible | on when voice is ready | when `contributor` |
| `signing-out` | sign-out sent | (footer says Signing out) | no |
| `error` | the session could not be checked | off, saying why | as last answered |

Every sign-in lands as a listener, microphone closed: no choice panel, no automatic capture. The session is checked
before any control shows, then again at its nearest deadline (expiry, or the end of an eligible answer's stale
window: one timer, clamped to 5 s – 1 h), when the page becomes visible or the network returns (at most every 30 s),
and when the browser restores the page from its cache. A lost session reads "Your sign-in expired"; a failed check
reads "can't check your sign-in" with Try again, so an expired login and an outage never look alike. Public tabs keep
working through both.

**The voice seam** is `media = { available, release(reason), join(state) }`. Until #654's client takes its place,
`available` is false and Join Voice stays off ("Voice opens here soon"). The controller calls `release` first whenever
the account stops being the one that may speak: sign-out (before the logout request), another principal, an expired
session, a capability lost or gone stale, a failed check. Join Voice asks `gates` again at the click.

**Signing out** stops capture, clears the session from the page and returns to Ooga Chat's sign-in at once, then posts
`paths.logout`. If the server does not confirm, the page stays signed out and says so with Try again; the server ends
the session when it expires.

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

A participant is `{ id, generation, source, role, login, display, face, contributions, muted }`: `id` the server's
opaque identity (the principal; the visitor is the participant whose `id` is their session's `principal`),
`generation` the source generation (an integer that rises when the same person comes back from a new source),
`source` `world` (speaking from the island) or `app` (Ooga Chat), `role` `speaker` or `listener`, `face` a same-origin
path (a world speaker's native Ooga portrait, an app participant's profile picture) or nothing, `contributions` a world
speaker's total or nothing (unknown, not zero), `muted` a speaker's source mute. A snapshot replaces the list; a
delta must carry the next revision of the same epoch. An older epoch or revision is dropped; a later revision, a newer
epoch or a delta that does not parse whole is a gap, applied not at all, and the page asks for a snapshot. A removal
applies only to the generation it names or older. Close codes: 4401 the session ended (the page checks it again and
marks the list reconnecting), 4426 another protocol revision (stale), 4429 the zone is full (the page waits 30 s).
Otherwise it reconnects, backing off from 1 s to 30 s, and shows the list as reconnecting, never as live.

**Order.** One continuous four-column list, speakers first, with no headings or gap between roles: world speakers by
contribution total, most first, a missing total after every known one (zero included), ties alphabetical by login,
case-insensitive, then by id; then app speakers, the visitor first among them and the rest alphabetical; then
listeners, the visitor first and the rest alphabetical. The visitor never moves ahead of a world speaker. Totals sort;
they grant nothing.

**Tiles.** A face (world speakers their native Ooga portrait, everyone else their profile picture, the island's Ooga
face when either is missing or fails), a speaker's 3px source ring outside a 3px dark gap (green `#22c55e` from the
island, purple `#b18aff` from Ooga Chat; listeners neutral), the name without `@` on one line cut short with its
whole self in the title and the accessible name, an app speaker's purple dot before it, and under it the native voice
mark with Speaker (crossed and red when source-muted) or Listener. Tiles are keyed by `id` and `generation` and kept:
an update changes and moves only what changed, once a frame, and focus stays on its tile. The list has one tab stop;
arrow keys, Home and End move through every participant.

**Footer.** The reactions slot (#655) left of the account where there is room and above it where not; then the name
(a purple dot only while speaking from Ooga Chat), the microphone (always first, 84px wide whatever it says: a disabled
Unmute for a listener, explaining voice must be joined first; Mute or Unmute for a speaker), Join Voice for a
listener the server allows to speak (Leave Voice for a speaker), and Sign out as plain text. Buttons are 28px to see
and 44px to touch, rows 16px apart so no touch band reaches another row. The seam (`media.state`) says who is a
speaker; until #654 nobody is.

## Fixtures

`fixture.html?state=` picks the canned answers: `signed-out`, `listener` (an X account, listening, whose handle and
answer both claim to be a contributor's), `contributor` (an eligible GitHub contributor, with the five tabs),
`ineligible`, `unknown` and `revoked` (GitHub accounts the server does not let speak), `provider-disabled` (X sign-in
off), `expiring` (a contributor whose session ends 20 s after load), `signout-fails` (the server never confirms a
sign-out), `demo-payment` (feed answered in demo mode) and `unavailable`. Signing in with GitHub lands on the state's
own kind of account, and with X on the X listener. A return can be tried by adding `&signin=denied&provider=github`.
`&roster=` picks what a signed-in account hears: `mixed` (the default: world and app speakers with a tie, a missing
total and a source mute, listeners with a duplicate and a long name, then a join, a rename, a gap the page must
resync over and a leave, one every 4 s), `empty`, `crowd` (300 listeners), `reconnecting` (drops after 6 s and comes
back in a new epoch), `full` and `none` (no audience address).
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
| `icons/ooga-chat-<size>[-maskable]-<hash>.png` | the native cloud at 180 (Apple touch), 192, 512 and 512 maskable |
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
the build (96 KB gzipped) fails a build that grows past it; raise it deliberately, with the reason, when a later issue
adds weight.

## Artwork

`src/ooga-chat/art/sign-in-island.jpg` (430x287, 3:2) is a stand-in cropped from the issue's design capture. Replace
it with the approved original under the same name; the build re-hashes it and the views need no change.

## The installable app (#657)

The first release is the web app at `ooga.chat`, not a store binary. Installing changes nothing about identity,
zones, roles or privacy, grants no background microphone, and never gates listening or the public panels.

**Manifest.** `manifest.webmanifest`: `id` and `start_url` `/`, `scope` `/`, `display` `standalone`, name and short
name Ooga Chat, background and theme `#0a0a0b`, icons at 192, 512 and 512 maskable, plus a 180px Apple touch icon
linked from the page. Every icon is the native cloud (`nativeIcons.cloud`) drawn pixel for pixel by whole-number
scaling on the theme colour, the maskable one inside the platform's safe circle; approved artwork can replace
`cloudIcon` in the build without touching the page. Direct navigation, reload and an installed launch all land on `/`;
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
  roles from acknowledged leases, ids as principals, generations per source, world speakers' contribution totals and
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
