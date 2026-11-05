// Eligibility and identity reconciliation are authorization boundaries. No live network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { contributorRows, createContributorLookup, createOwnedCharacterLookup } from "../src/contributor-policy.js";
import { missingCharacters, characterSource, retiredCharacters, queuedDefaults } from "../../scripts/sync-characters.mjs";
import { checkCharacterIdentities, identityAdvice } from "../../scripts/contributor-pr.mjs";
import { declaredIdentity, mayAuthorIdentity } from "../../scripts/character-identity.mjs";
import { CharacterRejection, parseSafeCharacter, scanCharacter, safeCharacterSource, checkOwner, isGitHubDisplayRename } from "../../scripts/character-safety.mjs";
import { LANES, digest, due, inspectSubmission, manifestPath, readManifest, queuedCharacters, reviewDecision } from "../../scripts/character-submissions.mjs";
import { createCoordinator, runAccountRenameChecks } from "../../scripts/character-bundles.mjs";
import { BOT, OPERATORS, isOperator } from "../../scripts/character-operators.mjs";
import { inspectAccountRename, onlyAccountLoginChanged } from "../../scripts/character-account-rename.mjs";
import { createGitHub } from "../../scripts/character-github.mjs";
import { snapshotRename, refreshRenameSnapshot } from "../../scripts/account-rename-snapshot.mjs";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const person = (login, extra = {}) => ({ login, counts: { commits: 1 }, first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-10-04T11:00:00Z", ...extra });
const snapshot = (...rows) => ({ meta: { org: "OogaBoogaX", schema_version: 3, generated_at: new Date(NOW).toISOString() }, contributors: rows });

const accountRenameFixture = () => {
  const rock = "a".repeat(40), head = "b".repeat(40), path = "src/characters/Bitcoin-Bill.js", repo = "example/land";
  // Historical fixture: the deployed character can already have its new login.
  const base = `BL.characters.add({
    handle: "Bitcoin-Bill",
    github: "Bitcoin-Bill",
    display: "Bitclank Bill",
    joined: 1,
    lastCommit: 2
  });\n`;
  const f = { rock, head, path, repo, base, source: base.replace('github: "Bitcoin-Bill"', 'github: "Bitclank-Bill"'),
    permission: "admin", commits: [{ sha: head }], reviews: [], calls: [], signed: true,
    account: { id: 185141343, login: "Bitclank-Bill", type: "User" }, revisionFiles: [{ filename: path, status: "modified" }] };
  f.pr = { number: 7, state: "open", draft: false, user: { ...OPERATORS[0], type: "User" }, base: { ref: "rock", repo: { full_name: repo } }, head: { sha: head, repo: { full_name: repo } } };
  f.gh = { repo,
    api: async (url, method, data) => {
      f.calls.push({ url, method, data });
      if (url === "pulls/7") return f.pr;
      if (url === "git/ref/heads/rock") return { object: { sha: rock } };
      if (url.startsWith("statuses/")) return {};
      if (url.startsWith("collaborators/")) return { permission: f.permission };
      if (url.startsWith("compare/")) return { merge_base_commit: { sha: rock }, total_commits: f.commits.length, files: f.diffFiles || [{ filename: path, status: "modified" }] };
      if (url.startsWith("commits/")) return { author: f.revisionAuthor || f.pr.user, parents: [{ sha: rock }], files: f.revisionFiles, commit: { verification: { verified: f.signed } } };
      throw new Error(`Unexpected request ${url}`);
    },
    list: async (url) => {
      if (url === "pulls/7/commits") return f.commits;
      if (url === "pulls/7/reviews") return f.reviews;
      if (url === "pulls?state=open&base=rock") return [f.pr];
      throw new Error(`Unexpected list ${url}`);
    },
    tree: async () => new Map([[path, {}]]),
    file: async (ref) => ({ sha: ref === rock ? "c".repeat(40) : "d".repeat(40), source: ref === rock ? f.base : ref === head ? f.source : f.earlierSource }),
    account: async (lookup) => f.lookup ? f.lookup(lookup) : f.account
  };
  return f;
};

test("rename unit preparation refreshes only a pinned github-only change and fails closed on missing or stale activity", async () => {
  const f = accountRenameFixture();
  const detect = (files = [f.path], before = f.base, after = f.source) => snapshotRename(files, () => before, () => after);
  assert.equal(detect(), "Bitclank-Bill");
  assert.equal(detect([f.path, "README.md"]), null);
  assert.equal(detect([f.path], null), null);
  assert.equal(detect([f.path], f.base, null), null);
  assert.equal(detect([f.path], f.base, f.base), null);
  assert.equal(detect([f.path], f.base, f.source + "\n// unrelated"), null);
  assert.equal(detect(["src/characters/Alice.js"], f.base.replaceAll("Bitcoin-Bill", "Alice"), f.source.replaceAll("Bitcoin-Bill", "Alice")), null);
  let calls = 0, baked;
  const bake = async (stats) => { baked = stats; };
  const fetcher = (stats) => async () => { calls++; return new Response(JSON.stringify(stats)); };
  assert.equal(await refreshRenameSnapshot(null, bake, () => { throw new Error("unexpected fetch"); }, NOW), false);
  const current = snapshot(person("Bitclank-Bill"));
  assert.equal(await refreshRenameSnapshot(detect(), bake, fetcher(current), NOW), true);
  assert.deepEqual(baked, current);
  baked = null;
  await assert.rejects(refreshRenameSnapshot(detect(), bake, fetcher(snapshot(person("Bitcoin-Bill"))), NOW), /does not contain/);
  await assert.rejects(refreshRenameSnapshot(detect(), bake, fetcher(current), NOW + 86400001), /stale/);
  await assert.rejects(refreshRenameSnapshot(detect(), bake, async () => new Response("denied", { status: 403 }), NOW), /403/);
  await assert.rejects(refreshRenameSnapshot(detect(), bake, async () => { throw new Error("offline"); }, NOW), /offline/);
  assert.equal(baked, null);
  await assert.rejects(refreshRenameSnapshot(detect(), async () => { throw new Error("bake failed"); }, fetcher(current), NOW), /bake failed/);
  assert.equal(calls, 4);
});

test("same-ID account rename accepts only a verified github-only signed operator PR", async () => {
  const f = accountRenameFixture(), inspect = () => inspectAccountRename(f.gh, f.pr, f.rock);
  assert.equal(onlyAccountLoginChanged(f.base, f.source), true);
  assert.equal((await inspect()).githubId, 185141343);
  assert.equal((await inspect()).newLogin, "Bitclank-Bill");
  f.account.login = "Bitcoin-Bill";
  await assert.rejects(inspect, /not verified/);
  f.account.login = "Bitclank-Bill";
  f.lookup = async (key) => ({ ...f.account, id: typeof key === "number" ? 185141343 : 123 });
  await assert.rejects(inspect, /not verified/);
  f.lookup = async () => { throw new Error("GitHub unavailable"); };
  await assert.rejects(inspect, /unavailable/);
  f.lookup = null; f.account.type = "Bot";
  await assert.rejects(inspect, /not verified/);
  f.account.type = "User"; f.pr.user.id = 123;
  await assert.rejects(inspect, /operator-authored/);
  f.pr.user = { ...OPERATORS[0], type: "User" }; f.permission = "write";
  await assert.rejects(inspect, /Maintain\/Admin/);
  f.permission = "admin"; f.signed = false;
  await assert.rejects(inspect, /signed operator/);
  f.signed = true; f.pr.head.repo.full_name = "someone/fork";
  await assert.rejects(inspect, /in this repository/);
});

test("same-ID account rename rejects mixed diffs, reverted code changes and stale PR heads", async () => {
  const f = accountRenameFixture(), inspect = () => inspectAccountRename(f.gh, f.pr, f.rock);
  const valid = f.source;
  f.source += "\n// unrelated edit\n";
  await assert.rejects(inspect, /only.*github line/);
  f.source = valid; f.diffFiles = [...f.revisionFiles, { filename: "README.md", status: "modified" }];
  await assert.rejects(inspect, /only.*github line/);
  f.diffFiles = null; f.revisionFiles.push({ filename: "worker/src/auth.js", status: "modified" });
  await assert.rejects(inspect, /signed operator/);
  f.revisionFiles.pop(); f.commits.unshift({ sha: "e".repeat(40) }); f.earlierSource = valid + "\n// reverted edit\n";
  await assert.rejects(inspect, /history contains another change/);
  f.commits.shift();
  f.lookup = async () => { f.pr = { ...f.pr, head: { ...f.pr.head, sha: "f".repeat(40) } }; return f.account; };
  await assert.rejects(inspect, /changed during verification/);
  assert.throws(() => checkOwner({ handle: "Bitcoin-Bill", github: "Bitclank-Bill" },
    { handle: "Bitcoin-Bill", github: "Bitcoin-Bill" }, OPERATORS[0].login, true), /separate maintainer-reviewed PR/);
});

test("verified account-rename checks pass without a second operator's approval and perform no bundle or merge writes", async () => {
  const f = accountRenameFixture(), coordinator = createCoordinator(f.gh, "private-app[bot]");
  const gate = () => f.calls.filter((call) => call.data?.context === "Character bundle safety").at(-1)?.data.state;
  assert.equal(await runAccountRenameChecks(coordinator, { action: "synchronize", pull_request: { number: 7 } }), true);
  assert.equal(gate(), "success");
  await runAccountRenameChecks(coordinator, { workflow_run: { event: "pull_request_review" } }); assert.equal(gate(), "success");
  await runAccountRenameChecks(coordinator, { schedule: "17,37,57 * * * *" }); assert.equal(gate(), "success");
  f.account.id = 123;
  await assert.rejects(() => coordinator.accountRename(7), /not verified/);
  assert.equal(gate(), "failure");
  f.account.id = 185141343; f.pr.user = { ...f.pr.user, login: "former-operator" };
  await assert.rejects(() => coordinator.refreshAccountRenames(), /operator-authored/);
  assert.equal(gate(), "failure");
  f.pr.user = { ...OPERATORS[0], type: "User" };
  assert.ok(f.calls.filter((call) => call.method && call.method !== "GET").every((call) => call.url.startsWith("statuses/")));
  const before = f.calls.filter((call) => call.method === "POST").length;
  f.account.id = 185141343; f.source = f.base.replace('display: "Bitclank Bill"', 'display: "Different display"');
  assert.equal(await coordinator.accountRename(7), false);
  assert.equal(f.calls.filter((call) => call.method === "POST").length, before);
});

test("rename refresh failures leave unidentified PR statuses untouched but identified renames fail closed", async () => {
  for (const scenario of ["timeout", "5xx", "truncated", "file", "declaration"]) {
    const f = accountRenameFixture(), api = f.gh.api, file = f.gh.file;
    // An ordinary code PR or bot bundle must keep its required statuses, even
    // when discovery fails before the refresh can tell which kind of PR it is.
    f.diffFiles = [{ filename: "README.md", status: "modified" }];
    if (scenario === "5xx") f.pr.user = { login: "private-app[bot]", type: "Bot" };
    f.gh.api = async (url, ...rest) => {
      if (url.startsWith("compare/")) {
        if (scenario === "timeout" || scenario === "5xx") throw new Error(`GitHub ${scenario}`);
        if (scenario === "truncated") return { merge_base_commit: { sha: f.rock }, files: Array(300).fill(f.diffFiles[0]) };
      }
      return api(url, ...rest);
    };
    if (scenario === "file" || scenario === "declaration") {
      f.diffFiles = null; f.source = f.base;
      f.gh.file = async (...args) => {
        if (scenario === "file") throw new Error("GitHub blob unavailable");
        return { ...await file(...args), source: "/* incomplete declaration" };
      };
    }
    const coordinator = createCoordinator(f.gh, "private-app[bot]");
    await assert.rejects(() => runAccountRenameChecks(coordinator, { schedule: "17,37,57 * * * *" }));
    assert.equal(f.calls.filter((call) => call.method === "POST").length, 0, scenario);
    f.gh.api = api; f.gh.file = file;
    if (scenario === "file" || scenario === "declaration") f.source = f.base;
    await coordinator.refreshAccountRenames();
    assert.equal(f.calls.filter((call) => call.method === "POST").length, 0, `${scenario} recovery`);
  }
  const f = accountRenameFixture(), coordinator = createCoordinator(f.gh, "private-app[bot]");
  f.lookup = async () => { throw new Error("GitHub unavailable after owner change identified"); };
  await assert.rejects(() => coordinator.refreshAccountRenames(), /unavailable/);
  assert.deepEqual(f.calls.filter((call) => call.method === "POST").map((call) => [call.data.context, call.data.state]),
    [["Character intake", "failure"], ["Character bundle safety", "failure"]]);
  f.lookup = null;
  await coordinator.refreshAccountRenames();
  assert.deepEqual(f.calls.filter((call) => call.method === "POST").slice(-2).map((call) => call.data.state), ["success", "success"]);
});

test("account lookup uses GitHub's ID and login endpoints without following supplied URLs", async () => {
  const calls = [], gh = createGitHub("example/land", "test-token", async (url, init) => {
    calls.push({ url, method: init.method }); return { ok: true, status: 200, json: async () => ({ id: 185141343 }) };
  });
  await gh.account(185141343); await gh.account("Bitclank-Bill");
  assert.deepEqual(calls, [{ url: "https://api.github.com/user/185141343", method: "GET" }, { url: "https://api.github.com/users/Bitclank-Bill", method: "GET" }]);
});

test("verified account rename refuses competing queued work and another character's login", async () => {
  const f = accountRenameFixture(), bot = "private-app[bot]", queueHead = "d".repeat(40);
  const bundle = { number: 9, state: "open", user: { login: bot }, base: { ref: "rock", repo: { full_name: f.repo } },
    head: { sha: queueHead, ref: "automation/characters-manual-test", repo: { full_name: f.repo } } };
  const api = f.gh.api, list = f.gh.list, file = f.gh.file;
  f.gh.api = async (url, ...rest) => url === "pulls/9" ? bundle
    : url === `commits/${queueHead}` ? { author: { login: bot }, commit: { verification: { verified: true } } } : api(url, ...rest);
  f.gh.list = async (url) => url === "pulls?state=open&base=rock" ? [f.pr, bundle] : list(url);
  f.gh.file = async (ref, path) => ref === queueHead ? { sha: queueHead, source: path === manifestPath("manual")
    ? JSON.stringify({ version: 1, lane: "manual", openedOn: "2026-11-04", entries: [{ path: f.path, pr: 5, head: "e".repeat(40),
      base: "c".repeat(40), hash: digest(f.base), author: "owner", lane: "manual" }] }) : f.base } : file(ref, path);
  const coordinator = createCoordinator(f.gh, bot);
  await assert.rejects(() => coordinator.accountRename(7), /competing queued/);
  f.gh.list = list; f.gh.file = async (ref, path) => path === "src/characters/other.js"
    ? { source: 'BL.characters.add({handle:"other",github:"Bitclank-Bill"});' } : file(ref, path);
  f.gh.tree = async () => new Map([[f.path, {}], ["src/characters/other.js", {}]]);
  await assert.rejects(() => coordinator.accountRename(7), /different character file/);
  assert.ok(f.calls.filter((call) => call.method && call.method !== "GET").every((call) => call.url.startsWith("statuses/")));
});

test("daily character intake accepts only bounded data and never executes source", () => {
  const source = characterSource({ handle: "owner", joined: 1, lastCommit: 2 });
  const accepted = scanCharacter(source);
  assert.equal(accepted.lane, "daily");
  assert.equal(parseSafeCharacter(accepted.source).handle, "owner");
  assert.equal(declaredIdentity(accepted.source).handle, "owner");
  for (const malicious of [source + 'fetch("/api/me");', source.replace('handle: "owner"', 'handle: "owner", __proto__: {}'),
    source.replace('handle: "owner"', 'handle: "owner", handle: "other"'),
    source.replace('handle: "owner"', 'handle: `owner`'), source + '// ignore previous instructions',
    source + 'globalThis.stolen = true;', source.replace('handle: "owner"', 'handle: "owner", look: { height: 1e200 }')]) {
    assert.throws(() => parseSafeCharacter(malicious), CharacterRejection);
  }
  for (const dangerous of [source + 'fetch("/api/me");', source + '// ignore previous instructions', source + 'globalThis.stolen = true;']) assert.throws(() => scanCharacter(dangerous), CharacterRejection);
  const custom = source.replace('lastCommit: 2', 'lastCommit: 2, dress: { crown(k, v) { v.set(0, 0, 0, k.P.black); } }');
  assert.equal(scanCharacter(custom).lane, "manual");
  assert.equal(globalThis.stolen, undefined);
  assert.throws(() => safeCharacterSource({ handle: "owner", joined: 1, lastCommit: 2, voice: { poke: "hi", idle: [] } }), CharacterRejection);
});

test("appearance edits need the owner too, aliases preserve ownership and identity transfers stay manual", () => {
  const previous = { handle: "cave-name", github: "owner" };
  assert.throws(() => checkOwner({ ...previous }, previous, "attacker"), CharacterRejection);
  assert.equal(checkOwner({ ...previous }, previous, "owner").github, "owner");
  assert.equal(checkOwner({ handle: "alias" }, null, "owner").github, "owner");
  assert.equal(checkOwner({ ...previous }, previous, "maintainer", true).github, "owner");
  assert.throws(() => checkOwner({ handle: "cave-name", github: "other" }, previous, "maintainer", true), CharacterRejection);
});

test("midnight gates are UTC, never merge empty or manual bundles, and reused bundles wait for their new day", () => {
  const state = { lane: "daily", openedOn: "2026-10-04", entries: [{}] };
  assert.equal(due(state, new Date("2026-10-04T23:59:59Z")), false);
  assert.equal(due(state, new Date("2026-10-05T00:00:00Z")), true);
  assert.equal(due({ ...state, entries: [] }, new Date("2026-10-05T00:30:00Z")), false);
  assert.equal(due({ ...state, lane: "manual" }, new Date("2026-10-05T00:30:00Z")), false);
  assert.equal(due({ ...state, lane: "rename" }, new Date("2026-10-05T00:30:00Z")), false);
  assert.equal(due({ ...state, openedOn: "2026-10-05" }, new Date("2026-10-05T00:30:00Z")), false);
  assert.throws(() => readManifest(JSON.stringify({ version: 1, lane: "daily", openedOn: "2026-10-04", entries: [{ path: "../auth.js" }] }), "daily"));
});

test("empty bundle identity checks pass only for validated placeholders and still reject reconciliation", async (t) => {
  const repo = "example/land", bot = "private-app[bot]", rock = "a".repeat(40), head = "b".repeat(40), blob = "c".repeat(40);
  const saved = Object.fromEntries(["GITHUB_REPOSITORY", "GITHUB_TOKEN", "CHARACTER_BOT_LOGIN"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: "test-token", CHARACTER_BOT_LOGIN: bot });
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let lane = "daily", verified = true, unexpected = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = url.slice(`https://api.github.com/repos/${repo}/`.length);
    const source = JSON.stringify({ version: 1, lane, openedOn: "2026-10-04", entries: [] });
    let data;
    if (path === "git/ref/heads/rock") data = { object: { sha: rock } };
    else if (path === "commits/merged") data = { parents: [{ sha: rock }] };
    else if (path === `git/trees/${head}?recursive=1`) data = { tree: [{ path: manifestPath(lane), type: "blob", mode: "100644", sha: blob, size: source.length }] };
    else if (path === `git/blobs/${blob}`) data = { encoding: "base64", size: source.length, content: Buffer.from(source).toString("base64") };
    else if (path === `commits/${head}`) data = { author: { login: bot }, commit: { verification: { verified } } };
    else if (path === `compare/${rock}...${head}`) data = { files: [{ filename: unexpected ? "worker/src/auth.js" : manifestPath(lane), status: "added" }] };
    else if (path === `git/trees/${rock}?recursive=1`) data = { tree: [] };
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(data));
  });
  for (lane of LANES) {
    const pr = { user: { login: bot }, head: { sha: head, ref: `automation/characters-${lane}-abc`, repo: { full_name: repo } },
      base: { ref: "rock", repo: { full_name: repo } }, merge_commit_sha: "merged" };
    assert.deepEqual(await checkCharacterIdentities(pr), []);
    await assert.rejects(checkCharacterIdentities(pr, true), /Empty character bundle/);
    verified = false;
    await assert.rejects(checkCharacterIdentities(pr), /not a verified commit/);
    verified = true;
    unexpected = true;
    await assert.rejects(checkCharacterIdentities(pr), /unexpected files/);
    unexpected = false;
  }
});

