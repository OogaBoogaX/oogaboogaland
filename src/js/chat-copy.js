// A hosted chat's copy of Main Island (docs/ooga-chat-hosts.md, "Open for the second PR"): a speaker in a chat on the
// island page walks their own Ooga into the chat's own copy of the zone, where only its members' Oogas stand, and back.
// The island scene hands this its pieces (`attach(hooks)` in its enter and resume, `detach()` in its leave, `update(dt)`
// each frame), as it hands Cloud Hopper's controller its own; the trip is the hub's own scene with a mode, never a new
// scene, route or history entry. Go there (the chat footer's button, chat-hosts.js through cloud-panel.js) beams the
// Ooga out where it stands in the island's green glyph stream (`hooks.beam`, sleep-beam.js), moves its socket to the
// copy (net.js `travel`) and the Ooga beside the banana pile with the hub's own arrival search (`hooks.enter`, which
// also puts away the crew, the gorillas and the island's world and seals every cave mouth and door), and beams it in
// once the copy's welcome says it is there. Leave, leaving the chat, the chat ending, a host removing them or any kick
// from the copy (leaving the stage among them) beams it back to exactly where it stood (`hooks.exit`). The hub's own
// leave ends the trip without a beam. Refused, with words for the button's tooltip (`refusal`), during Cloud Hopper,
// GAME MODE, a cabinet, a duel, seated, in bed, driving a gorilla, away from the island's open air or outside the hub,
// and for a DSB Land chat until its copy lands. The visitor's island voice stays paused all the while: they are in a call.
// Hooks: `refusal()` (the hub's own words, or ""), `spot()` (where the Ooga stands: feet, heading, zone), `hold(on)`,
// `beam(progress, incoming)` (progress < 0 ends it), `show(on)`, `enter()` (returns the arrival spot) and `exit(home)`
// (null when the hub is going away and only has to put things back).
// `attach`, `detach`, `update`, `go(chat)`, `leave()`, `toggle()`, `button(room)` (the footer's `{ label, words,
// disabled, title }`, or null for no button), `refusal(room)`, `subscribe(fn)`, `phase`, `active`, `chat` and `stats`.
// Nothing runs but `update` while attached; no timers.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // How long each beam runs, how long the copy has to answer before the Ooga comes home, and how often the button's
  // refusal is read again while idle.
  const BEAM_S = 0.6, WAIT_S = 12, REFUSAL_S = 0.25;
  const SPEAKING = ["eligible", "pending", "active"];
  const subs = new Set();
  let hooks = null, phase = "idle", chat = null, home = null, clock = 0, why = "", recheck = 0, version = 0, lastLeft = 0, said = "";
  const emit = () => { version++; for (const fn of subs) fn(); };
  const setPhase = (next) => { phase = next; clock = 0; emit(); };
  // In the chat's copy now, or on the way there or back.
  const active = () => phase !== "idle";
  // Whether the visitor may speak in the chat: speaking, or allowed to (on its stage).
  const speaker = (room) => {
    const calls = BL.chatCall, you = room && room.you || {};
    return !!calls && (calls.state.voice.role === "speaker" || calls.state.voice.busy || SPEAKING.includes(you.speak));
  };
  // Why Go there can't be pressed now, or "" when it can.
  const refusal = (room = BL.chatCall && BL.chatCall.room) => {
    if (active()) return "";
    if (!room) return "Join a chat first";
    if (room.zone !== "main") return "Going there is for Main Island chats for now";
    const n = BL.net;
    if (!n || !n.state.me) return "Sign in to go there";
    if (n.state.room !== "live") return "Not connected to the island";
    if (!n.state.travel) return "The island can't open the chat's island yet";
    if (!hooks) return "Go there from Main Island";
    return hooks.refusal() || "";
  };
  // The footer's button: Go there, or Go back while in the copy (Going…, greyed, while a beam runs), for a speaker in a Main
  // Island chat on the island page.
  const button = (room) => {
    if (!room || room.zone !== "main" || !active() && !speaker(room)) return null;
    if (active()) {
      const busy = phase !== "there";
      // "Go back", never "Leave": the chat's own Leave chat stands beside it and means leaving the chat.
      return { label: busy ? "Going…" : "Go back", words: "Go back from the chat's island", disabled: busy, title: busy ? "On the way…" : "Back to where your Ooga stood" };
    }
    const refused = refusal(room);
    return { label: "Go there", words: "Go to the chat's island", disabled: !!refused, title: refused || "Walk your Ooga into the chat's own island" };
  };
  const toast = (text) => { if (text && BL.hud) BL.hud.toast(text); };
  const go = (id) => {
    const room = BL.chatCall && BL.chatCall.room;
    if (!room || room.id !== id) return false;
    const refused = refusal(room);
    if (refused) { toast(refused); return false; }
    chat = id;
    home = hooks.spot();
    lastLeft = BL.net.state.copyLeft;
    hooks.hold(true);
    setPhase("out");
    return true;
  };
  // The Ooga hidden, back on the island at the spot it left from, and beamed in there.
  const comeHome = () => {
    const n = BL.net;
    if (n.state.target === chat) n.travel(null, home);
    hooks.beam(-1, false);
    hooks.show(false);
    hooks.exit(home);
    hooks.show(true);
    setPhase("return");
  };
  // Home from the copy: a beam out where the Ooga stands, unless it is hidden already (still on the way there).
  const leave = (words = "") => {
    if (phase === "idle" || phase === "back" || phase === "return") return;
    said = words;
    if (phase === "out" || phase === "away") { comeHome(); return; }
    hooks.hold(true);
    setPhase("back");
  };
  const toggle = () => {
    if (active()) leave();
    else if (BL.chatCall && BL.chatCall.room) go(BL.chatCall.room.id);
  };
  // What a copy's kick says, as words for a toast ("" says nothing more than the chat's own notice).
  const KICKED = { "not-speaker": "Only the chat's speakers can go to its island", "not-copy": "Only the chat's speakers can go to its island",
    stage: "Off the stage: back on the island", "chat-ended": "", removed: "" };
  const update = (dt) => {
    if (!hooks) return;
    const n = BL.net, room = BL.chatCall && BL.chatCall.room;
    clock += Math.min(dt, 0.1);
    // The button's words follow the hub's own refusals a few times a second, told only when they change.
    if (phase === "idle") {
      if ((recheck -= dt) > 0) return;
      recheck = REFUSAL_S;
      const next = refusal(room);
      if (next !== why) { why = next; emit(); }
      return;
    }
    // Sent home by the copy: net.js is on its way already.
    if (n.state.copyLeft !== lastLeft && (phase === "away" || phase === "in" || phase === "there")) {
      lastLeft = n.state.copyLeft;
      const reason = n.state.copyReason;
      leave(Object.hasOwn(KICKED, reason) ? KICKED[reason] : "Back on the island");
      return;
    }
    // Out of the chat, or onto another one: home.
    if ((phase === "in" || phase === "there") && (!room || room.id !== chat)) { leave(); return; }
    if (phase === "out" || phase === "back") {
      hooks.beam(clock / BEAM_S, false);
      if (clock < BEAM_S) return;
      if (phase === "back") { comeHome(); return; }
      hooks.beam(-1, false);
      hooks.show(false);
      const at = hooks.enter();
      if (!n.travel({ chat, home }, at)) { said = "The chat's island can't be reached right now"; comeHome(); return; }
      setPhase("away");
    } else if (phase === "away") {
      if (n.state.copy && n.state.copy.chat === chat && n.state.room === "live") { hooks.show(true); setPhase("in"); return; }
      if (clock >= WAIT_S) { said = "The chat's island didn't answer: back on the island"; comeHome(); }
    } else if (phase === "in" || phase === "return") {
      hooks.beam(clock / BEAM_S, true);
      if (clock < BEAM_S) return;
      hooks.beam(-1, true);
      hooks.hold(false);
      if (phase === "in") { setPhase("there"); return; }
      const words = said;
      chat = home = null; said = ""; why = "";
      setPhase("idle");
      toast(words);
    }
  };
  const attach = (next) => { hooks = next; recheck = 0; emit(); };
  // The hub going away ends a trip where it stands, without a beam: the socket goes home and the hub puts back what it
  // put away.
  const detach = () => {
    if (!hooks) return;
    if (active()) {
      const n = BL.net;
      if (n.state.target === chat) n.travel(null, home);
      hooks.beam(-1, false);
      hooks.exit(null);
      hooks.show(true);
      hooks.hold(false);
    }
    hooks = null;
    chat = home = null;
    said = "";
    phase = "idle";
    emit();
  };
  BL.chatCopy = {
    attach, detach, update, go, leave: () => leave(), toggle, button, refusal,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    get phase() { return phase; },
    get active() { return active(); },
    get chat() { return chat; },
    get stats() { return { phase, chat, home, attached: !!hooks, version }; }
  };
})();
