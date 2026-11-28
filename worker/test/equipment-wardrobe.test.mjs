// The wardrobe beside the hat (src/js/equipment-wardrobe.js): what a save may carry, how it is kept with the hat under
// one revision, and how the Room tells the players who can see the wearer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { equipmentHats } from "../src/equipment-hats.js";
import { equipmentWardrobe } from "../src/equipment-wardrobe.js";
import { equipmentCommand, equipmentRecord } from "../src/equipment-model.js";
import { equipmentAccount, equipmentDatabase, readEquipment, writeEquipment } from "./equipment-fixture.mjs";

const NONE = { item: "none", version: null };
const hat = () => ({ item: equipmentHats.items[0].id, version: equipmentHats.items[0].current });
const piece = (slot) => { const item = equipmentWardrobe.slotItems(slot)[0]; return { item: item.id, version: item.version }; };
const setup = async (t) => {
  const db = equipmentDatabase(); t.after(() => db.sql.close());
  return { db, account: await equipmentAccount(db, 1) };
};

test("wardrobe: every slot but the hat lists pieces, each immutable data matching its hash", () => {
  const dir = new URL("../../src/equipment/wardrobe/", import.meta.url);
  for (const id of equipmentWardrobe.WORN) if (id !== "height" && id !== "pet") assert.ok(equipmentWardrobe.slotItems(id).length > 0, `${id} has something to wear`);
  assert.equal(equipmentWardrobe.slotItems("height").length, 0, "a height is a number, never a piece");
  for (const row of equipmentWardrobe.items) {
    const text = readFileSync(new URL(row.version + ".json", dir), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), row.version);
    const content = JSON.parse(text);
    assert.equal(equipmentWardrobe.encode(equipmentWardrobe.validateContent(content)), text);
    assert.equal(content.slot, row.slot);
  }
  const files = readdirSync(dir).filter((f) => /^[a-f0-9]{64}\.json$/.test(f)).map((f) => f.slice(0, 64)).sort();
  assert.deepEqual(files, equipmentWardrobe.items.map((r) => r.version).sort(), "every piece on disk is in the catalog");
});

test("wardrobe: a save names only known pieces of their own slot, none where a slot allows it, and sizes only the mask", () => {
  const shirt = piece("shirt"), weapon = piece("weapon"), mask = piece("mask");
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { shirt, weapon } }), { revision: 0, wardrobe: { shirt, weapon } });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: null }), { revision: 0, wardrobe: null });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: {} }), { revision: 0, wardrobe: null });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { mask: { ...mask, size: 110 } } }).wardrobe.mask.size, 110);
  assert.deepEqual(equipmentCommand({ revision: 3, selection: hat(), size: 90, wardrobe: { shoes: NONE } }),
    { revision: 3, selection: hat(), size: 90, wardrobe: { shoes: NONE } });
  for (const bad of [{ hat: hat() }, { body: NONE }, { body: { ...piece("body"), size: 110 } }, { shirt: weapon }, { shirt: { item: shirt.item, version: "f".repeat(64) } }, { eyes: NONE }, { pants: NONE },
    { shirt: { ...shirt, size: 110 } }, { mask: { ...mask, size: 79 } }, { mask: { ...NONE, size: 100 } }, { cape: shirt }, [shirt], "shirt"])
    assert.throws(() => equipmentCommand({ revision: 0, wardrobe: bad }), undefined, JSON.stringify(bad));
  assert.throws(() => equipmentCommand({ revision: 0, decline: "a".repeat(64), wardrobe: null }));
});

test("wardrobe: the height takes any whole hundredth from 0.80 to 1.20 of the game's height, and nothing else", () => {
  const tall = (height) => ({ item: "custom", version: null, height });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { height: tall(80) } }).wardrobe, { height: tall(80) });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { height: tall(120) } }).wardrobe, { height: tall(120) });
  assert.equal(equipmentWardrobe.key({ height: tall(104) }), "height:104");
  for (const bad of [tall(79), tall(121), tall(100.5), tall("100"), { ...tall(100), color: "#ffffff" }, { item: "custom", version: null, color: "#ffffff" },
    { item: "none", version: null }, { ...piece("shirt") }, { ...tall(100), size: 100 }])
    assert.throws(() => equipmentCommand({ revision: 0, wardrobe: { height: bad } }), undefined, JSON.stringify(bad));
  assert.throws(() => equipmentCommand({ revision: 0, wardrobe: { skin: tall(100) } }));
  assert.throws(() => equipmentWardrobe.validateContent({ format: 1, slot: "height", height: 100 }));
});

