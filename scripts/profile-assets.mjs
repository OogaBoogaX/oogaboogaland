// Profiling metadata for hosted and portable builds. No browser instrumentation.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
export const sha256 = data => createHash("sha256").update(data).digest("hex");
export function assetManifest(site) {
  const files = [];
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else { const bytes = readFileSync(path); files.push({ file: relative(site, path), bytes: bytes.length, sha256: sha256(bytes) }); }
    }
  };
  visit(site);
  return { sha256: sha256(JSON.stringify(files)), files };
}
export function sourceFrames(site, origin) {
  const sources = new Map();
  return frame => {
    let file = frame.url, line = frame.lineNumber + 1;
    if (file.startsWith(origin + "/")) {
      const path = new URL(file).pathname, name = path === "/" ? "index.html" : path.slice(1);
      let marks = sources.get(name);
      if (!marks) {
        marks = [];
        if (!name.split("/").includes("..")) {
          try {
            const lines = readFileSync(join(site, name), "utf8").split("\n");
            for (let i = 0; i < lines.length; i++) {
              const match = lines[i].match(/^\/\/ ---- (js\/[^ ]+) ----$/);
              if (match) marks.push({ line: i + 1, file: match[1] });
            }
          } catch { /* Builtin and removed source URLs remain identifiable. */ }
        }
        sources.set(name, marks);
      }
      let mark = null;
      for (const next of marks) { if (next.line > line) break; mark = next; }
      if (mark) { file = mark.file; line -= mark.line; }
      else file = name;
    }
    return { name: frame.functionName || "(anonymous)", file, line, column: frame.columnNumber + 1 };
  };
}
