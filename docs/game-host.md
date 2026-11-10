# Games the Worker hosts

Some games run on the server rather than on one player's page: the Worker hosts each one in a Durable Object of its
own, and every page in it follows. The first is the arcade's ghost hunt (HALLOWEEN). The rest of the island stays on
the room (`docs/auth-and-presence.md`): presence, voice, chat, nameplate poses and the visual shot relay. None of a
hosted game's traffic passes through it.

## Why a game is hosted

The room used to elect one player's page to run the ghost hunt and relay its state to the others. That page was
trusted with everything. The others reported their own hits as a target and a number, which the host took as told. A
hunt also stalled when its host's tab hid, and was lost when the host left. Hosted on the server, the rules run in one
place no page controls, every hit is decided there, and a busy hunt costs the room nothing.

## Kinds, venues and instances

`worker/src/games.js` is the registry. A *kind* is one game's rules and limits; a *venue* is a place it is played.
Each kind and venue is one Durable Object, `GAMES.idFromName("<kind>:<venue>:v<version>")`.

- **Only listed names reach an object.** `/game/<kind>/<venue>` reaches an object only for a kind and venue the
  registry lists, so no page makes one.
- **Moving an instance takes a new version.** An object stays where it was first made, so bumping `version` is how
  an instance moves.
- **Where it is made.** `GAME_LOCATION_HINT` (a region such as `enam`) says where a new object is made. Without it,
  it is made near whoever connects first. Production sets `enam`; staging leaves it unset.

The ghost hunt is kind `ghost-hunt` at the venue `arena`: one arena, one hunt at a time, as the arcade has. More arenas
or private hunts would be more venues, or match tickets a matchmaker signs; neither exists yet.

A kind, in `games.js`:

| Member | What it is |
|---|---|
| `id`, `code`, `version`, `venues` | its name, its code in motion frames, its objects' version, where it is played |
| `tickMs`, `stateEvery` | how often it steps, and how many steps between whole states |
| `limits` | `sockets` an instance takes, `chars` a message may be |
| `buckets`, `bucketOf(t)` | each message type's token bucket (`rate` a second, `burst`) |
| `parse(message)` | a page's message as the kind reads it: false closes the socket, null ignores the message |
| `create(now)` | one instance's game: `join`, `leave`, `message` (true when the state should go out now), `step(now)` (true on a change), `running`, `state`, `motion(frame, now)`, `save` (null once it has run down), `restore(data, now)` |

## The route

`handleGame` in `worker/src/index.js` handles `/game/<kind>/<venue>`. It is in `run_worker_first`.

- **Checks.** It requires a WebSocket upgrade from the site's own origin, a name the registry lists (404 otherwise,
  before any session lookup), and a session whose account owns an Ooga.
- **Limit.** `GAME_LIMITER` allows 20 connections a minute per account.
- **Identity.** It strips any `x-player-*` and `x-game-name` a client sent and sets its own, as the room's route does.

`/api/me`'s `games` lists the kinds the Worker hosts when the `GAMES` binding exists. The page reads it into
`net.state.games` and follows only what is listed.

## The host

`worker/src/game-host.js`, class `GameHost`:

- **Sockets.** Hibernatable sockets keep `{ id, login, display, name }` in their attachment, so a woken object knows
  its game and players.
- **One per account.** A newer socket kicks the older with `replaced`; past `limits.sockets` a socket is kicked
  `full`.
- **Messages.** A page sends JSON text of at most `limits.chars`. Anything else, or anything `parse` refuses, closes
  the socket with 4400. Each message type spends its own bucket (protocol.js `takeToken`).
- **The tick.** A setTimeout chain runs only while the game says it runs, at most four of its fixed steps a call. An
  idle instance has no timer and hibernates, billed only while awake.
- **What goes out.** Every tick sends the motion frame. The whole state (`{ t: "state", now, s }`) goes every
  `stateEvery` ticks and at once on a change; a page joining gets `welcome { you, kind, now, tickMs }` and the state
  at once.
- **Saving.** While the game runs, its record is saved every 5 s and on each change. A restarted object (every deploy
  restarts every object and drops every socket) picks the game up if the record is under 10 minutes old, and deletes
  it otherwise. A game that has run down deletes its record, and an alarm set with the first save deletes one left
  older than that.
- **Debug.** `GAME_DEBUG_IDS` (account ids, comma-separated, for staging) marks accounts the kind may let pause a game
  or start it past its first round.

The page's side is `src/js/game-net.js`:

- **Opening.** `gameNet.open(kind, venue, { state, motion })` gives a link.
- **Staying connected.** The link reconnects with net.js's backoff, lets go after five minutes hidden, and comes back
  when the tab is shown.
