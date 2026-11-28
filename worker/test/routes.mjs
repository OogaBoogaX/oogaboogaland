// Exercise the actual route modules with a fixture cast, without generating build
// artifacts or importing the Cloudflare host. Only their module boundaries are replaced.
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import * as cookies from "../src/cookies.js";
import * as crypto from "../src/crypto.js";
import * as db from "../src/db.js";
import * as highscoreStore from "../src/highscore-store.js";
import { createContributorLookup, createOwnedCharacterLookup, LOGIN, oogatron } from "../src/contributor-policy.js";
import { turnConfigured } from "../src/sfu.js";
import { RULES } from "../src/tess-rules.js";
import "../../src/js/highscore-rules.js";
import "../../src/js/arcade-cabinets.js";
import "../../src/js/cloud-hopper-replay-codec.js";
import { GAME_KINDS, gameName } from "../src/games.js";
import * as inspectReport from "../src/inspect-report.js";
import * as cpuModel from "../src/cpu-model.js";
import { PAGE } from "../src/inspect-page.js";
import * as equipmentModel from "../src/equipment-model.js";
import { equipmentHatArchive, equipmentHats } from "../src/equipment-hats.js";
import { equipmentWardrobe } from "../src/equipment-wardrobe.js";
import { revokeChats } from "../src/chat-revoke.js";

const load = (name, dependencies, exports) => {
  const url = new URL(`../src/${name}.js`, import.meta.url);
  const source = readFileSync(url, "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+"(?:\s+with\s*\{[^}]*\})?;/g, "")
    .replace(/import\s+"[^"]+";/g, "")
    .replace(/export\s+\{[^}]*\}\s+from\s+"[^"]+";/g, "")
    .replace(/export default /g, "const worker = ").replace(/export const /g, "const ");
  return compileFunction(`"use strict";\n${source}\nreturn { ${exports.join(", ")} };`, Object.keys(dependencies), { filename: url.pathname })(...Object.values(dependencies));
};

// A fact sheet in the shape scripts/tess-facts.mjs writes.
export const TESS_FACTS = { places: ["pile", "factory", "arcade"],
  titles: { pile: "The pile", factory: "Lightning Factory", arcade: "Ooga Arcade" }, text: "# Places\n- pile (The pile): bananas." };

export const routeFixture = ({ cast = [{ handle: "ooga-dev", github_login: "ooga-dev",
  joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z" }],
lookup = async () => null, catalog = null, fetcher = async () => { throw new Error("Unexpected network request"); },
anthropic = class { constructor() { throw new Error("Unexpected Claude call"); } }, facts = TESS_FACTS } = {}) => {
  const access = load("contributor-access", { CAST_ROWS: cast, LOGIN, createContributorLookup: () => lookup,
    catalogFor: () => catalog || ({ read: async () => ({ revision: "fixture", generation: 0, rows: cast }), fresh: () => true }),
    createOwnedCharacterLookup: (rows) => createOwnedCharacterLookup(rows, lookup) }, ["contributorFor", "contributorForEnv", "contributorDecision"]);
  const http = load("http", { ...cookies, ...db, ...access, oogatron }, ["json", "text", "redirect", "fromSite", "safeNext",
    "clientIp", "allowed", "sessionToken", "getSessionFromRequest", "getSessionForRemoval", "readBody", "serviceSession", "asPlayer"]);
  const auth = load("auth", { ...cookies, ...crypto, ...db, ...http, ...access, oogatron, revokeChats, fetch: fetcher }, ["handleAuth"]);
  const api = load("api", { ...cookies, ...db, ...http, ...equipmentModel, turnConfigured, GAME_KINDS, revokeChats }, ["handleApi"]);
  const equipment = load("equipment", { ...http, ...crypto, ...equipmentModel, equipmentHatArchive, equipmentHats, equipmentWardrobe }, ["handleEquipment", "handleEquipmentCatalog", "handleEquipmentHat", "handleWardrobeCatalog", "createEquipmentHandler"]);
  const donations = load("donations", http, ["handleDonations"]);
  const tess = load("tess", { ...http, Anthropic: anthropic, FACTS: facts, RULES }, ["handleTess", "pruneTess", "ask", "RESERVE"]);
  const replayStore = load("cloud-hopper-replay-store", {}, ["winnerSQL", "liveSQL", "winnerReplay", "pruneCloudHopperReplays"]);
  const highscores = load("highscores", { ...http, ...highscoreStore, ...replayStore }, ["handleHighscores", "createHighscoreHandler", "readScores", "improve"]);
  const replays = load("cloud-hopper-replays", { ...http, ...replayStore, ...highscores }, ["handleCloudHopperReplays", "createReplayHandler"]);
  const plays = load("arcade-plays", http, ["handleArcadePlays", "createPlaysHandler", "countPlay", "readPlays"]);
  const reports = load("connection-reports", http, ["handleConnectionReports", "createConnectionReportHandler", "validConnectionReport", "pruneConnectionReports"]);
  const inspect = load("inspect", { ...http, ...inspectReport, PAGE }, ["handleInspect"]);
  const worldReport = load("world-report", {}, ["WORLD_NAME", "worldReporter"]);
  const world = load("world", { ...http, ...inspectReport, ...cpuModel, ...worldReport }, ["handleWorld", "createWorldHandler", "handleWorldLive", "createWorldLiveHandler",
    "answerFor", "REFRESH_MS", "LIVE_MS", "EMPTY_MS", "RETRY_S"]);
  const main = load("index", { ...http, ...db, ...auth, ...api, ...equipment, ...donations, ...tess, ...highscores, ...replays, ...replayStore, ...plays, ...reports, ...inspect, ...world, inspectEdge: inspectReport.inspectEdge, gameName }, ["worker"]);
  return { ...http, ...auth, ...api, ...equipment, ...donations, ...tess, ...highscores, ...replays, ...replayStore, ...plays, ...reports, ...inspect, ...worldReport, ...world, ...main };
};