test("manual bundles require current-head operator approval and respect dismissal or requested changes", async () => {
  const pr = { number: 1, user: { login: "app[bot]" }, head: { sha: "current" } };
  const operator = { ...OPERATORS[0], type: "User" };
  let reviews = [{ user: operator, state: "APPROVED", commit_id: "old" }];
  const gh = { list: async () => reviews, api: async () => ({ role_name: "maintain" }) };
  assert.equal((await reviewDecision(gh, pr)).approved, false);
  reviews[0].commit_id = "current";
  assert.equal((await reviewDecision(gh, pr)).approved, true);
  reviews.push({ user: operator, state: "DISMISSED", commit_id: "current" });
  assert.equal((await reviewDecision(gh, pr)).approved, false);
  reviews = [{ user: { login: "writer" }, state: "APPROVED", commit_id: "current" }];
  assert.equal((await reviewDecision(gh, pr)).approved, false);
  reviews.push({ user: operator, state: "CHANGES_REQUESTED", commit_id: "current" });
  assert.equal((await reviewDecision(gh, pr)).changesRequested, true);
  for (const user of OPERATORS) assert.equal(isOperator({ ...user, type: "User" }), true);
  assert.equal(isOperator({ ...operator, id: 1 }), false);
  assert.equal(isOperator({ ...operator, type: "Bot" }), false);
  reviews = [{ user: { ...operator, id: 1 }, state: "APPROVED", commit_id: "current" }];
  assert.equal((await reviewDecision(gh, pr)).approved, false);
});

