package accounts

import (
	"crypto/rand"
	"crypto/subtle"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

var validLogin = regexp.MustCompile("^[a-z0-9_]{3,64}$")
var hashSlots = make(chan struct{}, 2)

func Login(value string) string { return strings.ToLower(strings.TrimSpace(value)) }

func Valid(login, name, password string) bool {
	return validLogin.MatchString(login) && ValidName(name) && ValidPassword(password)
}

func ValidName(name string) bool {
	return strings.TrimSpace(name) != "" && !strings.ContainsRune(name, 0) && utf8.RuneCountInString(name) <= 80
}

func ValidPassword(password string) bool {
	return len(password) <= 128 && utf8.RuneCountInString(password) >= 8
}

func key(password string, salt []byte) []byte {
	hashSlots <- struct{}{}
	defer func() { <-hashSlots }()
	return argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
}

func Hash(password string) []byte {
	salt := make([]byte, 16)
	rand.Read(salt)
	return append(salt, key(password, salt)...)
}

func Verify(password string, hash []byte) bool {
	valid := len(hash) == 48
	if !valid {
		hash = make([]byte, 48)
	}
	match := subtle.ConstantTimeCompare(key(password, hash[:16]), hash[16:]) == 1
	return valid && match
}
