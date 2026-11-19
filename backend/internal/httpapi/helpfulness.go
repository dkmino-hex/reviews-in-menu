package httpapi

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type reviewFeedback struct {
	Helpful   int64 `json:"helpful"`
	Unhelpful int64 `json:"unhelpful"`
	MyVote    int   `json:"my_vote"`
	CanVote   bool  `json:"can_vote"`
}

var errOwnReviewVote = errors.New("cannot vote for own review")

func (s server) voteReview(w http.ResponseWriter, r *http.Request) {
	u, ok := s.require(w, r, false)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Vote *int `json:"vote"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Vote == nil || *in.Vote < -1 || *in.Vote > 1 {
		fail(w, 400, "Укажите vote: 1 — полезно, -1 — не полезно, 0 — снять отметку")
		return
	}
	var result reviewFeedback
	ctx := r.Context()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var author int64
		if err := tx.QueryRow(ctx, `SELECT author_id FROM review
			WHERE id=$1 AND publication_state='published' AND body<>'' FOR UPDATE`, id).Scan(&author); err != nil {
			return err
		}
		if author == u.ID {
			return errOwnReviewVote
		}
		if *in.Vote == 0 {
			if _, err := tx.Exec(ctx, "DELETE FROM review_vote WHERE review_id=$1 AND user_id=$2", id, u.ID); err != nil {
				return err
			}
		} else if _, err := tx.Exec(ctx, `INSERT INTO review_vote(review_id,user_id,vote) VALUES ($1,$2,$3)
			ON CONFLICT (review_id,user_id) DO UPDATE SET vote=excluded.vote`, id, u.ID, *in.Vote); err != nil {
			return err
		}
		result.MyVote, result.CanVote = *in.Vote, true
		return tx.QueryRow(ctx, `SELECT count(*) FILTER (WHERE vote=1),count(*) FILTER (WHERE vote=-1)
			FROM review_vote WHERE review_id=$1`, id).Scan(&result.Helpful, &result.Unhelpful)
	})
	switch {
	case errors.Is(err, errOwnReviewVote):
		fail(w, 403, "Нельзя оценивать полезность своего комментария")
	case errors.Is(err, pgx.ErrNoRows):
		fail(w, 404, "Опубликованный комментарий не найден")
	case err != nil:
		internal(w, err)
	default:
		reply(w, 200, result)
	}
}
