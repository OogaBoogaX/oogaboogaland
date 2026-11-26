# Hosted chats

Hosts and co-hosts in Ooga Chat (OC, `ooga.chat`) and in Ooga Booga Land's (OBL, the island's) Ooga Chat panel: who
starts a conversation, who may speak in it, and how a listener asks. Agreed with the maintainer on 2026-11-22 before any
code; this file is the design both PRs build to. Roles follow X Spaces and Clubhouse: host, co-host, speaker, listener.

## The model

**A chat is started, not found.** Today's always-on public conversation (one roster for each outdoor zone, island
players heard in OC by walking into a public zone, OC speakers on clouds over the real island) is replaced. A chat
exists only while a host keeps it: a contributor starts one, picks its zone (Main Island or DSB Land) and gives it a
title. Two hosts picking the same zone start two chats, each in its own parallel copy of that zone, with nothing shared
between them.

**Signing in joins nothing.** Signing in to OBL or OC puts nobody in a chat. A visitor is in one only after opening it
from the list and joining it, as a listener, then speaker or co-host. The main island goes back to plain proximity
voice: nothing said on it is heard in OC, and nothing said in a chat is heard on it.

**Two pieces, two PRs.**

1. **Chats and roles** (this design's first PR): the chat objects, the list, roles, requests and the host's tools, in
   OC and in the island's Ooga Chat panel. An island visitor joins a chat by voice while their Ooga stays where it is.
2. **The copies of zones** (the second PR): each chat's own instance of its zone, which an island player travels into
   with their Ooga (the list's Go there), with the chat's OC speakers on its clouds. Out of scope here except where the
   first PR must leave room for it.

## Roles

| Role | Who | May |
|---|---|---|
| Host | the contributor who started the chat; one a chat | everything a co-host may, plus make and remove co-hosts, hand the chat over to a co-host, end the chat |
| Co-host | up to 3, made by the host from the chat's speakers or listeners | approve and decline requests, invite a listener, mute a speaker, move a speaker to listening, remove a listener or speaker from the chat; never touch the host or another co-host, never end the chat |
| Speaker | approved by a host or co-host, and remembered for the chat (below) | speak, mute and unmute themselves, raise the hand, go back to listening and return with Join voice |
| Listener | anyone signed in who joined (GitHub or X) | listen, react, request to speak |

- **The host is on stage from the start**, muted, as in X Spaces: Start chat opens their microphone on the strength of
  that press (refused, they stay host with no microphone, and Join voice asks again). A co-host joins the stage only by
  pressing Join voice. A host's tile is labelled **Host** and a co-host's **Co-host** in place of Speaker or Listener,
  with no separate badge; the microphone mark still shows whether one on stage is speaking or muted.
- **Co-hosting is offered.** Make co-host sends the person an offer, which holds one of the three slots (co-hosts and
  open offers together; the host cannot offer more while all three are held). Accepting makes them a co-host and puts
  them on stage at once (their Accept is the press the microphone is asked for on); Not now frees the slot. A co-host
  who leaves voice is a listener again with the offer back, their slot kept; one who drops and does not return within
  the stage's hold gets the same if still in the chat, and frees the slot if gone. The host may withdraw an offer, or
  make a co-host a plain speaker who stays on stage. Leaving the chat frees an offer's slot. A row with an offer has
  `request: "cohost"`.
- **Who may start a chat:** a GitHub account the island's contributor policy calls `eligible` (`chat-capability.js`,
  the rule that let someone speak until now), checked again by the island when the chat starts. One live chat a host.
- **Who may request:** anyone signed in, GitHub or X. Eligibility no longer decides speaking: a host does. An X
  speaker, or any speaker without an Ooga, gets no cloud in the second PR's copy (clouds carry GitHub ids).
- **Speakers** count the host and co-hosts: at most 32 a chat (`CHAT_SPEAKERS`, a setting that may lower it, never raise it: a copy holds 32 Oogas; every listener
  receives one voice per speaker, about 32 kb/s each while they talk, much less while muted, and the media server sends
  speakers × listeners streams, about 16,000 at 32 to 500), at most 500 listeners
  (`AUDIENCE_LISTENERS`). No speaker needs a cloud seat: a chat's clouds are its copy's, a seat each, in the second PR. Roles are an identity's (`gh:<id>`, `x:<id>`), never a tab's: every tab of an account shows
  the same role, and one account holds one voice lease across every chat (joining another chat's stage leaves the
  first's).
- **Once approved, remembered.** Anyone a host or co-host let on the stage (an approved request, an invite, an open
  stage, co-hosting) may take it again with Join voice for the rest of the chat, after going back to listening or a drop
  of any length, with no new approval. Only **Move to listener** or **Remove from chat** takes that away: then they
  request again (`cleared` in chat-roles.js; the speaker cap still holds).
- **A short drop shows nobody anything.** When a speaker's, co-host's or host's last connection to the chat drops,
  everyone keeps seeing their tile exactly as it was for 5 s (`QUIET_MS`). Past that it stays in its place, dimmed, with
  **Reconnecting…** for its role and no microphone mark, for as long as their place is held: a minute on the stage
  (`STAGE_HOLD_MS`, a co-host's rank too), the host's 1-minute hold for the host, or until a host or co-host moves them
  to listener or removes them. Their place counts against the speaker cap all the while, so the stage never reshuffles.
  Back and speaking again (Ooga Chat does it by itself), their tile carries on where it stood; still gone when the hold
  ends, the roster shows them gone. A microphone that only publishes again after a failed connection (`publish/close`
  with `recover`) keeps the place, rank and tile the same way; Leave voice is the speaker's own word and gives the place
  (and a co-host's rank) up.
- **Mute:** a host or co-host can mute a speaker; only the speaker can unmute themselves (X Spaces' rule). Move to
  listener ends their lease. Remove from chat closes every connection of that account to the chat and keeps it out of
  that chat until a host or co-host allows them back or it ends. **Allow back** (from the Removed list in the
  Requests pop-up) lets them join again as a listener only: no request, invite, rank or place on the stage returns.

## Requests

- A listener's footer reads **Request to speak** where it read Join voice; pressed, it reads **Requested · Cancel**.
  A requester's tile carries a small microphone badge. The raised hand keeps its meaning for speakers only.
- The host and co-hosts see a **Requests** bell with its count in the chat's bar; it drops the queue from the bar over
  the top of the live view (never pushing the view or the roster, and scrolling itself past what the panel has room
  for), oldest first, each row with Approve and Decline, and under it everyone removed from the chat with Allow back. A tile's menu (press a tile, or Enter on the focused tile) offers what the viewer's role allows:
  Invite to speak (Approve request to speak and Decline request for someone who asked), Mute, Move to listener, Make co-host (dimmed with "All 3 co-host slots are taken" while every slot is
  held), Withdraw co-host invitation, Make speaker (a co-host on stage; Make listener off it), Make host, Remove from chat.
  A tile holding an offer carries an outlined star on a purple badge and reads "invited to co-host" (one asking an amber microphone badge, one invited to speak a green one). The person offered gets a card, **The
  host invited you to co-host** (**You left the stage. Rejoin as co-host?** when it came back), with Accept and Not now.
- **Approve, or invite** a listener directly: the listener gets an invite card, **A host invited you to speak**, with
  Start speaking and Not now. Start speaking asks for the microphone (inside the press, as Safari needs) and puts them
  on stage muted. Nobody is put on stage without their own press. An invite lapses after 60 s, and the person goes back
  to listening with no request.
- **Decline:** the request goes; the person may ask again after 60 s. Cancel takes a request back at any time.
- One request an identity a chat; the queue holds at most 50 a chat (a full queue refuses, retryable).
- **Open stage**: the host (alone) can switch it on at the top of the Requests pop-up ("Open stage: anyone who asks may
  speak"); everyone sees an Open stage tag beside the chat's title while it is on, and on the island Request to speak
  reads Speak now. While it is on, every request is approved the
  moment it is made, as an invite, and switching it on approves everyone waiting. Removed accounts stay out and the
  speaker cap still holds.
- **Preview and joining as either**: a chat in the Chats list opens a preview pop-up of its stage (the host, co-hosts
  and speakers, as the chat orders them), how many listen and wait, and whether its stage is open, with **Join as
  listener** and **Ask to speak** (**Join as speaker** on an open stage). Asking joins and asks at once; on an open stage that press goes
  straight on to Start speaking (it is the person's own press), and otherwise they wait in the queue as any asker.

## The host leaving

The host role is held 1 minute after the host's last connection to the chat goes, for a reconnect. After that the
longest-serving co-host becomes host; with no co-host, the chat ends.

A connection can go without a word: a phone put in airplane mode sends no close, and the runtime may take minutes to
notice. So every page pings its chat's socket every 10 s (and once more as it is shown again), and while anyone holds
the stage (a lease or a rank) the chat's alarm wakes every 15 s and takes a connection silent for 45 s, not even a ping,
for gone (`audience.js` `SILENT_MS`, `SWEEP_MS`, `sweepSilent`; closed 4408). A drop noticed late, by the sweep or by the
runtime, counts from when the connection was last heard (`LATE_MS`): the reconnecting mark, a speaker's held place and
the host's minute runs from the last ping, not from the moment it was seen, so a host who drops silently is handed
over about a minute after they went quiet. The 45 s allows for pages from before the 10 s ping, still pinging every
30 s; it can come down to 25 s once those are gone. While nobody holds the stage the alarm does not wake for this. The host may hand over to a co-host or End chat
at any time. When a chat ends, everyone in it sees **The chat ended**, its voice closes, and it leaves the list.

## Where each control lives

**OC** (`src/ooga-chat/`): the Ooga Chat tab opens on the **Chats** list (title, zone tag in the row's top right corner, short as every chat's land tag is: Main, DSB or Voice, its whole name its `title`, a title too long for the room left ending in "…", the host's portrait, how
many speak and listen), with **Start a chat** for a contributor: one dialog with a title (prefilled "<name>'s chat",
editable, at most 60 characters, checked by the island's chat policy) and three picture cards to choose the land: **Voice
only** first (chosen first in Ooga Chat), Main Island and DSB Land. Voice only is a chat with no land (zone `none`: Ooga Chat voice alone, never a
copy, clouds or Go there), then Start chat (the one amber action) or Cancel. The island's panel opens the
same dialog with the zone the visitor's Ooga stands in chosen first. A chat opens the panel the app has today (`audience-tiles.js` roster, the emoji bar,
the footer) with a Back to chats control, the Requests bell for a host or co-host (in the chat's bar, left of Share; the chat's land tag stands in the live
view's top right corner beside its fold button), a role badge on host and co-host
tiles, and the footer's Request to speak or, for a host, End chat beside Leave chat.

**Back to chats keeps the chat.** It shows the list over the chat, which goes on playing, its voice and the visitor's
place in it untouched: the chat leads the list in Ooga Chat's purple, "You're in this chat · hosting / co-hosting / speaking /
listening", and pressing it goes back in. Another chat pressed meanwhile opens its preview with one short line saying
what joining does to the one the visitor is in, by their role there ("Joining leaves <title>.", "You're on stage in
<title>. Joining leaves it.", "You co-host <title>. Joining ends that."); Join as listener or Ask to speak leaves it and
joins, Stay changes nothing. Its host instead ("You host <title>. Hand it to a co-host or end it first.") gets "Make
<name> host and join" for each co-host (one reconnecting dimmed) and "End chat and join", and no way in without
stepping down. Only Leave chat, End chat or choosing another chat leaves one.

A host steps down only by handing the chat over or ending it. While hosting they stay on the stage (Mute, no Leave
Voice, in the chat's footer and in Ooga Chat's account rows alike), and the island's own Join voice, which otherwise
leaves a chat for the island's voice, only says so in a toast. Leave chat opens **Choose who hosts
the chat after you leave**: one button a co-host, "Make <name> host and leave", connected co-hosts first, the
longest-serving of them amber, and Cancel; the chat is handed over (`handover`) and only then left. A co-host whose
connection dropped stays listed but dimmed, "Reconnecting…" under it, since handed the chat they would leave it with no
host there; the picker follows them as they drop or come back, and with every co-host reconnecting it says to wait for
them or end the chat. With no co-host Leave chat does not show, and End chat is the way out. A host's dropped connection
still waits a minute and passes to a co-host, as below.

**OBL** (`src/js/cloud-panel.js`): the same Chats list and chat view in the sheet's cloud tab, through the same shared
modules, so the two apps never drift. Joining a chat by voice there is like taking a call: the island's proximity voice
pauses until the visitor leaves the chat, with no mark over their Ooga (the room's `call-v1`, which keeps their island
voice quiet and their nameplate's voice mark off: the page sends `{ t: "call", on }`, every page hears `call { id, on }`
and finds `call: true` on such a player in `welcome` and `join`). Online Oogas lists island players by zone, and after
every zone's group, **In Ooga Chat**: every live hosted chat with how many speak and listen in it (below).
The same holds across devices: a chat tells the island room when a GitHub account takes or leaves its stage
(`chatVoice`, kept in the room's storage as `chatVoices`). The room ends that account's island voice (`voice-moved`,
whose toast says Ooga Chat took it), marks its Ooga in a call on every page, and tells its island page its voice is
elsewhere (`voice-elsewhere`, unless that page is itself in the chat), whose Switch here takes it back: island voice
going live while a chat holds the stage ends the lease there (`yieldVoice`), so one account has one voice either way. A Main Island chat's island view carries **Go
there** for a speaker: on the island it takes the visitor's Ooga into the chat's copy of its zone; in Ooga Chat it opens
the same chat on the island (below). In a chat the island's panel has the chat's own emoji bar
(`#cloud-chat-reactions`, reaction-bar.js over the chat's socket, as Ooga Chat's footer has it), in place of the room's.
Every island tab but Bananas keeps the voice footer, its buttons over a line with the visitor's name and Sign out (in a
chat too, and in Ooga Chat's app alike), the name's dot the same in every panel: green on the island, purple in Ooga
Chat's app: before a chat is chosen the Ooga Chat tab's buttons are the island's own voice
(Unmute, Join voice or Leave voice), as every other tab's account row is (chat-hosts.js `pageVoice`, cloud-panel.js); in
a chat every tab's buttons are the chat's (its microphone, Join voice or Leave voice on its stage, End chat for its host
or Leave chat), so Unmute in any tab mutes the voice the visitor is in (hud.js `showAccount`). Sign out asks a host first,
in the panel pressed from (`signOutFrom`): a co-host takes the chat over in about a minute, or with none it ends then,
unless they sign back in. A speaker who signs out (or reloads) and rejoins the same chat as the same account within that
minute speaks again by themselves, muted or live as they were: the tab keeps the chat, the account and the microphone's
mute in sessionStorage (`ooga-chat-voice-back`), stamped as the page signs out or goes, and Leave voice, Leave chat, End
chat, being moved to listener or removed, or the chat ending forget it.

**Who the island sees in chats.** Each chat tells the island room its title and counts as they change (the Room's RPC
`chatMembers(chat, title, speakers, listeners, ids, people)`, from `reportMembers` in `audience.js`, `summaryOf`): how many of
its rows, a quiet hold's included, speak (its host and co-hosts always, on the stage or not, as its preview and the
Chats list count them; `tally`) and how many listen, and which accounts are there through Ooga Chat's app by id
(`ids`, every one the chat's limits let in: a row whose connections are none of them the island page's own `ob_` principal, `via` "app"),
and by name (`people`: `{ id, login, display, speaking }`, speakers first, at most `PEOPLE_MAX`, 200), so Online Oogas
can list them (the maintainer's ask, 2026-11-25, in place of the earlier rule that no page gets a name). A report goes at most every 2 s a chat, one in flight, a one-shot timer sending a burst's last change and nothing
while the counts are what the room was told; a report that fails goes again with the next change. As the chat ends it
sends zeros, kept in its storage (`membersGone`) and sent again from its alarm until the room takes them. The room
(`room-chat-members.js`) keeps each chat's title, counts, app ids and their names, and nothing else, in memory and in storage (`chatMembers`,
so a hibernation wake keeps them; an entry stored with names by an earlier version keeps only its counts), replaces
them on each report and drops the chat when nobody is in it, and at the sweep it already runs while players are
connected drops any chat the directory no longer lists, adding no timer. Pages hear it only where the welcome lists
`chat-summary-v1` (on with the `chats` switch, beside `call-v1`): the welcome carries every chat's (`chatSummaries`)
and each change goes to every page as `{ t: "chat-summary", chat, title, speakers, listeners }`, all zero when it
ends. The room also works out one number, how many are in chats through the app and not on the
island, each account once however many chats it is in, again whenever a chat reports or a player joins or leaves, and
sends it when it moves (`{ t: "chat-online", n }`, the welcome's `chatOnline`; relayed to an Ooga Chat member with `mine`, the welcome's `chatMine`, whether its own account is among the number), and the names behind it: every account in
chats through the app and not on the island, each once, speaking if it speaks in any chat, by name, at most 200
(`{ t: "chat-people", people: [{ id, login, display, speaking }] }`, the welcome's `chatPeople`, relayed to Ooga Chat's
members too), sent when the list changes. Online Oogas on the island (`players.js`) and in Ooga Chat
(`ooga-chat-panels.js`) list each under **Ooga Chat** with Ooga Chat's purple dot, after the visitor's own row there;
anyone listed already (a player, a linked partner, a speaker on a cloud) is listed once. The page (`net.js` `state.chatMembers`,
chat id to a frozen `{ title, speakers, listeners }`, and `state.chatOnline`, emptied with the socket) lists in In Ooga Chat one button a chat (`players.js`): its title, whole and wrapping, and its counts under
it ("3 speaking · 12 listening", a count of nobody left out: "1 speaking" while nobody listens; a chat always has its
host as a speaker), "You're in
this chat" on the one the visitor is in, busiest first and then by title. Every "N online" on the island adds the room's
number (`cloud-panel.js` `inChats`), so nobody is counted twice. A chat pressed
(`cloud-panel.js` `preview`) asks the live list (`/api/chats`), says **That chat has ended** if it is no longer listed,
and otherwise opens the chat's preview, the same pop-up the Chats list opens (`chat-hosts.js` `preview`, standing in
the page's body while the Ooga Chat tab is hidden): its stage, its counts, the Open stage tag, **Join as listener** and
**Ask to speak** (**Join as speaker** on an open stage), either of which shows the Ooga Chat tab and opens the chat there. The chat the visitor is in
already only shows the tab. A host is never asked to join their own chat: it leads the list as **Hosted by you** (amber, with
no Start a chat beside it while it lasts), and pressing it, there or in Online Oogas, goes straight back onto the stage
as host, with no preview; a co-host on its stage sees one button, **Rejoin as co-host**, and no Join as listener. A visitor already in another chat is asked first, **Change chats?** (a modal dialog:
"You're in <title>. Leave it and join <title>?"), **Switch chats** leaving that chat and opening this one, **Stay**
changing nothing and giving the chat's row the focus back. Its host is told instead to hand the chat over with Leave
chat, or end it, first, and offered only Stay.

**Clouds belong to the copies.** OC speakers are never seen or heard over the real island any more: a chat's speakers
sit on clouds only inside that chat's own copy of its zone (the second PR), one seat each, however many chats share a
zone.

**Switched off by the first PR, deleted later:** the outdoor voice bridge (`outdoor-voice.js`, the Room's
`outdoor-voice-v1`, `outdoor-policy.js`, the island's overhearing) and the clouds over the real island
(`cloud-seats-v1`) stay in the code with their switches off (the island's `outdoor`, `cloud` and `commons`-free
`OOGA_CHAT_FEATURES`, the edge's `cloud`), and are removed in a follow-up once hosted chats are live. Clouds come back
in the second PR inside each chat's copy.

## Notifications

| Event | Who | What |
|---|---|---|
| a request arrives | host and co-hosts | the Requests bell's count, the cloud tab's unread badge (`sheet.setBadge`) while the panel is not watched, a toast "bea asked to speak" (at most one every 5 s, joined into "bea and 2 others asked to speak"), a soft chime once a burst |
| approved or invited | the requester | the invite card and a toast; a chime |
| declined | the requester | the footer goes back to Request to speak; a quiet note "Your request wasn't accepted" |
| muted by a host | the speaker | a toast "A host muted you" |
| moved to listening | the speaker | a toast "A host moved you to listening" |
| offered co-hosting | that person | the co-host card, focused |
| accepted or turned down co-hosting | hosts and co-hosts; the host | "bea is co-host now"; "bea said not now to co-hosting" |
| offer withdrawn, or co-host taken back | that person | "The host withdrew the co-host invitation"; "You're no longer a co-host" |
| host handed over | everyone | the badge moves; a toast for the new host |
| removed from the chat | that person | "A host removed you from this chat", back to the list |
| the chat ended | everyone in it | "The chat ended", back to the list |

Screen readers hear every one of these through one polite live region a panel; nothing is announced twice across the
toast and the region.

## Accessibility and phones

- The Chats list is a list of buttons. The roster keeps its one tab stop and arrow keys; Enter or Space on a focused
  tile opens its menu, the arrows move in it, Escape closes it and focus returns to the tile.
- The queue is a list whose rows each have two named buttons ("Approve bea", "Decline bea").
- The invite card takes focus when it opens (it is the one thing waiting on the person) and closes on Not now or
  Escape.
- Under 400 px the tile menu and the queue open as sheets from the panel's foot, 44 px controls.
- Every pop-up follows AGENTS.md's look (wood frame, words on slabs, one amber action) and joins `pad-focus.js`.

## Server

- **One Durable Object a chat.** The `Audience` class, today one object named `audience` for both zones, becomes one
  object a chat, named `chat:<id>` (`<id>` a random 16-character token). It keeps its sockets, roster model, leases,
  media broker, reactions and limits, and gains the roles, the queue and invites. The `audience` singleton goes unused.
- **One directory.** A new class `ChatDirectory` (`worker/src/chat-directory.js`, migration `v6`, binding `CHATS`),
  one object named `chats`: the live chats (id, title, zone, host, counts), at most 20 at once (`CHATS_MAX`), one a
  host, a start a host every 5 minutes (`START_GAP_MS`). A chat tells it its counts and host whenever they change
  (`update`) and when it ends (`end`). It also keeps which chat each account last took the stage in (`claim`,
  `release`): taking the stage in another chat ends the lease in that one (`yieldVoice`), so one account has one
  voice. It runs no timer.
- **Switches.** The island's `OOGA_CHAT_FEATURES` names `chats` (`bridgeFeatures(env).chats`): by itself it turns on
  the island's own routes, and with `bridge` the bridge's. The edge's `FEATURES` names `chats` too
  (`effective(...).chats`, which also needs `listen`); its bootstrap then lists `features.chats`, `paths.chats`
  (`/api/chat/chats`) and audience protocol 2 in `protocols.audience`.
  `copies`, with `chats`, turns on each Main Island chat's copy (`/api/chats/<id>/world`, `travel-v1`, Go there); it is
  the island's alone, and both configs deploy it on with `chats`.

### Routes

| | Ooga Chat (edge, `worker/chat/src/chats.js`) | The island (`worker/src/chats.js`) |
|---|---|---|
| live chats | `GET /api/chat/chats` → `{ chats }` | `GET /api/chats` → `{ chats }` |
| (zones) | `main`, `dsb`, or `none` for a chat with no land | the same |
| a chat's preview | `GET /api/chat/chats?chat=<id>` | `GET /api/chats/<id>` |
| start one | `POST /api/chat/chats` `{ title, zone }` → `201 { chat }` | `POST /api/chats` `{ title, zone }` → `201 { chat }` |
| a chat's socket | `GET /api/chat/audience?chat=<id>` | `GET /api/chats/<id>/live` |
| its media | `POST /api/chat/media/<op>?chat=<id>` | `POST /api/chats/<id>/media/<op>` |

Both need a session. A list entry is `{ id, title, zone, host: { login, display, character }, startedAt, speakers,
listeners, open }`, never an account id, busiest first then newest; a preview is `{ chat, stage, listeners, requests }`,
`stage` the host, co-hosts and speakers as rows (no request or `self`); the island's is read through a 2 s edge cache. Starting
one needs a GitHub account the island's contributor rule calls eligible (every island account is); refusals are
`bad_title` (the island's chat policy, at most 60 characters), `zone_unavailable`, `already_hosting` (409),
`rate_limited` and `chats_full` (with `retryAfter`), `capability_required` (403). A chat id is 16 characters of
base64url. A socket or media call for a chat the directory doesn't list never reaches an object: the edge closes the
socket with 4404 and the island answers 404. The island hands a chat its own principal, `ob_<GitHub id>`, with the
account's Ooga, and no avatar (an Ooga Chat avatar is that origin's alone; the island draws the Ooga's face).

### The chat's socket (audience protocol 2)

Everything audience protocol 1 has (docs/ooga-chat-app.md), with these differences.

- **Join** is `{ "type": "join", "protocol": 2 }`. A chat with no land (`chat.zone` `none`) keeps its roster in the
  `main` zone, which is the zone its frames name. The zone is the chat's own; a `zone` naming another is refused
  (`error`, `zone_unavailable`). Protocol 1 on a chat closes it with 4426.
- **Snapshot** carries `chat: { id, title, zone, startedAt, host, cohosts, offers, open }` (`offers`: who holds an
  open co-host offer) (the host's and co-hosts' participant
  ids, and whether the stage is open); `{ type: "chat", chat }` sends it again to everyone whenever the host, co-hosts or
  the open stage change. An `invited` notice from an open stage carries `open: true`.
- **Rows** carry `rank` (`host` or `cohost`, absent for everyone else) with `rankSince` (ms, when a co-host was made
  one) and, while one is open, `request` (`asked` or `invited`) with `askedAt` (ms; the queue's order, oldest first).
  `since` (ms) is when a speaker took the stage, or when a listener's earliest connection joined; `via` is `island` or
  `app`, the app they listen or speak from (an island page's `ob_` principal, else Ooga Chat).
- **Order** in a chat, in both apps: the host first, then co-hosts, the longest-serving first (`rankSince`), then
  speakers, the longest on stage first (`since`), then listeners with an open request, the longest-lived request first
  (`askedAt`; an invited listener at the head of the rest), then the other listeners, the longest here first (`since`);
  ties by name, then id. A speaker's ring says where their Ooga is in the chat's world: green while it walks the chat's
  copy of the zone (the second PR), purple while they sit on a cloud, whichever app they speak from. Until the copies
  exist every chat speaker is purple. Listeners carry no mark. `via` stays in the rows for the server's own use. A host's or co-host's rank does not make them a
  speaker: `role` is still `speaker` only under an active lease.
- **You** adds `rank` (`host`, `cohost` or `""`), `request` (`asked`, `invited` or `""`) and, while invited,
  `inviteUntil` (ms). `speak` is `eligible` exactly when the visitor may take a lease now (a rank, a live invite, or a
  place on the stage), so the app's Join voice flow is unchanged: Start speaking on the invite card is Join voice.
- **Requests**, each `{ type, requestId, ... }` answered by `{ type: "result", requestId, ok, error?: { code,
  retryable, retryAfter? }, you }`:

  | type | fields | who |
  |---|---|---|
  | `ask` | | a listener: Request to speak |
  | `cancel` | | the asker: Cancel |
  | `decline` | | the invited: Not now |
  | `invite` | `id` | a host or co-host, to anyone they outrank who isn't on the stage |
  | `answer` | `id`, `approve` (boolean) | a host or co-host, to an open request: approve is an invite |
  | `mute` | `id` | a host or co-host, to a speaker they outrank |
  | `demote` | `id` | Move to listener, the same |
  | `cohost` | `id`, `on` (boolean) | the host alone: on offers co-hosting; off withdraws an offer, or makes a co-host a plain speaker |
  | `cohostAnswer` | `accept` (boolean) | the person offered co-hosting: Accept (a co-host, on stage at once) or Not now |
  | `handover` | `id` (a co-host) | the host alone |
  | `remove` | `id` | a host or co-host, to anyone they outrank |
  | `allow` | `id` | a host or co-host, to someone removed: Allow back |
  | `open` | `on` (boolean) | the host alone: an open stage |
  | `end` | | the host alone |

  `setRole`, `setMic`, `reaction` and `hand` are protocol 1's. Refusal codes: `not_host`, `not_allowed`,
  `already_allowed`, `not_asked`, `not_speaking`, `cooldown`, `rate_limited`, `queue_full`, `cohosts_full`, `removed`,
  `ended`, `malformed`; `setRole` speaker without leave is `not_allowed`. A speaker a host muted may unmute themselves
  with `setMic`; until then their voice is not pulled by anyone.
- **Notices**, `{ type: "notice", kind, id?, by?, until?, reason? }`, to whom they concern:

  | kind | to | means |
  |---|---|---|
  | `asked` | hosts and co-hosts | `id` asked to speak |
  | `not_now` | hosts and co-hosts | `id` turned an invite down |
  | `invited` | the invited | `by` invited them; good `until` |
  | `declined` | the asker | `by` declined their request |
  | `expired` | the invited | their invite lapsed |
  | `muted` | the speaker | `by` muted them: the page mutes its microphone |
  | `demoted` | the speaker | `by` moved them to listening (their lease has ended) |
  | `cohost_offer` | that person | `by` offered them co-hosting (`again` when it came back as they left the stage) |
  | `cohost_retracted` | that person | `by` withdrew the offer |
  | `cohost` | hosts and co-hosts | `id` accepted and is a co-host |
  | `cohost_declined` | the host | `id` turned the offer down |
  | `uncohost` | that person | `by` made them a plain speaker |
  | `host` | everyone | `id` is the host now (`by` the old host on a handover) |
  | `removed` | that person | `by` removed them; the socket then closes with 4403 |
  | `ended` | everyone | the chat ended (`reason` `ended` or `host_left`); every socket then closes with 4404 |

- **Removed list**, `{ type: "removed", list: [{ id, at, login, display }] }`, earliest first, to hosts and co-hosts
  alone: after their snapshot, whenever it changes, and to anyone who becomes host or co-host. Refusal `not_removed`.
- **Close codes** add 4403 (removed: don't reconnect, back to the list) and 4404 (ended or unknown: back to the list).

- **Pure model.** The rules live in `worker/src/chat-roles.js`, pure and allocation-light
  (`worker/test/chat-roles.test.mjs`), and the objects are checked through a fake host
  (`worker/test/ooga-chat-hosts.test.mjs`): every rule in this file (who may do what to whom, the caps, the queue, invites,
  cooldowns, the host hold and succession, removal, one lease an identity).
- **No idle timers.** A chat's alarm is set only for the earliest of a held host's minute, a held place on the stage,
  a quiet hold's 5 s and its end, an invite's 60 s, a pending lease, a re-authentication, or a word the island room has yet to take
  (kept and retried even after the chat ends, the one thing an ended chat keeps until it is delivered); an empty chat with nothing pending sets none and hibernates. Roles, queue,
  invites and removals are stored (they are small), and the sockets' attachments carry each connection, so a woken
  chat carries on at the same revision.
- **Limits.** Control actions share the socket's existing bucket (10 a second, burst 20); a request at most once every
  10 s an identity, 60 s after a decline; one chat started an account every 5 minutes; a title through the island's
  `chat-policy.js`.

## Open for the second PR

Agreed 2026-11-23:

- **What a copy carries:** the main island's open air as it is (scenery, the banana pile, the clouds), HQ and its
  basement down its open ramps, and the chat's members' Oogas, nothing else: no NPC crew or gorillas, every other cave
  mouth and door sealed in stone (the OBL cave's mirror, the signs over the sealed mouths, everything outside the caves
  (banners, lanterns, lamp strings, the lab's dice and chalkboard and the like), ₿IFRÖST's arch, the plaza's library (the hill it was cut into standing whole
  again: scene-hub.js `libraryPlugNode`), the Oogatron, the islets at sea and the gulls and sails taken down),
  no games, and none of the other islands or their bridges (the Mempool island, Merge Rock, the Timechain Sphere's islet,
  ₿IFRÖST's islet), so a walker off a bridgehead falls to the water and comes back beside the pile.
- **Who goes:** speakers alone (the host, co-hosts and invited speakers) who are signed into the island with an Ooga.
  Listeners stay where they are and listen.
- **Getting there and back:** Go there in the chat beams the Ooga out of the main world in the island's green glyph
  stream and into the copy beside the banana pile; Go back beams it back to exactly where it stood, as does leaving the
  stage or the chat.
- **Size:** up to 32 Oogas, the speaker cap, and the island room's own.
- **Voice in a chat has no place in it.** Every speaker in a chat is heard at full by everyone in it, wherever their
  Ooga stands in the copy: no level or crossing blending (voice-blend.js) and no hearing range, which stay the main
  land's alone. A chat's voice is the chat's own media (Ooga Chat's controller, chat-call.js on the island), never the
  island's voice.js; the copy carries no voice and ignores the island's `blend` frames.
- **The copy's server** is the island's own `Room` class in a copy mode, one object a chat (`chat:<id>`), with
  everything island-only off (NPCs, games, chalk, the World Map's report, island voice, the text chat) and a check
  pinning what a copy offers. Only the chat's current speakers are admitted, and leaving the stage, removal or the end
  sends them home.
- **Main Island first:** Go there is off for DSB Land chats until DSB Land's copy (an arrival spot and clouds in its
  sky) lands in a later PR; they work as voice chats meanwhile.
- **The live island view** uses the game's own renderer and models, loaded only when someone turns Live view on.
- **Ooga Chat's first-load limit** may rise to 256 KB gzipped.
- **Cloud seats:** today's three-seat bench on 11 of the 18 clouds (33 seats for the 32 speakers), all on the high
  track so none flies under the meadow, filled a bench at a time so a small chat looks like today's island, each bench's
  middle seat first and then its sides, each side seat centred in its own third of the bench; a cloud with nobody on it
  shows no bench.
- **Clouds:** every speaker not walking the copy sits on a cloud in it, a seat each, 32 seats: Ooga Chat's, and the
  island's whose Ooga is still on the main land. A speaker with no Ooga of their own (an X account, or a GitHub account
  with no character) sits there as a default Ooga hashed from their handle, under a name no login can have (as
  `kortik/factory` is), so it never borrows a real contributor's look; their ring is purple as every cloud speaker's is.

**The island view** (agreed 2026-11-22, built in the second PR; shown always since 2026-11-25): at the top of every Main
Island chat, for every OC speaker and listener tuned into it, a zoomed-out view of the chat's copy of its zone: the
island standing still while nobody walks it, and each speaker walking the copy with their Ooga where they stand. By default a drawn map: a baked overhead picture of the zone with each such
speaker's Ooga face where they stand, pulsing while they talk, from positions the chat relays a couple of times a second.
Speakers alone are drawn, never listeners. An opt-in **Live view**, off by default and remembered per viewer, is a camera feed as
the Observatory's screens are (`observatory-cameras.js`): a fixed camera far out over the copy, its feed rendered into a
texture at a capped rate and shown as a screen, of a reduced graph of the zone (terrain and landmarks, no NPCs or
interactions, as `observatory-bifrost.js` and its siblings build theirs) with the speakers' bodies stood from the poses
the chat relays (`observatory-visitors.js`). It is drawn in the viewer's own browser: no player's page captures or
uploads video. The first PR leaves room for it at the top of the chat panel.

As built (`src/js/island-view.js`, drawn by the shared views, chat-hosts.js, in `.hc-room-strip` in both apps):

- **The strip** shows in every Main Island chat (none in a Voice only or DSB Land chat, which have no picture yet). While
  nobody walks the chat's island it is the island standing still, drawn once and again only when its size or picture
  changes. A line for screen readers alone says who walks it and who sits on the clouds over it (every speaker not walking it: "Bea is
  on a cloud over the island"), or that the chat waits for its speakers. In a short panel (the island's sheet) it gives
  way first, down to a 96px stage, so a row of the roster, the emoji bar and the footer stay in sight.
- **Go there**, in the stage's lower left corner in the view's own dark glass, worded by the chat's land
  (`chatHosts.joinWords`: Join on island for Main Island, one entry a land), for a speaker (`goThere`): on the island
  the Ooga onto the chat's island and back (chat-copy.js); in Ooga Chat, for a GitHub account, the same chat opened on
  the island in the same tab (`ooga-chat-hosts.js`; the bootstrap's `island`, the edge's `ISLAND_ORIGIN`):
  `/?chat=<id>&mic=<0|1>#handoff=<ticket>`.
- **The chat's bar** (agreed 2026-11-26): dark in Ooga Chat whether or not the view is expanded; the title over a line of
  how many speak and listen; Requests, a host's or co-host's bell with a badge counting who waits, whose pop-up lists
  each request (face, name, a green ✓ and a red ✕) and then who was removed with Allow back; and Share for everyone (the
  platform's own icon), which hands out the page's own `/?chat=<id>` through the system's share sheet or copies it (the
  island opens such a link listening, as above; Ooga Chat keeps it in the tab through a sign-in and opens that chat's
  preview); alone in a chat, the roster offers the same Share under "Just you so far". In Ooga Chat's full screen the
  bar is solid across the view's top, the view under it with its full-screen button lined up under Share, a host's
  Requests panel drops from the bar over the view with a ×, and the split's grabber shows a few seconds as it opens.
  End chat is red and asks first; while in a chat, every list tab's buttons are the chat's own in both apps (the
  microphone, End chat for its host or Leave chat), the name and Sign out staying on their line under them.
  A speaker on the stage first asks the chat for a ticket (`{ type: "handoff" }`, answered `{ ticket }`): the Audience
  mints one for that account alone, keeps it a minute (`HANDOFF_MS`) with whether the microphone was open, and a fresh
  one replaces the last. The ticket rides in the fragment, which no server or log sees. The island page (`chat-call.js`)
  takes the address's parts out at once, keeps the wish in sessionStorage (`ooga-chat-arrive`, five minutes) through a
  sign-in and opens the chat, listening; with a ticket it hands it back (`{ type: "redeem", ticket }`, answered
  `{ mic }`) on a connection of the same account, once and in time, and then, with no card, takes the voice with
  `join({ takeover })`, opens the microphone if it was open there (the chat's word, not the address's) and walks the Ooga
  in once nothing stands in the way (chat-copy.js `goSoon`). A browser that holds sound until a tap plays the chat on the
  first tap or key (ooga-chat-media.js `blocked`). A ticket whose answer does not come within six seconds, or whose
  socket drops or reconnects meanwhile, is spent all the same, and the card asks instead (`REDEEM_MS`). Without a ticket (a listener, an older chat, no answer within 2.5 s)
  or with one the chat refuses, the link is one anyone could post, so it never speaks by itself: a visitor who may speak
  there is asked first (voice-handoff.js's card, "Speak from here?", saying whether the microphone will be on), and only
  Switch here, a press on the island page, takes the voice (inside the press, the gesture a microphone needs), unmuting
  when the address said it was open there. Not now leaves the visitor listening. The Audience takes the move as a
  `handoff`: the account's place on the stage, and a co-host's rank, stay with it. The host is still the host: roles
  belong to the account.
- **Folding it away.** A button in the chat's title (a framed island, lit while the view is open) folds the view away,
  the roster taking its place, and brings it back, this browser's choice (localStorage `ooga-island-view-folded`);
  folded, nothing is drawn, the 3D view is not fetched and no places are asked for. Open, the view meets the roster with
  no gap.
- **Asking for places.** A chat member's socket asks with `{ type: "view", on: true, hz }` only while the chat has a
  speaker (walking the copy, a row with `walking`, or sitting on its clouds), the strip shows, the panel is shown and the page is visible and the view is not folded, and says `on: false` as any of that
  ends; a new connection asks again. `hz` is how many places a second the viewer can take (`WALK_RATES`: 2, or 4 and 6
  for a 3D view whose scenery tier is `lite` or `full`, island-view.js `hz`; the Audience holds anyone but a GitHub
  contributor, its `eligible`, to 2, as it does one whose standing is revoked). Only then does the Audience send `{ type:
  "walk", seq, p: [id, x, y, z, yaw, …] }` (`walk-v1`), to each viewer at its own rate, every rate scaled down together
  past the chat's fan-out budget (`WALK_FANOUT` frames a second); its answer to the copy's `walk` says how often to
  report (`ms`, the fastest viewer's), which the copy keeps within 160 to 500 ms (room-copy.js `WALK_MS_MIN`, `WALK_MS`).
  A frame is read whole or not at all (`parseWalk`); each walker is eased from where it was shown over the time between
  frames, and one missing from a frame leaves. The copy relays places only after a snapshot, so a walker who has not
  moved since a viewer asked shows once they next move.
- **How they look.** The copy also tells the chat how each walker looks, only when that changes (an arrival or
  departure, an equipment save, a pose that changes what is in hand or on the back), one call in flight
  (room-copy.js `looked`): `looks(seq, looks)`, an entry a walker (`gh:<id>`) of their saved equipment's appearance
  (`e`: the hat's `selection` and `size` and the `wardrobe`, what the island's room relays to other players, never the
  record's revision, declined updates or anything else) and what they have out (`w`: 1 the primary in hand, 2 the gun,
  from crew.js `weaponFlags`' hand alone, never the rounds or the aim; `j`: 1 a jetpack worn, never its flame). The
  Audience checks its shape and size (`LOOKS_MAX`), keeps the last (stored, so a woken chat still has it) and sends
  `{ type: "looks", looks }` whole to every connection viewing when it changes, and to a viewer as it starts viewing
  (`view` on). A page checks each piece against its own catalogs as it puts it on; one it does not know is left off.
- **Who sits on the clouds.** The Audience also sends `{ type: "clouds", at, clouds: [{ id, character, seat }, …] }` to
  every connection viewing a Main Island chat whenever the list changes (a speaker joins or leaves the stage, starts or
  stops walking), whether or not anyone walks the copy, and to a viewer as it starts (`cloudsFrame`, `viewClouds`): each
  active speaker not walking, the Ooga they sit as (the copy's `chatClouds`: their character, or a default one hashed
  from a name no login can have) and their seat (main-cloud-1 to 32, the copy's), with `at` its own clock in
  milliseconds. A page reads it whole or not at all (`parseClouds`) and keeps the chat's clock less its own (the largest
  guess, since time on the way only makes the chat look behind), which the 3D view moves the clouds by, so they stand
  where the copy shows them on the island at that moment (both run on the Worker's clock: the copy's page through
  net.js `serverNow`).
- **One view, chosen by the device** (`BL.islandView.capable`, once a page, never toggled): the 3D view where the page
  offers it (Ooga Chat) to a viewer it is offered to (`liveAllowed`: for now a signed-in GitHub contributor, the
  server's word through `BL.oogaChatAuth.gates`, asked again on every update; another GitHub account or an X account
  gets the map) and the device can carry it (WebGL2, `DecompressionStream`, no data saver or reduced data, and no
  report of under 4 GB of memory or 4 cores), else the flat map. The island page keeps the flat map: it is the island
  already.
- **The map.** `scripts/island-view.mjs` (after `npm run build`) bakes it in the suite's Chrome: the built hub at midday
  on day 80 in a chat's copy mode (Main Island alone), its Oogas, gorillas, Tess and clouds left out, straight down
  through an orthographic camera: the inner 512 x 384 frames 96 metres across (the island about four fifths of its
  height), and round it the picture carries 448 more pixels of the same sea each side and 128 above and below (1408 x
  640, `pad`), so a strip of any usual shape shows the ocean itself out to its edges rather than its edges blurred. It
  writes `src/ooga-chat/art/island-view-main.webp` (Ooga Chat's lazy art),
  the same bytes as `src/js/island-view-art.js` (the island page's copy, served as a file under `art/` on a hosted page,
  `PICTURE_MODULES`), and `src/js/island-view-data.js`, the capture camera's world-to-picture matrix (checked against the
  renderer's own projection) and the hub's light at that hour. Faces are the roster's (`rowFace`), else the native Ooga
  face; a talking walker's green ring pulses.
- **The 3D view.** `src/js/island-view-live.js` makes one renderer (gl-renderer.js) on the strip's own canvas, drawing the
  island as a chat's copy shows it from the baked scenery (`src/js/island-scene.js`), as it stands now under the
  viewer's own sky: the hub's solar clock (daylight.js, the viewer's local hour and day, as the island's page reads them;
  sun, moon, stars, the sea and the painted clouds of the copy's clear air, its haze), the hub's lamps and torches
  flickering up over the dusk ramp in their order (each lamp's mode, glow and light baked with it) and the nearest to the
  camera's target taking the tier's point lights at night (32 on High, 20 on Medium), the meadow's fire pit burning (the
  island's voxel flame, blaze.js, in the `live` chunk), the trees, bushes and lawn in the wind. Its Oogas are the cast
  as the island has it now: before the first is built, Ooga Chat asks its edge for the island's published character
  catalog (`/api/chat/public/characters/catalog`, the island's `/api/characters/catalog` passed through the bridge's
  `/catalog`), checks it as the island does and applies it to the bundled cast against the baseline its build bundled
  (`BL.oogaChatCharacterBaseline`, ooga-chat-catalog.js); anything amiss keeps the bundled cast. An Ooga let go of or
  dressed anew gives its meshes back to the GPU on the next frame. The copy's eighteen
  clouds go round on their tracks as the copy deals them (eleven bench clouds on the high track, the rest low, swinging
  between the bridges; `cloudAt` is the hub's `placeCloud`, which the bake checks to the hair at three moments), by the
  chat's clock (`clouds` frames), and each speaker not walking sits on their seat, three to a bench cloud: their own Ooga
  (characters.js `traitsFor` of the character the chat names) sitting as a cloud speaker sits on the island (legs out
  before it, the fists down on the cloud, empty-handed, its pet away), facing the pile over the seat's purple glow, the
  bench standing only while someone sits on it. Each walker as their own Ooga
  (models.js `caveman` over characters.js `traitsFor`, as the island builds it), swinging its limbs as it walks, its
  pet (a character's own `parts.dog`) beside it moving its legs in the companions' gait (models.js `poseQuadruped`),
  under the baked light. Each is dressed from the chat's `looks` as other players see it: its hat and wardrobe (the pet's
  size among it) put on by the island's own character-equipment.js and character-wardrobe.js, its primary in its hand or
  the gun held before it with both arms raised to it, and a jetpack on its back (its own, or the island's from
  hub-models.js). The live chunk carries the hat and wardrobe catalogs and those modules (about 32 KB gzipped); the hats'
  geometry (`hats`, about 103 KB), the wardrobe's pieces (`wardrobe`, about 115 KB) and the island's props for a jetpack
  (`gear`, about 36 KB) are chunks of their own, each fetched only once a walker first wears something that needs it
  (`OPT_IN`, never prefetched). It does not pose a weapon as the island's crew does (no slung weapons, aiming, recoil
  or reloads), walk the pet at its heel or fly it, or light the jetpack's flame; a walker's gait is its own simple swing
  (the crew's `poseGait` needs crew.js), a seated speaker is not dressed (the chat's `looks` are the walkers'), and the
  banana pile stands as baked (Ooga Chat does not follow the pile's level, and pile.js needs the island's terrain). Over each speaker's head, on the
  2D canvas above it, stands their name as the island draws other players' (remote-players.js `drawNames`): bold mono
  with a dark edge, a dot before it (green walking the chat's island, purple on a cloud) and the voice mark after it
  (red muted, green speaking), a plate that would cover another moved above it. The plates follow the view's size, full
  size from a view of about 600 by 600 pixels up and down to half that on the smallest strip, the dot and the voice mark
  with the name; the flat map keeps their faces. While it loads the stage stays black with a turning ring in its middle (`data-wait`): nothing of
  the map or a bare canvas shows first; the map shows only where the 3D view can't load. A drag turns the island, a two-finger, right or Shift drag pans it, the wheel or a pinch zooms, held to the
  island and above the sea, and Reset view puts it back. `scripts/island-scene.mjs` (after `npm run build`) bakes the
  scenery from the built hub in copy mode: every node still drawn but pictures, glass, clipped and projected surfaces,
  lines, birds, boats, characters, a fire's flame (kept as where it burns) and the faces of a once-used model buried
  in rock (HQ, its basement, the caves' insides: a face is left out only where rock stands both over and under the air
  beside it, so the island's underside and outer walls stay whole), sorted into layers (`base`: the ground, the pile and the paths, their 25,000-odd tiles baked as one
  road mesh already cut to their outline as the renderer cuts each tile, full tiles merged along their rows; `sky`: the
  copy's clouds plain and benched, each bench's seats and the glow under each, and the deal, with no places; `props`;
  `grass`, the lawn's 300 tufts; `trees` and `trees-medium`, the trees whole and at their medium detail; `details`, what
  is under a metre across; any instanced batch that holds still over a second and a half, the altar's rings, a place an
  instance). Each layer keeps the hub's own models, each once with its normals, smooth shading, block detail, shadow
  casting and wind (sway and swing), and every place one stands, so the renderer draws them as the island does (a
  model's copies one instanced draw), and as its meta (JSON after the places) the hub's lamps whose glow stands in it
  (in `props` too those that only light: a fire's, a dressing light's), any other place's glow that is not 1 (the road's
  256, every neighbour set), the fires and the clouds' deal; gzipped into `src/ooga-chat/art/island-scene-<layer>.bin.gz`. Ooga Chat stages them
  under `scene/<hash>/` (scripts/ooga-chat.mjs, cached immutable, never in the service worker's shell). A viewer fetches
  the base layer first, and its speed with the device's memory sets the tier (`tierFor`): `full` (8 Mb/s and 8 GB: every
  layer, trees whole, about 2.65 MB in all, drawn at the renderer's High tier), `lite` (2 Mb/s and 4 GB: props, the lawn
  and the medium trees, about 2.59 MB, Medium tier) or `base` (the ground, the pile, the paths and the clouds alone,
  about 1.33 MB, Low tier, with no lamps or fire).
  It draws only while the strip shows and can be seen: on the full tier every frame (its sky, clouds, wind and fire
  alive), on lite thirty times a second, on base every five seconds and whenever something changed (the camera, a
  walker, the size), each as often as the device keeps up (a sixtieth of a second at best, a sixth at worst, from how
  long its frames take). `live.pin({ hour, day, time })` pins its clock for a check. Ooga Chat fetches it with the renderer as its own `live` chunk only for a device it is
  chosen for (never prefetched and never in the service worker's shell, `OPT_IN`).
- **Full screen** (Ooga Chat): a button on the view lays it over the page in a layer of its own with the app's column
  beside it (under it on a screen taller than it is wide), in the browser's own full screen where there is one; the
  button again, or Escape, puts it back in the strip. The view runs to the screen's edges with no border, and the chat's
  panel meets it with no gap: as tall as it side by side, its roster of faces across the panel's whole width from the
  seam. The app's tabs are hidden, and the chat's title line (Back and the title, a host's Requests) floats over the
  view's top left corner with no plate, where it stood before, the land's tag and the fold button left out. The seam is
  the split: unmarked until a pointer is over it (the resize cursor and a thin purple line along it) or it has the
  keyboard's focus, it is dragged, or moved a twentieth at a time with the arrows, to give the view more or less of the
  screen (`--iv-split`, `--iv-side`; localStorage `ooga-island-view-split`).
- **The view's controls** (Reset view, Full screen) are translucent over the island, Full screen a 24px square tight
  round its icon at every width and in full screen; the fold button in the chat's
  title is a borderless chip with a background of its own. At every width, in both apps, the chat's panel runs the view
  and the roster out to its edges, square and meeting with no gap.
- `?chats=on` (Ooga Chat's fixture) and `?debug=1&chats=fixture` (the island's) mark two of Sample Oak's chat's
  speakers as walking and send their places twice a second while the view asks, and how they look as it starts: Sample
  Oak in a top hat, a shirt and glasses with the gun out, Sample Reed as a character with a pet (a lion cub, grown a
  size), its primary in hand and a jetpack on; and who sits on the clouds: Sample Fern, the speaker not walking, on
  main-cloud-1.
