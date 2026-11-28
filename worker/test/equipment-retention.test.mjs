import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEquipmentRetention, preflightEquipmentRetention } from "../../scripts/equipment-retention.mjs";
import { equipmentHats } from "../src/equipment-hats.js";

// Start the migration fixture from the first published straw archive, independent of later
// catalog updates. sharedFixture below adds item-bound v2 manifests and their complete blob.
const root = new URL("../../", import.meta.url), legacyVersion = "c6f85793cc6314e8e0ca023c21ebb925060400ed3b4bc499694c32daa050e8eb";
const item = { ...equipmentHats.items.find(row => row.id === "bitcoin-bill-straw"), current: legacyVersion, versions: [legacyVersion], parent: null };
const original = readFileSync(new URL(`src/equipment/hats/${item.current}.json`, root), "utf8");
const changed = JSON.parse(original); changed.nodes[0].geometry.faces[0].color = [201, 13, 93];
const next = equipmentHats.encode(changed), version = createHash("sha256").update(next).digest("hex");
const WARDROBE_URL = "/api/equipment/wardrobe/catalog";
const hats = fetcher => async (url, options) => url.endsWith(WARDROBE_URL) ? new Response(null, { status: 404 }) : fetcher(url, options);
const result = rows => JSON.stringify([{ success: true, results: rows, meta: { changed_db: false } }]);
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "equipment-retention-"));
  const write = (path, value) => writeFileSync(join(directory, path), typeof value === "string" ? value : JSON.stringify(value));
  mkdirSync(join(directory, "scripts")); mkdirSync(join(directory, "src/equipment/hats"), { recursive: true });
  write(".catalog-wrangler.json", { vars: { EQUIPMENT_ENABLED: "1" } });
  write("wrangler.staging.jsonc", { name: "oogaboogaland-staging", vars: { EQUIPMENT_ENABLED: "1", ENVIRONMENT: "staging",
    SITE_ORIGIN: "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev" } });
  write("scripts/equipment-retention.mjs", "throw new Error('target source must never execute');\n");
  const catalog = { format: 1, items: [{ ...item, current: version, versions: [item.current, version] }] };
  write("src/equipment/hats/catalog.json", catalog);
  write(`src/equipment/hats/${item.current}.json`, original); write(`src/equipment/hats/${version}.json`, next);
  return { directory, write, catalog, close: () => rmSync(directory, { recursive: true, force: true }) };
};
const sharedFixture = () => {
  const f = fixture(), content = equipmentHats.contentOf(JSON.parse(original)), text = equipmentHats.encode(content);
  const hash = createHash("sha256").update(text).digest("hex"), profile = equipmentHats.legacyProfile(item.id);
  const first = { format: 2, item: item.id, content: hash, profile, parent: null };
  const second = { ...first, item: "shared-straw", parent: { item: item.id, version: item.current } };
  const install = value => {
    const bytes = equipmentHats.encode(value), digest = createHash("sha256").update(bytes).digest("hex");
    f.write(`src/equipment/hats/${digest}.json`, bytes); return digest;
  };
  const firstVersion = install(first), secondVersion = install(second);
  f.write(`src/equipment/hats/${hash}.json`, text);
  f.catalog.format = 2;
  f.catalog.items[0] = { ...f.catalog.items[0], current: firstVersion, parent: null,
    versions: [...f.catalog.items[0].versions, firstVersion] };
  f.catalog.items.push({ id: second.item, label: "Shared straw", creator: "AnotherCreator", current: secondVersion,
    versions: [secondVersion], parent: second.parent });
  f.write("src/equipment/hats/catalog.json", f.catalog);
  return { ...f, content, text, hash, first, second, firstVersion, secondVersion, install };
};

test("forward release retains an older worn version and an empty first deployment is valid", () => {
  const f = fixture();
  try {
    assert.deepEqual(validateEquipmentRetention(f.directory, result([{ item: item.id, version: item.current }, { item: item.id, version }])), { enabled: true, retained: 2 });
    assert.deepEqual(validateEquipmentRetention(f.directory, result([])), { enabled: true, retained: 0 });
  } finally { f.close(); }
});

test("enabled rollback cannot lose a saved version even when other archives remain valid", () => {
  const f = fixture(), saved = result([{ item: item.id, version }]);
  try {
    f.catalog.items[0].current = item.current; f.catalog.items[0].versions = [item.current];
    f.write("src/equipment/hats/catalog.json", f.catalog);
    assert.throws(() => validateEquipmentRetention(f.directory, saved), /omits a retained hat version/);
  } finally { f.close(); }
});