test("Actions-token merges explicitly dispatch the post-merge build and recover without duplicate dispatches", async () => {
  const bot = "github-actions[bot]", repo = "example/land", comments = [], calls = [];
  const pr = { number: 3, merged_at: "2026-10-05T00:00:00Z", merged_by: { login: bot }, merge_commit_sha: "a".repeat(40),
    user: { login: bot }, head: { ref: "automation/characters-daily-abc", repo: { full_name: repo } }, base: { repo: { full_name: repo } } };
  const gh = { repo, list: async () => comments, api: async (path, method, data) => {
    calls.push({ path, method, data });
    if (path === "issues/3/comments") comments.push({ user: { login: bot }, body: data.body });
  } };
  const coordinator = createCoordinator(gh, bot);
  await coordinator.deployMerged({ ...pr, merged_by: { login: "w-s-bitcoin" } });
  assert.equal(calls.length, 0); // Human merges already produce a push workflow.
  await coordinator.deployMerged(pr);
  await coordinator.deployMerged(pr);
  const dispatches = calls.filter((call) => call.path.endsWith("/dispatches"));
  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0].data, { ref: "rock", inputs: { merge_sha: pr.merge_commit_sha } });
  await createCoordinator(gh, "private-app[bot]").deployMerged({ ...pr, user: { login: "private-app[bot]" }, merged_by: { login: "private-app[bot]" } });
  assert.equal(calls.filter((call) => call.path.endsWith("/dispatches")).length, 1); // App merges already emit push events.
});

