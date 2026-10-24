// Tess's answers as /api/tess gives them: a stand-in Claude records each call and answers from a script, and the
// migration runs on an in-memory SQLite standing in for D1. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import Anthropic from "@anthropic-ai/sdk";
import { routeFixture, TESS_FACTS } from "./routes.mjs";
import { RULES } from "../src/tess-rules.js";

const SITE = "https://site.test";
const KEY = "sk-test";

// D1 over SQLite: prepare, bind, first (a row or one column of it), run, and batch.
const d1 = () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../migrations/0002_tess.sql", import.meta.url), "utf8"));
  const statement = (query, args = []) => ({
    bind: (...values) => statement(query, values),
    first: async (column) => {
      const row = sql.prepare(query).get(...args);
      return row === undefined ? null : column ? row[column] : { ...row };
    },
    run: async () => { sql.prepare(query).run(...args); return { success: true }; }
  });
  return { sql, prepare: (query) => statement(query), batch: async (list) => Promise.all(list.map((s) => s.run())) };
};

// Claude answering from a script, one reply a call: a message, or an error to throw. `made` counts the clients built.
const claude = (...replies) => {
  const calls = [], made = [];
  const Anthropic = class {
    constructor(options) {
      made.push(options);
      this.messages = { create: async (params, opts) => {
        calls.push({ options, params, opts });
        const next = replies.shift();
        if (!next) throw new Error("Unexpected Claude call");
        if (next instanceof Error) throw next;
        return next;
      } };
    }
  };
  return { Anthropic, calls, made };
};
const USAGE = { input_tokens: 40, cache_creation_input_tokens: 7000, cache_read_input_tokens: 0, output_tokens: 60 };
const message = (out, stop = "end_turn") => ({ stop_reason: stop, usage: USAGE,
  content: [{ type: "thinking", thinking: "" }, { type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }] });

