# Shared Studio video and voice (#192)

The Studio screen and its accessible panel share one HTML video element. The reviewed catalogue in `src/js/studio-catalogue.js` is shared by the client, Worker and staging build. It includes original synthetic twelve-second and eight-second clips, captions and plain-text transcripts at same-origin `/media/` paths. Click the in-world screen or **Studio session** control to open the panel. The implementation uses the existing island Durable Object, GitHub sessions and Cloudflare Realtime SFU. There is no meeting SDK, screen capture, external video embed, recording or new paid service.

## User behavior

Enter DSB Studio and enable Studio sound explicitly. Listening does not request microphone access. The personal sound choice takes priority over host program volume. Microphone publication requires a separate click and browser permission; a host cannot activate another person's microphone. Muting/leaving Studio sound stops voice and silences the program. Sound and mic failures remain visible in the panel. Readiness distinguishes a receive session ready with no speakers from actual connecting/connected media; requesting sound does not claim successful listening. The panel reports buffering, autoplay blocking and microphone permission, offers retry, and explains disabled speaking.

An approved host claims the session. **Present** permits only host speech, while **Open discussion** permits seated attendees who explicitly join conversation. Pausing a program does not change the speaking mode. Host controls play/pause, seek and program volume. Host source selection and Next choose only reviewed catalogue IDs; seek bounds and synchronization use that source’s declared duration. Captions can be toggled and the transcript is available in the panel. Native captions are displayed in that accessible panel; the in-world video texture does not rasterize them. Production content requires reviewed rights, durations and captions before adding an entry; arbitrary URLs are never accepted. Host transfer is limited to another approved account in the Studio and requires renewed microphone consent. Speaking revocation is separate from personal browser mute.

`STUDIO_HOST_IDS` is a comma-separated list of stable numeric GitHub account IDs. It has no implicit default: missing, empty or malformed configuration authorizes nobody. It is independent of NPC simulation election and contributor/body ownership. Operators set it through the normal reviewed Worker configuration once a host is approved; no service configuration is changed by this PR.

Seat identifiers follow the 39 existing model anchors. The Room owns seat assignment and speaking eligibility; it validates body ownership, Studio zone, proximity to the authored anchors and exclusive occupancy. Zone/pose data remain client reported, matching the game's current movement trust model. This is not a new authoritative physics service. A rejected claim stands the local avatar and reports the refusal. Reconnect requires a fresh assignment rather than silently restoring an occupied seat.

Optional **Moderated Q&A** keeps a raised-hand queue. The host invites a seated eligible attendee, who must still explicitly choose to unmute. Lowering a hand, standing, leaving, revocation and host transfer remove invitation authority. **Restore speaking** reverses an accidental session restriction; restoration never turns on hardware or publishes a microphone. Open discussion remains available and is the initial claimed-session mode.

Microphone selection and preflight request browser permission, capture and meter only locally, and never contact the SFU or publish. Changing device releases any existing publication and requires fresh explicit unmute. Leaving releases preview hardware and invalidates pending permission results. Personal program and voice sliders are separate from the host’s room program volume; host changes never override personal silence.

## State and media authority

Studio commands use the existing authenticated WebSocket. A command id is page-wide and only names the command in its `studio-result`: nothing resends a command, so the Room replays none. Host transport (play, pause, seek, source) carries the sender's view of `playbackRevision`, which only transport, a host transfer and a suspension move, and is refused when that view is stale; seats, stands and hands never refuse it, and seat and hand commands keep their own checks. The Room supplies host identity, mode, playback anchor/time, volume and per-recipient permission state, and sends Studio state to players in the Studio alone. The NPC `hostId` protocol remains separate. Accepted command state is persisted for Durable Object hibernation, and stored media cleanup retries from an alarm due at wake, never inside the constructor's `blockConcurrencyWhile`. Browser state rejects older epoch/revision snapshots.

Clients derive program position from the server playback anchor and estimated server time; normal drift beyond 450 ms seeks to the target. Playback starts muted where possible, reports gesture rejection, and resynchronizes after visibility/reconnect. Browser buffering is local and does not pause everyone's program.