test("an otherwise validated overdue daily bundle never calls merge when conflicted or its mergeability is unknown", async () => {
  const bot = "github-actions[bot]", repo = "example/land", rock = "a".repeat(40), sourceHead = "b".repeat(40), head = "c".repeat(40);
  const path = "src/characters/owner.js", source = safeCharacterSource({ handle: "owner", joined: 1, lastCommit: 2 });
  const entry = { pr: 7, head: sourceHead, author: "owner", path, base: null, hash: digest(source), lane: "daily" };
  const state = { version: 1, lane: "daily", openedOn: "2026-10-03", entries: [entry] };
  const bundle = { number: 8, user: { login: bot }, mergeable: false, mergeable_state: "dirty",
    head: { sha: head, ref: "automation/characters-daily-round", repo: { full_name: repo } }, base: { ref: "rock", repo: { full_name: repo } } };
  let merges = 0;
  const gh = { repo, tree: async () => new Map(),
    list: async (url) => url.endsWith("/reviews") ? [] : [bundle],
    file: async (sha, filename) => sha === rock ? null : filename === manifestPath("daily") ? { source: JSON.stringify(state) } : { source, sha },
    api: async (url, method) => {
      if (url === "git/ref/heads/rock") return { object: { sha: rock } };
      if (url === "pulls/8") return bundle;
      if (url === "pulls/7") return { number: 7, state: "closed", user: { login: "owner" }, base: { ref: "rock" }, head: { sha: sourceHead } };
      if (url.startsWith("collaborators/")) return { permission: "read" };
      if (url.startsWith("statuses/")) return {};
      if (url === `commits/${head}`) return { author: { login: bot }, commit: { verification: { verified: true } } };
      if (url === `commits/${sourceHead}?per_page=100`) return { author: { login: "owner" }, parents: [{ sha: rock }], files: [{ filename: path, status: "added" }] };
      if (url.startsWith("compare/")) return { merge_base_commit: { sha: rock }, total_commits: 1, commits: [{ sha: sourceHead }], behind_by: 0,
        files: [{ filename: path, status: "added" }, ...(url.endsWith(head) ? [{ filename: manifestPath("daily"), status: "added" }] : [])] };
      if (url.endsWith("/merge") && method === "PUT") { merges++; return { merged: true }; }
      throw new Error(`Unexpected API call ${url}`);
    }
  };
  const coordinator = createCoordinator(gh, bot, () => new Date(NOW));
  await assert.rejects(coordinator.mergeDaily(), /not mergeable/);
  bundle.mergeable = null; bundle.mergeable_state = "unknown";
  await assert.rejects(coordinator.mergeDaily(), /not mergeable/);
  assert.equal(merges, 0);
});

test("the scanner checks earlier character revisions and extracts only character files from mixed PRs", async () => {
  const path = "src/characters/owner.js", head = "a".repeat(40), old = "b".repeat(40), rock = "c".repeat(40), base = "d".repeat(40);
  const source = characterSource({ handle: "owner", joined: 1, lastCommit: 2 });
  let poisoned = true, author = "owner", current = null;
  const gh = {
    list: async () => [{ sha: old }, { sha: head }],
    api: async (url) => {
      if (url === "pulls/7") return { number: 7, user: { login: "owner" }, base: { ref: "rock" }, head: { sha: head } };
      if (url.startsWith("collaborators/")) return { permission: "read" };
      if (url.startsWith("compare/")) return { merge_base_commit: { sha: base }, total_commits: 2, files: [{ filename: path, status: "added" }, { filename: "README.md", status: "modified" }] };
      if (url.startsWith("commits/")) return { author: { login: author }, parents: [{ sha: base }], files: [{ filename: path, status: "added" }] };
      throw new Error("Unexpected API call");
    },
    file: async (ref) => ref === base ? null : ref === rock ? current : { source: ref === old && poisoned ? source + 'fetch("/api/me");' : source, sha: ref }
  };
  await assert.rejects(inspectSubmission(gh, { pr: 7, head }, rock), CharacterRejection);
  poisoned = false;
  const accepted = await inspectSubmission(gh, { pr: 7, head }, rock);
  assert.equal(accepted.mixed, true);
  assert.deepEqual(accepted.entries.map((entry) => entry.path), [path]);
  assert.equal(accepted.entries[0].lane, "daily");
  current = { source: characterSource({ handle: "owner", joined: 1, lastCommit: 3 }), sha: "e".repeat(40) };
  await assert.rejects(inspectSubmission(gh, { pr: 7, head }, rock), /Character changed on rock/);
  current = null;
  author = "attacker";
  await assert.rejects(inspectSubmission(gh, { pr: 7, head }, rock), CharacterRejection);
});

const renameBase = `(() => {
  "use strict";
  const BL = window.BL;
  BL.characters.add({
    handle: "cave-name",
    github: "owner",
    joined: 1,
    lastCommit: 2,
    dress: { crown(k, v) { v.set(0, 0, 0, k.P.black); } }
  });
})();
`;
const renameSource = renameBase.replace('    handle: "cave-name",\n', '    handle: "cave-name",\n    display: "owner",\n');

test("independent GitHub display renames preserve every non-display byte and literal identity", () => {
  assert.equal(isGitHubDisplayRename(renameBase, renameSource), true);
  assert.equal(isGitHubDisplayRename(renameSource.replace('display: "owner"', 'display: "Old Name"'), renameSource), true);
  for (const source of [renameBase, renameSource + "\n", renameSource.replace('github: "owner"', 'github: "other"'),
    renameSource.replace('handle: "cave-name"', 'handle: "other"'), renameSource.replace('lastCommit: 2', 'lastCommit: 3'),
    renameSource.replace('k.P.black', 'k.P.white'), renameSource.replace('display: "owner"', 'display: "someone-else"'),
    renameSource.replace('display: "owner"', 'display: ("owner")'), renameSource.replace('display: "owner"', 'display: "owner", display: "owner"'),
    renameSource.replace('    display:', '  display:'), renameSource.replace('display: "owner"', 'display: `owner`'),
    renameSource.replace('display: "owner"', 'display: "ow\\ner"'), renameSource.replace('display: "owner"', 'display: call()'),
    renameSource.replace('dress:', '/* BL.characters.add({ */ dress:')]) assert.equal(isGitHubDisplayRename(renameBase, source), false);
  assert.equal(isGitHubDisplayRename(renameSource, renameBase), false);
  assert.equal(isGitHubDisplayRename(null, renameSource), false);
  assert.equal(isGitHubDisplayRename(renameBase.replace('    github: "owner",\n', ''), renameSource.replace('    github: "owner",\n', '').replace('display: "owner"', 'display: "cave-name"')), true);
});

