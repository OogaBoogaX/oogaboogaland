(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { createNode, addChild, removeChild } = BL.scene;
  // Pooled particle nodes housekeeping keeps
  const POOL_KEEP = 32;
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const CONFETTI = ["#d8892b", "#22c55e", "#6f9fca", "#f3efe4", "#f5c542"].map((c) => models.particleGeometry(c, 0.09, 0.6));
  const SCREEN = { x: 0, y: 0, depth: 0 };
  const drawBubble = (ctx, text, x, y, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.font = "bold 10px ui-monospace, monospace";
    const tw = ctx.measureText(text).width;
    const px = 3;
    const bw = Math.ceil((tw + 28) / px) * px;
    const bh = 11 * px;
    const bx = Math.round((x - bw / 2) / px) * px;
    const by = Math.round((y - bh - 14) / px) * px;
    const tx = Math.round(x / px) * px;
    const bg = "rgba(18,18,18,0.95)";
    ctx.fillStyle = bg;
    ctx.fillRect(bx + px, by + px, bw - 2 * px, bh - 2 * px);
    ctx.fillStyle = "#d8892b";
    ctx.fillRect(bx + px, by, bw - 2 * px, px);
    ctx.fillRect(bx + px, by + bh - px, bw - 2 * px, px);
    ctx.fillRect(bx, by + px, px, bh - 2 * px);
    ctx.fillRect(bx + bw - px, by + px, px, bh - 2 * px);
    ctx.fillRect(tx - 2 * px, by + bh, 4 * px, px);
    ctx.fillRect(tx - px, by + bh + px, 2 * px, px);
    ctx.fillStyle = bg;
    ctx.fillRect(tx - px, by + bh - px, 2 * px, 2 * px);
    ctx.fillStyle = "#eeeeee";
    ctx.textAlign = "center";
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 4);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  };
  // Particles, bubbles, sleep marks and the ticker
  const create = ({ root, renderer, overlay, tickerAt }) => {
    const overlayCtx = overlay.getContext("2d");
    const particles = [];
    const particlePool = [];
    const MAX_PARTICLES = 240;
    const spawnParticle = (geometry, x, y, z, vx, vy, vz, life, spin = 6) => {
      if (particles.length >= MAX_PARTICLES) return;
      let p = particlePool.pop();
      if (!p) {
        p = { node: createNode({ visible: false }), vx: 0, vy: 0, vz: 0, life: 0, spin: 0 };
        addChild(root, p.node);
      }
      p.node.geometry = geometry;
      p.node.visible = true;
      setVec(p.node.position, x, y, z);
      setVec(p.node.scale, 1, 1, 1);
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
      p.life = life;
      p.spin = spin;
      particles.push(p);
    };
    const stepParticles = (dt) => {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          p.node.visible = false;
          particles.splice(i, 1);
          particlePool.push(p);
          continue;
        }
        p.vy -= 3.2 * dt;
        p.node.position.x += p.vx * dt;
        p.node.position.y += p.vy * dt;
        p.node.position.z += p.vz * dt;
        if (p.node.position.y < 0.03) {
          p.node.position.y = 0.03;
          p.vy *= -0.3;
          p.vx *= 0.7;
          p.vz *= 0.7;
        }
        p.node.rotation.x += p.spin * dt;
        p.node.rotation.z += p.spin * 0.7 * dt;
        const s = Math.min(1, p.life / 0.4);
        p.node.scale.x = p.node.scale.y = p.node.scale.z = s;
      }
    };
    const burst = (x, y, z, count, geos, speed = 3) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
        spawnParticle(geos[i % geos.length], x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 2.5, Math.sin(a) * s, 1.4 + Math.random() * 0.8);
      }
    };
    const bubbles = [];
    const zzz = [];
    let ticker = null;
    const MAX_BUBBLES = 10;
    const say = (cave, text, dur = 2.4) => {
      const existing = bubbles.find((b) => b.cave === cave);
      if (existing) {
        existing.text = text;
        existing.t = 0;
        existing.dur = dur;
        return;
      }
      if (bubbles.length >= MAX_BUBBLES) bubbles.shift();
      bubbles.push({ cave, text, t: 0, dur });
    };
    const sayAt = (x, y, z, text, dur = 2) => {
      if (bubbles.length >= MAX_BUBBLES) bubbles.shift();
      bubbles.push({ at: { x, y, z }, text, t: 0, dur });
    };
    const zzzAt = (x, y, z) => {
      zzz.push({ x, y, z, t: 0 });
      if (zzz.length > 40) zzz.shift();
    };
    const showTicker = (text, dur) => {
      ticker = { text, t: 0, dur };
    };
    let overlayW = 0, overlayH = 0, overlayDpr = 1;
    const project = (x, y, z) => renderer.project(x, y, z, SCREEN);
    // drawExtra paints between the bubbles and the ticker
    const drawOverlay = (dt, drawExtra) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = overlay.clientWidth, h = overlay.clientHeight;
      if (w !== overlayW || h !== overlayH || dpr !== overlayDpr) {
        overlayW = w;
        overlayH = h;
        overlayDpr = dpr;
        overlay.width = Math.max(1, Math.round(w * dpr));
        overlay.height = Math.max(1, Math.round(h * dpr));
        overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const ctx = overlayCtx;
      ctx.clearRect(0, 0, w, h);
      for (let i = zzz.length - 1; i >= 0; i--) {
        const p = zzz[i];
        p.t += dt;
        if (p.t > 2.4) {
          zzz.splice(i, 1);
          continue;
        }
        const pos = project(p.x, p.y + p.t * 0.45, p.z);
        if (!pos) continue;
        ctx.globalAlpha = (1 - p.t / 2.4) * 0.8;
        ctx.fillStyle = "#ffb347";
        ctx.font = `${Math.round(11 + p.t * 5)}px ui-monospace, monospace`;
        ctx.fillText("z", pos.x + Math.sin(p.t * 3) * 6, pos.y);
      }
      ctx.globalAlpha = 1;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.t += dt;
        if (b.t > b.dur) {
          bubbles.splice(i, 1);
          continue;
        }
        const pos = b.cave
          ? project(b.cave.root.position.x, b.cave.root.position.y + (b.cave.state === "sleeping" ? 0.6 : b.cave.headOffset + 0.05), b.cave.root.position.z)
          : project(b.at.x, b.at.y, b.at.z);
        if (!pos) continue;
        const fade = Math.min(1, b.t / 0.2, (b.dur - b.t) / 0.3);
        drawBubble(ctx, b.text, pos.x, pos.y, fade);
      }
      drawExtra(ctx, project, drawBubble);
      if (ticker) {
        ticker.t += dt;
        if (ticker.t > ticker.dur) ticker = null;
        else {
          const pos = project(tickerAt.x, tickerAt.y, tickerAt.z);
          if (pos) {
            const fade = Math.min(1, ticker.t / 0.3, (ticker.dur - ticker.t) / 0.5);
            ctx.globalAlpha = fade;
            ctx.font = "bold 13px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffd27a";
            ctx.shadowColor = "#d8892b";
            ctx.shadowBlur = 12;
            ctx.fillText(ticker.text, pos.x, pos.y);
            ctx.shadowBlur = 0;
            ctx.textAlign = "left";
            ctx.globalAlpha = 1;
          }
        }
      }
    };
    const trimPool = () => {
      while (particlePool.length > POOL_KEEP) removeChild(root, particlePool.pop().node);
    };
    const dispose = () => {
      for (const p of particles) removeChild(root, p.node);
      for (const p of particlePool) removeChild(root, p.node);
      particles.length = 0;
      particlePool.length = 0;
      bubbles.length = 0;
      zzz.length = 0;
      ticker = null;
    };
    const stats = () => ({ particles: particles.length, pool: particlePool.length, bubbles: bubbles.length, zzz: zzz.length });
    return {
      spawnParticle, burst, say, sayAt, zzzAt, showTicker, drawOverlay, update: stepParticles, trimPool, dispose, stats,
      get inMotion() {
        return particles.length > 0;
      }
    };
  };
  BL.fx = { create, CONFETTI };
})();