const ask = (handleTess, env, body, headers = {}) => handleTess(new Request(`${SITE}/api/tess`, { method: "POST",
  headers: { origin: SITE, "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body) }), env);
const kept = (db) => db.sql.prepare("SELECT question, about, say, go, asked FROM tess_answers ORDER BY question").all().map((row) => ({ ...row }));
const spend = (db) => db.sql.prepare("SELECT micro_usd, calls FROM tess_spend").get();

test("without a key the Worker answers nothing, and only the site may ask, by POST", async () => {
  const { handleTess } = routeFixture(), DB = d1();
  assert.equal((await ask(handleTess, { SITE_ORIGIN: SITE, DB }, { question: "what is bitcoin" })).status, 503);
  const env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY };
  assert.equal((await ask(handleTess, env, { question: "what is bitcoin" }, { origin: "https://elsewhere.test" })).status, 403);
  assert.equal((await handleTess(new Request(`${SITE}/api/tess`, { headers: { origin: SITE } }), env)).status, 405);
});

test("a question goes to Claude once, with the rules and facts as one cached prompt, and a repeat comes from what she kept", async () => {
  const stub = claude(message({ say: "Ooga Arcade, at 3 o'clock!\nA cabinet for every game.", go: "arcade" }));
  const { handleTess } = routeFixture({ anthropic: stub.Anthropic }), DB = d1(), env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY };
  const first = await ask(handleTess, env, { question: "  Where can I play games?\n" });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { say: "Ooga Arcade, at 3 o'clock!\nA cabinet for every game.", go: "arcade" });
  const { options, params } = stub.calls[0];
  assert.equal(options.apiKey, KEY);
  // One paid attempt a question: the SDK retries nothing, and one signal ends the call (below, with the real SDK).
  assert.equal(options.maxRetries, 0);
  assert.ok(stub.calls[0].opts.signal instanceof AbortSignal);
  assert.equal(params.model, "claude-haiku-5-5");
  assert.deepEqual(params.system, [{ type: "text", text: `${RULES}\n\n${TESS_FACTS.text}`, cache_control: { type: "ephemeral" } }]);
  assert.deepEqual(params.messages, [{ role: "user", content: "Where can I play games?" }]);
  assert.equal(params.output_config.effort, "low");
  assert.deepEqual(params.output_config.format.schema.properties.go.anyOf[0].enum, TESS_FACTS.places);
  for (const name of ["temperature", "top_p", "top_k"]) assert.equal(name in params, false);

  const again = await ask(handleTess, env, { question: "where can i play GAMES??" });
  assert.deepEqual(await again.json(), { say: "Ooga Arcade, at 3 o'clock!\nA cabinet for every game.", go: "arcade" });
  assert.equal(stub.calls.length, 1);
  assert.deepEqual(kept(DB), [{ question: "where can i play games", about: "", say: "Ooga Arcade, at 3 o'clock!\nA cabinet for every game.", go: "arcade", asked: 2 }]);
  // 40 in at $0.10/M, 7000 written to the cache at 1.25x, 60 out at $0.50/M: 4 + 875 + 30 millionths of a dollar.
  assert.deepEqual({ ...spend(DB) }, { micro_usd: 909, calls: 1 });

  // New facts are a new prompt: what she kept under the old one is not served.
  const next = claude(message({ say: "Games at the arcade!", go: "arcade" }));
  const routes = routeFixture({ anthropic: next.Anthropic, facts: { ...TESS_FACTS, text: `${TESS_FACTS.text}\n- arcade: new.` } });
  assert.deepEqual(await (await ask(routes.handleTess, env, { question: "Where can I play games?" })).json(), { say: "Games at the arcade!", go: "arcade" });
  assert.equal(next.calls.length, 1);
});

test("the place she was last asked about goes with the question and keys its answer", async () => {
  const stub = claude(message({ say: "Through the shield at 2 o'clock.", go: null }), message({ say: "Inside which one?", go: null }));
  const { handleTess } = routeFixture({ anthropic: stub.Anthropic }), DB = d1(), env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY };
  await ask(handleTess, env, { question: "how do I get inside", about: "factory" });
  assert.equal(stub.calls[0].params.messages[0].content, "(They were last asking about Lightning Factory.)\nhow do I get inside");
  await ask(handleTess, env, { question: "how do I get inside", about: "the moon" });
  assert.equal(stub.calls[1].params.messages[0].content, "how do I get inside");
  assert.equal(stub.made.length, 1);
  assert.deepEqual(kept(DB).map((row) => row.about).sort(), ["", "factory"]);
});

test("an answer is checked for shape only: a place off the list is dropped, and a refusal, a malformed or an overlong one is not kept", async () => {
  const stub = claude(message({ say: "To the moon!", go: "moon" }), message({ say: "", go: null }, "refusal"), message("{\"say\": "),
    message({ say: "Ooga ".repeat(150), go: null }), message({ say: "One.\n\n Two. \nThree.\nFour.\nFive.", go: null }));
  const { handleTess } = routeFixture({ anthropic: stub.Anthropic }), DB = d1(), env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY };
  assert.deepEqual(await (await ask(handleTess, env, { question: "take me to the moon" })).json(), { say: "To the moon!", go: null });
  for (const question of ["refuse this", "break this", "ramble on"]) {
    const res = await ask(handleTess, env, { question });
    assert.equal(res.status, 422);
    assert.deepEqual(await res.json(), { error: "refused" });
  }
  assert.deepEqual(await (await ask(handleTess, env, { question: "count to five" })).json(), { say: "One.\nTwo.\nThree.\nFour.", go: null });
  assert.deepEqual(kept(DB).map((row) => row.question), ["count to five", "take me to the moon"]);
  // Every call Claude answered is paid for, kept or not.
  assert.equal(spend(DB).calls, 5);
});

