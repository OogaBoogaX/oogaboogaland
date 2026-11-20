// Cosmetic room presets. Never read or mutate a table, deck, balance or action.
(() => {
  "use strict";
  const BL = window.BL;
  const themes = [
    {
      id: "gatsby", name: "Banana Club", short: "Club", detail: "White marble hall, gold columns, a fountain and the statues of Bitcoin's road.", lamp: 0,
      // Marble: floor, wall panels, side walls, end walls, the cream ceiling and the table tops. Walnut chairs, a darker
      // marble base, a deeper green runner on the white floor and pale gold lettering on the far wall's green field.
      stone: ["#ece8e1", "#e8e3da", "#d9d2c6", "#e4ded4", "#efe3c8", "#f1ede6"],
      wood: "#4a2e1e", accent: "#c8a45f", mineral: "#e2c98a", felt: "#317459", panel: "#cbc4b8", runner: "#2c614c",
      ui: { accent: "#dfbe77", bright: "#f4dda2", ink: "#213023", text: "#f5efdf", muted: "#c1d0bb", surface: "#243e33", deep: "#142820", halo: "#45654f", rail: "#d3c5a5", feltLight: "#3b7963", feltDark: "#164332" },
      // A bright, warm white marble hall, brighter than the caves, with low bloom so white stone does not glare; each
      // table's lamp still outshines the chandeliers over its felt. Tuned by eye in the built room.
      sky: [0.86, 0.83, 0.77], ground: [0.62, 0.59, 0.54], direct: [0.98, 0.87, 0.68], ambient: 0.56,
      tableRange: 11, tableY: 4.4, bloom: 0.22, directStrength: 0.42,
      tableLight: [1, 0.84, 0.58], roomLight: [1, 0.87, 0.63]
    },
    {
      id: "crystal", name: "Crystal Grotto", short: "Crystal", detail: "Cyan crystal veins, amethyst stone and cool lagoon felt.", lamp: 1,
      stone: ["#66798c", "#8295a6", "#596b84", "#697a94", "#46566c", "#a2b9c9"],
      wood: "#53657a", accent: "#80dccc", mineral: "#b994ef", felt: "#286b78", panel: "#37496c", runner: "#486b7d",
      ui: { accent: "#88dfdd", bright: "#caeff4", ink: "#173448", text: "#eef6ff", muted: "#bbcde5", surface: "#2b3d5c", deep: "#15243e", halo: "#4b5285", rail: "#b0c6d8", feltLight: "#398a96", feltDark: "#245263" },
      sky: [0.45, 0.59, 0.74], ground: [0.23, 0.31, 0.41], direct: [0.7, 0.86, 0.96], ambient: 0.51,
      tableLight: [0.66, 0.92, 1], roomLight: [0.72, 0.55, 1]
    },
    {
      id: "ember", name: "Ember Cavern", short: "Ember", detail: "Basalt walls, copper rails and glowing amber seams.", lamp: 0,
      stone: ["#736761", "#8a7970", "#645856", "#75625c", "#4c4445", "#a8907e"],
      wood: "#684b3d", accent: "#d2915a", mineral: "#ffb35d", felt: "#763d34", panel: "#55352f", runner: "#754b3e",
      ui: { accent: "#edaa70", bright: "#ffdeb2", ink: "#402920", text: "#fff1e5", muted: "#dbc1b1", surface: "#543932", deep: "#2c201f", halo: "#7a4b37", rail: "#b89c83", feltLight: "#99533f", feltDark: "#54302f" },
      sky: [0.68, 0.49, 0.37], ground: [0.38, 0.3, 0.27], direct: [1, 0.78, 0.54], ambient: 0.52,
      tableLight: [1, 0.81, 0.61], roomLight: [1, 0.46, 0.22]
    },
    {
      id: "jungle", name: "Jungle Ruins", short: "Jungle", detail: "Mossy limestone, hanging vines and carved Ooga runes.", lamp: 2,
      stone: ["#929578", "#b4b58f", "#8b9274", "#a1a387", "#637258", "#c6c49e"],
      wood: "#736048", accent: "#c3bc70", mineral: "#a5df71", felt: "#487745", panel: "#476040", runner: "#667c4c",
      ui: { accent: "#cad585", bright: "#f0e7b0", ink: "#28341d", text: "#f5f4df", muted: "#c8d4b2", surface: "#3a5135", deep: "#203222", halo: "#607343", rail: "#c3bc95", feltLight: "#628b4e", feltDark: "#2e563c" },
      sky: [0.57, 0.67, 0.44], ground: [0.3, 0.4, 0.27], direct: [0.94, 0.93, 0.65], ambient: 0.55,
      tableLight: [0.94, 1, 0.73], roomLight: [0.68, 1, 0.51]
    },
    {
      id: "moonstone", name: "Moonstone Hollow", short: "Moonstone", detail: "Silver mineral bands, violet felt and soft lunar light.", lamp: 1,
      stone: ["#8a8e9d", "#a9adbb", "#72788d", "#9398aa", "#535e77", "#c5c8d7"],
      wood: "#66687e", accent: "#bec6e7", mineral: "#acdfff", felt: "#605380", panel: "#514e73", runner: "#777d98",
      ui: { accent: "#c3c7ed", bright: "#eeeaff", ink: "#33304e", text: "#f3f2ff", muted: "#cbcae3", surface: "#48455e", deep: "#27283e", halo: "#73718c", rail: "#cdcbdc", feltLight: "#81749e", feltDark: "#474363" },
      sky: [0.61, 0.63, 0.79], ground: [0.33, 0.35, 0.47], direct: [0.85, 0.88, 1], ambient: 0.54,
      tableLight: [0.83, 0.87, 1], roomLight: [0.62, 0.79, 1]
    }
  ];
  const get = id => themes.find(t => t.id === id) || themes[0];
  const KEY = "ooga-poker-theme";
  const load = () => { try { return get(localStorage.getItem(KEY)).id; } catch { return themes[0].id; } };
  const save = id => { try { localStorage.setItem(KEY, get(id).id); } catch { /* A blocked store leaves this visit's theme usable. */ } };
  BL.pokerThemes = { themes, get, load, save };
})();
