package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"reviews-in-menu/backend/internal/accounts"
)

const sessionCookie = "reviews_session"
const sessionLife = 24 * time.Hour

type user struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

func (s server) accountRoutes(m *http.ServeMux) {
	m.HandleFunc("POST /api/v1/auth/register", s.register)
	m.HandleFunc("POST /api/v1/auth/login", s.login)
	m.HandleFunc("POST /api/v1/auth/logout", s.logout)
	m.HandleFunc("GET /api/v1/me", s.me)
	m.HandleFunc("PATCH /api/v1/me", s.profile)
	m.HandleFunc("GET /api/v1/admin/visitors", s.visitors)
	m.HandleFunc("PATCH /api/v1/admin/visitors/{id}", s.block)
	m.HandleFunc("GET /api/v1/admin/audit", s.audit)
}

func sessionHash(r *http.Request) []byte {
	c, err := r.Cookie(sessionCookie)
	if err != nil || len(c.Value) != 43 {
		return nil
	}
	hash := sha256.Sum256([]byte(c.Value))
	return hash[:]
}

func (s server) cookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: value, Path: "/api/v1", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

func (s server) require(w http.ResponseWriter, r *http.Request, admin bool) (user, bool) {
	var u user
	hash := sessionHash(r)
	if hash == nil {
		fail(w, 401, "Войдите в аккаунт")
		return u, false
	}
	err := s.db.QueryRow(r.Context(), `SELECT u.id,u.login,u.display_name,u.role
        FROM app_session s JOIN app_user u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.blocked`, hash).Scan(&u.ID, &u.Login, &u.Name, &u.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 401, "Сеанс завершён")
		return u, false
	}
	if err != nil {
		internal(w, err)
		return u, false
	}
	if admin && u.Role != "admin" {
		fail(w, 403, "Доступно администратору")
		return u, false
	}
	return u, true
}

func (s server) register(w http.ResponseWriter, r *http.Request) {
	var in struct{ Login, Name, Password string }
	if !decode(w, r, &in) {
		return
	}
	in.Login, in.Name = accounts.Login(in.Login), clean(in.Name)
	if !accounts.Valid(in.Login, in.Name, in.Password) {
		fail(w, 400, "Логин: 3–64 латинских букв, цифр или подчёркиваний. Имя: до 80 символов. Пароль: от 8 символов, до 128 байт.")
		return
	}
	_, err := s.db.Exec(r.Context(), "INSERT INTO app_user (login,display_name,password_hash,role) VALUES ($1,$2,$3,'visitor')", in.Login, in.Name, accounts.Hash(in.Password))
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && pgerr.Code == "23505" {
		fail(w, 409, "Логин уже занят")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	w.WriteHeader(201)
}

func (s server) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Login, Password string }
	if !decode(w, r, &in) {
		return
	}
	if len(in.Password) > 128 || len(in.Login) > 256 {
		fail(w, 401, "Неверный логин или пароль")
		return
	}
	var u user
	var hash []byte
	var blocked bool
	ctx := r.Context()
	err := s.db.QueryRow(ctx, "SELECT id,login,display_name,role,password_hash,blocked FROM app_user WHERE login=$1", accounts.Login(in.Login)).
		Scan(&u.ID, &u.Login, &u.Name, &u.Role, &hash, &blocked)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		internal(w, err)
		return
	}
	if !accounts.Verify(in.Password, hash) || blocked {
		fail(w, 401, "Неверный логин или пароль")
		return
	}
	secret := make([]byte, 32)
	rand.Read(secret)
	token := base64.RawURLEncoding.EncodeToString(secret)
	digest := sha256.Sum256([]byte(token))
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var id int64
		if err := tx.QueryRow(ctx, "SELECT id FROM app_user WHERE id=$1 AND password_hash=$2 AND NOT blocked FOR UPDATE", u.ID, hash).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "DELETE FROM app_session WHERE user_id=$1 AND expires_at<=now() OR token_hash=$2", u.ID, sessionHash(r)); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "INSERT INTO app_session VALUES ($1,$2,$3)", digest[:], u.ID, time.Now().Add(sessionLife))
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 401, "Неверный логин или пароль")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	s.cookie(w, token, int(sessionLife.Seconds()))
	reply(w, 200, u)
}

func (s server) logout(w http.ResponseWriter, r *http.Request) {
	if hash := sessionHash(r); hash != nil {
		if _, err := s.db.Exec(r.Context(), "DELETE FROM app_session WHERE token_hash=$1", hash); err != nil {
			internal(w, err)
			return
		}
	}
	s.cookie(w, "", -1)
	w.WriteHeader(204)
}

func (s server) me(w http.ResponseWriter, r *http.Request) {
	if u, ok := s.require(w, r, false); ok {
		reply(w, 200, u)
	}
}

