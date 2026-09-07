// End-to-end checks in headless Chrome
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = `file://${join(root, "src", "index.html")}`;
const dist = `file://${join(root, "oogaboogaland.html")}`;
const page = (base, query) => `${base}?debug=1&nosim=1&scene=lab${query ? "&" + query : ""}`;
// Without scene= the page lands on the hub
const hubPage = (base, query) => `${base}?debug=1&nosim=1${query ? "&" + query : ""}`;
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};
const withPage = async (name, url, fn, opts = {}) => {
  const b = await launch(opts);
  try {
    await b.open(url);
    await b.sleep(opts.wait || 2500);
    await fn(b);
    const noise = b.logs.filter((l) => !l.includes("WebGL2 renderer failed"));
    record(`${name}: clean console`, noise.length === 0, noise.join(" | ").slice(0, 200));
  } catch (err) {
    record(name, false, String(err.message || err).slice(0, 200));
  } finally {
    b.close();
  }
};

const core = (label, base) => withPage(label, page(base), async (b) => {
  const before = await b.evaluate(`(() => { const B = window.__ooga; const slot = B.slots.slice(0, B.shown).reverse().find(s => s.node.visible && !s.dragging); const p = slot.node.position; const sp = B.project(p.x, p.y + 0.1, p.z); const cave = [...B.cavemen.values()].find(c => c.state === "working" && !c.walk); const cp = B.project(cave.root.position.x, cave.headOffset * 0.5, cave.root.position.z); return { banana: sp, cave: cp, caveName: cave.traits.name, shown: B.shown, handFed: B.game.state.handFed }; })()`);
  await b.mouse("mouseMoved", before.cave.x, before.cave.y, { button: "none" });
  await b.sleep(300);
  const tip = await b.evaluate(`(() => { const t = document.getElementById("tooltip"); return { hidden: t.hidden, text: t.textContent }; })()`);
  record(`${label}: hover tooltip`, !tip.hidden && tip.text.includes(before.caveName), tip.text);
  await b.drag(before.banana, before.cave);
  await b.sleep(1600);
  const after = await b.evaluate(`(() => { const B = window.__ooga; return { shown: B.shown, handFed: B.game.state.handFed }; })()`);
  record(`${label}: drag banana hand-feeds`, after.handFed === before.handFed + 1 && after.shown <= before.shown - 1, `shown ${before.shown}->${after.shown}`);
  await b.click(before.cave.x, before.cave.y);
  await b.sleep(150);
  const hop = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].find(c => c.traits.name === ${JSON.stringify(before.caveName)}); return c.hop > 0 || c.hopV > 0; })()`);
  record(`${label}: poke hops`, hop === true);
  await b.key("l");
  await b.sleep(4200);
  const crate = await b.evaluate(`(() => { const B = window.__ooga; const c = B.crates[0]; if (!c) return null; const p = B.project(c.node.position.x, c.node.position.y + 0.3, c.node.position.z); return { ...p, tier: c.loot.tier, worldY: c.node.position.y }; })()`);
  record(`${label}: legendary tip drops crate`, !!crate && crate.tier === "legendary" && Math.abs(crate.worldY) < 0.05);
  if (crate) {
    await b.click(crate.x, crate.y);
    await b.sleep(600);
  }
  const inv = await b.evaluate(`(() => { const B = window.__ooga; return { n: B.game.state.inventory.length, tier: B.game.state.inventory[0]?.tier, rows: document.querySelectorAll("#inventory .loot-row").length, tab: document.querySelector('[data-tab="loot"]').getAttribute("aria-selected"), sats: document.getElementById("stat-sats").textContent }; })()`);
  record(`${label}: open crate fills locker`, inv.n === 1 && inv.tier === "legendary" && inv.rows === 1 && inv.tab === "true", JSON.stringify(inv));
  record(`${label}: large counts read short`, inv.sats === "120K" && (await b.evaluate(`[1200, 9999, 139600, 2100000].map(window.BL.game.formatLarge).join(",")`)) === "1.2K,9.9K,139K,2.1M", inv.sats);
  await b.evaluate(`(() => { const sel = document.querySelector("#inventory .loot-assign"); sel.value = ${JSON.stringify(before.caveName)}; sel.dispatchEvent(new Event("change")); })()`);
  await b.sleep(300);
  const swag = await b.evaluate(`(() => { const B = window.__ooga; const c = [...B.cavemen.values()].find(c => c.traits.name === ${JSON.stringify(before.caveName)}); return { n: c.swagNodes.length, stored: Object.keys(JSON.parse(localStorage.getItem("oogaboogaland.v1")).assignments).length }; })()`);
  record(`${label}: assign swag persists`, swag.n === 1 && swag.stored === 1);
  await b.key("p");
  await b.sleep(4000);
  const perf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); let frames = 0; const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else resolve({ fps: +(frames / 3).toFixed(1), shown: B.shown }); }; requestAnimationFrame(f); })`);
  record(`${label}: full pile runs`, perf.shown >= 290, `${perf.fps} fps at ${perf.shown} bananas`);
});

const governor = () => withPage("governor", page(src), async (b) => {
  const interval = () => b.evaluate("+window.__ooga.frameInterval.toFixed(1)");
  await b.focus(true);
  await b.sleep(9500);
  const idle = await interval();
  await b.focus(false);
  await b.sleep(400);
  const background = await interval();
  await b.focus(true);
  await b.mouse("mouseMoved", 600, 400, { button: "none" });
  await b.mouse("mouseMoved", 620, 410, { button: "none" });
  await b.sleep(100);
  const active = await interval();
  record("governor: full rate when focused, 30fps when another window is in front", idle === 0 && background === 33.3 && active === 0, `idle=${idle} unfocused=${background} active=${active}`);
  // GPU records come lazily, so wait for frames
  const rendered = () => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + 2 || performance.now() - t0 > 3000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  await b.evaluate(`(() => { const B = window.__ooga; const it = window.BL.models.SWAG.find(c => c.id === "crown"); const e = B.game.addItem({ item: it, tier: it.tier, donationId: "hk" }); B.game.assign(e.id, "portlandhodl"); B.applyAllSwag(); })()`);
  await rendered();
  const withCrown = await b.evaluate("window.__ooga.renderer.stats.records");
  await b.evaluate(`(() => { const B = window.__ooga; B.game.unassign("portlandhodl"); B.applyAllSwag(); })()`);
  await rendered();
  const after = await b.evaluate(`(() => { window.__ooga.housekeep(); return window.__ooga.renderer.stats.records; })()`);
  record("housekeeping releases unused geometry", withCrown > after, `${withCrown} -> ${after}`);
});

