// An optional offline distribution. Keep the exterior mural in the core. The pack is only image bytes,
// in source order. Its digest and offsets are pinned inside the core page's CSP-hashed script.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Embedded in the offline core only. FileReader data URLs also work on file:// under the normal image policy.
function offerLoungePack(entries, size, digest) {
  const BL = window.BL;
  let pending;
  async function install(file) {
    if (file.size !== size) throw new Error();
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    if (Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("") !== digest) throw new Error();
    const urls = await Promise.all(entries.map(([, start, end]) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file.slice(start, end, "image/webp"));
    })));
    entries.forEach(([key], i) => {
      BL[key] = urls[i];
    });
    delete BL.offlineLoungePack;
  }
  BL.offlineLoungePack = { get choosing() { return !!pending; }, choose() {
    if (pending) return pending;
    pending = new Promise(resolve => {
      const dialog = document.createElement("dialog");
      dialog.className = "modal lounge-heirloom";
      dialog.setAttribute("aria-label", "Offline lounge artwork");
      const label = document.createElement("label"), input = document.createElement("input");
      label.textContent = "Choose lounge.roompack to open the lounge for this session.";
      input.type = "file";
      input.accept = ".roompack";
      label.append(input);
      const status = document.createElement("p"), close = document.createElement("button");
      status.setAttribute("role", "status");
      close.textContent = "Back";
      close.onclick = () => dialog.close();
      input.onchange = async () => {
        if (!input.files.length) return;
        input.disabled = true;
        try {
          await install(input.files[0]);
          if (dialog.open) dialog.close("loaded");
        } catch {
          input.value = "";input.disabled = false;
          status.textContent = "Choose the lounge.roompack that came with this edition.";
        }
      };
      dialog.onclose = () => { dialog.remove();resolve(dialog.returnValue === "loaded"); };
      dialog.onkeydown = e => e.stopPropagation();
      if (document.pointerLockElement) document.exitPointerLock();
      dialog.append(label, status, close);document.body.append(dialog);dialog.showModal();
    }).finally(() => { pending = null; });
    return pending;
  }};
}

export function writeOfflineCore(root, html, js, block) {
  const parts = [], entries = [];
  let core = js, size = 0;
  for (const module of ["timeline", "family-glass", "desert-throw", "minneapolis"]) {
    const source = block(`js/poker-${module}-art.js`);
    const before = entries.length;
    const stripped = source.replace(/(window\.BL\.(\w+)\s*=\s*)"data:image\/webp;base64,([^"]+)"/g,
      (match, prefix, globalKey, encoded) => {
        if (globalKey === "satoshiGlassArt") return match;
        const image = Buffer.from(encoded, "base64");
        entries.push([globalKey, size, size + image.length]);
        size += image.length;parts.push(image);
        return prefix + '""';
      });
    if (entries.length === before || !core.includes(source)) throw new Error("Missing offline art in " + module);
    core = core.replace(source, () => stripped);
  }
  const pack = Buffer.concat(parts);
  const digest = createHash("sha256").update(pack).digest("hex");
  // Install before the director can enter a scene, including when starting directly in the lounge.
  const marker = "// ---- js/director.js ----";
  if (!core.includes(marker)) throw new Error("Missing offline entry point");
  core = core.replace(marker, () => `(${offerLoungePack.toString()})(${JSON.stringify(entries)}, ${size}, "${digest}");\n${marker}`);
  const hash = code => createHash("sha256").update("\n" + code + "\n").digest("base64");
  const page = html.replace(js, () => core).replace("'sha256-" + hash(js) + "'", "'sha256-" + hash(core) + "'");
  const dir = join(root, "untracked", "offline");
  mkdirSync(dir, {recursive:true});
  writeFileSync(join(dir, "lounge.roompack"), pack);
  writeFileSync(join(dir, "oogaboogaland-core.html"), page);
  console.log(`Offline core ${Buffer.byteLength(page)} bytes, optional lounge artwork ${size} bytes`);
}
