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
