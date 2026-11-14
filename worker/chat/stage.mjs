// Stages the app the edge serves (wrangler.ooga-chat.<env>.jsonc `assets.directory`, untracked/ooga-chat): the real
// build when this checkout has it (`npm run build:ooga-chat`, #651), otherwise a one-page placeholder, so the edge can be
// deployed and answer its API before the app lands. With the placeholder there is no build.json, so health reads the
// app as missing (`down`) rather than pretending it is there. `node worker/chat/stage.mjs` from anywhere in the checkout.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "untracked", "ooga-chat");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts || {};

if (scripts["build:ooga-chat"]) {
  execFileSync("npm", ["run", "build:ooga-chat"], { cwd: root, stdio: "inherit" });
} else if (existsSync(join(out, "index.html"))) {
  console.log(`untracked/ooga-chat already staged; no app build on this branch yet (#651)`);
} else {
  mkdirSync(out, { recursive: true });
  const page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + "<title>Ooga Chat</title><p>Ooga Chat is on its way.</p></html>\n";
  writeFileSync(join(out, "index.html"), page);
  writeFileSync(join(out, "404.html"), page);
  console.log("staged a placeholder in untracked/ooga-chat: the app's build arrives with #651");
}