test("a day's spend stops at its cap, while answers she kept still come, and a cap of 0 stops Claude at once", async () => {
  const stub = claude(message({ say: "Bananas!", go: "pile" }));
  const { handleTess } = routeFixture({ anthropic: stub.Anthropic }), DB = d1();
  const env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY, TESS_DAILY_CENTS: "1" };
  assert.equal((await ask(handleTess, env, { question: "where is the pile" })).status, 200);
  DB.sql.prepare("UPDATE tess_spend SET micro_usd = 10000").run();
  const resting = await ask(handleTess, env, { question: "what is a block" });
  assert.equal(resting.status, 429);
  assert.deepEqual(await resting.json(), { error: "resting" });
  assert.deepEqual(await (await ask(handleTess, env, { question: "Where is the pile?" })).json(), { say: "Bananas!", go: "pile" });
  assert.equal(stub.calls.length, 1);
  const off = await ask(handleTess, { ...env, DB: d1(), TESS_DAILY_CENTS: "0" }, { question: "what is a block" });
  assert.deepEqual(await off.json(), { error: "resting" });
  assert.equal(stub.calls.length, 1);
});

test("concurrent questions can't pass the cap between them: each reserves its most before Claude is called", async () => {
  const replies = Array.from({ length: 5 }, (_, i) => message({ say: `Answer ${i}.`, go: null }));
  const stub = claude(...replies), fixture = routeFixture({ anthropic: stub.Anthropic }), DB = d1();
  const env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY, TESS_DAILY_CENTS: "1" }, cap = 10000;
  // Room for two reservations and a half.
  DB.sql.prepare("INSERT INTO tess_spend VALUES (?, ?, 0)").run(new Date().toISOString().slice(0, 10), cap - Math.floor(fixture.RESERVE * 2.5));
  const answers = await Promise.all(Array.from({ length: 5 }, (_, i) => ask(fixture.handleTess, env, { question: `question number ${i}` })));
  assert.deepEqual(answers.map((r) => r.status).sort(), [200, 200, 429, 429, 429]);
  assert.equal(stub.calls.length, 2);
  assert.ok(spend(DB).micro_usd <= cap, JSON.stringify(spend(DB)));
  // The two answers settle to their own costs: 4 + 875 + 30 millionths of a dollar each.
  assert.equal(spend(DB).micro_usd, cap - Math.floor(fixture.RESERVE * 2.5) + 2 * 909);
  assert.equal(spend(DB).calls, 2);
});

// The real SDK with only its fetch mocked: each call records when it went out.
const realClaude = (answer) => {
  const sent = [], fetch = (url, init) => { sent.push(Date.now()); return answer(init); };
  return { sent, Anthropic: class extends Anthropic { constructor(options) { super({ ...options, fetch }); } } };
};
const quietly = async (run) => {
  const log = console.error;
  console.error = () => {};
  try { return await run(); } finally { console.error = log; }
};

