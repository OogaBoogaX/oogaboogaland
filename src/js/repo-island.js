// Repo Island at work in the hub (repo-island-models.js builds it): the rock, the bridge and the section signs are made
// in the hub's `enter`; the totems come after, in idle time, so the island costs the hub's boot almost nothing.
//
// The island turns slowly about its middle, a turn every TURN seconds, lip, signs, totems and all (`spin`, a child of
// the group the bridge stays on); its angle comes from the clock (the room's where there is one), so every page shows
// it at the same angle and other players stand where they do. `spin()`, called before the hub's solids are synced,
// sets the angle and says how far it turned since the last frame; `carry(position, feet)` turns a body standing on or
// over the island with it, as a turntable takes what stands on it. The pick targets turn with it on a pivot of their
// own, kept off the scene graph. `?debug=1&repospin=0` holds it still.
//
// Idle work (`requestIdleCallback`, or short timeouts where a browser has none), a little at a time and never while
// the page is hidden: first every chunk at its `distant` detail with its collision, runes and eyes (about a hundred
// milliseconds in all), each chunk joining the island as it is done; then, only for a view that comes near, a chunk's
// `far` and `near` carvings, built and uploaded (`renderer.prepareGeometry`) before the chunk is switched to them.
// Each frame `update` picks every chunk's detail by the view's distance from it (near within NEAR, far within FAR,
// with some slack so a view at the edge does not flicker), readying each finer detail from further out (NEAR_PREP,
// FAR_PREP) so a walk in never waits on one; a view that leaves the island lets its far and near meshes go from the
// GPU (they stay out of `liveGeometry`), so the main island holds only the distant ones and the nearest few far ones.
//
// A totem lights for `repoFeed.RECENT` after its repository merges a pull request (`repo-feed.js`), as the meadow's do:
// its runes glow in its section's rhythm and the crystals under it glow, waning to 60% by the day's end, and its two
// crest eyes burn, each flame a node on the arcade's one `blaze` geometry, lit only on a chunk carved finer than distant
// (across the water an ember in each eye, merged with its runes, does instead). Each crystal cluster under the island
// glows from a core inside its crystals, bright while at least half the totems over it are lit and dim while fewer
// are, the cores merged into one mesh a band, rebuilt only when they change. The lit runes of a chunk are merged into one mesh a brightness band
// (fresh within FRESH, older), rebuilt only when that chunk's lit set changes, so 170 totems light in a few dozen draws.
// A merge seen during the visit flares that totem's runes for FLARE seconds. The runes and flames animate only while
// the view is within ACTIVE of the island; elsewhere they hold still.
//
// `create({ island, renderer, hooks })` returns the site; `hooks` are the hub's: `addSolid(node)`, `addTarget(node,
// owner, opts)`, `removeTarget(node)`, `visible()` (the hub is showing, for idle work) and `near()` (the visitor is on
// the island or its bridge, for a merge's notice) and `toast(text)`. Pick owners are `repo-totem`, `repo-sign` and
// `repo-bridge`, which the hub's tooltip and tap answer with `tip(owner)` and `open(owner)`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild, updateWorld } = BL.scene;
  const params = new URLSearchParams(location.search), DEBUG_GLOW = params.get("debug") === "1" && params.get("totemglow") === "1";
  const STILL = params.get("debug") === "1" && params.get("repospin") === "0";
  // A turn every TURN seconds; a frame turning further than MAX_TURN (the page was away) carries nobody.
  const TURN = 480, MAX_TURN = 0.05;
  // A chunk shows its near carving within NEAR of the view and its far within FAR (each let go a little further out),
  // and readies them earlier, from NEAR_PREP and FAR_PREP, so a visitor walking in finds them built and uploaded.
  const NEAR = 12, NEAR_OUT = 15, FAR = 30, FAR_OUT = 35, NEAR_PREP = 22, FAR_PREP = 36, PREP_OUT = 6;
  const ACTIVE = 30, FRESH = 8 * 3600000, FLARE = 6, IDLE_MS = 6, IDLE_WAIT = 120;
  const TIER = { distant: 0, far: 1, near: 2 }, TIERS = ["distant", "far", "near"];
  const PICK_GEOMETRY = { verts: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], faces: [], lines: [] };
  // Each section's rhythm, 0 to 1 over time t: blocks stacking, lightning strikes, payments flowing, a mesh rippling.
  const fract = (x) => x - Math.floor(x), noise = (n) => fract(Math.sin(n * 12.9898 + 4.1) * 43758.5453);
  const RHYTHMS = {
    blocks: (t) => { const p = (t % 6.6) / 0.55; return p < 9 ? Math.min(1, 0.35 + Math.floor(p) / 8) : Math.max(0.35, 1 - (p - 9) / 3); },
    strike: (t, seed) => { const slot = Math.floor(t / 0.9), since = t - slot * 0.9 - noise(slot + seed) * 0.5; return since < 0 || noise(slot * 1.7 + seed) < 0.25 ? 0.3 : 0.3 + 0.7 * Math.exp(-since * 2.4); },
    flow: (t) => 0.55 + 0.45 * Math.sin(t * 2.6) ** 2,
    ripple: (t) => 0.6 + 0.25 * Math.sin(t * 1.4) + 0.15 * Math.sin(t * 2.3 + 1)
  };
  const RHYTHM_OF = { core: "blocks", nodes: "blocks", mining: "blocks", layers: "blocks", lightning: "strike", "lightning-tools": "strike",
    "software-wallets": "flow", "hardware-wallets": "flow", payments: "flow" };

  const create = ({ island, renderer, hooks }) => {
    const M = BL.repoIslandModels, D = BL.repoIslandData, P = M.plan(), spot = M.spot(island), feed = BL.repoFeed;
    const rock = M.rockSteps(), bridge = M.bridge(), signs = M.signs();
    const group = createNode({ position: { x: spot.x, y: spot.y, z: spot.z }, sightHidden: true }), spin = createNode({ sightHidden: true });
    const soil = createNode({ geometry: rock.soil, sightHidden: true, sightSolid: true }), lip = createNode({ geometry: rock.lip, sightHidden: true });
    const pavement = createNode({ geometry: rock.pavement, sightHidden: true }), crystals = createNode({ geometry: rock.crystals, sightHidden: true });
    const crystalBase = createNode({ geometry: rock.crystalBase, sightHidden: true }), carpet = createNode({ geometry: rock.carpet, sightHidden: true });
    const stone = createNode({ geometry: bridge.stone, sightHidden: true, sightSolid: true }), glass = createNode({ geometry: bridge.glass, glow: 0, sightHidden: true });
    const boards = createNode({ geometry: signs.geometry, sightHidden: true });
    // Canvas 2D sorts every face it draws each frame: it gets the island and its bridge, without the signs or totems.
    const canvas = renderer.kind !== "webgl2";
    addChild(group, spin, stone, glass);
    addChild(spin, soil, lip);
    if (!canvas) addChild(spin, boards, pavement, crystalBase, carpet, crystals);
    const sections = new Map(D.SECTIONS.map((s) => [s.id, s]));
    const world = (x, y, z) => ({ x: spot.x + x, y: spot.y + y, z: spot.z + z });
    // The turn: its angle, its cosine and sine, and how far the last `spin` turned it.
    let angle = 0, cos = 1, sin = 0, turned = 0, lastAt = -1;
    // Pick targets on the island hang off `pivot`, off the scene graph, turned with the island; the bridge's stands still.
    const pivot = createNode({ position: { x: spot.x, y: spot.y, z: spot.z } }), targets = [];
    const target = (at, owner, radius, turning = true) => {
      const node = createNode({ position: at, geometry: PICK_GEOMETRY });
      if (turning) { addChild(pivot, node); updateWorld(pivot); } else updateWorld(node);
      hooks.addTarget(node, owner, { radius });
      targets.push(node);
      return node;
    };
    if (!canvas) for (const s of signs.picks) target({ x: s.x, y: s.y, z: s.z }, { kind: "repo-sign", section: sections.get(s.id), count: P.wedges.find((w) => w.id === s.id)?.count || 0 }, s.radius);
    target(world(0, 0.6, (bridge.from + bridge.to) / 2), { kind: "repo-bridge" }, bridge.width / 2 + 0.3, false);
    // The ground the main island's scatter keeps off: the bridge head on the south terrace.
    const claims = [[0, spot.rim - 0.5, bridge.width / 2 + 0.9], [0, spot.rim - 2, bridge.width / 2 + 0.6]];
    // The lanterns at either end of the bridge, for the hub's dusk lamps.
    const lamps = bridge.lamps.map((l) => world(l.x, l.y, l.z));
    // Arriving: on the lip at the bridge's end, facing in toward Bitcoin Core.
    const arrival = world(0, M.LIP.rise, -M.ISLE.R + M.LIP.width / 2);
    const view = { yaw: Math.PI, pitch: 0.24, dist: 13, target: world(0, 2.2, -M.ISLE.R + 6) };

    // ---- chunks ----
    const chunks = P.chunks.map((list, k) => ({ k, list, bounds: P.bounds[k], node: null, tier: 0, want: 0, prep: 0, distance: Infinity, meshes: [null, null, null], ready: [false, false, false],
      glyphs: null, eyes: null, lit: "", buckets: [null, null], level: [0, 0] }));
    const totems = P.totems.map((t) => ({ t, chunk: null, slot: 0, live: 0 }));
    chunks.forEach((c) => c.list.forEach((at, slot) => { totems[at].chunk = c; totems[at].slot = slot; }));
    const join = (c, built) => {
      c.meshes[0] = built.mesh;
      c.glyphs = built.glyphs;
      c.eyes = built.eyes;
      c.ready[0] = true;
      c.node = createNode({ geometry: built.mesh, sightHidden: true });
      addChild(spin, c.node);
      hooks.addSolid(c.node);
      c.list.forEach((at) => {
        const t = P.totems[at], c0 = Math.cos(t.ry), s0 = Math.sin(t.ry);
        const owner = { kind: "repo-totem", index: t.index, at, weaponType: "none" };
        // The ray into the island's turned frame, then the totem's own.
        owner.pickRay = (ray) => {
          const wx = ray.ox - spot.x, wz = ray.oz - spot.z, ox = wx * cos - wz * sin - t.x, oz = wx * sin + wz * cos - t.z;
          const dx = ray.dx * cos - ray.dz * sin, dz = ray.dx * sin + ray.dz * cos;
          return BL.totemModels.hitOf(t.L, ox * c0 - oz * s0, ray.oy - spot.y, ox * s0 + oz * c0, dx * c0 - dz * s0, ray.dy, dx * s0 + dz * c0);
        };
        target({ x: t.x, y: t.L.apex / 2, z: t.z }, owner, Math.max(t.L.reach, t.L.apex / 2) + 0.2);
      });
      litDirty = true;
    };

    // ---- idle work ----
    let job = null, handle = 0, idle = false, disposed = false, paused = true, built = 0;
    const slice = { budget: IDLE_MS, until: 0, work: 0 };
    // The next piece of work: a chunk's distant detail while any is missing, else, for the nearest chunk with a detail
    // to ready (`prep`), its coarsest one not yet built, or built and not yet uploaded.
    const missing = (c) => {
      for (let tier = 1; tier <= c.prep; tier++) if (!c.ready[tier]) return tier;
      return 0;
    };
    const nextJob = () => {
      for (const c of chunks) if (!c.meshes[0]) return { c, tier: 0, steps: M.chunkSteps(c.k, "distant").steps(slice) };
      let best = null;
      for (const c of chunks) if (missing(c) && (!best || c.distance < best.distance)) best = c;
      if (!best) return null;
      const tier = missing(best);
      if (!best.meshes[tier]) return { c: best, tier, steps: M.chunkSteps(best.k, TIERS[tier]).steps(slice) };
      return { c: best, tier, upload: true };
    };
    const work = (deadline) => {
      handle = 0;
      if (disposed) return;
      if (!hooks.visible()) { schedule(); return; }
      // A busy page offers little idle time; the callback's timeout still runs it, with a slice no shorter than
      // IDLE_MS less a millisecond, so the island always comes along, at a few percent of a busy main thread at most.
      const until = performance.now() + (deadline && deadline.timeRemaining ? Math.min(IDLE_MS * 2, Math.max(IDLE_MS - 1, deadline.timeRemaining() - 1)) : IDLE_MS);
      while (performance.now() < until) {
        if (!job) job = nextJob();
        if (!job) return;
        if (job.upload) {
          job.c.ready[job.tier] = renderer.prepareGeometry(job.c.meshes[job.tier]);
          job = null;
          continue;
        }
        slice.until = until;
        const step = job.steps.next();
        if (!step.done) break;
        if (job.tier === 0) { join(job.c, step.value); built++; }
        else job.c.meshes[job.tier] = step.value.mesh;
        job = null;
      }
      schedule();
    };
    const schedule = () => {
      if (handle || disposed || paused) return;
      idle = typeof requestIdleCallback === "function";
      handle = idle ? requestIdleCallback(work, { timeout: IDLE_WAIT }) : setTimeout(work, 40);
    };
    const cancel = () => {
      if (handle) { if (idle) cancelIdleCallback(handle); else clearTimeout(handle); }
      handle = 0;
    };
    // Idle work runs from `start` (the visit is ready) until `pause` (the hub is suspended) or `dispose`; Canvas 2D,
    // which draws no totems, never starts it.
    const start = () => { lastAt = -1; if (canvas) return; paused = false; schedule(); };
    const pause = () => { paused = true; cancel(); };

    // ---- the lit runes and fires ----
    let litDirty = true, litVersion = -1, litChecked = 0, flare = null, flareLeft = 0, active = false, wasActive = true, gemKey = "";
    const cluster = M.crystals(), gemBands = [null, null];
    const flames = [];
    const flameAt = (n) => {
      while (flames.length <= n) {
        const node = createNode({ geometry: BL.arcadeModels.blaze(), visible: false, sightHidden: true });
        addChild(spin, node);
        flames.push({ node, size: 0, phase: flames.length * 1.7, live: 0, chunk: null });
      }
      return flames[n];
    };
    const liveOf = (index, now) => {
      if (DEBUG_GLOW) return 1;
      const at = feed.state.repos[index].changedAt, age = now - at;
      return at && age >= 0 && age < feed.RECENT ? 1 - 0.4 * age / feed.RECENT : 0;
    };
    // Rebuild every chunk's lit bands whose members changed, then hand out the fires.
    const relight = (now) => {
      let fire = 0;
      for (const c of chunks) {
        if (!c.glyphs) continue;
        const bands = [[], []];
        let key = "";
        c.list.forEach((at, slot) => {
          const live = liveOf(P.totems[at].index, now);
          totems[at].live = live;
          if (!live) return;
          const band = DEBUG_GLOW || now - feed.state.repos[P.totems[at].index].changedAt < FRESH ? 0 : 1;
          bands[band].push(slot);
          key += `${slot}:${band},`;
          for (const [x, y, z, size] of c.eyes[slot]) {
            const f = flameAt(fire++);
            f.node.position.x = x; f.node.position.y = y; f.node.position.z = z;
            f.size = size; f.live = live; f.chunk = c; f.node.visible = c.tier > 0;
            f.node.scale.x = f.node.scale.y = f.node.scale.z = size * live;
          }
        });
        if (key === c.lit) continue;
        c.lit = key;
        bands.forEach((slots, band) => {
          if (!slots.length) { if (c.buckets[band]) c.buckets[band].visible = false; return; }
          const geometry = BL.models.noShadow(BL.models.merge(...slots.map((slot) => c.glyphs[slot])));
          if (!c.buckets[band]) { c.buckets[band] = createNode({ geometry, glow: 0, sightHidden: true }); addChild(spin, c.buckets[band]); }
          else c.buckets[band].geometry = geometry;
          c.buckets[band].visible = true;
          c.level[band] = band ? 0.7 : 1;
        });
      }
      for (let n = fire; n < flames.length; n++) { flames[n].node.visible = false; flames[n].chunk = null; }
      // The crystals: one bright where at least half the totems over it are lit, dim where fewer are.
      const bands = [[], []];
      let key = "";
      cluster.forEach((c, k) => {
        let lit = 0;
        for (const at of c.totems) if (totems[at].live) lit++;
        if (!lit) return;
        const band = lit * 2 >= c.totems.length ? 0 : 1;
        bands[band].push(k);
        key += `${k}:${band},`;
      });
      if (key !== gemKey) {
        gemKey = key;
        bands.forEach((list, band) => {
          if (!list.length) { if (gemBands[band]) gemBands[band].visible = false; return; }
          const geometry = BL.models.noShadow(BL.models.merge(...list.map((k) => M.gem(k))));
          if (!gemBands[band]) { gemBands[band] = createNode({ geometry, glow: 0, sightHidden: true }); addChild(spin, gemBands[band]); }
          else gemBands[band].geometry = geometry;
          gemBands[band].visible = true;
        });
      }
      wasActive = true;
    };
    const onFeed = (event) => {
      litDirty = true;
      if (!event.fresh) return;
      const t = totems.find((o) => o.t.index === event.index);
      if (!t || !t.chunk || !t.chunk.glyphs) return;
      if (!flare) { flare = createNode({ geometry: t.chunk.glyphs[t.slot], glow: 0, sightHidden: true }); addChild(spin, flare); }
      flare.geometry = t.chunk.glyphs[t.slot];
      flare.visible = true;
      flareLeft = FLARE;
      if (hooks.near()) hooks.toast(`${D.REPOS[event.index].name} just merged · its totem blazes on Repo Island`);
    };
    const unsubscribe = feed.subscribe(onFeed);

    // ---- the turn ----
    // Sets the island's angle from the clock, the room's where there is one; returns how far it turned this frame.
    const turn = () => {
      const now = STILL ? 0 : BL.net && BL.net.serverNow ? BL.net.serverNow() : Date.now();
      const next = now / 1000 % TURN / TURN * Math.PI * 2;
      turned = lastAt < 0 ? 0 : Math.atan2(Math.sin(next - angle), Math.cos(next - angle));
      if (Math.abs(turned) > MAX_TURN) turned = 0;
      lastAt = now;
      angle = next; cos = Math.cos(angle); sin = Math.sin(angle);
      spin.rotation.y = pivot.rotation.y = angle;
      updateWorld(pivot);
      return turned;
    };
    // Turns a body on or over the island (inside its edge, its feet from a little under the top to well over the
    // tallest totem) about the island's middle by the last turn, as the ground under it turned.
    const carry = (p, feet) => {
      if (!turned) return;
      const dx = p.x - spot.x, dz = p.z - spot.z;
      if (dx * dx + dz * dz > M.ISLE.R * M.ISLE.R || feet < spot.y - 1 || feet > spot.y + 12) return;
      const c = Math.cos(turned), s = Math.sin(turned);
      p.x = spot.x + dx * c + dz * s;
      p.z = spot.z - dx * s + dz * c;
    };

    // ---- per frame ----
    const update = (dt, elapsed, camera) => {
      // The view in the island's turned frame, where the chunks' bounds are.
      const wx = camera.position.x - spot.x, wz = camera.position.z - spot.z, cy = camera.position.y - spot.y - 2;
      const cx = wx * cos - wz * sin, cz = wx * sin + wz * cos;
      const fromMiddle = Math.hypot(cx, cz);
      active = fromMiddle < M.ISLE.R + ACTIVE;
      let wanted = false;
      for (const c of chunks) {
        const b = c.bounds, flat = Math.max(0, Math.hypot(cx - b.x, cz - b.z) - b.radius), d = Math.hypot(flat, cy);
        c.distance = d;
        if (!c.node) continue;
        const want = d < (c.want === 2 ? NEAR_OUT : NEAR) ? 2 : d < (c.want >= 1 ? FAR_OUT : FAR) ? 1 : 0;
        const prep = d < (c.prep === 2 ? NEAR_PREP + PREP_OUT : NEAR_PREP) ? 2 : d < (c.prep >= 1 ? FAR_PREP + PREP_OUT : FAR_PREP) ? 1 : 0;
        c.want = want;
        c.prep = prep;
        if (missing(c)) wanted = true;
        // The finest detail ready at or under the one wanted; anything finer than readied is let go.
        let tier = want;
        while (tier && !c.ready[tier]) tier--;
        if (tier !== c.tier) {
          c.tier = tier;
          c.node.geometry = c.meshes[tier];
        }
        for (let t = prep + 1; t < 3; t++) c.ready[t] = false;
      }
      if (wanted || built < chunks.length) schedule();
      const now = Date.now();
      if (litDirty || feed.state.version !== litVersion || now - litChecked > 60000) {
        litDirty = false; litVersion = feed.state.version; litChecked = now;
        relight(now);
      }
      if (flare && flareLeft > 0) {
        flareLeft = Math.max(0, flareLeft - dt);
        flare.glow = 1.2 * flareLeft / FLARE;
        flare.highlight = 2.4 * flareLeft / FLARE;
        if (!flareLeft) flare.visible = false;
      }
      // Fires burn only where a chunk is carved finer than its distant stand-in; across the water its embers show.
      for (let n = 0; n < flames.length; n++) { const f = flames[n]; if (f.chunk) f.node.visible = f.chunk.tier > 0; }
      if (!active && !wasActive) return;
      // Out of range the runes and fires hold one steady pose until the view comes back.
      const t = active ? elapsed : 0;
      for (const c of chunks) for (let band = 0; band < 2; band++) {
        const node = c.buckets[band];
        if (!node || !node.visible) continue;
        const section = P.totems[c.list[0]].section, rhythm = RHYTHMS[RHYTHM_OF[section] || "ripple"](t + c.k * 1.3, c.k), power = c.level[band];
        node.glow = (0.45 + 0.55 * rhythm) * power;
        node.highlight = (0.45 + 1.6 * rhythm) * power;
      }
      // The crystals' cores ripple together through the glass, the dim band at half; no highlight, which would turn them gold.
      for (let band = 0; band < 2; band++) if (gemBands[band] && gemBands[band].visible) gemBands[band].glow = (0.75 + 0.25 * RHYTHMS.ripple(t)) * (band ? 0.5 : 1);
      for (let n = 0; n < flames.length; n++) {
        const f = flames[n];
        if (!f.node.visible) continue;
        const flick = active ? Math.sin(elapsed * 11 + f.phase) * 0.08 + Math.sin(elapsed * 17.3 + f.phase * 0.6) * 0.05 : 0, fire = f.live * 1.05;
        f.node.scale.x = f.node.scale.z = f.size * fire;
        f.node.scale.y = f.size * fire * (1 + flick);
      }
      wasActive = active;
    };

    const liveGeometry = (set) => {
      for (const c of chunks) for (let tier = 0; tier < 3; tier++) if (c.ready[tier] && c.meshes[tier]) set.add(c.meshes[tier]);
    };
    const ageText = (at) => {
      const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
      return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
    };
    const tip = (o) => {
      if (o.kind === "repo-bridge") return "Stone bridge · to Repo Island";
      if (o.kind === "repo-sign") return `${o.section.name} · ${o.count} totems · ${o.section.blurb}`;
      const repo = D.REPOS[o.index], merge = feed.state.repos[o.index], section = sections.get(repo.section).name;
      return merge.number ? `${repo.name} · ${section} · merged ${ageText(merge.changedAt)} · tap for the PR` : `${repo.name} · ${section} · tap for its repository`;
    };
    // The page a tap opens, or null where a tap only says what it is.
    const open = (o) => {
      if (o.kind !== "repo-totem") return null;
      return feed.state.repos[o.index].url || `https://github.com/${D.REPOS[o.index].repo}`;
    };
    // Where on the island (its top's disc, up to a few metres under it) and on its bridge a body at feet height stands.
    const onIsland = (x, feet, z) => {
      const dx = x - spot.x, dz = z - spot.z;
      return dx * dx + dz * dz < (M.ISLE.R + 0.5) ** 2 && feet > spot.y - 3;
    };
    const onBridge = (x, feet, z) => {
      const lx = x - spot.x, lz = z - spot.z;
      return Math.abs(lx) <= bridge.width / 2 && lz >= bridge.from + 0.6 && lx * lx + lz * lz > M.ISLE.R * M.ISLE.R && lz < 0 && feet > spot.y - 3;
    };
    const dispose = () => {
      disposed = true;
      cancel();
      job = null;
      unsubscribe();
      for (const node of targets) hooks.removeTarget(node);
      targets.length = 0;
      if (group.parent) removeChild(group.parent, group);
    };
    const stats = () => ({ chunks: chunks.length, built, tiers: chunks.map((c) => c.tier).join(""), wants: chunks.map((c) => c.want).join(""), preps: chunks.map((c) => c.prep).join(""),
      lit: totems.filter((o) => o.live).length, flames: flames.filter((f) => f.node.visible).length, active, targets: targets.length, angle });
    return { spot, group, solids: [soil, stone], lamps, glass, claims, arrival, view, start, pause, turn, carry, update, liveGeometry, tip, open, onIsland, onBridge, dispose, stats,
      bridgeEnds: { from: world(0, 0, bridge.from + 0.6), to: world(0, 0, bridge.to - 0.9) } };
  };
  BL.repoIsland = { create };
})();
