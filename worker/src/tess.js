// /api/tess: Tess answers a question the page could not answer by itself (#270). Anyone may ask, signed in or not.
// An answer she has given before comes from D1; anything else goes to Claude Haiku 5.5, with her rules and the build's
// fact sheet as one cached system prompt, and comes back as `{ say, go }`: what she says, a line a bubble, and a place
// she may fly to, or null. Answers are kept by the folded question and the place the visitor last asked about, under
// the version of the prompt and model, so a deploy that changes what she knows retires them. Questions are kept without
// identity (no address, login or user agent) and pruned 90 days after they were last asked. A day's spend, counted from
// each answer's token usage, stops at TESS_DAILY_CENTS (default 50): every call reserves the most it could cost before
// it starts, so concurrent questions can't pass the cap between them, and keeps that charge unless it ends in an error
// the API answered with, the one outcome that is never billed. Past the cap, or without ANTHROPIC_API_KEY, the page
// says its own lines.

import Anthropic from "@anthropic-ai/sdk";
import FACTS from "./tess-facts.gen.json" with { type: "json" };
import { RULES } from "./tess-rules.js";
import { allowed, clientIp, fromSite, json } from "./http.js";

export const MODEL = "claude-haiku-5-5";
const BODY_MAX = 1024, QUESTION_MAX = 200, SAY_MAX = 600, LINES_MAX = 4, KEEP_DAYS = 90, DAILY_CENTS = 50, MAX_TOKENS = 1024;
// One paid attempt a question, ended with its body at DEADLINE_MS, inside the 15 s the page waits. The SDK retries
// nothing: an attempt that timed out may still be billed, and its retry would be paid for again.
const DEADLINE_MS = 12000;
// Millionths of a dollar a token: Haiku 5.5 at $0.10 a million in and $0.50 out, cache writes at 1.25x, reads at 0.1x.
const PRICE = { input: 0.1, write: 0.125, read: 0.01, output: 0.5 };
export const SYSTEM = `${RULES}\n\n${FACTS.text}`;
// The most one call can cost: the whole system prompt written to the cache (at most a token a character), a longest
// question at up to four tokens a character plus room for the output schema, and every output token.
export const RESERVE = Math.ceil(SYSTEM.length * PRICE.write + (QUESTION_MAX * 4 + 2000) * PRICE.input + MAX_TOKENS * PRICE.output);
const hash = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};
const VERSION = hash(`${MODEL}\n${SYSTEM}`);
const SCHEMA = {
  type: "object",
  properties: { say: { type: "string" }, go: { anyOf: [{ type: "string", enum: FACTS.places }, { type: "null" }] } },
  required: ["say", "go"],
  additionalProperties: false
};

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
// The question as asked, one line; and folded for its key: case, accents and punctuation gone, any script kept.
const clean = (text) => typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
const fold = (text) => text.toLowerCase().replace(/₿/g, "b").normalize("NFKD").replace(/\p{M}/gu, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const placeOf = (id) => FACTS.places.includes(id) ? id : null;
export const costOf = (usage) => Math.ceil((usage.input_tokens || 0) * PRICE.input + (usage.cache_creation_input_tokens || 0) * PRICE.write
  + (usage.cache_read_input_tokens || 0) * PRICE.read + (usage.output_tokens || 0) * PRICE.output);

// Her answer, checked for shape only: a few short lines of plain text, and a place on the list or none.
export const replyOf = (message) => {
  if (message.stop_reason !== "end_turn") return null;
  const block = message.content.find((b) => b.type === "text");
  let out;
  try { out = JSON.parse(block.text); } catch { return null; }
  if (!out || typeof out.say !== "string") return null;
  const lines = out.say.split("\n").map(clean).filter(Boolean);
  const say = lines.slice(0, LINES_MAX).join("\n");
  return say && say.length <= SAY_MAX ? { say, go: placeOf(out.go) } : null;
};

// The one call to Claude, shared with the eval (worker/eval/run.mjs), on one client an isolate. `about` is the
// place's title; `signal` ends the call, its body included.
let client = null, clientKey = null;
export const ask = (env, question, about, signal) => {
  if (clientKey !== env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: DEADLINE_MS });
    clientKey = env.ANTHROPIC_API_KEY;
  }
  return client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: about ? `(They were last asking about ${about}.)\n${question}` : question }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } }
  }, { signal });
};
// TESS_DAILY_CENTS, or 50 when unset; 0 stops Claude for the day while kept answers still come.
const capOf = (env) => env.TESS_DAILY_CENTS === undefined || env.TESS_DAILY_CENTS === "" ? DAILY_CENTS : Number(env.TESS_DAILY_CENTS);

