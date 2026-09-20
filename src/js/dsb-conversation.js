// Small scene-owned conversation panel. Native text input, no model-generated markup.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const create = ({ agent, onChange, client = BL.dsbAgentRemote.create() }) => {
    const R = BL.dsbAgentRemote, el = id => document.getElementById("zuzu-" + id);
    const dialog = el("conversation"), form = el("form"), input = el("message"), sendButton = el("send"), closeButton = el("close"), log = el("history"), status = el("status"), mode = el("mode");
    const history = [], viewport = window.visualViewport;
    let opened = false, disposed = false, busy = false, composing = false, revision = 0, controller = null;
    input.maxLength = R.LIMITS.message;
    mode.textContent = client.mode === "mock" ? "Local mock · no AI connected" : "Protected conversation service";
    const fit = () => {
      if (!opened) return;
      const height = viewport ? viewport.height : window.innerHeight, offset = viewport ? viewport.offsetTop : 0;
      dialog.style.setProperty("--zuzu-keyboard", Math.max(0, window.innerHeight - height - offset) + "px");
      dialog.style.setProperty("--zuzu-viewport", height + "px");
    };
    const render = () => {
      log.replaceChildren();
      for (const row of history) {
        const item = document.createElement("li"), label = document.createElement("strong"), text = document.createElement("span");
        label.textContent = row.role === "player" ? "You" : "Zuzu" + (row.source === "mock" ? " · mock" : row.source === "fallback" ? " · local reply" : "");
        text.textContent = row.text; item.append(label, text); log.appendChild(item);
      }
      log.scrollTop = log.scrollHeight;
    };
    const append = (role, text, source) => { history.push({ role, text, source }); if (history.length > R.LIMITS.history) history.shift(); render(); };
    const setBusy = value => { busy = value; sendButton.disabled = value; form.setAttribute("aria-busy", String(value)); };
    const submit = async event => {
      event.preventDefault();
      if (disposed || !opened || busy || composing) return;
      let message;
      try { message = R.cleanText(input.value, R.LIMITS.message); }
      catch { status.textContent = "Write a message of 1–1,000 characters."; input.focus(); return; }
      const prior = history.slice(), context = agent.conversationContext(), turn = ++revision;
      controller = new AbortController(); const pending = controller;
      append("player", message, "player"); input.value = ""; setBusy(true);
      status.textContent = client.mode === "mock" ? "Preparing a local mock reply…" : "Waiting for Zuzu…";
      let text, source = client.mode === "mock" ? "mock" : "service";
      try { const response = await client.send(message, context, prior, pending.signal); text = response.text; }
      catch {
        if (disposed || !opened || turn !== revision || pending.signal.aborted) return;
        text = agent.fallbackReply(); source = "fallback";
      } finally {
        if (turn === revision && !disposed) { controller = null; setBusy(false); }
      }
      if (disposed || !opened || turn !== revision) return;
      append("zuzu", text, source); agent.sayConversation(text);
      status.textContent = source === "fallback" ? "Service unavailable or invalid reply. Zuzu is using her local replies." : source === "mock" ? "Mock reply · no message was sent to an AI service." : "Reply received.";
    };
    const finishClose = () => {
      if (!opened) return;
      opened = false; revision++; if (controller) controller.abort(); controller = null; setBusy(false); composing = false;
      input.blur(); document.body.classList.remove("dsb-talking"); agent.setConversation(false); onChange(false);
    };
    const nativeClose = () => { if (!dialog.open) finishClose(); };
    const close = () => { if (dialog.open) dialog.close(); finishClose(); };
    const keydown = event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      else if (event.target === input && event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !composing) { event.preventDefault(); form.requestSubmit(); }
    };
    const cancel = event => { event.preventDefault(); close(); };
    const compositionStart = () => { composing = true; }, compositionEnd = () => { composing = false; };
    const open = () => {
      if (disposed || opened) return;
      opened = true; agent.setConversation(true); document.body.classList.add("dsb-talking");
      dialog.showModal(); onChange(true); fit(); input.focus({ preventScroll: true });
      status.textContent = "Ask about anything. Enter sends; Shift+Enter adds a line.";
    };
    form.addEventListener("submit", submit); closeButton.addEventListener("click", close); dialog.addEventListener("cancel", cancel); dialog.addEventListener("close", nativeClose); dialog.addEventListener("keydown", keydown);
    input.addEventListener("compositionstart", compositionStart); input.addEventListener("compositionend", compositionEnd);
    window.addEventListener("resize", fit); if (viewport) { viewport.addEventListener("resize", fit); viewport.addEventListener("scroll", fit); }
    const dispose = () => {
      disposed = true; close(); history.length = 0; log.replaceChildren(); input.value = "";
      form.removeEventListener("submit", submit); closeButton.removeEventListener("click", close); dialog.removeEventListener("cancel", cancel); dialog.removeEventListener("close", nativeClose); dialog.removeEventListener("keydown", keydown);
      input.removeEventListener("compositionstart", compositionStart); input.removeEventListener("compositionend", compositionEnd);
      window.removeEventListener("resize", fit); if (viewport) { viewport.removeEventListener("resize", fit); viewport.removeEventListener("scroll", fit); }
    };
    return { open, close, dispose, get isOpen() { return opened; }, get busy() { return busy; }, get history() { return history.map(row => ({ ...row })); } };
  };
  BL.dsbConversation = { create };
})();
