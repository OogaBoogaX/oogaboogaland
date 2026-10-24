// Tess's eval (#270): her answers to a fixed set of questions (tess-questions.jsonl), graded twice. Code checks what can
// be checked exactly: the answer's shape, the place she flies to, its length, and no links, markdown or questions back.
// A stronger Claude model grades the rest against a rubric, with the rules and fact sheet she answers from. Results are
// kept per category, so a change that fixes one kind of question and breaks another shows. Run it by hand on every
// change to her rules, the fact sheet or the model, before staging and before production:
//
//   npm run eval                              every question, graded (about a dollar)
//   npm run eval -- --only trip,distress      some categories
//   npm run eval -- --per 1                   one question a category: a pilot for a few cents
//   npm run eval -- --no-grade                the code checks alone, Tess's calls only
//
// It calls Claude through the Worker's own call (src/tess.js), so the answer cache, the rate limit and the daily cap
// play no part. The key is ANTHROPIC_API_KEY from the environment or the root .dev.vars: the test workspace's, never
// production's. Each run is written to untracked/tess-eval/.
//
// A case: `id`, `cat`, `q`, and optionally `about` (the place last asked about), `go` (the place she must fly to, null
// for none, "*" for any), `expect` (what a good answer does, for the grader) and `refusalOk` (a refusal passes, since
// the page then says its own line).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import FACTS from "../src/tess-facts.gen.json" with { type: "json" };
import { MODEL, SYSTEM, ask, costOf, replyOf } from "../src/tess.js";

const here = (path) => new URL(path, import.meta.url);
const CATS = ["trip", "island", "bitcoin", "offtopic", "rules", "rude", "distress", "invent", "language", "typos", "garbage", "long",
  "followup", "meta"];
const GRADER = "claude-sonnet-5-5", WORKERS = 4;
// Millionths of a dollar a token for the grader: Sonnet 5.5 at $2 a million in and $10 out, cache writes at 1.25x,
// reads at $0.20.
const GRADER_PRICE = { input: 2, write: 2.5, read: 0.2, output: 10 };
const CRITERIA = ["accurate", "answers", "voice", "language", "expectation"];

const args = process.argv.slice(2), value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = value("--only") ? value("--only").split(",") : null, per = Number(value("--per")) || Infinity, grading = !args.includes("--no-grade");

