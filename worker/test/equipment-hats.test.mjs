import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { authorEquipmentHats, checkEquipmentHatSources, extractHat, hatHash, HAT_SOURCES, writeEquipmentHats } from "../../scripts/equipment-hats.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const catalog = JSON.parse(read("src/equipment/hats/catalog.json"));
// Historical model-regression inputs stay fixed; contributors can edit their own live source
// without rewriting engine goldens or historical archive comparisons. Fitting recipients,
// removal and pet tests below still use live sources.
const reviewedHeads = JSON.parse(read("worker/test/fixtures/equipment-authored-heads.json"));
const archive = (row = catalog.items[0]) => JSON.parse(read(`src/equipment/hats/${row.current}.json`));
const fixture = (options = {}) => {
  const context = vm.createContext({ URLSearchParams, location: { search: "" }, crypto: webcrypto, TextDecoder, TextEncoder,
    AbortController, setTimeout, clearTimeout, fetch: options.fetch || (() => { throw new Error("unexpected fetch"); }) });
  vm.runInContext("window = globalThis", context);
  const script = (name) => vm.runInContext(read(`src/js/${name}.js`), context);
  for (const name of ["math", "scene", "models", "hero-body", "caves", "contributor-identities", "activity-repos", "characters"]) script(name);
  for (const [, , handle] of HAT_SOURCES) vm.runInContext(options.reviewedHeads ? reviewedHeads.sources[handle] : read(`src/characters/${handle}.js`), context);
  for (const handle of ["natalievarty", "MrHodlX", "w-s-bitcoin"]) vm.runInContext(read(`src/characters/${handle}.js`), context);
  vm.runInContext("BL.characters.add({handle:'Normal',joined:1,lastCommit:1}); BL.characters.add({handle:'Slim',joined:1,lastCommit:1,look:{build:'slim'}})", context);
  for (const name of ["roster-panel", "contributors", "equipment-hats", "equipment-hats.gen", "character-equipment"]) script(name);
  if (options.seed !== false) script("equipment-hat-data.gen");
  if (options.pets) {
    vm.runInContext("BL.pilot = { WALK: { speed: 7.75, gravity: 9.8 } }", context);
    for (const name of ["sign-glyphs", "hub-models", "crew"]) script(name);
  }
  return { context, BL: context.BL, run: (code) => vm.runInContext(code, context),
    cave: (name) => context.BL.models.caveman(context.BL.contributors.traitsFor(name)),
    validate: (value, id) => { context.archiveText = JSON.stringify(value); context.item = id; return vm.runInContext("BL.equipmentHats.validate(JSON.parse(archiveText),item)", context); } };
};
const headTree = (node) => ({ position: node.position, rotation: node.rotation, scale: node.scale,
  geometry: node.geometry ? { verts: Array.from(node.geometry.verts), faces: node.geometry.faces, lines: node.geometry.lines } : null, children: node.children.map(headTree) });
