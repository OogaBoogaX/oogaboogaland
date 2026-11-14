// Ooga Chat's control plane at the launch envelope (#669, docs/ooga-chat-operations.md): `node scripts/ooga-chat-capacity.mjs`.
// Runs the Audience's own roster model (worker/src/audience-model.js) in this process, with no network, socket or SFU,
// at 10, 100 and 500 listeners a zone in both zones, joined in a burst (one commit) and staggered (a commit each), then
// a tenth leaving and coming back, and prints what the object would send: the snapshot a joiner gets, the delta bytes
// fanned out to the zone, the model's own time, and reactions at the zone's limit. It measures the roster's cost, not
// Cloudflare's: real sockets, hibernation, the SFU and phones are the staging matrix's. `--cost` prints the egress model
// with the planning formula; `--json` prints the figures as JSON for a run record.

import { appRow, createAudience, ZONES, zoneReactHz } from "../worker/src/audience-model.js";

export const SIZES = [10, 100, 500];
// A reaction frame as the Audience sends it; a zone's rate is its fan-out budget's (audience-model.js `zoneReactHz`).
const REACTION_FRAME = JSON.stringify({ type: "reaction", eventId: "r1763121000123", participantId: "gh:123456789", zone: "main",
  epoch: 1763120000000, emoji: "🔥", at: 1763121000123, expiresAt: 1763121002723 }).length;

const info = (n) => n % 5 === 0
  ? { provider: "x", login: `listener_${n}`, display: `Listener ${n}`, avatar: `/api/chat/avatar/pr_${String(n).padStart(22, "a")}/0123456789abcdef` }
  : { provider: "github", login: `listener-${n}`, display: `Listener ${n}`, avatar: `/api/chat/avatar/pr_${String(n).padStart(22, "a")}/0123456789abcdef` };
const idOf = (n) => (n % 5 === 0 ? `x:${1700000000000000000n + BigInt(n)}` : `gh:${100000 + n}`);

/** Delta frames as the Audience fans them out: one JSON a delta, sent to every connection in its zone. */
const fanout = (a, deltas) => {
  let bytes = 0, frames = 0;
  for (const d of deltas) {
    const text = JSON.stringify({ type: "delta", zone: d.zone, epoch: d.epoch, base: d.base, revision: d.rev, upsert: d.upsert.map((row) => appRow(row)), remove: d.remove });
    let here = 0;
    for (const c of a.conns.values()) if (c.zone === d.zone) here++;
    bytes += text.length * here; frames += here;
  }
  return { bytes, frames };
};

const snapshotBytes = (a, zone) => JSON.stringify({ type: "snapshot", zone, epoch: a.epoch, revision: a.snapshot(zone).rev,
  participants: a.snapshot(zone).rows.map((row) => appRow(row)), you: null, connection: "00000000-0000-0000-0000-000000000000",
  limits: { listeners: 500, chatSpeakers: 8 }, features: [] }).length;

