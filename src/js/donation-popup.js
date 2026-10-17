// The real kiosk flow on the mainland, and inline details shared with the Factory's glass.
(() => {
  "use strict";
  const BL = window.BL;
  const create = (game) => {
    const dialog = document.getElementById("donation-popup"), canvas = document.getElementById("donation-screen");
    const fields = document.getElementById("donation-fields"), dock = document.getElementById("factory-donation-fields");
    const handle = document.getElementById("donation-handle"), message = document.getElementById("donation-message"), closeButton = document.getElementById("donation-close");
    const status = document.getElementById("donation-details-status");
    const context = canvas.getContext("2d"), donations = BL.donations;
    let flow = null, fieldFlow = null, frame = 0, previous = 0, clock = 0, saveTimer = 0;
    const cleanDetails = (handle, message) => ({
      handle: donations.sanitize(handle, donations.HANDLE_MAX).replace(/^@+/, "").trim() || "anon",
      message: donations.sanitize(message, donations.MESSAGE_MAX)
    });
    const defaults = () => cleanDetails(BL.net.state.me?.login || "anon", game.state.message);
    const details = () => cleanDetails(handle.value, message.value);
    const detailsState = (owner) => {
      if (fieldFlow !== owner) return;
      const paid = owner.state === "paid", hasInvoice = !!owner.invoice;
      handle.disabled = message.disabled = paid;
      if (paid) { clearTimeout(saveTimer); saveTimer = 0; }
      status.textContent = owner.detailsSaving ? "Saving changes…" : owner.detailsError
        || (owner.detailsDirty ? "Changes save automatically…" : hasInvoice ? "Details saved" : "");
    };
    const attachDetails = (owner, value, factory = false) => {
      fieldFlow = owner;
      handle.value = value.handle; message.value = value.message;
      if (factory) dock.append(fields);
      else dialog.insertBefore(fields, dialog.querySelector(".help"));
      dock.hidden = !factory;
      detailsState(owner);
    };
    const detachDetails = (owner) => {
      if (fieldFlow !== owner) return;
      if (saveTimer) save();
      fieldFlow = null;
      dock.hidden = true;
      dialog.insertBefore(fields, dialog.querySelector(".help"));
    };
    const focusDetails = () => {
      handle.focus({ preventScroll: true });
      handle.select();
      handle.scrollIntoView({ block: "nearest" });
    };
    const save = () => {
      clearTimeout(saveTimer); saveTimer = 0;
      return fieldFlow ? fieldFlow.saveDetails() : Promise.resolve({});
    };
    const changed = () => {
      if (!fieldFlow) return;
      fieldFlow.detailsChanged();
      clearTimeout(saveTimer); saveTimer = 0;
      if (fieldFlow.invoice && fieldFlow.state !== "paid") saveTimer = setTimeout(save, 350);
    };
    const fieldsKey = (event) => {
      event.stopPropagation();
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault(); save();
      }
    };
    fields.addEventListener("input", changed);
    fields.addEventListener("change", save);
    fields.addEventListener("keydown", fieldsKey);
    const close = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (flow) flow.stop();
      flow = null;
      if (dialog.open) dialog.close();
    };
    const draw = (now) => {
      frame = 0;
      if (!dialog.open || !flow) return;
      const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now; clock += dt;
      flow.update(dt);
      if (!flow || !dialog.open) return;
      flow.paint();
      context.drawImage(flow.canvas, 0, 0);
      flow.animate(context, clock);
      frame = requestAnimationFrame(draw);
    };
    const open = () => {
      if (dialog.open) return;
      flow = BL.factoryKiosk.create({
        real: true, outerClose: true, link: () => location.origin + "/lightning",
        startDetails: () => attachDetails(flow, defaults()), details, editDetails: focusDetails,
        closeDetails: () => detachDetails(flow), detailsState,
        invoice: (sats, value) => donations.invoice({ sats, ...value }),
        note: (request, value, changedHandle) => donations.note(request, value.message, changedHandle ? value.handle : undefined),
        onchain: (request) => donations.onchain(request), waitFor: donations.waitFor,
        open: () => donations.state.open, testNetwork: () => donations.testNetwork,
        limits: () => donations.state.limits,
        rate: () => BL.donationRate?.current || donations.state.tally?.rate,
        watchRate: () => BL.donationRate?.watch(),
        bananasFor: BL.game.bananasFor,
        copy: (text) => { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); },
        close, watch: close, release: close
      });
      flow.start();
      flow.key({ key: "Enter" });
      if (document.pointerLockElement) document.exitPointerLock();
      dialog.showModal();
      canvas.focus({ preventScroll: true });
      previous = performance.now(); clock = 0;
      frame = requestAnimationFrame(draw);
    };
    const key = (event) => {
      if (event.target === message || event.target === handle || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.key === "Tab") return;
      if (!flow || event.target === closeButton) return;
      if (event.key.length === 1 || ["Enter", "Escape", "Backspace", "Delete"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        flow.key(event);
      }
    };
    const tap = (event) => {
      if (!flow) return;
      const rect = canvas.getBoundingClientRect();
      canvas.focus({ preventScroll: true });
      flow.tap((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    };
    const cancel = (event) => { event.preventDefault(); close(); };
    dialog.addEventListener("keydown", key);
    dialog.addEventListener("cancel", cancel);
    closeButton.addEventListener("click", close);
    canvas.addEventListener("click", tap);
    const receive = (donation, bananas) => {
      if (!flow || !flow.receive(donation.id, bananas, donation.handle, donation.sats)) return false;
      // Show the delivery in the visitor's current scene as soon as the payment settles.
      close();
      return true;
    };
    const seen = (id, sats, due, left, pricing) => !!flow && flow.seen(id, sats, due, left, pricing);
    const dispose = () => {
      close();
      if (fieldFlow) detachDetails(fieldFlow);
      dialog.removeEventListener("keydown", key); dialog.removeEventListener("cancel", cancel);
      fields.removeEventListener("input", changed); fields.removeEventListener("change", save);
      fields.removeEventListener("keydown", fieldsKey);
      closeButton.removeEventListener("click", close); canvas.removeEventListener("click", tap);
    };
    return { open, close, receive, seen, dispose, defaults, details, focusDetails, attachDetails, detachDetails, detailsState };
  };
  BL.donationPopup = { create };
})();
