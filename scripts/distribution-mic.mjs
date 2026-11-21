// The keyboard noise filter's AudioWorklet module (src/js/mic-filter-worklet.js, voice.js `setKeyFilter`) as a
// same-origin file named by its content, the only way the content policy lets a worklet load. The portable page and
// the source tree get no descriptor, and voice.js then offers no filter.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const writeMicFilter = (root, out) => {
  const source = readFileSync(join(root, "src/js/mic-filter-worklet.js"), "utf8");
  const name = `mic-filter-${createHash("sha256").update(source).digest("hex").slice(0, 16)}.js`;
  mkdirSync(join(out, "js"), { recursive: true }); writeFileSync(join(out, "js", name), source);
  return { url: `/js/${name}` };
};
