package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func (s server) reviewRoutes(m *http.ServeMux) {
	m.HandleFunc("POST /api/v1/dishes/{id}/reviews", s.createReview)
	m.HandleFunc("GET /api/v1/dishes/{id}/reviews", s.publicReviews)
	m.HandleFunc("GET /api/v1/me/reviews", s.myReviews)
	m.HandleFunc("PATCH /api/v1/me/reviews/{id}", s.editReview)
	m.HandleFunc("POST /api/v1/me/reviews/{id}/replace", s.replaceReview)
	m.HandleFunc("DELETE /api/v1/me/reviews/{id}", s.deleteOwnReview)
	m.HandleFunc("GET /api/v1/admin/reviews", s.moderationReviews)
	m.HandleFunc("PATCH /api/v1/admin/reviews/{id}", s.moderateReview)
	m.HandleFunc("PUT /api/v1/reviews/{id}/helpfulness", s.voteReview)
}

func (s server) reviewAuthor(w http.ResponseWriter, r *http.Request) (user, bool) {
	author, ok := s.require(w, r, false)
	if !ok {
		return author, false
	}
	if author.Role != "visitor" {
		fail(w, http.StatusForbidden, "Отзывы могут оставлять только посетители")
		return author, false
	}
	return author, true
}

type reviewInput struct {
	Rating int    `json:"rating"`
	Body   string `json:"body"`
}

func (in *reviewInput) validate(w http.ResponseWriter) bool {
	in.Body = clean(in.Body)
	if in.Rating < 1 || in.Rating > 5 {
		fail(w, http.StatusBadRequest, "Укажите оценку от 1 до 5")
		return false
	}
	if in.Body != "" && !validText(in.Body, 3000) {
		fail(w, http.StatusBadRequest, "Комментарий должен содержать не более 3000 символов и не включать нулевой символ")
		return false
	}
	return true
}

func (s server) createReview(w http.ResponseWriter, r *http.Request) {
	author, ok := s.reviewAuthor(w, r)
	if !ok {
		return
	}

	dishID, ok := pathID(w, r)
	if !ok {
		return
	}
	var in reviewInput
	if !decode(w, r, &in) || !in.validate(w) {
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
		fail(w, http.StatusConflict, "Для этого блюда уже есть действующий отзыв или ограничение модерации")
	case err != nil:
		internal(w, err)
	default:
		reply(w, http.StatusCreated, map[string]int64{"id": id})
	}
}

type publicReview struct {
	ID        int64     `json:"id"`
	Rating    int       `json:"rating"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	Tone      *string   `json:"tone"`
	Helpful   int64     `json:"helpful"`
	Unhelpful int64     `json:"unhelpful"`
	MyVote    int       `json:"my_vote"`
	CanVote   bool      `json:"can_vote"`
}

func (s server) publicReviews(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	page, ok := pageNumber(w, r)
	if !ok {
		return
	}
	var exists bool
	ctx := r.Context()
	if err := s.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM dish WHERE id=$1)", id).Scan(&exists); err != nil {
		internal(w, err)
		return
	}
	if !exists {
		fail(w, 404, "Блюдо не найдено")
		return
	}
	rows, err := s.db.Query(ctx, `SELECT r.id,r.rating,r.body,r.created_at,a.tone,
		coalesce(v.helpful,0),coalesce(v.unhelpful,0),coalesce(m.vote,0),
		coalesce(u.id<>r.author_id,false) FROM review r
		LEFT JOIN published_review_sentiment a ON a.review_id=r.id
		LEFT JOIN review_vote_totals v ON v.review_id=r.id
		LEFT JOIN app_session s ON s.token_hash=$3 AND s.expires_at>now()
		LEFT JOIN app_user u ON u.id=s.user_id AND NOT u.blocked
		LEFT JOIN review_vote m ON m.review_id=r.id AND m.user_id=u.id
		WHERE r.dish_id=$1 AND r.publication_state='published' AND r.body<>''
		ORDER BY coalesce(v.helpful,0)-coalesce(v.unhelpful,0) DESC,
		coalesce(v.helpful,0) DESC,r.created_at DESC,r.id DESC LIMIT 21 OFFSET $2`, id, (page-1)*20, sessionHash(r))
	if err != nil {
		internal(w, err)
		return
	}
	result, err := pgx.CollectRows(rows, pgx.RowToStructByPos[publicReview])
	if err != nil {
		internal(w, err)
		return
	}
	pageReply(w, result)
}

type managedReview struct {
	ID               int64      `json:"id"`
	DishID           int64      `json:"dish_id"`
	DishName         string     `json:"dish_name"`
	Rating           int        `json:"rating"`
	Body             string     `json:"body"`
	PublicationState string     `json:"publication_state"`
	Version          int        `json:"version"`
	ModerationReason *string    `json:"moderation_reason"`
	CreatedAt        time.Time  `json:"created_at"`
	ArchivedAt       *time.Time `json:"archived_at"`
}

func (s server) myReviews(w http.ResponseWriter, r *http.Request) {
	author, ok := s.reviewAuthor(w, r)
	if ok {
		s.managedReviews(w, r, author.ID)
	}
}

func (s server) moderationReviews(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.require(w, r, true); ok {
		s.managedReviews(w, r, 0)
	}
}

func (s server) managedReviews(w http.ResponseWriter, r *http.Request, author int64) {
	page, ok := pageNumber(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT r.id,r.dish_id,d.name,r.rating,r.body,r.publication_state,
		r.version,r.moderation_reason,r.created_at,r.archived_at
		FROM review r JOIN dish d ON d.id=r.dish_id
		WHERE ($1=0 OR r.author_id=$1) AND (r.publication_state IN ('published','hidden')
		  OR ($1<>0 AND r.publication_state='archived' AND r.archived_at>now()-interval '30 days'))
		ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $2`, author, (page-1)*20)
	if err != nil {
		internal(w, err)
		return
	}
	result, err := pgx.CollectRows(rows, pgx.RowToStructByPos[managedReview])
	if err != nil {
		internal(w, err)
		return
	}
	pageReply(w, result)
}

