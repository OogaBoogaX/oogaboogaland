// Who Feed the Oogas says a tip is from, in Ooga Chat (#656): the `game` the shared donation popup (donation-popup.js)
// reads and writes, kept as the island's game.js keeps it but in this app's own storage. `state` holds the name and
// message last given (`handle`, `message`) and the names this browser's own paid tips used (`recentHandles`, newest
// first, at most `RECENT`, never "anon"), which the popup offers as it is typed. `setIdentity` keeps a name and
// message; `rememberHandle` adds a name once a tip this page made is paid. Everything is checked on load and on the way
// in with donations.js's own rules; nothing here reaches the network or decides who is verified.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const RECENT = 12;
  // The island's demo count (game.js `bananasFor`, 400 sats a banana, one to twelve). It only fills the kiosk's quote
  // until the service prices the invoice; Ooga Chat never simulates a payment outside the fixture entry.
  const bananasFor = (sats) => Math.max(1, Math.min(12, Math.round(sats / 400)));
  const create = ({ storage = window.localStorage, key }) => {
    const { sanitize, HANDLE_MAX, MESSAGE_MAX } = BL.donations;
    const name = (raw) => sanitize(raw, HANDLE_MAX).replace(/^@+/, "").trim();
    const state = { handle: "", message: "", recentHandles: [] };
    const remember = (raw) => {
      const handle = name(raw);
      if (!handle || handle.toLowerCase() === "anon") return;
      const at = state.recentHandles.findIndex((entry) => entry.toLowerCase() === handle.toLowerCase());
      if (at >= 0) state.recentHandles.splice(at, 1);
      state.recentHandles.unshift(handle);
      if (state.recentHandles.length > RECENT) state.recentHandles.length = RECENT;
    };
    try {
      const saved = JSON.parse(storage.getItem(key) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.handle === "string") state.handle = name(saved.handle);
        if (typeof saved.message === "string") state.message = sanitize(saved.message, MESSAGE_MAX);
        if (Array.isArray(saved.recentHandles)) for (const handle of saved.recentHandles.slice(0, RECENT).reverse()) if (typeof handle === "string") remember(handle);
      }
    } catch { /* Storage may be unavailable or hold something else: start empty. */ }
    const save = () => {
      try { storage.setItem(key, JSON.stringify(state)); } catch { /* Kept for this visit alone. */ }
    };
    const setIdentity = ({ handle, message }) => {
      state.handle = name(handle);
      state.message = sanitize(message, MESSAGE_MAX);
      save();
    };
    const rememberHandle = (handle) => {
      remember(handle);
      save();
    };
    return { state, setIdentity, rememberHandle };
  };
  BL.oogaChatDonor = { create, bananasFor, RECENT };
})();