test("shared full geometry retains both item-bound revisions and legacy saves", async () => {
  const f = sharedFixture(), rows = [{ item: item.id, version: item.current },
    { item: item.id, version: f.firstVersion }, { item: f.second.item, version: f.secondVersion }];
  try {
    assert.notEqual(f.firstVersion, f.secondVersion, "a shared mesh does not erase item ownership or parent history");
    assert.deepEqual(validateEquipmentRetention(f.directory, result(rows)), { enabled: true, retained: 3 });
    assert.deepEqual(await preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging",
      fetcher: hats(async () => Response.json({ format: 1, items: f.catalog.items.map(({ id, versions }) => ({ id, versions })) })) }),
    { enabled: true, retained: 4, wardrobe: 0 });
    f.catalog.items.pop(); f.write("src/equipment/hats/catalog.json", f.catalog);
    assert.throws(() => validateEquipmentRetention(f.directory, result(rows)), /omits a retained hat version/,
      "retaining the shared blob and another item cannot replace the saved variant identity");
  } finally { f.close(); }
});

test("retained revision manifests require complete canonical content with the pinned digest", () => {
  for (const damage of ["missing", "digest", "noncanonical", "shape"]) {
    const f = sharedFixture();
    try {
      if (damage === "missing") rmSync(join(f.directory, `src/equipment/hats/${f.hash}.json`));
      else if (damage === "digest") f.write(`src/equipment/hats/${f.hash}.json`, f.text + " ");
      else {
        const text = damage === "noncanonical" ? " " + f.text : equipmentHats.encode({ ...f.content, nodes: [] });
        const hash = createHash("sha256").update(text).digest("hex");
        f.write(`src/equipment/hats/${hash}.json`, text);
        const revision = f.install({ ...f.first, content: hash });
        f.catalog.items[0].current = revision; f.catalog.items[0].versions.push(revision);
        f.write("src/equipment/hats/catalog.json", f.catalog);
      }
      assert.throws(() => validateEquipmentRetention(f.directory, result([{ item: item.id, version: f.catalog.items[0].current }])));
    } finally { f.close(); }
  }
});

test("a retained revision pins its item, profile and parent even when its shared geometry is unchanged", () => {
  for (const field of ["item", "profile", "parent"]) {
    const f = sharedFixture();
    try {
      const changed = { ...f.second, [field]: field === "item" ? item.id : field === "profile"
        ? equipmentHats.legacyProfile(equipmentHats.items[1].id) : null };
      assert.notDeepEqual(changed, f.second);
      f.write(`src/equipment/hats/${f.secondVersion}.json`, equipmentHats.encode(changed));
      assert.throws(() => validateEquipmentRetention(f.directory, result([{ item: f.second.item, version: f.secondVersion }])), /archive digest differs/);
    } finally { f.close(); }
  }
});

test("preflight preserves all published versions, including one nobody has selected yet", async () => {
  const f = fixture(), published = { format: 1, items: [{ id: item.id, versions: [item.current, version] }] };
  const fetcher = async (url, options) => {
    assert.equal(url, "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev/api/equipment/catalog");
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    return Response.json(published);
  };
  try {
    assert.deepEqual(await preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher: hats(fetcher) }), { enabled: true, retained: 2, wardrobe: 0 });
    f.catalog.items[0].versions = [item.current]; f.catalog.items[0].current = item.current; f.write("src/equipment/hats/catalog.json", f.catalog);
    assert.deepEqual(validateEquipmentRetention(f.directory, result([])), { enabled: true, retained: 0 });
    await assert.rejects(preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher: hats(fetcher) }), /omits a retained hat version/);
  } finally { f.close(); }
});

test("preflight permits the first registry but fails closed on an unavailable or malformed published registry", async () => {
  const f = fixture();
  try {
    assert.deepEqual(await preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher: async () => new Response(null, { status: 404 }) }),
      { enabled: true, retained: 0, bootstrap: true });
    for (const response of [new Response(null, { status: 503 }), Response.json({ format: 1, items: [{ id: item.id, versions: [version, version] }] }),
      Response.json({ format: 1, items: [], accounts: ["private-account-id"] })]) {
      await assert.rejects(preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher: async () => response }));
    }
  } finally { f.close(); }
});

