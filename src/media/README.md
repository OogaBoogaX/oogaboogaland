# Studio demonstration

`studio-sample.mp4` is an original synthetic 12-second, 320×180, 30 FPS H.264/AAC test program created for issue #192. It contains moving color fields and a quiet generated 440 Hz tone, no recordings, third-party images, people or music. It is released under this repository's Unlicense.

The shared Studio uses a bounded source catalogue: source ID `sample` maps to this same-origin asset. Add approved sources to the server/client catalogue together; do not accept arbitrary remote URLs. `scripts/site.mjs` copies this asset to `/media/studio-sample.mp4` for both hosting targets. Source and built file previews resolve the original asset without fetching an external service.