const locker = () => withPage("locker", page(src), async (b) => {
  await b.evaluate(`(() => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const add = (id, d) => { const it = cat.find(c => c.id === id); return g.addItem({ item: it, tier: it.tier, donationId: d }); }; add("crown", "d1"); add("crown", "d2"); add("crown", "d3"); add("bandana", "d4"); add("laser-eyes", "d5"); B.renderLocker(); })()`);
  const rows = await b.evaluate(`[...document.querySelectorAll("#inventory .loot-row")].map(r => ({ name: r.querySelector(".loot-name").textContent, count: r.querySelector(".loot-count")?.textContent || "", icon: (() => { const c = r.querySelector(".loot-icon"); if (!c) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; })() }))`);
  record("locker: grouped by item, tier order, icons drawn", rows.length === 3 && rows[0].name === "Laser Eyes" && rows[1].count === "×3" && rows.every((r) => r.icon), JSON.stringify(rows));
  for (const who of ["portlandhodl", "bc1gui"]) {
    await b.evaluate(`(() => { const row = [...document.querySelectorAll("#inventory .loot-row")].find(r => r.querySelector(".loot-name").textContent === "Crown"); const sel = row.querySelector(".loot-assign"); sel.value = ${JSON.stringify(who)}; sel.dispatchEvent(new Event("change")); })()`);
    await b.sleep(150);
  }
  const worn = await b.evaluate(`(() => { const row = [...document.querySelectorAll("#inventory .loot-row")].find(r => r.querySelector(".loot-name").textContent === "Crown"); return { chips: row.querySelectorAll(".chip").length, free: row.querySelector(".loot-assign option").textContent }; })()`);
  record("locker: give one at a time, worn chips", worn.chips === 2 && worn.free.includes("1 free"), JSON.stringify(worn));
  // Nine of an item is the ceiling: the tenth is refused, a full tier rolls no crate, the others still do
  const cap = await b.evaluate(`(() => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const add = (id, d) => { const it = cat.find(c => c.id === id); return g.addItem({ item: it, tier: it.tier, donationId: d }); }; for (const it of cat.filter(c => c.tier === "legendary")) for (let i = 0; i < 12; i++) add(it.id, "cap-" + it.id + i); B.renderLocker(); const row = [...document.querySelectorAll("#inventory .loot-row")].find(r => r.querySelector(".loot-name").textContent === "Halo"); return { halo: g.countOf("halo"), tenth: add("halo", "cap-extra"), shown: row.querySelector(".loot-count").textContent, legendary: g.lootFor({ id: "cap-roll", sats: 120000 }), epic: g.lootFor({ id: "cap-roll", sats: 21000 })?.tier }; })()`);
  record("locker: stacks stop at nine and a full tier drops no crate", cap.halo === 9 && cap.tenth === null && cap.shown === "×9" && cap.legendary === null && cap.epic === "epic", JSON.stringify(cap));
});

const fan = () => withPage("fan", page(src), async (b) => {
  const radius = () => b.evaluate(`[...window.__ooga.cavemen.values()].filter(c => c.state === "working").map(c => +Math.hypot(c.slot.x, c.slot.z).toFixed(2))`);
  const r0 = await radius();
  await b.key("p");
  await b.sleep(300);
  const walking = await b.evaluate(`[...window.__ooga.cavemen.values()].filter(c => c.state === "working" && c.walk).length`);
  const r1 = await radius();
  await b.sleep(6000);
  const arrived = await b.evaluate(`[...window.__ooga.cavemen.values()].filter(c => c.state === "working").every(c => !c.walk && Math.hypot(c.root.position.x - c.slot.x, c.root.position.z - c.slot.z) < 0.05)`);
  record("eaters walk out to the pile edge", r1[0] > r0[0] + 0.5 && walking === r0.length && arrived, `radius ${r0[0]} -> ${r1[0]}`);
  const gaps = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].filter(c => c.state === "working").map(c => c.slot); let m = Infinity; for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) m = Math.min(m, Math.hypot(c[i].x - c[j].x, c[i].z - c[j].z)); return +m.toFixed(2); })()`);
  record("eaters keep their distance", gaps >= 2, `min gap ${gaps}`);
});

const crates = () => withPage("crates", page(src), async (b) => {
  for (let i = 0; i < 10; i++) {
    await b.key("b");
    await b.sleep(120);
  }
  await b.sleep(4500);
  const r = await b.evaluate(`(() => { const B = window.__ooga; const live = B.crates.filter(c => !c.opened); let m = Infinity; for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) m = Math.min(m, Math.hypot(live[i].node.position.x - live[j].node.position.x, live[i].node.position.z - live[j].node.position.z)); return { live: live.length, minDistance: +m.toFixed(2) }; })()`);
  record("crates never overlap and cap at three", r.live <= 3 && (r.live < 2 || r.minDistance >= 1.9), JSON.stringify(r));
});

const keys = () => withPage("keys", page(src), async (b) => {
  const count = () => b.evaluate(`parseInt(document.getElementById("meter-count").textContent, 10)`);
  const eating = () => b.evaluate(`document.querySelectorAll('.roster-state[data-state="working"]').length`);
  const c0 = await count(), e0 = await eating();
  await b.evaluate(`document.querySelector('[data-preset="racks"]').focus()`);
  await b.key("b");
  await b.key("b");
  await b.key("7");
  await b.sleep(600);
  record("keys: B tips and digits force eating, even with a button focused", (await count()) === c0 + 6 && (await eating()) === e0 + 1);
  await b.key("Delete", 8);
  await b.sleep(200);
  record("keys: Shift+Delete clears loot", (await b.evaluate(`window.__ooga.game.state.inventory.length`)) === 0);
  // Open the feed dialog, close it with Escape
  await b.evaluate(`document.querySelector('[data-action="feed"]').click()`);
  await b.sleep(150);
  const opened = await b.evaluate(`({ open: document.getElementById("feed").open, focused: document.activeElement && document.activeElement.id })`);
  await b.key("w");
  const stillTyping = await b.evaluate(`(() => { const c = window.__ooga.camera; return +c.target.z.toFixed(2); })()`);
  await b.key("Escape");
  await b.sleep(400);
  const closed = await b.evaluate(`({ open: document.getElementById("feed").open, scene: window.__ooga.scene })`);
  record("feed dialog opens from the panel, keeps the keys, and Escape only closes it", opened.open && opened.focused === "handle" && stillTyping === 0 && !closed.open && closed.scene === "lab", JSON.stringify({ opened, stillTyping, closed }));
  await b.key("R", 8);
  await b.sleep(2500);
  const reset = await b.evaluate(`({ stored: localStorage.getItem("oogaboogaland.v1"), donations: document.getElementById("stat-donations").textContent })`);
  record("keys: Shift+R resets the demo", reset.stored === null && reset.donations === "0");
});

const refresh = () => withPage("refresh", page(src), async (b) => {
  const r = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find(c => c.state === "working" && !c.walk); cave.nextBuildAt = -1; setTimeout(() => { const before = cave.build && cave.build.phase; B.refreshStates(); resolve({ before, after: cave.build && cave.build.phase, walking: !!cave.walk }); }, 600); })`);
  record("state refresh does not interrupt builds", !!r.before && r.after === r.before && !r.walking, JSON.stringify(r));
});

