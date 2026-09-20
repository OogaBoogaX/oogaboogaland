// Zuzu's DSB-only body and authority boundary. Brains receive data, never scene nodes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild, traverseVisible } = BL.scene;
  const { clamp } = BL.math, M = BL.dsbModels;
  const HOME = 0, RADIUS = 0.42, CAPACITY = 64;
  const POINTS = Object.freeze([
    Object.freeze({ id: "arrival", x: -4, z: 23 }), Object.freeze({ id: "perch", x: -11, z: 23 }),
    Object.freeze({ id: "snack_watch", x: -19, z: 23 }), Object.freeze({ id: "west", x: -25, z: 14 }),
    Object.freeze({ id: "west_lane", x: -26, z: 7 }), Object.freeze({ id: "shop_lane", x: -16, z: 7 }),
    Object.freeze({ id: "courtyard", x: -4, z: 7 }), Object.freeze({ id: "east_lane", x: 5, z: 7 }),
    Object.freeze({ id: "garden", x: 14, z: 7 }), Object.freeze({ id: "east", x: 15, z: 17 }),
    Object.freeze({ id: "watch", x: 0, z: 18 })
  ]);
  const FIELDS = Object.freeze({ say: "text", walk_to: "destination", follow_player: "", stop_following: "", look_at: "entity", approach: "entity", flee: "", gesture: "name" });
  let visitSerial = 0, fur, earGeometry;
  const model = () => {
    if (!fur) {
      fur = BL.models.lathe({ profile: [[0, -0.5], [0.35, -0.35], [0.5, 0], [0.35, 0.35], [0, 0.5]], segments: 8, color: "#191b24" });
      earGeometry = { verts: [-0.15, 0, -0.08, 0.15, 0, -0.08, 0, 0.37, 0, -0.15, 0, 0.1, 0.15, 0, 0.1], faces: [
        { i: [0, 2, 1], color: [21, 23, 31] }, { i: [3, 4, 2], color: [34, 35, 44] },
        { i: [0, 3, 2], color: [16, 18, 24] }, { i: [1, 2, 4], color: [16, 18, 24] }, { i: [0, 1, 4, 3], color: [16, 18, 24] }
      ], lines: [] };
    }
    const root = createNode(), body = createNode(), head = createNode({ position: { x: 0, y: 0.84, z: 0.48 } });
    addChild(root, body, head);
    const round = (parent, x, y, z, w, h, d) => { const n = createNode({ geometry: fur, position: { x, y, z }, scale: { x: w, y: h, z: d } }); addChild(parent, n); return n; };
    round(body, 0, 0.58, -0.08, 0.64, 0.65, 1.12);
    round(head, 0, 0, 0, 0.68, 0.58, 0.53);
    for (const side of [-1, 1]) {
      addChild(head, createNode({ geometry: earGeometry, position: { x: side * 0.23, y: 0.18, z: -0.03 }, rotation: { x: 0, y: 0, z: -side * 0.12 } }));
      M.block(head, "#b68a20", side * 0.165, 0.025, 0.235, 0.19, 0.17, 0.06, 0.25);
      M.block(head, "#f4ce50", side * 0.165, 0.035, 0.272, 0.14, 0.13, 0.025, 0.4);
      M.block(head, "#090a10", side * 0.165, 0.035, 0.29, 0.033, 0.14, 0.025);
      M.block(head, "#fff1b0", side * 0.165 - 0.03, 0.065, 0.308, 0.03, 0.03, 0.018, 0.35);
      round(head, side * 0.075, -0.13, 0.24, 0.19, 0.12, 0.13);
      for (let i = 0; i < 2; i++) { const whisker = M.block(head, "#686570", side * 0.24, -0.1 - i * 0.06, 0.28, 0.26, 0.014, 0.014); whisker.rotation.z = side * (0.13 - i * 0.26); }
    }
    M.block(head, "#55434d", 0, -0.09, 0.32, 0.07, 0.045, 0.035);
    M.block(head, "#69436e", 0, -0.23, -0.02, 0.4, 0.055, 0.38);
    const tag = M.block(head, "#d5a643", 0, -0.3, 0.2, 0.13, 0.13, 0.025);
    tag.rotation.z = 0.15;
    const legs = [];
    for (const z of [0.34, -0.43]) for (const x of [-0.23, 0.23]) {
      const leg = createNode({ position: { x, y: 0.44, z } }); addChild(root, leg);
      round(leg, 0, -0.18, 0, 0.19, 0.42, 0.21); round(leg, 0, -0.36, 0.055, 0.23, 0.14, 0.3); legs.push(leg);
    }
    const tail = createNode({ position: { x: 0, y: 0.69, z: -0.55 }, rotation: { x: -0.35, y: 0, z: 0 } }); addChild(root, tail);
    round(tail, 0, 0.27, -0.1, 0.14, 0.6, 0.16);
    round(tail, 0, 0.58, -0.06, 0.13, 0.25, 0.17);
    round(tail, 0, 0.66, 0.06, 0.12, 0.14, 0.25);
    return { root, head, body, legs, tail };
  };
  const create = ({ parent, input, clearAt, brain = BL.dsbAgentBrain.create() }) => {
    const cat = model(), p = cat.root.position, visit = ++visitSerial;
    p.x = POINTS[HOME].x; p.z = POINTS[HOME].z;
    addChild(parent, cat.root);
    const targets = [], owner = { kind: "dsb-agent", id: "zuzu", label: "Zuzu · she supervises the snacks" };
    traverseVisible(cat.root, node => { if (node.geometry) { input.add(node, owner); targets.push(node); } });
    const memory = Array.from({ length: CAPACITY }, () => ({ seq: 0, time: 0, type: "", entity: "player", value: 0 }));
    const state = { tomatoHits: 0, nearbyShots: 0, weaponHits: 0, greeted: false, foodInterest: 0, mood: "content", intent: "sit" };
    const sense = { name: "", x: 0, y: 0, z: 0, food: 0, active: false };
    let conversing = false, conversationLine = "";
    let seq = 0, count = 0, now = 0, disposed = false, nearPlayer = false, hadFood = false, sampleAt = 0;
    let lastRequest = 0, rateAt = 0, rateCount = 0, sayAt = -10, talkAt = -10, shotAt = -10, threatUntil = 0;
    let text = "", textUntil = 0, gait = 0, sit = 1, flinch = 0, gesture = "sit", gestureUntil = 0;
    let tx = p.x, tz = p.z, followUntil = 0, lookUntil = 0;
    const size = POINTS.length, costs = new Float64Array(size), first = new Int16Array(size), visited = new Uint8Array(size), edges = new Float64Array(size * size);
    const allowed = (x, z) => z >= 6 && z <= 26 && Math.hypot(x, z) <= 29 && Math.hypot(x - 7, z - 24) > 5 && clearAt(x, z, RADIUS);
    const segment = (ax, az, bx, bz) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.18));
      for (let i = 0; i <= n; i++) if (!allowed(ax + (bx - ax) * i / n, az + (bz - az) * i / n)) return false;
      return true;
    };
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) edges[i * size + j] = i !== j && segment(POINTS[i].x, POINTS[i].z, POINTS[j].x, POINTS[j].z) ? Math.hypot(POINTS[i].x - POINTS[j].x, POINTS[i].z - POINTS[j].z) : Infinity;
    const record = (type, value = 0) => {
      const row = memory[seq % CAPACITY]; row.seq = ++seq; row.time = now; row.type = type; row.entity = "player"; row.value = value; count = Math.min(CAPACITY, count + 1);
    };
    // Copies exist only at the brain boundary/debug reads, never in the animation loop.
    const snapshot = () => Object.freeze({ visit, nextRequestId: lastRequest + 1, time: now, active: sense.active, near: nearPlayer,
      player: Object.freeze({ id: "player", name: sense.name, x: sense.x, y: sense.y, z: sense.z, food: sense.food }),
      self: Object.freeze({ id: "zuzu", name: "Zuzu", pronouns: "she/her", x: p.x, z: p.z, ...state }),
      events: Object.freeze(Array.from({ length: count }, (_, i) => Object.freeze({ ...memory[(seq - count + i) % CAPACITY] }))) });
    const setIntent = (intent) => { if (state.intent === "follow" && intent !== "follow") record("follow_stopped"); if (intent === "follow" && state.intent !== "follow") record("follow_started"); state.intent = intent; };
    const request = (a) => {
      if (disposed) return "disposed";
      if (!a || typeof a !== "object" || Array.isArray(a) || typeof a.type !== "string" || !Object.hasOwn(FIELDS, a.type)) return "invalid_action";
      const field = FIELDS[a.type];
      for (const key of Object.keys(a)) if (key !== "visit" && key !== "id" && key !== "at" && key !== "type" && (!field || key !== field)) return "invalid_field";
      if (a.visit !== visit || !Number.isSafeInteger(a.id) || a.id <= lastRequest || !Number.isFinite(a.at) || a.at > now + 0.1 || now - a.at > 3) return "stale";
      if (a.type === "say" && (typeof a.text !== "string" || !a.text.trim() || a.text.length > 160 || /[\u0000-\u001f\u007f]/.test(a.text))) return "invalid_text";
      if (a.type === "walk_to" && !POINTS.some(q => q.id === a.destination)) return "invalid_destination";
      if ((a.type === "look_at" || a.type === "approach") && a.entity !== "player") return "invalid_entity";
      if (a.type === "gesture" && !["sit", "stand", "blink", "stretch", "tail_flick"].includes(a.name)) return "invalid_gesture";
      lastRequest = a.id;
      if (!sense.active) return "inactive";
      if (now - rateAt >= 1) { rateAt = now; rateCount = 0; }
      if (++rateCount > 8) return "rate_limited";
      if (now < threatUntil && a.type !== "say" && a.type !== "flee") return "busy_fleeing";
      if (a.type === "say") {
        if (now - sayAt < 3) return "speech_cooldown";
        text = a.text.trim(); textUntil = now + 5; sayAt = now;
        if (!state.greeted && nearPlayer) { state.greeted = true; record("player_greeted"); }
      } else if (a.type === "walk_to") {
        const q = POINTS.find(q => q.id === a.destination); tx = goalX = q.x; tz = goalZ = q.z; routeAt = 0; setIntent("walk");
      } else if (a.type === "follow_player") { followUntil = now + 24; setIntent("follow"); }
      else if (a.type === "stop_following") setIntent("sit");
      else if (a.type === "look_at") { lookUntil = now + 5; if (state.intent === "sit" || state.intent === "idle") setIntent("look_at_player"); }
      else if (a.type === "approach") setIntent("approach");
      else if (a.type === "gesture") { gesture = a.name; gestureUntil = now + 2; if (a.name === "sit" || a.name === "stand") setIntent(a.name === "sit" ? "sit" : "idle"); }
      else if (a.type === "flee") {
        let best = -Infinity;
        for (const q of POINTS) { const score = Math.hypot(q.x - sense.x, q.z - sense.z) - Math.hypot(q.x - p.x, q.z - p.z) * 0.3; if (score > best) { best = score; tx = q.x; tz = q.z; } }
        goalX = tx; goalZ = tz; routeAt = 0; threatUntil = now + 6; setIntent("flee");
      }
      return "accepted";
    };
    const notify = (type) => { if (!disposed && sense.active && !conversing) brain.observe(snapshot(), type, request); };
    const event = (type) => {
      if (disposed || !sense.active) return;
      if (type === "tomato_hit") { state.tomatoHits++; state.mood = "offended"; flinch = 1; }
      else if (type === "weapon_hit") { state.weaponHits++; state.mood = "alarmed"; flinch = 1; }
      else if (type === "shot_nearby") { if (now - shotAt < 0.5) return; shotAt = now; state.nearbyShots++; state.mood = "alarmed"; }
      else if (type === "food_activity") { if (Math.hypot(p.x - sense.x, p.z - sense.z) > 8) return; state.foodInterest = 1; }
      else return;
      record(type); notify(type);
    };
    const distanceToSegment = (ax, ay, az, bx, by, bz) => {
      const dx = bx - ax, dy = by - ay, dz = bz - az, length = dx * dx + dy * dy + dz * dz;
      const t = length ? clamp(((p.x - ax) * dx + (0.65 - ay) * dy + (p.z - az) * dz) / length, 0, 1) : 0;
      return Math.hypot(ax + dx * t - p.x, ay + dy * t - 0.65, az + dz * t - p.z);
    };
    const tomato = (ax, ay, az, bx, by, bz) => { if (!sense.active || distanceToSegment(ax, ay, az, bx, by, bz) > 0.65) return false; event("tomato_hit"); return true; };
    const projectile = (ax, ay, az, bx, by, bz) => { if (sense.active && distanceToSegment(ax, ay, az, bx, by, bz) < 2.1) event("shot_nearby"); };
    const talk = () => { if (!sense.active || Math.hypot(p.x - sense.x, p.z - sense.z) > 3.5 || now - talkAt < 3) return false; talkAt = now; notify("talk"); return true; };
    const setConversation = value => {
      if (disposed) return;
      conversing = value; conversationLine = ""; setIntent(value ? "look_at_player" : "sit");
    };
    const conversationContext = () => {
      let location = "dsb_land", distance = 8;
      for (const q of POINTS) { const d = Math.hypot(q.x - sense.x, q.z - sense.z); if (d < distance) { distance = d; location = q.id; } }
      return { playerName: sense.name, location, mood: state.mood, foodCount: sense.food, recentEvents: snapshot().events };
    };
    const sayConversation = value => {
      if (disposed || !conversing || typeof value !== "string" || !value.trim() || value.length > 1000) return false;
      // The panel retains the full answer; the world bubble stays readable on mobile.
      const line = value.replace(/\s+/g, " ").trim(); conversationLine = line.length > 160 ? line.slice(0, 157) + "…" : line; return true;
    };
    // Route using a small prebuilt DSB visibility graph, then sweep every actual step.
    const route = (gx, gz) => {
      if (segment(p.x, p.z, gx, gz)) { tx = gx; tz = gz; return true; }
      visited.fill(0); first.fill(-1);
      for (let i = 0; i < size; i++) { const q = POINTS[i]; costs[i] = segment(p.x, p.z, q.x, q.z) ? Math.hypot(q.x - p.x, q.z - p.z) : Infinity; first[i] = i; }
      for (let n = 0; n < size; n++) {
        let k = -1, best = Infinity;
        for (let i = 0; i < size; i++) if (!visited[i] && costs[i] < best) { best = costs[i]; k = i; }
        if (k < 0) break; visited[k] = 1;
        for (let j = 0; j < size; j++) if (costs[k] + edges[k * size + j] < costs[j]) { costs[j] = costs[k] + edges[k * size + j]; first[j] = first[k]; }
      }
      let k = -1, best = Infinity;
      for (let i = 0; i < size; i++) { const q = POINTS[i], score = costs[i] + Math.hypot(q.x - gx, q.z - gz); if (score < best && segment(q.x, q.z, gx, gz)) { best = score; k = first[i]; } }
      if (k < 0) return false; tx = POINTS[k].x; tz = POINTS[k].z; return true;
    };
    let goalX = p.x, goalZ = p.z, routeAt = 0;
    const update = (dt, time, perception) => {
      if (disposed) return;
      now = time; sense.name = perception.name; sense.x = perception.x; sense.y = perception.y; sense.z = perception.z; sense.food = perception.food; sense.active = perception.active;
      if (!sense.active) { if (state.intent === "follow") setIntent("sit"); return; }
      if (conversing && conversationLine && now >= sayAt + 3) {
        const result = request({ visit, id: lastRequest + 1, at: now, type: "say", text: conversationLine });
        if (result === "accepted") conversationLine = "";
      }
      const distance = Math.hypot(p.x - sense.x, p.z - sense.z);
      state.foodInterest = Math.max(0, state.foodInterest - dt * 0.025);
      if (now >= sampleAt) {
        sampleAt = now + 0.5;
        if (!nearPlayer && distance < 5.5) { nearPlayer = true; record("player_seen"); notify("player_seen"); }
        else if (nearPlayer && distance > 8) { nearPlayer = false; record("player_left"); }
        const food = distance < 8 && sense.food > 0;
        if (food && !hadFood) { state.foodInterest = 1; record("food_seen", Math.min(18, sense.food)); notify("food_seen"); } hadFood = food;
        notify("tick");
      }
      if (state.intent === "follow" && now > followUntil || state.intent === "flee" && now > threatUntil) { setIntent("sit"); state.mood = "watchful"; }
      const moving = state.intent === "walk" || state.intent === "follow" || state.intent === "approach" || state.intent === "flee";
      let speed = 0;
      if (moving) {
        if (now >= routeAt) {
          routeAt = now + 0.5;
          if (state.intent === "follow" || state.intent === "approach") {
            if (allowed(sense.x, sense.z)) { goalX = sense.x; goalZ = sense.z; }
            else { let best = Infinity; for (const q of POINTS) { const d = Math.hypot(q.x - sense.x, q.z - sense.z); if (d < best) { best = d; goalX = q.x; goalZ = q.z; } } }
          }
          if (!route(goalX, goalZ)) { setIntent("sit"); tx = p.x; tz = p.z; }
        }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), following = state.intent === "follow" || state.intent === "approach";
        if (d > 0.12 && (!following || distance > 2.2)) {
          const step = Math.min(d, (state.intent === "flee" ? 3.4 : 1.65) * dt), nx = p.x + dx / d * step, nz = p.z + dz / d * step;
          if (segment(p.x, p.z, nx, nz)) { p.x = nx; p.z = nz; speed = step / Math.max(dt, 0.001); cat.root.rotation.y += Math.atan2(Math.sin(Math.atan2(dx, dz) - cat.root.rotation.y), Math.cos(Math.atan2(dx, dz) - cat.root.rotation.y)) * Math.min(1, dt * 9); }
        } else if (!following && Math.hypot(p.x - goalX, p.z - goalZ) < 0.2 || state.intent === "approach" && distance <= 2.2) setIntent("sit");
      }
      const seated = !speed && (state.intent === "sit" || state.intent === "look_at_player");
      sit += ((seated ? 1 : 0) - sit) * Math.min(1, dt * 6); gait += speed * dt * 7; flinch = Math.max(0, flinch - dt * 3);
      cat.body.position.y = -sit * 0.13; cat.body.rotation.x = -sit * 0.32;
      cat.head.position.y = 0.84 + sit * 0.03 + flinch * 0.12;
      if (!speed && (nearPlayer || now < lookUntil)) { const turn = Math.atan2(sense.x - p.x, sense.z - p.z) - cat.root.rotation.y; cat.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 2); }
      const facing = Math.atan2(sense.x - p.x, sense.z - p.z) - cat.root.rotation.y;
      cat.head.rotation.y += ((nearPlayer || now < lookUntil ? clamp(Math.atan2(Math.sin(facing), Math.cos(facing)), -0.7, 0.7) : Math.sin(time * 0.4) * 0.12) - cat.head.rotation.y) * Math.min(1, dt * 5);
      cat.head.rotation.z = Math.sin(time * 0.6) * 0.045;
      cat.tail.rotation.z = Math.sin(time * (now < gestureUntil && gesture === "tail_flick" ? 7 : 1.4)) * 0.22;
      for (let i = 0; i < 4; i++) { cat.legs[i].rotation.x = speed ? Math.sin(gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5 : i > 1 ? -sit * 1.1 : 0; }
      cat.body.scale.z = now < gestureUntil && gesture === "stretch" ? 1.15 : 1;
      cat.head.scale.y = now < gestureUntil && gesture === "blink" ? 0.9 : 1;
    };
    const draw = (ctx, project, drawSpeech) => { if (disposed || !sense.active || now >= textUntil) return; const screen = project(p.x, 1.7, p.z); if (screen) drawSpeech(ctx, "Zuzu: " + text, screen.x, screen.y, Math.min(1, (textUntil - now) * 2)); };
    const dispose = () => { disposed = true; brain.dispose(); for (const node of targets) input.remove(node); targets.length = 0; removeChild(parent, cat.root); text = ""; count = seq = 0; };
    return { root: cat.root, update, draw, event, tomato, projectile, talk, request, snapshot, setConversation, conversationContext, sayConversation, fallbackReply: () => brain.reply(snapshot()), dispose, get dialogue() { return text; }, get disposed() { return disposed; } };
  };
  BL.dsbAgent = { create };
})();
