// A worker in the Lightning Jet Hangar who has had enough. Now and then (`GAP`, from the end of one to the start of the
// next, each page its own), with nothing else going on in the hall (`busy`), the gorilla working one of the crew's
// rooms on the right wall, picked at random but never the last one's, loses it at his console: he pounds it and
// yells, then runs out through the room's door, which bangs open, along the right catwalk and down its stair to the
// Jet, and pounds on it with both fists at a spot picked at random (`SPOTS`: a gear leg or a wing's trestle, never
// the last one's), yelling, sparks flying from every clang. Kortik's Sis, if she is free, notices: she runs at him screaming
// and squares up to him on his far side from the Jet (`sis.brawl`), they trade a line each, and then they are at it in
// a cartoon dust cloud, fists, her hammer and his hard hat flying out of it, stars, POW!s and grawlix, until Tess, if
// she is free (not touring or distracting Sis), flies over fast and breaks it up, a beam on each of them (lent through
// `tess`); with nobody to break it up the cloud blows itself out. They stand there dazed, Tess sends them back to
// work, Sis blames him and goes back to her routine, and he walks back the way he came to his post, the door swinging
// shut behind him. With Sis busy, he pounds a while, calms down and goes back. While it runs it holds him (`holding`, which the scene leaves out of the crew's
// update), posing his root and parts itself as the room fire does, his feet on the room's floor and the catwalk at the
// catwalks' height and on the stair and the floor where `hangarModels.supportAt` has them; the Ooga the visitor drives
// in his way stops him, and he yells at it, until it moves. His voice is `hangarAudio.voice`'s `worker`, the door's
// bang `roomCue("clank")` and his blows `clang`.
//
// `create({ root, fx, audio, rooms, sis, tess, busy, blocker, auto, gap })`: the scene's root, its particles, the hangar's
// sound, the rooms, each
// its worker (`gorilla`, a `BL.agent`), the places it plays out in (`spots`, `hangarModels.sideRooms()`'s: `post`,
// `corner`, `inside`, `out`) and its door's node and the way it turns shut (`door`, `shut`); `busy()`, whether
// something else has the hall; Kortik's Sis (`sis.js`); Tess, `tess.free()` whether she can come and `tess.lend(drive)`
// to borrow her (null to give her back); `blocker()`, the Ooga the visitor drives, or null; `auto`, whether it comes by itself
// (off on a test page, where only `debug.play` starts it); and `gap`, a fixed wait between them instead of GAP's, s.
// Returns `update(dt)`, `holding` (the gorilla it holds, or null), `active`, `dispose` and `debug`. Allocates nothing a
// frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const HM = BL.hangarModels;

  // The wait between them, s, and before the first a visit.
  const GAP = [150, 360], FIRST = [45, 120];
  // His beats: fuming at his console (s), pounding the Jet (s) and how long a blow takes, calming down before he walks
  // back (s); how fast he runs and walks (m/s), and his stride at each (m).
  const FUME = 2.6, POUND = 7.5, BLOW = 0.62, CALM = 2.4, RUN = 3.6, WALK = 1.5, STRIDE = { run: 1.0, walk: 0.55 };
  // Kortik's Sis: how far into his pounding she notices, where she squares up to him (his far side from the Jet), and
  // how long past his pounding he waits for her before giving up; how long they square up for, and how long the fight
  // lasts at least and at most (waiting for Tess); and the beats after it, s into the split: Tess's word, Sis's blame,
  // his mutter, home.
  const NOTICE = 1, SIS_WAIT = 12, FACEOFF = 2.4, FIGHT = 4.5, FIGHT_MAX = 11;
  const SPLIT = { scold: 1.8, blame: 2.6, mutter: 3.9, home: 5 };
  // The dust cloud: its reach across and its height over the floor (m), how many puffs a second and how long each
  // lasts; how often something flies out of it and how far; how often a blow sounds, a word pops up and a voice yells.
  const CLOUD = { r: 0.8, low: 0.2, high: 1.7, rate: 18, life: [0.45, 0.8], balls: 12, shell: 0.64, swirl: 2.4, grow: 0.25 };
  const POP = { every: 0.3, out: 0.32, reach: 0.6 }, HITS = [0.16, 0.36], WORDS = 0.55, VOICES = 1.1;
  // Tess breaking it up: how fast she comes.
  const TESS = { speed: 16 };
  // Where he pounds the Jet, one picked at random each time but never the last one's: the things on it a gorilla's
  // fists reach, its gear's legs and the wings' trestles, the rest of it standing two metres and more off the floor.
  // Each the floor he takes there from beside the right catwalk stair's foot (`via`, round the nose and up under the
  // gangway between its posts for the Jet's left side), where he stands and the way he faces, where Kortik's Sis
  // squares up to him (`sis`, his far side), and where Tess hangs to break them up, clear of the wings and the
  // gangway's deck (`tess`, [x, y, z]). His fists land `HIT.reach` in front of him, `HIT.y` up.
  const SPOTS = [
    { name: "nose gear", via: [[17.6, -21.5]], at: [16.05, -19.5], heading: -Math.PI / 2, sis: [17.35, -19.5], tess: [18.7, 2.4, -19.5] },
    { name: "right gear", via: [[20.4, -14]], at: [18.3, -8.5], heading: -Math.PI / 2, sis: [19.6, -8.5], tess: [19.6, 2.2, -6] },
    { name: "right trestle", via: [[20.4, -14]], at: [20.45, -8.3], heading: Math.PI / 2, sis: [19.15, -8.3], tess: [20.2, 2.2, -6] },
    { name: "left gear", via: [[14.5, -26.3], [11, -23], [11, -10]], at: [11.9, -8.5], heading: Math.PI / 2, sis: [10.65, -8.5], tess: [11, 2.3, -6.5] },
    { name: "left trestle", via: [[14.5, -26.3], [11, -23], [11, -10]], at: [9.55, -8.3], heading: -Math.PI / 2, sis: [10.85, -8.3], tess: [9.2, 2.2, -6.3] }
  ];
  const HIT = { y: 1.0, reach: 0.55 };
  // The door: how far it swings open (rad), how fast it opens running and walking and swings shut (per s), and how near
  // its middle he is when it opens.
  const DOOR = { open: 1.75, bang: 7, walk: 2.2, shut: 1.6, near: 1.3 };
  // How near the Ooga in his way stops him (m, from a point just ahead of him), and how far its feet may be from his.
  const BLOCK = { ahead: 0.55, reach: 0.95, feet: 1.4 };
  // His lines, by when he says them.
  const LINES = {
    fume: ["THAT'S IT!", "I CAN'T TAKE IT ANYMORE!", "ARGH! NOT AGAIN!", "ENOUGH! I'VE HAD ENOUGH!", "WHO WROTE THIS CODE?!",
      "ANOTHER FAILED REBALANCE?!", "NOPE. NOPE. NOPE.", "I'M DONE! DONE!"],
    run: ["I AM SICK OF THIS JOB!", "THEY DON'T PAY ME ENOUGH!", "AI IS TAKING OVER MY JOB!", "TEN YEARS AND IT STILL DOESN'T FLY!",
      "NO MORE OVERTIME!", "I WANT A RAISE!", "NOBODY APPRECIATES ME!", "TWELVE-HOUR SHIFTS!", "I HAVEN'T SEEN DAYLIGHT IN WEEKS!",
      "THE COFFEE MACHINE IS BROKEN AGAIN!", "I DIDN'T EVEN GET BIRTHDAY CAKE!"],
    pound: ["TAKE THAT, YOU OVERGROWN TOASTER!", "THEY PAY ME IN BANANAS! BANANAS!", "FLY, YOU STUPID JET! FLY!", "WHO NEEDS A BREAK? ME! I DO!",
      "THIS IS FOR EVERY STUCK HTLC!", "ROUTE THIS!", "AND THAT'S FOR THE NIGHT SHIFTS!", "A ROBOT COULD DO MY JOB? LET IT DO THIS!",
      "FIVE YEARS! NOT ONE DAY OFF!"],
    calm: ["...okay. I feel better.", "...nobody saw that.", "...back to work, I guess.", "...I need a vacation.", "...was that out loud?",
      "...don't tell the boss."],
    blocked: ["OUT OF MY WAY!", "MOVE IT!", "COMING THROUGH!", "STEP ASIDE, OOGA!"],
    faceoff: ["OH YEAH? WANNA GO?", "COME ON THEN!", "YOU AND WHAT HAMMER?", "BRING IT, HARD HAT!"],
    blame: ["...she started it.", "...my hand hurts.", "...worth it.", "...I still want a raise."],
    fight: ["POW!", "BONK!", "#@$%!", "OOF!", "WHAM!", "OW!", "#@$%ING...!"], yells: ["OOF!", "HEY!", "OW!", "#@$%!"],
    tessBreak: ["HEY! BREAK IT UP, YOU TWO!", "STOP! BOTH OF YOU, STOP!"], tessScold: ["Back to work. Both of you.", "Nobody hits the Jet. Nobody hits each other."]
  };
  const SPARK = BL.models.particleGeometry("#ffd27a", 0.05, 1), STAR = BL.models.particleGeometry("#fff27a", 0.09, 1);
  const FIST = BL.models.box({ w: 0.22, h: 0.2, d: 0.24, color: "#2a2b31" });
  // The cloud's body: a lumpy ball of dust, the island's cartoon puff in its greys, each ball of the cloud one of these.
  let dust = null;
  const dustBall = () => {
    if (dust) return dust;
    dust = { verts: [], faces: [], lines: [], castShadow: false };
    BL.hubModels.puff(dust, 0, 0, 0, 0.56, 0.48, 0.56, ["#7d766c", "#9b9387", "#bdb5a7", "#dcd5c7"].map(BL.math.hexToRgb), BL.math.mulberry32(7));
    return dust;
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const between = ([a, b]) => a + Math.random() * (b - a);
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

  const create = ({ root, fx, audio, rooms, sis, tess, busy, blocker, auto = true, gap = null }) => {
    const L = HM.LAYOUT, high = L.catwalkY, [sx, , sz0, , , sz1] = L.catwalkStairs[1];
    // Each room's way to each spot, its points and their distances along it: through the room at the catwalks' height,
    // out of its door, along the catwalk to the stair's head, down it, out beside its foot and over the floor there.
    const routes = rooms.map(({ spots: S }) => SPOTS.map((spot) => {
      const points = [[S.post.x, S.post.z, 1], [S.corner.x, S.corner.z, 1], [S.inside.x, S.inside.z, 1], [S.out.x, S.out.z, 1],
        [sx, sz1 + 0.4, 1], [sx, sz0 - 0.6, 0], [sx - 2.4, sz0 - 0.7, 0], ...spot.via.map(([x, z]) => [x, z, 0]), [spot.at[0], spot.at[1], 0]]
        .map(([x, z, h]) => ({ x, z, high: !!h, at: 0 }));
      for (let i = 1; i < points.length; i++) points[i].at = points[i - 1].at + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      return { points, length: points[points.length - 1].at, door: { x: (S.inside.x + S.out.x) / 2, z: (S.inside.z + S.out.z) / 2 } };
    }));
    const doors = rooms.map(() => ({ k: 0, was: 0 }));
    // The state: whether it runs, the beat and how far into it, the room, its worker and his parts; where he is along
    // his way (m), where he stands, his feet, heading and stride; the next blow; whether he has yelled at the Ooga in his
    // way since it last moved off; the wait for the next; and where his voice comes from.
    let active = false, phase = "", t = 0, room = 0, last = -1, spot = 0, lastSpot = -1, gorilla = null, P = null, along = 0, feet = high, heading = 0, stride = 0;
    let blowAt = 0, yelled = false, lineAt = 0, wait = gap !== null ? gap : between(FIRST);
    const pos = { x: 0, z: 0 }, voiceAt = { x: 0, y: 0, z: 0 };
    // The fight: whether Sis came, where she squares up, the cloud's middle, the things that fly out of it (her hammer,
    // a hard hat and two fists, each its own way out and how far through its pop), when the next blow, word, voice and
    // pop come; Tess, whether she is lent and her rig while she is, where she hangs, and where her beams land.
    let sisCame = false, hitIn = 0, wordIn = 0, voiceIn = 0, popIn = 0, voiceSis = false, lent = false, rig = null, said = 0;
    const stand = { x: 0, z: 0 }, mid = { x: 0, y: 0, z: 0 }, hover = { x: 0, y: 0, z: 0 };
    const aimHim = { x: 0, y: 0, z: 0 }, aimHer = { x: 0, y: 0, z: 0 }, AIMS = [aimHim, aimHer];
    // The cloud's balls, each its place on a shell round the middle, its own pace and phase.
    const balls = Array.from({ length: CLOUD.balls }, (_, i) => {
      const node = BL.scene.createNode({ geometry: dustBall(), visible: false, sightHidden: true });
      BL.scene.addChild(root, node);
      const up = 1 - 2 * (i + 0.5) / CLOUD.balls;
      return { node, a: i * 2.4, up, pace: 0.7 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2 };
    });
    const pops = [BL.sisModels.hammer(), BL.factoryModels.hardHat(), FIST, FIST].map((geometry) => {
      const node = BL.scene.createNode({ geometry, visible: false, sightHidden: true });
      BL.scene.addChild(root, node);
      return { node, a: 0, u: 1 };
    });

    // A line from one of his pools, never the one he said last.
    let lastLine = "";
    const line = (pool) => {
      let text = pick(pool);
      while (text === lastLine && pool.length > 1) text = pick(pool);
      return lastLine = text;
    };
    const say = (text) => {
      voiceAt.x = pos.x; voiceAt.y = feet + 1.6; voiceAt.z = pos.z;
      const talk = audio.voice(text, "worker", voiceAt);
      fx.say(gorilla, text, Math.max(2.2, talk + 0.8));
    };
    // His pose: where he stands and which way he faces, a hop, his chest's lean, his legs' stride and his arms, as
    // angles from straight down in the world (forward is -pi/2), and how far out to the side each swings.
    const pose = (hop, lean, legs, armR, armL, outR = 0, outL = 0) => {
      const r = gorilla.root;
      r.position.x = pos.x; r.position.z = pos.z; r.position.y = feet + hop;
      r.rotation.y = heading;
      gorilla.chest.rotation.x = lean;
      gorilla.chest.rotation.z = 0;
      P.legR.rotation.x = legs; P.legL.rotation.x = -legs;
      P.armR.rotation.x = armR - lean; P.armL.rotation.x = armL - lean;
      P.armR.rotation.z = -outR; P.armL.rotation.z = outL;
      P.head.rotation.x = -lean * 0.8;
    };
    const turnTo = (to, dt, rate) => { heading += Math.atan2(Math.sin(to - heading), Math.cos(to - heading)) * Math.min(1, dt * rate); };
    // Where `along` puts him on his way, into `pos`, and the way it runs there; his feet on the room's floor and the
    // catwalk, or where the stair and the floor have them.
    const place = (route, d) => {
      const pts = route.points;
      let i = 1;
      while (i < pts.length - 1 && pts[i].at < d) i++;
      const a = pts[i - 1], b = pts[i], len = b.at - a.at, u = len > 0 ? Math.max(0, Math.min(1, (d - a.at) / len)) : 1;
      pos.x = a.x + (b.x - a.x) * u; pos.z = a.z + (b.z - a.z) * u;
      feet = a.high && b.high ? high : HM.supportAt(pos.x, pos.z, feet);
      return Math.atan2(b.x - a.x, b.z - a.z);
    };
    // Whether the Ooga in his way stands just ahead of him.
    const blockedAhead = () => {
      const o = blocker();
      if (!o) return false;
      const p = o.root.position, s = Math.sin(heading), c = Math.cos(heading);
      return Math.abs(p.y - o.baseY - feet) < BLOCK.feet && Math.hypot(p.x - (pos.x + s * BLOCK.ahead), p.z - (pos.z + c * BLOCK.ahead)) < BLOCK.reach;
    };
    // On along his way at `speed`, `dir` +1 to the Jet or -1 home; true once he is there.
    const go = (dt, speed, dir, gait) => {
      const route = routes[room][spot];
      if (blockedAhead()) {
        if (!yelled) { yelled = true; say(line(LINES.blocked)); }
        pose(0, dir > 0 ? 0.25 : 0.15, 0, -1.2, -0.3, 0.3, 0);
        return false;
      }
      yelled = false;
      const was = along;
      along = Math.max(0, Math.min(route.length, along + dir * speed * dt));
      const way = place(route, along) + (dir > 0 ? 0 : Math.PI);
      turnTo(way, dt, 10);
      stride += Math.abs(along - was) / gait * Math.PI;
      const swing = Math.sin(stride);
      if (dir > 0) pose(Math.abs(swing) * 0.06, 0.35, swing * 0.8, -swing * 0.9 - 0.5, swing * 0.9 - 0.5);
      else pose(0, 0.22, swing * 0.5, swing * 0.2, -swing * 0.2);
      return dir > 0 ? along >= route.length : along <= 0;
    };
    // The door of his room: open while he is at it, banging open as he runs out.
    const door = (dt) => {
      const d = doors[room], r = routes[room][spot], at = Math.hypot(pos.x - r.door.x, pos.z - r.door.z) < DOOR.near;
      const k = at ? Math.min(1, d.k + dt * (phase === "run" ? DOOR.bang : DOOR.walk)) : Math.max(0, d.k - dt * DOOR.shut);
      if (k > 0 && d.k === 0 && phase === "run") audio.roomCue("clank", r.door.x, high + 1, r.door.z);
      if (k === 0 && d.k > 0 && d.was > 0.5) audio.roomCue("clank", r.door.x, high + 1, r.door.z);
      if (k === 1) d.was = 1; else if (k === 0) d.was = 0;
      d.k = k;
      const n = rooms[room].door;
      n.rotation.y = rooms[room].shut + ease(k) * DOOR.open;
    };
    // A blow on the gear's leg: his fists come down from over his head, landing at `u` 0.55 of it with a clang and sparks.
    const blow = (u) => {
      const up = u < 0.55, k = up ? ease(u / 0.55) : 1 - ease((u - 0.55) / 0.45);
      const arm = up ? -1.0 - 1.9 * k : -1.0 - 1.9 * k * 0.3;
      pose(0, up ? 0.05 + 0.1 * k : 0.5 - 0.3 * (1 - k), 0, arm, arm, 0.15, 0.15);
    };
    const hit = () => {
      const s = Math.sin(heading), c = Math.cos(heading), x = pos.x + s * HIT.reach, y = feet + HIT.y, z = pos.z + c * HIT.reach;
      audio.clang(x, y, z, 0.7);
      for (let i = 0; i < 9; i++) fx.spawnParticle(SPARK, x, y, z, (Math.random() - 0.5) * 3 - s, Math.random() * 2.5, (Math.random() - 0.5) * 3 - c, 0.3 + Math.random() * 0.3, 8, 6);
      BL.gamepad.rumble(0.15, 0.3, 60);
    };

    // Tess, lent: over fast to hang over the cloud, watching it, and while she breaks it up a beam on each of them.
    const drive = (r, dt) => {
      if (r !== rig) { rig = r; r.clearPath(TESS.speed, 1.5); r.push(hover.x, hover.y, hover.z); r.track(); r.flare(); }
      r.setLast(hover.x, hover.y + Math.sin(t * 3) * 0.1, hover.z);
      r.steer(dt);
      r.steady = false; r.calm = false;
      r.watching = true; r.watch.x = mid.x; r.watch.y = mid.y; r.watch.z = mid.z;
      if (phase === "split" && t < SPLIT.blame) { r.mode = 2; r.aim.x = mid.x; r.aim.y = mid.y; r.aim.z = mid.z; r.aims = AIMS; }
      else { r.mode = 0; r.aims = null; }
    };
    const tessThere = () => !!rig && Math.hypot(rig.root.position.x - hover.x, rig.root.position.y - hover.y, rig.root.position.z - hover.z) < 1.2;
    // The cloud: puffs of dust boiling round its middle, something flying out of it now and then and back in, a blow
    // every moment, a word over it and a yell from one of them now and then.
    const cloud = (dt) => {
      const grown = Math.min(1, t / CLOUD.grow);
      for (const b of balls) {
        const a = b.a + t * CLOUD.swirl * b.pace, ring = Math.sqrt(1 - b.up * b.up) * CLOUD.shell, n = b.node;
        n.visible = true;
        n.position.x = mid.x + Math.cos(a) * ring; n.position.y = mid.y + b.up * CLOUD.shell * 0.9 + Math.sin(t * 7 + b.phase) * 0.06; n.position.z = mid.z + Math.sin(a) * ring;
        const k = grown * (1 + 0.28 * Math.sin(t * 9 * b.pace + b.phase));
        n.scale.x = n.scale.y = n.scale.z = k;
        n.rotation.y = a * 1.3; n.rotation.x = t * 3 * b.pace;
      }
      const n = Math.random() < CLOUD.rate * dt % 1 ? Math.ceil(CLOUD.rate * dt) : Math.floor(CLOUD.rate * dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = CLOUD.r * Math.sqrt(Math.random());
        fx.puff(mid.x + Math.cos(a) * r, feet + CLOUD.low + Math.random() * (CLOUD.high - CLOUD.low), mid.z + Math.sin(a) * r,
          Math.cos(a) * 0.5, 0.15 + Math.random() * 0.3, Math.sin(a) * 0.5, between(CLOUD.life));
      }
      if ((popIn -= dt) <= 0) {
        popIn = POP.every * (0.6 + Math.random() * 0.8);
        const q = pops[Math.floor(Math.random() * pops.length)];
        if (q.u >= 1) { q.u = 0; q.a = Math.random() * Math.PI * 2; q.node.visible = true; }
      }
      for (const q of pops) {
        if (q.u >= 1) continue;
        q.u = Math.min(1, q.u + dt / POP.out);
        const out = Math.sin(q.u * Math.PI) * (CLOUD.r + POP.reach), n = q.node;
        n.position.x = mid.x + Math.cos(q.a) * out; n.position.y = feet + 0.7 + Math.sin(q.u * Math.PI) * 0.5; n.position.z = mid.z + Math.sin(q.a) * out;
        n.rotation.x = q.u * 9; n.rotation.y = q.a; n.rotation.z = q.u * 5;
        if (q.u >= 1) n.visible = false;
      }
      if ((hitIn -= dt) <= 0) {
        hitIn = between(HITS);
        const k = Math.random(), x = mid.x + (Math.random() - 0.5) * CLOUD.r, y = feet + 1, z = mid.z + (Math.random() - 0.5) * CLOUD.r;
        if (k < 0.4) audio.boot(x, y, z, true); else if (k < 0.75) audio.poke(x, y, z); else audio.clang(x, y, z, 0.45);
        for (let i = 0; i < 3; i++) fx.spawnParticle(STAR, x, y + 0.3, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.35, 6, 4);
        BL.gamepad.rumble(0.1, 0.25, 50);
      }
      if ((wordIn -= dt) <= 0) { wordIn = WORDS * (0.7 + Math.random() * 0.6); fx.sayAt(mid.x + (Math.random() - 0.5), feet + 2.1 + Math.random() * 0.4, mid.z + (Math.random() - 0.5), pick(LINES.fight), 0.6); }
      if ((voiceIn -= dt) <= 0) {
        voiceIn = VOICES * (0.8 + Math.random() * 0.4);
        voiceSis = !voiceSis;
        voiceAt.x = mid.x; voiceAt.y = feet + 1.5; voiceAt.z = mid.z;
        audio.voice(pick(LINES.yells), voiceSis ? "scream" : "worker", voiceAt);
      }
    };
    // The cloud blowing apart: a ring of puffs, stars over both their heads.
    const burst = () => {
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2;
        fx.puff(mid.x + Math.cos(a) * 0.4, feet + 0.4 + Math.random() * 1.2, mid.z + Math.sin(a) * 0.4, Math.cos(a) * 2.6, 0.4, Math.sin(a) * 2.6, 0.7);
      }
      const sp = sis.node.position;
      for (const [x, z] of [[pos.x, pos.z], [sp.x, sp.z]]) for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        fx.spawnParticle(STAR, x + Math.cos(a) * 0.35, feet + 2, z + Math.sin(a) * 0.35, -Math.sin(a) * 1.2, 0.3, Math.cos(a) * 1.2, 1.2, 1, 0);
      }
      for (const q of pops) { q.u = 1; q.node.visible = false; }
      for (const b of balls) b.node.visible = false;
    };
    // One of `n` at random, never `last`.
    const anyBut = (n, last) => {
      const i = Math.floor(Math.random() * (n - (last >= 0 ? 1 : 0)));
      return last >= 0 && i >= last ? i + 1 : i;
    };
    const start = (i = anyBut(rooms.length, last), j = anyBut(SPOTS.length, lastSpot)) => {
      if (active) return false;
      active = true; room = last = i; spot = lastSpot = j; gorilla = rooms[i].gorilla; P = gorilla.parts;
      const at = SPOTS[j];
      stand.x = at.sis[0]; stand.z = at.sis[1];
      hover.x = at.tess[0]; hover.y = at.tess[1]; hover.z = at.tess[2];
      const S = rooms[i].spots;
      pos.x = S.post.x; pos.z = S.post.z; heading = S.post.heading; feet = high;
      along = 0; stride = 0; yelled = false; sisCame = false; said = 0;
      phase = "fume"; t = 0; blowAt = 0.2; lineAt = 0;
      say(line(LINES.fume));
      return true;
    };
    // Done: the door shut and him back at his post as the crew had him.
    const release = () => {
      const S = rooms[room].spots;
      doors[room].k = 0; doors[room].was = 0;
      rooms[room].door.rotation.y = rooms[room].shut;
      gorilla.root.visible = true;
      sis.node.visible = true;
      if (sisCame) sis.brawl(null, null, true);
      if (lent) { lent = false; rig = null; tess.lend(null); }
      for (const q of pops) q.node.visible = false;
      for (const b of balls) b.node.visible = false;
      gorilla.place(S.post.x, S.post.z, S.post.heading);
      active = false; phase = ""; gorilla = null; P = null; sisCame = false;
      wait = gap !== null ? gap : between(GAP);
    };

    const update = (dt) => {
      if (!active) {
        if (auto && (wait -= dt) <= 0 && !busy()) start();
        return;
      }
      t += dt;
      if (phase === "fume") {
        // At his console: two fists down on it, then he turns for the door.
        const u = (t % 1.1) / 1.1;
        if (t < 2.2) blow(u);
        else { turnTo(Math.atan2(rooms[room].spots.corner.x - pos.x, rooms[room].spots.corner.z - pos.z), dt, 8); pose(0, 0.2, 0, -0.6, -0.6); }
        if (t >= FUME) { phase = "run"; t = 0; lineAt = 1.2; }
      } else if (phase === "run") {
        if (t >= lineAt) { say(line(LINES.run)); lineAt = t + 5 + Math.random() * 2; }
        if (go(dt, RUN, 1, STRIDE.run)) { phase = "pound"; t = 0; blowAt = 0; lineAt = 0.4; }
      } else if (phase === "pound") {
        turnTo(SPOTS[spot].heading, dt, 8);
        const u = (t % BLOW) / BLOW, was = ((t - dt) % BLOW) / BLOW;
        blow(u);
        if (u >= 0.55 && was < 0.55) hit();
        if (t >= lineAt) { say(line(LINES.pound)); lineAt = t + 2.6 + Math.random(); }
        // Kortik's Sis notices, if she is free, and comes; he keeps at it until she is squared up to him, or gives up
        // waiting for her.
        if (t >= NOTICE && t - dt < NOTICE) sisCame = sis.brawl(pos, stand);
        if (sisCame && sis.brawling) { phase = "faceoff"; t = 0; say(line(LINES.faceoff)); }
        else if (sisCame && t >= POUND + SIS_WAIT) { sis.brawl(null, null, true); sisCame = false; }
        else if (!sisCame && t >= POUND) { phase = "calm"; t = 0; say(line(LINES.calm)); }
      } else if (phase === "faceoff") {
        // Turned on her, fists up, bouncing; her line back; then they are at it.
        const sp = sis.node.position;
        turnTo(Math.atan2(sp.x - pos.x, sp.z - pos.z), dt, 8);
        pose(Math.abs(Math.sin(t * 9)) * 0.05, 0.15, 0, -1.9 + Math.sin(t * 12) * 0.2, -1.9 - Math.sin(t * 12) * 0.2, 0.2, 0.2);
        if (t >= 1.1 && t - dt < 1.1) sis.sayFrom("faceoff", 1.4);
        if (t >= FACEOFF) {
          phase = "fight"; t = 0; hitIn = 0.1; wordIn = 0.2; voiceIn = 0.4; popIn = 0.15;
          mid.x = (pos.x + sp.x) / 2; mid.y = feet + 1; mid.z = (pos.z + sp.z) / 2;
          gorilla.root.visible = false; sis.node.visible = false;
          if (tess.free()) { lent = true; rig = null; tess.lend(drive); }
        }
      } else if (phase === "fight") {
        cloud(dt);
        if (t >= FIGHT && (!lent || tessThere()) || t >= FIGHT_MAX) {
          phase = "split"; t = 0;
          burst();
          gorilla.root.visible = true; sis.node.visible = true;
          const sp = sis.node.position;
          aimHim.x = pos.x; aimHim.y = feet + 1.2; aimHim.z = pos.z; aimHer.x = sp.x; aimHer.y = feet + 1.2; aimHer.z = sp.z;
          if (lent && rig) { rig.say(pick(LINES.tessBreak)); rig.flare(); }
        }
      } else if (phase === "split") {
        // Dazed, arms out, swaying; Tess's word; the blame; home.
        const sp = sis.node.position;
        turnTo(Math.atan2(sp.x - pos.x, sp.z - pos.z), dt, 6);
        pose(0, 0.12 + Math.sin(t * 5) * 0.1, 0, -0.4, -0.4, 0.7 + Math.sin(t * 7) * 0.2, 0.7 - Math.sin(t * 7) * 0.2);
        if (said === 0 && t >= SPLIT.scold) { said = 1; if (lent && rig) rig.say(pick(LINES.tessScold)); }
        if (said === 1 && t >= SPLIT.blame) { said = 2; sis.brawl(null); sisCame = false; }
        if (said === 2 && t >= SPLIT.mutter) { said = 3; say(line(LINES.blame)); }
        if (t >= SPLIT.home) {
          phase = "back"; t = 0;
          if (lent) { lent = false; rig = null; tess.lend(null); }
        }
      } else if (phase === "calm") {
        // Out of breath, arms hanging, then he turns for home.
        const breath = Math.sin(t * 7) * 0.05;
        pose(0, 0.45 + breath, 0, -0.15, -0.15);
        if (t >= CALM) { phase = "back"; t = 0; }
      } else if (phase === "back") {
        if (go(dt, WALK, -1, STRIDE.walk)) release();
      }
      if (active) door(dt);
    };

    return {
      update,
      // Put the next off: none for at least `s` s from now, however long it has been due.
      defer: (s) => { if (wait < s) wait = s; },
      get holding() { return active ? gorilla : null; },
      get active() { return active; },
      dispose: () => { if (active) release(); },
      debug: {
        play: (i, j) => start(i, j), spots: SPOTS.map((p) => p.name), get spot() { return active ? SPOTS[spot].name : ""; },
        get phase() { return phase; }, get t() { return t; }, get room() { return active ? room : -1; }, get wait() { return wait; },
        get at() { return { x: pos.x, y: feet, z: pos.z, along, length: active ? routes[room][spot].length : 0 }; },
        get door() { return active ? doors[room].k : 0; }, get sisCame() { return sisCame; }, get tess() { return lent; }
      }
    };
  };

  BL.hangarMeltdown = { create, GAP, SPOTS, LINES };
})();
