// One device picker for the island and Ooga Chat. The controller owns capture and switching; opening this dialog
// only enumerates devices already permitted by Join voice. Nothing is saved or sent to the server.
(() => {
  "use strict";
  const BL = window.BL;
  let current = null;
  const create = () => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "foot-button microphone-picker";
    button.textContent = "Mic ▾"; button.hidden = true;
    button.setAttribute("aria-haspopup", "dialog");
    let controller = null, dialog = null, select = null, status = null, active = null, session = 0, enumeration = 0;
    const close = () => { if (dialog?.open) dialog.close(); };
    const paint = () => {
      const m = controller?.microphone?.();
      button.hidden = !m?.active;
      button.disabled = !m?.available;
      button.title = m?.active ? `Microphone: ${m.label}` : "";
      button.setAttribute("aria-label", m?.active ? `Choose microphone. Current: ${m.label}` : "Choose microphone");
      if (!dialog) return;
      if (!m?.active || !m.available && !m.switching) { close(); return; }
      active.textContent = `Current: ${m.label}`;
      select.disabled = m.switching || !select.options.length;
      dialog.setAttribute("aria-busy", String(m.switching));
      if (m.switching) status.textContent = "Switching microphone…";
    };
    const refresh = async () => {
      const c = controller, opening = session, ticket = ++enumeration;
      if (!dialog) return;
      try {
        const list = await c.devices();
        if (!dialog || opening !== session || ticket !== enumeration || c !== controller) return;
        const m = c.microphone();
        const options = [];
        for (const d of list) {
          if (!d.deviceId) continue;
          const option = document.createElement("option");
          option.value = d.deviceId; option.textContent = d.label || `Microphone ${options.length + 1}`;
          options.push(option);
        }
        // The active capture can outlive its device-list entry (or be omitted by the browser).
        if (!options.some((o) => o.value === m.id)) {
          const option = document.createElement("option");
          option.value = m.id; option.textContent = m.label; option.disabled = true; options.unshift(option);
        }
        select.replaceChildren(...options); select.value = m.id;
        status.textContent = options.filter((o) => !o.disabled).length < 2
          ? "Only the microphones made available by your browser are listed." : "Choose a microphone. Your mute setting stays the same.";
        paint();
      } catch {
        if (dialog && opening === session && ticket === enumeration) {
          status.textContent = "Could not list microphones. Close this window and try again.";
          select.disabled = true;
        }
      }
    };
    const open = () => {
      if (dialog || !controller?.microphone?.().available) return;
      if (current) current();
      current = close; session++;
      dialog = document.createElement("dialog"); dialog.className = "microphone-dialog";
      dialog.setAttribute("aria-label", "Choose microphone");
      const heading = document.createElement("h2"), label = document.createElement("label"), done = document.createElement("button");
      heading.className = "voice-handoff-title";
      BL.signGlyphs.letter(heading, "Microphone");
      const body = document.createElement("div"), actions = document.createElement("div");
      body.className = "voice-handoff-body"; actions.className = "voice-handoff-actions";
      active = document.createElement("p");
      select = document.createElement("select"); select.disabled = true;
      label.textContent = "Input device"; label.append(select);
      status = document.createElement("p"); status.setAttribute("role", "status"); status.textContent = "Loading microphones…";
      done.type = "button"; done.className = "foot-button foot-primary"; done.textContent = "Done";
      done.addEventListener("click", close);
      select.addEventListener("change", async () => {
        const c = controller, opening = session, id = select.value;
        const pending = c.selectDevice(id).catch(() => false);
        paint();
        const ok = await pending;
        if (!dialog || opening !== session || c !== controller) return;
        await refresh();
        if (!dialog || opening !== session || c !== controller) return;
        status.textContent = ok ? `Using ${c.microphone().label}.` : c.microphone().error || "Microphone unchanged. Try again when voice is connected.";
      });
      dialog.addEventListener("close", () => {
        navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
        dialog.remove(); dialog = select = status = active = null; session++;
        if (current === close) current = null;
      }, { once: true });
      body.append(active, label, status); actions.append(done);
      dialog.append(heading, body, actions); document.body.append(dialog);
      navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
      dialog.showModal(); paint(); refresh();
    };
    button.addEventListener("click", open);
    const update = (next, enabled = true) => {
      const c = enabled ? next : null;
      if (controller !== c) close();
      controller = c; paint();
    };
    const dispose = () => { close(); button.removeEventListener("click", open); button.remove(); };
    return { button, update, dispose };
  };
  BL.microphonePicker = { create };
})();
