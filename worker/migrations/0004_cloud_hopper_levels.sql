-- Cloud Hopper's four levels each keep their own attributed board, keyed by GitHub login like the single board
-- before them. That board keeps its rows and is retired in the registry: read, never written. The identity
-- triggers of 0003 already cover every 'ooga' row, these included.
INSERT INTO game_highscores (game_id, score_type, direction, unit) VALUES
  ('cloud-hopper-l1', 'ooga', 'asc', 'milliseconds'),
  ('cloud-hopper-l2', 'ooga', 'asc', 'milliseconds'),
  ('cloud-hopper-l3', 'ooga', 'asc', 'milliseconds'),
  ('cloud-hopper-l4', 'ooga', 'asc', 'milliseconds');
