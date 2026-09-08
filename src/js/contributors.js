(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const HOUR = 60 * 60 * 1e3;
  // TODO: replace with the GitHub API
  const roster = [
    ["portlandhodl", 1788159681],
    ["w-s-bitcoin", 1788178261],
    ["dplusplus1024", 1788153655],
    ["bc1gui", 1788008082],
    ["RandyMcMillan", 1788019011],
    ["MrHodlX", 1788200000],
    ["timechainb", 1788073569]
  ].map(([name, unixSeconds]) => ({ name, lastCommitAt: unixSeconds * 1e3 }));
  const SNAPSHOT_AT = 1788225311 * 1e3;
  const stateFor = (contributor, at = SNAPSHOT_AT) => {
    const age = at - contributor.lastCommitAt;
    if (age < 24 * HOUR) return "working";
    if (age < 7 * 24 * HOUR) return "sleeping";
    return "away";
  };
  const ageLabel = (contributor, at = SNAPSHOT_AT) => {
    const hours = Math.max(0, Math.floor((at - contributor.lastCommitAt) / HOUR));
    if (hours < 1) return "just now";
    if (hours < 48) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  const { fnv1a, mulberry32 } = BL.math;
  // Opt-in likeness overrides per handle
  const LIKENESS = {
    portlandhodl: { bald: true },
    "w-s-bitcoin": { apple: true, symmetricTusks: true },
    MrHodlX: { gasMask: true },
    dplusplus1024: { build: "slim", hair: "#b9dcaa" }
  };
  const SKINS = ["#c98a5b", "#a9744c", "#8a5a3a", "#d9a06b", "#b58057"];
  const HAIRS = ["#2b1b10", "#4a2c14", "#151312", "#5c4425", "#7a2e12"];
  const HAIRS_SLIM = ["#ece5d3", "#e0dac6", "#f2eee2", "#b9dcaa", "#a3d19a"];
  const FURS = ["#d98a2e", "#cc7f28", "#c98936", "#e09a40", "#c27a24", "#d4913a"];
  const traitsFor = (name) => {
    const likeness = LIKENESS[name] || {};
    const slim = likeness.build === "slim";
    const rand = mulberry32(fnv1a(name));
    const skin = SKINS[Math.floor(rand() * SKINS.length)];
    const hashedHair = (slim ? HAIRS_SLIM : HAIRS)[Math.floor(rand() * HAIRS.length)];
    return {
      name,
      slim,
      bald: !!likeness.bald,
      apple: !!likeness.apple,
      gasMask: !!likeness.gasMask,
      symmetricTusks: !!likeness.symmetricTusks,
      skin,
      hair: likeness.hair || hashedHair,
      fur: FURS[Math.floor(rand() * FURS.length)],
      height: 0.92 + rand() * 0.24,
      belly: (0.9 + rand() * 0.35) * (slim ? 0.8 : 1),
      rand: mulberry32(fnv1a(name + "/body"))
    };
  };
  BL.contributors = { roster, stateFor, ageLabel, traitsFor };
})();
