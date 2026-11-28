// The island's world on the page (docs/island-world.md): every Ooga nobody drives goes where the island's world puts
// it. Signed in, and offered the `island` game by the Worker, the page follows the server's world (worker/src/games/
// island.js, over game-net.js); otherwise it runs the same world itself (island-sim.js), from this page's own
// contributors. Either way the rows go into one timeline and are drawn a little behind the newest, eased between
// frames, as the ghost hunt draws its enemies.
//
// The server's frames are kept by the moment the world's rows stand for (`gameMs`, the world's own clock in whole
// steps), never by the tick that sent them, which runs up to a step ahead of the world and comes late as the object's
// timer pleases: drawn by those stamps, every walker sped up and slowed down from one frame to the next. They are drawn
// on a play clock this page runs at its own frame rate, kept `delay` behind the newest it could have by now: as far
// behind as the gaps between frames and how unevenly they arrive need (`heard`), so the next frame is nearly always in
// before it is wanted, and eased toward where it should be a little at a time (`SLEW`) rather than jumped.
//
// A working or chilling Ooga the world shows is followed: its `follow` (where it stands, its heading, what it does and
// the cave it works) is written here before the crew's update, and the crew poses it as it poses its own (crew.js
// `runFollow`), gear and lines and all. Every other Ooga takes the world's state (`worldState`, which crew.js
// `stateOf` reads first), so the page's own crew beds a sleeper and hides the away as it always has; one taken out of
// bed is beamed to its routine (`refreshStates`) before it is followed. Each working Ooga's gorilla is told the cave
// it goes ahead to when that changes (`clankers.plan`).
//
// On for every visit; `?islandworld=0` turns it off, and then the room's browser host (npc-sync.js) carries the crew
// as before. While it runs, the hub leaves that host's crew be.
(() => {
  "use strict";
  const BL = window.BL;
  const SIM = BL.islandSim, W = BL.gameWire, TIMELINE = BL.gameTimeline;
  const { ACT, STATES } = SIM;
  // A row in the timeline: the Ooga's id, x, z, its heading's cosine and sine, its gorilla's cave plus one, flags.
  const WIDTH = 7, DEPTH = 24, LOCAL_DELAY_MS = 2 * SIM.STEP * 1000, ACTIVITY_S = 1, REFRESH_S = 0.5, SEED_S = 2;
  // The server's play clock: the last `HEARD` frames' leads (their world time less when they came) and gaps; the delay
  // never under `DELAY_MIN_MS` or over `DELAY_MAX_MS`, `MARGIN_MS` over what they need, rising at once and easing back
  // at `EASE_MS_S` a second; a gap over `GAP_MAX_MS` is the world resting (a frame every 2 s while nothing moves), which
  // needs no delay. The clock runs at most `SLEW` faster or slower than real time, and jumps only past `SNAP_MS` out.
  const HEARD = 40, DELAY_MIN_MS = 180, DELAY_MAX_MS = 600, MARGIN_MS = 40, EASE_MS_S = 25, GAP_MAX_MS = 500, SLEW = 0.08, SNAP_MS = 1000;

  const enabled = () => !/(?:^|[?&])islandworld=0(?:&|$)/.test(location.search.slice(1));
  // The account this page was kicked from the server's world as, if it was, for the page's life: it stays on its own
  // world, however often the hub builds its world again, until the account changes, or two tabs of one account would
  // keep taking the world from each other.
  let kickedAs = null;

  const create = ({ crew, clankers = null, contributors = BL.contributors, platform = null, net = BL.net }) => {
    // The cast the world runs: every roster Ooga but a guest's own likeness, in the crew's order.
    const caves = crew.list.filter((cave) => !cave.avatar), byName = new Map(caves.map((cave) => [cave.traits.name, cave]));
    const n = Math.min(caves.length, W.MAX_ROWS);
    const timeline = TIMELINE.create({ slots: n, width: WIDTH, depth: DEPTH, lerp: [1, 2, 3, 4] });
    const table = new Float64Array(n * WIDTH), shown = new Float64Array(n * WIDTH);
    const slots = new Array(n).fill(null), plans = new Int16Array(n).fill(-1);
    let link = null, sim = null, frame = null, activityIn = 0, live = false, refresh = false, refreshIn = 0, age = 0, unseeded = 0;
    // When each Ooga went to the local world, in its clock's ms (Infinity before): its rows before then are not its.
    const seededAt = new Float64Array(n).fill(Infinity);
    const stats = { mode: "", frames: 0, followed: 0, refused: "", delay: 0, behind: 0 };
    const leads = new Float64Array(HEARD), gaps = new Float64Array(HEARD);
    let heardCount = 0, heardHead = -1, lastGame = NaN, play = NaN, delay = DELAY_MIN_MS, ranAt = NaN;
    const resetClock = () => { heardCount = 0; heardHead = -1; lastGame = NaN; play = NaN; delay = DELAY_MIN_MS; ranAt = NaN; };

    // A frame's rows into the timeline at `t` (ms), in the slots the cast puts them.
    const take = (f, t) => {
      table.fill(0);
      for (let i = 0; i < f.count && i < n; i++) {
        const r = f.rows, k = i * 8, o = i * WIDTH;
        table[o] = r[k + 2]; table[o + 1] = r[k + 3]; table[o + 2] = r[k + 5];
        table[o + 3] = Math.cos(r[k + 6]); table[o + 4] = Math.sin(r[k + 6]); table[o + 5] = r[k + 4]; table[o + 6] = r[k + 7] + 1;
      }
      timeline.push(t, table);
      stats.frames++;
      live = true;
    };
    // The cast in row order. The server sends it again every few seconds; only a changed one starts the timeline afresh,
    // or every resend would stop the crew until the next frame.
    const cast = (names) => {
      let changed = false;
      for (let i = 0; i < n; i++) {
        const cave = i < names.length ? byName.get(names[i]) || null : null;
        if (slots[i] !== cave) { slots[i] = cave; changed = true; }
      }
      if (changed) { timeline.clear(); live = false; }
    };
    // The page's own world: signed out, not offered the game, or kicked from it. It starts from where the crew
    // stands, as `activity` hands each Ooga over.
    const startLocal = () => {
      stats.mode = "local";
      sim = SIM.create({ seed: (Math.random() * 0x100000000) >>> 0 });
      sim.setCast(caves.slice(0, n).map((cave) => ({ name: cave.traits.name, maintainer: !!cave.traits.maintainer })));
      frame = W.frame();
      cast(caves.slice(0, n).map((cave) => cave.traits.name));
      timeline.clear(); live = false;
      seededAt.fill(Infinity); unseeded = n; age = 0; activityIn = 0;
    };

    // The server's world, for a signed-in page the Worker offers it to.
    const startServer = () => {
      stats.mode = "server";
      sim = null;
      timeline.clear(); live = false; resetClock();
      link = BL.gameNet.open("island", "main", {
        state: (msg) => { if (msg.s && Array.isArray(msg.s.cast)) cast(msg.s.cast); },
        motion: (f) => { if (f.kind === SIM.KIND && slots.some(Boolean)) heard(f); }
      });
    };
    // A server frame, kept by its world time. One no newer than the last is a repeat, unless it is far older: the
    // world started afresh (its object restarted), and the page starts with it.
    const heard = (f) => {
      const g = f.gameMs, now = performance.now();
      if (lastGame === lastGame && g <= lastGame) {
        if (g > lastGame - SNAP_MS) return;
        timeline.clear(); live = false; resetClock();
      }
      const gap = lastGame === lastGame ? g - lastGame : 0;
      lastGame = g;
      heardHead = (heardHead + 1) % HEARD;
      leads[heardHead] = g - now; gaps[heardHead] = gap <= GAP_MAX_MS ? gap : 0;
      if (heardCount < HEARD) heardCount++;
      take(f, g);
    };
    // The world time to draw this frame. The newest frame there could be by now is the soonest one's lead on: the next
    // comes a gap after it and as much later as the leads spread, so the delay covers the widest gap and that spread.
    // The clock moves by the real time since it last ran, never the scene's `dt`, which the director caps at 0.1 s: under
    // 10 fps the Oogas would walk slow and then jump.
    const serverClock = () => {
      const now = performance.now(), step = ranAt === ranAt ? now - ranAt : 0;
      ranAt = now;
      let lead = -Infinity, low = Infinity, gap = 0;
      for (let k = 0; k < heardCount; k++) {
        const v = leads[k];
        if (v > lead) lead = v;
        if (v < low) low = v;
        if (gaps[k] > gap) gap = gaps[k];
      }
      const need = Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, gap + lead - low + MARGIN_MS));
      delay = need > delay ? need : Math.max(need, delay - EASE_MS_S * step / 1000);
      const target = now + lead - delay;
      if (!(Math.abs(target - play) < SNAP_MS)) play = target;
      else {
        play += step;
        const err = target - play, most = SLEW * step;
        play += err > most ? most : err < -most ? -most : err;
      }
      stats.delay = delay; stats.behind = lastGame - play;
      return play;
    };
    const offered = () => {
      const id = net.state.me ? net.state.me.id : null;
      if (kickedAs !== null && id !== kickedAs) kickedAs = null;
      return !!BL.gameNet && BL.gameNet.offers("island") && id !== kickedAs;
    };
    // On every account change: signed out, the page runs the world itself from where the crew stands; signed in (or
    // in late, after a failed first look), it follows the server's.
    const reconcile = () => {
      const want = offered();
      if (want && !link) startServer();
      else if (!want && link) { link.close(); link = null; startLocal(); }
    };
    if (offered()) startServer(); else startLocal();
    const unsubscribe = net.subscribe(reconcile);
    // A local world's states and caves, as the page's own crew reads them (contributors.js `stateFor`, crew.js
    // `siteActive`, whose caves are the layout's in the same order), once a second. An Ooga the crew shows goes to the
    // world only once the crew has placed it, with where it stands (`place`), so the world takes it up from there
    // rather than beaming it; one the crew has not placed within `SEED_S` goes anyway.
    const activity = () => {
      const at = Date.now(), sites = crew.workSites || [];
      for (let i = 0; i < n; i++) {
        const cave = caves[i], state = contributors.stateFor(cave.contributor, at);
        if (seededAt[i] === Infinity) {
          const shows = state === "working" || state === "chilling", placed = cave.root.visible && !cave.bedTravel.mode;
          if (shows && !placed && age < SEED_S) continue;
          if (shows && placed) sim.place(cave.traits.name, cave.root.position.x, cave.root.position.z, cave.root.rotation.y);
          seededAt[i] = (sim.t + 2 * SIM.STEP) * 1000; unseeded--;
        }
        let mask = 0;
        for (let s = 0; s < sites.length; s++) if (crew.siteActive(cave, sites[s])) mask |= 1 << s;
        sim.setActivity(cave.traits.name, state, mask);
      }
      if (platform) sim.setPile(platform());
    };

    const unfollow = (cave) => {
      if (cave.follow) { cave.follow = null; cave.followAct = -1; }
    };
    /** Once a frame, before the crew's update: the world's rows into each Ooga's `follow` and `worldState`. */
    const update = (dt) => {
      // Kicked for good (another tab of this account took the world, or it is full): the page runs it itself from here,
      // as it would signed out, rather than holding the crew where the last frame left it.
      if (link && link.state === "refused") {
        stats.refused = link.refused; kickedAs = net.state.me ? net.state.me.id : null;
        link.close(); link = null; startLocal();
      }
      if (sim) {
        age += dt;
        // Every frame until each Ooga has gone to the world, then once a second.
        if ((activityIn -= dt) <= 0 || unseeded > 0) { activityIn = ACTIVITY_S; activity(); }
        const before = sim.t;
        sim.step(dt);
        if (sim.t !== before) { sim.motion(frame, 0); take(frame, sim.t * 1000); }
      }
      // The local world steps 20 times a second; drawn by `t` alone, every Ooga would stand still for frames and then jump.
      // The server's play clock runs on while the timeline is refilled, so it never comes back to a stale one.
      const at = sim ? sim.clock * 1000 - LOCAL_DELAY_MS : heardCount ? serverClock() : NaN;
      if (!live || at !== at) return;
      if (Number.isNaN(timeline.sample(at, shown))) return;
      let followed = 0;
      for (let i = 0; i < n; i++) {
        const cave = slots[i], o = i * WIDTH;
        if (!cave || !shown[o + 6] || sim && at < seededAt[i]) continue;
        const flags = shown[o + 6] - 1, act = flags & 7, state = STATES[flags >> 3 & 3], site = (flags >> 5) - 1;
        const plan = Math.round(shown[o + 5]) - 1;
        if (plan !== plans[i]) { plans[i] = plan; if (plan >= 0 && clankers) clankers.plan(cave, plan); }
        if (cave.worldState !== state) { cave.worldState = state; refresh = true; }
        const shows = act !== ACT.HIDDEN && (state === "working" || state === "chilling");
        if (!shows) { if (cave.follow) { unfollow(cave); refresh = true; } continue; }
        // Out of bed, or another state, first: the crew beams it to its routine, then it is followed.
        if (!cave.follow && (cave.state !== state || cave.bedTravel.mode)) { refresh = true; continue; }
        if (cave.state !== state) { cave.state = state; crew.refreshRosterRow(cave); }
        const f = cave.follow || (cave.follow = { x: 0, z: 0, heading: 0, act: 0, site: -1 });
        f.x = shown[o + 1]; f.z = shown[o + 2]; f.heading = Math.atan2(shown[o + 4], shown[o + 3]); f.act = act; f.site = site;
        cave.root.visible = true;
        followed++;
      }
      stats.followed = followed;
      // At most every REFRESH_S: an Ooga the crew cannot place yet asks again then, not every frame.
      if ((refreshIn -= dt) <= 0 && refresh) { refresh = false; refreshIn = REFRESH_S; crew.refreshStates(true); }
    };
    const dispose = () => {
      unsubscribe();
      if (link) link.close();
      link = sim = null;
      for (const cave of caves) { unfollow(cave); cave.worldState = null; }
      crew.refreshStates(true);
    };
    return { update, dispose, stats, get live() { return live; }, get link() { return link; }, get sim() { return sim; } };
  };

  BL.islandWorld = { enabled, create };
})();
