package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (s server) reviewRoutes(m *http.ServeMux) {
	m.HandleFunc("POST /api/v1/dishes/{id}/reviews", s.createReview)
}

func (s server) createReview(w http.ResponseWriter, r *http.Request) {
	author, ok := s.require(w, r, false)
	if !ok {
		return
	}
	if author.Role != "visitor" {
		fail(w, http.StatusForbidden, "Отзывы могут оставлять только посетители")
		return
	}

	dishID, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Rating int    `json:"rating"`
		Body   string `json:"body"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Body = clean(in.Body)
	if in.Rating < 1 || in.Rating > 5 {
		fail(w, http.StatusBadRequest, "Укажите оценку от 1 до 5")
		return
	}
	if strings.ContainsRune(in.Body, 0) {
		fail(w, http.StatusBadRequest, "Текст отзыва содержит недопустимый символ")
		return
	}

	var id int64
	err := s.db.QueryRow(r.Context(), `INSERT INTO review (dish_id, author_id, rating, body)
		SELECT id, $2, $3, $4 FROM dish WHERE id = $1 FOR KEY SHARE
		RETURNING id`, dishID, author.ID, in.Rating, in.Body).Scan(&id)
	var pgErr *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		fail(w, http.StatusNotFound, "Блюдо не найдено")
	case errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "review_current_dish_author_idx":
		fail(w, http.StatusConflict, "Вы уже оставили отзыв на это блюдо")
	case err != nil:
		internal(w, err)
	default:
		reply(w, http.StatusCreated, map[string]int64{"id": id})
	}
}
