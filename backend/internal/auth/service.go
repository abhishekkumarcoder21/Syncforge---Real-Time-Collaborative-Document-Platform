package auth

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/syncforge/backend/internal/storage"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	store      *storage.Store
	jwtManager *JWTManager
}

func NewService(store *storage.Store, jwtManager *JWTManager) *Service {
	return &Service{store: store, jwtManager: jwtManager}
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	User  *storage.User `json:"user"`
	Token string        `json:"token"`
}

func (s *Service) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)

	if req.Email == "" || req.Password == "" || req.Name == "" {
		http.Error(w, `{"error":"email, password, and name are required"}`, http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 {
		http.Error(w, `{"error":"password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	existing, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		slog.Error("check existing user", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if existing != nil {
		http.Error(w, `{"error":"email already registered"}`, http.StatusConflict)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		slog.Error("hash password", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	user, err := s.store.CreateUser(r.Context(), req.Email, string(hash), req.Name)
	if err != nil {
		slog.Error("create user", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	token, err := s.jwtManager.Issue(user.ID)
	if err != nil {
		slog.Error("issue token", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	setTokenCookie(w, token)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(authResponse{User: user, Token: token})
}

func (s *Service) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	user, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		slog.Error("get user", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if user == nil {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	token, err := s.jwtManager.Issue(user.ID)
	if err != nil {
		slog.Error("issue token", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	setTokenCookie(w, token)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{User: user, Token: token})
}

func (s *Service) HandleMe(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	user, err := s.store.GetUserByID(r.Context(), userID)
	if err != nil {
		slog.Error("get current user", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if user == nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (s *Service) HandleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusOK)
}

func setTokenCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		MaxAge:   int(24 * time.Hour / time.Second),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