test("feature-off releases preserve public history before any later re-enable", async () => {
  const f = fixture(), published = { format: 1, items: [{ id: item.id, versions: [item.current, version] }] };
  const check = fetcher => preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher: hats(fetcher) });
  try {
    f.write("wrangler.staging.jsonc", { name: "oogaboogaland-staging", vars: { EQUIPMENT_ENABLED: "0", ENVIRONMENT: "staging",
      SITE_ORIGIN: "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev" } });
    assert.deepEqual(await check(async () => Response.json(published)), { enabled: false, retained: 2, wardrobe: 0 });
    f.catalog.items[0].versions = [item.current]; f.catalog.items[0].current = item.current;
    f.write("src/equipment/hats/catalog.json", f.catalog);
    await assert.rejects(check(async () => Response.json(published)), /omits a retained hat version/);
    rmSync(join(f.directory, "scripts/equipment-retention.mjs"));
    await assert.rejects(check(async () => Response.json(published)), /required target file/);
    await assert.rejects(check(async () => new Response(null, { status: 503 })), /published catalog unavailable/);
    assert.deepEqual(await check(async () => new Response(null, { status: 404 })), { enabled: false, retained: 0, bootstrap: true });
  } finally { f.close(); }
});

test("selected archives must exist with their immutable digest and canonical validated bytes", () => {
  for (const damage of ["missing", "digest", "noncanonical"]) {
    const f = fixture();
    try {
      let savedVersion = version;
      if (damage === "missing") rmSync(join(f.directory, `src/equipment/hats/${version}.json`));
      else if (damage === "digest") f.write(`src/equipment/hats/${version}.json`, next + " ");
      else {
        const text = " " + next; savedVersion = createHash("sha256").update(text).digest("hex");
        f.catalog.items[0].versions.push(savedVersion); f.write("src/equipment/hats/catalog.json", f.catalog);
        f.write(`src/equipment/hats/${savedVersion}.json`, text);
      }
      assert.throws(() => validateEquipmentRetention(f.directory, result([{ item: item.id, version: savedVersion }])));
    } finally { f.close(); }
  }
});

test("malformed, failed and truncated query results refuse without printing player identities", () => {
  const f = fixture();
  try {
    const inputs = ["{private-account-id", JSON.stringify([{ success: false, results: [] }]), result(Array(257).fill({ item: item.id, version })),
      result([{ item: item.id, version, player_id: "private-account-id" }]), "x".repeat(128 * 1024 + 1)];
    for (const input of inputs) assert.throws(() => validateEquipmentRetention(f.directory, input), error => !error.message.includes("private-account-id"));
  } finally { f.close(); }
});

test("an explicit feature-off release skips the D1 census while unsupported enabled targets fail closed", () => {
  const f = fixture();
  try {
    rmSync(join(f.directory, "scripts/equipment-retention.mjs"));
    assert.throws(() => validateEquipmentRetention(f.directory, result([])), /required target file/);
    f.write(".catalog-wrangler.json", { vars: { EQUIPMENT_ENABLED: "0" } });
    assert.deepEqual(validateEquipmentRetention(f.directory), { enabled: false, retained: 0 });
    f.write(".catalog-wrangler.json", { vars: {} });
    assert.deepEqual(validateEquipmentRetention(f.directory), { enabled: false, retained: 0 });
  } finally { f.close(); }
});

test("preflight keeps every wardrobe piece the live site publishes, whole and matching its hash", async () => {
  const f = fixture(), published = { format: 1, items: [{ id: item.id, versions: [item.current, version] }] };
  const text = '{"color":"#8b8279","format":1,"slot":"beard"}\n', piece = createHash("sha256").update(text).digest("hex"), id = "beard-" + piece.slice(0, 16);
  const live = { format: 1, items: [{ id, version: piece }] };
  const check = () => preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging",
    fetcher: async (url) => Response.json(url.endsWith("/api/equipment/wardrobe/catalog") ? live : published) });
  try {
    await assert.rejects(check(), /no wardrobe for a published piece/);
    mkdirSync(join(f.directory, "src/equipment/wardrobe"));
    f.write("src/equipment/wardrobe/catalog.json", { format: 1, items: [{ id, slot: "beard", label: "Grey beard", creators: ["NickDaGreek"], version: piece, retired: true }] });
    await assert.rejects(check(), /required target file is missing/);
    f.write(`src/equipment/wardrobe/${piece}.json`, text.replace("8b8279", "8b8270"));
    await assert.rejects(check(), /digest differs/);
    f.write(`src/equipment/wardrobe/${piece}.json`, text);
    assert.deepEqual(await check(), { enabled: true, retained: 2, wardrobe: 1 });
    f.write("src/equipment/wardrobe/catalog.json", { format: 1, items: [] });
    await assert.rejects(check(), /omits a published wardrobe piece/);
  } finally { f.close(); }
});
