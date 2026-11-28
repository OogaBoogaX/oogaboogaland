// The Durable Object inspector's page (inspect.js serves it with a fresh nonce in place of __NONCE__). Plain HTML, one
// style and one script, no requests but its socket to /api/inspect/ws: a snapshot of every object and the kept log,
// then updates as objects report (inspector.js). Everything it shows arrived from the objects themselves, and its CPU
// figures are the estimate cpu-model.js makes of their rates. Light or dark in the Hum app's palette, as /map is.
import { CPU_MODEL } from "./cpu-model.js";

export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Object Inspector</title>
<script nonce="__NONCE__">
// The appearance this browser chose (System, Light or Dark; localStorage ooga-theme, which the World Map at /map
// shares), on <html> before the page draws. No attribute follows the system.
try { var chosen = localStorage.getItem("ooga-theme"); if (chosen === "light" || chosen === "dark") document.documentElement.setAttribute("data-theme", chosen); } catch (e) {}
</script>
<style nonce="__NONCE__">
/* The Hum app's palette, light and dark: sand and cream with navy ink and one blue, or neutral greys. */
:root { color-scheme: light; --card-img: none;
  --bg: light-dark(#ede5d8, #1f1f1f); --grid: light-dark(color-mix(in srgb, #ddd2c1 55%, transparent), rgba(255, 255, 255, 0.05));
  --card: light-dark(#faf6ef, #111111); --field: light-dark(#f1eadf, #2a2a2a); --ink: light-dark(#141b2d, #f2f2f0); --on-ink: light-dark(#ffffff, #111111);
  --soft: light-dark(#675f52, #a3a3a0); --line: light-dark(#e8dfd1, #2e2e2e); --stroke: light-dark(#e2d8c8, #262626);
  --accent: light-dark(#399fe3, #4fabe8); --accent-text: light-dark(#1a5f94, #8ccbf3); --accent-soft: light-dark(#d7e9f7, #15324a); --accent-halo: light-dark(#e8f2fa, #10243a);
  --ok: light-dark(#1f8a4c, #2ea062); --okbg: light-dark(#dcefe3, #173323); --warn: light-dark(#9a5b00, #e0b04f); --warnbg: light-dark(#f6ecd4, #3a2f17);
  --bad: light-dark(#b42318, #e0634f); --badbg: light-dark(#f6e0da, #3d221c); --mute: light-dark(#3d372d, #e2e2e0); --mutebg: light-dark(#e5dccd, #383838);
  --you: var(--accent-halo); --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --shadow-card: 0 0 0 1px var(--stroke), 0 1px 2px light-dark(rgba(20, 27, 45, 0.03), rgba(0, 0, 0, 0.3)), 0 10px 28px -18px light-dark(rgba(20, 27, 45, 0.14), rgba(0, 0, 0, 0.5));
  --shadow-pill: 0 0 0 1px var(--stroke), 0 1px 2px light-dark(rgba(20, 27, 45, 0.03), rgba(0, 0, 0, 0.3)); }
:root[data-theme="dark"] { color-scheme: dark; --card-img: linear-gradient(180deg, #181818 0%, #0a0a0a 100%); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --card-img: linear-gradient(180deg, #181818 0%, #0a0a0a 100%); } }
* { box-sizing: border-box; }
body { margin: 0; background-color: var(--bg); color: var(--ink); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased;
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 32px 32px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a { color: var(--accent-text); }
main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; }
header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
h1 { font-size: 20px; letter-spacing: -0.01em; margin: 0; color: var(--ink); }
h2 { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin: 30px 0 10px; color: var(--accent-text); }
.pill { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.ok { background: var(--okbg); color: var(--ok); } .warn { background: var(--warnbg); color: var(--warn); } .bad { background: var(--badbg); color: var(--bad); } .mute { background: var(--mutebg); color: var(--mute); }
.theme { display: inline-grid; grid-auto-flow: column; gap: 2px; padding: 3px; border-radius: 999px; background: var(--field); }
.theme button { font: inherit; font-size: 13px; font-weight: 600; padding: 5px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--soft); cursor: pointer; }
.theme button:hover { color: var(--ink); }
.theme button[aria-checked="true"] { background-color: var(--card); background-image: var(--card-img); color: var(--ink); box-shadow: var(--shadow-pill); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { background-color: var(--card); background-image: var(--card-img); box-shadow: var(--shadow-card); border-radius: 16px; padding: 12px 16px; }
.tile b { display: block; font-size: 24px; font-family: var(--mono); color: var(--ink); }
.tile span { color: var(--soft); font-size: 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
.card { background-color: var(--card); background-image: var(--card-img); box-shadow: var(--shadow-card); border-radius: 16px; overflow: hidden; }
.card.busy { box-shadow: 0 0 0 1.5px var(--accent), 0 10px 28px -18px light-dark(rgba(20, 27, 45, 0.14), rgba(0, 0, 0, 0.5)); }
.card.stale { box-shadow: 0 0 0 1.5px var(--warn), 0 10px 28px -18px light-dark(rgba(20, 27, 45, 0.14), rgba(0, 0, 0, 0.5)); }
.card h3 { margin: 0; padding: 12px 16px; font: 600 15px var(--mono); display: flex; justify-content: space-between; gap: 8px; align-items: center; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.fields { padding: 10px 16px; font-family: var(--mono); font-size: 13px; display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; }
.fields dt { color: var(--soft); } .fields dd { margin: 0; overflow-wrap: anywhere; }
.bars { padding: 4px 16px 12px; display: grid; gap: 7px; }
.bar { font-size: 12px; } .bar .t { display: flex; justify-content: space-between; color: var(--soft); font-family: var(--mono); gap: 8px; }
.bar .track { height: 6px; background: var(--accent-soft); border-radius: 3px; overflow: hidden; } .bar .fill { height: 100%; background: var(--accent); }
.bar .fill.warn { background: var(--warn); } .bar .fill.bad { background: var(--bad); }
.bar.cpu .t span:first-child { color: var(--accent-text); font-weight: 600; }
.foot { padding: 8px 16px; border-top: 1px solid var(--line); color: var(--soft); font-size: 12px; }
.zones { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.zone { background-color: var(--card); background-image: var(--card-img); box-shadow: var(--shadow-card); border-radius: 16px; overflow: hidden; }
.zone h4 { margin: 0; padding: 9px 14px; font: 600 13px var(--mono); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; }
.sock { padding: 7px 14px; border-bottom: 1px solid var(--line); font-size: 12.5px; }
.sock:last-child { border-bottom: 0; }
.sock.you { background: var(--you); }
.sock.moved { animation: moved 3s ease-out; }
@keyframes moved { from { background: var(--accent-soft); } }
.sock .who { font-weight: 600; font-family: var(--mono); }
.sock .meta { color: var(--soft); }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 10px; }
input[type=search] { font: inherit; padding: 7px 14px; border-radius: 999px; border: 0; box-shadow: var(--shadow-pill); background: var(--field); color: var(--ink); min-width: 240px; }
input[type=checkbox] { accent-color: var(--accent); }
label { color: var(--soft); font-size: 13px; display: inline-flex; gap: 6px; align-items: center; }
.log { background-color: var(--card); background-image: var(--card-img); box-shadow: var(--shadow-card); border-radius: 16px; font: 12.5px/1.5 var(--mono); overflow: hidden; }
.line { padding: 4px 14px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 72px 70px 1fr; gap: 10px; }
.line:last-child { border-bottom: 0; }
.line .k { font-weight: 600; } .line.drop .k, .line.system .k { color: var(--bad); } .line.back .k, .line.join .k { color: var(--ok); } .line.voice .k { color: var(--warn); } .line.zone .k { color: var(--accent-text); }
.line .when { color: var(--soft); }
.empty { padding: 14px; color: var(--soft); }
.note { color: var(--soft); font-size: 13px; max-width: 920px; margin-top: 28px; }
@media (max-width: 560px) { .line { grid-template-columns: 64px 1fr; } .line .k { grid-column: 2; } .line .text { grid-column: 1 / -1; } input[type=search] { min-width: 0; width: 100%; } }
</style>
</head>
<body>
<main>
  <header><div class="head"><h1>Durable Objects · Ooga Booga Land</h1><span id="feed" class="pill mute">Connecting</span></div>
    <div class="theme" id="theme" role="radiogroup" aria-label="Appearance"><button type="button" role="radio" data-choice="system">System</button><button type="button" role="radio" data-choice="light">Light</button><button type="button" role="radio" data-choice="dark">Dark</button></div></header>
  <section class="tiles" id="tiles"></section>
  <h2>Objects</h2>
  <section class="cards" id="cards"></section>
  <h2>Island sockets by zone</h2>
  <section class="zones" id="zones"></section>
  <h2>Log</h2>
  <div class="controls">
    <input type="search" id="filter" placeholder="Filter by login, zone or kind" aria-label="Filter the log">
    <label><input type="checkbox" id="drops"> Drops and failures only</label>
  </div>
  <section class="log" id="log"></section>
  <p class="note">Each object reports what it is doing to the Inspector, so this is the app's view, not Cloudflare's. An object only appears once it has reported since this was turned on. Sleep is inferred: a wake is the object's constructor running, and one that wakes with fewer sockets than it reported closed them while it slept or was reset. Rates are averaged since the object's previous report (every second while this page is open, every four minutes otherwise). Busy objects that go quiet for 5 minutes are marked stale. The log keeps the last 500 lines for 24 hours. Estimated CPU is a model, not a measurement: each message in costed at 1/600 s and each send out at 1/1000 s of the object's one thread, from Cloudflare's published throughput for a Durable Object (the World Map at /map shows the same). Measured CPU, memory and billing: the Cloudflare dashboard's Durable Objects metrics.</p>
</main>
<script nonce="__NONCE__">
"use strict";
var S = { objects: new Map(), events: [], limits: {}, you: null, offset: 0, zoneOf: new Map(), movedAt: new Map() };
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var now = function () { return Date.now() + S.offset; };
var dur = function (ms) {
  if (!(ms >= 0)) return "—";
  var s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  var m = Math.floor(s / 60);
  if (m < 60) return m + "m" + String(s % 60).padStart(2, "0") + "s";
  var h = Math.floor(m / 60);
  return h < 48 ? h + "h" + String(m % 60).padStart(2, "0") + "m" : Math.floor(h / 24) + "d";
};
var clock = function (t) { return new Date(t).toLocaleTimeString([], { hour12: false }); };
var num = function (n, d) { return n === undefined || n === null ? "—" : Number(n).toFixed(d || 0); };
var label = function (key) { var i = key.indexOf(":"); return key.slice(i + 1) + " : " + key.slice(0, i); };
var BUSY = { live: 1, running: 1, open: 1 };
var CPU = ${JSON.stringify(CPU_MODEL)};

// The estimated CPU of an object's messages in and sends out a second (cpu-model.js), against its one thread.
function cpuBar(r) {
  var ms = (r.in || 0) * CPU.inMs + (r.out || 0) * CPU.outMs;
  return bar("est. CPU", ms, CPU.budgetMs, "≈ " + num(ms, ms < 10 ? 1 : 0) + " ms/s of " + CPU.budgetMs + " · " + num(ms / CPU.budgetMs * 100, 1) + "% · estimate").replace('class="bar"', 'class="bar cpu"');
}

function bar(name, value, max, text) {
  var pct = max > 0 && value >= 0 ? Math.min(100, value / max * 100) : 0;
  var cls = pct >= 85 ? " bad" : pct >= 60 ? " warn" : "";
  return '<div class="bar"><div class="t"><span>' + esc(name) + '</span><span>' + esc(text) + '</span></div><div class="track"><div class="fill' + cls + '" data-w="' + pct.toFixed(1) + '"></div></div></div>';
}
function fields(list) {
  var out = "";
  for (var i = 0; i < list.length; i++) if (list[i][1] !== undefined) out += "<dt>" + esc(list[i][0]) + " =</dt><dd>" + esc(list[i][1]) + "</dd>";
  return '<dl class="fields">' + out + "</dl>";
}
function statusPill(row) {
  var s = row.status, cls = BUSY[s] ? "ok" : s === "stale" ? "warn" : "mute";
  return '<span class="pill ' + cls + '">' + esc(s === "stale" && row.was ? "stale (" + row.was + ")" : s) + "</span>";
}

function roomCard(row) {
  var st = row.state || {}, r = row.rates || {}, pk = row.peaks || {}, L = S.limits;
  var zones = st.zones ? Object.keys(st.zones).map(function (z) { return z + " " + st.zones[z]; }).join(", ") : "";
  var sfuAvg = r.sfu ? (r.sfuMs || 0) / r.sfu : 0;
  var body = fields([["sockets", st.sockets], ["in hub", st.hub], ["hidden tabs", st.hidden], ["driving", st.driving],
    ["npc host", st.host ? st.host + " · " + st.followers + " following" : "none"], ["voice", (st.speaking || 0) + " speaking · " + (st.listening || 0) + " listening"],
    ["doors", st.doors], ["zones", zones || "—"], ["flush", st.flushPending ? "pending" : "idle"], ["next alarm", st.alarmAt ? "in " + dur(st.alarmAt - now()) : "none"],
    ["reports lost", row.failed || 0], ["cleanup running", st.cleanupBusy || 0],
    ["cleanup attempt", st.cleanupAttempt ? st.cleanupAttempt.operation + " · " + dur(now() - st.cleanupAttempt.at) + " ago · " + (st.cleanupAttempt.finished ? "finished" : "pending") + " · status " + st.cleanupAttempt.status : "none"],
    ["alarm started", st.alarmStarted ? dur(now() - st.alarmStarted) + " ago" : "none"],
    ["alarm finished", st.alarmFinished ? dur(now() - st.alarmFinished) + " ago" : "none"],
    ["alarm registered", st.alarmRegisteredAt ? (st.alarmRegisteredAt < now() ? "overdue " + dur(now() - st.alarmRegisteredAt) : "in " + dur(st.alarmRegisteredAt - now())) : "none"]]);
  var bars = cpuBar(r) + bar("players", st.players, st.maxPlayers, (st.players || 0) + " / " + st.maxPlayers)
    + bar("messages in", r.in || 0, L.requestsPerSecond, num(r.in, 1) + "/s of ~" + L.requestsPerSecond)
    + bar("snapshots", r.snapshots || 0, st.tickHz, num(r.snapshots, 1) + " of " + st.tickHz + " Hz · worst " + num(pk.late) + " ms late")
    + bar("sent", r.out || 0, L.requestsPerSecond * 4, num(r.out, 1) + " msg/s · " + num((r.outBytes || 0) / 1024, 1) + " KB/s")
    + bar("npc frames in", r.npc || 0, 20, num(r.npc, 1) + "/s · relayed " + num(r.npcOut, 1) + "/s · " + num((r.npcBytes || 0) / 1024, 1) + " KB/s of the sent")
    + bar("pulled voices", st.maxPulled || 0, st.pullCap, (st.pulled || 0) + " total · max " + (st.maxPulled || 0) + " / " + st.pullCap)
    + bar("voice cleanup", st.cleanup || 0, st.cleanupCap, (st.cleanup || 0) + " / " + st.cleanupCap)
    + (st.attachMax !== undefined ? bar("largest attachment", st.attachMax, L.attachmentBytes, num(st.attachMax / 1024, 1) + " / " + (L.attachmentBytes / 1024) + " KB") : "")
    + bar("sfu", sfuAvg, 5000, num(r.sfu, 2) + " calls/s · avg " + num(sfuAvg) + " ms · worst " + num(pk.sfuMax) + " ms · " + num(r.sfuFail, 2) + " failed/s")
    + bar("voice requests", r.voiceRefused || 0, Math.max(r.voiceOps || 0, 0.01), num(r.voiceOps, 2) + "/s · " + num(r.voiceRefused, 2) + " refused/s");
  return body + '<div class="bars">' + bars + "</div>";
}
function gameCard(row) {
  var st = row.state || {}, r = row.rates || {}, pk = row.peaks || {};
  return fields([["running", st.running ? "yes" : "no"], ["ticks", num(r.ticks, 1) + "/s · worst " + num(pk.late) + " ms late"],
    ["last save", st.savedAt ? dur(now() - st.savedAt) + " ago" : "—"], ["reports lost", row.failed || 0]])
    + '<div class="bars">' + cpuBar(r) + bar("sockets", st.sockets, st.maxSockets, (st.sockets || 0) + " / " + st.maxSockets)
    + bar("messages in", r.in || 0, S.limits.requestsPerSecond, num(r.in, 1) + "/s") + "</div>";
}
// Ooga Chat's audience (#669): one object for both zones, its counts and caps, and the media cleanup it owes.
function audienceCard(row) {
  var st = row.state || {}, r = row.rates || {}, pk = row.peaks || {}, z = st.zones || {}, lim = st.limits || {}, cl = st.cleanup || {}, md = st.media || {};
  var fl = st.flags || {}, on = Object.keys(fl).filter(function (k) { return fl[k]; }).join(", ");
  var sfuAvg = r.sfu ? (r.sfuMs || 0) / r.sfu : 0;
  var fails = (r.sfu429 || 0) + (r.sfu5xx || 0) + (r.sfu4xx || 0) + (r.sfuTimeout || 0);
  var body = fields([["connections", (st.connections || 0) + " / " + (lim.connections || 0)], ["switches", on || "none"],
    ["media", "sfu " + (md.sfu || "—") + " · cleanup " + (md.cleanup || "—")], ["island panels watching", st.panels || 0],
    ["admitted", num(r.admitGithub, 2) + "/s GitHub · " + num(r.admitX, 2) + "/s X"],
    ["refused", num(r.refuseFull, 2) + "/s full · " + num(r.refuseIdentity, 2) + "/s too many tabs · " + num(r.refusePrincipal, 2) + "/s bad principal"],
    ["closed", num(r.closeAuth, 2) + "/s auth · " + num(r.closeBad, 2) + "/s bad · " + num(r.closeProtocol, 2) + "/s protocol · " + num(r.closeOff, 2) + "/s switched off · " + num(r.gone, 2) + "/s by clients · " + num(r.silent, 2) + "/s silent"],
    ["speakers", num(r.speakerGranted, 2) + "/s granted · " + num(r.speakerRefused, 2) + "/s refused"],
    ["reactions", num(r.reactions, 2) + "/s · " + num(r.reactionsLimited, 2) + "/s over the limit"],
    ["resyncs", num(r.resync, 2) + "/s"], ["reports lost", row.failed || 0]]);
  var bars = "";
  ["main", "dsb"].forEach(function (k) {
    var q = z[k] || {};
    bars += bar(k + " listeners", q.listeners || 0, lim.listeners, (q.listeners || 0) + " / " + lim.listeners + " · rev " + (q.rev || 0))
      + bar(k + " speakers", q.chatSpeakers || 0, lim.chatSpeakers, (q.chatSpeakers || 0) + " / " + lim.chatSpeakers + " cloud · " + (q.worldSpeakers || 0) + " island");
  });
  bars += bar("sent", r.deltaFrames || 0, S.limits.requestsPerSecond * 4, num(r.deltaFrames, 1) + " deltas/s · " + num(r.snapshots, 2) + " snapshots/s · largest " + num((pk.snapshotBytesMax || 0) / 1024, 1) + " KB")
    + bar("sfu", sfuAvg, 5000, num(r.sfu, 2) + " calls/s · avg " + num(sfuAvg) + " ms · worst " + num(pk.sfuMsMax) + " ms · " + num(fails, 2) + " failed/s (" + num(r.sfu429, 2) + " 429)")
    + bar("media cleanup", cl.jobs || 0, 64, (cl.jobs || 0) + " / 64 · oldest " + dur(cl.oldestMs || 0) + " · " + num(r.cleanupExpired, 3) + " given up/s")
    + bar("media requests", r.mediaRefused || 0, Math.max((r.media || 0) + (r.mediaRefused || 0) + (r.mediaBusy || 0), 0.01), num(r.media, 2) + "/s · " + num(r.mediaBusy, 2) + " busy/s · " + num(r.mediaRefused, 2) + " refused/s");
  return body + '<div class="bars">' + bars + "</div>";
}
function edgeCard(row) {
  var since = now() - 3600000, n = 0;
  for (var i = 0; i < S.events.length; i++) if (S.events[i].key === row.key && S.events[i].at >= since) n++;
  return fields([["refusals, last hour", n]]);
}

function renderCards() {
  var rows = Array.from(S.objects.values()).sort(function (a, b) { return (BUSY[b.status] ? 1 : 0) - (BUSY[a.status] ? 1 : 0) || b.lastSeen - a.lastSeen; });
  if (!rows.length) { $("cards").innerHTML = '<div class="empty">No object has reported yet.</div>'; return; }
  var html = "";
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], t = now();
    var inner = row.cls === "Room" ? roomCard(row) : row.cls === "GameHost" ? gameCard(row) : row.cls === "Audience" ? audienceCard(row) : edgeCard(row);
    html += '<article class="card' + (BUSY[row.status] ? " busy" : row.status === "stale" ? " stale" : "") + '"><h3><span>' + esc(label(row.key)) + "</span>" + statusPill(row) + "</h3>" + inner
      + '<div class="foot">seen ' + dur(t - row.lastSeen) + " ago · known for " + dur(t - row.firstSeen)
      + (row.wakes ? " · woke " + row.wakes + "×, last after " + dur(row.slept) + " asleep" : "") + (row.version ? " · version " + esc(row.version.slice(0, 8)) : "") + "</div></article>";
  }
  $("cards").innerHTML = html;
  // Widths through the style object: the content policy allows no style attributes.
  var fills = $("cards").querySelectorAll("[data-w]");
  for (var j = 0; j < fills.length; j++) fills[j].style.width = fills[j].getAttribute("data-w") + "%";
}

function renderZones() {
  var room = null;
  S.objects.forEach(function (row) { if (row.cls === "Room" && (!room || row.lastSeen > room.lastSeen)) room = row; });
  var rows = room && room.state && room.state.rows;
  if (!rows) { $("zones").innerHTML = '<div class="empty">' + (room ? "Socket rows arrive with the room's next report while this page is open." : "The island room has not reported yet.") + "</div>"; return; }
  if (!rows.length) { $("zones").innerHTML = '<div class="empty">Nobody is in the island room.</div>'; return; }
  var groups = {}, t = now();
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i];
    if (S.zoneOf.has(s.id) && S.zoneOf.get(s.id) !== s.zone) S.movedAt.set(s.id, t);
    S.zoneOf.set(s.id, s.zone);
    (groups[s.zone] = groups[s.zone] || []).push(s);
  }
  var html = "";
  Object.keys(groups).sort().forEach(function (z) {
    var list = groups[z].sort(function (a, b) { return a.login < b.login ? -1 : 1; });
    html += '<div class="zone"><h4><span>' + esc(z) + "</span><span>" + list.length + "</span></h4>";
    for (var i = 0; i < list.length; i++) {
      var s = list[i], heard = t - s.heard, you = S.you && s.id === S.you.id, moved = t - (S.movedAt.get(s.id) || 0) < 3000;
      html += '<div class="sock' + (you ? " you" : "") + (moved ? " moved" : "") + '"><span class="who">' + esc(s.login) + "</span>"
        + (s.host ? ' <span class="pill ok">npc host</span>' : "") + (you ? ' <span class="pill mute">you</span>' : "")
        + '<div class="meta">' + esc((s.body || "no Ooga") + " · " + (s.hub ? "hub" : "away from hub") + (s.visible ? "" : " · tab hidden")
        + " · voice " + s.voice + (s.voice !== "off" && s.muted ? " (muted)" : "") + (s.pulled ? " · hears " + s.pulled : "")
        + " · on " + dur(t - s.since) + " · heard " + dur(heard) + " ago") + "</div></div>";
    }
    html += "</div>";
  });
  $("zones").innerHTML = html;
}

function describe(e) {
  var f = e.fields || {}, obj = label(e.key), who = (e.login || "") + (e.key.indexOf("Room:") === 0 || !e.login ? "" : " @ " + obj);
  switch (e.kind) {
    case "join": return ["join", "join", who + (f.replaced ? " · replaced their older tab" : "") + (f.zone ? " · in " + f.zone : "")];
    case "full": return ["drop", "refused", who + " · room full"];
    case "leave": {
      var how = f.reason || "closed";
      if (f.code) how += " " + f.code + (f.clean === true ? ", clean" : f.clean === false ? ", not clean" : "");
      if (f.said) how += ' · page said "' + f.said + '"';
      if (f.error) how += " · " + f.error;
      return ["drop", "drop", who + " · " + how + (f.held ? " · not back while held" : "") + (f.zone ? " · in " + f.zone : "") + (f.on !== undefined ? " · on " + dur(f.on) : "")
        + (f.heard !== undefined ? " · last heard " + dur(f.heard) + " before" : "") + (f.voice ? " · in voice" : "") + (f.mass ? " · mass drop (" + f.mass + ")" : "")];
    }
    case "hold": {
      var lost = f.error ? "socket error · " + f.error : (f.code ? "closed " + f.code + (f.clean ? ", clean" : ", not clean") : f.said === "resumed" ? "came back on a new socket" : "closed");
      return ["drop", "held", who + " · " + lost + (f.said && f.said !== "resumed" ? ' · page said "' + f.said + '"' : "") + " · held for their page" + (f.zone ? " · in " + f.zone : "") + (f.voice ? " · in voice" : "")];
    }
    case "resume": return ["back", "resumed", who + " · back after " + dur(f.away) + ", nobody else saw them go"];
    case "back": return ["back", "back", who + " · down " + dur(f.down) + " · browser saw " + (f.code || "no close") + (f.clean ? ", clean" : f.code ? ", not clean" : "") + " · page says " + f.why];
    case "zone": return ["zone", "zone", who + " · " + f.from + " → " + f.to];
    case "visible": return ["zone", "tab", who + " · " + (f.visible ? "shown" : "hidden")];
    case "host": return ["zone", "host", (f.login || "none") + " · " + (f.followers || 0) + " following"];
    case "kick": return ["drop", "kick", who + " · " + f.reason + " · " + obj];
    case "voice-fail": return ["voice", "voice", who + " · " + f.op + " failed · SFU " + (f.status || "no answer") + (f.code ? " " + f.code : "") + (f.ms !== undefined ? " · " + f.ms + " ms" : "")];
    case "voice-refused": return ["voice", "voice", who + " · " + f.op + " refused " + f.status + (f.error ? " · " + f.error : "")];
    case "voice-restart": return ["voice", "voice", who + " · restarting voice: connection " + f.why];
    case "limited": return ["drop", "limited", who + " · " + f.which + " limiter refused"];
    case "wake-lost": return ["system", "system", f.deployed ? obj + " restarted for a new version · " + f.lost + " connections lost"
      : obj + " woke with " + f.lost + " fewer connections (closed while it slept, or it was reset) · " + f.kept + " kept"];
    case "dropped": return ["system", "system", obj + " · " + f.lines + " log lines dropped in a burst"];
    case "error": return ["drop", "error", f.where === "restore" ? obj + " · stored " + f.key + (f.dropped ? " dropped" : f.unread ? " unread, room reset" : " kept") + " · " + f.name
      : f.where === "drop" ? who + " · leaving: " + f.t + " threw " + f.name
      : who + " · " + f.t + " message threw " + f.name + " · socket closed"];
    default: return ["zone", e.kind, who];
  }
}

function markMass() {
  var leaves = S.events.filter(function (e) { return e.kind === "leave"; });
  for (var i = 0; i < leaves.length; i++) {
    var n = 0;
    for (var j = 0; j < leaves.length; j++) if (leaves[j].key === leaves[i].key && Math.abs(leaves[j].at - leaves[i].at) <= 2000) n++;
    if (n >= 3) { leaves[i].fields = leaves[i].fields || {}; leaves[i].fields.mass = n; }
  }
}

function renderLog() {
  S.events = S.events.filter(function (e) { return e.at > now() - 86400000; });
  var q = $("filter").value.trim().toLowerCase(), drops = $("drops").checked, html = "", shown = 0;
  for (var i = S.events.length - 1; i >= 0 && shown < 500; i--) {
    var e = S.events[i], d = describe(e);
    if (drops && d[0] !== "drop" && d[0] !== "system" && d[0] !== "voice") continue;
    if (q && (e.kind + " " + d[2]).toLowerCase().indexOf(q) < 0) continue;
    html += '<div class="line ' + d[0] + '"><span class="when">' + clock(e.at) + '</span><span class="k">' + esc(d[1]) + '</span><span class="text">' + esc(d[2]) + "</span></div>";
    shown++;
  }
  $("log").innerHTML = html || '<div class="empty">No lines' + (q || drops ? " match." : " yet.") + "</div>";
}

function renderTiles() {
  var awake = 0, sockets = 0, voice = 0, drops = 0, hour = now() - 3600000;
  S.objects.forEach(function (row) {
    if (BUSY[row.status]) awake++;
    var st = row.state || {};
    if (row.cls === "Room" || row.cls === "GameHost") sockets += st.sockets || 0;
    if (row.cls === "Room") voice += (st.speaking || 0) + (st.listening || 0);
  });
  for (var i = 0; i < S.events.length; i++) if (S.events[i].kind === "leave" && S.events[i].at >= hour) drops++;
  $("tiles").innerHTML = [["busy objects", awake + " / " + S.objects.size], ["sockets", sockets], ["in voice", voice], ["drops, last hour", drops], ["log lines", S.events.length]]
    .map(function (t) { return '<div class="tile"><b>' + esc(t[1]) + "</b><span>" + esc(t[0]) + "</span></div>"; }).join("");
}

function render() { renderTiles(); renderCards(); renderZones(); renderLog(); }

function apply(msg) {
  S.offset = msg.now - Date.now();
  if (msg.t === "snapshot") {
    S.objects = new Map(); S.events = msg.events.slice(); S.limits = msg.limits; S.you = msg.you;
    msg.objects.forEach(function (row) { S.objects.set(row.key, row); });
  } else {
    msg.remove.forEach(function (key) { S.objects.delete(key); });
    msg.upsert.forEach(function (row) { S.objects.set(row.key, row); });
    S.events = S.events.concat(msg.events);
    if (S.events.length > 500) S.events = S.events.slice(-500);
  }
  markMass();
  render();
}

var socket = null, retry = 0, pinger = 0;
function setFeed(text, cls) { var el = $("feed"); el.textContent = text; el.className = "pill " + cls; }
function connect() {
  setFeed(retry ? "Reconnecting" : "Connecting", "warn");
  socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/inspect/ws");
  socket.onopen = function () { retry = 0; setFeed("Live", "ok"); pinger = setInterval(function () { if (socket.readyState === 1) socket.send("ping"); }, 30000); };
  socket.onmessage = function (ev) { if (ev.data === "pong") return; apply(JSON.parse(ev.data)); };
  socket.onclose = function (ev) {
    clearInterval(pinger);
    if (ev.code === 4000) { setFeed("Not allowed", "bad"); return; }
    setFeed("Reconnecting", "warn");
    setTimeout(connect, Math.min(15000, 1000 * Math.pow(2, retry++)));
  };
}
// Appearance: System follows the system; Light and Dark are kept in this browser (localStorage ooga-theme, shared with /map).
function choose(choice) {
  try { if (choice === "system") localStorage.removeItem("ooga-theme"); else localStorage.setItem("ooga-theme", choice); } catch (e) {}
  if (choice === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", choice);
  var shown = document.documentElement.getAttribute("data-theme") || "system", buttons = $("theme").querySelectorAll("button");
  for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute("aria-checked", String(buttons[i].getAttribute("data-choice") === shown));
}
$("theme").addEventListener("click", function (ev) { var b = ev.target.closest("button"); if (b) choose(b.getAttribute("data-choice")); });
choose(document.documentElement.getAttribute("data-theme") || "system");
$("filter").addEventListener("input", renderLog);
$("drops").addEventListener("change", renderLog);
setInterval(function () { if (!document.hidden) { renderTiles(); renderCards(); renderZones(); renderLog(); } }, 1000);
render();
connect();
</script>
</body>
</html>
`;
