package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"reviews-in-menu/backend/internal/accounts"
	"reviews-in-menu/backend/internal/httpapi"
	"reviews-in-menu/backend/migrations"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, "")
	if err != nil {
		return err
	}
	defer db.Close()

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "migrate":
			return migrations.Run(ctx, db)
		case "create-admin":
			return accounts.CreateAdmin(ctx, db, os.Getenv("ADMIN_LOGIN"), os.Getenv("ADMIN_NAME"), os.Getenv("ADMIN_PASSWORD"))
		default:
			return errors.New("use migrate or create-admin")
		}
	}

	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}
	photos := os.Getenv("PHOTO_DIR")
	if photos == "" {
		photos = "photos"
	}
	if err := os.MkdirAll(photos, 0700); err != nil {
		return err
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           httpapi.New(db, photos, os.Getenv("COOKIE_SECURE") != "false"),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       time.Minute,
		MaxHeaderBytes:    32 << 10,
	}
	serverErrors := make(chan error, 1)
	go cleanReviewArchive(ctx, db)
	go func() {
		log.Printf("API listening on %s", addr)
		serverErrors <- server.ListenAndServe()
	}()
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

func cleanReviewArchive(ctx context.Context, db *pgxpool.Pool) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		query, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := httpapi.CleanReviewArchive(query, db)
		cancel()
		if err != nil && ctx.Err() == nil {
			log.Printf("review archive cleanup: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