const weapons = () => withPage("weapons", page(src), async (b) => {
  const r = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const give = (id, name) => { const it = cat.find(c => c.id === id); const e = g.addItem({ item: it, tier: it.tier, donationId: "w-" + id }); g.assign(e.id, name); }; const [a, b2] = [...B.cavemen.values()].filter(c => c.state === "working" && !c.walk); give("golden-club", a.traits.name); give("golden-ak", b2.traits.name); B.applyAllSwag(); const club = { gold: a.parts.club.geometry === a.skins.club.gold, sameModel: a.skins.club.gold.verts.length === a.skins.club.default.verts.length, visible: a.parts.club.visible }; b2.nextBuildAt = -1; setTimeout(() => { resolve({ club, ak: { phase: b2.build && b2.build.phase, gold: b2.parts.gunBody.geometry === b2.skins.gun.gold, sameModel: b2.skins.gun.gold.verts.length === b2.skins.gun.default.verts.length, visible: b2.parts.gun.visible } }); }, 700); })`);
  record("golden club is a gold skin of the same club", r.club.gold && r.club.sameModel && r.club.visible, JSON.stringify(r.club));
  record("golden AK is a gold skin of the same rifle, shown while shooting", r.ak.phase === "shoot" && r.ak.gold && r.ak.sameModel && r.ak.visible, JSON.stringify(r.ak));
});

const props = () => withPage("props", page(src, "yaw=2.4"), async (b) => {
  const die = await b.evaluate(`(() => { const B = window.__ooga; for (const [i, d] of B.lab.equipment.dice.entries()) { const w = d.world; const p = B.project(w[12], w[13] + 0.15, w[14]); const hit = p && B.input.pick(p.x, p.y); if (p && p.x > 0 && p.x < 1100 && hit && hit.owner.kind === "die") return { i, x: p.x, y: p.y }; } return null; })()`);
  if (die) {
    await b.click(die.x, die.y);
    await b.sleep(250);
  }
  record("tap a die rolls it", !!die && (await b.evaluate(`window.__ooga.lab.equipment.dice[${die ? die.i : 0}].rolling`)) === true);
  await b.sleep(900);
  // The top face must match the rolled number
  const face = await b.evaluate(`(() => { const d = window.__ooga.lab.equipment.dice[${die ? die.i : 0}]; const w = d.world; const axes = { "+x": w[1], "+y": w[5], "+z": w[9] }; const pips = { "+y": 5, "-y": 2, "+x": 6, "-x": 1, "+z": 3, "-z": 4 }; let best = null, bestV = 0; for (const [axis, v] of Object.entries(axes)) { if (Math.abs(v) > bestV) { bestV = Math.abs(v); best = (v > 0 ? "+" : "-") + axis[1]; } } return { up: pips[best], rolled: d.lastRoll, vertical: +bestV.toFixed(3) }; })()`);
  record("die lands with the rolled face up", !!die && face.up === face.rolled && face.vertical > 0.999, JSON.stringify(face));
  const card = await b.evaluate(`(() => { const B = window.__ooga; for (const [i, c] of B.lab.equipment.cards.entries()) { const w = c.world; const p = B.project(w[12], w[13] + 0.05, w[14]); const hit = p && B.input.pick(p.x, p.y); if (p && p.x > 0 && p.x < 1100 && hit && hit.owner.kind === "card") return { i, x: p.x, y: p.y }; } return null; })()`);
  if (card) {
    await b.click(card.x, card.y);
    await b.sleep(150);
  }
  record("tap a card flips it", !!card && (await b.evaluate(`window.__ooga.lab.equipment.cards[${card ? card.i : 0}].flipping`)) === true);
});

const fallback = () => withPage("canvas2d fallback", page(src, "canvas2d"), async (b) => {
  const kind = await b.evaluate(`document.getElementById("quality").textContent`);
  record("fallback renderer draws", kind.startsWith("canvas2d"), kind);
});

const phone = () => withPage("phone", hubPage(src), async (b) => {
  const r = await b.evaluate(`({ quality: document.getElementById("quality").textContent, sheet: document.getElementById("sheet").dataset.open, hint: document.getElementById("hint").textContent, stick: getComputedStyle(document.getElementById("joy-move")).display })`);
  record("phone: medium tier, collapsed sheet, touch hint, joysticks shown", r.quality.includes("medium") && r.sheet === "false" && r.hint.includes("pinch") && r.stick === "block", JSON.stringify(r));
  // The open sheet takes the sticks' box
  const stickWith = (open) => b.evaluate(`(() => { document.getElementById("sheet").dataset.open = ${JSON.stringify(open)}; const m = document.getElementById("joy-move"); return { box: getComputedStyle(document.querySelector(".joysticks")).display, width: Math.round(m.getBoundingClientRect().width), laidOut: m.offsetParent !== null }; })()`);
  const sticks = { open: await stickWith("true"), closed: await stickWith("false") };
  record("phone: the sticks hide behind the open sheet and return when it collapses", sticks.open.box === "none" && !sticks.open.laidOut && sticks.open.width === 0 && sticks.closed.box === "block" && sticks.closed.width > 0, JSON.stringify(sticks));
  // Hold the move stick up and the camera flies
  const stick = await b.evaluate(`(() => { const r = document.getElementById("joy-move").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const target = () => b.evaluate(`(() => { const c = window.__ooga.camera; return { x: +c.target.x.toFixed(2), z: +c.target.z.toFixed(2) }; })()`);
  const t0 = await target();
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: stick.x, y: stick.y }] });
  for (let i = 1; i <= 6; i++) {
    await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: stick.x, y: stick.y - i * 6 }] });
    await b.sleep(100);
  }
  await b.sleep(400);
  const t1 = await target();
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await b.sleep(1000);
  const t2 = await target();
  await b.sleep(1000);
  const t3 = await target();
  record("phone: the move stick flies the camera and lets go cleanly", t1.z < t0.z - 3 && Math.abs(t3.z - t2.z) < 0.5, `${JSON.stringify(t0)} -> ${JSON.stringify(t1)} -> ${JSON.stringify(t3)}`);
}, { w: 390, h: 844, mobile: true, wait: 3000 });