test("rename intake requires immutable operator authority and cosmetic-only history", async () => {
  const rock = "a".repeat(40), head = "b".repeat(40), old = "c".repeat(40), path = "src/characters/cave-name.js";
  let user = { ...OPERATORS[0], type: "User" }, permission = "admin", earlier = false;
  const gh = {
    list: async () => [...(earlier ? [{ sha: old }] : []), { sha: head }],
    api: async (url) => {
      if (url === "pulls/7") return { number: 7, user, base: { ref: "rock" }, head: { sha: head } };
      if (url.startsWith("collaborators/")) return { permission };
      if (url.startsWith("compare/")) return { merge_base_commit: { sha: rock }, total_commits: earlier ? 2 : 1, files: [{ filename: path, status: "modified" }] };
      if (url.startsWith("commits/")) return { author: user, parents: [{ sha: earlier && url.includes(head) ? old : rock }], files: [{ filename: path, status: "modified" }] };
      throw new Error(`Unexpected request ${url}`);
    },
    file: async (ref) => ({ sha: ref, source: ref === rock ? renameBase : ref === old ? renameBase.replace('lastCommit: 2', 'lastCommit: 3') : renameSource })
  };
  const lane = async () => (await inspectSubmission(gh, { pr: 7, head }, rock)).entries[0].lane;
  assert.equal(await lane(), "rename");
  user.id = 1; assert.equal(await lane(), "manual");
  user = { ...OPERATORS[0], type: "Bot" }; assert.equal(await lane(), "manual");
  user = { ...OPERATORS[0], type: "User" }; earlier = true; assert.equal(await lane(), "manual");
  earlier = false; user = { login: "owner", id: 42, type: "User" }; permission = "read";
  assert.equal(await lane(), "manual");
  user = { ...OPERATORS[0], type: "User" };
  await assert.rejects(lane, /Only the GitHub owner/);
});

test("rename migration preserves held custom submissions, revalidates provenance and requires fresh approval", async () => {
  const repo = "example/land", bot = "private-app[bot]", rock = "a".repeat(40), sourceHead = "b".repeat(40);
  const user = { ...OPERATORS[0], type: "User" }, path = "src/characters/cave-name.js", heldPath = "src/characters/held.js";
  const heldSource = safeCharacterSource({ handle: "held", joined: 1, lastCommit: 2 });
  const held = { pr: 9, head: "c".repeat(40), author: "held", path: heldPath, base: null, hash: digest(heldSource), lane: "manual" };
  const old = { pr: 6, head: "d".repeat(40), author: user.login, path, base: rock, hash: digest(renameSource), lane: "manual" };
  const files = new Map([[rock, new Map([[path, { source: renameBase, sha: rock }]])], [sourceHead, new Map([[path, { source: renameSource, sha: sourceHead }]])]]);
  const prs = LANES.map((lane, i) => {
    const head = String(i + 1).repeat(40), state = { version: 1, lane, openedOn: "2026-10-04", entries: lane === "manual" ? [held, old] : [] };
    files.set(head, new Map([[manifestPath(lane), { source: JSON.stringify(state) }],
      ...(lane === "manual" ? [[path, { source: renameSource }], [heldPath, { source: heldSource }]] : [])]));
    return { number: i + 1, state: "open", user: { login: bot }, head: { sha: head, ref: `automation/characters-${lane}-round`, repo: { full_name: repo } }, base: { ref: "rock", repo: { full_name: repo } } };
  });
  const sourcePr = { number: 7, state: "open", user, head: { sha: sourceHead, ref: "rename", repo: { full_name: repo } }, base: { ref: "rock", repo: { full_name: repo } } };
  const writes = [], statuses = new Map(); let sequence = 10, reviews = [];
  const gh = { repo,
    tree: async () => files.get(rock),
    file: async (sha, name) => files.get(sha)?.get(name) || null,
    list: async (url) => url.endsWith("/commits") ? [{ sha: sourceHead }] : url.endsWith("/reviews") ? reviews : url.endsWith("/comments") ? [] : prs,
    commit: async (branch, expected, additions, deletions) => {
      const pr = prs.find(row => row.head.ref === branch); assert.equal(pr.head.sha, expected);
      assert.deepEqual(deletions, []); const next = new Map(files.get(expected));
      for (const file of additions) next.set(file.path, { source: file.source });
      const sha = String(sequence++).padStart(40, "0"); files.set(sha, next); pr.head.sha = sha;
      writes.push({ branch, additions }); return sha;
    },
    api: async (url, method, data) => {
      if (url === "git/ref/heads/rock") return { object: { sha: rock } };
      if (url.startsWith("collaborators/")) return { permission: "admin" };
      if (url.startsWith("statuses/")) { statuses.set(url + ":" + data.context, data.state); return {}; }
      if (url.endsWith("/comments")) return {};
      if (/^pulls\/\d+$/.test(url)) { const pr = Number(url.split("/")[1]) === 7 ? sourcePr : prs.find(row => row.number === Number(url.split("/")[1])); if (method === "PATCH") Object.assign(pr, data); return pr; }
      if (url === `commits/${sourceHead}?per_page=100`) return { author: user, parents: [{ sha: rock }], files: [{ filename: path, status: "modified" }] };
      if (url.startsWith("commits/")) return { author: { login: bot }, commit: { verification: { verified: true } } };
      if (url.startsWith("compare/")) {
        const sha = url.split("...")[1];
        return { behind_by: 0, merge_base_commit: { sha: rock }, total_commits: 1, commits: [{ sha: sourceHead }],
          files: [...files.get(sha)].filter(([name, file]) => file.source !== files.get(rock).get(name)?.source)
            .map(([filename]) => ({ filename, status: filename === path ? "modified" : "added" })) };
      }
      throw new Error(`Unexpected request ${url}`);
    }
  };
  const coordinator = createCoordinator(gh, bot, () => new Date(NOW));
  const manual = prs[1], rename = prs[2], queued = files.get(manual.head.sha).get(path);
  queued.source += "\n";
  await assert.rejects(coordinator.intake({ pr: 7, head: sourceHead }), /differs from its verified source/);
  assert.equal(writes.length, 0);
  queued.source = renameSource;
  await coordinator.intake({ pr: 7, head: sourceHead });
  const manualFiles = files.get(manual.head.sha), renameFiles = files.get(rename.head.sha);
  assert.deepEqual(JSON.parse(manualFiles.get(manifestPath("manual")).source).entries, [held]);
  assert.equal(manualFiles.get(heldPath).source, heldSource);
  assert.equal(manualFiles.get(path).source, renameBase);
  assert.equal(renameFiles.get(path).source, renameSource);
  assert.equal(JSON.parse(renameFiles.get(manifestPath("rename")).source).entries[0].head, sourceHead);
  assert.equal(sourcePr.state, "closed");
  const gate = () => statuses.get(`statuses/${rename.head.sha}:Character bundle safety`);
  assert.equal(gate(), "pending");
  reviews = [{ user, state: "APPROVED", commit_id: "old" }];
  await coordinator.intake({ pr: rename.number }); assert.equal(gate(), "pending");
  reviews[0].commit_id = rename.head.sha;
  await coordinator.intake({ pr: rename.number }); assert.equal(gate(), "success");
  reviews[0].state = "CHANGES_REQUESTED";
  // The held submission's source is deliberately unavailable in this fixture.
  // Report its failed validation while still refreshing the rename gate.
  await assert.rejects(coordinator.refreshReviews()); assert.equal(gate(), "pending");
  assert.equal(writes.length, 2);
});

test("queued custom identities reserve defaults without executing source and require trusted provenance", async () => {
  const repo = "example/land", bot = "private-app[bot]", head = "a".repeat(40), path = "src/characters/cave-name.js";
  const source = 'throw new Error("Never execute me"); BL.characters.add({ handle: "cave-name", github: "owner", dress: { eyes(k, v) {} } });';
  const entry = { pr: 7, head: "b".repeat(40), author: "owner", path, base: null, hash: digest(source), lane: "manual" };
  const state = { version: 1, lane: "manual", openedOn: "2026-10-04", entries: [entry] };
  const pr = { number: 8, state: "open", user: { login: bot }, head: { sha: head, ref: "automation/characters-manual-round", repo: { full_name: repo } },
    base: { ref: "rock", repo: { full_name: repo } } };
  let verified = true, savedSource = source;
  const gh = { repo, list: async () => [pr, { ...pr, user: { login: "other" } }],
    api: async (url) => {
      if (url === "pulls/8") return pr;
      if (url === `commits/${head}`) return { author: { login: bot }, commit: { verification: { verified } } };
      throw new Error(`Unexpected API call ${url}`);
    },
    file: async (sha, filename) => {
      assert.equal(sha, head);
      if (filename === manifestPath("manual")) return { source: JSON.stringify(state) };
      if (filename === path) return { source: savedSource };
      throw new Error(`Unexpected queued file ${filename}`);
    }
  };
  assert.deepEqual(await queuedCharacters(gh, bot), [{ path, base: null, character: { handle: "cave-name", github: "owner" } }]);
  verified = false;
  await assert.rejects(queuedCharacters(gh, bot));
  verified = true; savedSource += "\n// changed after scanning\n";
  await assert.rejects(queuedCharacters(gh, bot));
});

