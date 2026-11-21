// The deployed page records the cast it actually contains. Only the caller supplies its approved release identity;
// neither this build nor a browser infers that identity from the current Git branch.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { declaredIdentity } from "./character-identity.mjs";
import { CharacterRejection, parseSafeCharacter } from "./character-safety.mjs";

const hash = (source) => createHash("sha256").update(source).digest("hex");
export const catalogBaseline = (root) => readdirSync(join(root, "src/characters")).filter((name) => name.endsWith(".js")).sort().map((name) => {
  const source = readFileSync(join(root, "src/characters", name), "utf8");
  let row, kind = "data";
  try { row = parseSafeCharacter(source); }
  catch (error) { if (!(error instanceof CharacterRejection)) throw error; row = declaredIdentity(source); kind = "custom"; }
  return { path: `src/characters/${name}`, kind, hash: hash(source),
    blob: createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest("hex"),
    identity: { handle: row.handle, github: row.github || row.handle } };
});

export const catalogContinuation = (sources, block, baseline) => {
  const boundary = sources.indexOf("js/character-catalog.js");
  if (boundary < 1 || sources[boundary - 1] !== "js/characters.gen.js" || sources.indexOf("js/contributors.js") <= boundary)
    throw new Error("Character catalog must load after the embedded cast and before contributors");
  // The continuation runs after currentScript is cleared. Retain only the public build hash, never its URL.
  const build = String.raw`window.BL.clientBuild = document.currentScript?.src.match(/\/main-([a-f0-9]{8,64})\.js(?:\?|$)/)?.[1] || "";`;
  return `${sources.slice(0, boundary + 1).map(block).join("\n\n")}\n\n${build}\nwindow.BL.characterCatalog.configure(${JSON.stringify(baseline)});\nwindow.BL.characterCatalog.start(() => {\n${sources.slice(boundary + 1).map(block).join("\n\n")}\n});`;
};

export const catalogPageAttributes = (env) => {
  const baseline = env.CHARACTER_CATALOG_BASELINE, engine = env.CHARACTER_CATALOG_ENGINE, environment = env.CHARACTER_CATALOG_ENVIRONMENT;
  if (!baseline && !engine && !environment) return "";
  if (!/^[a-f0-9]{40}$/.test(baseline || "") || engine !== "island-character-data-v1" || !["staging", "production"].includes(environment))
    throw new Error("Character catalog page requires an approved baseline, environment and supported engine together");
  return ` data-character-catalog-baseline="${baseline}" data-character-catalog-engine="${engine}" data-character-catalog-environment="${environment}"`;
};