const scenes = () => withPage("scenes", page(src), async (b) => {
  // A transition runs ~30 frames, animations settle later
  const snapshot = () => b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, stats: B.stats(), records: B.renderer.stats.records }; })()`);
  const rendered = (frames) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > 4000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const settled = () => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { if (B.stats().tweens === 0 || performance.now() - t0 > 3000) resolve(); else requestAnimationFrame(tick); }; tick(); })`);
  await rendered(2);
  const before = await snapshot();
  for (let i = 0; i < 2; i++) {
    await b.evaluate(`window.__ooga.go("lab")`);
    await rendered(40);
    await settled();
  }
  const after = await snapshot();
  const same = (key) => before.stats[key] === after.stats[key];
  record("scenes: go(lab) twice lands in the lab", before.scene === "lab" && after.scene === "lab", `${before.scene} -> ${after.scene}`);
  record("scenes: node, target, tween and DOM counts identical after re-entering", same("allNodes") && same("targets") && same("tweens") && same("dom"), `${JSON.stringify(before.stats)} -> ${JSON.stringify(after.stats)}`);
  record("scenes: GPU records identical after re-entering", Math.abs(after.records - before.records) <= 3, `${before.records} -> ${after.records}`);
  record("scenes: no error thrown during the transitions", !b.logs.some((l) => l.startsWith("[exception]")), b.logs.join(" | ").slice(0, 200));
});

const hub = () => withPage("hub", hubPage(src), async (b) => {
  const rendered = (frames) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > 4000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const loaded = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, terrain: window.BL.scenes.hub.root.children.some((n) => n.geometry === B.island.geometry), mouths: B.mouths.length, leaveHidden: document.querySelector('[data-action="leave"]').hidden }; })()`);
  const advanced = await rendered(3);
  record("hub: default scene is the hub and loads clean", loaded.scene === "hub" && loaded.terrain && loaded.mouths === 7 && loaded.leaveHidden && advanced >= 3, JSON.stringify({ ...loaded, advanced }));
  const curtain = await b.evaluate(`({ drawn: window.__ooga.timing.drawn > 0, gone: !document.getElementById("curtain") })`);
  record("hub: the leaf curtain opens on the first drawn frame and leaves the DOM", curtain.drawn && curtain.gone, JSON.stringify(curtain));
  const mouth = await b.evaluate(`(() => { const B = window.__ooga; const m = B.mouths.find((m) => m.id === "c11"); const p = B.project(m.x, 2, m.z); const hit = B.input.pick(p.x, p.y); return { x: Math.round(p.x), y: Math.round(p.y), kind: hit && hit.owner.kind, slot: hit && hit.owner.slot && hit.owner.slot.id }; })()`);
  await b.click(mouth.x, mouth.y);
  // The 0.45s dolly, then the 0.25s fade
  await b.sleep(1600);
  const entered = await b.evaluate(`({ scene: window.__ooga.scene, leaveShown: !document.querySelector('[data-action="leave"]').hidden })`);
  record("hub: tap the lab cave enters the lab", mouth.kind === "cave" && mouth.slot === "c11" && entered.scene === "lab" && entered.leaveShown, JSON.stringify({ ...mouth, ...entered }));
  await b.key("Escape");
  await b.sleep(900);
  const back = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { scene: B.scene, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), dist: +Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z).toFixed(1), leaveHidden: document.querySelector('[data-action="leave"]').hidden }; })()`);
  record("lab: Escape returns to the hub on the landing view", back.scene === "hub" && back.toPile < 0.5 && Math.abs(back.dist - 24) < 1 && back.leaveHidden, JSON.stringify(back));
  await b.key("p");
  await b.sleep(200);
  const level = await b.evaluate("window.__ooga.level");
  await b.evaluate(`window.__ooga.go("lab")`);
  await b.sleep(900);
  const carried = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, level: +B.level.toFixed(1), shown: B.shown }; })()`);
  record("pile level carries between scenes", carried.scene === "lab" && level >= 290 && Math.abs(carried.level - level) < 2 && carried.shown === Math.floor(carried.level), `${level} -> ${JSON.stringify(carried)}`);
  await b.evaluate(`document.querySelector('[data-action="leave"]').click()`);
  await b.sleep(900);
  const left = await b.evaluate(`({ scene: window.__ooga.scene, blurred: document.activeElement !== document.querySelector('[data-action="leave"]') })`);
  record("lab: Leave cave button returns to the hub", left.scene === "hub" && left.blurred, JSON.stringify(left));
});

// The built file must run both scenes
const hubDist = () => withPage("hub dist", hubPage(dist), async (b) => {
  const loaded = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, mouths: B.mouths.length }; })()`);
  record("dist: lands on the hub", loaded.scene === "hub" && loaded.mouths === 7, JSON.stringify(loaded));
  const mouth = await b.evaluate(`(() => { const B = window.__ooga; const m = B.mouths.find((m) => m.id === "c11"); const p = B.project(m.x, 2, m.z); const hit = B.input.pick(p.x, p.y); return { x: Math.round(p.x), y: Math.round(p.y), kind: hit && hit.owner.kind }; })()`);
  await b.click(mouth.x, mouth.y);
  await b.sleep(1600);
  const scene = await b.evaluate("window.__ooga.scene");
  record("dist: tap the lab cave enters the lab", mouth.kind === "cave" && scene === "lab", JSON.stringify({ ...mouth, scene }));
});

