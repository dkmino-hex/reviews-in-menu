package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

func optionalAnalyticsID(value string) (int64, bool) {
	if value == "" {
		return 0, true
	}
	id, err := strconv.ParseInt(value, 10, 64)
	return id, err == nil && id > 0
}

func (s server) ratingAnalytics(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.require(w, r, true); !ok {
		return
	}
	q := r.URL.Query()
	from, fromErr := time.Parse(time.DateOnly, q.Get("from"))
	to, toErr := time.Parse(time.DateOnly, q.Get("to"))
	if fromErr != nil || toErr != nil || from.Year() < 1 || to.Before(from) || to.After(from.AddDate(0, 0, 365)) {
		fail(w, 400, "Укажите период от 1 до 365 календарных дней")
		return
	}
	group := q.Get("group")
	if group == "" {
		group = "day"
	}
	if group != "day" && group != "week" && group != "month" {
		fail(w, 400, "Выберите группировку по дням, неделям или месяцам")
		return
	}
	categoryID, categoryOK := optionalAnalyticsID(q.Get("category"))
	dishID, dishOK := optionalAnalyticsID(q.Get("dish"))
	if !categoryOK || !dishOK {
		fail(w, 400, "Неверная категория или блюдо")
		return
	}

	var report json.RawMessage
	if err := s.db.QueryRow(r.Context(), ratingAnalyticsSQL, from, to, group, categoryID, dishID).Scan(&report); err != nil {
		internal(w, err)
		return
	}
	reply(w, 200, report)
}

const ratingAnalyticsSQL = `
WITH menu AS (
    SELECT id, name, category_id FROM dish
), selected AS (
    SELECT id, name FROM menu WHERE ($4::bigint=0 OR category_id=$4) AND ($5::bigint=0 OR id=$5)
), ratings AS (
    SELECT r.dish_id, r.rating, date_trunc($3, r.created_at AT TIME ZONE 'Europe/Moscow')::date AS period
    FROM review r JOIN selected d ON d.id=r.dish_id
    WHERE r.publication_state='published'
      AND r.created_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Moscow')
      AND r.created_at < (($2::date+1)::timestamp AT TIME ZONE 'Europe/Moscow')
), by_dish AS (
    SELECT d.id, d.name, avg(r.rating)::float8 AS average_rating, count(r.rating) AS rating_count
    FROM selected d LEFT JOIN ratings r ON r.dish_id=d.id
    GROUP BY d.id,d.name
), by_period AS (
    SELECT period, avg(rating)::float8 AS average_rating, count(*) AS rating_count
    FROM ratings GROUP BY period
), timeline AS (
    SELECT periods.start_at::date AS period, p.average_rating, coalesce(p.rating_count,0) AS rating_count
    FROM generate_series(
        date_trunc($3,$1::date::timestamp),
        date_trunc($3,$2::date::timestamp),
        ('1 ' || $3)::interval
    ) AS periods(start_at)
    LEFT JOIN by_period p ON p.period=periods.start_at::date
)
SELECT json_build_object(
    'average_rating', (SELECT avg(rating)::float8 FROM ratings),
    'rating_count', (SELECT count(*) FROM ratings),
    'dish_options', (SELECT coalesce(json_agg(menu ORDER BY name,id),'[]'::json) FROM menu),
    'dishes', (SELECT coalesce(json_agg(by_dish ORDER BY name,id),'[]'::json) FROM by_dish),
    'timeline', (SELECT json_agg(timeline ORDER BY period) FROM timeline)
)`
