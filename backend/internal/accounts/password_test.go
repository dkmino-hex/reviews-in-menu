package accounts

import (
	"bytes"
	"testing"
)

func TestPassword(t *testing.T) {
	const password = "пример-пароля"
	first, second := Hash(password), Hash(password)
	if bytes.Equal(first, second) || !Verify(password, first) || Verify("wrong", first) || Verify(password, nil) {
		t.Fatal("password hash must use a random salt and reject invalid credentials")
	}
}
