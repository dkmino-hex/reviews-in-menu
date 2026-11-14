package accounts

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func CreateAdmin(ctx context.Context, db *pgxpool.Pool, login, name, password string) error {
	login, name = Login(login), strings.TrimSpace(name)
	if !Valid(login, name, password) {
		return errors.New("set ADMIN_LOGIN, ADMIN_NAME and ADMIN_PASSWORD (at least 8 characters)")
	}
	_, err := db.Exec(ctx, "INSERT INTO app_user (login, display_name, password_hash, role) VALUES ($1,$2,$3,'admin')", login, name, Hash(password))
	return err
}
