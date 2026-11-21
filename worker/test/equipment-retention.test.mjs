import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateEquipmentRetention, preflightEquipmentRetention } from "../../scripts/equipment-retention.mjs";
import { equipmentHats } from "../src/equipment-hats.js";

const root = new URL("../../", import.meta.url), item = equipmentHats.items[0];
const original = readFileSync(new URL(`src/equipment/hats/${item.current}.json`, root), "utf8");
const changed = JSON.parse(original); changed.nodes[0].geometry.faces[0].color = [201, 13, 93];
const next = equipmentHats.encode(changed), version = createHash("sha256").update(next).digest("hex");
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

test("preflight preserves all published versions, including one nobody has selected yet", async () => {
  const f = fixture(), published = { format: 1, items: [{ id: item.id, versions: [item.current, version] }] };
  const fetcher = async (url, options) => {
    assert.equal(url, "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev/api/equipment/catalog");
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    return Response.json(published);
  };
  try {
    assert.deepEqual(await preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher }), { enabled: true, retained: 2 });
    f.catalog.items[0].versions = [item.current]; f.catalog.items[0].current = item.current; f.write("src/equipment/hats/catalog.json", f.catalog);
    assert.deepEqual(validateEquipmentRetention(f.directory, result([])), { enabled: true, retained: 0 });
    await assert.rejects(preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher }), /omits a retained hat version/);
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
  const check = fetcher => preflightEquipmentRetention({ releaseDir: f.directory, environment: "staging", fetcher });
  try {
    f.write("wrangler.staging.jsonc", { name: "oogaboogaland-staging", vars: { EQUIPMENT_ENABLED: "0", ENVIRONMENT: "staging",
      SITE_ORIGIN: "https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev" } });
    assert.deepEqual(await check(async () => Response.json(published)), { enabled: false, retained: 2 });
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
