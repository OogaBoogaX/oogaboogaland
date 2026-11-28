-- A wearer controls fit independently of the immutable creator version. Keep the remembered
-- percentage when an older Worker/client saves a selection without knowing about this column.
ALTER TABLE player_equipment ADD COLUMN size INTEGER NOT NULL DEFAULT 100
  CHECK (typeof(size) = 'integer' AND size BETWEEN 80 AND 120);