func (s server) editReview(w http.ResponseWriter, r *http.Request) {
	s.changeOwnReview(w, r, false)
}

func (s server) replaceReview(w http.ResponseWriter, r *http.Request) {
	s.changeOwnReview(w, r, true)
}

var errReviewConflict = errors.New("review conflict")

func reviewChangeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		fail(w, 404, "Отзыв не найден")
	case errors.Is(err, errReviewConflict):
		fail(w, 409, "Отзыв изменился или действие недоступно для его состояния. Обновите список.")
	default:
		internal(w, err)
	}
}

func (s server) changeOwnReview(w http.ResponseWriter, r *http.Request, replace bool) {
	author, ok := s.reviewAuthor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		reviewInput
		Version int `json:"version"`
	}
	if !decode(w, r, &in) || !in.reviewInput.validate(w) {
		return
	}
	if in.Version < 1 {
		fail(w, 400, "Укажите версию отзыва")
		return
	}
	ctx := r.Context()
	var newID int64
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var dishID int64
		var version int
		var state string
		err := tx.QueryRow(ctx, `SELECT dish_id,version,publication_state FROM review
			WHERE id=$1 AND author_id=$2 FOR UPDATE`, id, author.ID).Scan(&dishID, &version, &state)
		if err != nil {
			return err
		}
		if version != in.Version || (state != "published" && state != "hidden") || (replace && state == "hidden") {
			return errReviewConflict
		}
		if !replace {
			// Votes describe the previous text and rating; edited reviews start fresh.
			if _, err := tx.Exec(ctx, "DELETE FROM review_vote WHERE review_id=$1", id); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, "UPDATE review SET rating=$2,body=$3,version=version+1 WHERE id=$1", id, in.Rating, in.Body)
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE review SET publication_state='archived',archived_at=now(),version=version+1 WHERE id=$1", id); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `INSERT INTO review(dish_id,author_id,rating,body) VALUES ($1,$2,$3,$4)
			RETURNING id`, dishID, author.ID, in.Rating, in.Body).Scan(&newID)
	})
	if err != nil {
		reviewChangeError(w, err)
		return
	}
	if replace {
		reply(w, 201, map[string]int64{"id": newID})
		return
	}
	w.WriteHeader(204)
}

func (s server) deleteOwnReview(w http.ResponseWriter, r *http.Request) {
	author, ok := s.reviewAuthor(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tag, err := s.db.Exec(r.Context(), `UPDATE review SET
		publication_state=CASE WHEN publication_state='hidden' THEN 'removed' ELSE 'deleted' END,
		version=version+1 WHERE id=$1 AND author_id=$2 AND publication_state IN ('published','hidden')`, id, author.ID)
	if err != nil {
		internal(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Действующий отзыв не найден")
		return
	}
	w.WriteHeader(204)
}

func (s server) moderateReview(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.require(w, r, true)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Action  string `json:"action"`
		Reason  string `json:"reason"`
		Version int    `json:"version"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Reason = clean(in.Reason)
	if in.Version < 1 || (in.Action != "hide" && in.Action != "restore" && in.Action != "remove") ||
		(in.Action == "hide" && in.Reason == "") || (in.Reason != "" && !validText(in.Reason, 300)) {
		fail(w, 400, "Проверьте действие, версию и причину модерации (до 300 символов)")
		return
	}
	ctx := r.Context()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var state string
		var version int
		if err := tx.QueryRow(ctx, "SELECT publication_state,version FROM review WHERE id=$1 FOR UPDATE", id).Scan(&state, &version); err != nil {
			return err
		}
		if version != in.Version {
			return errReviewConflict
		}
		switch {
		case in.Action == "hide" && state == "published":
			state = "hidden"
		case in.Action == "restore" && state == "hidden":
			state = "published"
		case in.Action == "remove" && (state == "published" || state == "hidden"):
			state = "removed"
		default:
			return errReviewConflict
		}
		_, err := tx.Exec(ctx, `UPDATE review SET publication_state=$2,version=version+1,
			moderation_reason=CASE WHEN $2='published' THEN NULL
				WHEN $2='removed' AND $3='' THEN moderation_reason ELSE NULLIF($3,'') END
			WHERE id=$1`, id, state, in.Reason)
		if err != nil {
			return err
		}
		return event(r, tx, admin.ID, in.Action, "review", id, map[string]string{"reason": in.Reason})
	})
	if err != nil {
		reviewChangeError(w, err)
		return
	}
	w.WriteHeader(204)
}

func CleanReviewArchive(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, "DELETE FROM review WHERE publication_state='archived' AND archived_at<=now()-interval '30 days'")
	return err
}
