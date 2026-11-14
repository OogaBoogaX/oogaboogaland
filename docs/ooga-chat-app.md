# Ooga Chat app

Ooga Chat is a standalone, mobile-first page for `ooga.chat` (#650): authenticated listeners hear the outdoor
conversation in Ooga Booga Land, and verified GitHub contributors can speak from a cloud. It lives in this repository
as its own entry, build and output, and shares the island's native look and components without loading the island.

This document covers the foundation (#651): the entry, the build, the shell, the configuration contract and the
fixture entry. Sign-in (#652), the roster and controls (#653), voice (#654), reactions (#655), the shared panels and
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
| `src/ooga-chat/ooga-chat-config.js` | `BL.oogaChatConfig`: the bootstrap contract and its parsers, storage keys, the build identity |
| `src/ooga-chat/ooga-chat-shell.js` | `BL.oogaChatShell`: the tabs and the views they keep |
| `src/ooga-chat/ooga-chat-views.js` | `BL.oogaChatViews`: the Ooga Chat view and the stand-ins for the shared panels |
| `src/ooga-chat/ooga-chat-http.js` | `BL.oogaChatHttp`: the production adapter |
| `src/ooga-chat/ooga-chat-fixtures.js` | `BL.oogaChatFixtures`: the offline adapter, review only |
| `src/ooga-chat/ooga-chat-app.js` | startup, loaded last |
| `src/ooga-chat/art/` | pictures the views show, staged under their hash |
| `scripts/ooga-chat.mjs` | the build, the guards and `--serve` |

Shared with the island, one copy each:

| Path | What it is |
|---|---|
| `src/native.css` | the tokens, cave-sign lettering, panel title, status chip, stone slab and amber primary button. The island links it before `style.css`; `scripts/build.mjs` joins both into its one style block |
| `src/js/sign-glyphs.js` | `BL.signGlyphs`: the cave-sign alphabet (`SIGN_GLYPHS`, which `hub-models.js` re-exports) and its DOM lettering (`lettering`, `letter`), which `hud.js` uses |
| `src/js/native-icons.js` | `BL.nativeIcons`: the panel tabs' pixel icons (`bananas`, `roster`, `players`, `chat`) and Ooga Chat's outlined `cloud`. `hud.js` fills the island's tab slots (`data-native-icon`) from it |

A module the app may load is either `src/ooga-chat/ooga-chat-*.js` or named in `SHARED` in `scripts/ooga-chat.mjs`;
the build fails on anything else, so a renderer, scene, socket or game cannot reach the app by accident. A shared
module reads nothing at load but `window.BL` and the document.

## Load order and contracts

`sign-glyphs.js`, `native-icons.js`, `ooga-chat-config.js`, `ooga-chat-shell.js`, `ooga-chat-views.js`,
`ooga-chat-http.js`, then (fixture entry only) `ooga-chat-fixtures.js`, then `ooga-chat-app.js`. The build checks that
`fixture.html` loads exactly `index.html`'s files plus the fixtures, just before the app.

**Adapter.** `{ kind, bootstrap(), session(boot), signIn(boot, provider), signOut(boot), dispose() }`. `bootstrap`
resolves to a parsed bootstrap (below), never throws. `session` resolves to a parsed session or `null` for signed
out, and throws for any other failure, which the app shows as a recoverable error. `signIn` navigates (production)
or returns a session (fixtures). `dispose` aborts what is still in flight.

**Shell.** `create({ root, tabs, ctx, selected, onSelect })` returns `{ update(state), select(id), dispose() }`. A
tab is `{ id, label, icon, visible(state), view }`. A view is `view(ctx)` returning `{ node, update(state), dispose() }`:
built the first time its tab is chosen, then kept. Switching tabs hides it, and `update` passes it the new state, so
a view's own nodes and listeners (a sort, a draft, a voice control) survive both. `dispose` is the only teardown.

**State.** `{ mode, boot, session, busy }`, `mode` being `loading`, `live`, `unavailable` or `stale`. Public tabs:
Ooga Chat, Bananas, Contributing Oogas. Online Oogas and The Commons show only for a session whose capabilities say
`contributor`.

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

**Session** (`paths.session`): 401 is signed out; otherwise

```json
{ "identity": { "provider": "github", "login": "someone", "display": "someone", "avatar": "/avatars/1.png" },
  "capabilities": { "speak": true, "contributor": true } }
```

`speak` counts only for a GitHub identity, and only as the server says. A paid donation or a matching X name never
grants it. `avatar` must be a same-origin path. The backend proxies or stores profile pictures, so the page's
`img-src` stays `'self' data:`.

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
  path; `contributions` a count for ordering only, never proof of anything; `self` marks the visitor. A row that breaks
  any of this is dropped, not guessed at.
- **You.** `you.speak` is the room's word on the visitor: `eligible` (may Join Voice), `pending`, `denied`, `active`
  or `none`. Only `eligible` enables Join Voice; pending or denied never briefly enables publishing.
- **Reactions.** `react` is a transient emoji for one row, shown in that row's column for its own lifetime over any
  hand. It changes no revision.

**Order.** World speakers by `contributions`, most first; then Ooga Chat speakers, the visitor first; then listeners,
the visitor first; names alphabetical (lowercased display name) within each, the `id` breaking ties. Mic, speaking
and hand changes never reorder.

**The island's panel.** The cloud tab is last, after The Commons. Main Island and DSB Land buttons at the top, one
roster of speakers then listeners, the emoji bar, and a footer of the visitor's name, a fixed-width Mute or Unmute,
Join or Leave Voice and Sign out, all through the island's existing voice session. A speaker's portrait is ringed
green (`#22c55e`) from the island or purple (`#b18aff`) from Ooga Chat; listeners have no ring, and rows carry no
other dot. Listeners appear only in this panel, never as characters in the world. Bridging the outdoor voice and the
app speakers' playback is #661; cloud speakers in the world are #659. `?debug=1&audience=fixture` shows a generated
roster of named samples for review and sends nothing.

## Fixtures

`fixture.html?state=` picks the canned answers: `signed-out`, `listener` (an X account, listening), `contributor` (a
GitHub contributor who may speak, with the five tabs), `demo-payment` (feed answered in demo mode) and `unavailable`.
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
| `fixture.html`, `js/ooga-chat-fixture-<hash>.js` | with `--fixtures` only |
| `404.html` | sends any unknown address home, without script |
| `_headers` | the policy and security headers on every path, `no-cache` on the entry, a year on every hashed file |
| `build.json` | the build identity, the script list, every file's bytes and gzipped bytes, and the first-load total |

It refuses to stage into the repository root, `src/`, `_site/`, `untracked/site/`, `cards/`, `worker/`, `scripts/`,
`test/` or `docs/`, and into any non-empty folder without its own `build.json`, so the app and the island's artifacts
cannot overwrite one another.

## Content policy

`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none';
form-action 'none'`, with `frame-ancestors 'none'` added in `_headers`. The page has no inline script, style or
handler (the build checks), no remote font, script or CDN, and uses the native monospace stack. `connect-src 'self'`
covers the same-origin API and a same-origin WebSocket. WebRTC media is not governed by `connect-src`; the SFU is
reached through the backend's same-origin paths, as the island's voice is. `Permissions-Policy` allows the microphone
to the page's own origin only.

## Size

Measured from the staged foundation: a first visit is 4 requests (`index.html` 1.1 KB, script 29.8 KB, stylesheet
11.9 KB, sign-in picture 57.9 KB): about 101 KB, 71 KB gzipped. For comparison, the island's portable page is about
39.7 MB (23 MB gzipped). The app loads no 3D engine, terrain, cabinets, replays or live feeds. `FIRST_LOAD_BUDGET` in
the build (96 KB gzipped) fails a build that grows past it; raise it deliberately, with the reason, when a later issue
adds weight.

## Artwork

`src/ooga-chat/art/sign-in-island.jpg` (430x287, 3:2) is a stand-in cropped from the issue's design capture. Replace
it with the approved original under the same name; the build re-hashes it and the views need no change.

## Rollout and rollback

This foundation authorizes no deployment. When the owner deploys (#662), the Worker for `ooga.chat` serves the staged
folder. The rollout switch is the bootstrap's `features`, which the server owns: with a feature off, the page shows it
disabled. Rolling back is redeploying the previous staged folder, identified by its `build.json`. Hashed files are
immutable, and a page left open keeps its own script, so an old tab keeps working until it reloads.
