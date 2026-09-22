package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/syncforge/backend/internal/auth"
	"github.com/syncforge/backend/internal/collab/room"
	"github.com/syncforge/backend/internal/collab/sync"
	"github.com/syncforge/backend/internal/documents"
	"github.com/syncforge/backend/internal/presence"
	"github.com/syncforge/backend/internal/storage"
	"github.com/syncforge/backend/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	cfg := loadConfig()
	logger := setupLogger(cfg.Env)
	slog.SetDefault(logger)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	db, err := storage.NewDB(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	rdb := storage.NewRedis(cfg.RedisURL)
	defer rdb.Close()

	store := storage.New(db)
	jwtManager := auth.NewJWTManager(cfg.JWTSecret)
	authService := auth.NewService(store, jwtManager)
	docService := documents.NewService(store)
	presenceService := presence.NewService(rdb)
	roomManager := room.NewManager(store, presenceService)
	syncEngine := sync.NewEngine(roomManager, store)
	syncEngine.SetRedis(rdb)
	wsHandler := ws.NewHandler(jwtManager, syncEngine, roomManager, store)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendURL},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context()); err != nil {
			http.Error(w, "database not ready", http.StatusServiceUnavailable)
			return
		}
		if err := rdb.Ping(r.Context()).Err(); err != nil {
			http.Error(w, "redis not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ready")
	})
	r.Handle("/metrics", promhttp.Handler())

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/register", authService.HandleRegister)
		r.Post("/auth/login", authService.HandleLogin)
		r.Post("/auth/logout", authService.HandleLogout)

		r.Group(func(r chi.Router) {
			r.Use(auth.Middleware(jwtManager))

			r.Get("/auth/me", authService.HandleMe)

			r.Post("/documents", docService.HandleCreate)
			r.Get("/documents", docService.HandleList)
			r.Get("/documents/{id}", docService.HandleGet)
			r.Patch("/documents/{id}", docService.HandleUpdate)
			r.Delete("/documents/{id}", docService.HandleDelete)

			r.Get("/documents/{id}/versions", docService.HandleListVersions)
			r.Post("/documents/{id}/versions/{version}/restore", docService.HandleRestore)

			r.Post("/documents/{id}/members", docService.HandleAddMember)
			r.Delete("/documents/{id}/members/{userId}", docService.HandleRemoveMember)
			r.Get("/documents/{id}/members", docService.HandleListMembers)

			r.Post("/documents/{id}/ws-ticket", wsHandler.HandleTicket)
		})
	})

	r.Get("/ws/documents/{id}", wsHandler.HandleConnect)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	roomManager.Shutdown()
	syncEngine.Shutdown()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}
	slog.Info("server stopped")
}

type config struct {
	Port        string
	Env         string
	DatabaseURL string
	RedisURL    string
	JWTSecret   string
	FrontendURL string
}

func loadConfig() config {
	return config{
		Port:        envOr("PORT", "8080"),
		Env:         envOr("ENV", "development"),
		DatabaseURL: envOr("DATABASE_URL", "postgres://syncforge:syncforge@localhost:5432/syncforge?sslmode=disable"),
		RedisURL:    envOr("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:   envOr("JWT_SECRET", "dev-secret-change-in-production"),
		FrontendURL: envOr("FRONTEND_URL", "http://localhost:3000"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func setupLogger(env string) *slog.Logger {
	if env == "production" {
		return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
}
