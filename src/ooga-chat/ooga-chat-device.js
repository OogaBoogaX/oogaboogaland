// Ooga Chat on its device (#657, docs/ooga-chat-app.md): whether the network is there, whether and how the browser
// offers to install the app, whether a newer version is waiting, and the M key. `create` reports `{ online, install,
// update }`: `install` is "prompt" where the browser lets the page offer it (`beforeinstallprompt`), "ios" on Safari
// for iOS, which installs only from its Share menu, and null otherwise or once installed; `update` is true while a
// newer service worker waits. Nothing is promised that the browser does not offer, and installing never gates
// listening. The worker is registered only for the production entry of a staged build on a secure origin.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // M mutes or unmutes only a plain press: not while typing in a field or composing with an IME, not with a modifier
  // held, and not on key repeat.
  const isMuteKey = (event) => {
    if (event.key !== "m" && event.key !== "M") return false;
    if (event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    const target = event.target;
    if (!target) return true;
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || "")) return false;
    return !target.closest?.("[contenteditable]:not([contenteditable='false'])");
  };
  const create = ({ win = window, register = false, onChange = () => {} }) => {
    const nav = win.navigator, listeners = new AbortController(), { signal } = listeners;
    const standalone = () => win.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
    // Safari on an iPhone or iPad (iPadOS reports a Mac with touch) that is not already the installed app.
    const ios = () => !standalone() && typeof nav.standalone === "boolean" && /iP(hone|ad|od)|Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
    let state = { online: nav.onLine !== false, install: ios() ? "ios" : null, update: false }, offer = null, registration = null, disposed = false;
    const set = (patch) => {
      if (disposed) return;
      state = { ...state, ...patch };
      onChange(state);
    };
    win.addEventListener("online", () => set({ online: true }), { signal });
    win.addEventListener("offline", () => set({ online: false }), { signal });
    win.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      offer = event;
      set({ install: "prompt" });
    }, { signal });
    win.addEventListener("appinstalled", () => {
      offer = null;
      set({ install: null });
    }, { signal });
    const watch = (worker) => worker?.addEventListener("statechange", () => worker.state === "installed" && nav.serviceWorker.controller && set({ update: true }), { signal });
    if (register && nav.serviceWorker && win.isSecureContext) {
      nav.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
        registration = reg;
        if (reg.waiting && nav.serviceWorker.controller) set({ update: true });
        watch(reg.installing);
        reg.addEventListener("updatefound", () => watch(reg.installing), { signal });
      }).catch(() => { /* No worker: the app runs as a plain page. */ });
    }
    // The browser's own install prompt, once; it decides whether to show it.
    const install = async () => {
      if (!offer) return;
      const shown = offer;
      offer = null;
      set({ install: null });
      await shown.prompt();
    };
    // Takes the waiting version: the new worker takes over, then the page reloads onto it, once.
    const reload = () => {
      const waiting = registration?.waiting;
      if (!waiting) return win.location.reload();
      nav.serviceWorker.addEventListener("controllerchange", () => win.location.reload(), { once: true, signal });
      waiting.postMessage({ type: "skip-waiting" });
    };
    const dispose = () => {
      disposed = true;
      listeners.abort();
    };
    return { install, reload, dispose, get state() { return state; } };
  };
  BL.oogaChatDevice = { create, isMuteKey };
})();