test("empty placeholders migrate to the scoped App without duplication, never merge empty, and reopen after merging", async () => {
  let bot = BOT, unexpected = false;
  const repo = "example/land", refs = new Map([["rock", "1".repeat(40)]]), files = new Map(), authors = new Map(), prs = [];
  let sequence = 2, mergeCalls = 0;
  const gh = {
    repo,
    list: async (path) => path.includes("state=closed") ? [] : prs.filter((pr) => pr.state === "open"),
    tree: async () => new Map(),
    file: async (sha, path) => files.get(`${sha}:${path}`) || null,
    commit: async (branch, expected, additions) => {
      assert.equal(refs.get(branch), expected);
      const sha = String(sequence++).padStart(40, "0"); refs.set(branch, sha);
      authors.set(sha, bot);
      for (const file of additions) files.set(`${sha}:${file.path}`, { source: file.source, sha });
      return sha;
    },
    api: async (path, method, data) => {
      if (path.startsWith("git/ref/heads/")) { const sha = refs.get(decodeURIComponent(path.slice(14))); return sha ? { object: { sha } } : null; }
      if (path === "git/refs") { refs.set(data.ref.slice(11), data.sha); return { object: { sha: data.sha } }; }
      if (path === "pulls" && method === "POST") {
        const pr = { number: prs.length + 1, state: "open", user: { login: bot }, head: { ref: data.head, sha: refs.get(data.head), repo: { full_name: repo } }, base: { ref: "rock", repo: { full_name: repo } } };
        prs.push(pr); return pr;
      }
      if (/^pulls\/\d+$/.test(path)) {
        const pr = prs.find((pr) => pr.number === Number(path.split("/")[1]));
        pr.head.sha = refs.get(pr.head.ref); return pr;
      }
      if (path.startsWith("commits/")) return { author: { login: authors.get(path.slice(8)) }, commit: { verification: { verified: true } } };
      if (path.startsWith("compare/")) {
        const sha = path.split("...")[1], lane = files.has(`${sha}:${manifestPath("daily")}`) ? "daily" : "manual";
        return { files: [{ filename: manifestPath(lane), status: "added" }, ...(unexpected ? [{ filename: "unsafe.js", status: "added" }] : [])] };
      }
      if (path.endsWith("/merge")) { mergeCalls++; throw new Error("Empty bundle must never merge"); }
      throw new Error(`Unexpected API call ${path}`);
    }
  };
  let coordinator = createCoordinator(gh, bot, () => new Date(NOW));
  const daily = await coordinator.ensure("daily"), manual = await coordinator.ensure("manual");
  assert.notEqual(daily.number, manual.number);
  assert.equal((await coordinator.ensure("daily")).number, daily.number);
  bot = "private-app[bot]";
  coordinator = createCoordinator(gh, bot, () => new Date(NOW));
  unexpected = true;
  await assert.rejects(coordinator.ensure("daily"), /unexpected files/);
  unexpected = false;
  for (const lane of ["daily", "manual"]) {
    const adopted = await coordinator.ensure(lane);
    assert.equal(authors.get(adopted.head.sha), bot);
  }
  assert.equal(prs.length, 2);
  await coordinator.mergeDaily();
  assert.equal(mergeCalls, 0);
  manual.state = "closed"; refs.set("rock", "f".repeat(40));
  const nextManual = await coordinator.ensure("manual");
  assert.notEqual(nextManual.number, manual.number);
  assert.equal((await coordinator.ensure("daily")).number, daily.number);
});

test("confirmed aliases roll up across stats without increasing event totals or granting the alias an identity", () => {
  const normalize = globalThis.BL.contributorIdentities.normalizeStats;
  const a = "email:bdb4923572c8ac13", b = "email:56537ddd43347582";
  const raw = snapshot(person("MrHodlX", { counts: { commits: 302 }, weekly: [{ week: "2026-W35", commits: 10 }] }),
    person(a, { counts: { commits: 4 }, weekly: [{ week: "2026-W35", commits: 4 }], type: "Bot" }),
    person(b, { counts: { commits: 1 }, weekly: [{ week: "2026-W34", commits: 1 }], first_seen_at: "2026-08-25T00:00:00Z", last_seen_at: "2026-10-04T11:30:00Z" }),
    person("claude", { counts: { commits: 14 } }));
  raw.totals = { contributors: 4, commits: 321 };
  raw.leaderboards = { commits: raw.contributors.map((row) => ({ login: row.login, count: row.counts.commits })) };
  raw.repos = [{ name: "entropylab", totals: { contributors: 2, commits: 10 },
    contributors: [{ login: "MrHodlX", last_seen_at: "2026-10-04T10:00:00Z" }, { login: a, last_seen_at: "2026-10-04T11:00:00Z" }],
    leaderboards: { commits: [{ login: "MrHodlX", count: 6 }, { login: a, count: 4 }] }, weekly: [{ week: "2026-W35", commits: 10 }] }];
  raw.recent = [{ login: a, repo: "entropylab", type: "commit", occurred_at: "2026-10-04T11:00:00Z" },
    { login: a, repo: "entropylab", type: "commit", occurred_at: "2026-10-04T11:00:00Z" }];
  const before = JSON.stringify(raw), result = normalize(raw, NOW);
  const owner = result.contributors.find((row) => row.login === "MrHodlX");
  assert.equal(owner.counts.commits, 307);
  assert.deepEqual(owner.attributed_logins, [b, a].sort());
  assert.equal(owner.first_seen_at, "2026-08-25T00:00:00.000Z");
  assert.equal(owner.last_seen_at, "2026-10-04T11:30:00.000Z");
  assert.deepEqual(owner.weekly.map((row) => row.commits), [1, 14]);
  assert.equal(owner.type, undefined);
  assert.equal(result.totals.commits, 321);
  assert.equal(result.totals.contributors, 2);
  assert.equal(result.leaderboards.commits[0].count, 307);
  assert.equal(result.repos[0].leaderboards.commits[0].count, 10);
  assert.equal(result.repos[0].contributors.length, 1);
  assert.equal(result.repos[0].contributors[0].last_seen_at, "2026-10-04T11:00:00.000Z");
  assert.deepEqual(result.repos[0].weekly, raw.repos[0].weekly);
  assert.equal(result.recent.length, 2);
  assert.ok(result.recent.every((row) => row.login === "MrHodlX"));
  assert.equal(result.contributors.find((row) => row.login === "claude").counts.commits, 14);
  assert.equal(normalize(result, NOW), result);
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(contributorRows(raw, NOW).map((row) => row.handle), ["mrhodlx"]);
  const alone = normalize(snapshot(person(a)), NOW);
  assert.equal(alone.contributors[0].login, "MrHodlX");
  const harry = normalize(snapshot(person("Harry"), person("hotpixelgroup")), NOW);
  assert.deepEqual(harry.contributors.map((row) => row.login), ["hotpixelgroup"]);
  assert.equal(harry.contributors[0].counts.commits, 2);
  assert.deepEqual(contributorRows(harry, NOW).map((row) => row.handle), ["hotpixelgroup"]);
});

