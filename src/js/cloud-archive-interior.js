// One visit to the Cloud Archive (scene-cloudarchive.js), climbed into up the island's beanstalk. The Ooga arrives at
// the foot of a shaft under the cloud floor and climbs the stalk on the crew's own ladder (W/S, A/D, Space jumps off)
// up into a white room without walls, where one dark rack a day of the game's history stands down a long aisle, a
// book a commit (cloud-archive-models.js, cloud-archive-data.js). Space (or the READ button) facing a shelf, a tap
// on a rack or its plaque opens that day's board: its commits, PR-head matches and their authors as git recorded
// them, with links out to GitHub; the arrows page through the days. At the far end, two armchairs (Space or SIT) face
// a small TV playing the island's live feeds (all but GitHub, which is the sign's) and pictures of its places, on
// shuffle (cloud-archive-tv.js).
// Over the aisle hangs the island's own Oogatron (jumbotron.js), live as the hub's and two-sided, gliding along the
// aisle to stay near the walker: a tap on its screen, or Space (READ) looking along the aisle at it, opens the same
// close-up; its sides page it. On a page's first climb the floor is bare but for the sign and the lounge: Space (LOAD)
// rolls the racks in out of the white down both sides, to a synthesized cue (cloud-archive-audio.js).
//
// The way home is always deliberate: climbing all the way down the stalk, Space (ISLAND) at its foot once the Ooga has
// been up, Leave, or Escape. Falling into the shaft only leaves the Ooga at its foot, where it can climb back up. Any
// way out hands the same Ooga back to the island beside the beanstalk, which stands from then on.
//
// Solo for now: no presence, poses or voice. The Ooga walks empty-handed and without a jetpack, as in the Sphere.
(() => {
  "use strict";
  const BL = window.BL;
  const { contributors, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod } = BL;
  const { clamp } = BL.math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const DATA = BL.cloudArchiveData, CM = BL.cloudArchiveModels, L = CM.LAYOUT, S = L.SHAFT, RACK = L.RACK;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  const NO_JETPACK = { owned: false, equipped: false, fuel: 1, blocked: false };
  const REPO_URL = `https://github.com/${DATA.repo}`;
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  // What keeps the director's full rate while the window is unfocused (director.js `frameInterval`): only what moves
  // by itself. The racks rolling in on LOAD, the hanging Oogatron gliding to its place, the TV's snow between
  // channels, a scene tween (the turn into a chair) and live particles. An idle visit (standing, reading, watching
  // the TV hold a channel) moves nothing without input, so it may be throttled. Reduced motion places the racks and
  // the sign at once, so neither counts there.
  const inMotion = (m) => m.train || m.glide || m.snow || m.tweens > 0 || m.fx;
  // White everywhere: the clear colour, sky and ground light all near white, a soft key light and little bloom.
  const RENDER_OPTS = {
    clear: [0.95, 0.955, 0.965], sky: [0.98, 0.98, 1], ground: [0.86, 0.87, 0.9], horizon: [0.95, 0.955, 0.965], zenith: [0.97, 0.975, 0.985],
    direct: [0.6, 0.6, 0.62], directStrength: 0.25, ambientFloor: 0.78, sun: [0, 0, 0], light: { x: 0.3, y: 0.9, z: 0.2 },
    shadowCenter: { x: 0, y: 1, z: -10 }, shadowExtent: 30,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 0.2
  };
  // The TV's channels and shuffle are cloud-archive-tv.js's. A chair is sat in from within SIT_REACH of its edge, facing it; the
  // sitter sits SEAT_Y up and stands up SEAT_BACK behind it, room enough past the chair's 0.5 m solid for the widest Ooga
  // (as the Sphere's chairs leave): any closer and the crew refuses the seat for a wide body, and Space jumps instead. A shelf is read from within READ_REACH of its front,
  // facing it within READ_FACING; ISLAND is offered within FOOT_REACH of the stalk at the shaft's foot.
  const SIT_REACH = 0.5, SIT_FACING = Math.cos(0.8), SEAT_Y = 0.5, SEAT_BACK = 1.35;
  // Anywhere within LOUNGE_REACH of the point between the chairs offers one; nearer by less than SEAT_TIE is a tie.
  const LOUNGE_REACH = 2.6, SEAT_TIE = 0.15, SEAT_KEEP = 0.6;
  const READ_REACH = 1.4, READ_FACING = 0.45, FOOT_REACH = 1.8;
  // The hanging Oogatron is offered to Space from the aisle in front of it, within SIGN_REACH, looking down the aisle.
  const SIGN_REACH = 9, SIGN_FACING = 0.8;
  // LOAD: the racks wait out in the white past the lounge, TRAIN_RUN behind their places, and roll in down both sides
  // over TRAIN_SECONDS, braking to a stop, the right-hand line TRAIN_STAGGER behind the left.
  const TRAIN_SECONDS = 3.6, TRAIN_STAGGER = 0.3, TRAIN_RUN = 80;
  const ARRIVAL_PITCH = -0.35, BOARD_W = 960, BOARD_H = 600, PLAQUE_W = 512, PLAQUE_H = 128;
  // Authors are identities (GitHub accounts and unlinked contributors); automation, agents and
  // organisations are counted apart and never as people.
  const AUTHOR = { account: true, unconfirmed: true, unlinked: true };
  const dayStats = (day) => {
    let prs = 0, automation = 0, agents = 0, organisations = 0;
    const by = new Map();
    for (const c of day.commits) {
      if (c[3]) prs++;
      const kind = DATA.people[c[1]].kind;
      if (kind === "automation") automation++;
      else if (kind === "agent") agents++;
      else if (kind === "organisation") organisations++;
      if (AUTHOR[kind]) by.set(c[1], (by.get(c[1]) || 0) + 1);
    }
    const authors = [...by].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return { commits: day.commits.length, prs, automation, agents, organisations, authors, shelf: L.shelve(day.commits.length) };
  };
  const STATS = DATA.days.map(dayStats);
  // When, and against how many PR refs, the matches were read: they depend on that snapshot as well as on the revision.
  const REFS = DATA.provenance.pullRefs;
  const PULL_REFS = `${REFS.fetchedAt ? REFS.fetchedAt.slice(0, 16).replace("T", " ") + " UTC" : "from a saved list"} (${REFS.count} refs, digest ${REFS.digest.slice(0, 12)})`;
  // Labels are GitHub logins or the neutral "unlinked contributor" (never a git display name), as the data has them.
  const label = (p) => DATA.people[p].label;
  // Which authors' records the snapshot was built from, said on every board.
  const RECORDS = DATA.provenance.authorRecords, AUTHORS_NOTE = RECORDS.mode === "github"
    ? `Authors are the GitHub logins GitHub's records link each commit to (read ${RECORDS.readAt.slice(0, 10)}): its records, not proof of who owns an account today. "Unlinked contributor" marks a commit GitHub links to no account.`
    : `This build has no GitHub author records yet, so an account is shown only where a commit used a GitHub noreply address; every other author is an "unlinked contributor".`;
  // Text drawn as large as fits `width`, from `size` down to 14px.
  const fitText = (g, text, x, y, width, size, weight = 500) => {
    let px = size;
    do g.font = `${weight} ${px}px ${FONT}`; while (g.measureText(text).width > width && --px > 14);
    g.fillText(text, x, y);
  };
  const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
  const others = (s) => `${s.automation ? ` · ${s.automation} by automation` : ""}${s.agents ? ` · ${s.agents} by AI agents` : ""}${s.organisations ? ` · ${s.organisations} by organisations` : ""}`;
  const paintPlaque = (i) => {
    const canvas = document.createElement("canvas"), g = canvas.getContext("2d"), s = STATS[i];
    canvas.width = PLAQUE_W; canvas.height = PLAQUE_H;
    g.fillStyle = "#1d1f24"; g.fillRect(0, 0, PLAQUE_W, PLAQUE_H);
    g.fillStyle = "#e8b04a"; g.fillRect(0, PLAQUE_H - 6, PLAQUE_W, 6);
    g.fillStyle = "#ffffff"; g.font = `700 52px ${FONT}`; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillText(DATA.days[i].date, PLAQUE_W / 2, 62);
    g.fillStyle = "#c9ccd3";
    const line = `${plural(s.commits, "commit")} · ${plural(s.prs, "PR-head match", "PR-head matches")} · ${plural(s.authors.length, "author identity", "author identities")}`;
    fitText(g, s.shelf.overflow ? `${line} · ${s.shelf.overflow} in the binder` : line, PLAQUE_W / 2, 104, PLAQUE_W - 24, 26);
    return canvas;
  };
  // The day's board: date, counts, authors (with their shelf colour) and the commits, as many as the page holds; the
  // rest are a link away.
  const paintDay = (g, i) => {
    const day = DATA.days[i], s = STATS[i];
    g.fillStyle = "#f6f7f9"; g.fillRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle = "#1d1f24"; g.font = `700 34px ${FONT}`; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillText(longDate(day.date), 36, 56);
    g.fillStyle = "#5b606b"; g.font = `500 19px ${FONT}`;
    fitText(g, `${plural(s.commits, "commit")} · ${plural(s.prs, "PR-head match", "PR-head matches")} · ${plural(s.authors.length, "author identity", "author identities")}${others(s)}`, 36, 86, BOARD_W - 72, 19);
    let x = 36, y = 124;
    g.font = `600 18px ${FONT}`;
    for (const [p, n] of s.authors) {
      const text = `${label(p)} ${n}`, w = g.measureText(text).width + 34;
      if (x + w > BOARD_W - 36) { x = 36; y += 32; }
      if (y > 220) break;
      g.fillStyle = CM.personColor(p); g.fillRect(x, y - 16, 14, 20);
      g.fillStyle = "#1d1f24"; g.fillText(text, x + 20, y);
      x += w;
    }
    y += 40;
    g.fillStyle = "#d4d7dd"; g.fillRect(36, y - 24, BOARD_W - 72, 2);
    const list = day.commits, lines = Math.floor((BOARD_H - 24 - y) / 25);
    for (let n = 0; n < Math.min(list.length, lines); n++) {
      const c = list[n], kind = DATA.people[c[1]].kind;
      if (n === lines - 1 && list.length > lines) {
        g.font = `500 17px ${FONT}`; g.fillStyle = "#5b606b";
        g.fillText(`${list.length - n} more commits: follow this day's history link below`, 36, y);
        break;
      }
      g.fillStyle = kind === "automation" || kind === "agent" ? "#7a828c" : c[3] ? "#a8741a" : "#1d1f24";
      // "#n" before a commit is its PR-head match; the board's note says what that means.
      const head = `${c[0].slice(0, 7)}  ${c[3] ? `#${c[3]} ` : ""}`, who = label(c[1]);
      g.font = `600 17px ui-monospace, Menlo, Consolas, monospace`; g.fillText(head, 36, y);
      const hw = g.measureText(head).width;
      g.font = `500 17px ${FONT}`;
      let title = c[2];
      const room = BOARD_W - 72 - hw - g.measureText(` · ${who}`).width;
      while (title.length > 4 && g.measureText(title).width > room) title = title.slice(0, -2);
      if (title !== c[2]) title = title.replace(/\s*\S?$/, "…");
      g.fillText(`${title} · ${who}`, 36 + hw, y);
      y += 25;
    }
  };

  const create = (shell, ctx) => {
    const { renderer, game, world, go, canvas } = ctx;
    const camera = createCamera({ fov: 60, near: 0.12, far: 260 });
    const root = createNode();
    const hud = hudMod.create({ signal: ctx.signal, roster: contributors.activeRoster });
    const hooks = {};
    const input = interactMod.create({ canvas, renderer, camera, hooks });
    const built = CM.build();
    addChild(root, built.root);
    RENDER_OPTS.lightCount = 0;

    // Walking: inside the shaft while down it, else the floor within the bounds and clear of the racks.
    const B = L.bounds;
    // Walkers keep out of the racks' home places (`L.rackAt`, read once here into typed arrays, so a step allocates
    // nothing), not where a loading rack is passing, so a rack rolling in can never trap anyone.
    const RACK_X = new Float32Array(built.racks.length), RACK_Z = new Float32Array(built.racks.length);
    for (let i = 0; i < built.racks.length; i++) { const p = L.rackAt(i); RACK_X[i] = p.x; RACK_Z[i] = p.z; }
    const clearOfRacks = (x, z, r) => {
      for (let i = 0; i < RACK_X.length; i++) {
        if (Math.abs(x - RACK_X[i]) < RACK.d / 2 + r && Math.abs(z - RACK_Z[i]) < RACK.w / 2 + r) return false;
      }
      return true;
    };
    const walkable = (ax, az, bx, bz, y, height, actor) => {
      const r = actor && actor.bodyRadius || 0.35;
      if (y < -1.8) return L.inShaft(bx, bz, r * 0.6);
      if (!(bx > B.x0 && bx < B.x1 && bz > B.z0 && bz < B.z1 && clearOfRacks(bx, bz, r))) return false;
      for (let i = 0; i < L.solids.length; i++) { const o = L.solids[i]; if (Math.hypot(bx - o.x, bz - o.z) < o.r + r) return false; }
      return true;
    };
    const groundAt = (x, z) => L.inShaft(x, z) ? -S.depth : 0;
    const roof = () => 40;
    const clampTarget = (p) => {
      p.x = clamp(p.x, B.x0, B.x1); p.z = clamp(p.z, B.z0, B.z1);
      p.y = clamp(p.y, L.inShaft(p.x, p.z) ? -S.depth + 0.4 : 0.4, 30);
    };
    const clampCamera = (p) => {
      const x = p.x, y = p.y, z = p.z;
      p.x = clamp(p.x, B.x0 - 4, B.x1 + 4); p.z = clamp(p.z, B.z0 - 4, B.z1 + 4);
      // Below the floor the eye stays in the shaft while what it follows is down there too, pulled in toward the stalk
      // rather than lifted onto the floor; otherwise (the Ooga up on the floor) it is lifted out.
      if (p.y < 0.3 && camera.target.y > 0) p.y = 0.3;
      else if (p.y < 0.3) {
        if (!L.inShaft(p.x, p.z, 0.15)) { p.x = clamp(p.x, S.x0 + 0.15, S.x1 - 0.15); p.z = clamp(p.z, S.z0 + 0.15, S.z1 - 0.15); }
        p.y = Math.max(p.y, -S.depth + 0.3);
      } else p.y = Math.min(p.y, 34);
      return p.x !== x || p.y !== y || p.z !== z;
    };
    const keepCameraInside = () => {
      const p = camera.position, x = p.x, y = p.y, z = p.z;
      if (!clampCamera(p)) return;
      camera.target.x += p.x - x; camera.target.y += p.y - y; camera.target.z += p.z - z;
    };
    const view = { yaw: 0, pitch: 0.3, dist: 4, target: { x: L.arrival.x, y: -S.depth + 1.6, z: L.arrival.z } };
    const pilot = pilotMod.create({
      renderer, canvas, camera, hud, presets: { entrance: view }, landing: "entrance", pitch: [-0.4, 1.3], dist: [3, 10],
      follow: { y: 0.9, min: 3, max: 8, pitch: [0.15, 0.9] }, fly: { speed: 5, perDist: 0.4, climb: 3, yMax: 30 },
      clampTarget, clampCamera, observeOrbit: keepCameraInside, ceilingAt: roof, coarse: COARSE, mayPossess: (cave) => BL.net.mayDrive(cave.traits.name),
      jetpackStatus: () => NO_JETPACK,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt }
    });
    const fx = fxMod.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 4, z: 0 } });
    const targets = [];
    const target = (node, owner, radius = 0) => { input.add(node, owner, { radius }); targets.push(node); return owner; };

    // The plaques over the racks, each its own small canvas, and every rack a target for its day's board.
    const plaques = [];
    built.racks.forEach((rack, i) => {
      const plaque = createNode({ geometry: CM.plaque(paintPlaque(i), 1.6, 0.4), position: { x: 0, y: RACK.h + 0.3, z: RACK.d / 2 } });
      addChild(rack, plaque);
      plaques.push(plaque);
      target(rack, { kind: "rack", index: i }, 1.7);
      target(plaque, { kind: "rack", index: i }, 0.8);
    });
    target(built.stalk, { kind: "stalk" }, 1.2);

    // The two armchairs, each a seat facing the TV; standing up leaves it behind the chair.
    // The lounge: the point between the chairs, and how far from it a seat is offered.
    const LOUNGE = { x: (L.CHAIRS[0].x + L.CHAIRS[1].x) / 2, z: (L.CHAIRS[0].z + L.CHAIRS[1].z) / 2 };
    let offered = null;
    const seats = L.CHAIRS.map((c) => ({ kind: "chair", x: c.x, y: SEAT_Y, z: c.z, floor: 0, ry: c.ry, sitter: null,
      walkAt: { x: c.x - Math.sin(c.ry) * SEAT_BACK, z: c.z - Math.cos(c.ry) * SEAT_BACK } }));
    built.chairs.forEach((node, i) => target(node, { kind: "chair", index: i }, 0.7));

    // The island's Oogatron, hung over the aisle: the hub's own board (jumbotron.js), from the baked stats and then the
    // live poller's latest reading as the hub's is. Its rails page it where it hangs; its screen, or Space in front of
    // it, opens the same close-up as the island's.
    // Two-sided: a second board back to back with the first, on the same page as it (the front one rotates; a tap on
    // the back's rails pages the front). It glides along the aisle with the walker (`placeSign`; LAYOUT.SIGN says how).
    // The racks' load-in. Once a page has loaded the archive (`world.archiveLoaded`), later visits find them in place.
    const homes = built.racks.map((r) => r.position.z);
    const train = { loaded: !!world.archiveLoaded, t: -1, span: 0 };
    train.span = TRAIN_RUN + Math.max(0, homes[0] - homes[homes.length - 1]);
    const parkRacks = (left, right) => {
      for (let i = 0; i < built.racks.length; i++) built.racks[i].position.z = homes[i] - train.span * (i % 2 ? right : left);
    };
    if (!train.loaded) parkRacks(1, 1);
    const archiveAudio = BL.cloudArchiveAudio.create();
    const load = () => {
      if (train.loaded) return false;
      train.loaded = world.archiveLoaded = true;
      archiveAudio.play(REDUCED.matches ? 0.4 : TRAIN_SECONDS + TRAIN_STAGGER);
      if (REDUCED.matches) parkRacks(0, 0);
      else train.t = 0;
      hint("floor");
      return true;
    };
    const updateTrain = (dt) => {
      if (train.t < 0) return;
      train.t += dt;
      const left = Math.min(1, train.t / TRAIN_SECONDS), right = clamp((train.t - TRAIN_STAGGER) / TRAIN_SECONDS, 0, 1);
      parkRacks((1 - left) ** 3, (1 - right) ** 3);
      if (right >= 1) train.t = -1;
    };

    const SG = L.SIGN, SIGN_RAY = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 }, SIGN_HALF = SG.gap * SG.scale;
    const hang = (ry) => BL.models.withScope("cloudarchive", () => BL.jumbotron.create({ data: BL.jumbotronData, position: { x: SG.x, y: SG.y, z: SG.rest }, ry, scale: SG.scale, stand: false }));
    const sign = hang(0), signBack = hang(Math.PI);
    signBack.autoRotate(0);
    addChild(root, sign.node); addChild(root, signBack.node);
    target(sign.node, { kind: "sign", back: false, pickRay: (ray) => sign.pickRay(ray) }, 1.6);
    target(signBack.node, { kind: "sign", back: true, pickRay: (ray) => signBack.pickRay(ray) }, 1.6);
    let signZ = NaN, signGliding = false;
    const placeSign = (z) => {
      if (z === signZ) return;
      signZ = z;
      sign.node.position.z = z + SIGN_HALF; signBack.node.position.z = z - SIGN_HALF; built.ropes.position.z = z;
      sign.moved(); signBack.moved();
    };
    // Rests over the aisle's middle, never more than SG.range from the walker, within the aisle.
    const signGoal = (z) => clamp(clamp(SG.rest, z - SG.range, z + SG.range), SG.zMin, SG.zMax);
    const SIGN_GLIDE = 1.5;
    const updateSign = (dt) => {
      const z = avatar ? avatar.root.position.z : camera.target.z, goal = signGoal(z);
      placeSign(REDUCED.matches || Number.isNaN(signZ) ? goal : Math.abs(goal - signZ) < 0.001 ? goal : signZ + (goal - signZ) * Math.min(1, dt * SIGN_GLIDE));
      signGliding = signZ !== goal;
      if (signBack.index !== sign.index) signBack.goToView(sign.index);
    };
    // The Oogatron's floating board, as the hub's; `createReader` decides where a new window starts (the sign's own
    // page unless a TV pick names one).
    const signBoardWith = (createReader) => ({
      title: "Oogatron", help: "OogaBoogaX on the big screen. Arrow keys flip the boards.", note: "", floating: true,
      get canvas() { return sign.canvas; }, get count() { return sign.count; }, get index() { return sign.index; },
      get caption() { return sign.caption; }, get version() { return sign.version; },
      get paused() { return sign.paused; }, setPaused: (paused) => sign.setPaused(paused),
      createReader,
      go: (i) => sign.goToView(i)
    });
    const signBoard = signBoardWith((state) => sign.createReader(state));
    const openSign = () => hud.openBoard(signBoard);
    const signUnsub = BL.oogatronLive.subscribe((event) => { if (event.type === "stats") { sign.refreshData(event.stats); signBack.refreshData(event.stats); } });

    // The TV (cloud-archive-tv.js, its channels cloud-archive-channels.js): a channel guide to the island's live
    // systems, GitHub through a paused reader of the hanging board, and the pictures of its places from the climb
    // (`world.archiveViews`). Its canvas is the screen's picture; the screen's surface is bumped whenever it repaints.
    // A tap on the TV, the TV guide button or T opens the guide; a channel picked there opens its detail: the hanging
    // Oogatron's board for GitHub, else the TV's own board.
    const views = world.archiveViews ? world.archiveViews.filter((v) => v.ready) : [];
    const boardDialog = document.getElementById("board-modal");
    const tvReader = sign.createReader({ paused: true, screen: { name: "recent", params: undefined } });
    const tv = BL.cloudArchiveTv.create({ views, world, font: FONT, guide: document.getElementById("archive-guide"), signal: ctx.signal,
      reader: tvReader,
      reduced: () => REDUCED.matches, boardOpen: () => !!(boardDialog && boardDialog.open),
      onDetail: (channel) => openDetail(channel) });
    const tvGeometry = CM.plaque(tv.canvas, L.TV.screenW, L.TV.screenH);
    built.screen.geometry = tvGeometry;
    let tvShown = -1;
    const updateTv = (dt, elapsed) => {
      tv.update(dt, elapsed);
      if (tv.tv.version !== tvShown) { tvShown = tv.tv.version; tvGeometry.imageSurface.version++; }
    };
    const tvBoard = tv.board;
    const openTvBoard = () => { tv.openBoard(); hud.openBoard(tvBoard); };
    const openTv = () => tv.openGuide();
    // A pick's detail. GitHub opens the Oogatron's board on the picked page's own view (or, for Repositories, the top
    // repository's totals filtered to it), paused there for reading; the TV's rotation and block cuts hold until every
    // reader it opened is closed (a floating board disposes its reader as it closes, and leaving closes them all).
    let lastDetail = null;
    const openDetail = (channel) => {
      const detail = BL.cloudArchiveChannels.detailFor(channel, tvReader);
      if (detail.kind !== "oogatron") { lastDetail = null; openTvBoard(); return; }
      const held = tv.selector.holdDetail((state) => {
        const reader = sign.createReader(state || { screen: detail.screen, filters: detail.filters, paused: true });
        lastDetail = { channel: channel.id, reader };
        return reader;
      });
      hud.openBoard(signBoardWith(held.createReader));
      held.settle();
    };
    target(built.tv, { kind: "tv" }, 0.6);
    target(built.screen, { kind: "tv" }, 0.4);
    // The set's knobs work it: a tap turns the channel or opens the guide. They win over the set round them.
    built.knobs.forEach((k) => target(k.node, { kind: "knob", act: k.act, priority: 1 }, k.big ? 0.09 : 0.04));
    const workKnob = (act) => { if (act === "guide") openTv(); else tv.turn(act === "up" ? 1 : -1); };

    // The board: one page a day, painted when shown.
    const boardCanvas = document.createElement("canvas");
    boardCanvas.width = BOARD_W; boardCanvas.height = BOARD_H;
    let dayIndex = 0, boardVersion = 0, painted = -1;
    const showDay = (i) => {
      dayIndex = clamp(i, 0, DATA.days.length - 1);
      if (painted !== dayIndex) { paintDay(boardCanvas.getContext("2d"), dayIndex); painted = dayIndex; }
      boardVersion++;
    };
    // GitHub's history from the day's last commit back: exact, where a date filter would be read in the viewer's time
    // zone. Then the day's PR-head matches.
    const dayLinks = (i) => {
      const day = DATA.days[i], last = day.commits[day.commits.length - 1][0];
      const links = [{ href: `${REPO_URL}/commits/${last}`, label: `History from this day's last commit, ${last.slice(0, 7)} (new tab)` }];
      // The PR number is the PR-head match; the words after it are the merge commit's own message, not the PR's title.
      for (const c of day.commits) if (c[3] && links.length < 5) links.push({ href: `${REPO_URL}/pull/${c[3]}`, label: `PR #${c[3]} (PR-head match) · merge message: “${c[2]}” (new tab)` });
      return links;
    };
    const board = {
      title: "Cloud Archive", help: "One shelf a day, one book a commit. Arrow keys flip the days.", wide: true,
      get canvas() { return boardCanvas; }, get count() { return DATA.days.length; }, get index() { return dayIndex; },
      get caption() { return `${DATA.days[dayIndex].date} (UTC) · day ${dayIndex + 1} of ${DATA.days.length}`; },
      get note() {
        const s = STATS[dayIndex], who = s.authors.map(([p, n]) => `${label(p)} (${n})`).join(", ");
        const shelf = s.shelf.overflow ? ` ${s.shelf.books} stand as books; the other ${s.shelf.overflow} are in the overflow binder.` : "";
        return `${plural(s.commits, "commit")}, ${plural(s.prs, "PR-head match", "PR-head matches")}${who ? `, by ${who}` : ""}${others(s).replace(/ · /g, "; ")}.${shelf} `
          + `${AUTHORS_NOTE} Counts are of author identities, not people. `
          + `A PR number appears where a merge brought in the exact head GitHub publishes for that one PR: a PR-head match, which does not prove GitHub marked it merged; a head several PRs share is credited to none. `
          + `From ${DATA.repo} ${DATA.provenance.branch} at ${DATA.rev.slice(0, 7)}, PR refs read ${PULL_REFS}, days in UTC.`;
      },
      get links() { return dayLinks(dayIndex); },
      get version() { return boardVersion; },
      go: (i) => showDay(i)
    };
    const openDay = (i) => { showDay(i); hud.openBoard(board); };

    // The visitor's Ooga: the one handed over, else their own, else the roster's first they may drive.
    const mayPick = (entry) => !BL.net.mayDrive(entry.name);
    const own = BL.net.ownCharacter();
    let playerName = null;
    for (const name of [world.pilot, own && own.handle]) {
      const entry = name && contributors.roster.find((c) => c.name === name);
      if (entry && mayPick(entry)) { playerName = entry.name; break; }
    }
    // Else (a page opened here) one the island will hand back: it keeps an away Ooga away (crew.stateOf ignores a
    // wake-up for one that is neither the player nor the signed-in owner), so the hub's possess on the way home would
    // refuse it and the visitor would land with no Ooga. Only if every drivable Ooga is away, the first of them.
    if (!playerName) playerName = (contributors.activeRoster.find((e) => mayPick(e) && contributors.stateFor(e) !== "away") || contributors.activeRoster.find(mayPick))?.name || null;
    world.pilot = null;
    const playerWorld = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    let people = null, avatar = null, climbed = false, leaving = false;
    const NO_ACTORS = [];

    // What Space (or the act button) does here, one thing at a time: the nearer of a free chair and a shelf faced on
    // the floor, or the way home at the shaft's foot once the Ooga has been up. `near` is reused, never reallocated.
    const near = { kind: null, seat: null, index: -1, distance: Infinity };
    const facing = (dx, dz) => {
      const c = camera.position, t = camera.target, fx = t.x - c.x, fz = t.z - c.z, f = Math.hypot(fx, fz) || 1, d = Math.hypot(dx, dz) || 1;
      return (dx * fx + dz * fz) / (d * f);
    };
    const findNear = () => {
      near.kind = null; near.seat = null; near.index = -1; near.distance = Infinity;
      if (!avatar || avatar.camp.seat || avatar.hop > 0 || avatar.ladder && avatar.ladder.plane) return near;
      const p = avatar.root.position, feet = p.y - avatar.baseY;
      if (feet < -S.depth + 0.1) {
        const d = Math.hypot(p.x - L.LADDER.x, p.z - L.LADDER.z);
        if (climbed && d < FOOT_REACH) { near.kind = "island"; near.distance = d; }
        return near;
      }
      if (Math.abs(feet) > 0.1) return near;
      if (!train.loaded) { near.kind = "load"; near.distance = 0; return near; }
      // Anywhere in the lounge offers a seat, the Ooga's choice made for it: the free chair it is plainly facing within
      // reach, else the one already offered while it stays free (so the choice never flickers between them), else the
      // nearer, a tie in the middle going to the left one.
      const chairReach = 0.5 + avatar.bodyRadius + SIT_REACH;
      let faced = null, nearest = null, nearestD = Infinity;
      for (const s of seats) {
        if (s.sitter) continue;
        const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
        if (d < chairReach && facing(dx, dz) > SIT_FACING && (!faced || d < Math.hypot(faced.x - p.x, faced.z - p.z))) faced = s;
        if (d < nearestD - SEAT_TIE) { nearest = s; nearestD = d; }
      }
      if (Math.hypot(p.x - LOUNGE.x, p.z - LOUNGE.z) < LOUNGE_REACH || faced) {
        // The one already offered is kept only while the two are about as near (within SEAT_KEEP of each other).
        const kept = offered && !offered.sitter && Math.hypot(offered.x - p.x, offered.z - p.z) < nearestD + SEAT_KEEP ? offered : null, seat = faced || kept || nearest;
        if (seat) { near.kind = "chair"; near.seat = seat; near.index = seats.indexOf(seat); near.distance = Math.hypot(seat.x - p.x, seat.z - p.z); }
      }
      offered = near.seat;
      for (let i = 0; i < built.racks.length; i++) {
        const q = built.racks[i].position, side = q.x < 0 ? 1 : -1, front = q.x + side * RACK.d / 2, ahead = (p.x - front) * side;
        if (ahead < 0 || ahead > READ_REACH + avatar.bodyRadius || Math.abs(p.z - q.z) > RACK.w / 2 || ahead >= near.distance) continue;
        if (facing(-side, 0) > READ_FACING) { near.kind = "shelf"; near.index = i; near.seat = null; near.distance = ahead; }
      }
      const toSign = p.z - signZ, ahead = Math.abs(toSign);
      if (!near.kind && ahead > 1 && ahead < SIGN_REACH && Math.abs(p.x - SG.x) < RACK.aisle - RACK.d && facing(0, toSign > 0 ? -1 : 1) > SIGN_FACING) { near.kind = "sign"; near.distance = ahead; }
      return near;
    };
    // Into the chair, the view turned to the TV.
    const sit = (seat) => {
      if (!people.sitPlayer(seat)) return false;
      // Watching: through the sitter's own eyes, turned to the screen (from behind, the sitter's head hides it). The
      // pilot enters first person along the view on screen, so the eye is first aimed at the TV from the seat.
      const eye = avatar.root.position.y + avatar.headOffset, tx = L.TV.x + L.TV.screenX, ty = L.TV.table + L.TV.screenY, tz = L.TV.z + L.TV.d / 2;
      const dx = tx - seat.x, dy = ty - eye, dz = tz - seat.z;
      if (pilot.mode !== "first-person") {
        camera.position.x = seat.x; camera.position.y = eye; camera.position.z = seat.z;
        camera.target.x = tx; camera.target.y = ty; camera.target.z = tz;
        pilot.enterClose();
      } else {
        const o = pilot.orbit;
        o.yaw = o.tYaw = Math.atan2(-dx, -dz);
        o.pitch = o.tPitch = Math.atan2(-dy, Math.hypot(dx, dz));
      }
      return true;
    };
    const useNear = () => {
      const n = findNear();
      if (n.kind === "chair") return sit(n.seat);
      if (n.kind === "shelf") { openDay(n.index); return true; }
      if (n.kind === "sign") { openSign(); return true; }
      if (n.kind === "load") return load();
      if (n.kind === "island") { handOff(); return true; }
      return false;
    };
    if (playerName) {
      const sharedCtx = { root, input, hud, game, world: playerWorld, playerName, fx, viewYaw: 0, outsideActors: () => NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT,
        groundAt, walkable, ladders: [L.LADDER], useNear, jetpackAllowed: () => false };
      people = sharedCtx.crew = BL.crew.create(sharedCtx);
      pilot.bind(sharedCtx);
      avatar = people.cavemen.get(playerName);
      avatar.weapon.primaryOwned = avatar.weapon.secondaryOwned = false;
      people.selectWeapon(0, avatar);
      avatar.weapon.aiming = false;
      avatar.parts.club.visible = avatar.parts.gun.visible = false;
      if (avatar.jet) people.removeJetpack(avatar);
      pilot.possess(avatar);
      // In first person at the shaft's foot, facing the stalk and looking up it to the light.
      pilot.enterClose();
      pilot.navigate({ position: { x: L.arrival.x, y: -S.depth, z: L.arrival.z }, yaw: 0, pitch: ARRIVAL_PITCH, dist: 4 });
    }
    keepCameraInside();
    BL.net.setBody(null);
    BL.net.setZone("none");
    const footsteps = BL.footsteps.create();
    // View assist: the Ooga's outline over the racks, the floor (from above, into the shaft) and the lounge's furniture.
    const solidAt = (x, y, z) => {
      if (y < 0) return !L.inShaft(x, z);
      if (y < RACK.h) for (let i = 0; i < built.racks.length; i++) {
        const q = built.racks[i].position;
        if (Math.abs(x - q.x) < RACK.d / 2 && Math.abs(z - q.z) < RACK.w / 2) return true;
      }
      if (y < 1.1) for (let i = 0; i < L.solids.length; i++) { const o = L.solids[i]; if (Math.hypot(x - o.x, z - o.z) < o.r - 0.1) return true; }
      return false;
    };
    const assist = BL.viewAssist.create({ overlay: ctx.overlay, solidAt });

    // Home: the same Ooga to the island, beside the beanstalk, which stands from now on (a page that opened here has
    // not grown it, and arrives there all the same).
    let hintStage = null, actKind = null, actIndex = -1, wasOnLadder = false, wasHeld = true, wasOffered = false;
    const handOff = () => {
      if (leaving) return;
      world.pilot = avatar ? avatar.traits.name : null;
      world.pilotDetached = !avatar;
      world.archiveRevealed = true;
      leaving = go("hub");
    };
    const stay = () => { leaving = false; };
    const WEAPON_KEYS = new Set(["1", "2", "r", "f", "g", "j"]);
    const armsKeys = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !WEAPON_KEYS.has(e.key.toLowerCase()) || e.target && e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", armsKeys, { capture: true, signal: ctx.signal });

    const tipFor = (hit) => {
      const o = hit.owner;
      if (o.kind === "rack") { const s = STATS[o.index]; return `${DATA.days[o.index].date} · ${plural(s.commits, "commit")} · ${COARSE ? "tap" : "click, or face it and press Space,"} to read the day`; }
      if (o.kind === "sign") return COARSE ? "Oogatron · OogaBoogaX on the big screen · tap the screen for a close-up, its sides to page it" : "Oogatron · OogaBoogaX on the big screen · click the screen for a close-up, its sides to page it";
      if (o.kind === "knob") return o.act === "guide" ? "Island TV · the channel guide" : `Island TV · ${tv.title} · ${COARSE ? "tap" : "click"} for the channel ${o.act === "up" ? "up" : "down"}`;
      if (o.kind === "tv") return `Island TV · ${tv.title} · ${COARSE ? "tap" : "click, or press T,"} for the channel guide`;
      if (o.kind === "chair") return COARSE ? "Leather armchair · walk up and tap SIT" : "Leather armchair · Space beside it sits";
      if (o.kind === "stalk") return COARSE ? "Beanstalk · climb down it, or tap ISLAND at its foot, to go home" : "Beanstalk · climb down it (S), or Space at its foot, to go home";
      return "";
    };
    Object.assign(hooks, {
      onHover: (hit, p) => { if (hit) hud.tooltip.show(tipFor(hit), p.x, p.y); else hud.tooltip.hide(); },
      onHoverMove: (hit, p) => hud.tooltip.show(tipFor(hit), p.x, p.y),
      onTap: (hit, p) => {
        if (!hit) return;
        const o = hit.owner;
        if (o.kind === "rack") openDay(o.index);
        else if (o.kind === "sign") {
          const face = o.back ? signBack : sign;
          if (!p) openSign();
          else {
            renderer.ray(p.x, p.y, camera, SIGN_RAY);
            if (face.tapAt(SIGN_RAY) === "screen") openSign();
            else if (o.back) sign.goToView(signBack.index);
          }
        }
        else if (o.kind === "tv") openTv();
        else if (o.kind === "knob") workKnob(o.act);
        else if (o.kind === "chair") {
          const seat = seats[o.index], n = findNear();
          // From anywhere in the lounge the tapped chair is the one taken.
          if (seat.sitter || n.kind !== "chair" || !sit(seat)) hud.toast(COARSE ? "Walk up to a free chair, then tap SIT" : "Walk up to a free chair and press Space to sit");
        }
        else if (o.kind === "stalk") hud.toast(COARSE ? "Climb down the beanstalk, or tap ISLAND at its foot, to go home" : "Climb down the beanstalk (S), or press Space at its foot, to go home");
      },
      ...pilot.hooks
    });
    hud.onAction((action) => {
      if (action === "leave") handOff();
      else if (action === "tv-guide") openTv();
      else if (action === "reset-view") pilot.resetCamera();
      else if (action === "jetpack-toggle") hud.toast("No jetpacks in the archive");
      else if ((action === "act" || action === "mode-retake") && !pilot.player && avatar) retake();
      else if (action.startsWith("mode-")) pilot.modeAction(action);
    });
    const mode = document.getElementById("archive-mode");
    if (mode) mode.textContent = `${DATA.days.length} days · ${DATA.commits} commits`;
    const hint = (stage) => {
      if (stage === hintStage) return;
      hintStage = stage;
      if (stage === "climb") hud.hint(COARSE ? "Walk into the beanstalk and push the stick forward to climb · Leave goes home" : "Walk into the beanstalk and hold W to climb · S climbs down · Leave or Escape goes home", 9000);
      else if (stage === "floor") hud.hint(COARSE ? "Walk the aisle · face a shelf and tap READ, or tap it · climb down the stalk to go home" : "W A S D walk the aisle · face a shelf and press Space, or click it · climb down the stalk to go home", 6000);
      else if (stage === "fell") hud.hint(COARSE ? "Down the shaft · climb the stalk to go back up, or tap ISLAND to go home" : "Down the shaft · W on the stalk climbs back up · Space here goes home", 6000);
    };
    hint("climb");
    // The act button follows what Space would do, changed only when that changes.
    const showNear = () => {
      if (!avatar || !climbed) return;
      const n = avatar.camp.seat ? null : findNear(), kind = avatar.camp.seat ? "stand" : n.kind, index = n ? n.index : -1;
      if (kind === actKind && index === actIndex) return;
      actKind = kind; actIndex = index;
      if (kind === "sit" || kind === "chair") { const side = index === 0 ? "left" : "right"; hud.setAct("SIT"); hud.hint(COARSE ? `Tap SIT for the ${side} chair` : `Space · Sit in the ${side} chair`); }
      else if (kind === "stand") { hud.setAct("STAND UP!"); hud.hint(COARSE ? "Move or tap STAND UP! to get up" : "Move or press Space to stand up"); }
      else if (kind === "shelf") { hud.setAct("READ"); hud.hint(COARSE ? `Tap READ for ${DATA.days[index].date}` : `Space · Read ${DATA.days[index].date}`); }
      else if (kind === "load") { hud.setAct("LOAD"); hud.hint(COARSE ? "Tap LOAD to bring in the archive" : "Space · Load the archive", 9000); }
      else if (kind === "sign") { hud.setAct("READ"); hud.hint(COARSE ? "Tap READ for the Oogatron" : "Space · Read the Oogatron"); }
      else if (kind === "island") { hud.setAct("ISLAND"); hud.hint(COARSE ? "Tap ISLAND to go home down the beanstalk" : "Space · Home to the island"); }
      else { pilot.showAct(); if (wasOffered) hud.hideHint(); }
      wasOffered = kind !== null && kind !== "stand";
    };

    const update = (dt, elapsed) => {
      pilot.readInput(dt);
      if (people) people.update(dt, elapsed);
      pilot.update(dt);
      keepCameraInside();
      footsteps.update(people && people.player);
      if (avatar && !leaving) {
        const feet = avatar.root.position.y - avatar.baseY, onLadder = !!(avatar.ladder && avatar.ladder.plane), bottom = feet < -S.depth + 0.05;
        // On the stalk a first-person eye is pressed to the shaft's wall: step back to the trailing view for the climb.
        if (onLadder && pilot.mode === "first-person") pilot.exitClose(false);
        if (!climbed && feet > -0.05 && !onLadder) { climbed = true; if (train.loaded) hint("floor"); }
        // Climbed all the way down the stalk (off it at the foot, having been up): home. Dropping in is not climbing down.
        if (climbed && wasOnLadder && !onLadder && bottom) handOff();
        else if (climbed && bottom && !onLadder && !wasOnLadder) hint("fell");
        else if (climbed && !bottom && hintStage === "fell") hint("floor");
        wasOnLadder = onLadder;
      }
      // Let go: say how to take the Ooga back, once each time.
      const held = !!pilot.player;
      if (avatar && !leaving && wasHeld && !held) hud.hint(COARSE ? `${avatar.traits.display} is waiting · tap its portrait or the act button to take it back` : `${avatar.traits.display} is waiting · W A S D, Space or its portrait takes it back · Escape again leaves`, 8000);
      wasHeld = held;
      showNear();
      updateTv(dt, elapsed);
      updateTrain(dt);
      updateSign(dt);
      sign.update(elapsed, renderer);
      signBack.update(elapsed, renderer);
      hud.updateBoard(elapsed);
      stepTweens(dt);
      fx.update(dt, elapsed);
    };
    const drawExtra = () => {};
    const overlay = (dt) => {
      fx.drawOverlay(dt, drawExtra);
      const cave = people && people.player, p = cave && cave.root.position;
      if (cave) assist.update(camera, cave.root, p.x, p.y - cave.baseY, p.z, cave.bodyHeight || cave.traits.height, dt, pilot.closeMix);
      else assist.update(camera, null, 0, 0, 0, 0, dt);
    };
    // A let-go Ooga (Escape, or the mode button) waits where it is; walking keys, Space, the act button or its portrait
    // take it straight back, so the visit can never be left without control.
    const RETAKE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "]);
    const retake = () => {
      if (leaving || !avatar || pilot.player) return false;
      if (!pilot.possess(avatar)) return false;
      hud.hideHint();
      return true;
    };
    const onKey = (e) => {
      if (!pilot.player && !e.metaKey && !e.ctrlKey && !e.altKey && RETAKE_KEYS.has(e.key.toLowerCase())) { if (retake()) return true; }
      if (e.key === "0" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return pilot.resetCamera();
      if (e.key.toLowerCase() === "x" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); return pilot.modeAction("mode-toggle"); }
      if (e.key.toLowerCase() === "t" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); openTv(); return true; }
      if (e.key === "Escape") { if (!pilot.escape()) handOff(); return true; }
      return false;
    };
    const onDonation = (donation, counted = null) => {
      game.recordDonation(donation, counted && counted.exact);
      world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
      hud.toast(`${donation.handle || "anon"} tipped ${BL.game.formatLarge(donation.sats)} sats · the island's pile grows`);
    };

    shell.root = root;
    shell.camera = camera;
    shell.input = input;
    shell.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people ? people.cavemen : null,
      cloudArchive: {
        layout: L, built, board, openDay, openTv, openTvBoard, tv, tvBoard, sign, signBack, signBoard, openSign, openDetail, get detail() { return lastDetail && { channel: lastDetail.channel, index: lastDetail.reader.index, caption: lastDetail.reader.caption }; }, get signZ() { return signZ; }, signGoal, train, load, seats, views, assist: assist.state, near: () => ({ kind: findNear().kind, index: near.index }),
        get avatar() { return avatar; }, get climbed() { return climbed; }, get dayIndex() { return dayIndex; }, get leaving() { return !!leaving; }, exit: handOff
      }
    };

    const leave = () => {
      if (!leaving) {
        world.pilotDetached = !avatar;
        world.pilot = avatar ? avatar.traits.name : null;
        world.archiveRevealed = true;
      }
      window.removeEventListener("keydown", armsKeys, true);
      BL.net.setBody(null);
      for (const plaque of plaques) { renderer.releaseGeometry(plaque.geometry); plaque.geometry = null; }
      renderer.releaseGeometry(tvGeometry); built.screen.geometry = null;
      tv.dispose();
      signUnsub();
      archiveAudio.dispose();
      sign.dispose(renderer);
      signBack.dispose(renderer);
      footsteps.dispose();
      assist.dispose();
      if (people) people.dispose();
      fx.dispose();
      pilot.dispose();
      for (const node of targets) input.remove(node);
      targets.length = 0;
      while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
      const count = input.targetCount;
      input.dispose();
      hud.dispose();
      shell.input = shell.debug = null;
      return { targets: count };
    };
    const liveGeometry = (set) => { if (avatar) set.add(avatar.headOpen).add(avatar.headClosed); };
    const stats = () => {
      let visible = 0;
      traverseVisible(root, () => visible++);
      return { visibleNodes: visible, tweens: tweenCount(), targets: input.targetCount, ...fx.stats() };
    };
    // The live motion state, filled in place when the director asks (once a frame, while unfocused).
    const motion = { train: false, glide: false, snow: false, tweens: 0, fx: false };
    return { update, overlay, onKey, onDonation, stay, leave, liveGeometry, stats, renderOpts: RENDER_OPTS,
      get inMotion() {
        motion.train = train.t >= 0; motion.glide = signGliding; motion.snow = tv.tv.snow > 0; motion.tweens = tweenCount(); motion.fx = fx.inMotion;
        return inMotion(motion);
      } };
  };
  BL.cloudArchiveInterior = { create, inMotion };
})();
