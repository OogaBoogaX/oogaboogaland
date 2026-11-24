// The live hosted chats (docs/ooga-chat-hosts.md): one Durable Object, `ChatDirectory`, named `chats`, that lists every
// chat a host has started and not ended, and remembers which chat each account last took the stage in, so an account
// speaks in one chat at a time. Each chat is its own Audience object (`chat:<id>`, audience.js), which tells this one when
// it opens, how many speak and listen in it as that changes, and when it ends. Nothing runs on a timer: the directory
// only answers. It stores its list, so a woken object lists the same chats.
// `startChat` is the one way a chat begins, shared by the island's route and the bridge (chats.js): the title through
// the island's own chat policy, a free place in the directory (at most CHATS_MAX, one a host, a start a host every
// START_GAP_MS), then the chat's own object opened. A chat that cannot open is taken back out of the list.

import { DurableObject } from "cloudflare:workers";
import { CHAT_ID, CHAT_TITLE_MAX, chatName, DIRECTORY_NAME, isChatLand } from "./audience.js";
import { ID } from "./audience-model.js";
import "../../src/js/chat-policy.js";

export const CHATS_MAX = 20;
export const START_GAP_MS = 5 * 60 * 1000;
const STARTS_KEPT = 256;

const refuse = (code, extra = {}) => ({ ok: false, code, ...extra });
const count = (n) => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const hostInfo = (info) => info && typeof info.login === "string" && /^[\w.-]{1,39}$/.test(info.login)
  ? { login: info.login, display: String(info.display || info.login).slice(0, 50), character: typeof info.character === "string" && /^[\w.-]{1,40}$/.test(info.character) ? info.character : null }
  : null;

/** A title as the island's chat policy reads it, trimmed, at most CHAT_TITLE_MAX characters; null when refused. */
export const chatTitle = (value) => {
  const P = globalThis.BL.chatPolicy;
  if (P.error(value)) return null;
  const title = P.text(value);
  return title.length <= CHAT_TITLE_MAX ? title : null;
};

/** A new chat id: 16 characters of base64url, from 12 random bytes. */
export const newChatId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))).replaceAll("+", "-").replaceAll("/", "_");

export class ChatDirectory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.chats = new Map();
    this.starts = new Map();
    this.voices = new Map();
    ctx.blockConcurrencyWhile(async () => {
      this.chats = new Map((await ctx.storage.get("chats")) || []);
      this.starts = new Map((await ctx.storage.get("starts")) || []);
      this.voices = new Map((await ctx.storage.get("voices")) || []);
    });
  }

  async keep() {
    await this.ctx.storage.put({ chats: [...this.chats], starts: [...this.starts], voices: [...this.voices] });
  }

  /** Room for a new chat: `{ id, title, zone, host, hostInfo }`, already checked by `startChat`. */
  async start(entry, now = Date.now()) {
    if (!entry || !CHAT_ID.test(entry.id) || !isChatLand(entry.zone) || !ID.test(entry.host) || typeof entry.title !== "string") return refuse("malformed");
    const info = hostInfo(entry.hostInfo);
    if (!info) return refuse("malformed");
    for (const c of this.chats.values()) if (c.host === entry.host) return refuse("already_hosting");
    if (this.chats.size >= CHATS_MAX) return refuse("chats_full", { retryable: true });
    const last = this.starts.get(entry.host) || 0;
    if (now - last < START_GAP_MS) return refuse("rate_limited", { retryable: true, retryAfter: Math.ceil((last + START_GAP_MS - now) / 1000) });
    this.starts.set(entry.host, now);
    for (const [id, at] of this.starts) if (now - at >= START_GAP_MS || this.starts.size > STARTS_KEPT) this.starts.delete(id);
    this.chats.set(entry.id, { id: entry.id, title: entry.title, zone: entry.zone, host: entry.host, hostInfo: info, startedAt: now, speakers: 0, listeners: 0 });
    await this.keep();
    return { ok: true };
  }

  /** A chat's counts and its host now (the host may have changed); a chat not listed is not added back. */
  async update(id, entry) {
    const c = this.chats.get(id);
    if (!c || !entry) return { ok: false };
    c.speakers = count(entry.speakers);
    c.listeners = count(entry.listeners);
    const info = hostInfo(entry.host);
    if (info) c.hostInfo = info;
    if (typeof entry.hostId === "string" && ID.test(entry.hostId)) c.host = entry.hostId;
    c.open = entry.open === true;
    await this.keep();
    return { ok: true };
  }

  async end(id) {
    if (!this.chats.delete(id)) return { ok: true };
    for (const [who, chat] of this.voices) if (chat === id) this.voices.delete(who);
    await this.keep();
    return { ok: true };
  }

  has(id) { return typeof id === "string" && this.chats.has(id); }

  /** Every live chat, the busiest first, then the newest: what the Chats list shows. Never a host's account id. */
  list() {
    return [...this.chats.values()].sort((a, b) => b.speakers + b.listeners - a.speakers - a.listeners || b.startedAt - a.startedAt)
      .map(({ id, title, zone, hostInfo: host, startedAt, speakers, listeners, open }) => ({ id, title, zone, host, startedAt, speakers, listeners, open: open === true }));
  }

  /** An account takes the stage in `chat`: the chat it last spoke in, if another, to end its lease there. */
  async claim(who, chat) {
    if (!ID.test(who) || !this.chats.has(chat)) return null;
    const before = this.voices.get(who) || null;
    if (before === chat) return before;
    this.voices.set(who, chat);
    await this.keep();
    return before && this.chats.has(before) ? before : null;
  }

  async release(who, chat) {
    if (this.voices.get(who) !== chat) return;
    this.voices.delete(who);
    await this.keep();
  }

  /** Every live chat's id, for a principal's revocation to reach each one. */
  ids() { return [...this.chats.keys()]; }
}

/**
 * Start a chat for `host` (`{ id, login, display, character }`, an account the caller found eligible): the title and
 * zone checked, a place in the directory, then the chat's own object opened. `{ ok, chat }` or `{ ok: false, code }`.
 */
export const startChat = async (env, host, body) => {
  if (!env.CHATS || !env.AUDIENCE) return refuse("unavailable", { retryable: true });
  const title = body && chatTitle(body.title);
  if (!title) return refuse("bad_title");
  // `none`: a chat with no land, Ooga Chat voice alone.
  if (!body || !isChatLand(body.zone)) return refuse("zone_unavailable");
  const id = newChatId();
  const info = { login: host.login, display: host.display || host.login, character: host.character || null };
  const directory = env.CHATS.getByName(DIRECTORY_NAME);
  const placed = await directory.start({ id, title, zone: body.zone, host: host.id, hostInfo: info });
  if (!placed.ok) return placed;
  let opened;
  try { opened = await env.AUDIENCE.getByName(chatName(id)).open({ id, title, zone: body.zone, host: host.id, hostInfo: info }); } catch { opened = null; }
  if (!opened || !opened.ok) { await directory.end(id); return refuse("unavailable", { retryable: true }); }
  return { ok: true, chat: { id, title, zone: body.zone } };
};

/** A chat's preview (audience.js `preview`), only for a chat the directory lists, so no id makes an object. */
export const previewChat = async (env, id) => {
  if (!env.CHATS || !env.AUDIENCE || !CHAT_ID.test(id) || !(await env.CHATS.getByName(DIRECTORY_NAME).has(id))) return null;
  try { return await env.AUDIENCE.getByName(chatName(id)).preview(); } catch { return null; }
};

export { revokeChats } from "./chat-revoke.js";