test("onboarding rejects bot aliases, unresolved identities, malformed dates and stale snapshots", () => {
  const rows = contributorRows(snapshot(person("New-Ooga"), person("NEW-OOGA"), person("robotics-human"),
    person("claude"), person("CODEX"), person("dependabot[bot]"), person("email:123"), person("../x"),
    person("machine", { type: "Bot" }), person("automation", { is_bot: true }), person("bad--login"),
    person("comments-only", { counts: { commits: 0, comments: 50, prs: 3, reviews: 2 } }),
    person("unknown-count", { counts: null }), person("string-count", { counts: { commits: "1" } }),
    person("future", { last_seen_at: "2027-01-01T00:00:00Z" }), person("no-date", { first_seen_at: null })), NOW);
  assert.deepEqual(rows.map((row) => row.handle), ["new-ooga", "robotics-human"]);
  assert.equal(rows[0].joined, Date.parse("2026-09-01T00:00:00Z") / 1000);
  assert.throws(() => contributorRows(snapshot(person("new-ooga")), NOW + 86400001));
  assert.throws(() => contributorRows({ ...snapshot(), meta: { org: "elsewhere", schema_version: 3 } }, NOW));
});

test("queued and just-merged custom characters reserve their handles and GitHub aliases against defaults", () => {
  const existing = [{ handle: "cave-name", github: "GitHub-Owner", look: { bald: true } }, { handle: "Another" }];
  const pending = [{ path: "src/characters/queued-alias.js", base: null, character: { handle: "Queued-Alias", github: "Waiting-Owner" } }];
  const rows = contributorRows(snapshot(person("github-owner"), person("CAVE-NAME"), person("another"), person("queued-alias"), person("waiting-owner"), person("new-ooga")), NOW);
  const missing = missingCharacters(rows, existing, pending);
  assert.deepEqual(missing.map((row) => row.handle), ["new-ooga"]);
  assert.equal(missingCharacters(rows, [...existing, ...missing], pending).length, 0);
  const collected = [];
  runInNewContext(characterSource(missing[0]), { window: { BL: { characters: { add: (row) => collected.push(row) } } } });
  assert.equal(collected[0].handle, "new-ooga");
  assert.equal(collected[0].joined, missing[0].joined);
  assert.equal(declaredIdentity(characterSource(missing[0])).handle, "new-ooga");
  assert.deepEqual(existing[0].look, { bald: true });
  const alias = { handle: "harry", joined: 1, lastCommit: 2 }, owner = { handle: "hotpixelgroup", joined: 1, lastCommit: 2 };
  const source = characterSource(alias), sourceFor = (file) => file === "harry.js" ? source : null;
  assert.deepEqual(retiredCharacters([alias, owner], sourceFor), [{ file: "harry.js", source }]);
  assert.deepEqual(retiredCharacters([alias], sourceFor), []);
  assert.deepEqual(retiredCharacters([alias, owner], () => source + "// Custom profile\n"), []);
});

test("queued additions retire only exact untouched generated defaults for their reserved identities", () => {
  const source = characterSource({ handle: "new-ooga", joined: 1, lastCommit: 2 });
  const entry = { path: "src/characters/new-ooga.js", base: null, character: { handle: "NEW-OOGA", github: "New-Ooga" } };
  const sourceFor = (file) => file === "new-ooga.js" ? source : null;
  assert.deepEqual(queuedDefaults([entry], sourceFor), [{ file: "new-ooga.js", source }]);
  for (const other of [
    { ...entry, base: "a".repeat(40) },
    { ...entry, character: { handle: "another", github: "another-owner" } }
  ]) assert.deepEqual(queuedDefaults([other], sourceFor), []);
  // Intake can reserve an alias after a build generated its owner's default.
  const alias = { ...entry, path: "src/characters/cave-name.js", character: { handle: "cave-name", github: "new-ooga" } };
  assert.deepEqual(queuedDefaults([alias, entry], sourceFor), [{ file: "new-ooga.js", source }]);
  assert.deepEqual(queuedDefaults([{ ...alias, base: "a".repeat(40) }], sourceFor), []);
  assert.deepEqual(queuedDefaults([entry], (file) => file === "new-ooga.js" ? characterSource({ handle: "another", joined: 1, lastCommit: 2 }) : null), []);
  for (const custom of [null, "not a character", source + "// Custom profile\n",
    source.replace("lastCommit: 2", 'lastCommit: 2, look: { skin: "#123456" }')]) {
    assert.deepEqual(queuedDefaults([entry], () => custom), []);
  }
});

test("a single aliased profile gains github; explicit mappings and ambiguous batches are preserved", () => {
  const row = (file, handle, github) => ({ file, character: { handle, ...(github ? { github } : {}) } });
  assert.equal(identityAdvice([row("cave-name.js", "cave-name")], ["src/characters/cave-name.js"], "real-owner")[0].github, "real-owner");
  assert.equal(identityAdvice([row("Real-Owner.js", "Real-Owner")], ["src/characters/Real-Owner.js"], "real-owner")[0].mismatch, false);
  const explicit = identityAdvice([row("cave-name.js", "cave-name", "real-owner")], ["src/characters/cave-name.js"], "maintainer")[0];
  assert.equal(explicit.github, null);
  assert.equal(explicit.login, "real-owner");
  const batch = [row("one.js", "one"), row("two.js", "two")];
  assert.ok(identityAdvice(batch, batch.map((r) => `src/characters/${r.file}`), "maintainer").every((r) => r.missing));
  const occupied = [row("alias.js", "alias"), row("owner.js", "owner", "real-owner")];
  assert.equal(identityAdvice(occupied, ["src/characters/alias.js"], "real-owner")[0].missing, true);
  const maintained = identityAdvice([row("new-owner.js", "new-owner")], ["src/characters/new-owner.js"], "maintainer", true)[0];
  assert.equal(maintained.login, "new-owner");
  assert.equal(maintained.github, null);
  assert.equal(maintained.missing, false);
});

test("identity declarations are read without executing PR code and owners cannot impersonate or transfer profiles", () => {
  const source = 'throw new Error("Never execute me"); BL.characters.add({ handle: "alias", github: "owner", dress: { eyes(k, v) { return { a: 1 }; } } });';
  const identity = declaredIdentity(source);
  assert.deepEqual(identity, { handle: "alias", github: "owner" });
  assert.equal(mayAuthorIdentity("owner", identity, null, false), true);
  assert.equal(mayAuthorIdentity("attacker", identity, null, false), false);
  assert.equal(mayAuthorIdentity("maintainer", identity, null, true), true);
  assert.equal(mayAuthorIdentity("attacker", { handle: "alias", github: "attacker" }, identity, false), false);
  assert.equal(mayAuthorIdentity("owner", { handle: "new-alias", github: "owner" }, identity, false), true);
  for (const body of ['handle: "one", github: "two", github: "one"', 'handle: login', 'handle: "one", ...other', 'handle: "one", [key]: "two"', 'get handle() { return "one"; }']) {
    assert.throws(() => declaredIdentity(`BL.characters.add({ ${body} });`));
  }
  // The established custom profiles remain legal under the declarative reader.
  for (const name of readdirSync(new URL("../../src/characters/", import.meta.url)).filter((name) => name.endsWith(".js"))) {
    assert.ok(declaredIdentity(readFileSync(new URL(`../../src/characters/${name}`, import.meta.url), "utf8")).handle);
  }
});

