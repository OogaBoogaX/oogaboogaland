// Cached, renderer-neutral gate geometry. Local +Y is the front of the horizon.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, M = BL.models, S = BL.scene;
  const rings = new Map();
  const labels = new Map();
  const PORTAL_BLUE = "#287cae";
  const RING_BLUE = "#41596c";
  const SCREEN_WIDTH = 3.2, LEVER_WIDTH = 0.92, CONTROL_GAP = 0.18;
  const PANEL_HEIGHT = 1.22, BORDER = 0.075, OUTER_MARGIN = 0.1;
  let disc, surge, pedestal, ringBolt, controlBack, screenFrame, controlLights, controlGrip, controlPlate, controlHub;
  const destinationLabel = label => {
    if (!labels.has(label)) {
      const parts = [];
      const line = (text, cell, y, color) => {
        const width = (text.length * 6 - 1) * cell;
        for (let i = 0; i < text.length; i++) {
          const glyph = BL.jumbotron.text.glyphOf(text[i]);
          for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if (glyph[row] & (1 << (4 - col))) {
            parts.push(M.box({ w: cell * 0.85, h: cell * 0.85, d: 0.006, color, emissive: 0.8,
              offset: { x: -width / 2 + (i * 6 + col + 0.5) * cell, y: y + (3 - row) * cell, z: 0.229 } }));
          }
        }
      };
      line("OOGA PORTAL DESTINATION", 0.021, 0.3, "#63a5b4");
      line(label, Math.min(0.04, (SCREEN_WIDTH - 0.3) / Math.max(1, label.length * 6 - 1)), -0.05, "#b2f3ee");
      labels.set(label, M.merge(...parts));
    }
    return labels.get(label);
  };
  const wallControl = () => {
    if (!controlBack) {
      // Cache both palettes; a switch replaces geometry without rewriting shared faces.
      const blues = [RING_BLUE, PORTAL_BLUE].map(BL.math.hexToRgb);
      const blueAccent = geometry => blues.map(color => ({ ...geometry, faces: geometry.faces.map(face => ({ ...face, color })) }));
      controlLights = [RING_BLUE, PORTAL_BLUE].map((color, active) => M.merge(...[-1, 1].map(side => M.box({
        w: BORDER, h: PANEL_HEIGHT - 0.2, d: 0.015, color, emissive: active ? 0.8 : 0,
        offset: { x: side * (LEVER_WIDTH - BORDER) / 2, z: 0.218 } }))));
      controlGrip = blueAccent(BL.hubModels.matrixLeverGrip());
      controlHub = blueAccent(BL.hubModels.matrixLeverHub());
      // A deep backing meets the stepped stone while the controls face into the room.
      controlBack = M.box({ w: SCREEN_WIDTH + LEVER_WIDTH + CONTROL_GAP + OUTER_MARGIN * 2, h: PANEL_HEIGHT + OUTER_MARGIN * 2, d: 1.05, color: "#343e44", offset: { z: -0.4 } });
      // Four rails leave a real opening, so the inset face can share their
      // front plane. Both panels share height, trim, finish and corner hardware.
      const panel = width => [RING_BLUE, PORTAL_BLUE].map((color, active) => M.merge(
        ...[-1, 1].flatMap(side => [
          M.box({ w: width, h: BORDER, d: 0.15, color, emissive: active ? 0.8 : 0, offset: { y: side * (PANEL_HEIGHT - BORDER) / 2, z: 0.15 } }),
          M.box({ w: BORDER, h: PANEL_HEIGHT - BORDER * 2, d: 0.15, color, emissive: active ? 0.8 : 0, offset: { x: side * (width - BORDER) / 2, z: 0.15 } })]),
        M.box({ w: width - BORDER * 2, h: PANEL_HEIGHT - BORDER * 2, d: 0.05, color: "#10262d", offset: { z: 0.2 } }),
        ...[-1, 1].flatMap(x => [-1, 1].map(y => M.box({ w: 0.1, h: 0.1, d: 0.09, color: RING_BLUE,
          offset: { x: x * (width / 2 - 0.05), y: y * (PANEL_HEIGHT / 2 - 0.05), z: 0.26 } })))));
      controlPlate = panel(LEVER_WIDTH); screenFrame = panel(SCREEN_WIDTH);
    }
    const root = S.createNode({ geometry: controlBack });
    const button = S.createNode({ position: { x: -(SCREEN_WIDTH + CONTROL_GAP) / 2, y: 0, z: 0 }, geometry: controlPlate[0], glow: 0.25 });
    const lights = S.createNode({ geometry: controlLights[0], glow: 0.25 });
    const hub = S.createNode({ position: { x: 0, y: 0, z: 0.27 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, geometry: controlHub[0] });
    const lever = S.createNode({ position: { x: 0, y: 0, z: 0.48 }, rotation: { x: Math.PI - 0.42, y: 0, z: 0 }, geometry: BL.hubModels.matrixLeverArm() });
    const grip = S.createNode({ geometry: controlGrip[0], glow: 0.25 });
    const screen = S.createNode({ position: { x: (LEVER_WIDTH + CONTROL_GAP) / 2, y: 0, z: 0 }, geometry: screenFrame[0], glow: 0.25 });
    const label = S.createNode();
    const labels = S.createNode({ geometry: BL.hubModels.matrixLeverLabels(), glow: 0.5 });
    S.addChild(lever, grip); S.addChild(button, lights, hub, lever, labels); S.addChild(screen, label); S.addChild(root, button, screen);
    let lit = false;
    const setActive = active => {
      if (active === lit) return;
      lit = active; const index = active ? 1 : 0;
      button.geometry = controlPlate[index]; lights.geometry = controlLights[index];
      grip.geometry = controlGrip[index]; hub.geometry = controlHub[index]; screen.geometry = screenFrame[index];
      lights.glow = grip.glow = button.glow = screen.glow = active ? 0.9 : 0.25;
    };
    return { root, button, lever, lights, grip, screen, label, setActive };
  };
  const build = (radius, outerRadius, floorMounted = false) => {
    const key = radius + ":" + outerRadius + ":" + floorMounted;
    if (!rings.has(key)) {
      const bottom = floorMounted ? -0.16 : -0.08, top = floorMounted ? 0 : 0.08;
      rings.set(key, [RING_BLUE, PORTAL_BLUE].map((color, active) => {
        const geometry = M.lathe({
          profile: [[radius, bottom], [outerRadius, bottom], [outerRadius, top], [radius, top], [radius, bottom]],
          segments: 32, color, emissive: active ? 0.8 : 0 });
        // The flush top overlaps the voxel stones. Give it WebGL's surface
        // overlay priority as well as the node's Canvas depth bias below.
        geometry.depthOffset = floorMounted;
        return geometry;
      }));
    }
    if (!disc) {
      // A tessellated, two-sided membrane, shared by every portal. The renderers
      // displace it without touching the cached vertices or allocating per frame.
      const profile = [];
      for (let i = 0; i <= 20; i++) profile.push([i / 20, 0]);
      for (let i = 19; i >= 0; i--) profile.push([i / 20, 0]);
      disc = M.lathe({ profile, segments: 64, color: PORTAL_BLUE, emissive: 0.7 });
      disc.portalSurface = true; disc.castShadow = false;
      surge = M.lathe({ profile: [[0.93, 0], [0.965, 0.055], [1, 0], [0.965, -0.012], [0.93, 0]],
        segments: 64, color: "#83e0ed", emissive: 0.9 });
      surge.castShadow = false;
      pedestal = M.merge(M.box({ w: 0.7, h: 0.18, d: 0.7, color: "#485565", offset: { y: 0.09 } }),
        M.box({ w: 0.38, h: 0.8, d: 0.38, color: "#687782", offset: { y: 0.55 } }),
        M.box({ w: 0.8, h: 0.2, d: 0.65, color: "#45687c", offset: { y: 1.0 } }),
        M.box({ w: 0.3, h: 0.04, d: 0.3, color: "#8ae9ee", emissive: 0.8, offset: { y: 1.12 } }));
    }
    const root = S.createNode(), ring = S.createNode({ geometry: rings.get(key)[0], glow: 0.25, depthBias: floorMounted ? 0.3 : 0 });
    const bolts = floorMounted ? S.createNode() : null;
    if (bolts) {
      if (!ringBolt) ringBolt = M.box({ w: 0.1, h: 0.09, d: 0.1, color: RING_BLUE });
      const distance = (radius + outerRadius) / 2;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        S.addChild(bolts, S.createNode({ geometry: ringBolt, position: { x: Math.sin(angle) * distance, y: 0.035, z: -Math.cos(angle) * distance } }));
      }
      S.addChild(ring, bolts);
    }
    const setRingActive = active => {
      if (!floorMounted) return;
      ring.geometry = rings.get(key)[active ? 1 : 0]; ring.glow = active ? 0.9 : 0.25;
    };
    const surfaceY = floorMounted ? -0.08 : 0;
    const horizon = S.createNode({ position: { x: 0, y: surfaceY, z: 0 }, portalTime: 0, portalSurge: 0, portalReveal: 0, matrixNative: true, geometry: disc, visible: false, sightHidden: true, scale: { x: radius, y: 1, z: radius } });
    const kawoosh = S.createNode({ position: { x: 0, y: surfaceY, z: 0 }, geometry: surge, matrixNative: true, visible: false, sightHidden: true });
    // Ripples now belong to the liquid membrane rather than floating rings.
    const ripples = [];
    S.addChild(root, ring, horizon, kawoosh, ...ripples);
    return { root, ring, bolts, setRingActive, surfaceY, horizon, kawoosh, ripples, dialer: S.createNode({ geometry: pedestal }) };
  };
  // Canvas fallback uses the same wave equation as the GPU material.
  const liquidHeight = (x, z, time, surge) => {
    const r = Math.hypot(x, z), envelope = Math.max(0, 1 - r * r);
    const a = Math.hypot(x - 0.22, z + 0.17), b = Math.hypot(x + 0.31, z - 0.24);
    return envelope * (0.016 * Math.sin(a * 32 - time * 4) + 0.01 * Math.sin(b * 25 - time * 3)
      + 0.008 * Math.sin(x * 18 + z * 12 + time * 2) - surge * 0.32 * envelope);
  };
  BL.oogaPortalModels = { build, wallControl, destinationLabel, liquidHeight };
})();