var errPassword = errors.New("incorrect password")

func (s server) profile(w http.ResponseWriter, r *http.Request) {
	u, ok := s.require(w, r, false)
	if !ok {
		return
	}
	var in struct {
		Name            string
		CurrentPassword string
		NewPassword     string
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = clean(in.Name)
	if !accounts.ValidName(in.Name) || (in.NewPassword != "" && (!accounts.ValidPassword(in.NewPassword) || len(in.CurrentPassword) > 128)) {
		fail(w, 400, "Проверьте имя и длину пароля")
		return
	}
	ctx := r.Context()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var hash []byte
		if err := tx.QueryRow(ctx, "SELECT password_hash FROM app_user WHERE id=$1 AND NOT blocked FOR UPDATE", u.ID).Scan(&hash); err != nil {
			return err
		}
		var active bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app_session WHERE token_hash=$1 AND user_id=$2 AND expires_at>now())", sessionHash(r), u.ID).Scan(&active); err != nil {
			return err
		}
		if !active {
			return pgx.ErrNoRows
		}
		if in.NewPassword != "" {
			if !accounts.Verify(in.CurrentPassword, hash) {
				return errPassword
			}
			hash = accounts.Hash(in.NewPassword)
			if _, err := tx.Exec(ctx, "DELETE FROM app_session WHERE user_id=$1", u.ID); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, "UPDATE app_user SET display_name=$2,password_hash=$3 WHERE id=$1", u.ID, in.Name, hash)
		return err
	})
	if errors.Is(err, errPassword) {
		fail(w, 400, "Неверный текущий пароль")
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 401, "Сеанс завершён")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	if in.NewPassword != "" {
		s.cookie(w, "", -1)
	}
	w.WriteHeader(204)
}

func (s server) visitors(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.require(w, r, true); !ok {
		return
	}
	type visitor struct {
		user
		Blocked bool `json:"blocked"`
	}
	page, ok := pageNumber(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(r.Context(), "SELECT id,login,display_name,role,blocked FROM app_user WHERE role='visitor' ORDER BY id DESC LIMIT 21 OFFSET $1", (page-1)*20)
	if err != nil {
		internal(w, err)
		return
	}
	result, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (visitor, error) {
		var v visitor
		err := row.Scan(&v.ID, &v.Login, &v.Name, &v.Role, &v.Blocked)
		return v, err
	})
	if err != nil {
		internal(w, err)
		return
	}
	pageReply(w, result)
}

func (s server) block(w http.ResponseWriter, r *http.Request) {
	u, ok := s.require(w, r, true)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Blocked *bool
		Reason  string
	}
	if !decode(w, r, &in) {
		return
	}
	in.Reason = clean(in.Reason)
	if in.Blocked == nil || in.Reason == "" || strings.ContainsRune(in.Reason, 0) || len(in.Reason) > 1000 {
		fail(w, 400, "Укажите состояние и причину")
		return
	}
	ctx := r.Context()
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, "UPDATE app_user SET blocked=$2 WHERE id=$1 AND role='visitor'", id, *in.Blocked)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		action := "visitor.unblock"
		if *in.Blocked {
			action = "visitor.block"
			if _, err := tx.Exec(ctx, "DELETE FROM app_session WHERE user_id=$1", id); err != nil {
				return err
			}
		}
		return event(r, tx, u.ID, action, "visitor", id, map[string]string{"reason": in.Reason})
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Посетитель не найден")
		return
	}
	if err != nil {
		internal(w, err)
		return
	}
	w.WriteHeader(204)
}

func event(r *http.Request, tx pgx.Tx, actor int64, action, kind string, id int64, details map[string]string) error {
	if details == nil {
		details = map[string]string{}
	}
	_, err := tx.Exec(r.Context(), "INSERT INTO audit_event(actor_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)", actor, action, kind, id, details)
	return err
}

func (s server) audit(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.require(w, r, true); !ok {
		return
	}
	page, ok := pageNumber(w, r)
	if !ok {
		return
	}
	since := time.Time{}
	if value := r.URL.Query().Get("since"); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			fail(w, 400, "Неверная дата")
			return
		}
		since = parsed
	}
	rows, err := s.db.Query(r.Context(), `SELECT jsonb_build_object('id',id,'actor_id',actor_id,'action',action,
        'entity_type',entity_type,'entity_id',entity_id,'details',details,'created_at',created_at)
        FROM audit_event WHERE ($2='' OR entity_type=$2) AND created_at >= $3 ORDER BY id DESC LIMIT 21 OFFSET $1`, (page-1)*20, r.URL.Query().Get("entity"), since)
	if err != nil {
		internal(w, err)
		return
	}
	result, err := pgx.CollectRows(rows, pgx.RowTo[json.RawMessage])
	if err != nil {
		internal(w, err)
		return
	}
	pageReply(w, result)
}
