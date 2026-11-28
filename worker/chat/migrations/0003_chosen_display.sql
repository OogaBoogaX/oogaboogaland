-- The name the account chose for itself: Ooga Chat's Commons name field, or the island's own name for that GitHub
-- account, which the bridge's capability answer carries. Shown in place of the provider's display name, and never
-- overwritten by a sign-in's refresh of the provider profile (session.js `upsertPrincipal`, `displayOf`).
ALTER TABLE principals ADD COLUMN chosen_display TEXT;
