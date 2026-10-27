# Reviewed Studio programs

Both programs are original synthetic H.264/AAC assets generated for issue #192, 320×180 at 30 FPS. They contain animated color fields and generated tones, with no speech, recordings, people, third-party imagery or music. Both are released under this repository's Unlicense.

| Source ID | Asset | Duration | Sound |
|---|---|---|---|
| `sample` | `studio-sample.mp4` | 12 seconds | Quiet generated 440 Hz tone |
| `sample-quiet` | `studio-quiet.mp4` | 8 seconds | Different animation, softer generated 220 Hz tone |

Each asset has an English descriptive WebVTT caption file and a plain-text transcript beside it. Captions explicitly describe the synthetic visual and sound rather than implying spoken words. The Studio panel offers an explicit caption switch and readable transcript; the in-world texture does not rasterize native captions, so caption readers use the accessible panel.

`src/js/studio-catalogue.js` is the canonical reviewed catalogue used by the client and imported by the Worker. Entries include duration, title, same-origin media/caption/transcript paths and bounded transcript text. Host selection and Next accept only catalogue IDs. Adding a source requires reviewed rights and accurate duration, descriptive captions/transcript and assets; arbitrary URLs are never accepted or fetched.

`scripts/site.mjs` stages the catalogue's media, captions and transcripts at `/media/` for both hosting targets. Source and built file previews resolve the original assets without fetching an external service.

Browsers may treat direct `file://` video as an opaque origin and reject WebGL texture uploads even when native video playback succeeds. The Studio detects a blocked texture, keeps voice and native panel playback available, and displays a fallback notice. Use the repository HTTP preview (`npm run serve`) to verify the in-world screen on a consistent origin. File previews are not proof of deployment video-texture access.