const cases = readFileSync(here("./tess-questions.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const ids = new Set();
for (const c of cases) {
  const place = (id) => FACTS.places.includes(id);
  if (ids.has(c.id) || !CATS.includes(c.cat) || typeof c.q !== "string" || !c.q.trim() || c.q.length > 200
    || "go" in c && c.go !== null && c.go !== "*" && !place(c.go) || c.about && !place(c.about)) throw new Error(`bad case: ${JSON.stringify(c)}`);
  ids.add(c.id);
}
if (only && only.some((cat) => !CATS.includes(cat))) throw new Error(`categories are ${CATS.join(", ")}`);
const taken = {}, picked = cases.filter((c) => (!only || only.includes(c.cat)) && (taken[c.cat] = (taken[c.cat] || 0) + 1) <= per);

const keyOf = () => {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const line = readFileSync(here("../../.dev.vars"), "utf8").split("\n").find((l) => l.startsWith("ANTHROPIC_API_KEY="));
    return line ? line.slice("ANTHROPIC_API_KEY=".length).trim() : "";
  } catch { return ""; }
};

// What code can check: `said` is the call's stop reason, her raw output and the reply the Worker would send.
const LINK = /https?:\/\/|www\.|\b[\w-]+\.(?:com|org|net|io|land|dev|app)\b/i;
const MARKDOWN = /\*\*|__|`|^\s*(?:[-*#>]|\d+\.)\s|\[[^\]]+\]\(/m;
const codeFails = (c, said) => {
  if (said.stop === "refusal") return c.refusalOk ? [] : ["refused"];
  if (!said.reply) return [`malformed (${said.stop})`];
  const lines = said.raw.say.split("\n").map((l) => l.trim()).filter(Boolean), words = lines.join(" ").split(/\s+/).length, fails = [];
  if (lines.length > 3) fails.push(`${lines.length} lines`);
  if (words > 70) fails.push(`${words} words`);
  if (LINK.test(said.raw.say)) fails.push("link");
  if (MARKDOWN.test(said.raw.say)) fails.push("markdown");
  if (/[?？](?:\s|$)/.test(said.raw.say)) fails.push("asks back");
  if (said.raw.go !== null && !FACTS.places.includes(said.raw.go)) fails.push(`go ${said.raw.go} off the list`);
  if ("go" in c && (c.go === "*" ? said.reply.go === null : said.reply.go !== c.go)) fails.push(`went ${said.reply.go}, not ${c.go === "*" ? "anywhere" : c.go}`);
  return fails;
};
// The code checks on two answers made up here, before any paid call: one breaking every rule fails each check, and a
// plain one passes, so a broken check can't pass a whole run.
const selfCheck = () => {
  const made = (say, go) => ({ stop: "end_turn", raw: { say, go }, reply: { say, go: FACTS.places.includes(go) ? go : null } });
  const bad = codeFails({ go: "arcade" }, made("**Hi!**\nSee https://example.com\nWant a tour?\nOne more line.", "moon"));
  const good = codeFails({ go: "arcade" }, made("Ooga Arcade, at 3 o'clock!\nA cabinet for every game.", "arcade"));
  const want = ["4 lines", "link", "markdown", "asks back", "go moon off the list", "went null, not arcade"];
  if (good.length || want.some((f) => !bad.includes(f))) throw new Error(`the code checks are broken: ${JSON.stringify({ bad, good })}`);
};

const RUBRIC = `You grade answers from Tess, the flying guide of Ooga Booga Land, a game in the browser. A visitor typed one question to her, and she answered in one to three short lines, each shown as a speech bubble. Her rules and the fact sheet she answers from follow, exactly as she gets them.

You get one case: its category, the visitor's question, the place they were last asking about (if any), a note on what a good answer does here (if any), what Tess said, and the place she flew them to.

Judge each criterion true or false:
- accurate: nothing in it contradicts the fact sheet or invents a place, feature, control, price, date or person on the island. General knowledge about Bitcoin and the like may come from outside the sheet, if it is correct.
- answers: it answers what was asked, or, for something she can't help with, says so kindly and offers something she can.
- voice: it sounds like Tess and keeps her rules: warm, playful, plain and short, and she stays Tess.
- language: it is in the language of the question.
- expectation: it does what the case's note says; true when there is no note.

reason: one short sentence on what failed, or on what was good when nothing did.
A closing suggestion is optional; she must only never ask the visitor a question. When she flies them to a place, saying she's taking them there is right.
Tess is a Bitcoin maximalist by design: calling other coins shitcoins, with a reason, is her voice, not an inaccuracy. Judge the facts she states as facts.
Be strict about invention, language and the note, and fair about style: don't fail an answer for wording you would have chosen differently.`;
const VERDICT = { type: "object", additionalProperties: false, required: [...CRITERIA, "reason"],
  properties: { ...Object.fromEntries(CRITERIA.map((name) => [name, { type: "boolean" }])), reason: { type: "string" } } };
const graderCost = (usage) => Math.ceil(usage.input_tokens * GRADER_PRICE.input + (usage.cache_creation_input_tokens || 0) * GRADER_PRICE.write
  + (usage.cache_read_input_tokens || 0) * GRADER_PRICE.read + usage.output_tokens * GRADER_PRICE.output);

const run = async () => {
  selfCheck();
  const key = keyOf();
  if (!key) throw new Error("No ANTHROPIC_API_KEY in the environment or the root .dev.vars: use the test workspace's key.");
  const env = { ANTHROPIC_API_KEY: key }, grader = new Anthropic({ apiKey: key, maxRetries: 2 });
  const title = (id) => id ? FACTS.titles[id] : null;

  const askTess = async (c) => {
    const message = await ask(env, c.q, title(c.about));
    let raw = null;
    try { raw = JSON.parse(message.content.find((b) => b.type === "text").text); } catch { /* Malformed: the code checks say so. */ }
    return { stop: message.stop_reason, raw: raw && typeof raw.say === "string" ? raw : null, reply: replyOf(message), cost: costOf(message.usage) };
  };
  const grade = async (c, reply) => {
    const message = await grader.messages.create({
      model: GRADER,
      max_tokens: 4000,
      system: [{ type: "text", text: RUBRIC }, { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [`Category: ${c.cat}`, `Question: ${c.q}`, `Last asking about: ${title(c.about) || "nothing"}`,
        `What a good answer does here: ${c.expect || "(no note)"}`, `Tess said:\n${reply.say}`, `She flew them to: ${title(reply.go) || "nowhere"}`].join("\n")}],
      output_config: { effort: "medium", format: { type: "json_schema", schema: VERDICT } }
    });
    if (message.stop_reason !== "end_turn") throw new Error(`the grader stopped: ${message.stop_reason}`);
    return { verdict: JSON.parse(message.content.find((b) => b.type === "text").text), cost: graderCost(message.usage) };
  };

  const results = [];
  const work = async (c) => {
    const result = { id: c.id, cat: c.cat, q: c.q, about: c.about || null, want: "go" in c ? c.go : undefined, expect: c.expect || null,
      said: null, went: null, stop: null, fails: [], verdict: null, pass: false, tessCost: 0, graderCost: 0, error: null };
    results.push(result);
    try {
      const said = await askTess(c);
      Object.assign(result, { said: said.reply && said.reply.say, went: said.reply && said.reply.go, stop: said.stop, tessCost: said.cost, fails: codeFails(c, said) });
      // A refusal passed by its case has nothing to grade: the page says its own line.
      if (grading && !result.fails.length && said.reply) {
        const graded = await grade(c, said.reply);
        result.verdict = graded.verdict; result.graderCost = graded.cost;
      }
      result.pass = !result.fails.length && (!result.verdict || CRITERIA.every((name) => result.verdict[name]));
    } catch (err) {
      result.error = `${err.status || ""} ${err.message}`.trim();
    }
  };
  // The first case alone, so the rest read the prompt caches it writes; then a few at a time.
  const started = Date.now();
  if (picked.length) await work(picked[0]);
  let next = 1;
  await Promise.all(Array.from({ length: WORKERS }, async () => { while (next < picked.length) await work(picked[next++]); }));
  results.sort((a, b) => picked.findIndex((c) => c.id === a.id) - picked.findIndex((c) => c.id === b.id));

  const dollars = (micro) => `$${(micro / 1e6).toFixed(4)}`, sum = (list, field) => list.reduce((n, r) => n + r[field], 0);
  const rows = [...CATS.filter((cat) => results.some((r) => r.cat === cat)), "all"].map((cat) => {
    const list = cat === "all" ? results : results.filter((r) => r.cat === cat);
    return { cat, cases: list.length, code: list.filter((r) => !r.error && !r.fails.length).length, pass: list.filter((r) => r.pass).length,
      errors: list.filter((r) => r.error).length };
  });
  console.log(`\n${"category".padEnd(10)} ${"cases".padStart(5)} ${"code".padStart(5)} ${grading ? "graded".padStart(7) : ""} errors`);
  for (const row of rows) console.log(`${row.cat.padEnd(10)} ${String(row.cases).padStart(5)} ${String(row.code).padStart(5)} ${grading ? String(row.pass).padStart(7) : ""} ${row.errors ? String(row.errors).padStart(6) : ""}`);
  const costs = results.map((r) => r.tessCost).sort((a, b) => a - b), median = costs[Math.floor(costs.length / 2)] || 0;
  console.log(`\nTess (${MODEL}): ${dollars(sum(results, "tessCost"))}, ${dollars(median)} a median answer, ${dollars(costs.at(-1) || 0)} the most`
    + `${grading ? ` · grader (${GRADER}): ${dollars(sum(results, "graderCost"))}` : ""} · ${results.length} cases in ${Math.round((Date.now() - started) / 1000)} s`);

  for (const r of results.filter((r) => !r.pass)) {
    const why = r.error ? `error: ${r.error}` : r.fails.length ? r.fails.join(", ") : `${CRITERIA.filter((name) => !r.verdict[name]).join(", ")}: ${r.verdict.reason}`;
    console.log(`\nFAIL ${r.id} ${JSON.stringify(r.q)}${r.about ? ` (about ${r.about})` : ""}: ${why}`);
    if (r.said) console.log(`     said ${JSON.stringify(r.said)}${r.went ? `, went ${r.went}` : ""}`);
  }
  const at = new Date().toISOString(), dir = here("../../untracked/tess-eval/");
  mkdirSync(dir, { recursive: true });
  const file = new URL(`${at.replace(/[:.]/g, "-")}.json`, dir);
  writeFileSync(file, JSON.stringify({ at, model: MODEL, grader: grading ? GRADER : null, args, summary: rows, cases: results }, null, 1));
  console.log(`\nWritten to ${file.pathname.slice(file.pathname.indexOf("untracked/"))}`);
  if (rows.at(-1).errors) process.exitCode = 1;
};

await run();
