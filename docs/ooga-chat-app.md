# Ooga Chat app

Ooga Chat is a standalone, mobile-first page for `ooga.chat` (#650): authenticated listeners hear the outdoor
conversation in Ooga Booga Land, and verified GitHub contributors can speak from a cloud. It lives in this repository
as its own entry, build and output, and shares the island's native look and components without loading the island.

This document covers the foundation (#651): the entry, the build, the shell, the configuration contract and the
fixture entry; and sign-in (#652): the session contract, the sign-in return and the account lifecycle. The roster and controls (#653), voice (#654), reactions (#655), the shared panels and
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
| `src/ooga-chat/ooga-chat-shell.js` | `BL.oogaChatShell`: the tabs and the views they keep |
| `src/ooga-chat/ooga-chat-views.js` | `BL.oogaChatViews`: the Ooga Chat view, the account footer, faces and the stand-ins for the shared panels |
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

`sign-glyphs.js`, `native-icons.js`, `ooga-chat-config.js`, `ooga-chat-auth.js`, `ooga-chat-shell.js`, `ooga-chat-views.js`,
`ooga-chat-http.js`, then (fixture entry only) `ooga-chat-fixtures.js`, then `ooga-chat-app.js`. The build checks that
`fixture.html` loads exactly `index.html`'s files plus the fixtures, just before the app.

**Adapter.** `{ kind, bootstrap(), session(boot), signIn(boot, provider), signOut(boot), dispose() }`. `bootstrap`
resolves to a parsed bootstrap (below), never throws. `session` resolves to a parsed session or `null` for signed
out, and throws for any other failure, which the app shows as a recoverable error. `signIn` navigates (production)
or returns a session (fixtures). `signOut` resolves only when the server confirms and throws otherwise. `dispose`
aborts what is still in flight.

**Shell.** `create({ root, tabs, ctx, selected, onSelect })` returns `{ update(state), select(id), dispose() }`. A
tab is `{ id, label, icon, visible(state), view }`. A view is `view(ctx)` returning `{ node, update(state), dispose() }`:
built the first time its tab is chosen, then kept. Switching tabs hides it, and `update` passes it the new state, so
a view's own nodes and listeners (a sort, a draft, a voice control) survive both. `dispose` is the only teardown.

**State.** `{ mode, boot, session, auth, notice, busy, zone }`, `mode` being `loading`, `live`, `unavailable` or
`stale`, and `auth`, `notice` and `busy` the account's (below). `zone` is the saved outdoor zone, `main` or `dsb`.
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

## Fixtures

`fixture.html?state=` picks the canned answers: `signed-out`, `listener` (an X account, listening, whose handle and
answer both claim to be a contributor's), `contributor` (an eligible GitHub contributor, with the five tabs),
`ineligible`, `unknown` and `revoked` (GitHub accounts the server does not let speak), `provider-disabled` (X sign-in
off), `expiring` (a contributor whose session ends 20 s after load), `signout-fails` (the server never confirms a
sign-out), `demo-payment` (feed answered in demo mode) and `unavailable`. Signing in with GitHub lands on the state's
own kind of account, and with X on the X listener. A return can be tried by adding `&signin=denied&provider=github`.
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

Measured from the staged app with sign-in (#652): a first visit is 4 requests (`index.html` 1.1 KB, script 51.3 KB,
stylesheet 13.6 KB, sign-in picture 57.9 KB): about 124 KB, 78 KB gzipped (the foundation alone was 71 KB). For comparison, the island's portable page is about
39.7 MB (23 MB gzipped). The app loads no 3D engine, terrain, cabinets, replays or live feeds. `FIRST_LOAD_BUDGET` in
the build (96 KB gzipped) fails a build that grows past it; raise it deliberately, with the reason, when a later issue
adds weight.

## Artwork

`src/ooga-chat/art/sign-in-island.jpg` (430x287, 3:2) is a stand-in cropped from the issue's design capture. Replace
it with the approved original under the same name; the build re-hashes it and the views need no change.

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
- Profile pictures on the app's origin (proxied or stored, `img-src 'self'`), at a path that changes when the picture
  does, so a face is never another principal's.

## Rollout and rollback

This foundation authorizes no deployment. When the owner deploys (#662), the Worker for `ooga.chat` serves the staged
folder. The rollout switch is the bootstrap's `features`, which the server owns: with a feature off, the page shows it
disabled. Rolling back is redeploying the previous staged folder, identified by its `build.json`. Hashed files are
immutable, and a page left open keeps its own script, so an old tab keeps working until it reloads.
