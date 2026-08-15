# Routes MVP

Модуль `routes` рассчитывает геодезические расстояния и предлагает карты-кандидаты
для прямого маршрута. Это не дорожная навигация: результат не учитывает дорожную
сеть, одностороннее движение, пробки, транспорт или фактическое время поездки.

## API

- `POST /routes/distance` — Haversine distance между двумя координатами.
- `GET /routes/nearby` — карты внутри `radiusKm`, ближайшие первыми.
- `POST /routes/search` — direct route между `originMapId` и
  `destinationMapId`, плюс промежуточные карты с минимальным detour.

Поиск маршрута использует стратегию `direct_geodesic_with_candidates`.
Расстояние маршрута через кандидата равно
`origin → candidate + candidate → destination`, а `detour` — разнице этого
значения и прямого расстояния.

## Формула

Сервис использует Haversine с радиусом Земли `6371.0088 км`:

```text
a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
d = 2R × asin(√a)
```

SQL-поиск сначала сокращает выборку прямоугольником, затем применяет точное
сферическое расстояние MySQL:

```sql
SELECT id,
       ST_Distance_Sphere(
         POINT(longitude, latitude),
         POINT(:longitude, :latitude)
       ) / 1000 AS distance_km
FROM maps FORCE INDEX (idx_maps_latitude_longitude)
WHERE latitude BETWEEN :min_latitude AND :max_latitude
  AND longitude BETWEEN :min_longitude AND :max_longitude
HAVING distance_km <= :radius_km
ORDER BY distance_km;
```

Для bounding box добавлен индекс
`idx_maps_latitude_longitude (latitude, longitude)`. На большом наборе данных
план следует проверять через `EXPLAIN ANALYZE`: полезность второй колонки индекса
зависит от селективности диапазона по `latitude`.

## Observability

- `route_search_total{strategy,result}` — количество поисков.
- `route_search_duration_seconds{strategy,result}` — latency поиска.
- Лог `route.search_completed` содержит стратегию, обе карты, расстояние и число
  кандидатов.

## Переход к дорожным маршрутам

Следующий этап — таблица `route_edges`, стоимость перехода и Dijkstra/A*. Для
реальных дорог вместо собственной модели разумно подключить routing provider.
Также потребуется корректная обработка маршрутов через линию перемены дат и
пространственный индекс над типом `POINT`.
