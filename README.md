<div align="center">

# ⚡ SyncForge

### Real-Time Collaborative Document Platform

**Built with mathematical precision. Powered by CRDTs. Designed for engineers.**

[![Go](https://img.shields.io/badge/Go-1.27-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis_7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

*A portfolio-grade distributed system demonstrating real-time collaboration, conflict-free state synchronization, and production-quality engineering.*

<br />

[**Getting Started**](#-quick-start) · [**Architecture**](#-architecture) · [**Tech Stack**](#-tech-stack) · [**Documentation**](docs/)

---

</div>

## 🎯 What is SyncForge?

SyncForge is **not** a toy text editor. It's a ground-up implementation of a real-time collaborative document platform that demonstrates mastery of:

| Domain | Implementation |
|---|---|
| **Distributed State** | Custom RGA (Replicated Growable Array) CRDT with Lamport timestamps |
| **Real-Time Sync** | WebSocket protocol with ticket-based authentication |
| **Conflict Resolution** | Deterministic convergence — any operation order, same result |
| **Optimistic UI** | Instant local renders, async remote integration |
| **Offline Resilience** | Edit queuing, automatic replay on reconnect |
| **Persistence** | Batched snapshot + operation log with version history |
| **Presence** | Live cursors & user awareness via Redis pub/sub |
| **Observability** | Prometheus metrics, structured logging, health checks |
| **Horizontal Scale** | Multi-instance coordination via Redis pub/sub channels |

> **The CRDT implementation is written from scratch** — no Yjs, no Automerge — to demonstrate a deep understanding of the underlying distributed systems theory.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     BROWSER (Next.js 16 / React 19)              │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Optimistic │  │  Client   │  │ Presence  │  │    CRDT      │  │
│  │    UI      │◄─┤ WebSocket ├──┤  Cursors  │  │  Inspector   │  │
│  │  Renders   │  │  Client   │  │  Overlay  │  │  (Debug UI)  │  │
│  └────────────┘  └─────┬─────┘  └──────────┘  └──────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │  WebSocket (wss://)
                          │  + Ticket Auth
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                      GO SERVER CLUSTER                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    Chi HTTP Router                        │    │
│  │   /api/auth/*  /api/documents/*  /api/ws/*  /metrics     │    │
│  └──────────────────────────┬───────────────────────────────┘    │
│                             │                                    │
│  ┌──────────┐  ┌────────────┴───────────┐  ┌────────────────┐   │
│  │   Auth   │  │    Room Manager        │  │   Sync Engine  │   │
│  │ Service  │  │  (per-doc goroutine)   │  │  (batch flush) │   │
│  │ JWT+BCrypt│  │  Authoritative RGA    │  │  100 ops/60s   │   │
│  └──────────┘  └───────────┬────────────┘  └───────┬────────┘   │
│                            │                        │            │
│              ┌─────────────┴────────────────────────┘            │
│              ▼                                                   │
│  ┌─────────────────────┐          ┌────────────────────────┐     │
│  │    PostgreSQL 16    │          │      Redis 7           │     │
│  │  ┌───────────────┐  │          │  ┌──────────────────┐  │     │
│  │  │  Snapshots    │  │          │  │  Pub/Sub         │  │     │
│  │  │  (BYTEA CRDT) │  │          │  │  doc:{id}        │  │     │
│  │  ├───────────────┤  │          │  ├──────────────────┤  │     │
│  │  │  Op Log       │  │          │  │  Presence TTL    │  │     │
│  │  │  (BYTEA ops)  │  │          │  │  (60s heartbeat) │  │     │
│  │  ├───────────────┤  │          │  └──────────────────┘  │     │
│  │  │  Users/Docs   │  │          └────────────────────────┘     │
│  │  │  Members      │  │                                         │
│  │  └───────────────┘  │                                         │
│  └─────────────────────┘                                         │
└──────────────────────────────────────────────────────────────────┘
```

### How the CRDT Works

SyncForge implements a **Replicated Growable Array (RGA)** — a sequence CRDT that guarantees eventual consistency without a central coordinator:

```
User A types "Hi"          User B types "Hey"           Both see "HHeiय" → converge!
                                                         
  ┌─────┐    ┌─────┐       ┌─────┐    ┌─────┐           After merging all operations:
  │  H  │───►│  i  │       │  H  │───►│ e,y │           ┌───┬───┬───┬───┬───┐
  │ A:1 │    │ A:2 │       │ B:1 │    │B:2,3│           │ H │ H │ e │ i │ y │
  └─────┘    └─────┘       └─────┘    └─────┘           └───┴───┴───┴───┴───┘
                                                         Deterministic order via
                                                         Lamport TS + ReplicaID
```

Each character is a node with:
- **`OpID`** — globally unique `(ReplicaID, Counter)` pair
- **`Timestamp`** — Lamport logical clock for causal ordering
- **`Tombstone`** — soft-delete flag (deleted chars remain for convergence)

> **Convergence guarantee**: Given the same set of operations in _any_ order, all replicas produce the _identical_ document. Verified by **15+ convergence tests** across all 6 permutations of 3-replica concurrent edits.

---

## 🚀 Quick Start

### Option 1: Docker Compose (One Command)

```bash
git clone https://github.com/your-username/syncforge.git
cd syncforge

# Starts PostgreSQL, Redis, runs migrations, builds backend + frontend
docker compose up --build
```

| Service | URL |
|---|---|
| 🌐 **Frontend** | [http://localhost:3000](http://localhost:3000) |
| ⚙️ **Backend API** | [http://localhost:8080](http://localhost:8080) |
| 📊 **Prometheus Metrics** | [http://localhost:8080/metrics](http://localhost:8080/metrics) |
| 💚 **Health Check** | [http://localhost:8080/health](http://localhost:8080/health) |

### Option 2: Local Development

**Prerequisites**: Go 1.24+, Node.js 20+, Docker

```bash
# 1. Start Postgres & Redis
docker compose up -d postgres redis

# 2. Run database migrations
docker compose run --rm migrate \
  -path /migrations \
  -database "postgres://syncforge:syncforge@postgres:5432/syncforge?sslmode=disable" up

# 3. Start the Go backend (terminal 1)
cd backend && go run ./cmd/server/main.go

# 4. Start the Next.js frontend (terminal 2)
cd frontend && npm install && npm run dev
```

---

## 🧪 Testing

### CRDT Convergence Tests

```bash
cd backend && go test -v ./internal/collab/crdt/...
```

Runs **15+ test cases** verifying:

| Test Category | What It Proves |
|---|---|
| 3-replica concurrent inserts | All 6 arrival permutations converge |
| Concurrent deletes | Tombstones resolve identically |
| Duplicate operations | Idempotency — reapplying ops is a no-op |
| Randomized sequences | Property-based fuzzing with random seeds |
| Interleaved insert/delete | Mixed workload convergence |
| Single & multi-character | Edge cases at document boundaries |

### Multi-Client Load Test

```bash
go run ./backend/cmd/loadtest/main.go -clients 15 -ops 40
```

Simulates **15 concurrent typers** dispatching 600 local edits and 8,400 cross-network applies — **62,000+ ops/sec** with **100% convergence**.

---

## 📁 Project Structure

```
syncforge/
├── backend/                          # Go modular monolith
│   ├── cmd/
│   │   ├── server/main.go            # Entry point, DI, routes
│   │   └── loadtest/main.go          # Multi-client load simulator
│   ├── internal/
│   │   ├── auth/                     # JWT + bcrypt authentication
│   │   │   ├── jwt.go                # Token generation & validation
│   │   │   ├── middleware.go         # Protected route middleware
│   │   │   └── service.go           # Register / login logic
│   │   ├── collab/
│   │   │   ├── crdt/
│   │   │   │   ├── rga.go           # ⭐ RGA CRDT implementation
│   │   │   │   └── rga_test.go      # 15+ convergence tests
│   │   │   ├── room/
│   │   │   │   └── manager.go       # Per-document room lifecycle
│   │   │   └── sync/
│   │   │       └── engine.go        # Batched persistence engine
│   │   ├── documents/service.go      # CRUD document management
│   │   ├── metrics/metrics.go        # Prometheus instruments
│   │   ├── presence/service.go       # Redis-backed presence + TTL
│   │   ├── storage/
│   │   │   ├── db.go                 # PostgreSQL connection pool (pgx)
│   │   │   ├── queries.go           # All SQL queries
│   │   │   └── redis.go             # Redis client factory
│   │   └── ws/
│   │       └── handler.go           # WebSocket upgrade + read/write loops
│   ├── migrations/
│   │   └── 001_initial_schema.up.sql # Users, documents, snapshots, ops
│   ├── Dockerfile                    # Multi-stage production build
│   ├── go.mod
│   └── go.sum
│
├── frontend/                         # Next.js 16 + React 19
│   ├── app/
│   │   ├── page.tsx                  # Landing page
│   │   ├── login/page.tsx            # Authentication
│   │   ├── register/page.tsx         # User registration
│   │   ├── dashboard/page.tsx        # Document management
│   │   └── documents/[id]/page.tsx   # Collaborative editor
│   ├── components/
│   │   ├── Editor.tsx                # ⭐ CRDT-bound text editor
│   │   ├── CrdtInspector.tsx         # Live RGA visualization
│   │   ├── VersionHistory.tsx        # Snapshot restore UI
│   │   ├── ShareModal.tsx            # Collaborator invitation
│   │   └── Navbar.tsx                # Navigation + auth state
│   ├── lib/
│   │   ├── crdt.ts                   # ⭐ Client-side RGA (TypeScript)
│   │   ├── ws.ts                     # WebSocket client + reconnect
│   │   ├── api.ts                    # REST API client
│   │   └── auth-context.tsx          # React auth context
│   ├── Dockerfile                    # Production Next.js build
│   └── package.json
│
├── docs/
│   ├── architecture.md               # System design deep dive
│   ├── crdt.md                       # RGA algorithm & proofs
│   ├── websocket-protocol.md         # Wire protocol specification
│   └── benchmarks.md                 # Performance analysis
│
├── docker-compose.yml                # Full-stack orchestration
├── Makefile                          # Developer shortcuts
└── .github/workflows/ci.yml         # GitHub Actions CI pipeline
```

---

## 🔧 Tech Stack

<table>
  <tr>
    <th>Layer</th>
    <th>Technology</th>
    <th>Why</th>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>Go 1.27</td>
    <td>Goroutine-per-room concurrency, zero-alloc JSON, native WebSocket support</td>
  </tr>
  <tr>
    <td><strong>HTTP Router</strong></td>
    <td>Chi v5</td>
    <td>Lightweight, composable middleware, stdlib <code>net/http</code> compatible</td>
  </tr>
  <tr>
    <td><strong>WebSockets</strong></td>
    <td>nhooyr.io/websocket</td>
    <td>Production-grade, context-aware, handles ping/pong automatically</td>
  </tr>
  <tr>
    <td><strong>Database</strong></td>
    <td>PostgreSQL 16 + pgx</td>
    <td>BYTEA for CRDT snapshots, connection pooling, prepared statements</td>
  </tr>
  <tr>
    <td><strong>Cache / PubSub</strong></td>
    <td>Redis 7</td>
    <td>Presence TTLs, cross-instance operation broadcasting</td>
  </tr>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>Next.js 16 + React 19</td>
    <td>App Router, Server Components, Turbopack for fast dev</td>
  </tr>
  <tr>
    <td><strong>Styling</strong></td>
    <td>Tailwind CSS 4</td>
    <td>Utility-first, dark mode, responsive design system</td>
  </tr>
  <tr>
    <td><strong>Auth</strong></td>
    <td>JWT + bcrypt</td>
    <td>Stateless tokens, secure password hashing</td>
  </tr>
  <tr>
    <td><strong>Metrics</strong></td>
    <td>Prometheus</td>
    <td>Industry-standard observability, Grafana-ready</td>
  </tr>
  <tr>
    <td><strong>Migrations</strong></td>
    <td>golang-migrate</td>
    <td>Versioned, repeatable, CI-friendly schema management</td>
  </tr>
  <tr>
    <td><strong>CI/CD</strong></td>
    <td>GitHub Actions</td>
    <td>Automated testing, linting, Docker build verification</td>
  </tr>
</table>

---

## 📡 WebSocket Protocol

All real-time communication uses a JSON message protocol over WebSockets:

```jsonc
// Client → Server: Insert character
{
  "type": "operation",
  "payload": {
    "type": 0,              // OpInsert
    "id": {"r": "abc-123", "c": 42},
    "after": {"r": "abc-123", "c": 41},
    "value": "H",
    "timestamp": 184
  }
}

// Server → Client: Presence update
{
  "type": "presence",
  "payload": {
    "user_id": "...",
    "name": "Alice",
    "cursor_pos": 27,
    "color": "#6366f1"
  }
}

// Client → Server: Request full sync (reconnection)
{ "type": "sync_request" }

// Server → Client: Full document state
{
  "type": "sync_response",
  "payload": { "nodes": [...], "clock": 184 }
}
```

> See the full protocol specification in [docs/websocket-protocol.md](docs/websocket-protocol.md)

---

## 📊 Observability

SyncForge exposes Prometheus metrics at `/metrics`:

| Metric | Type | Description |
|---|---|---|
| `syncforge_ws_connections_active` | Gauge | Current WebSocket connections |
| `syncforge_ws_messages_total` | Counter | Messages received (by type) |
| `syncforge_ops_applied_total` | Counter | CRDT operations applied |
| `syncforge_sync_flush_duration_seconds` | Histogram | Persistence batch flush latency |
| `syncforge_rooms_active` | Gauge | Active collaboration rooms |

```bash
# Quick check
curl http://localhost:8080/metrics | grep syncforge
```

---

## 🧠 Key Engineering Decisions

| Decision | Rationale |
|---|---|
| **Custom RGA vs Yjs/Automerge** | Demonstrates understanding of CRDT theory, not library usage |
| **Go over Node.js backend** | Goroutine-per-room is natural; no callback hell for concurrent state |
| **Ticket-based WS auth** | Avoids exposing JWT in WebSocket URL query strings |
| **Batched persistence** | Amortizes I/O — flush every 100 ops or 60 seconds |
| **Dual CRDT (Go + TS)** | Server is authoritative; client is optimistic — both must converge |
| **Tombstone deletes** | Required for CRDT correctness — deleted chars stay as invisible nodes |
| **Lamport clocks** | Lightweight causality tracking without vector clocks |
| **Binary snapshots** | BYTEA in Postgres — fast serialization, compact storage |

---

## 📖 Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | System design, component interactions, data flow |
| [RGA CRDT Algorithm](docs/crdt.md) | Mathematical proofs, convergence guarantees |
| [WebSocket Protocol](docs/websocket-protocol.md) | Message types, authentication flow, reconnection |
| [Benchmarks](docs/benchmarks.md) | Performance numbers, load test methodology |

---

## 🗺️ Roadmap

- [ ] Rich text formatting (marks, headings, lists)
- [ ] Cursor position broadcasting with colored carets
- [ ] RGA garbage collection (tombstone compaction)
- [ ] End-to-end encryption
- [ ] Multi-region deployment with CockroachDB
- [ ] Mobile-responsive editor
- [ ] Operational transform fallback mode
- [ ] Rate limiting & abuse prevention

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
# Make your changes
go test ./...                    # Backend tests pass
cd frontend && npm run build     # Frontend builds clean
git commit -m "feat: your feature"
git push origin feature/your-feature
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ to demonstrate real distributed systems engineering.**

*Not just another CRUD app.*

<br />

⭐ Star this repo if you found it useful!

</div>