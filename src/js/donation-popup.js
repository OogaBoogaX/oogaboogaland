// The kiosk flow on the mainland, real or simulated, and the name and message fields shared with the Factory's glass. The fields are
// hidden: they only take the typing (and a phone's keyboard), which both kiosks draw on their own screens.
(() => {
  "use strict";
  const BL = window.BL;
  const create = (game, onDemoPayment) => {
    const dialog = document.getElementById("donation-popup"), canvas = document.getElementById("donation-screen");
    const fields = document.getElementById("donation-fields"), dock = document.getElementById("factory-donation-fields");
    const handle = document.getElementById("donation-handle"), message = document.getElementById("donation-message"), closeButton = document.getElementById("donation-close");
    const status = document.getElementById("donation-details-status");
    const context = canvas.getContext("2d"), donations = BL.donations, help = dialog.querySelector(".help");
    let flow = null, fieldFlow = null, frame = 0, previous = 0, clock = 0, saveTimer = 0, simulated = false, onClose = null;
    let historyOpen = false, historyAll = false, historyIndex = -1, historyPrefix = "";
    const historyMatches = [];
    // What is typed, for the kiosk to draw: both fields' text, which has the focus, its selection and the message's
    // longest. Updated on the fields' events, never polled.
    const typed = { handle: "", message: "", field: null, start: 0, end: 0, max: message.maxLength };
    // The characters a donation carries (donations.sanitize's), kept as they are typed so the screen shows what is
    // sent, the caret kept where it was; the name also loses a leading @, which the screen draws itself.
    const NOT_CARRIED = /[^\w .,!?'@#:-]/g;
    const carried = (input, text) => {
      const kept = text.replace(NOT_CARRIED, "");
      return input === handle ? kept.replace(/^@+/, "") : kept;
    };
    const keepCarried = (input) => {
      const value = input.value, next = carried(input, value);
      if (next === value) return;
      const at = carried(input, value.slice(0, Number.isInteger(input.selectionStart) ? input.selectionStart : value.length)).length;
      input.value = next;
      input.setSelectionRange(at, at);
    };
    const track = () => {
      const active = document.activeElement, field = active === handle ? handle : active === message ? message : null;
      typed.handle = handle.value; typed.message = message.value;
      typed.field = field === handle ? "handle" : field === message ? "message" : null;
      typed.start = field ? field.selectionStart : 0; typed.end = field ? field.selectionEnd : 0;
      if (fieldFlow) fieldFlow.typed();
    };
    const cleanDetails = (handle, message) => ({
      handle: donations.sanitize(handle, donations.HANDLE_MAX).replace(/^@+/, "").trim(),
      message: donations.sanitize(message, donations.MESSAGE_MAX)
    });
    const defaults = () => cleanDetails(donations.real ? BL.net.state.me?.login || "anon" : game.state.handle, game.state.message);
    const details = () => {
      const value = cleanDetails(handle.value, message.value);
      if (!simulated && donations.real && !value.handle) value.handle = "anon";
      return value;
    };
    const rememberMessage = (value) => {
      // Factory fields can outlive a simulated mainland popup, so use the field's owner to decide its mode.
      if (donations.real && (fieldFlow !== flow || !simulated) && game.state.message !== value)
        game.setIdentity({ handle: game.state.handle, message: value });
    };
    const rememberFinishedMessage = (owner) => {
      if (!owner || !owner.messageOk()) return;
      if (owner.invoice) {
        if (owner.savedDetails) rememberMessage(owner.savedDetails.message);
      } else rememberMessage(message.value);
    };
    const refreshHistory = () => {
      historyMatches.length = 0;
      if (historyOpen) {
        const prefix = handle.value.trim().toLowerCase();
        for (const name of game.state.recentHandles || []) {
          if (historyAll || name.toLowerCase().startsWith(prefix) && name !== handle.value) historyMatches.push(name);
        }
      }
      if (fieldFlow) fieldFlow.typed();
    };
    const hideHistory = (undo = false) => {
      if (!historyOpen) return;
      const previewed = historyIndex >= 0;
      if (previewed && undo) {
        handle.value = historyPrefix;
        handle.setSelectionRange(handle.value.length, handle.value.length);
        track();
      }
      historyIndex = -1; historyPrefix = "";
      historyOpen = historyAll = false;
      refreshHistory();
      if (previewed && fieldFlow && fieldFlow.state === "details") {
        fieldFlow.detailsChanged();
        clearTimeout(saveTimer); saveTimer = 0;
        if (fieldFlow.invoice) saveTimer = setTimeout(save, 350);
      }
    };
    const detailsState = (owner) => {
      if (fieldFlow !== owner) return;
      const paid = owner.state === "paid", hasInvoice = !!owner.invoice;
      handle.disabled = message.disabled = paid;
      if (paid) { clearTimeout(saveTimer); saveTimer = 0; }
      status.textContent = owner.detailsSaving ? "Saving changes…" : owner.detailsError
        || (owner.detailsDirty ? "Changes save automatically…" : hasInvoice ? "Details saved" : "");
      if (hasInvoice && owner.savedDetails && !owner.detailsSaving && !owner.detailsError && owner.messageOk())
        rememberMessage(owner.savedDetails.message);
    };
    const attachDetails = (owner, value, factory = false) => {
      fieldFlow = owner;
      hideHistory();
      handle.value = value.handle; message.value = value.message;
      if (factory) dock.append(fields);
      else dialog.insertBefore(fields, dialog.querySelector(".help"));
      dock.hidden = !factory;
      track();
      detailsState(owner);
    };
    const detachDetails = (owner) => {
      if (fieldFlow !== owner) return;
      hideHistory();
      rememberFinishedMessage(owner);
      if (saveTimer) save();
      fieldFlow = null;
      dock.hidden = true;
      dialog.insertBefore(fields, dialog.querySelector(".help"));
    };
    // Puts the typing in the name, all of it selected to type over, or the message, the caret at its end; with null,
    // takes it out of both.
    const focusDetails = (field = "handle") => {
      if (!field) {
        hideHistory();
        rememberFinishedMessage(fieldFlow);
        const active = document.activeElement;
        if (active === handle || active === message) active.blur();
        // The mainland popup keeps the keys: its canvas takes the focus back, as a click on it would.
        if (flow && fieldFlow === flow && dialog.open) canvas.focus({ preventScroll: true });
        return;
      }
      // Below the message bar the details screen offers the name alone.
      if (field === "message" && fieldFlow && !fieldFlow.messageOk()) return;
      const input = field === "message" ? message : handle;
      if (input === message) hideHistory();
      input.focus({ preventScroll: true });
      if (input === handle) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      track();
    };
    // The details the invoice holds back in the fields, after a save the visitor gave up on.
    const restoreDetails = (value) => {
      clearTimeout(saveTimer); saveTimer = 0;
      handle.value = value.handle; message.value = value.message;
      if (fieldFlow?.messageOk()) rememberMessage(value.message);
      track();
      if (fieldFlow) fieldFlow.detailsChanged();
    };
    const save = () => {
      clearTimeout(saveTimer); saveTimer = 0;
      // A blur on the way to KEEP SAVED must not retry first. Only a new edit or an explicit retry clears an error.
      return fieldFlow && !fieldFlow.detailsError ? fieldFlow.saveDetails() : Promise.resolve({});
    };
    const changed = () => {
      if (!fieldFlow) return;
      historyIndex = -1; historyPrefix = "";
      keepCarried(handle);
      keepCarried(message);
      track();
      if (document.activeElement === handle && fieldFlow.state === "details") {
        historyOpen = true; historyAll = false; refreshHistory();
        if (!historyMatches.length) hideHistory();
      } else hideHistory();
      fieldFlow.detailsChanged();
      clearTimeout(saveTimer); saveTimer = 0;
      if (fieldFlow.invoice && fieldFlow.state !== "paid") saveTimer = setTimeout(save, 350);
    };
    const toggleHistory = () => {
      if (!fieldFlow || fieldFlow.state !== "details") return;
      const opening = !historyOpen || !historyAll;
      hideHistory();
      historyOpen = historyAll = opening;
      refreshHistory();
      if (historyOpen) {
        handle.focus({ preventScroll: true });
        handle.setSelectionRange(handle.value.length, handle.value.length);
        track();
      }
    };
    const chooseHistory = (index, next = false) => {
      if (!fieldFlow || fieldFlow.state !== "details" || !historyMatches[index]) return;
      handle.value = historyMatches[index];
      handle.focus({ preventScroll: true });
      handle.setSelectionRange(handle.value.length, handle.value.length);
      changed();
      hideHistory();
      if (next) focusDetails("message");
      return true;
    };
    const previewHistory = (direction) => {
      if (!historyOpen || !historyMatches.length) return;
      // A preview is not an edit until it is accepted; the typed prefix must not be saved as the previewed name.
      clearTimeout(saveTimer); saveTimer = 0;
      if (historyIndex < 0) historyPrefix = handle.value;
      historyIndex = historyIndex < 0 ? direction > 0 ? 0 : historyMatches.length - 1
        : (historyIndex + direction + historyMatches.length) % historyMatches.length;
      handle.value = historyMatches[historyIndex];
      handle.setSelectionRange(historyAll ? 0 : Math.min(historyPrefix.length, handle.value.length), handle.value.length);
      track();
    };
    // In the fields, Enter goes from the name to the message and, from the message, finishes like the screen's DONE;
    // Escape finishes too, and Tab or Shift+Tab goes between the two. They are out of the page's tab order
    // (tabindex -1), so the typing reaches them only with the details screen up. Their keys never reach the page behind.
    const fieldsKey = (event) => {
      event.stopPropagation();
      if (event.isComposing) return;
      const editing = !!fieldFlow && fieldFlow.state === "details";
      if (event.target === handle && editing && historyOpen && historyMatches.length
        && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        return previewHistory(event.key === "ArrowDown" ? 1 : -1);
      }
      if (event.key === "Tab" && editing) {
        event.preventDefault();
        if (event.target === handle && !event.shiftKey && historyIndex >= 0) return chooseHistory(historyIndex, true);
        return focusDetails(event.target === handle ? "message" : "handle");
      }
      if (event.key === "Escape" && historyOpen && historyMatches.length) {
        event.preventDefault();
        return hideHistory(true);
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (!editing) save();
      else if (event.key === "Enter" && event.target === handle && fieldFlow.messageOk()) focusDetails("message");
      else fieldFlow.key({ key: event.key });
    };
    fields.addEventListener("input", changed);
    const finishEdit = () => { if (fieldFlow && !fieldFlow.invoice) rememberFinishedMessage(fieldFlow); return save(); };
    fields.addEventListener("change", finishEdit);
    fields.addEventListener("keydown", fieldsKey);
    // The caret and the focus move without input: the screen follows them.
    for (const type of ["keyup", "select", "focusin", "focusout"]) fields.addEventListener(type, track);
    const close = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (flow) flow.stop();
      flow = null;
      if (dialog.open) { dialog.close(); if (onClose) onClose(); }
    };
    const closeOutside = () => { if (simulated && dialog.open) close(); };
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
    const open = (demo = false) => {
      if (dialog.open) return;
      simulated = demo;
      // The page's own /donate address: a path where the router serves paths, a hash from disk or a named file.
      const link = BL.router && !BL.router.served ? `${location.href.split("#")[0]}#/donate` : `${location.origin}/donate`;
      help.textContent = simulated ? "This is a local simulation. No Bitcoin is sent." : "Pay with Lightning or on-chain. Your bananas arrive from the Factory when the payment confirms.";
      flow = BL.factoryKiosk.create({
        real: !simulated, demo: simulated, outerClose: true, link: () => link,
        startDetails: () => attachDetails(flow, defaults()), details, editDetails: focusDetails, typing: () => typed, restoreDetails, onState: () => hideHistory(),
        history: () => historyOpen ? historyMatches : null, historyCount: () => game.state.recentHandles.length, toggleHistory, chooseHistory,
        closeDetails: () => detachDetails(flow), detailsState,
        invoice: (sats, value) => donations.invoice({ sats, ...value }),
        note: (request, value, changedHandle) => donations.note(request, value.message, changedHandle ? value.handle : undefined),
        onchain: (request) => donations.onchain(request), waitFor: donations.waitFor,
        open: () => donations.state.open, testNetwork: () => donations.testNetwork,
        limits: () => donations.state.limits,
        messageMinSats: () => donations.messageMinSats,
        rate: () => BL.donationRate?.current || donations.state.tally?.rate,
        watchRate: () => BL.donationRate?.watch(),
        request: value => ({ id: donations.createRequest(value).id, url: link }),
        bananasFor: BL.game.bananasFor,
        price: () => BL.chain.snapshot.priceUsd,
        copy: (text) => { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); },
        pay: (id, sats) => {
          if (donations.real) return close();
          const value = details(), donation = { id, sats, ...value, message: donations.carried(sats, value.message), at: Date.now() };
          if (!flow.receive(id, null, value.handle, sats)) return;
          game.setIdentity(value);
          if (onDemoPayment) onDemoPayment(donation);
        },
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
      onClose = null;
      close();
      if (fieldFlow) detachDetails(fieldFlow);
      dialog.removeEventListener("keydown", key); dialog.removeEventListener("cancel", cancel);
      fields.removeEventListener("input", changed); fields.removeEventListener("change", finishEdit);
      fields.removeEventListener("keydown", fieldsKey);
      for (const type of ["keyup", "select", "focusin", "focusout"]) fields.removeEventListener(type, track);
      closeButton.removeEventListener("click", close); canvas.removeEventListener("click", tap);
    };
    return { open, close, closeOutside, onClose: callback => { onClose = callback; }, receive, seen, dispose, defaults, details, typing: () => typed, restoreDetails, focusDetails, attachDetails, detachDetails, detailsState,
      history: () => historyOpen ? historyMatches : null, historyCount: () => game.state.recentHandles.length, toggleHistory, chooseHistory, closeHistory: hideHistory };
  };
  BL.donationPopup = { create };
})();
