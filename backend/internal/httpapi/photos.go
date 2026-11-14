package httpapi

import (
	"bytes"
	"crypto/rand"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/jackc/pgx/v5"
)

var photoKey = regexp.MustCompile(`^[A-Z2-7]{26}\.(jpeg|png)$`)

func (s server) photo(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !photoKey.MatchString(key) {
		http.NotFound(w, r)
		return
	}
	var active bool
	if err := s.db.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dish WHERE image_key=$1)", key).Scan(&active); err != nil {
		internal(w, err)
		return
	}
	if !active {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, filepath.Join(s.photos, key))
}

func (s server) changePhoto(w http.ResponseWriter, r *http.Request) {
	u, ok := s.require(w, r, true)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var key, previous *string
	action := "dish.photo.remove"
	if r.Method == "PUT" {
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 5<<20))
		if err != nil {
			fail(w, 413, "Фото должно быть не больше 5 МБ")
			return
		}
		config, format, err := image.DecodeConfig(bytes.NewReader(raw))
		if err != nil || (format != "jpeg" && format != "png") || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 {
			fail(w, 400, "Загрузите JPEG или PNG размером до 4096 × 4096")
			return
		}
		if _, _, err := image.Decode(bytes.NewReader(raw)); err != nil {
			fail(w, 400, "Файл изображения повреждён")
			return
		}
		name := rand.Text() + "." + format
		key = &name
		action = "dish.photo.replace"
		if err := os.WriteFile(filepath.Join(s.photos, name), raw, 0600); err != nil {
			internal(w, err)
			return
		}
	}
	ctx := r.Context()
	readyToCommit := false
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "SELECT image_key FROM dish WHERE id=$1 FOR UPDATE", id).Scan(&previous); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "UPDATE dish SET image_key=$2 WHERE id=$1", id, key); err != nil {
			return err
		}
		err := event(r, tx, u.ID, action, "dish", id, nil)
		readyToCommit = err == nil
		return err
	})
	if err != nil {
		// An interrupted COMMIT may have succeeded. Keep its file in that case.
		if key != nil && !readyToCommit {
			s.removePhoto(*key)
		}
		catalogError(w, err)
		return
	}
	if previous != nil {
		s.removePhoto(*previous)
	}
	w.WriteHeader(204)
}

func (s server) removePhoto(key string) {
	if !photoKey.MatchString(key) {
		return
	}
	if err := os.Remove(filepath.Join(s.photos, key)); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Print("could not clean up dish photo")
	}
}
