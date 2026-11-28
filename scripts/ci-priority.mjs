// Release-first admission and recovery. Only GitHub metadata is read; recovery
// never downloads PR code, artifacts or logs and never starts a deployment.
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFER_STEP = "Yield to release work";
export const UNIT_STATUS = "Unit · the browser-free lane";
const UNIT_STEPS = ["Run the unit lane", "Build and stage site", "Install Worker dependencies", "Worker checks"];
const runURL = (repo, run) => `https://github.com/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}`;
const deferredJob = (job, conclusion) => job.conclusion === conclusion
  && job.steps?.some(step => step.name === "Inspect release priority" && step.conclusion === "success")
  && job.steps.some(step => step.name === DEFER_STEP && step.conclusion === conclusion)
  && job.steps.every(step => step.conclusion !== "failure" || conclusion === "failure" && step.name === DEFER_STEP);
const ACTIVE = ["in_progress", "queued", "pending", "waiting", "requested"];
const WORKFLOWS = ["tests.yml", "character-bundles.yml"];
const MAX_ATTEMPTS = 4; // Initial run plus at most three automatic retries.
const pathOf = (name) => `.github/workflows/${name}`;

export const isRelease = (run) => {
  if (run.status === "completed") return false;
  if (run.path === pathOf("pages.yml")) return run.head_branch === "rock" && ["push", "workflow_dispatch"].includes(run.event);
  if (run.path === pathOf("cloudflare-production.yml")) return run.event === "workflow_dispatch" && run.head_branch === "rock";
  return run.path === pathOf("cloudflare-staging.yml") && run.event === "workflow_dispatch";
};

