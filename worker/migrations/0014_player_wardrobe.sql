-- What a player wears besides the hat (src/js/equipment-wardrobe.js): one JSON object of slot choices, each an immutable
-- wardrobe item or taking the slot's piece off, checked by the Worker before it is written. Null wears the character's
-- own look. It shares the hat's revision, so a save of either is one compare-and-swap.
ALTER TABLE player_equipment ADD COLUMN wardrobe TEXT
  CHECK (wardrobe IS NULL OR (json_valid(wardrobe) AND json_type(wardrobe) = 'object' AND length(wardrobe) <= 4096));