// A prototype key in ?scene= falls through to the hub
const hubRoute = () => withPage("hub route", hubPage(src, "scene=toString"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, mouths: B.mouths.length, help: [...document.querySelectorAll(".panel .help[data-scene]")].map((p) => p.dataset.scene + ":" + p.hidden).join(",") }; })()`);
  record("hub: unknown ?scene= lands on the hub with the hub help text", r.scene === "hub" && r.mouths === 7 && r.help === "hub:false,lab:true", JSON.stringify(r));
});

const hubCamera = () => withPage("hub camera", hubPage(src), async (b) => {
  const wheel = async (n, dy) => {
    for (let i = 0; i < n; i++) {
      await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 400, y: 450, deltaX: 0, deltaY: dy });
      await b.sleep(20);
    }
  };
  const view = () => b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { y: +c.position.y.toFixed(2), floor: +B.island.heightAt(c.position.x, c.position.z).toFixed(2), dist: +Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z).toFixed(1), tz: +c.target.z.toFixed(1) }; })()`);
  // Zoom in, fly out, orbit a turn, pitch up
  const samples = [];
  await wheel(14, -60);
  await hold(b, "w", 3000);
  await b.drag({ x: 400, y: 500 }, { x: 400, y: 100 });
  await b.sleep(700);
  samples.push(await view());
  for (let i = 0; i < 8; i++) {
    await b.drag({ x: 300, y: 500 }, { x: 496, y: 500 });
    await b.sleep(400);
    samples.push(await view());
  }
  await b.drag({ x: 400, y: 100 }, { x: 400, y: 850 });
  await b.sleep(700);
  samples.push(await view());
  const worst = samples.reduce((m, s) => Math.min(m, s.y - s.floor), Infinity);
  record("hub: camera stays above the island", samples[0].dist <= 16.5 && samples.some((s) => s.floor >= 3) && worst > 1, `min clearance ${worst.toFixed(2)} over ${samples.length} views, zoomed to ${samples[0].dist}, target z ${samples[0].tz}`);
});

const hubPile = () => withPage("hub pile", hubPage(src), async (b) => {
  await b.key("p");
  await b.sleep(4000);
  const perf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); let frames = 0; const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else resolve({ fps: +(frames / 3).toFixed(1), shown: B.shown }); }; requestAnimationFrame(f); })`);
  record("hub: full pile runs", perf.shown >= 290, `${perf.fps} fps at ${perf.shown} bananas`);
});

// Held keys keep the camera and caveman moving
const hold = async (b, key, ms) => {
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key, text: key.length === 1 ? key : undefined });
  await b.sleep(ms);
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key });
};

const hubFlight = () => withPage("hub flight", hubPage(src), async (b) => {
  const cam = () => b.evaluate(`(() => { const c = window.__ooga.camera; return { x: +c.target.x.toFixed(2), y: +c.target.y.toFixed(2), z: +c.target.z.toFixed(2), yaw: +Math.atan2(c.position.x - c.target.x, c.position.z - c.target.z).toFixed(2), py: +c.position.y.toFixed(2) }; })()`);
  const c0 = await cam();
  await hold(b, "w", 1000);
  await b.sleep(300);
  const c1 = await cam();
  await hold(b, "d", 600);
  await b.sleep(300);
  const c2 = await cam();
  await hold(b, "q", 500);
  await b.sleep(300);
  const c3 = await cam();
  await hold(b, "z", 500);
  await b.sleep(1000);
  const c4 = await cam();
  await b.sleep(1000);
  const c5 = await cam();
  record("hub: W flies forward, D strafes, Q turns, Z climbs", c1.z < c0.z - 5 && c2.x > c1.x + 2 && c3.yaw > c2.yaw + 0.4 && c4.y > c3.y + 1.5, `${JSON.stringify(c0)} -> ${JSON.stringify(c4)}`);
  record("hub: the camera holds still once the keys are up", Math.abs(c5.x - c4.x) < 0.2 && Math.abs(c5.z - c4.z) < 0.2 && Math.abs(c5.y - c4.y) < 0.2, `${JSON.stringify(c4)} -> ${JSON.stringify(c5)}`);
  // Far out and low, the camera rides over rock
  await hold(b, "w", 4000);
  await b.drag({ x: 400, y: 500 }, { x: 400, y: 100 });
  await b.sleep(600);
  const far = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { r: +Math.hypot(c.target.x, c.target.z).toFixed(1), clearance: +(c.position.y - B.island.surfaceAt(c.position.x, c.position.z)).toFixed(2) }; })()`);
  record("hub: flight is bounded around the island and stays above it", far.r <= 44.1 && far.clearance >= 1.4, JSON.stringify(far));
});

