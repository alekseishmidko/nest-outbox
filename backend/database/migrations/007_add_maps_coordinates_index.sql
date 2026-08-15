-- Bounding box сначала фильтрует кандидатов по координатам, затем считается точная сфера.
ALTER TABLE maps
  ADD INDEX idx_maps_latitude_longitude (latitude, longitude);
