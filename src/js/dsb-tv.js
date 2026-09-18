// One bounded station snapshot and one replaceable screen mesh per DSB visit.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SITE = "https://noderunnersradio.com", JUKEBOX = SITE + "/?jukebox";
  const clean = (value) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160) : "";
  const track = (value) => ({ title: clean(value && value.title), artist: clean(value && value.artist) });
  const label = (item) => [item.artist, item.title].filter(Boolean).join(" - ") || "Untitled track";
  // Bitmap text uses the shared alphabet, but live strings never enter the mesh cache.
  const screenGeometry = (lines) => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false };
    const glyphs = BL.hubModels.SIGN_GLYPHS, cell = 0.057;
    for (let row = 0; row < lines.length; row++) {
      const value = lines[row].slice(0, 25), color = row === 0 ? [73, 221, 217] : row === 2 ? [255, 223, 56] : [193, 221, 211];
      for (let i = 0; i < value.length; i++) {
        if (value[i] === " ") continue;
        const glyph = glyphs[value[i]] || glyphs[value[i].toLowerCase()] || glyphs["0"];
        for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (glyph[y][x] === "1") {
          const a = -2.85 + (i * 4 + x) * cell, b = 1.36 - row * 0.4 - y * cell, n = geo.verts.length / 3;
          geo.verts.push(a, b, 0, a + cell * 0.85, b, 0, a + cell * 0.85, b + cell * 0.85, 0, a, b + cell * 0.85, 0);
          geo.faces.push({ i: [n, n + 1, n + 2, n + 3], color, emissive: 0.8 });
        }
      }
    }
    return geo;
  };
  const create = (screen, renderer) => {
    const dialog = document.getElementById("dsb-tv"), channel = document.getElementById("dsb-tv-channel"), closeButton = document.getElementById("dsb-tv-close");
    const el = (id) => document.getElementById("dsb-tv-" + id);
    let disposed = false, timer = 0, watchdog = 0, controller = null, key = "", lastGood = false;
    let song = { title: "Waiting for song info", artist: "" }, queue = [], history = [], note = "", status = "Connecting to the station";
    const list = (node, entries, empty) => {
      node.replaceChildren();
      for (const item of entries.length ? entries : [null]) { const li = document.createElement("li"); li.textContent = item ? label(item) : empty; node.appendChild(li); }
    };
    const render = () => {
      el("status").textContent = status; el("song").textContent = song.title || "Untitled track"; el("artist").textContent = song.artist; el("note").textContent = note;
      list(el("queue"), queue, "No listener requests queued"); list(el("history"), history, "No recent tracks available");
      const lines = ["Noderunners Radio", status.startsWith("Live") ? "Now playing" : lastGood ? "Offline - last song" : "Song info unavailable", song.title, song.artist, queue.length ? "Next " + label(queue[0]) : "Choose a song via DSB TV", "Walk closer to open TV", "Space or tap to tune in"], nextKey = lines.join("\n");
      if (key !== nextKey) { key = nextKey; const old = screen.geometry; screen.geometry = screenGeometry(lines); if (old) renderer.releaseGeometry(old); }
    };
    const poll = async () => {
      if (disposed || controller) return;
      if (document.hidden) { timer = setTimeout(poll, 15000); return; }
      controller = new AbortController(); const request = controller;
      watchdog = setTimeout(() => request.abort(), 10000);
      try {
        const read = async (path) => { const response = await fetch(SITE + path, { signal: request.signal, cache: "no-store", credentials: "omit" }); if (!response.ok) throw new Error("Station unavailable"); return response.json(); };
        const results = await Promise.allSettled([read("/api/nowplaying"), read("/api/history?n=6")]);
        if (disposed) return;
        const now = results[0];
        if (now.status !== "fulfilled" || !now.value || typeof now.value.now_playing !== "object" || !now.value.now_playing) throw new Error("No song information");
        song = track(now.value.now_playing); note = clean(now.value.now_playing.note);
        queue = Array.isArray(now.value.queue) ? now.value.queue.slice(0, 8).map(track) : [];
        const recent = results[1];
        if (recent.status === "fulfilled" && recent.value && Array.isArray(recent.value.history)) history = recent.value.history.slice(0, 6).map(track);
        lastGood = true; status = recent.status === "fulfilled" ? "Live station info - updates every 15 seconds" : "Live song info - history temporarily unavailable";
      } catch { if (!disposed) status = lastGood ? "Station info offline - showing last received tracks; retrying" : "Station info unavailable - retrying. The official jukebox is still available."; }
      finally { clearTimeout(watchdog); watchdog = 0; controller = null; if (!disposed) { render(); timer = setTimeout(poll, 15000); } }
    };
    const requests = new Set(); let searchBusy = false, paymentTimer = 0, paymentEpoch = 0, invoice = "", searchResults = [];
    const request = async (path, options = {}) => {
      const abort = new AbortController(); requests.add(abort); const timeout = setTimeout(() => abort.abort(), 10000);
      try { const r = await fetch(SITE + path, { ...options, signal: abort.signal, credentials: "omit", cache: "no-store" }); const value = await r.json(); if (!r.ok) throw new Error(clean(value.error) || "The station could not complete this request."); return value; }
      finally { clearTimeout(timeout); requests.delete(abort); }
    };
    const cancelInvoice = () => { paymentEpoch++; clearTimeout(paymentTimer); invoice = ""; el("invoice").hidden = true; el("invoice-text").value = ""; el("wallet").removeAttribute("href"); };
    const checkPayment = async (hash, epoch, until) => {
      if (disposed || epoch !== paymentEpoch) return;
      if (Date.now() >= until) { el("payment-status").textContent = "Invoice monitoring expired. Check your wallet or the official jukebox before requesting again."; return; }
      try {
        const result = await request("/api/play/status?payment_hash=" + encodeURIComponent(hash));
        if (disposed || epoch !== paymentEpoch) return;
        if (result.paid && result.queued) { el("payment-status").textContent = "Payment confirmed - your song is queued!"; return; }
        el("payment-status").textContent = result.paid ? "Payment received - waiting for the station to queue your song." : "Waiting for payment in your Lightning wallet.";
      } catch { if (!disposed && epoch === paymentEpoch) el("payment-status").textContent = "Payment status unavailable. Retrying; do not pay twice."; }
      if (!disposed && epoch === paymentEpoch) paymentTimer = setTimeout(() => checkPayment(hash, epoch, until), 5000);
    };
    const requestSong = async (item, button) => {
      if (searchBusy || invoice || disposed) return;
      searchBusy = true; button.disabled = true; el("request-status").textContent = "Asking Noderunners for a Lightning invoice...";
      const epoch = ++paymentEpoch;
      try {
        const body = new URLSearchParams({ artist: item.artist, title: item.title, source: item.source }); if (item.guid) body.set("guid", item.guid);
        const result = await request("/api/play", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
        if (disposed || epoch !== paymentEpoch) return;
        if (typeof result.bolt11 !== "string" || !/^lnbc[0-9a-z]+$/i.test(result.bolt11) || result.bolt11.length > 2331 || typeof result.payment_hash !== "string" || result.payment_hash.length > 160 || !Number.isFinite(result.sats) || result.sats <= 0) throw new Error("The station returned an invalid invoice. Use its official jukebox.");
        invoice = result.bolt11; BL.qr.drawTo(el("invoice-qr"), invoice);
        el("invoice-text").value = invoice; el("wallet").href = "lightning:" + invoice; el("price").textContent = result.sats + " sats - Noderunners Radio";
        el("selected").textContent = label(item); el("invoice").hidden = false; el("request-status").textContent = "Scan the invoice or open your wallet to pay. No payment is made automatically.";
        el("payment-status").textContent = "Waiting for payment in your Lightning wallet."; el("invoice").scrollIntoView({ block: "nearest" });
        paymentTimer = setTimeout(() => checkPayment(result.payment_hash, epoch, Date.now() + 15 * 60000), 5000);
      } catch (error) { if (!disposed) el("request-status").textContent = error.message || "Request unavailable. Try the official jukebox."; }
      finally { searchBusy = false; if (!disposed) button.disabled = false; }
    };
    const search = async () => {
      const query = el("query").value.trim(); if (!query || searchBusy || disposed) return;
      if (invoice) { el("request-status").textContent = "Close the current invoice before selecting another song."; return; }
      searchBusy = true; el("search").disabled = true; el("request-status").textContent = "Searching the station...";
      try {
        const result = await request("/api/search?q=" + encodeURIComponent(query) + "&src=all&limit=12&offset=0"); if (disposed) return;
        if (!Array.isArray(result.results)) throw new Error("The station returned no song list.");
        searchResults = result.results.slice(0, 12).map((item) => ({ ...track(item), source: item.source === "wavlake" ? "wavlake" : "library", guid: clean(item.guid), sats: Number.isFinite(item.sats) && item.sats > 0 ? item.sats : 0 }));
        el("results").replaceChildren();
        for (let i = 0; i < searchResults.length; i++) { const item = searchResults[i], row = document.createElement("div"), name = document.createElement("span"), button = document.createElement("button"); name.textContent = label(item); button.type = "button"; button.dataset.song = String(i); button.textContent = item.sats ? "Request - " + item.sats + " sats" : "Get invoice"; row.append(name, button); el("results").appendChild(row); }
        el("request-status").textContent = searchResults.length ? "Choose a song to generate its payment QR. Final price appears on the invoice." : "No songs found. Try another artist or title.";
      } catch (error) { if (!disposed) el("request-status").textContent = error.message || "Search unavailable. Try the official jukebox."; }
      finally { searchBusy = false; if (!disposed) el("search").disabled = false; }
    };
    const resultClick = (event) => { const button = event.target.closest("button[data-song]"); if (button && el("results").contains(button)) requestSong(searchResults[Number(button.dataset.song)], button); };
    const queryKey = (event) => { if (event.key === "Enter") { event.preventDefault(); search(); } };
    const copy = async () => { try { await navigator.clipboard.writeText(invoice); if (!disposed) el("payment-status").textContent = "Invoice copied. Pay it in your Lightning wallet."; } catch { if (!disposed) { el("invoice-text").focus(); el("invoice-text").select(); el("payment-status").textContent = "Invoice selected - copy it into your wallet."; } } };
    el("search").addEventListener("click", search); el("query").addEventListener("keydown", queryKey); el("results").addEventListener("click", resultClick); el("copy").addEventListener("click", copy); el("cancel-invoice").addEventListener("click", cancelInvoice);
    el("query").value = ""; el("request-status").textContent = "Search for a song to request it with sats."; el("search").disabled = false; cancelInvoice();
    const back = () => { channel.setAttribute("aria-expanded", "false"); el("radio").hidden = true; el("welcome").hidden = false; el("menu").hidden = false; channel.focus(); };
    const select = () => { el("menu").hidden = true; channel.setAttribute("aria-expanded", "true"); el("radio").hidden = false; el("welcome").hidden = true; el("back").focus(); };
    const close = () => { if (dialog.open) dialog.close(); if (document.activeElement && dialog.contains(document.activeElement)) document.activeElement.blur(); };
    const keydown = (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } };
    const cancel = (event) => { event.preventDefault(); close(); };
    el("back").addEventListener("click", back); channel.addEventListener("click", select); closeButton.addEventListener("click", close); dialog.addEventListener("cancel", cancel); dialog.addEventListener("keydown", keydown);
    BL.qr.drawTo(el("qr"), JUKEBOX);
    render(); poll();
    return {
      open: () => { if (disposed || dialog.open) return; channel.setAttribute("aria-expanded", "false"); el("radio").hidden = true; el("welcome").hidden = false; el("menu").hidden = false; dialog.showModal(); },
      get isOpen() { return dialog.open; },
      get status() { return status; },
      dispose: () => { disposed = true; close(); cancelInvoice(); for (const abort of requests) abort.abort(); el("search").removeEventListener("click", search); el("query").removeEventListener("keydown", queryKey); el("results").removeEventListener("click", resultClick); el("copy").removeEventListener("click", copy); el("cancel-invoice").removeEventListener("click", cancelInvoice); el("results").replaceChildren(); searchResults.length = 0; clearTimeout(timer); clearTimeout(watchdog); if (controller) controller.abort(); el("back").removeEventListener("click", back); channel.removeEventListener("click", select); closeButton.removeEventListener("click", close); dialog.removeEventListener("cancel", cancel); dialog.removeEventListener("keydown", keydown); if (screen.geometry) renderer.releaseGeometry(screen.geometry); screen.geometry = null; el("queue").replaceChildren(); el("history").replaceChildren(); }
    };
  };
  BL.dsbTv = { create };
})();
