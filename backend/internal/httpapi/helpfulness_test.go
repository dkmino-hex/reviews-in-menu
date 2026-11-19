package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"review-breaker/backend/migrations"
)

func TestReviewHelpfulness(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run isolated PostgreSQL integration checks")
	}
	ctx := context.Background()
	root, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	schema := fmt.Sprintf("helpfulness_test_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err := root.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := root.Exec(ctx, "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrations.Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Run(ctx, db); err != nil {
		t.Fatal("migration is not idempotent:", err)
	}
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	tokens := make([]string, 4)
	for i := range tokens {
		role := "visitor"
		if i == 3 {
			role = "admin"
		}
		exec("INSERT INTO app_user(login,display_name,password_hash,role) VALUES ($1,'Test',$2,$3)", fmt.Sprintf("tester%d", i), make([]byte, 48), role)
		tokens[i] = strings.Repeat(string(rune('a'+i)), 43)
		hash := sha256.Sum256([]byte(tokens[i]))
		exec("INSERT INTO app_session VALUES ($1,$2,now()+interval '1 day')", hash[:], i+1)
	}
	exec("INSERT INTO category(name) VALUES ('Test')")
	exec("INSERT INTO dish(category_id,name,description,ingredients,price) VALUES (1,'Test','','',100)")
	for i := 1; i <= 3; i++ {
		exec("INSERT INTO review(dish_id,author_id,rating,body) VALUES (1,$1,4,'Comment')", i)
	}
	handler := New(db, t.TempDir(), false)
	call := func(method, url, body string, token int) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, url, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if token >= 0 {
			r.Header.Set("Cookie", "reviews_session="+tokens[token])
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	check := func(method, url, body string, token, status int) *httptest.ResponseRecorder {
		t.Helper()
		w := call(method, url, body, token)
		if w.Code != status {
			t.Fatalf("%s %s: status %d, want %d: %s", method, url, w.Code, status, w.Body)
		}
		return w
	}
	voteURL := "/api/v1/reviews/1/helpfulness"
	check("PUT", voteURL, `{"vote":1}`, -1, 401)
	check("PUT", voteURL, `{"vote":1}`, 0, 403)
	check("PUT", voteURL, `{"vote":1}`, 3, 200)
	check("PUT", voteURL, `{"vote":0}`, 3, 200)
	for _, body := range []string{`{}`, `{"vote":null}`, `{"vote":2}`, `{"vote":1.5}`, `{"vote":true}`, `{"vote":1,"user_id":1}`} {
		check("PUT", voteURL, body, 1, 400)
	}
	check("PUT", "/api/v1/reviews/999/helpfulness", `{"vote":1}`, 1, 404)
	var wg sync.WaitGroup
	statuses := make(chan int, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); statuses <- call("PUT", voteURL, `{"vote":1}`, 1).Code }()
	}
	wg.Wait()
	close(statuses)
	for status := range statuses {
		if status != 200 {
			t.Fatalf("concurrent vote: %d", status)
		}
	}
	feedback := func(body string, helpful, unhelpful int64, mine int) {
		t.Helper()
		w := check("PUT", voteURL, body, 1, 200)
		var result reviewFeedback
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Helpful != helpful || result.Unhelpful != unhelpful || result.MyVote != mine || !result.CanVote {
			t.Fatalf("unexpected feedback: %+v", result)
		}
	}
	feedback(`{"vote":1}`, 1, 0, 1)
	feedback(`{"vote":-1}`, 0, 1, -1)
	feedback(`{"vote":0}`, 0, 0, 0)
	feedback(`{"vote":0}`, 0, 0, 0)
	feedback(`{"vote":1}`, 1, 0, 1)
	check("PUT", "/api/v1/reviews/2/helpfulness", `{"vote":-1}`, 0, 200)
	var page struct {
		Items []publicReview `json:"items"`
	}
	read := func(token int) {
		t.Helper()
		w := check("GET", "/api/v1/dishes/1/reviews", "", token, 200)
		if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
	}
	read(1)
	if len(page.Items) != 3 || page.Items[0].ID != 1 || page.Items[1].ID != 3 || page.Items[2].ID != 2 {
		t.Fatalf("wrong ranking: %+v", page.Items)
	}
	if page.Items[0].MyVote != 1 || !page.Items[0].CanVote || page.Items[2].CanVote {
		t.Fatalf("wrong personal permissions: %+v", page.Items)
	}
	read(3)
	if !page.Items[0].CanVote || page.Items[0].MyVote != 0 {
		t.Fatal("administrator cannot vote or received another user's vote")
	}
	read(-1)
	if page.Items[0].MyVote != 0 || page.Items[0].CanVote {
		t.Fatal("anonymous visitor received personal vote or permission")
	}
	check("PATCH", "/api/v1/me/reviews/1", `{"rating":5,"body":"Edited","version":1}`, 0, 204)
	feedback(`{"vote":0}`, 0, 0, 0)
	feedback(`{"vote":1}`, 1, 0, 1)
	check("PATCH", "/api/v1/admin/reviews/1", `{"action":"hide","reason":"Test","version":2}`, 3, 204)
	check("PUT", voteURL, `{"vote":1}`, 1, 404)
	check("PATCH", "/api/v1/admin/reviews/1", `{"action":"restore","version":3}`, 3, 204)
	feedback(`{"vote":1}`, 1, 0, 1)
	exec("UPDATE app_user SET blocked=true WHERE id=2")
	check("PUT", voteURL, `{"vote":1}`, 1, 401)
	exec("UPDATE app_user SET blocked=false WHERE id=2")
	check("POST", "/api/v1/me/reviews/1/replace", `{"rating":3,"body":"Replacement","version":4}`, 0, 201)
	check("PUT", voteURL, `{"vote":1}`, 1, 404)
	check("PUT", "/api/v1/reviews/4/helpfulness", `{"vote":1}`, 1, 200)
	check("DELETE", "/api/v1/me/reviews/4", "", 0, 204)
	check("PUT", "/api/v1/reviews/4/helpfulness", `{"vote":0}`, 1, 404)
	exec("UPDATE review SET body='' WHERE id=2")
	check("PUT", "/api/v1/reviews/2/helpfulness", `{"vote":1}`, 0, 404)
}
