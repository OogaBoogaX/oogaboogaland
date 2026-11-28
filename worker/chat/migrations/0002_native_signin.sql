-- Native sign-in (docs/ooga-chat-backend.md, "Native clients"): a desktop app signs in through the system browser and
-- gets its session back on loopback (RFC 8252), proved with PKCE (RFC 7636, S256).

-- A sign-in a native app started: its PKCE challenge and the loopback port the browser is sent back to. Both null for
-- the web app's own sign-ins.
ALTER TABLE oauth_states ADD COLUMN native_challenge TEXT;
ALTER TABLE oauth_states ADD COLUMN native_port INTEGER;

-- The one-time code a finished native sign-in hands the app on loopback, kept by its SHA-256, good for two minutes and
-- for one exchange, and only with the verifier behind its challenge.
CREATE TABLE native_codes (
  code_hash TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX native_codes_expiry ON native_codes (expires_at);

-- The browser's word between a native sign-in and its code: the callback, signed in, answers a page asking whether to
-- go on to the app, and only its Continue (a same-site POST from the browser that signed in) makes the code. Kept by
-- its SHA-256 with the hash of a fresh nonce in that browser's sign-in cookie, good for five minutes and for one answer,
-- so a site that starts a native sign-in for someone who already approved the OAuth app never finishes it silently.
CREATE TABLE native_consents (
  consent_hash TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'x')),
  browser_hash TEXT NOT NULL,
  challenge TEXT NOT NULL,
  port INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX native_consents_expiry ON native_consents (expires_at);
