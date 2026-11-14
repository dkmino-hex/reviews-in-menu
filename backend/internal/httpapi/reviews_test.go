package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateReviewRequiresSession(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/dishes/1/reviews", nil)
	res := httptest.NewRecorder()
	New(nil, "", false).ServeHTTP(res, req)

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusUnauthorized)
	}
}
