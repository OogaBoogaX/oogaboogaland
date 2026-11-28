// The block letters, shared by the files, the builder and the overlay. Greys measured off reference-ape.png, darkest
// to lightest; the code form's greens follow from each grey (see build.mjs).
export const RAMP = {
  "0": "#0c0c0d", "1": "#141414", "2": "#1c1c1d", "3": "#252526", "4": "#303031", "5": "#3c3c3d",
  "6": "#4b4a4b", "7": "#5c5b5b", "8": "#706f6f", "9": "#878687", "a": "#a09fa0", "b": "#bab9ba",
  "o": "#050504", "i": "#3a1f12", "h": "#efe7df",
  // Lighter than b, after the eye colours so every index above stays where it was: for front faces that need to read
  // as pale as the sheet's under our dimmer light on them (the pecs, b14).
  "c": "#d2d1d2", "d": "#e8e7e8"
};
export const header = (id, pivot) => `# ${id}
pivot ${pivot.join(" ")}
# One character a block, on the six-view sheet's own grid (x across, y up from the ground, z from the rear to the
# front; a block is 0.053 m). Rows run bottom to top: "y <row> x <first column> z <first line>". In a row the first
# line is the front-most; columns run from the gorilla's right to its left, as the FRONT view shows them.
# Colours: 0-9 a b greys from darkest to lightest (c d lighter still) (fur is about 1-3, the chest and muzzle about 6-8, the shoulder
# silver about 8-b), o black, i eye brown, h eye highlight; '.' is empty.
`;