test("signed-in lookups coalesce requests and bound last-good identities by snapshot age through outages", async () => {
  let now = NOW, calls = 0, fail = false, present = true;
  const lookup = createContributorLookup(async () => {
    calls++;
    if (fail) throw new Error("offline");
    return Response.json({ ...snapshot(...present ? [person("new-ooga")] : []), meta: { ...snapshot().meta, generated_at: new Date(now).toISOString() } });
  }, () => now);
  const results = await Promise.all([lookup("new-ooga"), lookup("NEW-OOGA"), lookup("visitor")]);
  assert.equal(calls, 1);
  assert.equal(results[0].handle, "new-ooga");
  assert.equal(results[1].handle, "new-ooga");
  assert.equal(results[2], null);
  now += 60001; fail = true;
  assert.equal((await lookup("new-ooga")).handle, "new-ooga");
  assert.equal(await lookup("visitor"), null);
  assert.equal(calls, 2);
  now = NOW + 86400000;
  assert.equal(await lookup("new-ooga"), null, "last-good rows cannot outlive the original snapshot");
  now = NOW + 86415001; fail = false;
  assert.equal((await lookup("new-ooga")).handle, "new-ooga");
  now += 60001; present = false;
  assert.equal(await lookup("new-ooga"), null, "a successful refresh removes an absent identity immediately");
  now += 60001; fail = true;
  assert.equal(await lookup("new-ooga"), null, "an outage cannot resurrect an identity removed by a successful refresh");
});

test("sign-in belongs to the bundled GitHub owner, never an account named after their alias", async () => {
  let requests = 0;
  const lookup = createOwnedCharacterLookup([{ handle: "Cave-Name", github_login: "real-owner",
    joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-04T11:00:00Z" }], async () => {
    requests++;
    return { handle: "cave-name", joined: 1, lastCommit: 2 };
  });
  assert.deepEqual(await lookup("REAL-OWNER"), { handle: "Cave-Name", joined: 1788220800, lastCommit: 1791111600 });
  assert.equal(await lookup("cave-name"), null, "a valid dynamic row cannot shadow a bundled alias");
  assert.equal(requests, 0, "bundled ownership and occupied aliases need no Oogatron request");
});

test("only verified commit contributors gain temporary access; outages retain only recent verified rows and preserve bundled owners", async () => {
  let now = NOW, fail = false, calls = 0;
  const dynamic = createContributorLookup(async () => {
    calls++;
    if (fail) throw new Error("offline");
    return Response.json(snapshot(person("new-ooga"), person("issue-author", { counts: { commits: 0, issues: 2, prs: 1 } })));
  }, () => now);
  const lookup = createOwnedCharacterLookup([{ handle: "Cave-Name", github_login: "real-owner",
    joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-04T11:00:00Z" }], dynamic);
  assert.equal((await lookup("new-ooga")).handle, "new-ooga");
  assert.equal(await lookup("issue-author"), null);
  assert.equal(await lookup("visitor"), null);
  fail = true; now += 60001;
  assert.equal((await lookup("real-owner")).handle, "Cave-Name");
  assert.equal(calls, 1, "bundled owner never refreshes dynamic data");
  assert.equal((await lookup("new-ooga")).handle, "new-ooga");
  assert.equal(await lookup("visitor"), null);
  now = NOW + 86400000;
  assert.equal(await lookup("new-ooga"), null);
  assert.equal((await lookup("REAL-OWNER")).handle, "Cave-Name");
  assert.equal(calls, 3);
});

test("the browser accepts one matching temporary identity without reordering the bundled crew", () => {
  const context = { window: {}, URLSearchParams, location: { search: "" } };
  for (const name of ["math", "characters", "contributor-identities", "activity-repos"]) runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), "utf8"), context);
  const BL = context.window.BL;
  BL.characters.add({ handle: "alias", github: "owner", joined: 1, lastCommit: 2 });
  runInNewContext(readFileSync(new URL("../../src/js/contributors.js", import.meta.url), "utf8"), context);
  const c = BL.contributors, row = { handle: "new-ooga", joined: 1, lastCommit: 2 };
  assert.equal(c.addTemporary(row, "somebody-else"), false);
  assert.equal(c.addTemporary({ ...row, handle: "owner" }, "owner"), false);
  assert.equal(c.addTemporary(row, "NEW-OOGA"), true);
  assert.equal(c.addTemporary({ ...row, handle: "second" }, "second"), false);
  assert.equal(c.roster[0].name, "alias");
  assert.equal(c.roster.length, 2);
  assert.equal(c.activeRoster[1].temporary, true);
  assert.equal(BL.characters.get("new-ooga").temporary, true);
});


test("verified numeric owner keeps the custom character across renames; old-login claimants fail closed", async () => {
  const lookup = createOwnedCharacterLookup([{ handle: "Bitcoin-Bill", github_login: "Bitcoin-Bill",
    joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-04T11:00:00Z" }], async () => { throw new Error("Pinned identity must not consult fallback"); });
  for (const login of ["Bitcoin-Bill", "Bitclank-Bill", "BITCLANK-BILL"])
    assert.equal((await lookup(login, 185141343)).handle, "Bitcoin-Bill");
  assert.equal(await lookup("Bitcoin-Bill", 99), null);
  assert.equal(await lookup("Bitcoin-Bill"), null);
});

test("cutover preparation emits nothing until both GitHub lookups verify the renamed numeric account", async () => {
  const { prepareAccountMigration } = await import("../../scripts/account-migration.mjs");
  const input = { id:42, oldLogin:"old-name", newLogin:"new-name", lastOldAt:"2026-11-01T00:00:00.000Z" }, now = Date.parse("2026-11-02T00:00:00Z");
  await assert.rejects(prepareAccountMigration(input,async () => Response.json({ id:42,login:"old-name" }),now),/not verified/);
  await assert.rejects(prepareAccountMigration(input,async url => Response.json({ id:url.includes("user/42")?42:99,login:"new-name" }),now),/different account/);
  const result = await prepareAccountMigration(input,async () => Response.json({ id:42,login:"new-name" }),now);
  assert.equal(result.sql.oogaboogaland.length,2);
  assert.ok(result.sql.oogaboogaland[0].includes("WHERE id=42 AND lower(login)='old-name'"));
  assert.ok(result.sql.oogatron[0].includes(input.lastOldAt));
  await assert.rejects(prepareAccountMigration({ ...input,lastOldAt:"2027-01-01T00:00:00.000Z" },async () => assert.fail(),now),/ISO UTC/);
});


test("activity and public labels use the current owner login, never a reused permanent art handle", () => {
  const context = { window: {}, URLSearchParams, location: { search: "" } };
  for (const name of ["math", "characters", "contributor-identities", "activity-repos"])
    runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), "utf8"), context);
  const BL = context.window.BL;
  BL.characters.add({ handle: "Bitcoin-Bill", github: "Bitclank-Bill", display: "Bill", joined: 1, lastCommit: 2 });
  runInNewContext(readFileSync(new URL("../../src/js/contributors.js", import.meta.url), "utf8"), context);
  assert.equal(BL.characters.get("Bitcoin-Bill").handle, "Bitcoin-Bill", "art references stay stable");
  assert.equal(BL.characters.ownedBy("bitcoin-bill"), null);
  assert.equal(BL.characters.displayOfLogin("bitcoin-bill"), "bitcoin-bill");
  assert.equal(BL.characters.displayOfLogin("BITCLANK-BILL"), "Bill");
  const c = BL.contributors, before = c.roster[0].lastCommitAt;
  assert.equal(c.applySnapshot(snapshot(person("Bitcoin-Bill")), NOW), 0);
  assert.equal(c.roster[0].lastCommitAt, before);
  assert.equal(c.roster[0].lastContributionAt, 0);
  assert.equal(c.applySnapshot(snapshot(person("Bitclank-Bill")), NOW), 1);
  assert.equal(c.roster[0].lastCommitAt, Date.parse(person("Bitclank-Bill").last_seen_at));
  assert.equal(c.roster[0].lastContributionAt, c.roster[0].lastCommitAt);
});