const headGolden = (node) => {
  // Curved hats use sin/cos: their last floating-point bits vary by CPU/libm.
  // Nine decimal places retain geometry far below a voxel; topology and colors stay exact.
  const coordinate = (value) => { assert.ok(Number.isFinite(value)); return Number(value.toFixed(9)); };
  const vector = (value) => ({ x: coordinate(value.x), y: coordinate(value.y), z: coordinate(value.z) });
  const stable = (row) => ({ position: vector(row.position), rotation: vector(row.rotation), scale: vector(row.scale),
    geometry: row.geometry ? { verts: Array.from(row.geometry.verts, coordinate), faces: row.geometry.faces, lines: row.geometry.lines } : null,
    children: row.children.map(stable) });
  return hatHash(JSON.stringify(stable(node)));
};
const geometryGolden = (geometry) => headGolden({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 }, geometry, children: [] });
const points = (geometry, unit) => {
  const out = [];
  for (let i = 0; i < geometry.verts.length; i += 3) out.push(Array.from(geometry.verts.slice(i, i + 3), (n) => n / unit));
  return out;
};
const bounds = (vertices) => {
  assert.ok(vertices.length, "measured geometry is not empty");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) for (let i = 0; i < 3; i++) {
    assert.ok(Number.isFinite(vertex[i])); min[i] = Math.min(min[i], vertex[i]); max[i] = Math.max(max[i], vertex[i]);
  }
  return { min, max, size: max.map((n, i) => n - min[i]) };
};
const fittedPoints = (f, cave) => {
  const root = cave.equipmentHatNode, unit = cave.traits.height / 16;
  f.BL.scene.updateWorld(root, null);
  return root.children.map((node) => node.visible ? points(node.geometry, 1).map((point) => {
    const out = []; f.BL.math.mat4.transformPoint(out, node.world, ...point);
    return out.map((n) => n / unit);
  }) : []);
};
const between = (value, min, max, label) => assert.ok(value >= min && value <= max, `${label}: ${value} outside [${min}, ${max}]`);
const lowerFace = (geometry, unit) => {
  // Stalk and leaf start above this region. Compare the actual face, tusks, beard and apple shell below it,
  // independent of merge order or vertex indices in the authored and bare variants.
  const vertices = points(geometry, unit), faces = geometry.faces.filter((face) => face.i.every((i) => vertices[i][1] < 6.5));
  assert.ok(faces.length > 100);
  return JSON.stringify(faces.map((face) => ({ color: face.color, emissive: face.emissive,
    vertices: face.i.map((i) => vertices[i].map((n) => Number(n.toFixed(9)))) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
};
// Captured with headGolden from untouched fa2a62e sources, before separating the nine headwear hooks.
const ORIGINAL_HEADS = {
  "Bitcoin-Bill": "51a59b324335063da9b6a71bc3897cc0029b4a1fe547904270b8d87757b4fa62",
  "Global-DSB": "eebf7d9e2cf1c44cd191f3660a76af854196ee9525b71739228db786df66343b",
  bc1gui: "769e9d43dc5e41b45136eb73305ad2a2cacf3a3a3c71db603e71880a0b9194fb",
  hotpixelgroup: "859fb2a20e0eb0225817849bdf8f71a8c3c59026765517e2804177bfdc16ab9d",
  itsLiran: "53c831a5c9e8c2b32e5e66d27c9bc1c440ae747b9fe916225b817482019a3a8b",
  johnstackton21m: "7704dddb2bca9aba561ba3632bee5b3f917ca5d1701bd6a7f8a373431d0128ef",
  "midy-machete": "5a113dc6b5ed8d8bc66712e273ba5c234a23c07044e7ed3b3ce71ee24c2a4610",
  "rules-without-rulers": "a5464a70476af841be342d59153f3d167303cb2aa7bbb286eabe3ae5579e0974",
  timechainb: "2faf14d8d872751cbecd89ac829b13eac64605d93886f5412d27700bea5baa17"
};

test("the nine authored heads retain their original geometry and clones own their hat nodes", () => {
  assert.equal(reviewedHeads.format, 1);
  assert.deepEqual(Object.keys(reviewedHeads.sources).sort(), HAT_SOURCES.map(([, , handle]) => handle).sort());
  const f = fixture({ reviewedHeads: true });
  for (const [, , handle] of HAT_SOURCES) {
    const a = f.cave(handle), b = f.cave(handle);
    assert.equal(headGolden(a.parts.head), ORIGINAL_HEADS[handle], handle);
    assert.notEqual(a.parts.nativeHat, b.parts.nativeHat);
    for (let i = 0; i < a.parts.nativeHat.length; i++) {
      assert.notEqual(a.parts.nativeHat[i], b.parts.nativeHat[i]);
      assert.equal(a.parts.nativeHat[i].geometry, b.parts.nativeHat[i].geometry);
      assert.equal(a.parts.nativeHat[i].parent, a.parts.head);
    }
  }
});

test("authored geometry goldens ignore only floating-point noise and retain shape, color and topology checks", () => {
  const tree = headTree(fixture({ reviewedHeads: true }).cave("johnstackton21m").parts.head), expected = headGolden(tree);
  const copy = () => JSON.parse(JSON.stringify(tree)), helmet = (row) => row.children.find((child) => child.geometry?.verts.length > 300);
  const noise = copy(); helmet(noise).geometry.verts[0] += 1e-15;
  assert.notEqual(JSON.stringify(noise), JSON.stringify(tree)); assert.equal(headGolden(noise), expected);
  const shape = copy(); helmet(shape).geometry.verts[0] += 1e-8; assert.notEqual(headGolden(shape), expected);
  const pose = copy(); pose.rotation.x += 1e-8; assert.notEqual(headGolden(pose), expected);
  const color = copy(); helmet(color).geometry.faces[0].color[0]++; assert.notEqual(headGolden(color), expected);
  const topology = copy(), indices = helmet(topology).geometry.faces[0].i;
  [indices[0], indices[1]] = [indices[1], indices[0]]; assert.notEqual(headGolden(topology), expected);
  const missing = copy(); missing.children.pop(); assert.notEqual(headGolden(missing), expected);
});

test("normal and slim recipients share immutable hats, while live roots, poses and anatomy remain their own", () => {
  const f = fixture(), a = f.cave("Normal"), b = f.cave("Slim"), render = f.BL.characterEquipment;
  const rootNode = a.root, head = a.parts.head, face = a.parts.face, open = a.headOpen;
  a.root.position.x = 9; a.root.rotation.y = 1.2; a.parts.head.rotation.x = 0.2; a.health = { value: 31 }; a.weapon = { ammo: 7 };
  for (const row of catalog.items) {
    const selected = { item: row.id, version: row.current };
    assert.equal(render.apply(a, selected), true); assert.equal(render.apply(b, selected), true);
    assert.equal(a.root, rootNode); assert.equal(a.parts.head, head); assert.equal(a.parts.face, face); assert.equal(a.headOpen, open);
    assert.equal(a.root.position.x, 9); assert.equal(a.root.rotation.y, 1.2); assert.equal(a.parts.head.rotation.x, 0.2);
    assert.equal(a.health.value, 31); assert.equal(a.weapon.ammo, 7);
    assert.equal(a.equipmentHatNode.children[0].geometry, b.equipmentHatNode.children[0].geometry);
    for (const child of a.equipmentHatNode.children) assert.equal(child.geometry.depthOffset, true, row.id + " wins head/hair depth ties");
    assert.equal(a.headOpen.depthOffset, undefined, "the wearer's head keeps ordinary depth");
    const unchanged = a.equipmentHatNode;
    for (let i = 0; i < 20; i++) assert.equal(render.apply(a, selected), true);
    assert.equal(a.equipmentHatNode, unchanged, "same revision never allocates another node");
    assert.equal(head.children.length, 2, "one face and one equipment group, without leaked old hats");
  }
  assert.equal(render.apply(a, null), true); assert.equal(a.equipmentHatNode, null); assert.equal(head.children.length, 1);
  assert.equal(a.headOpen, open); assert.equal(render.selection(a), null);
});

test("no hat and borrowed hats remove native headwear and restore exact authored geometry, including closed eyes", () => {
  const f = fixture(), render = f.BL.characterEquipment, row = catalog.items[0];
  for (const [, , handle] of HAT_SOURCES) {
    const a = f.cave(handle), original = a.headOpen, closed = a.headClosed, head = a.parts.head;
    const count = head.children.length, native = a.parts.nativeHat;
    head.geometry = closed;
    const before = hatHash(JSON.stringify(headTree(head)));
    assert.equal(render.apply(a, { item: "none", version: null }), true, handle);
    assert.ok(native.every((node) => node.visible === false));
    if (a.traits.dress.hat) assert.notEqual(a.headOpen, original, handle + " has a separate bare head");
    assert.equal(head.geometry, a.headClosed, "blink phase survives selection");
    assert.equal(render.apply(a, { item: row.id, version: row.current }), true);
    assert.equal(head.children.length, count + 1);
    assert.equal(render.apply(a, null), true); assert.equal(head.children.length, count);
    assert.equal(a.headOpen, original); assert.equal(a.headClosed, closed); assert.equal(head.geometry, closed);
    assert.ok(native.every((node) => node.visible === true));
    assert.equal(hatHash(JSON.stringify(headTree(head))), before, handle);
  }
});

test("unreviewed custom heads and unknown versions leave the existing appearance untouched", () => {
  const f = fixture(), render = f.BL.characterEquipment, selected = { item: catalog.items[0].id, version: catalog.items[0].current };
  for (const name of ["natalievarty", "MrHodlX"]) {
    const a = f.cave(name), before = JSON.stringify(headTree(a.parts.head));
    assert.equal(render.supports(a), false); assert.equal(render.apply(a, selected), false);
    assert.equal(render.apply(a, { item: "none", version: null }), false); assert.equal(JSON.stringify(headTree(a.parts.head)), before);
  }
  const normal = f.cave("Normal"); assert.equal(render.apply(normal, { item: "unknown", version: "a".repeat(64) }), false);
  assert.equal(f.BL.equipmentHats.has("none", undefined), false); assert.equal(normal.equipmentHatNode, undefined);
});

test("closed apple hats cover the stalk and leaf while open crowns and removal restore the exact authored head", () => {
  const f = fixture(), a = f.cave("w-s-bitcoin"), render = f.BL.characterEquipment;
  const head = a.parts.head, open = a.headOpen, closed = a.headClosed, portrait = a.portraitHead, unit = a.traits.height / 16;
  // Captured before the equipmentBare branch was added to the apple's approved builder.
  assert.equal(headGolden(head), "46cea00c8da2f0e3002fd5c3cf0b0290a79171af8929a1a9e788d6e0a1452964");
  assert.equal(geometryGolden(open), "68675887b7f8f5b9da2da39a3c496856a3eee5827c01f1804297842549f34e89");
  assert.equal(geometryGolden(closed), "37cd989d1d2d85471ce72bf1389d37d62177b0bac308c0d2347dddd9e18e1855");
  assert.equal(geometryGolden(portrait), geometryGolden(open));
  const originals = [lowerFace(open, unit), lowerFace(closed, unit)], rootNode = a.root, face = a.parts.face, torso = a.parts.torso;
  const openCrowns = new Set(["hotpixelgroup-flame-crown", "midy-machete-crown"]);
  a.root.position.x = 9; a.root.rotation.y = 1.2; head.rotation.x = 0.2;
  const before = headGolden(head); let bareOpen, bareClosed;
  assert.equal(render.supports(a), true);
  for (const blinking of [false, true]) {
    head.geometry = blinking ? a.headClosed : a.headOpen;
    // Interleave a closed hat and an open crown so both transitions run, not only transitions from authored.
    for (const id of ["bitcoin-bill-straw", "hotpixelgroup-flame-crown", ...catalog.items.map((row) => row.id)]) {
      const row = catalog.items.find((item) => item.id === id), selected = { item: row.id, version: row.current };
      assert.equal(render.apply(a, selected), true);
      assert.equal(a.root, rootNode); assert.equal(a.parts.head, head); assert.equal(a.parts.face, face); assert.equal(a.parts.torso, torso);
      assert.equal(a.root.position.x, 9); assert.equal(a.root.rotation.y, 1.2); assert.equal(head.rotation.x, 0.2);
      assert.equal(head.geometry, blinking ? a.headClosed : a.headOpen, "selection preserves the blink phase");
      assert.equal(lowerFace(a.headOpen, unit), originals[0]); assert.equal(lowerFace(a.headClosed, unit), originals[1]);
      if (openCrowns.has(id)) {
        assert.equal(a.headOpen, open); assert.equal(a.headClosed, closed); assert.equal(a.portraitHead, portrait);
        between(bounds(points(a.headOpen, unit)).max[1], 11, 11.2, "open crown retains stalk and leaf");
      } else {
        assert.notEqual(a.headOpen, open); assert.notEqual(a.headClosed, closed);
        between(bounds(points(a.headOpen, unit)).max[1], 7.9, 8.1, "covered apple has no protruding stalk or leaf");
        if (bareOpen) { assert.equal(a.headOpen, bareOpen); assert.equal(a.headClosed, bareClosed); }
        bareOpen = a.headOpen; bareClosed = a.headClosed;
      }
      const node = a.equipmentHatNode;
      assert.equal(render.apply(a, selected), true); assert.equal(a.equipmentHatNode, node);
      assert.equal(head.children.length, 2, "one face and one worn group without leaked hats");
    }
    for (const selection of [{ item: "none", version: null }, null]) {
      assert.equal(render.apply(a, selection), true); assert.equal(a.equipmentHatNode, null);
      assert.equal(a.headOpen, open); assert.equal(a.headClosed, closed); assert.equal(a.portraitHead, portrait);
      assert.equal(head.geometry, blinking ? closed : open); assert.equal(head.children.length, 1);
    }
  }
  head.geometry = open;
  assert.equal(headGolden(head), before, "removal restores the complete original head tree and pose");
});

test("apple fittings keep practical crown clearance and authored hat proportions", () => {
  const f = fixture(), a = f.cave("w-s-bitcoin"), normal = f.cave("Normal"), render = f.BL.characterEquipment;
  const caps = new Set(["global-dsb-spiked-helmet", "bc1gui-green-beanie", "hotpixelgroup-flame-crown", "itsliran-taproot-cap", "timechainb-gold-crown"]);
  for (const row of catalog.items) {
    const selected = { item: row.id, version: row.current };
    assert.equal(render.apply(a, selected), true); assert.equal(render.apply(normal, selected), true);
    const nodes = fittedPoints(f, a), full = bounds(nodes.flat()), shell = bounds(nodes[0]);
    for (let i = 0; i < nodes.length; i++) assert.equal(a.equipmentHatNode.children[i].geometry, normal.equipmentHatNode.children[i].geometry,
      row.id + " keeps the original immutable mesh shared with ordinary recipients");
    if (caps.has(row.id)) {
      // The apple is nine cells wide and eight deep, centered at z=-0.5. Measure the shell near the crown;
      // the cap's projecting bill and the beanie's hanging tip are deliberately outside this region.
      const rim = bounds(nodes[0].filter((p) => p[1] >= 7 && p[1] <= 8.5 && p[2] < 4.5));
      between(-4.5 - rim.min[0], 0.15, 0.3, row.id + " left clearance");
      between(rim.max[0] - 4.5, 0.15, 0.3, row.id + " right clearance");
      between(-4.5 - rim.min[2], 0.1, 0.3, row.id + " back clearance");
      between(rim.max[2] - 3.5, 0.1, 0.3, row.id + " front clearance");
      between(rim.min[1], 6.95, 8.05, row.id + " overlaps the crown instead of floating above it");
    } else if (row.id === "bitcoin-bill-straw") {
      between(full.size[0], 16, 17, "straw brim width"); between(full.size[2], 16, 17, "straw brim depth");
    } else if (row.id === "midy-machete-crown") {
      between(shell.size[0], 8.8, 9.2, "ruby ring width"); between(shell.size[2], 7.3, 7.7, "ruby ring depth");
      between(shell.min[1], 7.3, 7.8, "ruby ring overlaps the narrowed apple crown");
      between((shell.min[2] + shell.max[2]) / 2, -0.6, -0.4, "ruby ring is centered on the shell");
    } else if (row.id === "rules-without-rulers-top-hat") {
      between(full.size[0], 10, 10.8, "top-hat brim width"); between(full.size[2], 9.8, 10.5, "top-hat brim depth");
      between(full.min[1], 7.5, 8, "tilted top-hat brim touches the crown");
    } else if (row.id === "johnstackton21m-helmet") {
      assert.equal(a.equipmentHatNode.children[2].visible, false, "the donor's face pad does not cover the apple's own face");
      assert.equal(normal.equipmentHatNode.children[2].visible, true, "ordinary recipients retain the donor pad");
      between(shell.size[0], 12.5, 13.1, "space dome width"); between(shell.size[2], 12.5, 13.1, "space dome depth");
      const radius = shell.size[0] / 2, center = [(shell.min[0] + shell.max[0]) / 2, shell.max[1] - radius, (shell.min[2] + shell.max[2]) / 2];
      between(center[1], 3.75, 4.25, "space dome vertical center"); between(center[2], -0.75, -0.25, "space dome depth center");
      for (const p of points(a.headOpen, a.traits.height / 16).filter((p) => p[1] >= 6))
        assert.ok(Math.hypot(...p.map((n, i) => n - center[i])) < radius - 0.2, "apple crown clears the dome lining");
    } else assert.fail("Every reviewed apple hat requires a physical fitting check");
  }
});

test("hat sizing preserves its fitting point and proportions without replacing nodes or accumulating drift", () => {
  const f = fixture(), render = f.BL.characterEquipment, M = f.BL.math.mat4;
  for (const [name, crown, depth] of [["Normal", 7, 0], ["Slim", 7, 0], ["w-s-bitcoin", 8, -0.5],
    ["Bitcoin-Bill", 9, 0], ["midy-machete", 5.8, 0], ["johnstackton21m", 7, 0]]) {
    const cave = f.cave(name), head = cave.parts.head, rootNode = cave.root, unit = cave.traits.height / 16;
    rootNode.position.x = 4; rootNode.rotation.y = 1; head.rotation.x = 0.2;
    head.geometry = cave.headClosed;
    for (const row of catalog.items) {
      const selected = { item: row.id, version: row.current };
      assert.equal(render.apply(cave, selected), true); assert.equal(render.size(cave), 100);
      const node = cave.equipmentHatNode, children = [...node.children], meshes = children.map((child) => child.geometry);
      const state = () => JSON.stringify({ position: node.position, rotation: node.rotation, scale: node.scale });
      const original = state(), originalBounds = bounds(fittedPoints(f, cave).flat()), open = cave.headOpen, closed = cave.headClosed;
      const selection = render.selection(cave), anchor = [0, crown * unit, depth * unit], local = [], inverse = M.create();
      let anchorNode = node;
      if (row.id === "johnstackton21m-helmet") {
        anchorNode = node.children[0]; local.push(0, 0.2, 0);
        M.transformPoint(anchor, anchorNode.world, ...local);
      } else {
        M.invert(inverse, node.world); M.transformPoint(local, inverse, ...anchor);
      }
      for (const percent of [80, 100, 120]) {
        const expected = name === "w-s-bitcoin" && row.id === "johnstackton21m-helmet" ? Math.max(100, percent) : percent;
        assert.equal(render.apply(cave, selected, percent), true); assert.equal(render.size(cave), expected);
        assert.equal(cave.equipmentHatNode, node); assert.equal(render.selection(cave), selection);
        assert.equal(cave.root, rootNode); assert.equal(cave.parts.head, head);
        assert.equal(rootNode.position.x, 4); assert.equal(rootNode.rotation.y, 1); assert.equal(head.rotation.x, 0.2);
        assert.equal(cave.headOpen, open); assert.equal(cave.headClosed, closed); assert.equal(head.geometry, closed);
        assert.equal(node.parent, head);
        for (let i = 0; i < children.length; i++) { assert.equal(node.children[i], children[i]); assert.equal(node.children[i].geometry, meshes[i]); }
        const resized = bounds(fittedPoints(f, cave).flat()), actual = [];
        M.transformPoint(actual, anchorNode.world, ...local);
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(Math.abs(actual[axis] - anchor[axis]) < unit * 1e-5, `${name}/${row.id}: fitting point moves at ${percent}%`);
          assert.ok(Math.abs(resized.size[axis] / originalBounds.size[axis] - expected / 100) < 1e-5,
            `${name}/${row.id}: shape proportions change at ${percent}%`);
        }
        if (expected === 100) assert.equal(state(), original, "100 restores the exact reviewed fit");
      }
      for (let i = 0; i < 30; i++) for (const percent of [80, 120, 100]) assert.equal(render.apply(cave, selected, percent), true);
      assert.equal(state(), original); assert.equal(cave.equipmentHatNode, node); assert.equal(render.size(cave), 100);
    }
  }
});

test("the apple space helmet keeps its reviewed minimum for legacy sizes without changing other fittings", () => {
  const f = fixture(), render = f.BL.characterEquipment, hats = f.BL.equipmentHats;
  const row = catalog.items.find((item) => item.id === "johnstackton21m-helmet"), selected = { item: row.id, version: row.current };
  for (const name of ["w-s-bitcoin", "W-S-BITCOIN", "W-s-Bitcoin"]) {
    for (const item of catalog.items) assert.equal(hats.minimumSize(name, item.id), item === row ? 100 : 80);
    assert.equal(hats.minimumSize(name, "none"), 80);
  }
  for (const name of ["Normal", "Slim", "Bitcoin-Bill", "midy-machete", "johnstackton21m", "w-s-bitcoin-other"])
    assert.equal(hats.minimumSize(name, row.id), 80, name + " keeps the full personal-size range");
  const cave = f.cave("w-s-bitcoin"), open = cave.headOpen;
  assert.equal(render.minimumSize(cave, selected), 100); assert.equal(render.minimumSize(cave, null), 80);
  assert.equal(render.apply(cave, selected, 100), true);
  const node = cave.equipmentHatNode, children = [...node.children], original = JSON.stringify(fittedPoints(f, cave));
  const vertices = fittedPoints(f, cave)[0], shell = bounds(vertices), radius = shell.size[0] / 2;
  const center = [(shell.min[0] + shell.max[0]) / 2, shell.max[1] - radius, (shell.min[2] + shell.max[2]) / 2];
  // Measure the actual faceted lining, not the outer dome's larger radius. Its vertices are at 6.08 cells,
  // but the polygon planes are closer to the center; the whole apple crown must clear those planes too.
  const lining = node.children[0].geometry.faces.filter((face) => face.color.join() === "110,96,71");
  assert.ok(lining.length > 100, "the archived helmet has its complete inner lining");
  const crown = points(cave.headOpen, cave.traits.height / 16).filter((point) => point[1] >= 6);
  let clearance = Infinity;
  for (const face of lining) {
    const facePoints = face.i.map((i) => vertices[i]), normal = [0, 0, 0];
    for (let i = 0; i < facePoints.length; i++) {
      const a = facePoints[i], b = facePoints[(i + 1) % facePoints.length];
      normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
      normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
      normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const length = Math.hypot(...normal);
    assert.ok(length > 1e-8, "lining faces have a measurable plane");
    const distance = (point) => normal.reduce((sum, n, i) => sum + n * (point[i] - facePoints[0][i]), 0) / length;
    const inward = Math.sign(distance(center));
    for (const point of crown) clearance = Math.min(clearance, inward * distance(point));
  }
  assert.ok(clearance > 0.2, "apple crown clears the actual inner lining by " + clearance + " cells");
  for (let size = 80; size < 100; size++) {
    assert.equal(render.apply(cave, selected, 120), true);
    assert.equal(render.apply(cave, selected, size), true);
    assert.equal(render.size(cave), 100); assert.equal(cave.equipmentHatNode, node);
    assert.equal(JSON.stringify(fittedPoints(f, cave)), original, "legacy size " + size + " returns to the exact reviewed fit");
    for (let i = 0; i < children.length; i++) assert.equal(node.children[i], children[i]);
  }
  assert.equal(render.apply(cave, null), true); assert.equal(cave.headOpen, open); assert.equal(cave.equipmentHatNode, null);
});

test("invalid sizes cannot change worn equipment and removing a resized hat restores authored geometry", () => {
  const f = fixture(), cave = f.cave("w-s-bitcoin"), render = f.BL.characterEquipment, row = catalog.items[0];
  const selected = { item: row.id, version: row.current }, open = cave.headOpen, closed = cave.headClosed, portrait = cave.portraitHead;
  cave.parts.head.geometry = closed;
  const before = headGolden(cave.parts.head);
  assert.equal(render.size(cave), 100); assert.equal(render.apply(cave, selected, 80), true);
  const node = cave.equipmentHatNode, worn = headGolden(cave.parts.head), selection = render.selection(cave);
  for (const invalid of [79, 121, 80.5, NaN, Infinity, -Infinity, null, "100", {}, []]) {
    assert.equal(render.apply(cave, selected, invalid), false);
    assert.equal(render.size(cave), 80); assert.equal(render.selection(cave), selection);
    assert.equal(cave.equipmentHatNode, node); assert.equal(headGolden(cave.parts.head), worn);
  }
  assert.equal(render.apply(cave, { item: row.id, version: "a".repeat(64) }, 120), false);
  assert.equal(render.size(cave), 80); assert.equal(cave.equipmentHatNode, node);
  assert.equal(render.apply(cave, selected, undefined), true); assert.equal(render.size(cave), 100); assert.equal(cave.equipmentHatNode, node);
  for (const selection of [{ item: "none", version: null }, null]) {
    assert.equal(render.apply(cave, selected, 120), true);
    assert.equal(render.apply(cave, selection, 80), true); assert.equal(render.size(cave), 100); assert.equal(cave.equipmentHatNode, null);
    assert.equal(cave.headOpen, open); assert.equal(cave.headClosed, closed); assert.equal(cave.portraitHead, portrait);
    assert.equal(cave.parts.head.geometry, closed); assert.equal(headGolden(cave.parts.head), before);
  }
});

test("the straw hat seats on the recipient crown while its original taller-haired owner keeps its authored height", () => {
  const f = fixture(), render = f.BL.characterEquipment, row = catalog.items[0], selected = { item: row.id, version: row.current };
  const donor = fixture({ reviewedHeads: true }).cave("Bitcoin-Bill"), native = donor.parts.nativeHat[0];
  for (const [name, height] of [["Normal", 7], ["Slim", 7], ["w-s-bitcoin", 8], ["Bitcoin-Bill", 9]]) {
    const cave = f.cave(name); assert.equal(render.apply(cave, selected), true);
    // The archived hat's shell begins nine cells above the donor's head pivot. Its seat must touch this crown.
    const node = cave.equipmentHatNode, shell = node.position.y + 9 / 16 * node.scale.y;
    assert.ok(Math.abs(shell / cave.traits.height * 16 - height) < 1e-12, name);
    // The already-roomy crown fits the apple without stretching the authored brim or feather spacing.
    // Compare with the reviewed archive donor's native hat, normalized only for body height.
    const borrowed = node.children[0];
    assert.equal(borrowed.geometry.verts.length, native.geometry.verts.length);
    for (let i = 0; i < borrowed.geometry.verts.length; i++) if (i % 3 !== 1) {
      const axis = i % 3 === 0 ? "x" : "z";
      const original = native.geometry.verts[i] * native.scale[axis] / donor.traits.height;
      const fitted = borrowed.geometry.verts[i] * borrowed.scale[axis] * node.scale[axis] / cave.traits.height;
      assert.ok(Math.abs(fitted - original) < 1e-9, name + " retains the authored hat proportions");
    }
  }
});

test("Bill's hat-riding pet follows no hat, immutable replacements and size changes without stale brim paths", () => {
  const f = fixture({ pets: true }), render = f.BL.characterEquipment, S = f.BL.scene, M = f.BL.math.mat4;
  const rootNode = S.createNode(), pets = f.BL.crew.createPets({ groundAt: () => 0, walkable: () => true }, rootNode);
  const attach = (cave) => {
    S.addChild(rootNode, cave.root); cave.baseY = 0; cave.jet = { power: 0, thrust: false }; cave.jetFuel = 1;
    pets.attach(cave); pets.update(cave, 0); return cave.pet.ride;
  };
  const cave = f.cave("Bitcoin-Bill"), ride = attach(cave), dog = cave.parts.dog, quaternion = ride.q;
  const originalHead = cave.headOpen, originalSeat = ride.seat, inverse = M.create(), point = [];
  const path = () => {
    const points = [];
    S.updateWorld(cave.root); M.invert(inverse, cave.parts.head.world);
    for (let i = 0; i < f.BL.crew.HAT_RIDE.ring; i++) {
      ride.angle = i / f.BL.crew.HAT_RIDE.ring * Math.PI * 2; ride.step = 0; pets.update(cave, 0);
      M.transformPoint(point, inverse, dog.position.x, dog.position.y, dog.position.z);
      assert.ok(point.every(Number.isFinite)); points.push([...point]);
      assert.equal(dog.quaternion, quaternion); assert.equal(cave.pet.mode, 4); assert.equal(dog.parent, rootNode);
    }
    return points;
  };
  const change = (selection, size = 100) => {
    const phase = [ride.angle, ride.dir, ride.run, ride.step, ride.t, ride.kind];
    assert.equal(render.apply(cave, selection, size), true);
    assert.equal(cave.pet.ride, ride); assert.equal(ride.q, quaternion);
    assert.deepEqual([ride.angle, ride.dir, ride.run, ride.step, ride.t, ride.kind], phase, "an appearance change preserves the pet's motion state");
    return path();
  };
  const originalPath = path(), barePath = change({ item: "none", version: null }), bareSeat = ride.seat;
  assert.equal(cave.headOpen, originalHead, "Bill's hidden native hat leaves the underlying head mesh unchanged");
  assert.notEqual(bareSeat, originalSeat); assert.notDeepEqual(barePath, originalPath);
  assert.ok(bareSeat.y.every((height) => height <= S.boundsOf(cave.headOpen).max[1] + 1e-6), "the bare-head path cannot float above the actual hair");
  assert.ok(Math.max(...bareSeat.y) < Math.min(...originalSeat.y), "the pet leaves the removed hat's higher surface");
  assert.ok(cave.parts.nativeHat.every((node) => !node.visible));
  const row = catalog.items.find((item) => item.id === "bitcoin-bill-straw"), selected = { item: row.id, version: row.current };
  const fittedPath = change(selected), fittedSeat = ride.seat;
  assert.notEqual(fittedSeat, bareSeat); assert.notDeepEqual(fittedPath, barePath);
  const smallPath = change(selected, 80), smallSeat = ride.seat, largePath = change(selected, 120), largeSeat = ride.seat;
  assert.notDeepEqual(largePath, smallPath); assert.ok(Math.min(...largeSeat.y) > Math.min(...smallSeat.y), "the pet follows the enlarged hat's higher support");
  assert.deepEqual(change(selected, 100), fittedPath); assert.equal(ride.seat, fittedSeat, "returning to a size reuses its measured seat");
  const other = f.cave("Bitcoin-Bill");
  assert.equal(render.apply(other, selected, 80), true);
  assert.equal(attach(other).seat, smallSeat, "a pet attached after equipment receives the same cached size-specific seat");
  assert.equal(ride.seat, fittedSeat, "another body cannot replace this pet's seat");
  const blinking = f.cave("Bitcoin-Bill");
  blinking.parts.head.geometry = blinking.headClosed;
  assert.equal(render.apply(blinking, selected, 113), true);
  const closedDescriptor = Object.getOwnPropertyDescriptor(blinking.headClosed, "verts");
  let closedReads = 0;
  Object.defineProperty(blinking.headClosed, "verts", { configurable: true, get() { closedReads++; return closedDescriptor.value; } });
  try { attach(blinking); } finally { Object.defineProperty(blinking.headClosed, "verts", closedDescriptor); }
  assert.equal(closedReads, 0, "a first measurement while blinking uses the canonical open head for its shared cache key");
  const replacement = archive(row);
  for (const node of replacement.nodes) node.position[1] += 0.15;
  const version = hatHash(f.BL.equipmentHats.encode(replacement));
  f.run(`BL.characterEquipment.seed(${JSON.stringify({ [version]: replacement })})`);
  assert.notDeepEqual(change({ item: row.id, version }), fittedPath, "a new immutable geometry version remeasures the visible support");
  assert.deepEqual(change(selected), fittedPath); assert.equal(ride.seat, fittedSeat);
  const helmet = catalog.items.find((item) => item.id === "johnstackton21m-helmet");
  assert.notDeepEqual(change({ item: helmet.id, version: helmet.current }), fittedPath, "changing the item replaces the pet's brim path");
  assert.deepEqual(change(null), originalPath); assert.equal(ride.seat, originalSeat);
  assert.ok(cave.parts.nativeHat.every((node) => node.visible)); assert.equal(cave.headOpen, originalHead);
  assert.deepEqual(change({ item: "none", version: null }), barePath); assert.equal(ride.seat, bareSeat);
  change(selected);
  const geometry = cave.equipmentHatNode.children[0].geometry, vertices = geometry.verts, createMatrix = M.create;
  let reads = 0, allocations = 0;
  Object.defineProperty(geometry, "verts", { configurable: true, get() { reads++; return vertices; } });
  M.create = () => { allocations++; return createMatrix(); };
  try {
    for (let frame = 0; frame < 120; frame++) { render.apply(cave, selected, 100); pets.update(cave, 1 / 60); }
  } finally { Object.defineProperty(geometry, "verts", { configurable: true, writable: true, value: vertices }); M.create = createMatrix; }
  assert.equal(reads, 0, "steady frames never rescan hat geometry"); assert.equal(allocations, 0, "steady posing allocates no matrices");
  assert.equal(ride.seat, fittedSeat); assert.equal(ride.q, quaternion);
});

test("new versions load in old tabs with digest, schema and item verification; older worn geometry stays available", async () => {
  const row = catalog.items[0], value = archive(row); value.nodes[0].geometry.faces[0].color = [240, 20, 30];
  const f = fixture({ fetch: async () => { calls++; return new Response(text, { headers: { "content-type": "application/json" } }); } });
  const text = f.BL.equipmentHats.encode(value), version = hatHash(text); let calls = 0;
  assert.equal(f.BL.equipmentHats.loaded(row.id, version), false);
  await Promise.all([f.BL.equipmentHats.load(row.id, version), f.BL.equipmentHats.load(row.id, version)]);
  assert.equal(calls, 1); assert.equal(f.BL.equipmentHats.loaded(row.id, version), true);
  const a = f.cave("Normal");
  assert.equal(f.BL.characterEquipment.apply(a, { item: row.id, version: row.current }), true);
  const oldGeometry = a.equipmentHatNode.children[0].geometry;
  assert.equal(f.BL.characterEquipment.apply(a, { item: row.id, version }), true);
  assert.notEqual(a.equipmentHatNode.children[0].geometry, oldGeometry);
  assert.equal(f.BL.characterEquipment.apply(a, { item: row.id, version: row.current }), true);
  assert.equal(a.equipmentHatNode.children[0].geometry, oldGeometry);
  await f.BL.equipmentHats.load(row.id, row.current); assert.equal(calls, 1);
});

test("malformed, oversized, substituted and noncanonical network archives cannot become equipment", async () => {
  const row = catalog.items[0], other = catalog.items[1];
  for (const mutate of [
    (v) => { v.item = other.id; }, (v) => { v.nodes[0].geometry.faces[0].i[0] = 1e9; },
    (v) => { v.nodes[0].geometry.faces[0].color[0] = -1; }, (v) => { v.nodes[0].scale[1] = -1; },
    (v) => { v.nodes[0].geometry.script = "alert(1)"; }, (v) => { v.nodes[0].geometry.verts[0] = null; },
    (v) => { v.nodes = Array(13).fill(v.nodes[0]); }
  ]) {
    const value = archive(row); mutate(value);
    const f = fixture({ seed: false, fetch: async () => new Response(text, { headers: { "content-type": "application/json" } }) });
    const text = f.BL.equipmentHats.encode(value), version = hatHash(text);
    await assert.rejects(f.BL.equipmentHats.load(row.id, version)); assert.equal(f.BL.equipmentHats.loaded(row.id, version), false);
  }
  for (const kind of ["digest", "noncanonical", "size", "redirect"]) {
    const value = archive(row), good = JSON.stringify(value) + "\n";
    const text = kind === "noncanonical" ? " " + good : good, version = kind === "digest" ? "a".repeat(64) : hatHash(text);
    const f = fixture({ seed: false, fetch: async () => new Response(text, { status: kind === "redirect" ? 302 : 200,
      headers: { "content-type": "application/json", ...(kind === "size" ? { "content-length": "1048576" } : {}) } }) });
    await assert.rejects(f.BL.equipmentHats.load(row.id, version)); assert.equal(f.BL.equipmentHats.loaded(row.id, version), false);
  }
});

test("normal archive builds allow one-file character edits; explicit authoring retains verified immutable history", () => {
  const folder = mkdtempSync(join(tmpdir(), "ooga-hat-archives-"));
  try {
    mkdirSync(join(folder, "src/js"), { recursive: true }); mkdirSync(join(folder, "worker/src"), { recursive: true });
    for (const name of ["math", "scene", "models", "characters", "equipment-hats"]) cpSync(join(root, "src/js", name + ".js"), join(folder, "src/js", name + ".js"));
    // Isolate provenance and version history from live contributor edits and later catalog publications.
    mkdirSync(join(folder, "src/characters"), { recursive: true });
    for (const [, , handle] of HAT_SOURCES) writeFileSync(join(folder, "src/characters", handle + ".js"), reviewedHeads.sources[handle]);
    authorEquipmentHats(folder);
    const indexFile = join(folder, "src/equipment/hats/catalog.json"), index = readFileSync(indexFile, "utf8"), baseline = JSON.parse(index);
    const first = baseline.items[0], oldFile = join(folder, "src/equipment/hats", first.current + ".json"), bytes = readFileSync(oldFile, "utf8");
    const sourceFile = join(folder, "src/characters/Bitcoin-Bill.js"), source = readFileSync(sourceFile, "utf8");
    const outputs = ["src/js/equipment-hats.gen.js", "src/js/equipment-hat-data.gen.js", "worker/src/equipment-hat-data.gen.json"];
    writeEquipmentHats(folder);
    const generated = outputs.map(file => readFileSync(join(folder, file), "utf8"));
    const unchanged = () => {
      assert.equal(readFileSync(indexFile, "utf8"), index);
      assert.deepEqual(outputs.map(file => readFileSync(join(folder, file), "utf8")), generated);
    };
    // A contributor changes only their own file; ordinary build inputs remain the reviewed archives.
    const unrelated = source.replace(/lastCommit: (\d+)/, (_, at) => "lastCommit: " + (Number(at) + 1));
    assert.notEqual(unrelated, source); writeFileSync(sourceFile, unrelated);
    writeEquipmentHats(folder); unchanged();
    const provenance = checkEquipmentHatSources(folder);
    assert.deepEqual(provenance.sourceChanged, [first.id]); assert.deepEqual(provenance.geometryChanged, []); unchanged();
    // The ordinary archive builder neither evaluates nor parses the character source.
    writeFileSync(sourceFile, unrelated + "\nthrow new Error('source execution probe');\n");
    writeEquipmentHats(folder); unchanged();
    assert.throws(() => checkEquipmentHatSources(folder), /source execution probe/); unchanged();
    const hatEdit = unrelated.replace('"#d8c08a"', '"#d9c08a"');
    assert.notEqual(hatEdit, unrelated); writeFileSync(sourceFile, hatEdit);
    writeEquipmentHats(folder); unchanged();
    const drift = checkEquipmentHatSources(folder);
    assert.deepEqual(drift.sourceChanged, [first.id]);
    assert.deepEqual(drift.geometryChanged, [{ id: first.id, current: first.current, extracted: extractHat(folder, first.id).version }]);
    assert.notEqual(drift.geometryChanged[0].extracted, first.current); unchanged();
    const made = authorEquipmentHats(folder); assert.equal(made.versions, baseline.items.reduce((n, r) => n + r.versions.length, 0) + 1);
    assert.equal(readFileSync(oldFile, "utf8"), bytes);
    const next = JSON.parse(readFileSync(indexFile, "utf8"));
    assert.notEqual(next.items[0].current, first.current); assert.ok(next.items[0].versions.includes(first.current));
    const changed = extractHat(folder, first.id); assert.equal(changed.version, next.items[0].current);
    assert.deepEqual(checkEquipmentHatSources(folder), { items: baseline.items.length, sourceChanged: [], geometryChanged: [] });
    writeFileSync(oldFile, bytes + " "); assert.throws(() => writeEquipmentHats(folder), /hash\/size/); writeFileSync(oldFile, bytes);
    next.items[0].versions = [next.items[0].current]; writeFileSync(indexFile, JSON.stringify(next));
    assert.throws(() => writeEquipmentHats(folder), /removed from its catalog/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