test("wardrobe: the pet takes any whole per cent from 50 to 150 of the size its file builds it, and nothing else", () => {
  const size = (n) => ({ item: "custom", version: null, size: n });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { pet: size(50), height: { item: "custom", version: null, height: 110 } } }).wardrobe,
    { height: { item: "custom", version: null, height: 110 }, pet: size(50) });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { pet: size(150) } }).wardrobe, { pet: size(150) });
  for (const bad of [size(49), size(151), size(99.5), size("100"), { item: "custom", version: null, height: 100 }, { item: "none", version: null }, { ...size(100), color: "#ffffff" }])
    assert.throws(() => equipmentCommand({ revision: 0, wardrobe: { pet: bad } }), undefined, JSON.stringify(bad));
  assert.throws(() => equipmentCommand({ revision: 0, wardrobe: { height: size(100) } }));
});

test("wardrobe: an Ooga's own colours also take a colour the player mixed, as a lower-case hex, and no other slot does", () => {
  const custom = (color) => ({ item: "custom", version: null, color });
  assert.deepEqual(equipmentCommand({ revision: 0, wardrobe: { skin: custom("#a0522d"), eyeColor: custom("#12ab34") } }),
    { revision: 0, wardrobe: { skin: custom("#a0522d"), eyeColor: custom("#12ab34") } });
  assert.equal(equipmentWardrobe.key({ hairColor: custom("#ffffff") }), "hairColor:#ffffff");
  for (const bad of [{ shirt: custom("#a0522d") }, { beard: custom("#a0522d") }, { skin: custom("#A0522D") }, { skin: custom("a0522d") }, { skin: custom("#a0522") },
    { skin: { ...custom("#a0522d"), version: "x" } }, { skin: { ...custom("#a0522d"), size: 100 } }, { skin: { item: "custom", version: null } },
    { skin: custom(["#a0522d"]) }, { skin: custom({ toString: () => "#a0522d" }) }])
    assert.throws(() => equipmentCommand({ revision: 0, wardrobe: bad }), undefined, JSON.stringify(bad));
});

test("wardrobe: kept with the hat under one revision; a hat-only save from an older page keeps what else is worn", async (t) => {
  const { db, account } = await setup(t), token = account.session.token_hash, shirt = piece("shirt");
  const first = await writeEquipment(db, 1, token, { revision: 0, wardrobe: { shirt, beard: NONE } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.equipment.wardrobe, { beard: NONE, shirt });
  assert.equal(first.equipment.selection, null);
  const hatOnly = await writeEquipment(db, 1, token, { revision: 1, selection: hat(), size: 110 });
  assert.deepEqual(hatOnly.equipment.wardrobe, { beard: NONE, shirt }, "an older page's save never takes clothes off");
  assert.deepEqual(hatOnly.equipment.selection, hat());
  const stale = await writeEquipment(db, 1, token, { revision: 1, wardrobe: null });
  assert.equal(stale.status, 409, "a wardrobe save shares the hat's compare-and-swap");
  const cleared = await writeEquipment(db, 1, token, { revision: 2, selection: hat(), size: 110, wardrobe: null });
  assert.equal(cleared.equipment.wardrobe, null);
  assert.deepEqual(cleared.equipment.selection, hat());
  assert.deepEqual((await readEquipment(db, 1, token)).wardrobe, null);
  assert.throws(() => db.sql.prepare("UPDATE player_equipment SET wardrobe = '[1]'").run(), /CHECK/);
  assert.throws(() => db.sql.prepare("UPDATE player_equipment SET wardrobe = ?").run("{" + "x".repeat(5000) + "}"), /CHECK/);
});

test("wardrobe: a stored choice whose piece is not this Worker's is refused rather than worn", () => {
  const shirt = piece("shirt");
  const row = { item: null, version: null, size: 100, revision: 2, declined: null };
  assert.deepEqual(equipmentRecord({ ...row, wardrobe: JSON.stringify({ shirt }) }).wardrobe, { shirt });
  assert.throws(() => equipmentRecord({ ...row, wardrobe: JSON.stringify({ shirt: { ...shirt, version: "0".repeat(64) } }) }));
  assert.throws(() => equipmentRecord({ ...row, wardrobe: "not json" }));
});

test("wardrobe: its public history lists every piece, retired ones too, at its own address while the hat catalog keeps its shape", async () => {
  const { routeFixture } = await import("./routes.mjs");
  const routes = routeFixture(), site = "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev";
  for (const enabled of ["0", "1"]) {
    const response = await routes.worker.fetch(new Request(site + "/api/equipment/wardrobe/catalog"), { EQUIPMENT_ENABLED: enabled });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { format: 1, items: equipmentWardrobe.items.map(({ id, version }) => ({ id, version })) });
    const hats = await (await routes.worker.fetch(new Request(site + "/api/equipment/catalog"), { EQUIPMENT_ENABLED: enabled })).json();
    assert.deepEqual(Object.keys(hats).sort(), ["format", "items"]);
  }
});