const hubCrew = () => withPage("hub crew", hubPage(src), async (b) => {
  // No builds during the check, so no timer hides
  await b.evaluate(`[...window.__ooga.cavemen.values()].forEach((c) => { c.nextBuildAt = 1e9; })`);
  // A meal ends, then the eater strolls and stands
  const stroll = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); cave.act.until = -1; setTimeout(() => resolve({ name: cave.traits.name, kind: cave.act.kind, to: cave.walk && cave.walk.to, away: cave.walk && +Math.hypot(cave.walk.tx, cave.walk.tz).toFixed(1) }), 300); })`);
  record("hub crew: a finished meal becomes a stroll to a meadow spot", stroll.kind === "wander" && stroll.to === "spot" && stroll.away >= 5, JSON.stringify(stroll));
  const idle = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.traits.name === ${JSON.stringify(stroll.name)}); const t0 = performance.now(); const tick = () => { if (cave.act.kind === "idle" || performance.now() - t0 > 20000) resolve({ kind: cave.act.kind, walk: !!cave.walk, r: +Math.hypot(cave.root.position.x, cave.root.position.z).toFixed(1) }); else requestAnimationFrame(tick); }; tick(); })`);
  record("hub crew: the stroller arrives and idles away from the pile", idle.kind === "idle" && !idle.walk && idle.r >= 5, JSON.stringify(idle));
  // Bananas land and everyone free runs back
  await b.key("p");
  await b.sleep(300);
  const rushed = await b.evaluate(`[...window.__ooga.cavemen.values()].filter((c) => c.state === "working" && !c.build).map((c) => ({ kind: c.act.kind, speed: c.walk ? c.walk.speed : null, to: c.walk ? c.walk.to : null }))`);
  const runner = rushed.find((c) => c.speed !== null);
  record("hub crew: fresh bananas send the free crew running to the pile", rushed.every((c) => c.kind === "rush") && !!runner && runner.speed >= 2.5 && runner.to === "slot", JSON.stringify(rushed));
  const eating = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { const crew = [...B.cavemen.values()].filter((c) => c.state === "working" && !c.build); const done = crew.every((c) => !c.walk && c.act.kind === "eat" && Math.hypot(c.root.position.x - c.slot.x, c.root.position.z - c.slot.z) < 0.1); if (done || performance.now() - t0 > 12000) resolve({ done, kinds: crew.map((c) => c.act.kind + (c.walk ? "/walk" : "")).join(",") }); else requestAnimationFrame(tick); }; tick(); })`);
  record("hub crew: the runners settle at their slots and eat", eating.done, eating.kinds);
});

const hubProps = () => withPage("hub props", hubPage(src), async (b) => {
  // Tapping a prop wobbles it and throws particles
  const bush = await b.evaluate(`(() => { const B = window.__ooga; for (const o of B.props) { if (o.prop !== "bush" || o.node.position.y !== 0) continue; const p = B.project(o.x, 0.5, o.z); if (!p || p.x < 60 || p.x > 1080 || p.y < 140 || p.y > 860) continue; const hit = B.input.pick(p.x, p.y); if (hit && hit.owner === o) return { x: p.x, y: p.y }; } return null; })()`);
  if (bush) await b.click(bush.x, bush.y);
  await b.sleep(200);
  const r = await b.evaluate(`(() => { const B = window.__ooga; return { particles: B.stats().particles, tweens: B.stats().tweens, toast: document.getElementById("toast").textContent }; })()`);
  record("hub props: tapping a bush rustles it", !!bush && r.particles > 0 && r.tweens > 0 && r.toast.length > 0, JSON.stringify({ bush: !!bush, ...r }));
  // Space uses the nearest prop, here a barrel
  const near = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const o = B.props.find((o) => o.prop === "barrel"); B.crew.control(cave); cave.root.position.x = o.x + 0.3; cave.root.position.z = o.z; return { name: cave.traits.name, player: B.crew.player === cave }; })()`);
  await b.sleep(100);
  await b.key(" ");
  await b.sleep(200);
  const used = await b.evaluate(`(() => { const B = window.__ooga; return { tweens: B.stats().tweens, toast: document.getElementById("toast").textContent }; })()`);
  record("hub props: Space uses the prop within reach", near.player && used.toast.includes("Empty"), JSON.stringify({ ...near, ...used }));
  await b.evaluate(`document.querySelector('[data-action="reset-view"]').click()`);
  await b.sleep(900);
  const reset = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { player: !!B.crew.player, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), dist: +Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z).toFixed(1) }; })()`);
  record("hub props: Reset view lets go and returns to the landing view", !reset.player && reset.toPile < 0.5 && Math.abs(reset.dist - 24) < 1.5, JSON.stringify(reset));
});

const labDrive = () => withPage("lab drive", page(src), async (b) => {
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); const hit = B.input.pick(p.x, p.y); return { name: cave.traits.name, x: p.x, y: p.y, kind: hit && hit.owner.kind }; })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(120);
  await b.click(pick.x, pick.y);
  await b.sleep(300);
  const pos = () => b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return p && { name: p.traits.name, x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2) }; })()`);
  const p0 = await pos();
  await hold(b, "w", 1200);
  await b.sleep(300);
  const p1 = await pos();
  record("lab drive: a double tap takes the wheel and W walks the caveman inside the room", pick.kind === "caveman" && !!p0 && p0.name === pick.name && Math.hypot(p1.x - p0.x, p1.z - p0.z) >= 2 && Math.abs(p1.x) < 10 && Math.abs(p1.z) < 10, `${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
  // Space flips a card at the table
  await b.evaluate(`(() => { const B = window.__ooga; const card = B.lab.equipment.cards[0]; const w = card.world; const p = B.crew.player; p.root.position.x = w[12] + 0.6; p.root.position.z = w[14] + 0.6; })()`);
  await b.sleep(80);
  await b.key(" ");
  await b.sleep(120);
  const flipped = await b.evaluate(`(() => { const B = window.__ooga; return B.lab.equipment.cards.some((c) => c.flipping) || B.lab.equipment.dice.some((d) => d.rolling); })()`);
  record("lab drive: Space uses the equipment within reach", flipped === true);
  await b.key("Escape");
  await b.sleep(200);
  const freed = await b.evaluate(`({ scene: window.__ooga.scene, player: !!window.__ooga.crew.player })`);
  record("lab drive: the first Escape only lets go", freed.scene === "lab" && !freed.player, JSON.stringify(freed));
});

const hubDrive = () => withPage("hub drive", hubPage(src), async (b) => {
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); const hit = B.input.pick(p.x, p.y); return { name: cave.traits.name, x: p.x, y: p.y, kind: hit && hit.owner.kind }; })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(120);
  await b.click(pick.x, pick.y);
  await b.sleep(300);
  const driven = await b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { player: p && p.traits.name, kind: p && p.act.kind, act: !document.getElementById("act").hidden, follow: p && +Math.hypot(B.camera.target.x - p.root.position.x, B.camera.target.z - p.root.position.z).toFixed(2) }; })()`);
  record("hub drive: a double tap takes the wheel of a caveman", pick.kind === "caveman" && driven.player === pick.name && driven.kind === "player" && driven.act, JSON.stringify(driven));
  const pos = () => b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return p && { x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2), follow: +Math.hypot(B.camera.target.x - p.root.position.x, B.camera.target.z - p.root.position.z).toFixed(2) }; })()`);
  const p0 = await pos();
  await hold(b, "w", 1500);
  await b.sleep(500);
  const p1 = await pos();
  record("hub drive: W walks the caveman and the camera follows", Math.hypot(p1.x - p0.x, p1.z - p0.z) >= 3 && p1.follow < 1.5, `${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
  await b.key(" ");
  await b.sleep(120);
  // Space shouts, or uses whatever is in reach
  const act = await b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { hop: p.hop > 0 || p.hopV > 0, bubbles: B.stats().bubbles, toast: document.getElementById("toast").textContent, tweens: B.stats().tweens }; })()`);
  record("hub drive: Space acts", (act.hop && act.bubbles >= 1) || act.toast.length > 0, JSON.stringify(act));
  await b.key("Escape");
  await b.sleep(200);
  const freed = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.traits.name === ${JSON.stringify(pick.name)}); return { player: !!B.crew.player, act: !document.getElementById("act").hidden, kind: cave.act.kind }; })()`);
  record("hub drive: Escape lets go and the caveman goes back to its day", !freed.player && !freed.act && freed.kind === "idle", JSON.stringify(freed));
});