export const createPriority = (api, now = () => Date.now()) => {
  const list = async (path, key) => {
    const rows = [];
    for (let page = 1; page <= 10; page++) {
      const result = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const batch = key ? result[key] : result;
      if (!Array.isArray(batch) || key && (!Number.isSafeInteger(result.total_count) || result.total_count > 1000)) throw new Error("Incomplete priority metadata");
      rows.push(...batch);
      if (batch.length < 100) return rows;
    }
    throw new Error("Priority metadata exceeds the scan limit");
  };
  const releases = async () => {
    const rows = await Promise.all(ACTIVE.map((status) => list(`actions/runs?status=${status}`, "workflow_runs")));
    return rows.flat().filter(isRelease);
  };
  // This runs only with the trusted workflow_run reporter's write token, never PR code.
  // The required commit status shares the Actions check's name: BOTH must pass.
  const report = async (id, repo) => {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid unit run id");
    const run = await api(`actions/runs/${id}`);
    if (run.path !== pathOf("tests.yml") || run.event !== "pull_request") return false;
    const prs = await list("pulls?state=open&base=rock");
    const pr = prs.find(row => row.head.sha === run.head_sha && row.head.ref === run.head_branch);
    if (!pr) return false;
    const siblings = await list(`actions/workflows/tests.yml/runs?head_sha=${run.head_sha}&event=pull_request`, "workflow_runs");
    if (siblings.some(row => row.head_branch === run.head_branch && row.id > run.id)) return false;
    let state = "pending", description = "Waiting for unit, site-build and Worker validation";
    if (run.status === "completed") {
      const jobs = await list(`actions/runs/${id}/jobs?filter=latest`, "jobs");
      const job = jobs.find(row => row.name === UNIT_STATUS);
      if (job && (deferredJob(job, "success") || deferredJob(job, "failure"))) {
        description = "Deferred for release work; automatic retry pending";
      } else {
        const passed = run.conclusion === "success" && job?.conclusion === "success"
          && UNIT_STEPS.every(name => job.steps?.some(step => step.name === name && step.conclusion === "success"));
        state = passed ? "success" : "failure";
        description = passed ? "Unit, site-build and Worker validation passed" : "Validation failed, was cancelled, or did not run completely";
      }
    }
    const current = await api(`actions/runs/${id}`), latest = await api(`pulls/${pr.number}`);
    if (current.run_attempt !== run.run_attempt || current.status !== run.status || current.conclusion !== run.conclusion
      || latest.state !== "open" || latest.base.ref !== "rock" || latest.head.sha !== run.head_sha) return false;
    const target_url = runURL(repo, run), statuses = await list(`commits/${run.head_sha}/statuses`);
    const previous = statuses.find(row => row.context === UNIT_STATUS);
    const prefix = `https://github.com/${repo}/actions/runs/`;
    const newer = previous?.creator?.login === "github-actions[bot]" && previous.target_url?.startsWith(prefix)
      ? /^(\d+)\/attempts\/(\d+)$/.exec(previous.target_url.slice(prefix.length)) : null;
    if (newer && (Number(newer[1]) > run.id || Number(newer[1]) === run.id && Number(newer[2]) > run.run_attempt)) return false;
    if (previous?.creator?.login === "github-actions[bot]" && previous.state === state
      && previous.description === description && previous.target_url === target_url) return true;
    await api(`statuses/${run.head_sha}`, "POST", { context: UNIT_STATUS, state, description, target_url });
    return true;
  };
  const reportCurrent = async repo => {
    const prs = await list("pulls?state=open&base=rock");
    let reported = 0;
    for (const pr of prs) {
      const result = await api(`actions/workflows/tests.yml/runs?head_sha=${pr.head.sha}&branch=${encodeURIComponent(pr.head.ref)}&event=pull_request&per_page=1`);
      if (!Array.isArray(result.workflow_runs) || result.workflow_runs.length > 1) throw new Error("Invalid unit-run metadata");
      if (result.workflow_runs.length && await report(result.workflow_runs[0].id, repo)) reported++;
    }
    return reported;
  };
  // During rollout, or if the trusted reporter is unavailable, keep the old failing
  // deferral. Never let a skipped lane satisfy protection without its pending status.
  const pendingUnit = async (id, attempt, sha, repo) => {
    const statuses = await list(`commits/${sha}/statuses`);
    const status = statuses.find(row => row.context === UNIT_STATUS);
    return !!status && status.state === "pending" && status.creator?.login === "github-actions[bot]"
      && status.target_url === runURL(repo, { id, run_attempt: attempt });
  };
  const resume = async () => {
    if ((await releases()).length) return 0;
    // Read only the latest run for each current PR head and recovery event.
    // Successful deferrals cannot be found by scanning failures, and a month
    // of ordinary completed bundle jobs already exceeds GitHub's 1,000-row cap.
    const since = now() - 30 * 86400000;
    const prs = await list("pulls?state=open&base=rock");
    let resumed = 0;
    for (const workflow of WORKFLOWS) {
      const runs = [];
      const latestRun = async query => {
        const result = await api(`actions/workflows/${workflow}/runs?${query}&per_page=1`);
        if (!Array.isArray(result.workflow_runs) || result.workflow_runs.length > 1) throw new Error("Invalid latest-run metadata");
        if (result.workflow_runs.length) runs.push(result.workflow_runs[0]);
      };
      const event = workflow === "tests.yml" ? "pull_request" : "pull_request_target";
      for (const pr of prs) if (!pr.draft) await latestRun(`head_sha=${pr.head.sha}&branch=${encodeURIComponent(pr.head.ref)}&event=${event}`);
      if (workflow === "character-bundles.yml") for (const event of ["schedule", "workflow_run"]) await latestRun(`event=${event}`);
      for (const run of runs) {
        if (run.path !== pathOf(workflow) || run.status !== "completed" || !["failure", "success"].includes(run.conclusion)
          || !Number.isFinite(Date.parse(run.created_at)) || Date.parse(run.created_at) < since) continue;
        // Step names are not proof that a PR really yielded. Bound retries even
        // when submitted workflow code imitates the gate and fails forever.
        if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt >= MAX_ATTEMPTS) continue;
        const prEvent = ["pull_request", "pull_request_target"].includes(run.event);
        const pr = prEvent && prs.find((row) => !row.draft && row.head.sha === run.head_sha && row.head.ref === run.head_branch);
        // Unit reruns must belong to a still-open PR at its current revision.
        // Character signals/sweeps inspect current state themselves. Closed
        // character PRs are recovered by the existing periodic bundle sweep.
        if (prEvent && !pr || workflow === "tests.yml" && run.event !== "pull_request"
          || workflow === "character-bundles.yml" && !["pull_request_target", "workflow_run", "schedule"].includes(run.event)) continue;
        const jobs = await list(`actions/runs/${run.id}/jobs?filter=latest`, "jobs");
        const job = jobs.find(row => deferredJob(row, run.conclusion));
        if (!job) continue; // Never retry a real test/build failure.
        const current = await api(`actions/runs/${run.id}`);
        if (current.status !== "completed" || current.conclusion !== run.conclusion || current.run_attempt !== run.run_attempt) continue;
        if (pr) {
          const latest = await api(`pulls/${pr.number}`);
          if (latest.state !== "open" || latest.draft || latest.base.ref !== "rock" || latest.head.sha !== run.head_sha) continue;
        }
        const siblings = await api(`actions/workflows/${workflow}/runs?event=${run.event}${pr ? `&head_sha=${run.head_sha}&branch=${encodeURIComponent(run.head_branch)}` : ""}&per_page=1`);
        if (siblings.workflow_runs?.[0]?.id !== run.id) continue;
        if ((await releases()).length) return resumed;
        // Retry only the yielded job and its dependants; successful jobs stay.
        await api(`actions/jobs/${job.id}/rerun`, "POST");
        if (++resumed === 20) return resumed;
      }
    }
    return resumed;
  };
  return { releases, resume, report, reportCurrent, pendingUnit };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || "") || !token) throw new Error("Missing priority repository or token");
  const api = async (path, method = "GET", data) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, { method,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Priority API returned ${response.status}`);
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  const priority = createPriority(api);
  if (process.argv[2] === "--gate") {
    const deferred = (await priority.releases()).length > 0;
    let pending = false;
    if (deferred && process.argv.includes("--unit")) {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      // The reporter is a separate trusted job; allow its startup to finish.
      for (let i = 0; i < 12; i++) {
        pending = await priority.pendingUnit(Number(process.env.GITHUB_RUN_ID), Number(process.env.GITHUB_RUN_ATTEMPT), event.pull_request.head.sha, repo);
        if (pending) break;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `deferred=${deferred}\npending=${pending}\n`);
  } else if (process.argv[2] === "--report") {
    console.log(`Unit status updated: ${process.env.PRIORITY_RUN_ID ? await priority.report(Number(process.env.PRIORITY_RUN_ID), repo) : await priority.reportCurrent(repo)}`);
  } else if (process.argv[2] === "--resume") {
    console.log(`Resumed ${await priority.resume()} deferred CI job(s)`);
  } else throw new Error("Expected --gate, --report or --resume");
}