export const handleTess = async (request, env) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { allow: "POST" });
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "closed" }, 503);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return json({ error: "too large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const question = clean(body && body.question), key = fold(question), about = placeOf(body && body.about);
  if (!key || question.length > QUESTION_MAX) return json({ error: "bad question" }, 400);
  if (!(await allowed(env.TESS_LIMITER, clientIp(request)))) return json({ error: "busy" }, 429);

  const db = env.DB, today = day(Date.now()), where = [VERSION, key, about || ""];
  const kept = await db.prepare("SELECT say, go FROM tess_answers WHERE version = ? AND question = ? AND about = ?").bind(...where).first();
  if (kept) {
    await db.prepare("UPDATE tess_answers SET asked = asked + 1, last_day = ? WHERE version = ? AND question = ? AND about = ?").bind(today, ...where).run();
    return json({ say: kept.say, go: kept.go });
  }
  // One statement reserves the call's most against the cap, or nothing when that would pass it; an answer's real cost
  // then takes the reservation's place.
  const reserved = await db.prepare("INSERT INTO tess_spend (day, micro_usd, calls) SELECT ?1, ?2, 1 WHERE ?2 <= ?3 "
    + "ON CONFLICT (day) DO UPDATE SET micro_usd = micro_usd + excluded.micro_usd, calls = calls + 1 "
    + "WHERE micro_usd + excluded.micro_usd <= ?3 RETURNING day").bind(today, RESERVE, capOf(env) * 1e4).first();
  if (!reserved) return json({ error: "resting" }, 429);
  const settle = (cost, calls) => db.prepare("UPDATE tess_spend SET micro_usd = micro_usd - ? + ?, calls = calls - ? WHERE day = ?")
    .bind(RESERVE, cost, 1 - calls, today).run();

  let message;
  try {
    message = await ask(env, question, about && FACTS.titles[about], AbortSignal.timeout(DEADLINE_MS));
  } catch (err) {
    // Only an error the API answered with (it carries a status) is unbilled, and gives the reservation back. A timeout,
    // a dropped connection or a body cut off may still be charged, so its reservation stays spent.
    if (typeof err.status === "number") await settle(0, 0);
    console.error("tess: Claude failed", err.status || "", err.message);
    return json({ error: "unavailable" }, 502);
  }
  await settle(costOf(message.usage), 1);
  const reply = replyOf(message);
  if (!reply) return json({ error: "refused" }, 422);
  await db.prepare("INSERT INTO tess_answers (version, question, about, say, go, asked, first_day, last_day) VALUES (?, ?, ?, ?, ?, 1, ?, ?) "
    + "ON CONFLICT (version, question, about) DO UPDATE SET asked = asked + 1, last_day = excluded.last_day")
    .bind(...where, reply.say, reply.go, today, today).run();
  return json(reply);
};

// Daily, with the sessions: questions not asked for 90 days, and the spend of days as old.
export const pruneTess = (db, now = Date.now()) => {
  const cutoff = day(now - KEEP_DAYS * 864e5);
  return db.batch([db.prepare("DELETE FROM tess_answers WHERE last_day < ?").bind(cutoff), db.prepare("DELETE FROM tess_spend WHERE day < ?").bind(cutoff)]);
};