SFU signaling remains server-side with the existing app secret. A per-room-connection token binds operations to the current tab. Publisher and receiver changes are serialized; publication permission is checked before and after upstream awaits. The Room owns track MID records and forcibly closes disallowed publications/subscriptions instead of trusting client mute or peer-list compliance. Pending/uncertain cleanup identifiers are persisted and retried on the existing Room alarm. Failed closure cannot be described as immediate successful revocation; diagnostics/real-SFU acceptance must verify the actual result. Provider buffering may briefly play already received packets.

Host departure suspends presentation immediately and pauses the program. No attendee is automatically promoted. An approved host explicitly reclaims the session. Sign-out, account deletion/ban, replacement, zone departure and revoked speaking reconcile server media ownership. Existing other-zone voice keeps its previous speaking rules.

Studio voice snapshots also carry the number of other receive sessions in the room. A receive-only attendee is an audience member even without a published microphone, so a host must not infer that nobody is listening from an empty list of speakers. The client uses the bounded server count for its existing alone gate, preserves personal mute, and clears the count on stop or zone departure. Other voice zones retain their existing behavior. Opening a fresh receiver forces a current voice snapshot even when the publisher list and audience count are unchanged.

The Studio panel can explicitly unmute an existing publication muted through the global voice control. It does not try to recapture a microphone while that publication is already active. Its normal mute action still releases publication and hardware.

## Coverage

One Worker scenario runs the real Room handlers with 8, 16 and 32 synthetic authenticated player records and a mocked SFU. It exercises receive-only presentation, all seated participants explicitly publishing in discussion, 56/240/992 directed subscriptions, forced return to presentation, Q&A invitation without automatic publication, question completion, approved host transfer with fresh consent, suspension and cleanup. It checks retained ownership during the existing late-allocation inspection window before advancing that window and requiring complete cleanup. This is simulated state/permission coverage, not live SFU transport, bandwidth, audible output or a measured provider-capacity result.

## Rendering and sound

Both WebGL2 and Canvas2D support the same dynamic image surface backed by the video element. WebGL updates the existing texture and avoids per-frame mipmap generation; video surfaces are capped at 1280×720. The native panel remains the accessible fallback. The video has one audio path, avoiding duplicate sound between the panel and the world. Received voice never enters the microphone publication. Existing echo-cancellation/noise-suppression constraints are retained; headphones are recommended for live acceptance.

Studio ambience ducks while the shared program is playing. The DSB Spaces archive that once played from the cabinet left `rock` with its external host (the cabinet is set dressing now), so nothing else in the room has to stop when a presentation starts. No arbitrary media proxy is introduced. CSP adds only same-origin media; existing script/style restrictions remain intact.

## Acceptance limits

The island remains capped at 32 signed-in accounts, including visitors outside Studio. This is not 32 attendees plus a host. All opted-in seated speakers are eligible in discussion; there is no hidden active-speaker cap. A full-room discussion can produce 31 received audio tracks per listener and needs physical-device/load acceptance.

Physical iOS/Android sound, background/lock-screen behavior, real multi-account SFU closure, constrained-network latency and large-room audio balance require controlled staging acceptance. The existing five-minute hidden-tab departure remains; uninterrupted background listening is not promised. A deployment can interrupt sockets and media. No automatic staging/production deployment accompanies this PR.

Provider contracts: https://developers.cloudflare.com/realtime/sfu/api/ ; https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/#stop-forwarding-without-negotiation ; https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/#retry-and-reconnect . Forced closure uses no SDP; inspect individual track results and retain unresolved ownership. Do not retry uncertain creation blindly.

## Open decisions

Production use still needs explicitly approved host/cohost IDs and reviewed content with distribution rights, accurate duration, captions and transcripts. The current scope is synchronized hosted clips with discussion as the initial claimed-session mode; live screen capture is a separate product decision. Live account/SFU termination, audible mixing/echo/ducking, physical iPhone/Android lifecycle and actual 8/16/32-account capacity require the corresponding environment and human/device access. Those requirements do not prevent completing and testing the implementation locally.

Outstanding product decisions: explicit approved host/cohost numeric GitHub IDs; production clips, distribution rights and captions/transcripts; whether hosted clips meet the video requirement or live screen capture is required; and whether open discussion or optional moderated Q&A should be the default. Current safe defaults are a synthetic reviewed hosted catalogue, no implicitly authorized host, explicit consent and open discussion after an approved host claims.
