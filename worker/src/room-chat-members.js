// Each hosted chat as the island's Online Oogas shows it (docs/ooga-chat-hosts.md, Who the island sees in chats): the
// Room's side. Each chat's Audience object tells the Room its title and counts as they change (`chatMembers`, at most
// every 2 s a chat, all zero as it ends): how many speak, how many listen, and which accounts are there through Ooga
// Chat's app rather than the island's page (`ids`, `gh:<n>` or `x:<n>`, at most IDS_MAX). Pages never see an id: every
// page hears each chat's title and counts as they change (`{ t: "chat-summary", chat, title, speakers, listeners }`) and
// the whole set in its welcome (`chatSummaries`), and one number, how many are in chats through the app and not on the
// island, each account once however many chats it is in (`{ t: "chat-online", n }`, the welcome's `chatOnline`), which
// every "N online" adds; it is worked out here again whenever a chat's word or the island's players change. The Room
// keeps the entries (ids too) in memory and in storage, so a hibernation wake keeps them, until the chat ends. Only
// where welcome lists `chat-summary-v1`, which the `chats` switch turns on with `call-v1`.
// No timer of its own: an entry for a chat the directory no longer lists goes at the sweep the Room already runs.
// Re-exported by protocol.js, as the audience glue is, so the Room's checks load it with the protocol.

import { bridgeFeatures } from "./chat-bridge-protocol.js";

export const CHAT_SUMMARY_FEATURE = "chat-summary-v1";
// At most this many chats kept, and no count above COUNT_MAX.
export const CHATS_KEPT = 32;
const COUNT_MAX = 1e6;
const CHAT = /^[A-Za-z0-9_-]{16}$/, CONTROL = /[\u0000-\u001f\u007f]/;
// A chat's people at most: its listeners (`AUDIENCE_LISTENERS`, at most 5000) and its speakers (at most 32).
const TITLE_MAX = 60, IDS_MAX = 5032, IDENTITY = /^(gh|x):[1-9][0-9]{0,19}$/;
const on = (room) => bridgeFeatures(room.env || {}).chats;
const count = (n) => (Number.isSafeInteger(n) && n > 0 ? Math.min(n, COUNT_MAX) : 0);

/** A chat's entry, cleaned, or null for one with nobody in it: its app accounts each once, never more than everyone there. */
const entry = (title, speakers, listeners, ids) => {
  const s = count(speakers), l = count(listeners);
  if (!s && !l) return null;
  const t = typeof title === "string" && title.trim() && title.length <= TITLE_MAX && !CONTROL.test(title) ? title.trim() : "";
  const app = [...new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && IDENTITY.test(id)) : [])].slice(0, Math.min(IDS_MAX, s + l));
  return { title: t, speakers: s, listeners: l, ids: app };
};
const message = (chat, e) => ({ t: "chat-summary", chat, title: e ? e.title : "", speakers: e ? e.speakers : 0, listeners: e ? e.listeners : 0 });
/** In chats through the app and not on the island, each account once. */
const online = (room) => {
  const seen = new Set();
  for (const e of room.chatRosters ? room.chatRosters.values() : []) for (const id of e.ids) {
    if (id.startsWith("gh:") && room.players.has(Number(id.slice(3)))) continue;
    seen.add(id);
  }
  return seen.size;
};

export const chatMembersRoom = {
  FEATURE: CHAT_SUMMARY_FEATURE,
  features: (room) => (on(room) ? [CHAT_SUMMARY_FEATURE] : []),
  /** The stored entries, checked as they load; one stored with its members' names before keeps only its counts. */
  restore(room, stored) {
    room.chatRosters = new Map();
    for (const raw of Array.isArray(stored) ? stored.slice(0, CHATS_KEPT) : []) {
      if (!Array.isArray(raw) || !CHAT.test(raw[0]) || !raw[1]) continue;
      const kept = raw[1], named = Array.isArray(kept.members) ? kept.members : null;
      const e = named ? entry(kept.title, named.filter((m) => m && m.role === "speaker").length, named.filter((m) => m && m.role !== "speaker").length + count(kept.more), [])
        : entry(kept.title, kept.speakers, kept.listeners, kept.ids);
      if (e) room.chatRosters.set(raw[0], e);
    }
    // Not worked out here: the woken Room's players come back after this, so the next change works it out afresh and
    // tells every page (`players`), and a welcome always works it out as it goes.
    room.chatOnline = undefined;
  },
  keep(room) { room.later(room.ctx.storage.put("chatMembers", [...room.chatRosters])); },
  /** A chat's word: its title and counts now, replacing what was kept; nobody in it drops it. Every page hears a change. */
  update(room, chat, title, speakers, listeners, ids) {
    if (typeof chat !== "string" || !CHAT.test(chat)) return { ok: false };
    if (!room.chatRosters) room.chatRosters = new Map();
    const e = on(room) ? entry(title, speakers, listeners, ids) : null;
    const before = room.chatRosters.get(chat);
    if (!e && !before) return { ok: true };
    if (e && !before && room.chatRosters.size >= CHATS_KEPT) return { ok: true };
    if (e && before && JSON.stringify(e) === JSON.stringify(before)) return { ok: true };
    const shown = JSON.stringify(message(chat, before)) !== JSON.stringify(message(chat, e));
    if (e) room.chatRosters.set(chat, e); else room.chatRosters.delete(chat);
    chatMembersRoom.keep(room);
    if (on(room) && shown) room.broadcast(message(chat, e));
    chatMembersRoom.players(room);
    return { ok: true };
  },
  /** The island's players or a chat's word changed: every page hears the number in chats when it moves. */
  players(room) {
    // A chat's copy of the island (room-copy.js) has no Online Oogas of chats: only the island works this out.
    if (room.copy) return;
    const n = online(room);
    if (n === room.chatOnline) return;
    room.chatOnline = n;
    if (on(room)) room.broadcast({ t: "chat-online", n });
  },
  /** What a page's welcome carries: every chat's, only where the feature is on. */
  welcome(room) {
    if (!on(room) || !room.chatRosters || !room.chatRosters.size) return {};
    return { chatSummaries: [...room.chatRosters].map(([chat, e]) => message(chat, e)), chatOnline: online(room) };
  },
  /** At the sweep: a chat the directory no longer lists (its last word lost) goes. A directory that can't be read drops nothing. */
  async sweep(room) {
    if (!room.chatRosters || !room.chatRosters.size || !room.env || !room.env.CHATS) return;
    let live;
    try { live = new Set((await room.env.CHATS.getByName("chats").list()).map((c) => c.id)); } catch { return; }
    for (const chat of [...room.chatRosters.keys()]) if (!live.has(chat)) chatMembersRoom.update(room, chat, "", 0, 0, []);
  },
};
