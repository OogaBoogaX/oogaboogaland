// Merge Rock at work in the hub (repo-island-models.js builds it): the rock, the bridge and the section signs are made
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
// the page is hidden: first every chunk at its `distant` detail with its runes and eyes (about a hundred
// milliseconds in all), each chunk joining the island as it is done; then, only for a view that comes near, a chunk's
// `far` and `near` carvings, built and uploaded (`renderer.prepareGeometry`) before the chunk is switched to them.
// Each frame `update` picks every chunk's detail by the view's distance from it (near within NEAR, far within FAR,
// with some slack so a view at the edge does not flicker), readying each finer detail from further out (NEAR_PREP,
// FAR_PREP) so a walk in never waits on one; a view that leaves the island lets its far and near meshes go from the
// GPU (they stay out of `liveGeometry`), so the main island holds only the distant ones and the nearest few far ones.
//
// A totem lights for `repoFeed.RECENT` after its repository merges a pull request (`repo-feed.js`), as the meadow's do:
// its runes glow in its section's rhythm and the crystals under it glow, waning to 60% by the day's end, and every face's
// eyes burn, each flame a node on the arcade's one `blaze` geometry, at every carving detail and view distance. Each crystal cluster under the island
// glows across its outer facets with distance-weighted light from nearby totems. Eight baked strength levels
// share one mesh per source totem and follow that source's own pulse; meshes rebuild only when membership changes. The lit runes of a chunk are merged into one mesh a brightness band
// (fresh within FRESH, older), rebuilt only when that chunk's lit set changes, so 170 totems light in a few dozen draws.
// Painted features pulse on their matching detail mesh, and the mainland's traveling ring glow uses one instanced
// sector batch per paint. Warm point lights follow the turning poles through the hub's existing light budget.
// A merge seen during the visit flares that totem's runes for FLARE seconds. Effects stay animated at every
// camera distance; the renderer handles frustum culling. ACTIVE only describes proximity in the debug stats.
//
// `create({ island, renderer, hooks })` returns the site; `hooks` are the hub's: `addTarget(node,
// owner, opts)`, `removeTarget(node)`, `addTotemSolid(node)`, `addTotemLight(index)`, `updateTotemLight(lamp, x, y, z, power, radius)`, `visible()` (the hub is showing, for idle work) and `near()` (the visitor is on
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
    const preciseNode = createNode(), preciseHit = {};
    addChild(pivot, preciseNode);
    const precise = BL.weaponTargets.create([{ node: preciseNode, owner: { weaponType: "none" } }]);
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
      glyphs: null, eyes: null, features: [null, null, null], ranges: [null, null, null], mask: 0, partial: null, partialTier: -1, lit: "", buckets: [null, null], level: [0, 0] }));
    const totems = P.totems.map((t) => ({ t, chunk: null, slot: 0, live: 0, hidden: false, opacity: 1, fadeBody: null, fadeTier: -1, fadeRunes: null, features: null, ringBatch: null,
      pattern: BL.totemGlow.pattern(({ blocks: "CORE", strike: "LND", flow: "BTCPAY" })[RHYTHM_OF[t.section]] || "CLN"),
      lamp: null, arcs: Array.from({ length: BL.totemModels.RING_SEGMENTS }, (_, k) => {
        const a = t.ry - k / BL.totemModels.RING_SEGMENTS * Math.PI * 2;
        return { c: Math.cos(a), s: Math.sin(a), u: ((k - BL.totemModels.RING_SEGMENTS / 4 + BL.totemModels.RING_SEGMENTS) % BL.totemModels.RING_SEGMENTS + 0.5) / BL.totemModels.RING_SEGMENTS };
      }) }));
    // A single sector geometry per paint, instanced across every ring with a fixed, bounded buffer. The matrices
    // are world-space (explicit batches bypass the scene graph's transform), including the island's current turn.
    const ringBatches = [];
    if (!canvas) {
      const paints = new Map();
      for (const o of totems) {
        const paint = o.t.design.paint;
        let batch = paints.get(paint);
        if (!batch) { batch = { paint, capacity: 0, node: null, owners: null }; paints.set(paint, batch); ringBatches.push(batch); }
        batch.capacity += o.t.L.rings.length * BL.totemModels.RING_SEGMENTS;
        o.ringBatch = batch;
      }
      for (const b of ringBatches) {
        b.owners = new Uint16Array(b.capacity);
        const geometry = BL.totemModels.ringSectorOf({ w: 1, s: 1, design: { paint: b.paint } });
        b.node = createNode({ geometry, visible: false, sightHidden: true, instanceData: new Float32Array(b.capacity * 20),
          instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, cullSphere: new Float32Array([spot.x, spot.y + 3.5, spot.z, M.ISLE.R + 7]) });
        addChild(group, b.node);
      }
    }
    chunks.forEach((c) => c.list.forEach((at, slot) => { totems[at].chunk = c; totems[at].slot = slot; }));
    const join = (c, built) => {
      c.meshes[0] = built.mesh;
      c.glyphs = built.glyphs;
      c.eyes = built.eyes;
      c.features[0] = built.features;
      c.ranges[0] = built.ranges;
      c.ready[0] = true;
      // A separate, stable collider follows the island even when the first-person visual fades.
      hooks.addTotemSolid(createNode({ parent: spin, geometry: built.mesh }));
      c.node = createNode({ geometry: built.mesh, sightHidden: true });
      addChild(spin, c.node);
      c.list.forEach((at) => {
        const o = totems[at], t = o.t;
        o.features = createNode({ geometry: built.features[o.slot], glow: 0, visible: false, sightHidden: true });
        addChild(spin, o.features);
        o.lamp = hooks.addTotemLight(t.index);
        const owner = { kind: "repo-totem", index: t.index, at, weaponType: "none" };
        // Share the rendered vertices; build a face subset and its BVH only when picked at a new detail.
        let pickMesh = null, pickTier = -1;
        owner.pickRay = (ray) => {
          if (o.opacity <= 0) return Infinity;
          if (pickTier !== c.tier) {
            pickTier = c.tier;
            pickMesh = M.without(c.meshes[c.tier], c.ranges[c.tier], ((1 << c.list.length) - 1) ^ (1 << o.slot));
          }
          preciseNode.geometry = pickMesh;
          return precise.ray(preciseHit, ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, Infinity, null, null, true) ? preciseHit.distance : Infinity;
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
        else {
          job.c.meshes[job.tier] = step.value.mesh;
          job.c.features[job.tier] = step.value.features;
          job.c.ranges[job.tier] = step.value.ranges;
        }
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
    let litDirty = true, litVersion = -1, litChecked = 0, flare = null, flareOwner = null, flareLeft = 0, active = false, gemKey = "";
    const cluster = M.crystals(), gemBands = Array(P.totems.length).fill(null);
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
      // Crystal membership depends on the feed, not on which carving has finished its idle build.
      for (const o of totems) o.live = liveOf(o.t.index, now);
      let fire = 0;
      for (const c of chunks) {
        if (!c.glyphs) continue;
        const bands = [[], []];
        let key = "";
        c.list.forEach((at, slot) => {
          const live = totems[at].live;
          if (!live) return;
          const band = DEBUG_GLOW || now - feed.state.repos[P.totems[at].index].changedAt < FRESH ? 0 : 1;
          if (!totems[at].hidden) { bands[band].push(slot); key += `${slot}:${band},`; }
          for (const [x, y, z, size] of c.eyes[slot]) {
            const f = flameAt(fire++);
            f.node.position.x = x; f.node.position.y = y; f.node.position.z = z;
            f.size = size; f.live = live; f.chunk = c; f.totem = totems[at]; f.u = y / P.totems[at].L.apex; f.node.visible = true;
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
      // Smooth distance-weighted light from the totems above. A small ambient denominator lets
      // isolated light taper to zero; nearby dark totems soften the transition between lit patches.
      const bands = Array.from({ length: P.totems.length }, () => []);
      let key = "";
      cluster.forEach((c, k) => {
        let lit = 0, weight = 0.5, strongest = 0, source = -1;
        for (const at of c.neighbours) {
          const o = totems[at], d = Math.hypot(o.t.x - c.x, o.t.z - c.z);
          const t = Math.max(0, 1 - d / M.CRYSTAL.lightRange), w = t * t * (3 - 2 * t);
          const contribution = o.live * w;
          lit += contribution; weight += w;
          if (contribution > strongest) { strongest = contribution; source = at; }
        }
        const strength = lit / weight;
        if (strength < 0.025) return;
        const band = Math.min(M.CRYSTAL.lightBands - 1, Math.floor(strength * M.CRYSTAL.lightBands));
        bands[source].push(M.gem(k, band));
        key += `${k}:${source}:${band},`;
      });
      if (key !== gemKey) {
        gemKey = key;
        bands.forEach((list, band) => {
          if (!list.length) { if (gemBands[band]) gemBands[band].visible = false; return; }
          const geometry = BL.models.noShadow(BL.models.merge(...list));
          geometry.depthOffset = true;
          if (!gemBands[band]) { gemBands[band] = createNode({ geometry, glow: 0, sightHidden: true }); addChild(spin, gemBands[band]); }
          else gemBands[band].geometry = geometry;
          gemBands[band].visible = true;
        });
      }
    };
    const onFeed = (event) => {
      litDirty = true;
      if (!event.fresh) return;
      const t = totems.find((o) => o.t.index === event.index);
      if (!t || !t.chunk || !t.chunk.glyphs) return;
      if (!flare) { flare = createNode({ geometry: t.chunk.glyphs[t.slot], glow: 0, sightHidden: true }); addChild(spin, flare); }
      flareOwner = t;
      flare.geometry = t.chunk.glyphs[t.slot];
      flare.visible = true;
      flareLeft = FLARE;
      if (hooks.near()) hooks.toast(`${D.REPOS[event.index].name} just merged · its totem blazes on Merge Rock`);
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
          for (const at of c.list) totems[at].features.geometry = c.features[tier][totems[at].slot];
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
      // Glow does not disappear with carving detail or camera distance. The renderer culls off-screen effects.
      for (const f of flames) f.node.visible = !!f.chunk && !f.totem.hidden;
      // Lights stay on the rotating poles even while the view is away. Their colors and range feed the hub's
      // existing nearest-first light budget, with the same warm pulse as the mainland, scaled to each carving.
      for (const o of totems) {
        if (!o.lamp) continue;
        const p = o.t, time = elapsed, v = o.pattern(0.5, time + p.index * 3.1, p.index);
        const breath = 0.5 + 0.5 * Math.sin(time * 1.8 + p.index * 1.7);
        const power = (0.45 + 0.1 * breath + 0.8 * o.live * (0.3 + 0.7 * v)) * o.live * p.importance;
        hooks.updateTotemLight(o.lamp, spot.x + p.x * cos + p.z * sin, spot.y + p.L.apex * 0.35,
          spot.z - p.x * sin + p.z * cos, power, o.live ? (4 + 2.5 * o.live) * Math.max(0.4, p.importance) : 0);
      }
      // Rebuild the fixed-capacity world-space ring batches for this frame's turn.
      for (const b of ringBatches) { b.node.instanceCount = 0; b.node.visible = false; }
      const t = elapsed;
      for (const c of chunks) for (let band = 0; band < 2; band++) {
        const node = c.buckets[band];
        if (!node || !node.visible) continue;
        const section = P.totems[c.list[0]].section, rhythm = RHYTHMS[RHYTHM_OF[section] || "ripple"](t + c.k * 1.3, c.k), power = c.level[band];
        node.glow = (0.45 + 0.55 * rhythm) * power;
        node.highlight = (0.45 + 1.6 * rhythm) * power;
      }
      for (const o of totems) {
        if (!o.features) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + o.t.index * 1.7), glow = o.live * 0.38 * pulse * pulse;
        o.features.visible = glow > 0.02;
        o.features.glow = glow;
        o.features.highlight = glow * 0.55;
        if (!o.live) continue;
        const p = o.t, L = p.L, node = o.ringBatch.node, data = node.instanceData;
        const x = spot.x + p.x * cos + p.z * sin, z = spot.z - p.x * sin + p.z * cos;
        for (let level = 0; level < L.rings.length; level++) for (const arc of o.arcs) {
          const lit = o.live * BL.totemGlow.ring(arc.u, t + p.index * 3.1, level);
          if (lit <= 0.01) continue;
          o.ringBatch.owners[node.instanceCount] = p.index;
          const offset = node.instanceCount++ * 20, c = cos * arc.c - sin * arc.s, sn = sin * arc.c + cos * arc.s;
          data[offset] = c * L.w; data[offset + 1] = 0; data[offset + 2] = -sn * L.w; data[offset + 3] = 0;
          data[offset + 4] = 0; data[offset + 5] = L.s; data[offset + 6] = 0; data[offset + 7] = 0;
          data[offset + 8] = sn * L.w; data[offset + 9] = 0; data[offset + 10] = c * L.w; data[offset + 11] = 0;
          data[offset + 12] = x; data[offset + 13] = spot.y + L.rings[level]; data[offset + 14] = z; data[offset + 15] = 1;
          data[offset + 16] = lit; data[offset + 17] = 2.2 * lit; data[offset + 18] = 0; data[offset + 19] = 0;
        }
      }
      for (const b of ringBatches) { b.node.visible = b.node.instanceCount > 0; b.node.instanceVersion++; }
      // Each patch follows its strongest nearby lit totem's own fire/light rhythm and phase.
      // Per-face strength preserves the spatial taper while the node supplies that source's pulse.
      for (let at = 0; at < gemBands.length; at++) {
        const node = gemBands[at];
        if (!node?.visible) continue;
        const o = totems[at], index = o.t.index;
        const breath = 0.5 + 0.5 * Math.sin(t * 1.8 + index * 1.7);
        const fire = o.pattern(0.5, t + index * 3.1, index);
        node.glow = 0.25 + 0.5 * (0.3 * breath + 0.7 * fire);
      }
      for (let n = 0; n < flames.length; n++) {
        const f = flames[n];
        if (!f.node.visible) continue;
        const flick = Math.sin(elapsed * 11 + f.phase) * 0.08 + Math.sin(elapsed * 17.3 + f.phase * 0.6) * 0.05, fire = f.live * (0.75 + 0.75 * f.totem.pattern(f.u, t + f.totem.t.index * 3.1, f.totem.t.index));
        f.node.scale.x = f.node.scale.z = f.size * fire;
        f.node.scale.y = f.size * fire * (1 + flick);
      }
    };

    const opacityByIndex = new Float32Array(P.totems.length);
    // Called after the pilot and every camera override, so a moving head never clips for a frame. Chunk masks
    // affect only intersected totems; their neighbours, the ground and the island's lighting remain in place.
    const afterCamera = (camera, firstPerson) => {
      const wx = camera.position.x - spot.x, wz = camera.position.z - spot.z;
      const x = wx * cos - wz * sin, y = camera.position.y - spot.y, z = wx * sin + wz * cos;
      let changed = false;
      for (const c of chunks) {
        if (!c.node) continue;
        let mask = 0;
        for (const at of c.list) {
          const o = totems[at], p = o.t, dx = x - p.x, dz = z - p.z, cr = Math.cos(p.ry), sr = Math.sin(p.ry);
          const opacity = firstPerson ? BL.totemModels.eyeOpacity(p.L, dx * cr - dz * sr, y, dx * sr + dz * cr) : 1;
          const hidden = opacity < 1;
          if (hidden !== o.hidden) changed = true;
          o.hidden = hidden; o.opacity = opacity; opacityByIndex[p.index] = opacity;
          o.features.smokeOpacity = opacity;
          if (hidden) {
            mask |= 1 << o.slot;
            if (!o.fadeBody) {
              o.fadeBody = createNode({ sightHidden: true, visible: false });
              o.fadeRunes = createNode({ geometry: c.glyphs[o.slot], sightHidden: true, visible: false });
              addChild(spin, o.fadeBody, o.fadeRunes);
            }
            if (o.fadeTier !== c.tier) {
              o.fadeTier = c.tier;
              o.fadeBody.geometry = M.without(c.meshes[c.tier], c.ranges[c.tier], ((1 << c.list.length) - 1) ^ (1 << o.slot));
            }
            o.fadeBody.smokeOpacity = o.fadeRunes.smokeOpacity = opacity;
            o.fadeBody.visible = opacity > 0;
            o.fadeRunes.visible = opacity > 0 && o.live > 0;
            const source = c.buckets[0] || c.buckets[1];
            o.fadeRunes.glow = source ? source.glow : o.live;
            o.fadeRunes.highlight = source ? source.highlight : o.live;
          } else if (o.fadeBody) o.fadeBody.visible = o.fadeRunes.visible = false;
        }
        if (mask !== c.mask || mask && c.partialTier !== c.tier) {
          c.mask = mask; c.partialTier = c.tier;
          c.partial = mask ? M.without(c.meshes[c.tier], c.ranges[c.tier], mask) : null;
        }
        c.node.geometry = c.partial || c.meshes[c.tier];
      }
      if (changed) relight(Date.now());
      for (const f of flames) {
        f.node.visible = !!f.chunk && f.totem.opacity > 0;
        f.node.smokeOpacity = f.totem.opacity;
      }
      if (flare) { flare.visible = flareLeft > 0 && flareOwner.opacity > 0; flare.smokeOpacity = flareOwner.opacity; }
      for (const b of ringBatches) {
        const node = b.node, data = node.instanceData;
        let count = 0;
        for (let n = 0; n < node.instanceCount; n++) {
          const opacity = opacityByIndex[b.owners[n]];
          if (opacity <= 0) continue;
          data[n * 20 + 18] = opacity < 1 ? -1 - opacity : 0;
          if (count !== n) { data.copyWithin(count * 20, n * 20, (n + 1) * 20); b.owners[count] = b.owners[n]; }
          count++;
        }
        node.instanceCount = count; node.instanceVersion++;
        node.visible = count > 0;
      }
    };

    const liveGeometry = (set) => {
      for (const c of chunks) for (let tier = 0; tier < 3; tier++) if (c.ready[tier] && c.meshes[tier]) {
        set.add(c.meshes[tier]);
        for (const geometry of c.features[tier]) set.add(geometry);
      }
    };
    const ageText = (at) => {
      const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
      return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
    };
    const tip = (o) => {
      if (o.kind === "repo-bridge") return "Stone bridge · to Merge Rock";
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
      lit: totems.filter((o) => o.live).length, hidden: totems.filter((o) => o.hidden).length, flames: flames.filter((f) => f.node.visible).length, features: totems.filter((o) => o.features?.visible).length, rings: ringBatches.reduce((n, b) => n + b.node.instanceCount, 0),
      ringDraws: ringBatches.filter((b) => b.node.visible).length, lights: totems.filter((o) => o.lamp?.always).length,
      crystalGlow: gemBands.map(n => n?.visible ? n.glow : 0),
      active, targets: targets.length, angle });
    return { spot, group, solids: [soil, stone], lamps, glass, claims, arrival, view, start, pause, turn, carry, update, afterCamera, liveGeometry, tip, open, onIsland, onBridge, dispose, stats,
      bridgeEnds: { from: world(0, 0, bridge.from + 0.6), to: world(0, 0, bridge.to - 0.9) } };
  };
  BL.repoIsland = { create };
})();
