// Catalog publication reads immutable GitHub evidence; no source runs and no network is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { safeCharacterSource } from "../../scripts/character-safety.mjs";
import { digest, manifestPath } from "../../scripts/character-submissions.mjs";
import { verifyMergedCatalogBundle } from "../../scripts/character-catalog-source.mjs";

const NOW = Date.parse("2026-11-20T16:00:00Z"), REPO = "example/island", BOT = "character-catalog[bot]";
const BASE = "1".repeat(40), HEAD = "2".repeat(40), MERGE = "3".repeat(40), SOURCE = "4".repeat(40), LATER = "5".repeat(40);
const PATH = "src/characters/Alice.js", MANIFEST = manifestPath("daily");
const blobSha = (source) => createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0${source}`).digest("hex");
const character = (extra = {}) => safeCharacterSource({ handle: "Alice", joined: 1790000000, lastCommit: 1790000000,
  look: { hair: "#112233" }, ...extra });

const fixture = () => {
  const f = { calls: [], trees: new Map(), blobs: new Map(), replies: new Map() };
  const row = character();
  f.entry = { pr: 12, head: SOURCE, author: "Alice", path: PATH, base: null, hash: digest(row), lane: "daily" };
  f.manifest = { version: 1, lane: "daily", openedOn: "2026-11-19", round: BASE, automation: BOT, entries: [f.entry] };
  f.bundle = { number: 40, state: "closed", draft: false, merged: true, merged_at: "2026-11-20T00:20:00Z", merge_commit_sha: MERGE,
    user: { login: BOT }, base: { ref: "rock", sha: BASE, repo: { full_name: REPO } },
    head: { sha: HEAD, ref: "automation/characters-daily-fixture", repo: { full_name: REPO } } };
  f.sourcePR = { number: 12, state: "closed", user: { login: "Alice" }, base: { ref: "rock", sha: BASE, repo: { full_name: REPO } },
    head: { sha: SOURCE, ref: "my-ooga", repo: { full_name: "Alice/island" } } };
  for (const sha of [BASE, HEAD, MERGE, SOURCE]) f.trees.set(sha, new Map());
  f.put = (ref, path, source, extra = {}) => {
    const sha = blobSha(source), entry = { path, type: "blob", mode: "100644", size: Buffer.byteLength(source), sha, ...extra };
    f.trees.get(ref).set(path, entry);
    f.blobs.set(`${ref}:${path}`, { source, sha: entry.sha });
  };
  for (const sha of [BASE, HEAD, MERGE, SOURCE]) f.put(sha, "src/js/director.js", "// Production engine remains unchanged.\n");
  f.put(SOURCE, PATH, row); f.put(HEAD, PATH, row); f.put(MERGE, PATH, row);
  f.saveManifest = () => { for (const ref of [HEAD, MERGE]) f.put(ref, MANIFEST, JSON.stringify(f.manifest)); };
  f.saveManifest();
  f.replies.set(`pulls/40`, f.bundle);
  f.replies.set(`pulls/12`, f.sourcePR);
  f.replies.set(`commits/${HEAD}`, { sha: HEAD, author: { login: BOT }, commit: { verification: { verified: true } } });
  f.replies.set(`commits/${MERGE}`, { sha: MERGE, parents: [{ sha: BASE }, { sha: HEAD }] });
  f.replies.set(`compare/${BASE}...${SOURCE}`, { merge_base_commit: { sha: BASE }, status: "ahead", files: [{ filename: PATH, status: "added" }],
    commits: [{ sha: SOURCE }], total_commits: 1 });
  f.replies.set(`commits/${SOURCE}?per_page=100`, { sha: SOURCE, author: { login: "Alice" }, parents: [{ sha: BASE }],
    files: [{ filename: PATH, status: "added" }] });
  f.replies.set("collaborators/Alice/permission", { permission: "read", role_name: "read" });
  f.gh = { repo: REPO,
    api: async (path, method = "GET") => {
      assert.equal(method, "GET", "a verifier cannot mutate GitHub"); f.calls.push(path);
      if (!f.replies.has(path)) throw new Error(`Unexpected API request ${path}`);
      return structuredClone(f.replies.get(path));
    },
    list: async (path) => { f.calls.push(path); if (path === "pulls/12/commits") return [{ sha: SOURCE }]; throw new Error(`Unexpected list ${path}`); },
    tree: async (ref) => { f.calls.push(`tree:${ref}`); if (!f.trees.has(ref)) throw new Error(`Unexpected tree ${ref}`); return structuredClone(f.trees.get(ref)); },
    file: async (ref, path) => { f.calls.push(`file:${ref}:${path}`); return structuredClone(f.blobs.get(`${ref}:${path}`) || null); }
  };
  f.verify = (options = {}) => verifyMergedCatalogBundle(f.gh, { pr: 40, merge: MERGE, bot: BOT, now: NOW, ...options });
  return f;
};

test("a merged daily bundle produces immutable, attributable catalog input", async () => {
  const f = fixture(), result = await f.verify();
  assert.equal(result.repository, REPO); assert.equal(result.pr, 40); assert.equal(result.merge, MERGE);
  assert.equal(result.head, HEAD); assert.equal(result.lane, "daily");
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], { ...f.entry, source: character(), blob: blobSha(character()) });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.entries) && Object.isFrozen(result.entries[0]));
  assert.ok(!f.calls.some((path) => /(?:tree|file):rock\b/.test(path)), "current rock must never supply publication bytes");
});

test("later source PR changes cannot replace the immutable bundled revision", async () => {
  const f = fixture(); f.sourcePR.head.sha = LATER;
  const result = await f.verify();
  assert.equal(result.entries[0].source, character());
  assert.ok(!f.calls.some((path) => path.includes(LATER)), "publication reads the reviewed source head only");
});

test("an existing character update is verified against the exact merge-parent blob", async () => {
  const f = fixture(), old = character({ look: { hair: "#abcdef" } });
  f.put(BASE, PATH, old); f.entry.base = blobSha(old); f.saveManifest();
  f.replies.get(`compare/${BASE}...${SOURCE}`).files[0].status = "modified";
  f.replies.get(`commits/${SOURCE}?per_page=100`).files[0].status = "modified";
  const result = await f.verify();
  assert.equal(result.entries[0].base, blobSha(old)); assert.equal(result.entries[0].source, character());
});

test("an earlier executable revision keeps a final plain-data source out of automatic publication", async () => {
  const f = fixture(), earlier = "6".repeat(40);
  f.trees.set(earlier, new Map());
  const custom = '(() => { "use strict"; const BL = window.BL; BL.characters.add({ handle: "Alice", joined: 1790000000, lastCommit: 1790000000, dress: { extras() {} } }); })();';
  f.put(earlier, PATH, custom);
  const comparison = f.replies.get(`compare/${BASE}...${SOURCE}`);
  comparison.commits = [{ sha: earlier }, { sha: SOURCE }]; comparison.total_commits = 2;
  f.replies.set(`commits/${earlier}?per_page=100`, { sha: earlier, author: { login: "Alice" }, parents: [{ sha: BASE }],
    files: [{ filename: PATH, status: "added" }] });
  f.replies.get(`commits/${SOURCE}?per_page=100`).parents = [{ sha: earlier }];
  f.replies.get(`commits/${SOURCE}?per_page=100`).files[0].status = "modified";
  await assert.rejects(f.verify());
});

test("a squash merge is accepted only when its complete resulting tree matches the bundle", async () => {
  const f = fixture(); f.replies.get(`commits/${MERGE}`).parents = [{ sha: BASE }];
  assert.equal((await f.verify()).merge, MERGE);
  f.put(MERGE, "src/js/director.js", "// An unrelated engine change slipped into the squash.\n");
  await assert.rejects(f.verify());
});

test("closed, unrelated and unsigned pull requests cannot impersonate a published bundle", async (t) => {
  for (const [name, change] of [
    ["closed without merge", (f) => { f.bundle.merged = false; f.bundle.merged_at = null; }],
    ["draft", (f) => { f.bundle.draft = true; }],
    ["invalid merge time", (f) => { f.bundle.merged_at = "not a timestamp"; }],
    ["future merge time", (f) => { f.bundle.merged_at = "2027-01-01T00:00:00Z"; }],
    ["wrong merge SHA", (f) => { f.bundle.merge_commit_sha = LATER; }],
    ["wrong base branch", (f) => { f.bundle.base.ref = "feature"; }],
    ["fork bundle", (f) => { f.bundle.head.repo.full_name = "attacker/island"; }],
    ["ordinary branch", (f) => { f.bundle.head.ref = "feature/characters"; }],
    ["manual lane", (f) => { f.bundle.head.ref = "automation/characters-manual-fixture"; }],
    ["untrusted PR author", (f) => { f.bundle.user.login = "attacker"; }],
    ["untrusted commit author", (f) => { f.replies.get(`commits/${HEAD}`).author.login = "attacker"; }],
    ["unsigned head", (f) => { f.replies.get(`commits/${HEAD}`).commit.verification.verified = false; }],
    ["wrong merged parent", (f) => { f.replies.get(`commits/${MERGE}`).parents[1].sha = LATER; }]
  ]) await t.test(name, async () => { const f = fixture(); change(f); await assert.rejects(f.verify()); });
});

test("the full merged diff must contain exactly the declared regular character files and manifest", async (t) => {
  for (const [name, change] of [
    ["unrelated engine edit", (f) => { f.put(HEAD, "src/js/director.js", "// unpublished work\n"); f.put(MERGE, "src/js/director.js", "// unpublished work\n"); }],
    ["undeclared second character", (f) => { for (const ref of [HEAD, MERGE]) f.put(ref, "src/characters/Bob.js", character({ handle: "Bob" })); }],
    ["deleted engine file", (f) => { f.trees.get(MERGE).delete("src/js/director.js"); }],
    ["symlink character", (f) => { f.trees.get(MERGE).get(PATH).mode = "120000"; }],
    ["executable character", (f) => { f.trees.get(MERGE).get(PATH).mode = "100755"; }],
    ["gitlink character", (f) => { f.trees.get(MERGE).get(PATH).type = "commit"; }],
    ["oversized character", (f) => { f.trees.get(MERGE).get(PATH).size = 32769; }],
    ["renamed character", (f) => { const row = f.trees.get(MERGE).get(PATH); f.trees.get(MERGE).delete(PATH); f.trees.get(MERGE).set("src/characters/Other.js", { ...row, path: "src/characters/Other.js" }); }]
  ]) await t.test(name, async () => { const f = fixture(); change(f); await assert.rejects(f.verify()); });
});

test("source provenance is rechecked rather than trusting a signed manifest's claims", async (t) => {
  for (const [name, change] of [
    ["wrong content hash", (f) => { f.entry.hash = "0".repeat(64); f.saveManifest(); }],
    ["wrong source owner", (f) => { f.sourcePR.user.login = "Mallory"; f.replies.set("collaborators/Mallory/permission", { permission: "read" }); }],
    ["unattributable source commit", (f) => { f.replies.get(`commits/${SOURCE}?per_page=100`).author = null; }],
    ["invented source base", (f) => { f.entry.base = LATER; f.saveManifest(); }],
    ["changed source bytes", (f) => { f.put(SOURCE, PATH, character({ look: { hair: "#445566" } })); }],
    ["changed merge bytes", (f) => { f.put(MERGE, PATH, character({ look: { hair: "#445566" } })); }],
    ["different manifest at merge", (f) => { f.put(MERGE, MANIFEST, "{}"); }],
    ["missing source", (f) => { f.blobs.delete(`${SOURCE}:${PATH}`); }],
    ["empty manifest", (f) => { f.manifest.entries = []; f.saveManifest(); }],
    ["manifest names another bot", (f) => { f.manifest.automation = "attacker[bot]"; f.saveManifest(); }],
    ["duplicate path", (f) => { f.manifest.entries.push({ ...f.entry }); f.saveManifest(); }]
  ]) await t.test(name, async () => { const f = fixture(); change(f); await assert.rejects(f.verify()); });
});

test("a verified standalone submission keeps its linked author and immutable commit", async () => {
  const f = fixture(); f.entry.pr = null; f.saveManifest();
  f.replies.set(`commits/${SOURCE}`, { sha: SOURCE, author: { login: "Alice" }, committer: { login: "Alice" },
    commit: { verification: { verified: true } } });
  const result = await f.verify();
  assert.equal(result.entries[0].pr, null); assert.equal(result.entries[0].author, "Alice");
  assert.ok(!f.calls.includes("pulls/12"));
  f.replies.get(`commits/${SOURCE}`).committer.login = "Mallory";
  await assert.rejects(f.verify());
});

test("unchanged entries and forged blob bytes cannot be published as new changes", async (t) => {
  await t.test("unchanged character listed as a change", async () => {
    const f = fixture(); f.put(BASE, PATH, character()); f.entry.base = blobSha(character()); f.saveManifest();
    await assert.rejects(f.verify());
  });
  await t.test("tree and returned file share a forged SHA", async () => {
    const f = fixture();
    f.trees.get(MERGE).get(PATH).sha = LATER; f.blobs.get(`${MERGE}:${PATH}`).sha = LATER;
    await assert.rejects(f.verify());
  });
  await t.test("legacy manifests without automation remain valid", async () => {
    const f = fixture(); delete f.manifest.automation; f.saveManifest();
    assert.equal((await f.verify()).entries.length, 1);
  });
});

test("malformed and potentially truncated GitHub evidence fails closed", async (t) => {
  for (const [name, change] of [
    ["missing parent list", (f) => { delete f.replies.get(`commits/${MERGE}`).parents; }],
    ["missing comparison file list", (f) => { delete f.replies.get(`compare/${BASE}...${SOURCE}`).files; }],
    ["compare file boundary", (f) => { f.replies.get(`compare/${BASE}...${SOURCE}`).files = Array.from({ length: 300 }, () => ({ filename: PATH, status: "added" })); }],
    ["commit file boundary", (f) => { f.replies.get(`commits/${SOURCE}?per_page=100`).files = Array.from({ length: 100 }, () => ({ filename: PATH, status: "added" })); }],
    ["missing merge base", (f) => { delete f.replies.get(`compare/${BASE}...${SOURCE}`).merge_base_commit; }],
    ["history exceeds limit", (f) => { f.replies.get(`compare/${BASE}...${SOURCE}`).total_commits = 101; }],
    ["truncated tree reader", (f) => { f.gh.tree = async () => { throw new Error("Truncated Git tree; cannot validate safely"); }; }],
    ["invalid manifest JSON", (f) => { for (const ref of [HEAD, MERGE]) f.put(ref, MANIFEST, "{"); }],
    ["malformed tree row", (f) => { f.trees.get(MERGE).set(PATH, null); }]
  ]) await t.test(name, async () => { const f = fixture(); change(f); await assert.rejects(f.verify()); });
});