- **Clock.** It keeps the server's clock from the fastest trip's stamp (`serverNow`, good once `synced`).
- **Sending and stopping.** It sends JSON text. A kick stops it for good and says why (`refused`).

## The motion frame

`src/js/game-wire.js` is shared unchanged by the page and the Worker. All values are little-endian.

| Part | Layout |
|---|---|
| Header | magic `OGM1` (u32), kind code (u8), format (u8), row count (u16), server time (f64, ms), game time (f64, ms), confirmation count (u16) |
| Each row | type (u8), slot (u8), id (u16, its low 16 bits), x, y and z (i16, in centimetres about the game's middle), heading (u8, of a whole turn), flags (u8) |
| Each confirmation | shooter (u32), round number (u16), target (u16), damage (u8), flags (u8) |

`decode` refuses anything that is not a whole frame of this format.

## The past: interpolation and rewind

`src/js/game-timeline.js`, also shared, keeps a game's last moments as whole tables of rows (`push(t, rows)`).

- **Row layout.** Each row's first number is the id of what stands in its slot, and its last is that thing's flags
  (0 for an empty slot).
- **Sampling.** `sample(t, out)` eases the positions between the two moments either side of `t` where the same id
  stands in the slot at both. Otherwise it takes the nearer moment's row, and it clamps to the moments kept.

The server keeps one to rewind a shot to the moment its shooter's page showed. A page keeps one to draw the game a
little behind the server's newest, smoothly between ticks.

## The ghost hunt

`worker/src/games/ghost-hunt.js` (HALLOWEEN) runs the page's own rules, `src/js/ghost-sim.js`, unchanged, on the
server's clock. They now include the arena (`ARENA`, which the suite checks against the arcade's) and what a shot
meets.

**Presence.**
- A page in the arena sends where its player stands: about the arena's middle, at most ten times a second, and once
  a second while still.
- Each tick presents every player whose pose is under 3 s old and inside the arena.
- A pose that jumps farther than an Ooga runs makes its player absent for half a second.
- Only a player standing in the arena may wake the herald or ready up.
- A page that drops and comes back keeps its place in the hunt.

**Shots.** A page sends each rifle round as `{ t: "shot", q, at, o, d, l, h }`: its number, the hunt time the page
showed, its origin and direction, how far it went, and the ids the page saw it and the two monkeys' rocks meet (-1
for none). A bash is `{ t: "bash", q, at, h }`. The server takes a round only when:

1. **The shooter may fire.** The shooter is in the hunt, standing, during a fight, and within the rate (12 a second,
   a burst of 6).
2. **The origin fits.** The round leaves from within 1.5 m of where the shooter's page last said they stand, plus as
   far as they could have run since.

It then decides the hit:

1. **Rewind.** It takes the target table back to `at`, at most 600 ms back, with its 16 ticks of history.
2. **Find the target.** The rules' own test (`resolveShot`) takes the page's target if the line passes within 0.3 m of
   its ball. Otherwise it takes the nearest ball the line enters within 0.15 m.
3. **Land it.** The hit lands with the rules' damage (`shotDamage`, halved while an hourglass stands). A page's own
   number never counts.
4. **Monkeys.** A hunter's monkeys fire from where the rules have them (`monkeyOrigin`, `monkeyAim`).
5. **Bash.** A bash meets what is just in front of its hunter (`resolveBash`), for 4.

Each landed round goes back in the next motion frame's confirmations.

**What pages show.**
- The whole state goes out four times a second, and every enemy's place every tick.
- A following page draws enemies 120 ms behind the server's newest motion, eased between ticks (ghost-game.js
  `smooth`), and shifts the hunt's own clock back by as much. What it shows is a moment the server can rewind a shot
  to.
- A page shows its predicted hits at once (the number, the sound and the flash), but kills and health come from the
  server's state.
- A page alone (signed out, or with no backend) runs the same rules itself.

**What stays the page's own.** The server checks movement only for plausibility, so a page could still lie about
where its player stands. The page also decides how far its round went before scenery stopped it: the server keeps
that length only for aiming the monkeys and tests the round's whole reach, through the totems too.

## Cost

Measured in Node, a four-player hunt's rules take 0.03 ms a tick, about 0.5 ms of CPU a second. Durable Object CPU is
not billed. Messages a page sends are billed at 20 to 1 and those it receives are free; an object is billed only
while it is awake. A four-player hunt is about 12,000 billed requests an hour. The room's own load drops, since it no
longer relays the hunt.

## Privacy

While a hunt runs, its object's storage holds the hunt as the rules snapshot it, which includes its players' numeric
account ids. The record is deleted when the hunt ends. An alarm set with its first save deletes one left 10 minutes
past its last save, even if nobody comes back to wake the object.
