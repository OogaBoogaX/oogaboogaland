# Compact render meshes behind a flag (task 3.3)

`?compactGeometry=1` packs finished, immutable, render-only meshes into typed columns: voxel character bakes and their colourways, foliage LODs (including the Mempool island's fern, shrub and undergrowth), the grass tuft and the cutaway caps. Vertex positions, face offsets, corner indices and colours become typed arrays, other face fields become coded columns, and a `legacy` face list is built only for a reader that asks for `faces`. The renderers, guides, picking, weapon targets, character visibility, the camera cover and the HUD's icon renderer walk faces through a cursor (`createCursor`, `readFace`) that allocates nothing. Collision shells, the canonical island and anything Canvas or context restoration rebuilds from stay in their original form. Writing a packed mesh's faces, or reassigning its `faces` or `verts`, throws; its typed positions cannot refuse an element write. Builders that copy faces into a new mesh (`merge`, a track's sector bake) take fresh records through `copyFace`, so they leave the legacy face list empty. Off by default: `pack` returns the mesh untouched and every reader takes `faces[index]`.

Hub forced-GC floor after boot, ARM64 Chrome, staged site:

| | Used heap | Backing storage |
|---|---:|---:|
| Before (4 runs) | 235.8–236.5 MiB | 130.5–131.1 MiB |
| Flag off (4 runs) | 238.3–238.9 MiB | 131.7–132.0 MiB |
| Flag on (2 runs) | 205.9–207.8 MiB | 142.4–143.4 MiB |

With the flag on the hub floor falls by about 29 MiB of heap, about 18 MiB net of the typed storage it adds. With it off the reported used size is about 2.3 MiB higher in every alternating run, but boot heap snapshots show 2.6 MB less live data than before, so that figure is allocator state rather than anything kept. The hub was already below 250 MiB before this change; the flag takes it to about 206 MiB, short of 200.

Node fixtures (fresh process per variant): the 13 foliage plants save 7.48–7.50 MB (41%), 46 characters with gear 7.92 MB (24%), the newer pool foliage 1.34 MB (50%). Flag-off output equals the old code across the handoff's foliage, character, contract and visibility fixtures; flag-on draw commands for 46 portraits match exactly; the grass tuft's flag-on normals differ by at most 1.8e-7 (float32), the cutaway caps' flag-on parity has no fixture. In Chrome with the flag on, every scene (factory, arcade, rally, drop, orbit, mine, lab, ₿IFRÖST, DSB, Thro-ball, Coconut Invaders) enters and returns with a clean console, and the hub looks the same on WebGL and Canvas 2D.

With the flag off: unit 270/270; race, drop, orbit, mine, arcade, lab, ₿IFRÖST, skee, invaders and factory (without its stopped greeter) pass; the hub's weapon, guide, birds-eye, HUD, jumbotron and round-trip steps pass. The hub's Canvas 2D tour hangs, on a clean export of the previous commit too: since task 4.5 its synchronous loop cannot see Drop's asynchronous build arrive. That check is STOP; a fix is saved at `untracked/performance/canvas-tour-yield.patch` for the maintainer. Raw rows: `untracked/performance/evidence/performance-compact-geometry-evidence.json`.
