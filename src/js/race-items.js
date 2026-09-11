// Race items: pickups, crates, boost pads, thrown rocks, dropped peels, boulders and skid marks, every one a fixed pool
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, raceModels, raceTrack } = BL;
  const { fnv1a } = BL.math;
  const { createNode, addChild, removeChild } = BL.scene;
  const { writeInstance, SURF } = raceTrack;
  const ROCK_CAP = 8, PEEL_CAP = 12, SKID_CAP = 512, BOULDER_CAP = 4;
  const BANANA_RESPAWN = 6, CRATE_RESPAWN = 8, METER_MAX = 10;
  const ROCK_SPEED = 26, ROCK_LIFE = 2.6, PEEL_LIFE = 25, BOOST_PAD = 0.9, TURBO = 1.3, SHOUT_RADIUS = 7;
  const ITEMS = { rock: "Rock", peel: "Peel", turbo: "Turbo", shout: "Shout" };
  const ITEM_NAMES = ["rock", "peel", "turbo", "shout"];
  // Leaders draw defensive items, the tail draws catch-up ones
  const ODDS = [[0.55, 0.45, 0, 0], [0.35, 0.3, 0.35, 0], [0.25, 0.15, 0.4, 0.2]];
  const SKID_GEO = (() => {
    const geo = models.box({ w: 0.22, h: 0.01, d: 0.7, color: "#2b2521" });
    geo.castShadow = false;
    return geo;
  })();
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const create = (ctx) => {
    const { root, racers, fx } = ctx;
    let track = ctx.track;
    const bananaGeo = models.bananaGeometry();
    const bananas = [], crates = [], pads = [], rocks = [], peels = [], boulders = [];
    const skids = { node: createNode({ geometry: SKID_GEO, instanceData: new Float32Array(SKID_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, visible: false }), head: 0, filled: 0 };
    addChild(root, skids.node);
    for (let i = 0; i < ROCK_CAP; i++) {
      const node = createNode({ geometry: raceModels.rockShot(), visible: false });
      addChild(root, node);
      rocks.push({ node, live: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, life: 0, owner: null, idx: -1 });
    }
    for (let i = 0; i < PEEL_CAP; i++) {
      const node = createNode({ geometry: raceModels.peel(), visible: false });
      addChild(root, node);
      peels.push({ node, live: false, x: 0, y: 0, z: 0, life: 0, owner: null });
    }
    for (let i = 0; i < BOULDER_CAP; i++) {
      const node = createNode({ geometry: raceModels.boulder(), visible: false });
      addChild(root, node);
      boulders.push({ node, live: false, index: 0, x: 0, z: 0, y: 0, t: 0, span: 0, rx: 0, rz: 0, roll: 0 });
    }
    let spinT = 0;
    const events = { onBanana: null, onCrate: null, onItem: null, onHit: null, onPad: null };
    const placeSpawns = () => {
      for (const b of bananas) removeChild(root, b.node);
      for (const c of crates) removeChild(root, c.node);
      for (const p of pads) removeChild(root, p.node);
      bananas.length = crates.length = pads.length = 0;
      for (const s of track.spawns.bananas) {
        const node = createNode({ position: { x: s.x, y: s.y + 0.55, z: s.z }, rotation: { x: 0.4, y: 0, z: 0.9 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, geometry: bananaGeo, glow: 1.2 });
        addChild(root, node);
        bananas.push({ node, x: s.x, y: s.y, z: s.z, taken: 0, phase: fnv1a(`${s.x}/${s.z}`) % 7 });
      }
      for (const s of track.spawns.crates) {
        const node = createNode({ position: { x: s.x, y: s.y + 0.2, z: s.z }, geometry: raceModels.itemCrate() });
        addChild(root, node);
        crates.push({ node, x: s.x, y: s.y, z: s.z, taken: 0, phase: fnv1a(`${s.z}/${s.x}`) % 5 });
      }
      for (const s of track.spawns.pads) {
        const node = createNode({ position: { x: s.x, y: s.y + 0.01, z: s.z }, rotation: { x: 0, y: s.heading, z: 0 }, geometry: raceModels.boostPad() });
        addChild(root, node);
        pads.push({ node, x: s.x, y: s.y, z: s.z, heading: s.heading, phase: pads.length });
      }
      for (let i = 0; i < boulders.length; i++) {
        const b = boulders[i], s = track.spawns.boulders[i];
        b.live = !!s;
        b.node.visible = b.live;
        if (!s) continue;
        b.index = s.index;
        b.x = s.x;
        b.z = s.z;
        b.y = s.y;
        b.span = s.half + 3;
        b.rx = track.rightX(s.index);
        b.rz = track.rightZ(s.index);
        b.t = i * 1.7;
      }
    };
    const setTrack = (nextTrack) => {
      track = nextTrack;
      placeSpawns();
      clear();
    };
    const clear = () => {
      for (const r of rocks) {
        r.live = false;
        r.node.visible = false;
      }
      for (const p of peels) {
        p.live = false;
        p.node.visible = false;
      }
      for (const b of bananas) b.taken = 0;
      for (const c of crates) c.taken = 0;
      skids.head = skids.filled = 0;
      skids.node.instanceCount = 0;
      skids.node.visible = false;
      skids.node.instanceVersion++;
    };
    const rollItem = (racer, seed) => {
      const field = racers.racers.length;
      const tier = racer.rank <= 2 ? 0 : racer.rank >= field - 1 ? 2 : 1;
      const odds = ODDS[tier];
      let r = (fnv1a(`${seed}/item`) % 1000) / 1000;
      for (let i = 0; i < odds.length; i++) {
        r -= odds[i];
        if (r <= 0) return ITEM_NAMES[i];
      }
      return "rock";
    };
    const throwRock = (racer) => {
      let rock = null;
      for (let i = 0; i < rocks.length; i++) if (!rocks[i].live) {
        rock = rocks[i];
        break;
      }
      if (!rock) rock = rocks[0];
      const dir = racer.heading;
      rock.live = true;
      rock.owner = racer;
      rock.x = racer.x + Math.sin(dir) * 1.4;
      rock.z = racer.z + Math.cos(dir) * 1.4;
      rock.y = racer.y + 0.9;
      rock.vx = Math.sin(dir) * (ROCK_SPEED + Math.max(0, racer.speed));
      rock.vz = Math.cos(dir) * (ROCK_SPEED + Math.max(0, racer.speed));
      rock.vy = 2.5;
      rock.life = ROCK_LIFE;
      rock.idx = racer.idx;
      rock.node.visible = true;
    };
    const dropPeel = (racer) => {
      let peel = null, oldest = Infinity;
      for (let i = 0; i < peels.length; i++) {
        const p = peels[i];
        if (!p.live) {
          peel = p;
          break;
        }
        if (p.life < oldest) {
          oldest = p.life;
          peel = p;
        }
      }
      peel.live = true;
      peel.owner = racer;
      peel.x = racer.x - Math.sin(racer.heading) * 1.6;
      peel.z = racer.z - Math.cos(racer.heading) * 1.6;
      peel.y = track.heightAt(peel.x, peel.z, racer.idx);
      peel.life = PEEL_LIFE;
      setVec(peel.node.position, peel.x, peel.y + 0.02, peel.z);
      peel.node.rotation.y = racer.heading;
      peel.node.visible = true;
    };
    const shout = (racer) => {
      let hit = 0;
      for (const o of racers.racers) {
        if (o === racer) continue;
        if (Math.hypot(o.x - racer.x, o.z - racer.z) < SHOUT_RADIUS && racers.spinOut(o, 0.8)) hit++;
      }
      fx.say(racer.cave, "OOGA BOOGA!", 1.4);
      return hit;
    };
    // Space with an item throws it; with a full banana meter it spends the meter on a turbo
    const use = (racer) => {
      if (racer.respawn > 0 || racer.spin > 0) return false;
      if (racer.item) {
        const item = racer.item;
        racer.item = null;
        if (item === "rock") throwRock(racer);
        else if (item === "peel") dropPeel(racer);
        else if (item === "turbo") racer.boost = TURBO;
        else shout(racer);
        if (events.onItem) events.onItem(racer, item);
        return true;
      }
      if (racer.meterFull) {
        racer.bananas = 0;
        racer.meterFull = false;
        racer.boost = TURBO;
        if (events.onItem) events.onItem(racer, "meter");
        return true;
      }
      return false;
    };
    const writeSkid = (x, y, z, yaw) => {
      writeInstance(skids.node.instanceData, skids.head * 20, yaw, 1, x, y + 0.015, z, 1);
      skids.head = (skids.head + 1) % SKID_CAP;
      skids.filled = Math.min(SKID_CAP, skids.filled + 1);
      skids.node.instanceCount = skids.filled;
      skids.node.visible = true;
      skids.node.instanceVersion++;
    };
    const update = (dt, elapsed) => {
      spinT += dt;
      const list = racers.racers;
      for (let i = 0; i < bananas.length; i++) {
        const b = bananas[i];
        if (b.taken > 0) {
          b.taken -= dt;
          if (b.taken <= 0) b.node.visible = true;
          continue;
        }
        b.node.rotation.y = spinT * 2.4 + b.phase;
        b.node.position.y = b.y + 0.55 + Math.sin(spinT * 3 + b.phase) * 0.08;
        for (let k = 0; k < list.length; k++) {
          const r = list[k];
          if (r.respawn > 0 || Math.abs(r.y - b.y) > 1.5) continue;
          if ((r.x - b.x) ** 2 + (r.z - b.z) ** 2 < 1.3) {
            b.taken = BANANA_RESPAWN;
            b.node.visible = false;
            if (r.bananas < METER_MAX) r.bananas++;
            if (r.bananas >= METER_MAX) r.meterFull = true;
            if (events.onBanana) events.onBanana(r, b);
            break;
          }
        }
      }
      for (let i = 0; i < crates.length; i++) {
        const c = crates[i];
        if (c.taken > 0) {
          c.taken -= dt;
          if (c.taken <= 0) c.node.visible = true;
          continue;
        }
        c.node.rotation.y = spinT * 1.6 + c.phase;
        c.node.position.y = c.y + 0.25 + Math.sin(spinT * 2 + c.phase) * 0.1;
        for (let k = 0; k < list.length; k++) {
          const r = list[k];
          if (r.respawn > 0 || r.item || Math.abs(r.y - c.y) > 1.5) continue;
          if ((r.x - c.x) ** 2 + (r.z - c.z) ** 2 < 1.6) {
            c.taken = CRATE_RESPAWN;
            c.node.visible = false;
            r.item = rollItem(r, `${elapsed.toFixed(2)}/${r.index}`);
            if (events.onCrate) events.onCrate(r, r.item);
            break;
          }
        }
      }
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        p.node.glow = 0.8 + Math.sin(spinT * 5 + p.phase) * 0.3;
        for (let k = 0; k < list.length; k++) {
          const r = list[k];
          if (r.respawn > 0 || r.airborne || Math.abs(r.y - p.y) > 1) continue;
          const dx = r.x - p.x, dz = r.z - p.z;
          const along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading), across = dx * Math.cos(p.heading) - dz * Math.sin(p.heading);
          if (Math.abs(along) < 1.3 && Math.abs(across) < 1.1 && r.boost < BOOST_PAD * 0.5) {
            r.boost = BOOST_PAD;
            if (events.onPad) events.onPad(r);
          }
        }
      }
      for (let i = 0; i < rocks.length; i++) {
        const rock = rocks[i];
        if (!rock.live) continue;
        rock.life -= dt;
        rock.x += rock.vx * dt;
        rock.z += rock.vz * dt;
        rock.vy -= 12 * dt;
        rock.y += rock.vy * dt;
        rock.idx = track.nearest(rock.x, rock.z, rock.idx);
        const ground = track.heightAt(rock.x, rock.z, rock.idx);
        if (rock.y < ground + 0.3) {
          rock.y = ground + 0.3;
          rock.vy = Math.abs(rock.vy) * 0.4;
        }
        setVec(rock.node.position, rock.x, rock.y, rock.z);
        rock.node.rotation.x += dt * 9;
        rock.node.rotation.z += dt * 5;
        let done = rock.life <= 0 || track.surfaceAt(rock.x, rock.z, rock.idx, 0) === SURF.gap;
        for (let k = 0; k < list.length && !done; k++) {
          const r = list[k];
          if (r === rock.owner || r.respawn > 0 || Math.abs(r.y - rock.y) > 1.4) continue;
          if ((r.x - rock.x) ** 2 + (r.z - rock.z) ** 2 < 1.2) {
            if (racers.spinOut(r, 1) && events.onHit) events.onHit(r, rock.owner, "rock");
            done = true;
          }
        }
        if (done) {
          rock.live = false;
          rock.node.visible = false;
          fx.burst(rock.x, rock.y, rock.z, 5, [models.particleGeometry("#6b625a", 0.09, 0)], 1.6);
        }
      }
      for (let i = 0; i < peels.length; i++) {
        const p = peels[i];
        if (!p.live) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.live = false;
          p.node.visible = false;
          continue;
        }
        for (let k = 0; k < list.length; k++) {
          const r = list[k];
          if (r.respawn > 0 || r.airborne || Math.abs(r.y - p.y) > 1) continue;
          if ((r.x - p.x) ** 2 + (r.z - p.z) ** 2 < 0.9) {
            if (racers.spinOut(r, 0.9)) {
              p.live = false;
              p.node.visible = false;
              if (events.onHit) events.onHit(r, p.owner, "peel");
            }
            break;
          }
        }
      }
      for (let i = 0; i < boulders.length; i++) {
        const b = boulders[i];
        if (!b.live) continue;
        b.t += dt;
        const lat = Math.sin(b.t * 0.55) * b.span;
        const x = b.x + b.rx * lat, z = b.z + b.rz * lat;
        b.roll += Math.cos(b.t * 0.55) * b.span * 0.55 * dt / 0.85;
        setVec(b.node.position, x, b.y + 0.85, z);
        b.node.rotation.z = -b.roll * (b.rz >= 0 ? 1 : -1);
        for (let k = 0; k < list.length; k++) {
          const r = list[k];
          if (r.respawn > 0 || Math.abs(r.y - b.y) > 2) continue;
          if ((r.x - x) ** 2 + (r.z - z) ** 2 < 2.6) {
            if (racers.spinOut(r, 1.2)) {
              r.x += (r.x - x) * 0.6;
              r.z += (r.z - z) * 0.6;
              if (events.onHit) events.onHit(r, null, "boulder");
            }
          }
        }
      }
      // Skid marks under drifting wheels
      for (let k = 0; k < list.length; k++) {
        const r = list[k];
        if (!r.drift.active || r.airborne || r.respawn > 0 || r.mount.id === "run") continue;
        const sx = Math.cos(r.heading) * 0.45, sz = -Math.sin(r.heading) * 0.45;
        const yaw = r.motionHeading;
        if (((elapsed * 30) | 0) % 2 === 0) {
          writeSkid(r.x + sx, r.y, r.z + sz, yaw);
          writeSkid(r.x - sx, r.y, r.z - sz, yaw);
        }
      }
    };
    const dispose = () => {
      for (const b of bananas) removeChild(root, b.node);
      for (const c of crates) removeChild(root, c.node);
      for (const p of pads) removeChild(root, p.node);
      for (const r of rocks) removeChild(root, r.node);
      for (const p of peels) removeChild(root, p.node);
      for (const b of boulders) removeChild(root, b.node);
      removeChild(root, skids.node);
      bananas.length = crates.length = pads.length = rocks.length = peels.length = boulders.length = 0;
    };
    const stats = () => ({ pickups: bananas.length + crates.length, rocksLive: rocks.filter((r) => r.live).length, peelsLive: peels.filter((p) => p.live).length, skids: skids.filled });
    return { setTrack, clear, use, update, dispose, stats, events, bananas, crates, pads, rocks, peels, boulders, skids, METER_MAX, ITEMS };
  };
  BL.raceItems = { create, ITEMS, METER_MAX, SKID_CAP, ROCK_CAP, PEEL_CAP };
})();