test("one deadline ends a call that hangs, and nothing is retried", async () => {
  const hung = realClaude((init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
  const started = Date.now();
  await assert.rejects(routeFixture({ anthropic: hung.Anthropic }).ask({ ANTHROPIC_API_KEY: KEY }, "what is a block", null, AbortSignal.timeout(200)));
  assert.equal(hung.sent.length, 1);
  assert.ok(Date.now() - started < 2000, String(Date.now() - started));
  // A 429 asking for a 16 s wait ends at once: no backoff, no second request.
  const limited = realClaude(async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": "16" } }));
  await assert.rejects(routeFixture({ anthropic: limited.Anthropic }).ask({ ANTHROPIC_API_KEY: KEY }, "what is a block", null, AbortSignal.timeout(20000)));
  assert.equal(limited.sent.length, 1);
});

test("a call that may still be billed keeps its reservation, and only an error the API answered gives it back", async () => {
  // Room for exactly one reservation: a call cut off before its answer spends it, so the next four rest.
  const cut = realClaude(async () => { throw new DOMException("aborted", "AbortError"); });
  const timedOut = routeFixture({ anthropic: cut.Anthropic }), DB = d1();
  const env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY, TESS_DAILY_CENTS: String(timedOut.RESERVE / 1e4) };
  const statuses = [];
  await quietly(async () => { for (let i = 0; i < 5; i++) statuses.push((await ask(timedOut.handleTess, env, { question: `question number ${i}` })).status); });
  assert.deepEqual(statuses, [502, 429, 429, 429, 429]);
  assert.equal(cut.sent.length, 1);
  assert.deepEqual({ ...spend(DB) }, { micro_usd: timedOut.RESERVE, calls: 1 });
  // An overloaded API answers 529, which is never billed: each reservation comes back and the next question still goes.
  const busy = realClaude(async () => new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
    { status: 529, headers: { "content-type": "application/json" } }));
  const refused = routeFixture({ anthropic: busy.Anthropic }), DB2 = d1();
  const env2 = { ...env, DB: DB2 }, again = [];
  await quietly(async () => { for (let i = 0; i < 2; i++) again.push((await ask(refused.handleTess, env2, { question: `question number ${i}` })).status); });
  assert.deepEqual(again, [502, 502]);
  assert.equal(busy.sent.length, 2);
  assert.deepEqual({ ...spend(DB2) }, { micro_usd: 0, calls: 0 });
});

test("a question is one short line of text, in a small body", async () => {
  const { handleTess } = routeFixture(), env = { SITE_ORIGIN: SITE, DB: d1(), ANTHROPIC_API_KEY: KEY };
  for (const body of [{ question: "x".repeat(201) }, { question: "?!…" }, { question: 42 }, {}, null, "{nope"]) {
    assert.equal((await ask(handleTess, env, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await ask(handleTess, env, { question: "hi", pad: "x".repeat(1100) })).status, 413);
});

test("questions are limited by the asker's address, which is not kept", async () => {
  const keys = [], TESS_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  const { handleTess } = routeFixture(), DB = d1();
  const res = await ask(handleTess, { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY, TESS_LIMITER }, { question: "what is lightning" });
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "busy" });
  assert.deepEqual(keys, ["203.0.113.7"]);
  assert.deepEqual(DB.sql.prepare("SELECT name FROM pragma_table_info('tess_answers')").all().map((c) => c.name),
    ["version", "question", "about", "say", "go", "asked", "first_day", "last_day"]);
});

test("Claude failing leaves her own line to the page and costs nothing", async () => {
  const stub = claude(Object.assign(new Error("overloaded"), { status: 529 }));
  const { handleTess } = routeFixture({ anthropic: stub.Anthropic }), DB = d1(), env = { SITE_ORIGIN: SITE, DB, ANTHROPIC_API_KEY: KEY };
  const errors = [], log = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const res = await ask(handleTess, env, { question: "what is lightning" });
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "unavailable" });
  } finally { console.error = log; }
  assert.deepEqual(errors, ["tess: Claude failed 529 overloaded"]);
  // Its reservation is given back whole.
  assert.deepEqual({ ...spend(DB) }, { micro_usd: 0, calls: 0 });
});

test("the daily prune drops questions not asked for 90 days, and the Worker routes /api/tess to her", async () => {
  const { pruneTess, worker } = routeFixture(), DB = d1(), now = Date.parse("2026-10-22T04:00:00Z");
  const row = DB.sql.prepare("INSERT INTO tess_answers VALUES ('v', ?, '', 'Hi!', NULL, 1, ?, ?)");
  row.run("old", "2026-07-01", "2026-07-23");
  row.run("recent", "2026-07-01", "2026-07-24");
  DB.sql.prepare("INSERT INTO tess_spend VALUES ('2026-07-01', 5, 1), ('2026-10-21', 7, 1)").run();
  await pruneTess(DB, now);
  assert.deepEqual(kept(DB).map((r) => r.question), ["recent"]);
  assert.deepEqual(DB.sql.prepare("SELECT day FROM tess_spend").all().map((r) => r.day), ["2026-10-21"]);
  const res = await worker.fetch(new Request(`${SITE}/api/tess`, { method: "POST", headers: { origin: SITE }, body: "{}" }), { SITE_ORIGIN: SITE, DB });
  assert.deepEqual(await res.json(), { error: "closed" });
});

test("both Workers limit questions to Tess", () => {
  for (const name of ["staging", "production"]) {
    const config = JSON.parse(readFileSync(new URL(`../../wrangler.${name}.jsonc`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    assert.deepEqual(config.ratelimits.find((r) => r.name === "TESS_LIMITER").simple, { limit: 5, period: 60 }, name);
  }
});
