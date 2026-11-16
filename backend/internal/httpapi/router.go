package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type server struct {
	db     *pgxpool.Pool
	photos string
	secure bool
}

func New(db *pgxpool.Pool, photos string, secure bool) http.Handler {
	s := server{db: db, photos: photos, secure: secure}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			fail(w, 503, "База данных недоступна")
			return
		}
		reply(w, 200, map[string]string{"status": "ok"})
	})
	s.catalogRoutes(mux)
	s.accountRoutes(mux)
	s.reviewRoutes(mux)
	mux.HandleFunc("GET /api/v1/admin/rating-analytics", s.ratingAnalytics)
	return http.NewCrossOriginProtection().Handler(mux)
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]string{"error": message})
}

func internal(w http.ResponseWriter, err error) {
	// Avoid logging SQL error details that can contain submitted values.
	log.Printf("request failed: %T", err)
	fail(w, 500, "Не удалось выполнить запрос")
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if media != "application/json" {
		fail(w, 415, "Требуется application/json")
		return false
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		fail(w, 400, "Неверные данные")
		return false
	}
	if err := d.Decode(new(any)); !errors.Is(err, io.EOF) {
		fail(w, 400, "Ожидается один объект JSON")
		return false
	}
	return true
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(w, 404, "Запись не найдена")
		return 0, false
	}
	return id, true
}

func clean(value string) string { return strings.TrimSpace(value) }