/** One run: `size` listeners in each zone, joined in a burst or staggered, then a tenth churned. */
export const run = (size, staggered) => {
  let now = 1_800_000_000_000;
  const a = createAudience({ epoch: now, clock: () => now, limits: { listeners: Math.max(size, 500), chatSpeakers: 8, connectionsPerIdentity: 3, connections: Math.max(2 * size + 10, 1200) } });
  const total = { bytes: 0, frames: 0 };
  const started = performance.now();
  let n = 0;
  for (const zone of ZONES) {
    for (let i = 0; i < size; i++, n++) {
      now += 7;
      a.connect({ connId: `c${n}`, id: idOf(n), eligible: n % 5 !== 0 }, info(n));
      a.join(`c${n}`, zone);
      if (staggered) { const f = fanout(a, a.commit()); total.bytes += f.bytes; total.frames += f.frames; }
    }
  }
  if (!staggered) { const f = fanout(a, a.commit()); total.bytes += f.bytes; total.frames += f.frames; }
  const joinMs = performance.now() - started;
  const churnStart = performance.now();
  const churn = { bytes: 0, frames: 0 };
  for (let i = 0; i < n; i += 10) {
    now += 11;
    a.disconnect(`c${i}`);
    const f1 = fanout(a, a.commit()); churn.bytes += f1.bytes; churn.frames += f1.frames;
    a.connect({ connId: `r${i}`, id: idOf(i), eligible: i % 5 !== 0 }, info(i));
    a.join(`r${i}`, ZONES[i < size ? 0 : 1]);
    const f2 = fanout(a, a.commit()); churn.bytes += f2.bytes; churn.frames += f2.frames;
  }
  const churnMs = performance.now() - churnStart;
  return {
    size, staggered, connections: a.conns.size,
    listeners: Object.fromEntries(ZONES.map((zone) => [zone, a.counts(zone).listeners])),
    snapshotBytes: snapshotBytes(a, ZONES[0]),
    join: { ms: +joinMs.toFixed(2), bytes: total.bytes, frames: total.frames },
    churn: { leftAndBack: Math.ceil(n / 10), ms: +churnMs.toFixed(2), bytes: churn.bytes, frames: churn.frames },
    reactionsAtLimit: { perSecond: +zoneReactHz(size).toFixed(1), framesPerSecond: Math.round(zoneReactHz(size) * size), bytesPerSecond: Math.round(zoneReactHz(size) * size * REACTION_FRAME) },
  };
};

/** The planning formula: listeners × subscribed tracks × bits a second × seconds ÷ 8 ÷ 1e9, before protocol overhead. */
export const egressGB = (listeners, tracks, bitsPerSecond, seconds) => listeners * tracks * bitsPerSecond * seconds / 8 / 1e9;
export const COST_PER_GB = 0.05;
export const COST_CASES = [
  { listeners: 500, tracks: 8, kbps: 32, hours: 1 },
  { listeners: 1000, tracks: 8, kbps: 32, hours: 1 },
  { listeners: 1000, tracks: 40, kbps: 32, hours: 1 },
  { listeners: 1000, tracks: 4, kbps: 24, hours: 2 },
];

const human = (bytes) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(2)} MB` : `${(bytes / 1e3).toFixed(1)} KB`;

const main = () => {
  const args = new Set(process.argv.slice(2));
  if (args.has("--cost")) {
    const rows = COST_CASES.map((c) => { const gb = egressGB(c.listeners, c.tracks, c.kbps * 1000, c.hours * 3600); return { ...c, gb: +gb.toFixed(1), usd: +(gb * COST_PER_GB).toFixed(2) }; });
    if (args.has("--json")) { console.log(JSON.stringify(rows, null, 2)); return; }
    console.log("Egress before protocol overhead and before the shared 1,000 GB/month SFU+TURN allowance, at $0.05/GB:");
    for (const r of rows) console.log(`  ${String(r.listeners).padStart(5)} listeners × ${String(r.tracks).padStart(2)} tracks × ${r.kbps} kbps × ${r.hours} h = ${String(r.gb).padStart(6)} GB  $${r.usd.toFixed(2)}`);
    return;
  }
  const results = [];
  for (const size of SIZES) for (const staggered of [false, true]) results.push(run(size, staggered));
  if (args.has("--json")) { console.log(JSON.stringify({ node: process.version, results }, null, 2)); return; }
  console.log(`Audience roster model, both zones, Node ${process.version}`);
  for (const r of results) {
    console.log(`  ${String(r.size).padStart(3)}/zone ${r.staggered ? "staggered" : "burst    "}: snapshot ${human(r.snapshotBytes)}, joins ${human(r.join.bytes)} in ${r.join.frames} frames (${r.join.ms} ms), `
      + `churn of ${r.churn.leftAndBack} ${human(r.churn.bytes)} in ${r.churn.frames} frames (${r.churn.ms} ms), `
      + `reactions at the limit ${r.reactionsAtLimit.perSecond}/s = ${r.reactionsAtLimit.framesPerSecond} frames/s (${human(r.reactionsAtLimit.bytesPerSecond)}/s)`);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) main();