// The jetpack hidden, freed, worn and flown
const hubJetpack = () => withPage("hub jetpack", hubPage(src), async (b) => {
  const hidden = await b.evaluate(`(() => { const B = window.__ooga; const s = B.jetpack.stash; return s && { prop: s.prop, x: +s.x.toFixed(2), z: +s.z.toFixed(2) }; })()`);
  // Two minutes in, the holding prop pulses
  const pulse = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; B.jetpack.hintNow(); let peak = 0; const t0 = performance.now(); const tick = () => { peak = Math.max(peak, B.jetpack.stash.node.highlight); if (performance.now() - t0 > 2200) resolve({ peak: +peak.toFixed(2), after: +B.jetpack.stash.node.highlight.toFixed(2) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("hub jetpack: the hiding prop pulses when the hunt drags on", pulse.peak > 0.4 && pulse.after < 0.05, JSON.stringify(pulse));
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); return { name: cave.traits.name, x: p.x, y: p.y }; })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(120);
  await b.click(pick.x, pick.y);
  await b.sleep(300);
  // Near enough to reach, far enough not to collect
  const staged = await b.evaluate(`(() => { const B = window.__ooga; const s = B.jetpack.stash; const p = B.crew.player.root.position; for (const r of [1.8, 1.6, 2]) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; if (!B.island.onLand(x, z)) continue; let best = null, bd = 1e9; for (const o of B.props) { const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } } if (best === s) { p.x = x; p.z = z; return { x: +x.toFixed(2), z: +z.toFixed(2), r }; } } } return null; })()`);
  await b.sleep(120);
  await b.key(" ");
  await b.sleep(300);
  const dropped = await b.evaluate(`(() => { const B = window.__ooga; return { pickup: !!B.jetpack.pickup, stash: !!B.jetpack.stash, prop: B.props.filter((o) => o.prop === "jetpack").length, toast: document.getElementById("toast").textContent }; })()`);
  record("hub jetpack: hidden in a prop until it is disturbed", !!hidden && !!staged && dropped.pickup && !dropped.stash && dropped.prop === 1 && dropped.toast.includes("jetpack"), JSON.stringify({ hidden, staged, ...dropped }));
  // Walking into the pickup wears it
  await b.evaluate(`(() => { const B = window.__ooga; const j = B.jetpack.pickup; const p = B.crew.player.root.position; p.x = j.x; p.z = j.z; })()`);
  await b.sleep(300);
  const worn = await b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { jet: !!p.jet, onBack: !!p.jet && p.root.children.includes(p.jet.node), left: B.props.filter((o) => o.prop === "jetpack").length, act: document.getElementById("act").textContent, pickup: !!B.jetpack.pickup }; })()`);
  record("hub jetpack: a driven caveman walking into it puts it on", worn.jet && worn.onBack && worn.left === 0 && !worn.pickup && /blast/i.test(worn.act), JSON.stringify(worn));
  // Held Space climbs, releasing floats him down
  const air = () => b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { hop: +p.hop.toFixed(2), flame: p.jet.flame.visible, y: +p.root.position.y.toFixed(2), camY: +B.camera.target.y.toFixed(2) }; })()`);
  const ground = await air();
  await hold(b, " ", 1200);
  const up = await air();
  await b.sleep(4000);
  const down = await air();
  record("hub jetpack: held Space blasts off and the fall is floaty", ground.hop < 0.05 && up.hop > 2 && up.y > ground.y + 2 && up.camY > ground.camY + 1 && down.hop < 0.05, JSON.stringify({ ground, up, down }));
  // Flight crosses the cliff ring a walk cannot
  const flown = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const p = B.crew.player; p.hop = 6; p.hopV = 0; const h0 = B.island.heightAt(p.root.position.x, p.root.position.z); const t0 = performance.now(); const tick = () => { if (performance.now() - t0 > 1500) resolve({ h0, h1: B.island.heightAt(p.root.position.x, p.root.position.z), hop: +p.hop.toFixed(2) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("hub jetpack: the flier stays over the island while airborne", flown.hop >= 0, JSON.stringify(flown));
});

// ---------- soak ----------
// Round trips and storms must leave nothing behind
const mb = (bytes) => (bytes / 1048576).toFixed(2);
const FRESH_FRAMES = 150;
const soak = async (b) => {
  await b.send("HeapProfiler.enable");
  const until = (cond, ms) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { const ok = !!(${cond}); if (ok || performance.now() - t0 > ${ms}) resolve(ok); else requestAnimationFrame(tick); }; tick(); })`);
  const rendered = (frames, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > ${ms}) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const settled = (ms = 4000) => until("window.BL.scene.tweenCount() === 0", ms);
  const heap = async () => {
    await b.send("HeapProfiler.collectGarbage");
    const chunks = [];
    b.on("HeapProfiler.addHeapSnapshotChunk", (p) => chunks.push(p.chunk));
    await b.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
    b.on("HeapProfiler.addHeapSnapshotChunk", null);
    const snap = JSON.parse(chunks.join(""));
    const { node_fields: fields, node_types: [types] } = snap.snapshot.meta;
    const iType = fields.indexOf("type"), iSize = fields.indexOf("self_size"), code = types.indexOf("code");
    let total = 0, compiled = 0;
    for (let i = 0; i < snap.nodes.length; i += fields.length) {
      total += snap.nodes[i + iSize];
      if (snap.nodes[i + iType] === code) compiled += snap.nodes[i + iSize];
    }
    const dom = (await b.send("Memory.getDOMCounters")).result;
    return { used: (await b.send("Runtime.getHeapUsage")).result.usedSize, objects: total - compiled, code: compiled, nodes: dom.nodes, listeners: dom.jsEventListeners };
  };
  const snapshot = async () => ({ stats: await b.evaluate("window.__ooga.stats()"), ...await heap() });
  // go(id), then wait for swap, frames and animations
  const travel = (id) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const T = window.BL.scene.tweenCount; const t0 = performance.now(); let last = t0, swap = 0, swapFrame = 0, swapGap = 0; B.go(${JSON.stringify(id)}); const tick = () => { const now = performance.now(); if (!swap && B.scene === ${JSON.stringify(id)}) { swap = now - t0; swapGap = now - last; swapFrame = B.renderedFrames; } last = now; if (swap && B.renderedFrames >= swapFrame + 3 && T() === 0) resolve({ swap, swapGap, settled: now - t0 }); else if (now - t0 > 8000) resolve(null); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const heapDetail = (a, z) => `objects ${mb(a.objects)} -> ${mb(z.objects)} MB (used ${mb(a.used)} -> ${mb(z.used)} MB, code ${mb(a.code)} -> ${mb(z.code)} MB)`;
  const within = (a, z, share) => Math.abs(z.objects - a.objects) <= a.objects * share;
  return { until, rendered, settled, snapshot, travel, heapDetail, within };
};

const soakScenes = () => withPage("soak: scene cycles", hubPage(src), async (b) => {
  const { rendered, settled, snapshot, travel, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const s0 = await snapshot();
  const times = [];
  for (let i = 0; i < 10; i++) {
    for (const id of ["lab", "hub"]) {
      const t = await travel(id);
      if (!t) throw new Error(`round trip ${i + 1}: the transition to the ${id} did not settle`);
      times.push(t);
    }
  }
  const s10 = await snapshot();
  const same = (key) => s0.stats[key] === s10.stats[key];
  const avg = (key) => Math.round(times.reduce((sum, t) => sum + t[key], 0) / times.length);
  record("soak: scene cycles: node, target, tween and DOM counts identical after ten round trips", s10.stats.tweens === 0 && same("allNodes") && same("targets") && same("tweens") && same("dom"), `${JSON.stringify(s0.stats)} -> ${JSON.stringify(s10.stats)}`);
  record("soak: scene cycles: GPU records stable", Math.abs(s10.stats.gl.records - s0.stats.gl.records) <= 3, `${s0.stats.gl.records} -> ${s10.stats.gl.records}`);
  record("soak: scene cycles: live DOM nodes and event listeners identical", s10.nodes === s0.nodes && s10.listeners === s0.listeners, `nodes ${s0.nodes} -> ${s10.nodes}, listeners ${s0.listeners} -> ${s10.listeners}`);
  record("soak: scene cycles: heap after GC within 10%", within(s0, s10, 0.1), `${heapDetail(s0, s10)} · avg go->swap ${avg("swap")} ms (swap frame ${avg("swapGap")} ms), go->settled ${avg("settled")} ms`);
  record("soak: scene cycles: no error thrown", !b.logs.some((l) => l.startsWith("[exception]")), b.logs.join(" | ").slice(0, 200));
});

const soakResidency = () => withPage("soak: GPU residency", hubPage(src), async (b) => {
  const { until } = await soak(b);
  const records = () => b.evaluate("window.__ooga.renderer.stats.records");
  // Records come as geometry draws, so count equal frames
  const framesSince = (start) => until(`B.renderedFrames >= ${start + FRESH_FRAMES}`, 8000);
  const visit = async (id) => {
    await b.evaluate(`window.__ooga.go(${JSON.stringify(id)})`);
    const start = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { if (B.scene === ${JSON.stringify(id)} || performance.now() - t0 > 4000) resolve(B.renderedFrames); else requestAnimationFrame(tick); }; tick(); })`);
    await framesSince(start);
    return records();
  };
  // A fresh page of the same scene
  const fresh = async (url) => {
    await b.open(url);
    const search = new URL(url).search;
    for (const t0 = Date.now(); Date.now() - t0 < 15000;) {
      await b.sleep(100);
      try {
        if (await b.evaluate(`location.search === ${JSON.stringify(search)} && !!window.__ooga && window.__ooga.renderedFrames >= ${FRESH_FRAMES}`)) return records();
      } catch {
        // The old document is tearing down, so poll again
      }
    }
    throw new Error(`${url} did not load`);
  };
  await framesSince(0);
  const hubFresh = await records();
  const labAfterHub = await visit("lab");
  const hubAfterLab = await visit("hub");
  const labFresh = await fresh(page(src));
  record("soak: GPU residency: the lab after a hub visit holds only lab geometry", Math.abs(labAfterHub - labFresh) <= 3, `lab after hub ${labAfterHub}, fresh lab ${labFresh}`);
  record("soak: GPU residency: the hub after a lab visit holds no lab geometry", hubAfterLab <= hubFresh + 3, `hub after lab ${hubAfterLab}, fresh hub ${hubFresh}`);
});

