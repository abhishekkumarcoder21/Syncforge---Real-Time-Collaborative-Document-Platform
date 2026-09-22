.PHONY: all dev build test test-crdt migrate-up migrate-down backend frontend docker-up docker-down clean

# Variables
DB_URL ?= postgres://syncforge:syncforge@localhost:5432/syncforge?sslmode=disable
REDIS_URL ?= redis://localhost:6379/0

all: build

# Start infrastructure (Postgres + Redis)
docker-up:
	docker compose up -d postgres redis

docker-down:
	docker compose down

# Run backend development server
backend:
	cd backend && go run ./cmd/server/main.go

# Run frontend development server
frontend:
	cd frontend && npm run dev

# Run all unit tests
test:
	cd backend && go test -v ./...

# Run CRDT convergence and property tests
test-crdt:
	cd backend && go test -v ./internal/collab/crdt/...

# Run database migrations
migrate-up:
	docker compose run --rm migrate up

migrate-down:
	docker compose run --rm migrate down

# Build production artifacts
build-backend:
	cd backend && go build -o bin/syncforge ./cmd/server/main.go

build-frontend:
	cd frontend && npm run build

build: build-backend build-frontend

# Run simulated multi-client collaboration test
test-collab:
	cd backend && go test -v ./internal/collab/crdt/... -run TestConvergenceWithInitialDocument

clean:
	rm -rf backend/bin frontend/.next
