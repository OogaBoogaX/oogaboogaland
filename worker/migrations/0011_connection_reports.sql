-- Opt-in dropout summaries, never arbitrary logs. Account deletion cascades.
-- Seven-day logical retention, daily/upload cleanup, hard global/account caps in the handler.
CREATE TABLE connection_reports (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('room-close', 'heartbeat-timeout', 'room-kick', 'peer-return')),
  client_build TEXT NOT NULL,
  worker_version TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (length(CAST(payload AS BLOB)) <= 8192)
);
CREATE INDEX connection_reports_account_time ON connection_reports(player_id, created_at);
CREATE INDEX connection_reports_time ON connection_reports(created_at);