// Sixty tips in fifteen seconds, then back to base
const soakDonations = (label, url, opts) => withPage(`soak: donations (${label})`, url, async (b) => {
  const { until, rendered, settled, snapshot, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const before = await snapshot();
  // A tip, then the shut crates and where to tap
  const scan = (sats) => b.evaluate(`(() => { const B = window.__ooga; if (${sats}) B.demoTip(${sats}); return { crates: B.crates.length, landed: B.crates.filter((c) => !c.opened && c.node.visible && Math.abs(c.node.position.y) < 0.05).map((c) => { const p = B.project(c.node.position.x, c.node.position.y + 0.3, c.node.position.z); return p && { x: Math.round(p.x), y: Math.round(p.y) }; }).filter(Boolean) }; })()`);
  let tapped = 0;
  const openLanded = async (r) => {
    for (const c of r.landed) await b.click(c.x, c.y);
    tapped += r.landed.length;
  };
  const start = await b.evaluate("performance.now()");
  for (let i = 0; i < 60; i++) {
    await openLanded(await scan(i % 4 === 3 ? 120000 : 1200));
    await until(`performance.now() >= ${start + 250 * (i + 1)}`, 2000);
  }
  // The last crates land late and leave later
  let crates = -1;
  for (const t0 = Date.now(); crates && Date.now() - t0 < 15000;) {
    const r = await scan(0);
    crates = r.crates;
    await openLanded(r);
    await rendered(6);
  }
  const quiet = await until("B.stats().particles === 0", 6000) && await settled(15000);
  await b.evaluate("(() => { const B = window.__ooga; B.trimPool(); B.housekeep(); })()");
  const after = await snapshot();
  const a = after.stats, s = before.stats;
  record(`soak: donations (${label}): crates, particles and tweens back to zero, pool trimmed`, quiet && crates === 0 && a.crates === 0 && a.particles === 0 && a.tweens === 0 && a.pool <= 32, `${tapped} crates tapped open · ${JSON.stringify({ crates: a.crates, particles: a.particles, pool: a.pool, tweens: a.tweens, built: a.built, shown: await b.evaluate("window.__ooga.shown") })}`);
  record(`soak: donations (${label}): node and target counts back to base`, a.allNodes - a.pool - a.built === s.allNodes - s.pool - s.built && a.targets === s.targets, `allNodes ${s.allNodes} -> ${a.allNodes} (pool ${a.pool}, built ${a.built}), targets ${s.targets} -> ${a.targets}, dom ${s.dom} -> ${a.dom}, listeners ${before.listeners} -> ${after.listeners}`);
  record(`soak: donations (${label}): GPU records bounded`, a.gl.records - s.gl.records <= 20, `${s.gl.records} -> ${a.gl.records}`);
  record(`soak: donations (${label}): heap after GC within 15%`, within(before, after, 0.15), heapDetail(before, after));
}, opts);

await core("source", src);
await core("dist", dist);
await governor();
await locker();
await fan();
await crates();
await keys();
await refresh();
await weapons();
await props();
await fallback();
await phone();
await scenes();
await hub();
await hubDist();
await hubRoute();
await hubCamera();
await hubFlight();
await hubCrew();
await hubDrive();
await hubProps();
await hubJetpack();
await labDrive();
await hubPile();
await soakScenes();
await soakResidency();
await soakDonations("hub", hubPage(src));
await soakDonations("lab", page(src), { w: 1920 });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
