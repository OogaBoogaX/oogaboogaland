// The viewing chairs for Block Frenzy's live rounds: a row of plain chairs in a blank white space above the game, as
// light as a page can be. Loaded only when someone goes to watch (`data-defer="block-viewer"`). A viewer has no body,
// sends no input or position and is local to its own page; it receives the host's frames at half rate.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models;
  const COUNT = 5, GAP = 1.05, FOV = 50 * Math.PI / 180, ZOOM_MIN = 1, ZOOM_MAX = 3.5;
  // Where the seat is for a map, written into `out`: low over the near edge, far enough back that the whole field fits
  // the view at zoom 1, near edge at the bottom and far edge at the top. Scales with the map.
  const frame = (arena, out = {}) => {
    out.y = arena.L * 0.63; out.z = arena.L * 1.35;
    const near = Math.atan2(out.y, out.z - arena.L), far = Math.atan2(out.y, out.z + arena.L);
    out.down = (near + far) / 2;
    return out;
  };
  const SEAT = {};
  const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const zoomBy = (z, k) => clampZoom(z * k);
  // One frame of a zoom toward its target; under Calm the view goes straight there.
  const easeZoom = (cur, target, dt, calm) => calm ? target : cur + (target - cur) * Math.min(1, dt * 10);
  // How many captures happened since the last look, from the score a frame carries, so a skipped frame can't lose one
  // or count one twice. Nothing counts until the first frame has landed (`live`), and that first look only notes the
  // score: arriving partway through a round plays nothing. A score that drops is a new round.
  const newCaptures = (sim, seen, live = true) => {
    if (!live) return 0;
    const total = sim.score.blue + sim.score.red, was = seen.total;
    seen.total = total;
    return was < 0 || total < was ? 0 : total - was;
  };
  // Stolen blocks aren't a stat of the rules: a viewer counts each time it sees an Ooga take the other side's block off
  // its home stand, from the carrying and flag state every frame already holds, so passes and re-grabs don't count.
  // Counts from when the viewer sat down.
  const trackSteals = (sim, st) => {
    for (let i = 0; i < sim.actors.length; i++) {
      const a = sim.actors[i], other = !!a.carrying && a.carrying !== a.team;
      if (other && !st.was[i] && st.home[a.carrying]) st.count[i] = (st.count[i] || 0) + 1;
      st.was[i] = other;
    }
    st.home.blue = sim.flags.blue.state === "home"; st.home.red = sim.flags.red.state === "home";
  };
  // Each player or NPC with a stat this round, sorted by captures: captures, blocks stolen and splats landed (the same
  // captures and hits the results table shows). `seen` holds the last values: null while nothing changed, so it costs
  // nothing per frame; a new round's zeros empty the table.
  const statRows = (sim, st, seen) => {
    let changed = false;
    for (let i = 0; i < sim.actors.length; i++) {
      const a = sim.actors[i], key = i * 3, stolen = st.count[i] || 0;
      if (seen[key] !== a.captures || seen[key + 1] !== stolen || seen[key + 2] !== a.hits) { seen[key] = a.captures; seen[key + 1] = stolen; seen[key + 2] = a.hits; changed = true; }
    }
    if (!changed) return null;
    const rows = [];
    for (const a of sim.actors) { const stolen = st.count[a.id] || 0; if (a.captures || stolen || a.hits) rows.push({ id: a.id, team: a.team, captures: a.captures, stolen, hits: a.hits }); }
    return rows.sort((p, q) => q.captures - p.captures || q.stolen - p.stolen || q.hits - p.hits || p.id - q.id);
  };
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  // The scoreboard's words from the match state a viewer already holds, into `out`; true only when one changed.
  const fillBoard = (sim, out) => {
    const clock = sim.prep > 0 ? `Build ${Math.ceil(sim.prep)}` : fmtClock(sim.time), goal = `First to ${sim.target}`;
    if (out.blue === sim.score.blue && out.red === sim.score.red && out.clock === clock && out.goal === goal) return false;
    out.blue = sim.score.blue; out.red = sim.score.red; out.clock = clock; out.goal = goal;
    return true;
  };
  const buildChairs = (createNode, addChild, parent, arena) => {
    const seat = M.box({ w: 0.55, h: 0.08, d: 0.55, color: "#d9d9d9" }), back = M.box({ w: 0.55, h: 0.55, d: 0.08, color: "#d9d9d9" });
    const group = createNode();
    for (let i = 0; i < COUNT; i++) {
      const x = (i - (COUNT - 1) / 2) * GAP;
      addChild(group, createNode({ geometry: seat, position: { x, y: 0, z: 0 } }), createNode({ geometry: back, position: { x, y: 0.3, z: 0.25 } }));
    }
    addChild(parent, group);
    place(group, arena);
    return group;
  };
  // Below the camera and ahead of it, so the row sits along the bottom of the view and the field stays clear.
  const place = (group, arena) => { frame(arena, SEAT); group.position.y = SEAT.y - 3.4; group.position.z = SEAT.z - 2.1; };
  // The middle chair, looking down at the field; a drag looks about, and nothing else moves the view.
  const look = (camera, arena, yaw, pitch, setVec, zoom = 1) => {
    frame(arena, SEAT);
    camera.fov = FOV / zoom;
    const down = SEAT.down + pitch, turn = Math.PI + yaw;
    setVec(camera.position, 0, SEAT.y, SEAT.z);
    setVec(camera.target, Math.sin(turn) * Math.cos(down) * 60, SEAT.y - Math.sin(down) * 60, SEAT.z + Math.cos(turn) * Math.cos(down) * 60);
  };
  // A flat white backdrop in place of the sky: no clouds, sun disc, stars, fog or bloom to compute. Allocates nothing.
  const WHITE_KEYS = ["clear", "horizon", "zenith", "sky"];
  const white = (opts) => {
    for (let i = 0; i < WHITE_KEYS.length; i++) opts[WHITE_KEYS[i]].fill(1);
    opts.sea = null; opts.clouds = 0; opts.stars = 0; opts.bloomStrength = 0; opts.fogNear = 1e4; opts.fogFar = 2e4; opts.sunStrength = 0;
  };
  BL.blockViewer = { FOV, ZOOM_MIN, ZOOM_MAX, frame, place, buildChairs, look, white, clampZoom, zoomBy, easeZoom, fillBoard, newCaptures, trackSteals, statRows };
})();
