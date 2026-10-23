# Existing terrain meshing (task2.4)

The brief's missing-greedy-meshing premise is false. terrain.gridGeometry already grows coplanar rectangles matching palette color, direction and Matrix cave owner. Emissive is uniformly zero in this voxel pass. The implementation was left intact.

The audited handle is the actual home island: seed1 with the open Factory c2 roof tube. Original source and an in-memory count-instrumented copy have identical complete geometry hashes. Native ARM count evidence:

| Canonical home terrain | Before | After |
|---|---:|---:|
| Triangles |325,556|325,556|
| Faces |167,273|167,273|
| Vertices |179,761|179,761|
| Vertex bytes |4,314,264|4,314,264|

The grid portion already combines382,852 exposed cell faces into119,416 quads (3.206×). Unrestricted surfaces combine314,460 cells into57,406 quads (5.478×); the largest covers2,356 cells. Route/window ownership accounts for60,750 one-cell quads,50.9% of the grid's quads. Furnished floors combine7,642 cells into1,260 quads, with at most16 cells per quad.

Those boundaries carry behavior. terrain-cutaway reads each route station/channel, ceiling bottom and window column/level to retain the correct rock around curved paths and windows. A larger quad cannot carry one scalar column for several different opening heights. Furnished-floor spans stay at most one metre so Canvas depth sorting preserves low furniture. Continuous ramp/window fragments are not coplanar voxel cells.

A further3× reduction is not available by adding another greedy pass while retaining those per-cell contracts: constrained quads alone exceed a third of the current grid. A different spatial material/ownership representation would need separate collision, cutaway and Canvas validation. No visual or collision change was made merely to reach a triangle number.

Five temporary diagnostic fixtures confirm a solid2×2×2 cube merges24 exposed cells into6 quads, route/window columns stay separate, cave ownership stays distinct, and furnished floors retain their size limit. Existing functional checks remain unchanged; no duplicate suite records were added. Full count/source/geometry hashes are in performance-terrain-audit-evidence.json. This is an audited existing optimization, with zero new triangle reduction.
