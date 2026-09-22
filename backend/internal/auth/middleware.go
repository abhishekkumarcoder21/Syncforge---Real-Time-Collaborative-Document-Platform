package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const userIDKey contextKey = "user_id"

func Middleware(jwtManager *JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := ""

			// Try cookie first, then Authorization header
			if cookie, err := r.Cookie("token"); err == nil {
				tokenStr = cookie.Value
			} else if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				tokenStr = strings.TrimPrefix(auth, "Bearer ")
			}

			if tokenStr == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			userID, err := jwtManager.Validate(tokenStr)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(userIDKey).(string)
	return id
}
