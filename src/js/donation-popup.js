// The kiosk's real invoice flow on the island, without moving the visitor to another scene.
(() => {
  "use strict";
  const BL = window.BL;
  const create = (game) => {
    const dialog = document.getElementById("donation-popup"), canvas = document.getElementById("donation-screen");
    const handle = document.getElementById("donation-handle"), message = document.getElementById("donation-message"), closeButton = document.getElementById("donation-close");
    const context = canvas.getContext("2d"), donations = BL.donations;
    const editor = document.getElementById("donation-details"), form = document.getElementById("donation-details-form");
    const editHandle = document.getElementById("donation-details-handle"), editMessage = document.getElementById("donation-details-message");
    const editClose = document.getElementById("donation-details-close");
    let flow = null, frame = 0, previous = 0, clock = 0, saveDetails = null;
    const cleanDetails = (handle, message) => ({
      handle: donations.sanitize(handle, donations.HANDLE_MAX).replace(/^@+/, "").trim() || "anon",
      message: donations.sanitize(message, donations.MESSAGE_MAX)
    });
    const defaults = () => cleanDetails(BL.net.state.me?.login || "anon", game.state.message);
    const details = () => cleanDetails(handle.value, message.value);
    const cancelDetails = () => {
      saveDetails = null;
      if (editor.open) editor.close();
    };
    const editDetails = (value, save) => {
      if (editor.open) return;
      editHandle.value = value.handle; editMessage.value = value.message;
      saveDetails = save;
      if (document.pointerLockElement) document.exitPointerLock();
      editor.showModal();
      editHandle.focus({ preventScroll: true });
    };
    const submitDetails = (event) => {
      event.preventDefault();
      const save = saveDetails, value = cleanDetails(editHandle.value, editMessage.value);
      cancelDetails();
      if (save) save(value);
    };
    const editorKey = (event) => event.stopPropagation();
    const editorCancel = (event) => { event.preventDefault(); cancelDetails(); };
    form.addEventListener("submit", submitDetails);
    editor.addEventListener("keydown", editorKey);
    editor.addEventListener("cancel", editorCancel);
    editClose.addEventListener("click", cancelDetails);
    const close = () => {
      cancelDetails();
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
      const locked = flow.state !== "amount" && flow.state !== "idle";
      if (message.disabled !== locked) handle.disabled = message.disabled = locked;
      flow.paint();
      context.drawImage(flow.canvas, 0, 0);
      flow.animate(context, clock);
      frame = requestAnimationFrame(draw);
    };
    const open = () => {
      if (dialog.open) return;
      const initial = defaults();
      handle.value = initial.handle; message.value = initial.message;
      handle.disabled = message.disabled = false;
      flow = BL.factoryKiosk.create({
        real: true, outerClose: true, link: () => location.origin + "/lightning",
        details,
        editDetails: (done) => editDetails(details(), (value) => {
          handle.value = value.handle; message.value = value.message;
          done();
        }),
        invoice: (sats) => donations.invoice({ sats, ...details() }),
        onchain: (request) => donations.onchain(request), waitFor: donations.waitFor,
        open: () => donations.state.open, testNetwork: () => donations.testNetwork,
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
      flow.tap((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
      canvas.focus({ preventScroll: true });
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
    const seen = (id, sats, due, left) => !!flow && flow.seen(id, sats, due, left);
    const dispose = () => {
      close();
      dialog.removeEventListener("keydown", key); dialog.removeEventListener("cancel", cancel);
      cancelDetails();
      form.removeEventListener("submit", submitDetails); editor.removeEventListener("keydown", editorKey);
      editor.removeEventListener("cancel", editorCancel); editClose.removeEventListener("click", cancelDetails);
      closeButton.removeEventListener("click", close); canvas.removeEventListener("click", tap);
    };
    return { open, close, receive, seen, dispose, defaults, editDetails, cancelDetails };
  };
  BL.donationPopup = { create };
})();
