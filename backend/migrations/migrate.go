package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var files embed.FS

func Run(ctx context.Context, db *pgxpool.Pool) error {
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(703113401)"); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY)"); err != nil {
			return err
		}
		for _, name := range names {
			var applied bool
			if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migration WHERE name=$1)", name).Scan(&applied); err != nil {
				return err
			}
			if applied {
				continue
			}
			sql, err := files.ReadFile(name)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			if _, err := tx.Exec(ctx, "INSERT INTO schema_migration VALUES ($1)", name); err != nil {
				return err
			}
		}
		return nil
	})
}
