// A Commons member's name from Ooga Chat: the name field at the top of the app's Commons tab sets the island's own
// display name for that GitHub account (`players.display`, the name the island's Commons, nameplates and roster show),
// exactly as the island's `PATCH /api/me` sets it and under the island's own rules (db.js `sanitizeDisplay`). The edge
// asks only for a principal it found eligible; the island decides again here (chat-capability.js `decideCapability`:
// banned, a login another id holds, or no Ooga is refused), and only while the bridge's `commons` switch is on. An
// account that never signed in on the island gets a player row here marked as never signed in (db.js
// `ensureChatPlayer`), which deleting the Ooga Chat account takes back (chat-bridge.js `revoke`, reason `deleted`).
// Live sockets pick the name up when they join again, as an island page's own do after a rename.

import { BridgeRefusal, bridgeFeatures } from "./chat-bridge-protocol.js";
import { decideCapability, githubAccount } from "./chat-capability.js";
import { ensureChatPlayer, sanitizeDisplay, updateDisplay } from "./db.js";

export const displayOps = ({ contributorFor, now = Date.now }) => ({
  display: {
    run: async (env, envelope) => {
      if (!bridgeFeatures(env).commons) throw new BridgeRefusal("disabled");
      const { id, login } = githubAccount(envelope.principal);
      const display = sanitizeDisplay(envelope.payload && envelope.payload.display);
      if (!display) throw new BridgeRefusal("invalid_display");
      if (!env.DB) throw new BridgeRefusal("unavailable", true);
      const decision = await decideCapability(env, envelope.principal, contributorFor, now);
      if (decision.state === "unknown") throw new BridgeRefusal("unavailable", true);
      if (decision.state !== "eligible") throw new BridgeRefusal("capability_required");
      await ensureChatPlayer(env.DB, { id, login });
      await updateDisplay(env.DB, id, display);
      return { display };
    },
  },
});
