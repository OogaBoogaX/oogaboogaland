// The page's donation calls as they reach bananapayserver's PageApi: a stand-in binding records what each call
// receives, and a stand-in D1 answers the session lookup. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleDonations } from "../src/donations.js";

const SITE = "https://site.test";
const FAR = 4102444800;

// A binding that records its calls, answering each with a reply of its own (or throwing when `fail`).
const binding = (fail = false) => {
  const calls = [];
  const answer = (name) => async (...args) => {
    calls.push({ name, args });
    if (fail) throw new Error("unreachable");
    return Response.json({ from: name }, { status: name === "fetch" ? 200 : 201 });
  };
  return { calls, invoice: answer("invoice"), note: answer("note"), onchain: answer("onchain"), fetch: answer("fetch") };
};
// D1 holding one signed-in player under any session token.
const db = { prepare: () => ({ bind: () => ({ first: async () => ({ token_hash: "h", expires_at: FAR, last_used_at: FAR, id: 4242, login: "ooga-dev", banned_at: null }), run: async () => ({}) }) }), batch: async () => [] };
const call = (path, { method = "POST", headers = {}, body } = {}) => {
  const request = new Request(SITE + path, { method, headers: { origin: SITE, "cf-connecting-ip": "203.0.113.7", ...headers }, body });
  return [request, new URL(request.url)];
};
const json = { "content-type": "application/json" };

test("an invoice goes on with the page's body and type alone, the signed-in donor and the visitor's address", async () => {
  const DONATIONS = binding();
  const [request, url] = call("/donations/invoice", { headers: { ...json, cookie: "__Host-obl_session=tok", "x-client": "1.1.1.1" }, body: "{\"sats\":1000,\"anon\":false}" });
  const res = await handleDonations(request, { SITE_ORIGIN: SITE, DONATIONS, DB: db }, url);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { from: "invoice" });
  const [passed, donor, visitor] = DONATIONS.calls[0].args;
  assert.deepEqual([...passed.headers.keys()], ["content-type"]);
  assert.equal(await passed.text(), "{\"sats\":1000,\"anon\":false}");
  assert.deepEqual(donor, { id: 4242, login: "ooga-dev" });
  assert.equal(visitor, "203.0.113.7");
});

test("a visitor who isn't signed in gives as nobody, and a note or an on-chain switch carries no donor", async () => {
  const DONATIONS = binding();
  const env = { SITE_ORIGIN: SITE, DONATIONS, DB: db };
  for (const path of ["/donations/invoice", "/donations/note", "/donations/onchain"]) {
    const [request, url] = call(path, { headers: json, body: "{}" });
    await handleDonations(request, env, url);
  }
  assert.deepEqual(DONATIONS.calls.map((c) => [c.name, c.args.length, c.args.at(-1)]), [["invoice", 3, "203.0.113.7"], ["note", 2, "203.0.113.7"], ["onchain", 2, "203.0.113.7"]]);
  assert.equal(DONATIONS.calls[0].args[1], null);
});

test("the socket's upgrade keeps only the WebSocket headers and sets the visitor's address over the browser's", async () => {
  const DONATIONS = binding();
  const ws = { upgrade: "websocket", connection: "Upgrade", "sec-websocket-key": "k", "sec-websocket-version": "13", cookie: "__Host-obl_session=tok", "x-client": "1.1.1.1" };
  const [request, url] = call("/donations/socket?after=abc12345", { method: "GET", headers: ws });
  await handleDonations(request, { SITE_ORIGIN: SITE, DONATIONS }, url);
  const [passed] = DONATIONS.calls[0].args;
  assert.equal(passed.url, `${SITE}/donations/socket?after=abc12345`);
  assert.deepEqual(Object.fromEntries(passed.headers), { connection: "Upgrade", "sec-websocket-key": "k", "sec-websocket-version": "13", upgrade: "websocket", "x-client": "203.0.113.7" });
});

test("another site, an unknown path, an oversized body, a missing binding and a failing bananapayserver each get their answer", async () => {
  const answer = async (path, env, headers = {}) => {
    const [request, url] = call(path, { headers: { ...json, ...headers }, body: "{}" });
    const res = await handleDonations(request, { SITE_ORIGIN: SITE, ...env }, url);
    return [res.status, (await res.json()).error];
  };
  assert.deepEqual(await answer("/donations/invoice", { DONATIONS: binding() }, { origin: "https://evil.test" }), [403, "forbidden"]);
  assert.deepEqual(await answer("/donations/other", { DONATIONS: binding() }), [404, "not found"]);
  const [big, bigUrl] = call("/donations/note", { headers: json, body: "x".repeat(1025) });
  assert.equal((await handleDonations(big, { SITE_ORIGIN: SITE, DONATIONS: binding() }, bigUrl)).status, 413);
  assert.deepEqual(await answer("/donations/invoice", {}), [503, "closed"]);
  assert.deepEqual(await answer("/donations/invoice", { DONATIONS: binding(true), DB: db }), [503, "closed"]);
});
