// Tess on the island (her rig is `tess.js`). She works the island's own machines with her beam; a few seconds after a
// visitor lands she notices them and comes to them, in front of their view and to one side, or ahead of the Ooga they
// drive. A visitor who is not signed in gets a quick look round the island; a signed-in one, once the page knows who
// they are, gets what is new since their last visit in this browser, and nothing at all when nothing is. A tour stops
// at each landmark: the view glides there each time the visitor goes on (the camera moves only on input), and she flies
// ahead and points her soft beam at it. She greets once a page; after that a tap on her brings the island tour. The
// view is the visitor's again when the tour ends.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const NAME = "Tess";
  const LINES = {
    greeting: "Hi! I'm Tess. New here? Want a quick look round the island?",
    again: "Want a look round the island?",
    declined: "No problem! Tap me any time for a tour.",
    pile: "This is the pile. Donations become bananas for the crew.",
    crew: "Every Ooga stands for one of the crew's contributors.",
    jumbotron: "The jumbotron shows the crew's activity, live.",
    totems: "The totems light up when Bitcoin Core, BTCPay, LND or CLN merge a PR.",
    timechain: "Out west, the Timechain Sphere: Sani's walk-in ball of light.",
    timechainWalls: "Its six inner walls light up with live Timechain Index data.",
    timechainBoards: "Bitcoin's distribution, address balances, UTXO sizes, ETF and exchange holdings, and the top ten holders.",
    timechainSani: "Sani's inside in his recliner. Walk in over the bridge, and tap him to spin his chair!",
    lab: "EntropyLab, the crew's lab. Donated bananas feed the Oogas who work there.",
    labInside: "Inside: dice to roll, cards to flip, flasks to stir and an air-gapped node.",
    labCrew: "Oogas who contributed lately are at work; the quiet ones chill or sleep.",
    bifrost: "Up the north pass, ₿IFRÖST: windows to other worlds.",
    factory: "The Lightning Factory: a live Lightning node, shown in 3D. My home!",
    factoryLines: "Each line is a channel. Payments ride through the core as glowing sats.",
    factoryForge: "The forge opens and closes channels on-chain, and tips at the kiosk come out as bananas.",
    arcade: "Ooga Arcade: games, tickets and prizes.",
    mempool: "The vine bridge leads to the Mempool island: the live Bitcoin mempool.",
    mempoolWeather: "Arriving transactions make its weather, from dry to downpour.",
    mempoolLake: "Everything waiting fills its lake. A deep backlog floods the shore and spills over the cliffs.",
    mempoolBlock: "Each block strikes lightning and drops a cube of the lake into the chamber below.",
    mempoolChamber: "Down there, wall paintings read the chain out. Walk in through the hill by the bridge.",
    done: "That's the island! Off you go, and come find me any time.",
    newsDone: "That's what's new! Have fun out there.",
    cancelled: "All good. Back to work!",
    newsDonations: "New in the Factory: a donation kiosk. Your sats come out as bananas!",
    newsArcadeFront: "Ooga Arcade has a brand-new front.",
    newsTotems: "The totems now light up for a day after Bitcoin Core, BTCPay, LND or CLN merge a PR.",
    newsChat: "Ooga Chat is open: it's the last tab in the side sheet.",
    newsTess: "And me! I fly round the Factory now, and give tours there.",
    newsVoice: "Voice now follows you into every cave, with health bars and online dots.",
    newsDsb: "Through ₿IFRÖST, DSB Land has jetpacks and open exploring now.",
    newsRainforest: "The Mempool island is a rainforest now, round a lake as deep as the backlog.",
    newsShared: "The island is shared now: signed in, you see other players and can talk.",
    newsPoker: "Through ₿IFRÖST's poker window: Banana Poker.",
    newsBifrost: "₿IFRÖST is open: walk through the arch to other worlds.",
    newsArcade: "Ooga Arcade opened: games, tickets and prizes.",
    newsFactory: "The Lightning Factory opened: a Lightning node at work.",
    newsTimechain: "The Timechain Sphere opened out west. Walk inside!"
  };
  const SPEECH = BL.tess.beats(LINES);
  // The island tour, one stop a landmark: where the view looks from (`eye`) and at (`look`), and the lines she says
  // there. She hovers between the view and the landmark, off to its right, and her beam lands on `look`.
  const STOPS = [
    { id: "pile", title: "The pile", eye: [6, 8, 11], look: [0, 1.2, 0], lines: ["pile", "crew"] },
    { id: "totems", title: "Jumbotron and totems", eye: [7, 8, 7], look: [0, 5, 26], lines: ["jumbotron", "totems"] },
    { id: "timechain", title: "Timechain Sphere", eye: [-15, 16, 4], look: [-42, 5, 17], lines: ["timechain", "timechainWalls", "timechainBoards", "timechainSani"] },
    { id: "lab", title: "EntropyLab", eye: [-6.5, 9.5, -11], look: [-11, 4.5, -19], lines: ["lab", "labInside", "labCrew"] },
    { id: "bifrost", title: "₿IFRÖST", eye: [3, 11, -8], look: [0, 9, -34], lines: ["bifrost"] },
    { id: "factory", title: "Lightning Factory", eye: [11, 9.5, -6.5], look: [19, 4.5, -11], lines: ["factory", "factoryLines", "factoryForge"] },
    { id: "arcade", title: "Ooga Arcade", eye: [10, 7, 3], look: [22, 4, 0], lines: ["arcade"] },
    { id: "mempool", title: "Mempool island", eye: [24, 14, 4], look: [46, 6, 16], lines: ["mempool", "mempoolWeather", "mempoolLake", "mempoolBlock", "mempoolChamber"] }
  ];
  // What is new on the island, newest first: the day it shipped, the stop it is shown at (none for what is everywhere)
  // and her line. A new feature worth showing a returning visitor is one entry here.
  const NEWS = [
    { date: "2026-10-15", at: "factory", line: "newsDonations" },
    { date: "2026-10-13", at: "arcade", line: "newsArcadeFront" },
    { date: "2026-10-12", at: "totems", line: "newsTotems" },
    { date: "2026-10-12", at: null, line: "newsChat" },
    { date: "2026-10-10", at: "factory", line: "newsTess" },
    { date: "2026-10-07", at: null, line: "newsVoice" },
    { date: "2026-10-07", at: "bifrost", line: "newsDsb" },
    { date: "2026-10-05", at: "mempool", line: "newsRainforest" },
    { date: "2026-10-03", at: null, line: "newsShared" },
    { date: "2026-10-02", at: "bifrost", line: "newsPoker" },
    { date: "2026-09-29", at: "bifrost", line: "newsBifrost" },
    { date: "2026-09-29", at: "arcade", line: "newsArcade" },
    { date: "2026-09-26", at: "factory", line: "newsFactory" },
    { date: "2026-09-25", at: "timechain", line: "newsTimechain" }
  ];
  // A first signed-in visit in this browser has no last visit to count from: it sees this many of the newest.
  const FIRST_NEWS = 5;
  // Where she works with nobody to guide, near the plaza, where a newcomer looks first: hovering at `at`, her working
  // beam on `aim`.
  const WORK = [
    { at: [2.6, 3.6, 2.8], aim: [0.6, 0.9, 0.6] },
    { at: [2.4, 7.6, 24.6], aim: [0.6, 6.6, 28.2] },
    { at: [5.6, 6.6, 16.4], aim: [7.6, 5.6, 18.3] },
    { at: [7, 3, 5.6], aim: [8.8, 0.5, 7.4] },
    { at: [-2.8, 5.2, 17], aim: [-4.6, 4.2, 19.3] }
  ];
  const NOTICE_AFTER = 2.5, OFFER_TIME = 12, GLIDE = 1.8, RETURN = 1.2, VISITS = "ooga-tess-visits";
  const pose = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  // A stop's view: its eye, heading at its look.
  const viewOf = (stop, out) => {
    const dx = stop.look[0] - stop.eye[0], dy = stop.look[1] - stop.eye[1], dz = stop.look[2] - stop.eye[2];
    out.x = stop.eye[0]; out.y = stop.eye[1]; out.z = stop.eye[2];
    out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return out;
  };
  const VIEWS = STOPS.map((stop) => viewOf(stop, pose()));
  // Where she hovers at a stop: half way from the view to the landmark, two metres to the view's right, a little up.
  const SPOTS = STOPS.map((stop) => {
    const dx = stop.look[0] - stop.eye[0], dz = stop.look[2] - stop.eye[2], d = Math.hypot(dx, dz);
    return [stop.eye[0] + dx * 0.5 - dz / d * 2.2, stop.eye[1] + (stop.look[1] - stop.eye[1]) * 0.5 + 0.4, stop.eye[2] + dz * 0.5 + dx / d * 2.2];
  });
  // A tour is a list of legs, each a stop (-1: where the visitor is) with its title and lines.
  const ISLAND = STOPS.map((stop, i) => ({ stop: i, title: stop.title, lines: stop.lines }));
  // What is new since `since` (ms; null: the newest few), as legs: what is everywhere first, said where the visitor is,
  // then each place in the island tour's order, the newest of its news first.
  const newsSince = (since) => {
    const fresh = since === null ? NEWS.slice(0, FIRST_NEWS) : NEWS.filter((n) => Date.parse(`${n.date}T23:59:59Z`) > since);
    const legs = [], here = fresh.filter((n) => !n.at).map((n) => n.line);
    if (here.length) legs.push({ stop: -1, title: "All over the island", lines: here });
    STOPS.forEach((stop, i) => {
      const lines = fresh.filter((n) => n.at === stop.id).map((n) => n.line);
      if (lines.length) legs.push({ stop: i, title: stop.title, lines });
    });
    return legs;
  };
  // This browser's last visit by a signed-in login (ms, or null for none), and now recorded as the latest. Kept in
  // localStorage only; anything unreadable there counts as no visit.
  const lastVisit = (login, now) => {
    let visits = {};
    try {
      const saved = JSON.parse(localStorage.getItem(VISITS) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) visits = saved;
    } catch { visits = {}; }
    const last = Number.isFinite(visits[login]) ? visits[login] : null;
    visits[login] = now;
    try { localStorage.setItem(VISITS, JSON.stringify(visits)); } catch { /* A private window keeps no visits. */ }
    return last;
  };
  // Under debug, `tessnews=YYYY-MM-DD` plays the signed-in greeting as if the visitor's last visit were that day.
  const DEBUG_NEWS = (() => {
    const params = new URLSearchParams(location.search);
    return params.get("debug") === "1" && params.has("tessnews") ? Date.parse(`${params.get("tessnews")}T00:00:00Z`) : NaN;
  })();

  const create = ({ parent, input, fx, camera, pilot, visitor, world, hud, busy, coarse, quality }) => {
    const rig = BL.tess.create({ parent, input, fx, camera, kind: "tess", coarse, quality }), position = rig.position;
    const state = { phase: "work", stage: "beam", timer: 3, site: 0, seen: 0, again: false, kind: "island", legs: ISLAND, welcome: null,
      stop: -1, line: 0, arrived: false, closing: null, holding: false, beats: null, utterance: 0, advance: 0, glide: 0, glideTime: GLIDE };
    const spot = { x: 0, y: 0, z: 0 }, home = pose(), from = pose(), to = pose();
    position.x = WORK[0].at[0]; position.y = WORK[0].at[1]; position.z = WORK[0].at[2];
    // The offer and the tour's controls live on screen, in the HUD's wood, built for the visit and removed on leave.
    const panel = document.createElement("div");
    panel.className = "greeter-menu";
    panel.hidden = true;
    const heading = document.createElement("p");
    heading.className = "greeter-menu-title";
    const go = document.createElement("button"), skip = document.createElement("button");
    go.type = skip.type = "button";
    go.className = skip.className = "greeter-choice";
    const row = document.createElement("div"), help = document.createElement("p");
    row.className = "greeter-row";
    help.className = "greeter-menu-help";
    row.append(go, skip);
    panel.append(heading, row, help);
    document.body.append(panel);
    go.addEventListener("click", () => { go.blur(); forward(); });
    skip.addEventListener("click", () => { skip.blur(); back(); });
    const show = (phase) => {
      state.phase = phase;
      panel.hidden = phase !== "offer" && phase !== "tour";
      panel.classList.toggle("greeter-tour", phase === "tour");
      const news = state.kind === "news";
      if (phase === "offer") {
        heading.textContent = news ? `${NAME} · what's new` : `${NAME} · island guide`;
        go.textContent = "Show me"; skip.textContent = "Not now";
        help.textContent = coarse ? "Tap to choose" : "Enter starts · Esc closes";
      } else if (phase === "tour") {
        heading.textContent = `${news ? "What's new" : "Island tour"} · ${state.stop + 1} / ${state.legs.length} · ${state.legs[state.stop].title}`;
        go.textContent = state.stop === state.legs.length - 1 ? "Finish" : "Next"; skip.textContent = "End tour";
        help.textContent = coarse ? "Tap to go on" : "Enter or → goes on · Esc ends";
      }
    };
    // One line, a speech beat at a time: the next beat comes after a readable pause.
    const speak = (beats) => {
      state.beats = beats; state.utterance = 0;
      state.advance = 1.6 + beats[0].length * 0.06;
      rig.say(beats[0]);
    };
    const say = (id) => speak(SPEECH[id]);
    // The next beat of what she is saying, after its readable pause; false once the line is done.
    const nextBeat = (dt) => {
      if ((state.advance -= dt) > 0) return true;
      if (state.utterance + 1 >= state.beats.length) return false;
      state.utterance++;
      state.advance = 1.6 + state.beats[state.utterance].length * 0.06;
      rig.say(state.beats[state.utterance]);
      return true;
    };
    // A flight to (x, y, z) over an arc: up from where she is, over, and down onto it.
    const flyTo = (x, y, z, speed, track = false) => {
      const d = Math.hypot(x - position.x, z - position.z), rise = Math.max(2, Math.min(8, d * 0.25));
      rig.clearPath(speed, 1.2);
      if (d > 3) rig.push((position.x + x) / 2, Math.max(position.y, y) + rise, (position.z + z) / 2);
      rig.push(x, y, z);
      if (track) rig.track();
    };
    const toWork = () => {
      let site = state.site;
      while (site === state.site) site = Math.floor(Math.random() * WORK.length);
      state.site = site;
      const w = WORK[site].at;
      flyTo(w[0], w[1], w[2], 4);
      state.stage = "fly";
      show("work");
    };
    // In front of the view and to its right, a little below its middle; or ahead of the Ooga the visitor drives, off to
    // its right at head height, where the view over its shoulder shows her.
    const placeBy = () => {
      const actor = visitor();
      if (actor) {
        const p = actor.root.position, ax = Math.sin(actor.root.rotation.y), az = Math.cos(actor.root.rotation.y);
        spot.x = p.x - az + ax * 1.8; spot.z = p.z + ax + az * 1.8; spot.y = p.y - actor.baseY + (actor.bodyHeight || 1.2) * 0.8;
        return;
      }
      const e = camera.position, t = camera.target, fx0 = t.x - e.x, fy0 = t.y - e.y, fz0 = t.z - e.z, f = Math.hypot(fx0, fy0, fz0) || 1;
      const rx = -fz0, rz = fx0, r = Math.hypot(rx, rz) || 1;
      spot.x = e.x + fx0 / f * 4.2 + rx / r * 1.5; spot.y = e.y + fy0 / f * 4.2 - 0.35; spot.z = e.z + fz0 / f * 4.2 + rz / r * 1.5;
    };
    // Who the visitor is, once the page knows: the signed-in account, or none.
    const account = () => Number.isFinite(DEBUG_NEWS) ? { login: "you", display: "you" } : BL.net.state.me;
    // The visit's one greeting: the island tour for a visitor who is not signed in; for a signed-in one, what is new
    // since their last visit here, or no greeting at all when nothing is.
    const greet = () => {
      world.tessGreeted = true;
      const me = account();
      if (!me) { state.kind = "island"; state.legs = ISLAND; state.welcome = null; notice(); return; }
      const since = Number.isFinite(DEBUG_NEWS) ? DEBUG_NEWS : lastVisit(me.login, Date.now());
      const legs = newsSince(since);
      if (!legs.length) return;
      const count = legs.reduce((sum, leg) => sum + leg.lines.length, 0);
      state.kind = "news"; state.legs = legs;
      state.welcome = BL.tess.beats({ text: `Welcome back, ${me.display || me.login}! ${count === 1 ? "One new thing" : `${count} new things`} since you were last here. Want to see?` }).text;
      notice();
    };
    const notice = () => { rig.flare(); show("notice"); state.timer = 1.1; };
    const approach = () => { placeBy(); flyTo(spot.x, spot.y, spot.z, 6, true); show("approach"); };
    const offer = (beats) => {
      state.timer = OFFER_TIME;
      rig.clearPath(3, 1); rig.push(spot.x, spot.y, spot.z); rig.track();
      rig.nod(); show("offer"); speak(beats);
    };
    // The view's pose, read and written as an eye and a heading, eased by smoothstep with the heading turning the
    // short way round.
    const readPose = (out) => {
      const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      out.x = p.x; out.y = p.y; out.z = p.z;
      out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    const putPose = (a, b, k) => {
      const e = k * k * (3 - 2 * k), yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * e;
      const pitch = a.pitch + (b.pitch - a.pitch) * e, cp = Math.cos(pitch), p = camera.position, t = camera.target;
      p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = a.z + (b.z - a.z) * e;
      t.x = p.x + Math.sin(yaw) * cp; t.y = p.y + Math.sin(pitch); t.z = p.z + Math.cos(yaw) * cp;
    };
    const glideTo = (view, time) => {
      readPose(from);
      to.x = view.x; to.y = view.y; to.z = view.z; to.yaw = view.yaw; to.pitch = view.pitch;
      state.glide = 0; state.glideTime = time;
    };
    // A leg at a stop glides the view there while she flies ahead, and her lines start once she is there; one where the
    // visitor is keeps the view and her by them, and she starts at once.
    const visit = (index) => {
      const leg = state.legs[index];
      state.stop = index; state.line = 0; state.arrived = leg.stop < 0;
      if (leg.stop >= 0) {
        glideTo(VIEWS[leg.stop], GLIDE);
        const s = SPOTS[leg.stop];
        flyTo(s[0], s[1], s[2], 10);
        state.advance = Infinity;
      } else glideTo(home, GLIDE);
      show("tour");
      if (state.arrived) say(leg.lines[0]);
    };
    // The tour takes the view: it holds the pilot (no walking or flying the view meanwhile) and keeps where it was, to
    // give it back.
    const startTour = () => {
      readPose(home);
      pilot.setExternalControl(true);
      state.holding = true;
      if (document.pointerLockElement) document.exitPointerLock();
      visit(0);
    };
    // The view glides home and she flies back to the visitor, and says her last line once she is there.
    const endTour = (line) => {
      glideTo(home, RETURN);
      state.closing = line; state.arrived = false;
      placeBy(); flyTo(spot.x, spot.y, spot.z, 10, true);
      show("returning");
    };
    // The panel's two buttons and their keys: on, and back out.
    const forward = () => {
      if (state.phase === "offer") startTour();
      else if (state.phase === "tour") {
        if (state.stop === state.legs.length - 1) endTour(state.kind === "news" ? "newsDone" : "done");
        else visit(state.stop + 1);
      }
    };
    const back = () => {
      if (state.phase === "offer") { say("declined"); toWork(); }
      else if (state.phase === "tour") endTour("cancelled");
    };
    // Escape waves her off while she comes over or offers, and ends a tour, before the island's own Escape.
    const escape = () => {
      if (state.phase === "notice" || state.phase === "approach") { toWork(); return true; }
      if (state.phase === "offer" || state.phase === "tour") { back(); return true; }
      return state.phase === "returning" && state.holding;
    };
    // A tap on her at work brings her over with the island tour.
    const tap = () => {
      if (state.phase !== "work" || busy()) return;
      world.tessGreeted = true;
      state.kind = "island"; state.legs = ISLAND; state.again = true;
      placeBy(); flyTo(spot.x, spot.y, spot.z, 6, true);
      show("approach");
    };
    const captureKey = (e) => {
      if (state.phase !== "offer" && state.phase !== "tour" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "Enter" && e.key !== "ArrowRight") return;
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest && target.closest("dialog"))) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) forward();
    };
    window.addEventListener("keydown", captureKey, true);
    const update = (dt, elapsed) => {
      const actor = visitor();
      switch (state.phase) {
        case "work":
          if (state.stage === "fly") {
            if (rig.steer(dt)) { state.stage = "beam"; state.timer = 6 + Math.random() * 4; }
            break;
          }
          // A newcomer gets a moment to look round, and to see her at work, before she notices them; she waits until
          // the page knows whether they are signed in.
          state.seen = world.tessGreeted || busy() || !BL.net.state.resolved && !Number.isFinite(DEBUG_NEWS) ? 0 : state.seen + dt;
          if (state.seen > NOTICE_AFTER) { greet(); if (state.phase !== "work") break; }
          if ((state.timer -= dt) <= 0) {
            if (state.stage === "beam") { state.stage = "rest"; state.timer = 0.6; }
            else toWork();
          }
          break;
        case "notice":
          if ((state.timer -= dt) <= 0) approach();
          break;
        case "approach":
          placeBy(); rig.setLast(spot.x, spot.y, spot.z); rig.steer(dt);
          if (rig.lastPoint && Math.hypot(spot.x - position.x, spot.y - position.y, spot.z - position.z) < 0.5) {
            offer(state.welcome || SPEECH[state.again ? "again" : "greeting"]);
            state.again = false; state.welcome = null;
          }
          break;
        case "offer":
          placeBy(); rig.setLast(spot.x, spot.y, spot.z); rig.steer(dt);
          if ((state.timer -= dt) <= 0) { say("declined"); toWork(); }
          break;
        case "tour": {
          // Where the visitor is, she keeps by them; at a stop, she flies there and starts once she is nearly in place.
          const at = state.legs[state.stop].stop;
          if (at < 0) { placeBy(); rig.clearPath(3, 1); rig.push(spot.x, spot.y, spot.z); rig.track(); }
          rig.steer(dt);
          if (!state.arrived && rig.lastPoint && Math.hypot(SPOTS[at][0] - position.x, SPOTS[at][1] - position.y, SPOTS[at][2] - position.z) < 1.5) {
            state.arrived = true;
            say(state.legs[state.stop].lines[0]);
          }
          // The leg's lines go on by themselves; the view moves on only when the visitor does.
          if (state.arrived && !nextBeat(dt)) {
            const lines = state.legs[state.stop].lines;
            if (state.line + 1 < lines.length) say(lines[++state.line]);
            else state.advance = Infinity;
          }
          break;
        }
        case "returning":
          placeBy(); rig.setLast(spot.x, spot.y, spot.z); rig.steer(dt);
          if (!state.arrived) {
            if (rig.lastPoint && Math.hypot(spot.x - position.x, spot.y - position.y, spot.z - position.z) < 1.5) { state.arrived = true; say(state.closing); }
          } else if (!nextBeat(dt)) toWork();
          break;
      }
      // The view: gliding to a stop, held there, and gliding home, written after the pilot's own every frame; home, it is
      // the visitor's again.
      if (state.holding) {
        state.glide = Math.min(1, state.glide + dt / state.glideTime);
        putPose(from, to, state.glide);
        if (state.phase === "returning" && state.glide >= 1) {
          pilot.setExternalControl(false);
          state.holding = false;
        }
      }
      // What she shows: her working beam on the machine she works, her pointing beam on a stop's landmark once she is
      // there, otherwise she watches the visitor: their Ooga, or the view.
      const working = state.phase === "work" && state.stage === "beam", at = state.phase === "tour" ? state.legs[state.stop].stop : -1;
      rig.mode = working ? 1 : at >= 0 && rig.onLastLeg ? 2 : 0;
      if (working) { const a = WORK[state.site].aim; rig.aim.x = a[0]; rig.aim.y = a[1]; rig.aim.z = a[2]; }
      else if (rig.mode === 2) { const a = STOPS[at].look; rig.aim.x = a[0]; rig.aim.y = a[1]; rig.aim.z = a[2]; }
      rig.steady = state.phase === "offer" || state.phase === "tour" && at < 0;
      rig.calm = rig.steady || state.phase === "tour";
      rig.watching = state.phase !== "work";
      if (actor) { const p = actor.root.position; rig.watch.x = p.x; rig.watch.y = p.y - actor.baseY + (actor.bodyHeight || 1.2) * 0.8; rig.watch.z = p.z; }
      else { rig.watch.x = camera.position.x; rig.watch.y = camera.position.y; rig.watch.z = camera.position.z; }
      rig.update(dt, elapsed);
    };
    const dispose = () => {
      window.removeEventListener("keydown", captureKey, true);
      if (state.holding) pilot.setExternalControl(false);
      rig.dispose();
      panel.remove();
    };
    return { root: rig.root, state, update, escape, tap, dispose, liveGeometry: rig.liveGeometry };
  };
  BL.hubGuide = { create, NAME, LINES, STOPS, NEWS, newsSince };
})();
