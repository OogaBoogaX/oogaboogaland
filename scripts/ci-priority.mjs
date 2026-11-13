// Release-first admission and recovery. Only GitHub metadata is read; recovery
// never downloads PR code, artifacts or logs and never starts a deployment.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFER_STEP = "Yield to release work";
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
  const resume = async () => {
    if ((await releases()).length) return 0;
    // GitHub permits reruns for 30 days. Older failures need manual inspection.
    const since = new Date(now() - 30 * 86400000).toISOString();
    const prs = await list("pulls?state=open&base=rock");
    let resumed = 0;
    for (const workflow of WORKFLOWS) {
      const runs = await list(`actions/workflows/${workflow}/runs?status=failure&created=${encodeURIComponent(">=" + since)}`, "workflow_runs");
      for (const run of runs) {
        if (run.path !== pathOf(workflow) || run.status !== "completed" || run.conclusion !== "failure") continue;
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
        if (pr) {
          const siblings = await list(`actions/workflows/${workflow}/runs?head_sha=${run.head_sha}&event=${run.event}`, "workflow_runs");
          if (siblings.some((row) => row.head_branch === run.head_branch && row.id > run.id)) continue;
        }
        const jobs = await list(`actions/runs/${run.id}/jobs?filter=latest`, "jobs");
        const job = jobs.find((row) => row.conclusion === "failure"
          && row.steps?.some((step) => step.name === "Inspect release priority" && step.conclusion === "success")
          && row.steps.some((step) => step.name === DEFER_STEP && step.conclusion === "failure")
          && row.steps.every((step) => step.conclusion !== "failure" || step.name === DEFER_STEP));
        if (!job) continue; // Never retry a real test/build failure.
        const current = await api(`actions/runs/${run.id}`);
        if (current.status !== "completed" || current.conclusion !== "failure" || current.run_attempt !== run.run_attempt) continue;
        if (pr) {
          const latest = await api(`pulls/${pr.number}`);
          if (latest.state !== "open" || latest.draft || latest.base.ref !== "rock" || latest.head.sha !== run.head_sha) continue;
        }
        if ((await releases()).length) return resumed;
        // Retry only the yielded job and its dependants; successful jobs stay.
        await api(`actions/jobs/${job.id}/rerun`, "POST");
        if (++resumed === 20) return resumed;
      }
    }
    return resumed;
  };
  return { releases, resume };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || "") || !token) throw new Error("Missing priority repository or token");
  const api = async (path, method = "GET") => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, { method,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" },
      signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Priority API returned ${response.status}`);
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  const priority = createPriority(api);
  if (process.argv[2] === "--gate") {
    const deferred = (await priority.releases()).length > 0;
    appendFileSync(process.env.GITHUB_OUTPUT, `deferred=${deferred}\n`);
  } else if (process.argv[2] === "--resume") {
    console.log(`Resumed ${await priority.resume()} deferred CI job(s)`);
  } else throw new Error("Expected --gate or --resume");
}
