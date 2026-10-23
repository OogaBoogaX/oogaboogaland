# SatsMason character and pocketed kit

SatsMason retains the reviewed Tripo stone body, hat, beard and exposed BTC chest symbol. A new Tripo leather waist apron replaces the crowded kit. The Thor hammer is removed. The trowel and two chisels show only their grips when stored in the apron; full tools appear when selected. The hurley is stored behind the back. Four tools and Holster all use the existing melee rules, saved selection and bounded multiplayer equipment messages. Exact strike animations and masonry construction are outside this change.

The character declaration remains below the 32 KB submission limit. Immutable body data lives in satsmason-art.js; body, new kit and reduced wall-cue data are included by scripts/characters.mjs in the generated registry bundle, so browser and Node loaders share the same dependency order. The native renderer uses sampled face colours and explicit normals; original textured GLBs are retained in the recovery delivery. This is not a new UV/PBR renderer. The current preview contains 102,842 unique mesh triangles and delivered 60 FPS in isolation. The point chisel's latest Tripo result has a blunt tip and remains an art-review issue.

The wall mask uses separate reduced topology while the visible body stays unchanged. Canvas paints are bounded to 256 triangles, projected winding is normalised and the part/view transform is composed once per part. Stored grips follow the apron flaps during walking. Removed/unknown saved tools fall back to holstered state.

## Validation and limits

Current local build passes. Equipment/character/save checks pass 9/9, and the wall-outline regression passes 1/1, covering clipping, mirrored winding, proxy selection and disposal. Front and back views confirm the clear BTC chest, pocketed handles, absent hammer and stored hurley. The side walking preview also shows the drawn trowel and pocketed handles. Phone touch and staging checks remain outstanding.

Earlier normal-Mac runs passed backend 35/35 and authenticated local multiplayer 1/1. The speed recheck failed at 42.46 FPS ordinary / 8.88 FPS covered, both low quality; the covered overlay averaged 105.26 ms. These are measurements of the prior batching-only version, not this new reduced wall-cue version. The owner explicitly authorised continuing after STOP. The final visible-browser run recovered after that viewport-control timeout and verified 1920x1080, DPR 2 and focused input on Apple M3/ANGLE Metal. It failed at 32.09 FPS ordinary / 22.25 FPS covered, both low quality; covered overlay averaged 38.18 ms (max 45.8 ms). Ordinary p95 was 33.6 ms with a 250 ms maximum; covered p95 was 50.5 ms. Donation and movement occurred, with 112/112 covered samples outlined. This is a different browser transport from the prior normal-Chrome run, so the improvement is not a controlled comparison. Both performance assertions are now STOP streak 3; no further performance fix or retry was attempted. No floor, quality policy or production security setting was weakened. Headless Chrome remains blocked by macOS startup permissions in this restricted host.

Additional test/run.mjs follow-up checks remain local: automatic approval review rejected uploading that expanded file because its input exceeded the review budget, not because it found unsafe code. The full local follow-up is retained in satsmason-live-test-followup.patch. Do not claim that these additional checks are published in the PR. Earlier unrelated activity failures were not rerun or weakened.

## Upstream review

This contribution was developed in SatsMason/oogaboogaland, then integrated onto upstream rock 786ab4c1ce362dbbe753cf9902d62972d0d9e221 in the genuine fork SatsMason/oogaboogaland-contribution. The standalone repository retains the earlier development PR #2. This fork is for upstream draft review.

Upstream character automation extracts only src/characters/*.js and requires manual human review. This character depends on shared art/build/engine support, which that extraction would omit. Maintainers must agree to those prerequisites or a split submission before it can be accepted. Do not alter the automation to bypass that policy. Acceptance is not assured.

Keep the change draft until performance, real phone controls and staging multiplayer have been checked and maintainers agree to the integration path. Preserve rock. No merge, deployment or production change without the owner's explicit approval.


## Current upstream integration

The current-upstream site build, changed-file syntax and focused equipment/save/network contracts pass (8/8). Worker checks pass 105/105 after generating the normal character metadata. The focused contracts were adapted and run locally against the current room cast and chat-bucket fixture. The uploaded derivative runner was then restored to the exact upstream version to honour the earlier test-upload restriction. All added focused/live/outline/performance checks remain local; do not count them as published. Runtime asset dependencies are bundled together so upstream’s unchanged loader receives the complete character data. Upstream already has fuller browser startup diagnostics, which are preserved unchanged. Earlier visual and speed results above belong to the prior working copy; no new full-island speed claim is made for this integration. The existing performance STOP remains reported.

![Pocketed waist apron, clear BTC chest and hands free](satsmason-front.png)
