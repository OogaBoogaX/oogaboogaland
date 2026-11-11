// The visitor's account and the island room, when the page is served by the Cloudflare Worker. One look
// at /api/me on start; a signed-in visitor then holds one socket to /room for the page life. A page with
// no backend behind it (GitHub Pages, a file, `npm run serve`) gets no JSON from /api/me and stays as it
// always was: `backend` false, nothing shown, no socket. Like the live feeds it stays off under nosim and
// can be disabled with net=0; the director starts it. The same look says whether the Worker takes real
// donations (`state.donations`), which the director hands to donations.js, and whether it answers Tess's questions
// (`state.tess`).
//
// The room answers who else is on the island: `remotes` (id → { login, display, body, zone, voice, muted, x, y, z, yaw }),
// updated in place from its snapshots (up to 15 a second while anyone moves). A scene reports the actor the visitor drives with `setBody`
// (null when none) and its feet and heading with `sendPose`, which throttles itself. A newer tab of the
// same account kicks this one with `replaced`: it stops reconnecting until `rejoin`. `setZone` reports
// the place the driven Ooga is in (out on the island, HQ, a cave), which decides who hears whom.
//
// Who drives which Ooga, on the page served by the Worker (`mayDrive`; the room enforces the same
// ownership through its own copy of the cast): a signed-in contributor drives only their own Ooga, and
// nobody else drives it while they are here. Signed-out visitors drive only their remembered
// character or their default local Ooga. Verified account bindings use GitHub IDs; other ownership
// keys on the GitHub login (`github`, else the handle). A claim the room refuses, or an owner arriving, lands as `released`.
// A body is its Ooga's canonical handle, or `gorilla:<handle>` for that Ooga's companion. Signed-in
// visitors drive only their own gorilla; signed-out pages use only their assigned companion locally.
// The NPC host: the room elects one page showing the island (`setHub`, which also counts a hidden tab
// out) to run the Oogas for everyone. `state.hostId` names it; the host sends its binary pose frames with
// `sendNpc`, and every other page reads the latest one from `npcFrame` (with `state.npcVersion` counting).
// `state.followers` is how many pages follow the host; with none, the host sends nothing.
// A tab hidden for HIDDEN_PAUSE_MS leaves the room (`paused`, voice stopped) and comes back when it is
// looked at again, so a forgotten tab does not hold the room, the host role or voice.
// The room's clock: `serverNow()` estimates it from the timestamps on `welcome` and `state`, keeping the
// sample that arrived fastest (the least delayed), and `state.loopEpoch` is when the pile's shared
// sound loop started, so every page can play the same moment of it.
// The roster's marks (who is in voice, muted, the host, where) follow `subscribeRoster`, which also fires on a
// body, voice or zone change; `subscribe` stays for the account and the room. `setMuted` tells the room this
// page muted its microphone, and `state.body` is the actor this page reports driving.
// `setHealth` reports the driven actor's health (on a change, at most HP_MS apart), which other pages draw over
// it; remote records carry `hp` and `ko`.
// Gorilla poses optionally add `g`: flags (air, biped, climb, run, lab, office, sleep), speed, climb stride,
// climb direction, climb side and swim. Each remote reuses its six values; ordinary poses keep their format.
// The EntropyLab chalkboard (chalk-board.js): a room whose `features` hold its FEATURE sends the board after
// `welcome`, and `state.chalk` keeps it as `{ board, editor, session }` from then on, current in every scene, from
// the holder's edits; null leaves the page its own board. `takeChalk` asks to hold it (the room answers with
// `chalk-lock`, or a refusal), `chalkEdit` applies one of the holder's own edits and queues it, `flushChalk` sends
// the queue and `dropChalk` lets go. `subscribeChalk` hears `fn(kind, detail)`: "board" (a new board, or none),
// "lock" (who holds it changed), "op" (another's edit, already applied) and "refused" ({ why, name }).
// DSB Land's wallets: `sendWallet` sends one of the visitor's own devices' events (protocol.js WALLET_CAP) and
// `subscribeWallets` hears others' `wallet` and `wallets` messages as they come.
// An Ooga's pose may add `j`, its jetpack for other pages to draw (`crew.jetFlags`: 1 while worn, plus the flame's
// power times 2), sent on a change; remote records carry it as `jet`, 0 for none. It may add `w`, its weapons
// (`crew.weaponFlags`: the one in hand, aiming, the gun's rounds), the same way; remote records carry it as `weapon`.
// `sendShot` and `sendSwing` report the visitor's own Ooga firing a banana (from and to) and striking, which the
// room relays to players in the same zone (from the ghost arena, to the arena and its hallway, #422); `subscribeShots`
// hears theirs as `fn(id, a)` and `subscribeSwings` as `fn(id)`, for drawing and the hunt's shot sound only, and, in the hub, shots rock the hammock.
// Ooga Chat: `sendChat` sends a line (validated by chat-policy.js, CHAT_MAX UTF-16 units at most) while the
// room is live; `subscribeChat` hears the room's lines as `fn(lines, joined, receipt)`: one new line, or on every
// (re)join the lines the room still holds, which chat.js merges; a rejection keeps the draft. The room names each line's
// speaker; the page keeps nothing (chat.js shows them).
// Private conversations (#188): `sendPrivate(op, to, d, n)` hands the room an invite, accept, decline, block or end
// for player `to`, or a sealed frame `d` (base64) numbered `n`, while the room is live and says it relays them
// (`state.privateChat`); `subscribePrivate` hears the room's `pm` messages as they come, and `{ op: "lost" }` when
// the room stops being live, which ends any conversation (private-chat.js keeps it).
// The Timechain Sphere's doorway (docs/timechain-sphere/doorway-contract.md): a room that knows it says so in `welcome`
// (`features` holds "door", `state.doorway`). `askDoor(dir, room)` asks for the shared doorway after a crossing is
// prepared, at most one request at a time; the room answers `wait` or `grant { cycle, exp }`, the page starts its
// crossing with `goDoor(cycle)` (the room then tells everyone `transit { cycle, actor, door, dir, at, exp }`) and ends
// it with `doneDoor(cycle)`, or gives it back with `cancelDoor()`. `passDoor(door, dir)` announces a walk through a
// room's own doors, which nobody reserves. `subscribeDoor` hears all of it, and `{ t: "door", op: "lost" }` when the
// socket goes. Without the feature these send nothing and return false, and the sphere crosses on this page alone.
// `recheck` looks at /api/me again after a look that went unanswered (the keypad's Retry), bounded as the first.
// `setPokerVoice(table)` scopes Ember Den voice to one table, or the floor when null, without moving the body; `state.pokerVoice`
// holds it and the roster subscribers hear the change.
// Where players stand, for the live players tab (players.js): a remote's `poseZone` is the zone its position was reported
// in, so a player who changed zone has none there until they move (the room re-sends the last pose it holds, from the
// zone before), and one who let go of their Ooga keeps the last. `state.self` is this page's own last reported
// position and the zone it was in, kept after letting go. `subscribeMoves` hears positions change: the room's
// snapshots and this page's own reports, a few times a second at most, nothing while nobody moves.
// Reactions (reactions.js, reaction-policy.js): a room whose `features` hold REACT_FEATURE (`state.reactions`) takes
// `sendReaction(emoji)`, an emoji shown over this page's driven body for a moment, relayed to the pages in its zone,
// and `setHand(on, tone, emoji)`, one persistent slot (the raised hand by default), kept by the room for everyone
// (`hand`, `handTone` and `handEmoji` on remote records and `state`, sent again after a reconnect, lowered on signing out).
// `subscribeReactions` hears `fn(id, emoji)` for a
// remote player's reaction, and for this page's own as id 0, as it is sent; a hand going up or down is a roster change.
// Both spend one bucket mirroring the room's, a little short of it, so neither is ever shown here and dropped there;
// `setHand` refuses (false, nothing changed) when it is empty, and a hand change the room still refuses comes back as
// this page's own `hand`, which puts `state.hand` back to what everyone else sees.
// A crossing (#392, voice-blend.js): `setBlend(to, t)` says the driven body is `t` (0 to 1) of the way toward `to`
// (null for none): in the main world the level below it is heading down to, whatever its zone, elsewhere the place next
// to its zone's. `state.blendTo` and `state.blendT` keep it exact for this page's own volumes; the room gets it in
// BLEND.STEPS steps, at most BLEND_MS apart, and every remote record carries the other players' steps (`blendTo`,
// `blendK`). Between two zones of the main world a crossing stands and every voice stays as it is; any other next zone
// ends it, unless it is the place being crossed into, which turns the crossing round here as the room does (the room's
// `blend` after it says the same) and keeps the voices this page hears, since it already plays them.
// `subscribePresence` hears `fn(rec, true)` for a player who joins the room while this page is in it, never for those
// already there on this page's (re)join, and `fn(rec, false)` when one leaves (players.js names the joins, #430).
// Voice links: a room whose `features` hold LINK_FEATURE (`state.voiceLinks`) keeps asks to hear another player in any
// zone. `voiceLink(id)` is where this page stands with them ("none", "asked" or "linked"), from the room's `links` alone
// (`state.linkWants`, `state.linked`), and `toggleVoiceLink(id)` asks or takes this page's ask back. `linkEveryone()`
// (the L key) has the room link this page with everyone here who has asked it or, with nobody waiting, take back all of
// its asks; only the room knows who has asked. Moving to another place lets go of every voice but the linked ones, which
// never drop.
// Exports voiceLink, toggleVoiceLink, linkEveryone, start, recheck, subscribe, subscribeRoster, subscribeMoves, subscribeChat, subscribePrivate, subscribeChalk, subscribeWallets, subscribeShots, subscribeSwings, subscribePresence, subscribeDoor, dispose, login, logout, setDisplay, rejoin, setBody, setZone, setBlend, setPokerVoice, setHub,
// setMuted, setHealth, sendNpc, sendChat, sendPrivate, npcFrame, sendPose, takeChalk, dropChalk, chalkEdit, flushChalk, sendWallet, sendShot, sendSwing, askDoor, goDoor, doneDoor, cancelDoor, passDoor, mayDrive, mayDriveGorilla,
// ownCharacter, characterOf, gorillaBody, bodyName, bodyKind, serverNow, remotes, state, CHAT_MAX and CHAT_KEEP.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const LOGIN_COOKIE = "ooga-last-github";
  const validLogin = login => typeof login === "string" && /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(login) && !login.includes("--");
  const rememberedLogin = () => {
    try {
      const value = document.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(LOGIN_COOKIE + "="))?.slice(LOGIN_COOKIE.length + 1);
      return validLogin(value) ? value.toLowerCase() : null;
    } catch { return null; }
  };
  const rememberLogin = login => {
    if (!validLogin(login)) return;
    try { document.cookie = `${LOGIN_COOKIE}=${login.toLowerCase()}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; }
    catch { /* A denied cookie leaves this visit's authenticated account usable. */ }
  };
  let localCharacter = null;
  const POSE_MS = 1000 / 10;
  // Health in steps of the smallest hit, a few reports a second at most; the room's own bounds for poses.
  const HP_MS = 250, HP_STEP = 4, BOUND_XZ = 160, BOUND_Y_MIN = -130, BOUND_Y_MAX = 100;
  const PING_MS = 10000, PING_MISSES = 3;
  const HIDDEN_PAUSE_MS = 5 * 60000;
  // How long before leaving a hidden tab still in voice hears each warning.
  const HIDDEN_WARN_BEFORE_MS = [30000, 15000];
  const BACKOFF_MS = 500, BACKOFF_MAX_MS = 15000;
  // The room's own limits (worker/src/protocol.js): characters in a line, lines it holds.
  const CHAT_MAX = BL.chatPolicy.MAX, CHAT_KEEP = 100;
  const GORILLA_PREFIX = "gorilla:";
  const bodyKind = (name) => name ? name.startsWith(GORILLA_PREFIX) ? "gorilla" : "ooga" : null;
  const bodyName = (name) => name && name.startsWith(GORILLA_PREFIX) ? name.slice(GORILLA_PREFIX.length) : name;
  const gorillaBody = (name) => {
    const character = BL.characters.get(name);
    return GORILLA_PREFIX + (character ? character.handle : name);
  };
  const chatIdValid = (id) => typeof id === "string" && id.length > 0 && id.length <= 64 && !/[^\w-]/.test(id);
  const DOOR_NAME = /^[a-z0-9-]{1,24}$/;
  const cabinetSeats = new Map();
  let cabinetRequest = null, cabinetSeat = null, cabinetAnchor = null, cabinetSequence = 0;
  const finishCabinetRequest = reason => {
    if (!cabinetRequest) return;
    const pending = cabinetRequest;
    cabinetRequest = null;
    window.clearTimeout(pending.timer);
    pending.resolve(reason);
  };
  const leaveCabinet = () => {
    const seat = cabinetSeat || cabinetRequest;
    if (seat) send(JSON.stringify({ t: "cabinet", op: "leave", id: seat.id, q: seat.q, ...(seat.slot === undefined ? {} : { slot: seat.slot }) }));
    cabinetSeat = cabinetAnchor = null;
    finishCabinetRequest("Cabinet opening cancelled");
  };
  // Resolves to null on success, or a player-facing reason. Never enter a live game optimistically.
  const takeCabinet = (id, slot) => {
    if (!state.me) return Promise.resolve(null);
    if (state.room !== "live") return Promise.resolve("Connect to the live arcade before playing");
    if (!state.cabinets || slot !== undefined && !state.cabinetsOutdoor) return Promise.resolve("The live arcade needs an update before cabinets can open");
    if (cabinetSeat || cabinetRequest) return Promise.resolve("A cabinet is already opening");
    const q = ++cabinetSequence, where = slot === undefined ? {} : { slot };
    return new Promise(resolve => {
      cabinetRequest = { id, q, slot, resolve, timer: window.setTimeout(() => {
        send(JSON.stringify({ t: "cabinet", op: "leave", id, q, ...where }));
        finishCabinetRequest("The arcade did not answer · try again");
      }, 8000) };
      send(JSON.stringify({ t: "cabinet", op: "take", id, q, ...where }));
    });
  };
  const subscribers = new Set();
  const highscoreSubscribers = new Set();
  const doorSubscribers = new Set();
  const rosterSubscribers = new Set();
  const moveSubscribers = new Set();
  const studioSubscribers = new Set();
  const hockeySubscribers = new Set();
  const hockeyTables = [null, null, null];
  const hockeyEmit = m => { for (const fn of hockeySubscribers) fn(m); };
  const subscribeHockey = fn => { hockeySubscribers.add(fn); return () => hockeySubscribers.delete(fn); };
  // Block Frenzy's live match: its registry messages, the host's binary frames and a guest's input (block-live.js).
  const bfSubscribers = new Set(), bfFrameSubscribers = new Set();
  const subscribeBf = fn => { bfSubscribers.add(fn); return () => bfSubscribers.delete(fn); };
  const subscribeBfFrame = fn => { bfFrameSubscribers.add(fn); return () => bfFrameSubscribers.delete(fn); };
  const sendBf = m => { if (!state.blockLive || state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN) return false; send(JSON.stringify({ t: "bf", v: BL.blockWire.WIRE, ...m })); return true; };
  const sendBfInput = m => { if (!state.blockLive || state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN) return false; send(JSON.stringify(m)); return true; };
  const sendBfFrame = bytes => { if (state.blockLive && ws && ws.readyState === WebSocket.OPEN) ws.send(bytes); };
  const sendHockey = m => { if (!state.hockey || state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN) return false; send(JSON.stringify({ t: "hockey", ...m, v: 4 })); return true; };
  const studioEmit = message => { for (const fn of studioSubscribers) fn(message); };
  const chatSubscribers = new Set();
  const privateSubscribers = new Set();
  const privateHeard = (msg) => { for (const fn of privateSubscribers) fn(msg); };
  // The shared chalkboard's listeners, and the page's own edits waiting to go (merged into frames of a few points).
  const chalkSubscribers = new Set(), chalkOut = [];
  const chalkEmit = (kind, detail) => { for (const fn of chalkSubscribers) fn(kind, detail); };
  const walletSubscribers = new Set();
  const shotSubscribers = new Set(), swingSubscribers = new Set(), reactSubscribers = new Set();
  const presenceSubscribers = new Set();
  const remotes = new Map();
  // room: "off" (signed out or no backend), "connecting", "live", "paused" (hidden a while), or a kick that
// stopped it ("replaced", "full").
  const offline = new URLSearchParams(location.search);
  const state = { roomLocks: false, lockedRooms: new Uint8Array(10), roomPin: "", roomPinRoom: -1, backend: false, games: [], me: null, donations: false, tess: false, voiceTurn: false, highscores: false, highscoreSnapshots: false, logoutEpoch: 0, started: false,
    resolved: offline.has("nosim") || offline.get("net") === "0" || location.protocol !== "http:" && location.protocol !== "https:",
    room: "off", selfId: 0, online: 0, released: null, loopEpoch: 0, zone: "outside", body: null, bodyKind: null, bodyName: null, hostId: 0, followers: 0, npcVersion: 0, doorway: false, pokerVoice: null,
    self: { x: NaN, y: NaN, z: NaN, zone: "" }, chatUnicode: false, privateChat: false, chalk: null, blendTo: null, blendT: 0, reactions: false, customHand: false, hand: false, handTone: 0, handEmoji: "",
    voiceLinks: false, linkWants: new Set(), linked: new Set() };
  const REACT_FEATURE = "react-v1", LINK_FEATURE = "vlink-v1", LINK_MAX = 64;
  const linkIds = (list) => new Set(Array.isArray(list) ? list.filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, LINK_MAX) : []);
  // The room's last word on whom to hear, for what a move to another place keeps.
  let peersHeard = [], gensHeard = null;
  let ws = null, retry = 0, retryTimer = 0, pingTimer = 0, unanswered = 0, hiddenTimer = 0, stopped = false;
  let npcFrame = null, inHub = false, hubSent = null, visibleSent = null;
  let zone = "outside", body = null, muted = false, hpSent = 100, koSent = false, hpAt = 0, poseAt = 0, px = NaN, py = NaN, pz = NaN, pyaw = NaN;
  const gSent = new Float64Array(6);
  let gKnown = false, poseHasG = false, jetSent = 0, weaponSent = 0, visualKnown = false;
  const visualSent = new Int16Array(17);
  const VISUAL_LIMITS = [157, 157, 314, 8191, 240, 1200, 560, 440, 320, 1240, 100, 750, 1300, 280, 2000, 31, 31];
  const validVisual = (v) => {
    if (!v || v.length !== 17) return false;
    for (let i = 0; i < 17; i++) if (!Number.isInteger(v[i]) || v[i] < (i < 3 ? -VISUAL_LIMITS[i] : 0) || v[i] > VISUAL_LIMITS[i]) return false;
    return true;
  };
  const restSent = new Int16Array(6);
  let restKnown = false, restActive = false;
  const validRest = r => {
    if (r === 0) return true;
    if (!r || r.length !== 6) return false;
    for (let i = 0; i < 6; i++) if (!Number.isInteger(r[i])) return false;
    return r[0] === 0 && r[1] >= 1 && r[1] <= 3 && r[2] >= 0 && r[2] <= 255
      && Math.abs(r[3]) <= 1000 && Math.abs(r[4]) <= 1000 && Math.abs(r[5]) <= 1000
      && r[3] ** 2 + r[4] ** 2 + r[5] ** 2 <= 1002001;
  };
  const readRest = (rec, r) => {
    rec.rest = undefined;
    if (r === 0) { rec.rest = 0; return; }
    if (!Array.isArray(r) || !validRest(r)) return;
    if (!rec.restData) rec.restData = new Int16Array(6);
    rec.restData.set(r); rec.rest = rec.restData;
  };
  const readVisual = (rec, v, at) => {
    rec.visual = null;
    if (!validVisual(v) || !Number.isFinite(at)) return;
    if (!rec.visualData) rec.visualData = new Int16Array(17);
    rec.visualData.set(v); rec.visual = rec.visualData; rec.visualAt = at;
  };
  let clockOffset = 0, clockKnown = false;
  let pokerVoice = null;
  // A server timestamp minus the arrival time is the true offset less the trip; the largest such
  // sample is the one that travelled fastest, so it is the best estimate yet.
  const clockSample = (serverMs) => {
    if (typeof serverMs !== "number") return;
    const sample = serverMs - Date.now();
    if (!clockKnown || sample > clockOffset) clockOffset = sample;
    clockKnown = true;
  };
  const serverNow = () => Date.now() + clockOffset;

  const rosterChanged = () => {
    for (const fn of rosterSubscribers) fn();
  };
  const moved = () => {
    for (const fn of moveSubscribers) fn();
  };
  const emit = () => {
    for (const fn of subscribers) fn(state);
    rosterChanged();
  };

  // Only the fields the page uses; anything else /api/me grows later stays out.
  const accept = (player) => {
    if (!player || !Number.isSafeInteger(player.id) || typeof player.login !== "string") return null;
    return { id: player.id, login: player.login, display: typeof player.display === "string" ? player.display : player.login };
  };

  const setRoom = (room) => {
    const lost = state.room === "live" && room !== "live";
    state.room = room;
    if (room !== "live") { cabinetSeats.clear(); cabinetSeat = null; state.cabinets = false; finishCabinetRequest("Connection to the arcade was lost"); }
    if (room !== "live") state.chatUnicode = state.privateChat = false;
    if (room !== "live") { state.voiceLinks = false; state.linkWants.clear(); state.linked.clear(); peersHeard = []; gensHeard = null; }
    if (lost) privateHeard({ op: "lost" });
    if (room !== "live") { hockeyTables.fill(null); hockeyEmit({ k: "lost" }); state.hockey = false; }
    if (room !== "live") { for (const fn of bfSubscribers) fn({ k: "lost" }); state.blockLive = false; }
    if (room !== "live") { state.studio = null; state.connectionToken = ""; studioEmit({t:"studio-state",state:null}); }
    state.online = room === "live" ? remotes.size + 1 : 0;
    emit();
  };

  const send = (text) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(text);
  };

  const sendBody = () => send(JSON.stringify({ t: "body", name: body }));
  const sendZone = () => send(JSON.stringify({ t: "zone", name: zone }));
  // The crossing last sent (`to`/`k`), "" for none; null after a zone forces the next report, including a clear.
  const BLEND = BL.voiceBlend, BLEND_MS = 250;
  let blendSent = "", blendAt = -Infinity;
  const sendBlend = () => {
    if (state.room !== "live" || !body) return;
    const k = state.blendTo ? Math.max(1, Math.min(BLEND.STEPS, Math.round(state.blendT * BLEND.STEPS))) : 0, key = k ? `${state.blendTo}:${k}` : "";
    const now = performance.now();
    if (key === blendSent || now - blendAt < BLEND_MS) return;
    blendSent = key; blendAt = now;
    send(JSON.stringify({ t: "blend", to: k ? state.blendTo : null, k }));
  };
  // Under half a step is no crossing, so a body a hair past a level's height never has the room pull the next place.
  const setBlend = (to, t) => {
    if (cabinetAnchor) return;
    const on = !!to && t * BLEND.STEPS >= 0.5;
    state.blendTo = on ? to : null;
    state.blendT = on ? Math.min(1, t) : 0;
    sendBlend();
  };
  const sendPokerVoice = () => { if (zone === "ember-den") send(JSON.stringify({ t: "poker-voice", table: pokerVoice })); };
  const sendMute = () => send(muted ? '{"t":"mute","on":true}' : '{"t":"mute","on":false}');
  // What the room hears is "showing the island now": the hub scene, in a visible tab.
  const sendHub = () => {
    const on = inHub && !document.hidden;
    if (on === hubSent || !ws || ws.readyState !== WebSocket.OPEN) return;
    hubSent = on;
    send(on ? '{"t":"hub","on":true}' : '{"t":"hub","on":false}');
  };
  // Whether this tab is visible, so the room hands Block Frenzy's hosting only to a page that runs frames (block.js).
  const sendVisible = () => {
    const on = !document.hidden;
    if (on === visibleSent || !ws || ws.readyState !== WebSocket.OPEN) return;
    visibleSent = on;
    send(on ? '{"t":"visible","on":true}' : '{"t":"visible","on":false}');
  };

  const readGorillaPose = (rec, values, offset = 0) => {
    if (rec.bodyKind !== "gorilla" || !Array.isArray(values) || values.length < offset + 6) return;
    for (let i = 0; i < 6; i++) if (!Number.isFinite(values[offset + i])) return;
    const flags = values[offset];
    if (!Number.isInteger(flags) || flags < 0 || flags > 127) return;
    const g = rec.gData || (rec.gData = new Float64Array(6));
    g[0] = flags;
    g[1] = Math.max(-20, Math.min(20, values[offset + 1]));
    g[2] = Math.max(-1e6, Math.min(1e6, values[offset + 2]));
    g[3] = Math.max(-1, Math.min(1, values[offset + 3]));
    g[4] = Math.max(-1, Math.min(1, values[offset + 4]));
    g[5] = Math.max(0, Math.min(1, values[offset + 5]));
    rec.g = g;
  };

  const upsert = (p) => {
    if (!p || !Number.isSafeInteger(p.id) || p.id === state.selfId) return;
    const rec = remotes.get(p.id) || { id: p.id, login: "", display: "", body: null, bodyKind: null, bodyName: null, zone: "outside", voice: false, muted: false, hand: false, handTone: 0, handEmoji: "", hp: 100, ko: false, x: 0, y: 0, z: 0, yaw: 0, poseZone: null, g: null, gData: null, jet: 0, weapon: 0 };
    rec.login = String(p.login);
    rec.display = String(p.display || p.login);
    rec.body = typeof p.body === "string" ? p.body : null;
    rec.bodyKind = bodyKind(rec.body);
    rec.bodyName = bodyName(rec.body);
    rec.g = null;
    if (Array.isArray(p.g) && p.g.length === 6) readGorillaPose(rec, p.g);
    rec.jet = Number.isInteger(p.j) && p.j > 0 && p.j <= 7 ? p.j : 0;
    rec.weapon = Number.isInteger(p.w) && p.w > 0 && p.w <= 255 ? p.w : 0;
    readVisual(rec, p.v, p.va);
    readRest(rec, p.r);
    rec.zone = typeof p.zone === "string" ? p.zone : "outside";
    rec.voice = p.voice === true;
    rec.hp = Number.isFinite(p.hp) ? p.hp : 100;
    rec.ko = p.ko === true;
    rec.muted = p.muted === true;
    rec.hand = p.hand === true;
    rec.handTone = BL.reactionPolicy.tone(p.handTone) ? p.handTone : 0;
    rec.handEmoji = BL.reactionPolicy.valid(p.handEmoji) ? p.handEmoji : "";
    rec.x = +p.x || 0; rec.y = +p.y || 0; rec.z = +p.z || 0; rec.yaw = +p.yaw || 0;
    // A pose the room holds for someone driving is where they stand now; for anyone else it may be from a zone they
    // have since left, so it is not taken (`poseZone`).
    rec.poseZone = typeof p.x === "number" && rec.body ? rec.zone : null;
    rec.blendTo = typeof p.blendTo === "string" && Number.isInteger(p.blendK) && p.blendK > 0 ? p.blendTo : null;
    rec.blendK = rec.blendTo ? Math.min(BLEND.STEPS, p.blendK) : 0;
    remotes.set(p.id, rec);
  };

  // Only the fields chat.js shows; the room already sanitized the text and named the speaker.
  const chatLine = (m) => m && Number.isSafeInteger(m.id) && typeof m.login === "string" && typeof m.text === "string" && !BL.chatPolicy.error(m.text)
    ? { id: m.id, at: Number.isFinite(m.at) ? m.at : 0, login: m.login, name: typeof m.name === "string" && m.name ? m.name : m.login, text: BL.chatPolicy.text(m.text) }
    : null;
  const chatHeard = (lines, replace, receipt = null) => {
    for (const fn of chatSubscribers) fn(lines, replace, receipt);
  };
  // The Sphere's rooms are numbered 0–9; only the Conference Room has a lock (timechain-rooms.js `lockable`).
  const sphereRoom = (room) => Number.isInteger(room) && room >= 0 && room <= 9;
  const lockableRoom = (room) => sphereRoom(room) && !!BL.timechainRooms && BL.timechainRooms.ROOMS[room].lockable;
  // Which of the Sphere's rooms are locked from inside (`state.lockedRooms`, 1 by room number); true when that changed.
  const setLockedRooms = (rooms) => {
    let changed = false;
    for (let room = 0; room <= 9; room++) {
      const locked = Array.isArray(rooms) && rooms.includes(room) ? 1 : 0;
      if (state.lockedRooms[room] !== locked) { state.lockedRooms[room] = locked; changed = true; }
    }
    if (state.roomPinRoom >= 0 && !state.lockedRooms[state.roomPinRoom]) forgetRoomPin();
    return changed;
  };
  // The PIN of the locked room this page stands in (`state.roomPin`), which the room tells only those inside it; kept
  // until the room opens, the page leaves it or the socket goes.
  const forgetRoomPin = () => { state.roomPin = ""; state.roomPinRoom = -1; };
  const doorHeard = (event) => {
    for (const fn of doorSubscribers) fn(event);
  };
  // Only well-formed doorway words reach the page.
  const transitOf = (m) => m && chatIdValid(m.cycle) && Number.isSafeInteger(m.actor) && typeof m.door === "string" && DOOR_NAME.test(m.door)
    && (m.dir === "in" || m.dir === "out") && Number.isFinite(m.at) && Number.isFinite(m.exp)
    ? { t: "transit", cycle: m.cycle, actor: m.actor, door: m.door, dir: m.dir, at: m.at, exp: m.exp } : null;

  const onMessage = (e) => {
    unanswered = 0;
    if (e.data instanceof ArrayBuffer) {
      if (e.data.byteLength >= 4 && new DataView(e.data).getUint32(0, true) === 0x315a4642) { for (const fn of bfFrameSubscribers) fn(e.data); return; }
      npcFrame = e.data;
      state.npcVersion++;
      return;
    }
    if (e.data === "pong" || typeof e.data !== "string") return;
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === "cabinets") {
      cabinetSeats.clear();
      if (Array.isArray(msg.seats)) for (const seat of msg.seats) if (BL.arcadeCabinets.get(seat.id)) cabinetSeats.set(seat.id, seat);
      if (cabinetSeat && cabinetSeats.get(cabinetSeat.id)?.player !== state.selfId) { cabinetSeat = null; emit(); }
    } else if (msg.t === "cabinet") {
      if (cabinetRequest?.id === msg.id && cabinetRequest.q === msg.q) {
        if (msg.ok) { const slot = cabinetRequest.slot; cabinetSeat = { id: msg.id, q: msg.q, slot }; cabinetAnchor = slot === undefined ? BL.arcadeCabinets.get(msg.id) : BL.arcadeCabinets.slot(slot); }
        finishCabinetRequest(msg.ok ? null : msg.reason || "This cabinet is occupied");
      } else if (msg.ok) send(JSON.stringify({ t: "cabinet", op: "leave", id: msg.id, q: msg.q, ...(Number.isInteger(msg.slot) ? { slot: msg.slot } : {}) }));
    } else if (msg.t === "highscore") {
      if (state.room === "live") for (const fn of highscoreSubscribers) fn(msg.board);
    } else if (msg.t === "studio-mic-revoked") {
      BL.voice.dropMic();
    } else if (msg.t === "studio-state") {
      const previous = state.studio, incoming = msg.state;
      if (previous && incoming && (incoming.epoch < previous.epoch || (incoming.epoch === previous.epoch && incoming.revision < previous.revision))) return;
      state.studio = incoming;
      studioEmit(msg);
    } else if (msg.t === "studio-result") {
      studioEmit(msg);
    } else if (msg.t === "bf") {
      for (const fn of bfSubscribers) fn(msg);
    } else if (msg.t === "hockey") {
      if (Number.isInteger(msg.i) && msg.i >= 0 && msg.i < 3) {
        if (msg.k === "table") hockeyTables[msg.i] = msg.phase === "closed" ? null : msg;
        if (msg.k === "frame" && hockeyTables[msg.i]?.s === msg.s && msg.q > hockeyTables[msg.i].q && BL.hockeyWire.validFrame(msg.a)) Object.assign(hockeyTables[msg.i], { a: msg.a, q: msg.q, now: msg.now });
        hockeyEmit(msg);
      }
    } else if (msg.t === "state") {
      clockSample(msg.now);
      const ps = msg.ps;
      let changed = false;
      for (let i = 0; i + 4 < ps.length; i += 5) {
        const rec = remotes.get(ps[i]);
        if (!rec) continue;
        // Every snapshot repeats everyone's last pose; only a new one says where a player stands in their zone now.
        if (typeof ps[i + 1] === "number" && (ps[i + 1] !== rec.x || ps[i + 2] !== rec.y || ps[i + 3] !== rec.z || ps[i + 4] !== rec.yaw)) {
          rec.poseZone = rec.zone;
          changed = true;
        }
        rec.x = ps[i + 1]; rec.y = ps[i + 2]; rec.z = ps[i + 3]; rec.yaw = ps[i + 4];
        // `js` lists every jetpack and `ws` every weapon; anyone in the snapshot left out has none.
        rec.jet = rec.weapon = 0;
        rec.visual = null;
        rec.rest = undefined;
      }
      const gs = msg.gs;
      if (Array.isArray(gs)) for (let i = 0; i + 6 < gs.length; i += 7) {
        const rec = remotes.get(gs[i]);
        if (rec) readGorillaPose(rec, gs, i + 1);
      }
      const js = msg.js;
      if (Array.isArray(js)) for (let i = 0; i + 1 < js.length; i += 2) {
        const rec = remotes.get(js[i]), j = js[i + 1];
        if (rec && Number.isInteger(j) && j > 0 && j <= 7) rec.jet = j;
      }
      const ws = msg.ws;
      if (Array.isArray(ws)) for (let i = 0; i + 1 < ws.length; i += 2) {
        const rec = remotes.get(ws[i]), w = ws[i + 1];
        if (rec && Number.isInteger(w) && w > 0 && w <= 255) rec.weapon = w;
      }
      const vs = msg.vs;
      if (Array.isArray(vs)) for (const row of vs) {
        if (!Array.isArray(row) || row.length !== 19) continue;
        const rec = remotes.get(row[0]);
        if (rec) readVisual(rec, row.slice(2), row[1]);
      }
      const rs = msg.rs;
      if (Array.isArray(rs)) for (const row of rs) {
        if (!Array.isArray(row) || row.length !== 2 && row.length !== 7) continue;
        const rec = remotes.get(row[0]);
        if (rec) readRest(rec, row.length === 2 ? row[1] : row.slice(1));
      }
      if (changed) moved();
    } else if (msg.t === "welcome") {
      retry = 0;
      clockKnown = false;
      clockSample(msg.now);
      state.loopEpoch = typeof msg.loopEpoch === "number" ? msg.loopEpoch : 0;
      state.hostId = Number.isSafeInteger(msg.host) ? msg.host : 0;
      state.followers = Number.isSafeInteger(msg.followers) ? msg.followers : 0;
      state.selfId = msg.you.id;
      state.connectionToken = typeof msg.connectionToken === "string" ? msg.connectionToken : "";
      state.cabinets = Array.isArray(msg.features) && msg.features.includes(BL.arcadeCabinets.FEATURE);
      state.cabinetsOutdoor = Array.isArray(msg.features) && msg.features.includes(BL.arcadeCabinets.OUTDOOR_FEATURE);
      state.hockey = Array.isArray(msg.features) && msg.features.includes("hockey-v4");
      state.blockLive = Array.isArray(msg.features) && msg.features.includes("block-v1");
      state.doorway = Array.isArray(msg.features) && msg.features.includes("door");
      state.roomLocks = Array.isArray(msg.features) && msg.features.includes("room-lock-v1");
      setLockedRooms(msg.locks);
      state.chatUnicode = Array.isArray(msg.features) && msg.features.includes(BL.chatPolicy.FEATURE);
      state.privateChat = Array.isArray(msg.features) && msg.features.includes("pm-v1");
      state.reactions = Array.isArray(msg.features) && msg.features.includes(REACT_FEATURE);
      state.customHand = Array.isArray(msg.features) && msg.features.includes("hand-emoji-v1");
      if (!state.customHand) state.handEmoji = "";
      state.voiceLinks = Array.isArray(msg.features) && msg.features.includes(LINK_FEATURE);
      // A room that keeps the chalkboard sends it next (chalk-board); an older one leaves the page its own board.
      if (state.chalk && !(Array.isArray(msg.features) && msg.features.includes(BL.chalkBoard.FEATURE))) { state.chalk = null; chalkEmit("board"); }
      remotes.clear();
      for (const p of msg.players) upsert(p);
      setRoom("live");
      const transit = transitOf(msg.transit);
      if (transit && transit.actor !== state.selfId) doorHeard(transit);
      // A reconnect picks up where the page is: the actor still driven and where it stands, and voice,
      // whose sessions the room forgot with the old socket.
      sendBody();
      // Restore the actor before admitting it to the destination zone. A reconnect therefore cannot briefly
      // appear, or become voice-eligible, in a room without its last bounded pose.
      const restoredPose = body && Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz) && Number.isFinite(pyaw);
      if (restoredPose) {
        // Cached equipment/look survive reconnect; transient actions are reconciled by the next
        // live sample rather than replayed with a fresh room timestamp.
        if (visualKnown) { visualSent[3] &= 7; for (let i = 4; i < 15; i++) visualSent[i] = 0; }
        const extra = state.bodyKind === "gorilla" && poseHasG ? `,"g":[${gSent[0]},${gSent[1].toFixed(3)},${gSent[2].toFixed(3)},${gSent[3].toFixed(3)},${gSent[4].toFixed(3)},${gSent[5].toFixed(3)}]`
          : (jetSent ? `,"j":${jetSent}` : "") + (weaponSent ? `,"w":${weaponSent}` : "") + (visualKnown ? `,"v":[${visualSent.join(",")}]` : "")
            + (restKnown ? restActive ? `,"r":[${restSent.join(",")}]` : ',"r":0' : "");
        send(`{"t":"pose","x":${px.toFixed(3)},"y":${py.toFixed(3)},"z":${pz.toFixed(3)},"yaw":${pyaw.toFixed(3)}${extra}}`);
      }
      sendZone();
      blendSent = ""; blendAt = -Infinity; sendBlend();
      sendPokerVoice();
      if (muted) sendMute();
      // So does the raised hand: a fresh room record has it down.
      if (state.hand) { if (state.reactions) sendHand(); else state.hand = false; }
      // A fresh room record starts at full health; the next report sends ours if it differs.
      hpSent = 100; koSent = false; hpAt = 0;
      hubSent = visibleSent = null;
      sendHub();
      sendVisible();
      BL.voice.restart(true);
      if (restoredPose) poseAt = performance.now();
      else { poseAt = 0; px = NaN; gKnown = poseHasG = false; }
    } else if (msg.t === "join") {
      const fresh = !!msg.p && !remotes.has(msg.p.id);
      upsert(msg.p);
      setRoom("live");
      const rec = fresh && remotes.get(msg.p.id);
      if (rec) for (const fn of presenceSubscribers) fn(rec, true);
    } else if (msg.t === "leave") {
      const rec = remotes.get(msg.id);
      remotes.delete(msg.id);
      setRoom("live");
      if (rec) for (const fn of presenceSubscribers) fn(rec, false);
    } else if (msg.t === "body") {
      const rec = remotes.get(msg.id);
      if (rec) {
        rec.body = typeof msg.name === "string" ? msg.name : null;
        rec.bodyKind = bodyKind(rec.body);
        rec.bodyName = bodyName(rec.body);
        rec.g = null;
        rec.jet = rec.weapon = 0;
        rec.visual = null;
        rec.rest = undefined;
        rec.hp = 100;
        rec.ko = false;
      }
      rosterChanged();
    } else if (msg.t === "vstate") {
      const rec = remotes.get(msg.id);
      if (!rec) return;
      rec.voice = msg.voice === true;
      rec.muted = msg.muted === true;
      rosterChanged();
    } else if (msg.t === "hp") {
      const rec = remotes.get(msg.id);
      if (!rec || !Number.isFinite(msg.v)) return;
      rec.hp = msg.v;
      rec.ko = msg.ko === true;
    } else if (msg.t === "zone") {
      const rec = remotes.get(msg.id);
      if (rec && typeof msg.name === "string") {
        // A position stays where it stood across zones of one scene's coordinates (the arcade's hallway halves, #422).
        if (rec.poseZone && BLEND.sameFrame(rec.poseZone, msg.name)) rec.poseZone = msg.name;
        // Into the place it was crossing into, its crossing turns round as the room turns it (the room's `blend` after
        // this says the same), so its voice never plays a moment at the wrong share; any other zone ends it.
        // Between two zones of the main world it stands as it is: there a crossing is a level, whatever the zone.
        if (!BLEND.world(rec.zone) || !BLEND.world(msg.name)) {
          const across = !!rec.blendTo && BLEND.place(msg.name) === BLEND.place(rec.blendTo) && BLEND.STEPS - rec.blendK > 0;
          rec.blendTo = across ? BLEND.place(rec.zone) : null; rec.blendK = across ? BLEND.STEPS - rec.blendK : 0;
        }
        rec.zone = msg.name;
      }
      rosterChanged();
    } else if (msg.t === "blend") {
      const rec = remotes.get(msg.id);
      if (rec) {
        rec.blendTo = typeof msg.to === "string" && Number.isInteger(msg.k) && msg.k > 0 ? msg.to : null;
        rec.blendK = rec.blendTo ? Math.min(BLEND.STEPS, msg.k) : 0;
      }
    } else if (msg.t === "host") {
      state.hostId = Number.isSafeInteger(msg.id) ? msg.id : 0;
      state.followers = Number.isSafeInteger(msg.followers) ? msg.followers : 0;
      emit();
    } else if (msg.t === "shot") {
      const a = msg.a;
      if (Number.isSafeInteger(msg.id) && Array.isArray(a) && a.length === 6 && a.every(Number.isFinite))
        for (const fn of shotSubscribers) fn(msg.id, a);
    } else if (msg.t === "swing") {
      if (Number.isSafeInteger(msg.id)) for (const fn of swingSubscribers) fn(msg.id);
    } else if (msg.t === "chat") {
      const line = chatLine(msg);
      if (line) chatHeard([line], false);
    } else if (msg.t === "chat-ack" || msg.t === "chat-rejected") {
      if (chatIdValid(msg.clientId))
        chatHeard([], false, { clientId: msg.clientId, accepted: msg.t === "chat-ack", conflict: msg.reason === "conflict" });
    } else if (msg.t === "pm") {
      if (typeof msg.op === "string" && msg.op !== "lost") privateHeard(msg);
    } else if (msg.t === "chalk-board") {
      const marks = BL.chalkBoard.restore(msg.marks);
      if (!marks) return;
      const board = BL.chalkBoard.board(marks);
      chalkOut.length = 0;
      state.chalk = { board, editor: Number.isSafeInteger(msg.editor) ? msg.editor : 0, session: BL.chalkBoard.session(board) };
      chalkEmit("board");
    } else if (msg.t === "chalk-lock") {
      const c = state.chalk;
      if (!c) return;
      c.editor = Number.isSafeInteger(msg.id) ? msg.id : 0;
      c.session = BL.chalkBoard.session(c.board);
      chalkEmit("lock");
    } else if (msg.t === "chalk") {
      const c = state.chalk, op = BL.chalkBoard.parse(msg);
      if (c && op && msg.id === c.editor && msg.id !== state.selfId && !BL.chalkBoard.apply(c.board, op, c.session)) chalkEmit("op", op);
    } else if (msg.t === "chalk-refused") {
      chalkEmit("refused", { why: String(msg.why), name: typeof msg.name === "string" ? msg.name : "" });
    } else if (msg.t === "wallet" || msg.t === "wallets") {
      for (const fn of walletSubscribers) fn(msg);
    } else if (msg.t === "chat-history") {
      if (!Array.isArray(msg.messages)) return;
      const lines = [];
      for (const m of msg.messages.slice(-CHAT_KEEP)) {
        const line = chatLine(m);
        if (line) lines.push(line);
      }
      chatHeard(lines, true);
    } else if (msg.t === "door") {
      if (msg.op === "grant" && chatIdValid(msg.cycle) && Number.isFinite(msg.exp)) doorHeard({ t: "door", op: "grant", cycle: msg.cycle, exp: msg.exp });
      else if (msg.op === "started" && chatIdValid(msg.cycle) && Number.isFinite(msg.exp)) doorHeard({ t: "door", op: "started", cycle: msg.cycle, exp: msg.exp });
      else if (msg.op === "wait") doorHeard({ t: "door", op: "wait", ahead: Number.isSafeInteger(msg.ahead) && msg.ahead >= 0 ? msg.ahead : 0 });
      else if (msg.op === "denied") doorHeard({ t: "door", op: "denied", reason: typeof msg.reason === "string" ? msg.reason.slice(0, 32) : "" });
      else if (msg.op === "locks") { setLockedRooms(msg.rooms); doorHeard({ t: "door", op: "locks" }); }
      else if (msg.op === "room-pin" && sphereRoom(msg.room) && typeof msg.pin === "string" && /^[0-9]{4}$/.test(msg.pin)) {
        state.roomPin = msg.pin; state.roomPinRoom = msg.room;
        doorHeard({ t: "door", op: "room-pin", room: msg.room });
      }
      else if (msg.op === "lock-result" && (msg.action === "lock" || msg.action === "unlock" || msg.action === "try") && sphereRoom(msg.room)) doorHeard({ t: "door", op: "lock-result", action: msg.action, room: msg.room, ok: msg.ok === true, reason: typeof msg.reason === "string" ? msg.reason.slice(0, 32) : "" });
    } else if (msg.t === "transit") {
      const transit = transitOf(msg);
      if (transit && transit.actor !== state.selfId) doorHeard(transit);
    } else if (msg.t === "transit-end") {
      if (chatIdValid(msg.cycle)) doorHeard({ t: "transit-end", cycle: msg.cycle });
    } else if (msg.t === "voice") {
      if (Array.isArray(msg.peers)) {
        peersHeard = msg.peers; gensHeard = Array.isArray(msg.gens) ? msg.gens : null;
        // Linked partners who only listen hold the microphone open as the Studio's audience does there.
        const ears = Number.isSafeInteger(msg.ears) && msg.ears > 0 ? msg.peers.length + msg.ears : undefined;
        BL.voice.setPeers(msg.peers, gensHeard, state.zone === "dsb-studio" ? msg.listeners : ears);
      }
    } else if (msg.t === "links") {
      state.linkWants = linkIds(msg.wants); state.linked = linkIds(msg.linked);
      if (msg.refused === "full") BL.hud.toast("Too many voice links: break one first");
      else if (msg.all === "linked" && msg.n > 0) BL.hud.toast(`Voices linked with ${msg.n} ${msg.n === 1 ? "player" : "players"}`);
      else if (msg.all === "unlinked") BL.hud.toast("Unlinked everyone");
      else if (msg.all === "none") BL.hud.toast("Nobody here has asked to link with you");
      rosterChanged();
    } else if (msg.t === "react") {
      if (remotes.has(msg.id) && BL.reactionPolicy.valid(msg.e)) for (const fn of reactSubscribers) fn(msg.id, msg.e);
    } else if (msg.t === "hand") {
      // The room's word on this page's own hand, sent back when it refused a change.
      if (msg.id === state.selfId) {
        state.hand = msg.on === true;
        state.handTone = BL.reactionPolicy.tone(msg.tone) ? msg.tone : 0;
        state.handEmoji = BL.reactionPolicy.valid(msg.e) ? msg.e : "";
        emit();
        return;
      }
      const rec = remotes.get(msg.id);
      if (!rec) return;
      rec.hand = msg.on === true;
      rec.handTone = BL.reactionPolicy.tone(msg.tone) ? msg.tone : 0;
      rec.handEmoji = BL.reactionPolicy.valid(msg.e) ? msg.e : "";
      rosterChanged();
    } else if (msg.t === "release") {
      state.released = { name: String(msg.name), reason: String(msg.reason) };
      emit();
    } else if (msg.t === "kick") {
      // Revoked access stops reconnecting; the operator may later restore access.
      if (msg.reason === "revoked") { state.me = null; state.hand = false; }
      // replaced and full stop here; stale reconnects like any drop.
      if (msg.reason !== "stale") stopped = true;
      close(msg.reason === "stale" ? "connecting" : msg.reason);
    }
  };

  const close = (room) => {
    window.clearInterval(pingTimer);
    pingTimer = 0;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      if (ws.readyState <= WebSocket.OPEN) ws.close(1000);
      ws = null;
    }
    remotes.clear();
    state.hostId = 0;
    state.followers = 0;
    // Any request for the doorway went with the socket.
    if (state.doorway) doorHeard({ t: "door", op: "lost" });
    state.roomLocks = false;
    forgetRoomPin();
    if (setLockedRooms(null)) doorHeard({ t: "door", op: "locks" });
    // So did the chalkboard: the board is kept to show until the room sends it again, but nobody here holds it.
    chalkOut.length = 0;
    if (state.chalk && (room === "connecting" || room === "paused")) { state.chalk.editor = 0; chalkEmit("lock"); }
    else if (state.chalk) { state.chalk = null; chalkEmit("board"); }
    state.doorway = false;
    npcFrame = null;
    hubSent = null;
    // Out of the room for good (signed out, another tab, full): voice goes with it.
    if (room !== "connecting") BL.voice.stop();
    setRoom(room);
    if (!stopped && room === "connecting") schedule();
  };

  // Backoff as the prototype tuned it: ×1.7 from half a second, capped at 15 s, ±25% jitter.
  const schedule = () => {
    window.clearTimeout(retryTimer);
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 1.7 ** retry++) * (0.75 + Math.random() * 0.5);
    retryTimer = window.setTimeout(connect, wait);
  };

  const connect = () => {
    retryTimer = 0;
    if (stopped || ws || !state.me) return;
    setRoom("connecting");
    // A tab opened in the background has no visibility change to arm this.
    if (document.hidden && !hiddenTimer) armHidden();
    ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/room`);
    ws.binaryType = "arraybuffer";
    ws.onmessage = onMessage;
    ws.onopen = () => {
      unanswered = 0;
      pingTimer = window.setInterval(() => {
        // A half-open socket never closes by itself for minutes, while the room has long since evicted this page.
        if (unanswered >= PING_MISSES) { close("connecting"); return; }
        unanswered++;
        send("ping");
      }, PING_MS);
    };
    ws.onclose = () => close("connecting");
  };

  // One look at the account; true when it found a backend to join.
  const look = async () => {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin", headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      // A static host's 404/HTML response establishes that no account exists
      // here. A timeout or failed account service does not establish sign-out.
      if (res.status === 404 || res.ok && !(res.headers.get("content-type") || "").startsWith("application/json")) { state.resolved = true; return false; }
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !("player" in data)) return false;
      state.backend = true;
      state.me = accept(data.player);
      state.donations = data.donations === true;
      state.tess = data.tess === true;
      state.voiceTurn = data.voiceTurn === true;
      state.highscores = data.highscores === true;
      state.highscoreSnapshots = data.highscoreSnapshots === true;
      state.arcadePlays = data.arcadePlays === true;
      // The games the Worker hosts itself (worker/src/games.js), each followed over its own socket (game-net.js).
      state.games = Array.isArray(data.games) ? data.games.filter((g) => typeof g === "string").slice(0, 8) : [];
      state.resolved = data.player === null || !!state.me;
      if (state.me) {
        BL.contributors.addTemporary(data.character, state.me.login);
        rememberLogin(state.me.login);
        localCharacter = ownCharacter();
      }
    } catch {
      return false;
    } finally {
      emit();
    }
    return true;
  };
  const start = async () => {
    if (state.started) return;
    state.started = true;
    if (location.protocol !== "https:" && location.protocol !== "http:") return;
    state.resolved = false;
    if (await look()) connect();
  };
  // Again, only while the first look went unanswered; never more than one at a time.
  let rechecking = null;
  const recheck = () => {
    if (state.resolved || !state.started) return Promise.resolve(state);
    if (!rechecking) rechecking = look().then((found) => { if (found) connect(); rechecking = null; return state; });
    return rechecking;
  };

  // Sign-in is a full navigation through GitHub, then a fresh arrival beside the hub's pile.
  const login = () => {
    if (!state.backend) return;
    location.assign("/auth/login?next=%2F");
  };

  const logout = async () => {
    if (!state.backend || !state.me) return;
    try {
      const res = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) return;
    } catch {
      return;
    }
    stopped = true;
    window.clearTimeout(retryTimer);
    state.me = null;
    state.hand = false;
    state.logoutEpoch++;
    close("off");
  };

  // Existing account API; rejoin with fresh authenticated headers so future lines use the new name.
  const setDisplay = async (display) => {
    const player = state.me;
    if (!state.backend || !player) return { ok: false, error: "Sign in first." };
    const clean = String(display).trim();
    if (clean.length < 3 || clean.length > 24 || /[^\w .,!?'@#:-]/.test(clean))
      return { ok: false, error: "Use 3–24 letters A–Z, digits, spaces or _ . , ! ? ' @ # : -" };
    try {
      const res = await fetch("/api/me", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ display: clean }), signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: "Name could not be saved. Try again." };
      const updated = accept(data.player);
      if (!updated || updated.id !== player.id || state.me !== player) return { ok: false, error: "Account changed. Try again." };
      state.me = updated;
      const rejoinHere = !stopped;
      close(rejoinHere ? "connecting" : state.room);
      if (rejoinHere) { window.clearTimeout(retryTimer); retryTimer = 0; connect(); }
      return { ok: true };
    } catch {
      return { ok: false, error: "Name could not be saved. Try again." };
    }
  };

  // After a `replaced` or `full` kick, the visitor chooses to play here again.
  const rejoin = () => {
    if (!state.me || ws) return;
    stopped = false;
    retry = 0;
    connect();
  };

  // Where the driven Ooga is ("outside", "hq", "cave-<id>"): voice is shared within one place.
  // Zones are `<group>` or `<group>.<place>` (the Factory's tunnel and its hall); voice is shared within a group,
  // so only leaving the group lets go of every voice here. The room answers every zone with the list to hear.
  const groupLength = (name) => {
    const dot = name.indexOf(".");
    return dot < 0 ? name.length : dot;
  };
  const sameGroup = (a, b) => {
    const n = groupLength(a);
    return n === groupLength(b) && a.startsWith(b.slice(0, n));
  };
  // A move to another place lets go of every voice but the linked ones, which follow the visitor anywhere.
  const keepLinkedVoices = () => {
    const ids = [], gens = [];
    peersHeard.forEach((id, i) => {
      if (!state.linked.has(id)) return;
      ids.push(id); gens.push(gensHeard ? gensHeard[i] : 0);
    });
    peersHeard = ids; gensHeard = gens;
    BL.voice.setPeers(ids, gens);
  };
  const setZone = (name) => {
    if (cabinetAnchor) return;
    if (name === zone) return;
    if (name !== `sphere-${state.roomPinRoom}`) forgetRoomPin();
    // Between two zones of the main world nothing changes for voice: a crossing there is a level, whatever the zone.
    // Into the place being crossed into (voice-blend.js `place`): the crossing turns round as the room turns it, across
    // the arcade hallway's midpoint (#422) to the same crossing from its other end.
    const kept = BLEND.world(name) && BLEND.world(zone);
    const across = !kept && !!state.blendTo && BLEND.place(name) === BLEND.place(state.blendTo);
    const moved = !kept && !sameGroup(name, zone) && !across;
    if (across) {
      const back = (1 - state.blendT) * BLEND.STEPS >= 0.5;
      state.blendTo = back ? BLEND.place(zone) : null;
      state.blendT = back ? 1 - state.blendT : 0;
    }
    zone = state.zone = name;
    pokerVoice = state.pokerVoice = null;
    poseAt = 0; px = NaN;
    if (moved) keepLinkedVoices();
    sendZone();
    // The room may have inverted an older quantized step, even when this page is already at the endpoint. Always send
    // the next crossing, including none, so that stale remainder cannot keep the land just left audible.
    blendSent = null; blendAt = -Infinity;
    rosterChanged();
  };
  // Voice changes without moving or hiding anybody on the shared floor.
  const setPokerVoice = table => {
    if (zone !== "ember-den" || table !== null && (!Number.isInteger(table) || table < 0 || table >= 10) || pokerVoice === table) return;
    pokerVoice = state.pokerVoice = table;
    keepLinkedVoices();
    sendPokerVoice();
    rosterChanged();
  };

  // The hub says when it shows the island; a hidden tab stops counting until it is looked at again.
  const setHub = (on) => {
    inHub = on;
    sendHub();
  };
  // Hidden long enough, the tab leaves the room; shown again, it rejoins as a fresh connection.
  const onVisibility = () => {
    sendHub();
    sendVisible();
    window.clearTimeout(hiddenTimer);
    hiddenTimer = 0;
    if (document.hidden) {
      if (state.me && !stopped) armHidden();
    } else if (state.room === "paused") {
      rejoin();
    }
  };
  // Someone in voice hears it coming: two warnings, then a hang-up that plays out before voice stops with the room.
  let hiddenStage = 0;
  const armHidden = () => {
    hiddenStage = 0;
    hiddenTimer = window.setTimeout(hiddenTick, HIDDEN_PAUSE_MS - HIDDEN_WARN_BEFORE_MS[0]);
  };
  const hiddenTick = () => {
    hiddenTimer = 0;
    if (!document.hidden || stopped || !state.me) return;
    if (hiddenStage < HIDDEN_WARN_BEFORE_MS.length) {
      BL.voice.warnLeaving(hiddenStage);
      const left = HIDDEN_WARN_BEFORE_MS[hiddenStage++];
      hiddenTimer = window.setTimeout(hiddenTick, left - (HIDDEN_WARN_BEFORE_MS[hiddenStage] || 0));
      return;
    }
    const playing = BL.voice.hangUp();
    if (playing) hiddenTimer = window.setTimeout(pause, playing);
    else pause();
  };
  const pause = () => {
    hiddenTimer = 0;
    if (!document.hidden || stopped || !state.me) return;
    stopped = true;
    window.clearTimeout(retryTimer);
    close("paused");
  };
  document.addEventListener("visibilitychange", onVisibility);

  // The host's frame of Oogas, sent as bytes (a typed array view is sent as just its own bytes).
  const sendNpc = (view) => {
    if (ws && ws.readyState === WebSocket.OPEN && state.hostId === state.selfId) ws.send(view);
  };

  // A synchronous handoff between Arcade hall scenes keeps the same driven body and voice subscriptions.
  let holdingBody = false;
  const handoffBody = fn => {
    holdingBody = true;
    try { return fn(); }
    catch (error) { holdingBody = false; setBody(null); throw error; }
    finally { holdingBody = false; }
  };
  const setBody = (name) => {
    if (cabinetAnchor) return;
    if (holdingBody && name === null) return;
    if (name === body) return;
    body = state.body = name;
    state.bodyKind = bodyKind(name);
    state.bodyName = bodyName(name);
    poseAt = 0; px = NaN;
    gKnown = poseHasG = false;
    jetSent = weaponSent = 0; visualKnown = false; restKnown = restActive = false;
    sendBody();
    // The room starts another actor at full health.
    hpSent = 100; koSent = false; hpAt = 0;
    rosterChanged();
  };

  // The driven Ooga's health, called every frame: sent only when its step or knockout changed, HP_MS apart, so a
  // fight costs a few messages a second and an Ooga at full health none.
  const setHealth = (value, stunned) => {
    if (state.room !== "live" || !body) return;
    const v = Math.max(0, Math.min(100, Math.round(value / HP_STEP) * HP_STEP)), ko = !!stunned;
    if (v === hpSent && ko === koSent) return;
    const now = performance.now();
    if (now - hpAt < HP_MS) return;
    hpAt = now;
    hpSent = v;
    koSent = ko;
    send(`{"t":"hp","v":${v},"ko":${ko}}`);
  };

  // The room's one bucket for reactions and the hand (worker/src/protocol.js REACT_HZ 3, REACT_BURST 6), mirrored a
  // little short of it, since frames can reach the room closer together than they left here.
  const REACT_HZ = 2.5, REACT_BURST = 5;
  let reactTokens = REACT_BURST, reactAt = 0;
  const reactToken = () => {
    const now = performance.now();
    reactTokens = Math.min(REACT_BURST, reactTokens + (now - reactAt) * REACT_HZ / 1000);
    reactAt = now;
    if (reactTokens < 1) return false;
    reactTokens--;
    return true;
  };
  // A reaction over this page's driven body; false when it was not sent (not live, an older room, not an emoji, or
  // over the bucket).
  const sendReaction = (emoji) => {
    if (!state.reactions || state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN || !BL.reactionPolicy.valid(emoji)) return false;
    if (!reactToken()) return false;
    send(JSON.stringify({ t: "react", e: emoji }));
    for (const fn of reactSubscribers) fn(0, emoji);
    return true;
  };
  const subscribeReactions = (fn) => {
    reactSubscribers.add(fn);
    return () => reactSubscribers.delete(fn);
  };
  // The persistent slot: an empty emoji is the raised hand in skin tone `tone` (0 to 5). Older rooms only take the hand.
  // False, with nothing changed, when the room cannot take it now (not live or over the bucket shared with reactions).
  const sendHand = () => send(JSON.stringify({ t: "hand", on: state.hand, tone: state.handTone, ...(state.customHand ? { e: state.handEmoji } : {}) }));
  const setHand = (on, tone = state.handTone, emoji = "") => {
    if (typeof on !== "boolean" || emoji !== "" && !BL.reactionPolicy.valid(emoji)) return false;
    if (!state.customHand) emoji = "";
    if (on && (!state.reactions || state.room !== "live")) return false;
    if (state.hand === on && (!on || state.handTone === tone && state.handEmoji === emoji)) return true;
    const live = state.room === "live" && !!ws && ws.readyState === WebSocket.OPEN;
    if (live && !reactToken()) return false;
    state.hand = on;
    state.handTone = BL.reactionPolicy.tone(tone) ? tone : 0;
    state.handEmoji = emoji;
    if (live) sendHand();
    emit();
    return true;
  };

  // Where this page stands with player `id`: "linked", "asked" (this page's ask waits) or "none".
  const voiceLink = (id) => state.linked.has(id) ? "linked" : state.linkWants.has(id) ? "asked" : "none";
  // Asks for a voice link with player `id`, or takes this page's ask back; false when the room cannot take it. Nothing
  // changes here until the room answers.
  const toggleVoiceLink = (id) => {
    if (!state.voiceLinks || state.room !== "live" || !Number.isSafeInteger(id) || id <= 0) return false;
    send(JSON.stringify({ t: "link", to: id, on: !state.linkWants.has(id) }));
    return true;
  };
  // Links with everyone here who has asked this page, or with nobody waiting takes back all of its asks; false when the
  // room cannot take it, so the key stays with the scene. The room's `links` reply says what it did.
  const linkEveryone = () => {
    if (!state.voiceLinks || state.room !== "live") return false;
    send('{"t":"link-all"}');
    return true;
  };

  // This page's own microphone muted or not, for every other page's roster.
  const setMuted = (on) => {
    if (on === muted) return;
    muted = on;
    sendMute();
  };

  // One line of Ooga Chat; false when it was not sent (not live, invalid, overlong or unsupported by an older server).
  const PRIVATE_OPS = ["invite", "accept", "decline", "block", "end", "data"];
  const sendPrivate = (op, to, d, n) => {
    if (!state.privateChat || state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN) return false;
    if (!PRIVATE_OPS.includes(op) || !Number.isSafeInteger(to) || to <= 0) return false;
    send(JSON.stringify(op === "data" ? { t: "pm", op, to, d, n } : { t: "pm", op, to }));
    return true;
  };
  const subscribePrivate = (fn) => {
    privateSubscribers.add(fn);
    return () => privateSubscribers.delete(fn);
  };
  const sendChat = (text, clientId) => {
    if (BL.chatPolicy.error(text)) return false;
    const line = BL.chatPolicy.text(text);
    if (!state.chatUnicode && !BL.chatPolicy.legacy(line)) return false;
    if (state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN || !line || line.length > CHAT_MAX) return false;
    if (clientId !== undefined && !chatIdValid(clientId)) return false;
    send(JSON.stringify({ t: "chat", text: line, ...(clientId === undefined ? {} : { clientId }) }));
    return true;
  };

  // Throttled to POSE_MS and skipped while nothing moved; a changed gorilla pose, jetpack or weapon also earns a report.
  const sendPose = (x, y, z, yaw, g = null, jet = 0, weapon = 0, visual = null, rest = 0) => {
    if (cabinetAnchor) {
      const at = cabinetAnchor;
      x = at.x; y = at.y; z = at.z; yaw = at.yaw; g = null; jet = weapon = 0; visual = null; rest = 0;
    }
    const now = performance.now();
    if (state.bodyKind === "gorilla" && g && g.length === 6) {
      let valid = true;
      for (let i = 0; i < 6; i++) if (!Number.isFinite(g[i])) { valid = false; break; }
      if (valid) poseHasG = true;
    }
    const self = state.self;
    self.x = x; self.y = y; self.z = z; self.zone = zone;
    if (now - poseAt < POSE_MS) return;
    // The room drops a pose outside its bounds, which would freeze this Ooga on other pages: hold it at the edge.
    x = Math.max(-BOUND_XZ, Math.min(BOUND_XZ, x));
    z = Math.max(-BOUND_XZ, Math.min(BOUND_XZ, z));
    y = Math.max(BOUND_Y_MIN, Math.min(BOUND_Y_MAX, y));
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    if (state.bodyKind !== "gorilla") g = null;
    if (g) for (let i = 0; i < 6; i++) if (!Number.isFinite(g[i])) { g = null; break; }
    if (state.bodyKind === "gorilla" || !Number.isInteger(jet) || jet < 0 || jet > 7) jet = 0;
    if (state.bodyKind === "gorilla" || !Number.isInteger(weapon) || weapon < 0 || weapon > 255) weapon = 0;
    if (state.bodyKind === "gorilla" || !validVisual(visual)) visual = null;
    if (state.bodyKind === "gorilla" || !validRest(rest)) rest = 0;
    let changed = !!g && !gKnown || jet !== jetSent || weapon !== weaponSent || !!visual !== visualKnown
      || state.bodyKind !== "gorilla" && (!restKnown || !!rest !== restActive);
    if (rest && !changed) for (let i = 0; i < 6; i++) if (rest[i] !== restSent[i]) { changed = true; break; }
    if (visual && !changed) for (let i = 0; i < 17; i++) if (visual[i] !== visualSent[i]) { changed = true; break; }
    // A held wind-up can outlast its last changing sample. A bounded heartbeat keeps it live, and
    // lets a silent/disconnected action expire without an extra timer or a new message type.
    if (visual && (visual[3] & 40 || visual[14] > 0) && now - poseAt >= 300) changed = true;
    if (g && !changed) for (let i = 0; i < 6; i++) if (g[i] !== gSent[i]) { changed = true; break; }
    // Even when the complete pose is unchanged, remember that its cached locomotion is valid for reconnect.
    if (g) poseHasG = true;
    if (!changed && Math.abs(x - px) < 0.005 && Math.abs(y - py) < 0.005 && Math.abs(z - pz) < 0.005 && Math.abs(yaw - pyaw) < 0.01) return;
    poseAt = now;
    px = x; py = y; pz = z; pyaw = yaw;
    poseHasG = !!g;
    let extra = "";
    if (g) {
      for (let i = 0; i < 6; i++) gSent[i] = g[i];
      gKnown = true;
      extra = `,"g":[${g[0]},${g[1].toFixed(3)},${g[2].toFixed(3)},${g[3].toFixed(3)},${g[4].toFixed(3)},${g[5].toFixed(3)}]`;
    }
    jetSent = jet; weaponSent = weapon;
    if (jet) extra += `,"j":${jet}`;
    if (weapon) extra += `,"w":${weapon}`;
    visualKnown = !!visual;
    if (visual) { visualSent.set(visual); extra += `,"v":[${visualSent.join(",")}]`; }
    restKnown = state.bodyKind !== "gorilla"; restActive = !!rest;
    if (restKnown) {
      if (rest) { restSent.set(rest); extra += `,"r":[${restSent.join(",")}]`; }
      else extra += ',"r":0';
    }
    if (state.room === "live") send(`{"t":"pose","x":${x.toFixed(3)},"y":${y.toFixed(3)},"z":${z.toFixed(3)},"yaw":${yaw.toFixed(3)}${extra}}`);
    moved();
  };
  // The driven Ooga's own banana leaving its muzzle and its strike: only an Ooga's, only to a live room, which
  // relays them to the zone for drawing; whether each was sent.
  const sendShot = (fx, fy, fz, tx, ty, tz) => {
    if (state.room !== "live" || !body || state.bodyKind === "gorilla"
      || !Number.isFinite(fx + fy + fz + tx + ty + tz)) return false;
    send(`{"t":"shot","a":[${fx.toFixed(2)},${fy.toFixed(2)},${fz.toFixed(2)},${tx.toFixed(2)},${ty.toFixed(2)},${tz.toFixed(2)}]}`);
    return true;
  };
  const sendSwing = () => {
    if (state.room !== "live" || !body || state.bodyKind === "gorilla") return false;
    send(`{"t":"swing"}`);
    return true;
  };

  // The doorway: each sends only to a live room that knows it, and says whether it did.
  const doorSend = (text) => {
    if (state.room !== "live" || !state.doorway || !ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(text);
    return true;
  };
  const askDoor = (dir, room) => (dir === "in" || dir === "out") && sphereRoom(room)
    && doorSend(JSON.stringify({ t: "door", op: "ask", dir, room }));
  const goDoor = (cycle) => chatIdValid(cycle) && doorSend(JSON.stringify({ t: "door", op: "go", cycle }));
  const doneDoor = (cycle) => chatIdValid(cycle) && doorSend(JSON.stringify({ t: "door", op: "done", cycle }));
  const cancelDoor = () => doorSend('{"t":"door","op":"cancel"}');
  // A room's lock (room.js): from inside, set its PIN or open it (anyone inside may); from the doorway, try the PIN.
  const roomPin = (op, room, pin) => state.roomLocks && lockableRoom(room) && /^[0-9]{4}$/.test(pin)
    && doorSend(JSON.stringify({ t: "door", op, room, pin }));
  const lockRoom = (room, pin) => roomPin("lock", room, pin);
  const unlockRoom = (room) => state.roomLocks && lockableRoom(room) && doorSend(JSON.stringify({ t: "door", op: "unlock", room }));
  const tryRoomPin = (room, pin) => roomPin("try", room, pin);
  const passDoor = (door, dir) => typeof door === "string" && DOOR_NAME.test(door) && (dir === "in" || dir === "out")
    && doorSend(JSON.stringify({ t: "door", op: "pass", door, dir }));

  const loginOf = (character) => (character.github || character.handle).toLowerCase();
  // The character whose GitHub login this is; a handle that only looks like the login does not count.
  const characterOf = (login, id) => {
    const account = BL.accountIdentities.accountForId(id);
    if (account) return BL.characters.get(account.handle);
    const character = BL.characters.get(login);
    if (id !== undefined && character && BL.accountIdentities.accountForHandle(character.handle)) return null;
    return character && loginOf(character) === String(login).toLowerCase() ? character : null;
  };
  const ownCharacter = () => state.me && characterOf(state.me.login, state.me.id);
  // A local control preference only: never used by room, microphone or sign-in checks.
  const preferredCharacter = () => ownCharacter() || localCharacter;
  const prepareLocalCharacter = () => {
    const own = ownCharacter();
    if (own) return localCharacter = own;
    const login = rememberedLogin(), known = login && characterOf(login);
    localCharacter = known;
    if (!known || mayDrive(known.handle)) {
      // An unbundled remembered login gets its own likeness, unless that name is already another Ooga's.
      const entry = !known && login && BL.contributors.addLocal(login) || BL.contributors.addLocal("Ooga");
      localCharacter = { handle: entry.name, display: entry.display };
    }
    return localCharacter;
  };
  // The assigned Ooga among a game's cast or roster. This locks local game pickers too;
  // it does not authenticate the visitor or grant a shared body.
  const ownAmong = (list) => {
    const own = preferredCharacter();
    return own && list.some((entry) => entry.name === own.handle) ? own.handle : null;
  };

  /** null when this visitor may drive the Ooga named `name`; otherwise the words that say why not. */
  const mayDrive = (name) => {
    const owner = BL.characters.get(name);
    if (state.me) return owner && ownCharacter() === owner ? null : "Drive your own Ooga";
    // Explicit debug fixtures prepare no local identity and keep their chosen cast: any bundled Ooga, locally.
    // Normal arrivals always prepare one.
    if (!localCharacter) {
      if (!state.backend || !owner) return null;
      if (owner.temporary) return "Sign in to drive your Ooga";
    } else if (String(owner ? owner.handle : name).toLowerCase() !== localCharacter.handle.toLowerCase()) return "Drive your own Ooga";
    if (!owner) return null;
    const who = owner.display || owner.handle;
    const wanted = owner.handle.toLowerCase();
    for (const rec of remotes.values()) {
      if (characterOf(rec.login, rec.id) === owner) return `${who} is here and drives this Ooga`;
      if (rec.body && rec.body.toLowerCase() === wanted) return `Someone is already driving ${who}`;
    }
    return null;
  };

  const mayDriveGorilla = (name) => {
    if (mayDrive(name)) return "Drive your own gorilla";
    const owner = BL.characters.get(name);
    if (state.me || !owner) return null;
    const who = owner.display || owner.handle, wanted = gorillaBody(owner.handle).toLowerCase();
    for (const rec of remotes.values()) {
      if (characterOf(rec.login, rec.id) === owner) return `${who} is here and drives this gorilla`;
      if (rec.body && rec.body.toLowerCase() === wanted) return `Someone is already driving ${who}'s gorilla`;
    }
    return null;
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  const subscribeRoster = (fn) => {
    rosterSubscribers.add(fn);
    return () => rosterSubscribers.delete(fn);
  };
  const subscribeMoves = (fn) => {
    moveSubscribers.add(fn);
    return () => moveSubscribers.delete(fn);
  };
  const subscribeChat = (fn) => {
    chatSubscribers.add(fn);
    return () => chatSubscribers.delete(fn);
  };
  // The shared chalkboard (chalk-board.js): ask for it, let it go, and edit it while holding it. An edit applies to
  // the page's copy at once and waits in `chalkOut`, merged with the next of its kind, until `flushChalk` or an edit
  // of another kind sends it, so a line's points go a few to a frame. Each says whether it was sent, or why not.
  const takeChalk = () => {
    if (!state.chalk || state.room !== "live") return false;
    send(`{"t":"chalk","v":${BL.chalkBoard.VERSION},"k":"take"}`);
    return true;
  };
  const flushChalk = () => {
    for (const op of chalkOut) send(JSON.stringify({ t: "chalk", v: BL.chalkBoard.VERSION, ...op }));
    chalkOut.length = 0;
  };
  const dropChalk = () => {
    const c = state.chalk;
    if (!c || c.editor !== state.selfId) return;
    flushChalk();
    if (state.room === "live") send(`{"t":"chalk","v":${BL.chalkBoard.VERSION},"k":"drop"}`);
    c.editor = 0;
    c.session = BL.chalkBoard.session(c.board);
  };
  const chalkEdit = (op) => {
    const c = state.chalk, C = BL.chalkBoard;
    if (!c || c.editor !== state.selfId || state.room !== "live") return "away";
    // A repeated clear/reset changes neither the marks nor the shared writing session.
    if (op.k === "wipe" && C.preset(c.board) === op.to) return null;
    const error = C.apply(c.board, op, c.session);
    if (error) return error;
    const last = chalkOut[chalkOut.length - 1];
    if (op.k === "more" && last && last.k === "more" && last.p.length + op.p.length <= C.CHUNK * 2) last.p.push(...op.p);
    else if (op.k === "type" && last && last.k === "type" && last.c.length + op.c.length <= C.TYPE_CHUNK) last.c.push(...op.c);
    else chalkOut.push(op.k === "more" ? { k: "more", p: op.p.slice() } : op.k === "type" ? { k: "type", c: op.c.slice() } : op);
    if (op.k !== "more" && op.k !== "type") flushChalk();
    return null;
  };
  const subscribeChalk = (fn) => {
    chalkSubscribers.add(fn);
    return () => chalkSubscribers.delete(fn);
  };
  // DSB Land's free hardware wallets (wallet-bombs.js): one of the visitor's own devices' events, for the pages in
  // the same zone, sent only for an Ooga in a live room; and what the room passes on from others, each message as it
  // came (wallet-bombs.js `heard` checks it).
  const sendWallet = (msg) => {
    if (state.room !== "live" || !body || state.bodyKind === "gorilla") return false;
    send(JSON.stringify({ t: "wallet", ...msg }));
    return true;
  };
  const subscribeWallets = (fn) => {
    walletSubscribers.add(fn);
    return () => walletSubscribers.delete(fn);
  };
  const subscribeShots = (fn) => {
    shotSubscribers.add(fn);
    return () => shotSubscribers.delete(fn);
  };
  const subscribeSwings = (fn) => {
    swingSubscribers.add(fn);
    return () => swingSubscribers.delete(fn);
  };
  const subscribeDoor = (fn) => {
    doorSubscribers.add(fn);
    return () => doorSubscribers.delete(fn);
  };
  const subscribePresence = (fn) => {
    presenceSubscribers.add(fn);
    return () => presenceSubscribers.delete(fn);
  };

  const subscribeHighscores = fn => { highscoreSubscribers.add(fn); return () => highscoreSubscribers.delete(fn); };
  const subscribeStudio = fn => { studioSubscribers.add(fn); return () => studioSubscribers.delete(fn); };
  const studioCommand = (action, fields = {}) => {
    if (state.room !== "live") return false;
    send(JSON.stringify({...fields, t:"studio", action}));
    return true;
  };

  const dispose = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    stopped = true;
    window.clearTimeout(retryTimer);
    window.clearTimeout(hiddenTimer);
    subscribers.clear();
    highscoreSubscribers.clear();
    rosterSubscribers.clear();
    moveSubscribers.clear();
    studioSubscribers.clear();
    chatSubscribers.clear();
    chalkSubscribers.clear();
    walletSubscribers.clear();
    shotSubscribers.clear(); swingSubscribers.clear(); reactSubscribers.clear();
    presenceSubscribers.clear();
    doorSubscribers.clear();
    close("off");
  };

  BL.net = { lockRoom, unlockRoom, tryRoomPin, voiceLink, toggleVoiceLink, linkEveryone, cabinetSeats, takeCabinet, leaveCabinet, get cabinet() { return cabinetSeat; }, handoffBody, hockeyTables, subscribeHockey, sendHockey, subscribeBf, subscribeBfFrame, sendBf, sendBfInput, sendBfFrame, subscribeHighscores, subscribeStudio, studioCommand, start, recheck, subscribe, subscribeRoster, subscribeMoves, subscribeChat, subscribePrivate, subscribeChalk, subscribeWallets, subscribeShots, subscribeSwings, subscribePresence, subscribeDoor, dispose, login, logout, setDisplay, rejoin, setBody, setZone, setBlend, setPokerVoice, setHub, setMuted, setHealth, sendNpc, sendChat, sendPrivate, sendReaction, subscribeReactions, setHand, sendPose, takeChalk, dropChalk, chalkEdit, flushChalk, sendWallet, sendShot, sendSwing, askDoor, goDoor, doneDoor, cancelDoor, passDoor, mayDrive, mayDriveGorilla, ownCharacter, preferredCharacter, prepareLocalCharacter, ownAmong, characterOf, gorillaBody, bodyName, bodyKind, serverNow, remotes, state, CHAT_MAX, CHAT_KEEP, get npcFrame() { return npcFrame; } };
})();
