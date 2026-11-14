-- Ooga Chat's own accounts, in its own D1 (docs/ooga-chat-backend.md): nothing here shares a key or a table with the
-- island's database. One principal per provider identity; GitHub and X are never linked, whatever their names say.
-- Times are milliseconds since the epoch, as every Ooga Chat contract carries them.

-- `id` is the opaque public identity the app keys everything on ("pr_" and 22 base64url characters); `provider_user_id`
-- is always text, since an X id outgrows a safe integer. Login, display name and picture are display data, refreshed
-- on each sign-in and never an account key. `avatar_key` changes whenever the picture address does, so a face served
-- at /api/chat/avatar/<id>/<key> is never another principal's or a stale one.
CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'x')),
  provider_user_id TEXT NOT NULL,
  login TEXT NOT NULL,
  display TEXT,
  avatar_url TEXT,
  avatar_key TEXT,
  created_at INTEGER NOT NULL,
  profile_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  banned_at INTEGER,
  UNIQUE (provider, provider_user_id)
);

-- Sessions are kept by the SHA-256 of their token; the token lives only in the visitor's cookie.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_principal ON sessions (principal_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- One sign-in in flight: single-use (deleted as its callback reads it), bound to its provider and to the browser that
-- started it (the hash of a nonce in that browser's own short-lived cookie), with the PKCE verifier for X.
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'x')),
  browser_hash TEXT NOT NULL,
  verifier TEXT,
  next TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states (expires_at);

-- The last answer of the island's contributor policy for a GitHub principal, with its policy revision and time, so a
-- bridge outage keeps a recent answer within its stale window and never invents one. X principals have no row.
CREATE TABLE capabilities (
  principal_id TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('eligible', 'ineligible', 'revoked', 'unknown')),
  character TEXT,
  policy TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
