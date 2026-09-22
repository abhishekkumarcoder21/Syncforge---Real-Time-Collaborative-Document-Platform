# SyncForge System Architecture

## Overview

SyncForge is a high-performance, real-time collaborative document platform built with a modular Go backend and a Next.js (React 19) frontend. It utilizes a custom Replicated Growable Array (RGA) Conflict-Free Replicated Data Type (CRDT) to achieve mathematical eventual consistency across all distributed replicas without requiring centralized lock coordination.

```
                     ┌─────────────────────────────┐
                     │     Next.js Web Client      │
                     │  (Optimistic RGA + React)   │
                     └──────────────┬──────────────┘
                                    │
                              HTTP / WebSocket
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │      Go Server Node         │
                     │                             │
                     │  ┌── HTTP REST API ───────┐ │
                     │  ├── WebSocket Manager ───┤ │
                     │  ├── Room Collaboration ──┤ │
                     │  ├── Sync Engine ─────────┤ │
                     │  ├── Authoritative RGA ───┤ │
                     │  └── Batched Persistence ─┘ │
                     └──────────┬────────┬─────────┘
                                │        │
                       PostgreSQL        Redis
                     (Snapshots & Ops) (Presence & PubSub)
```

## Backend Components

### 1. HTTP API (`internal/documents`, `internal/auth`)
- **Authentication**: JWT issuance, bcrypt password hashing, and cookie/bearer token validation.
- **Document CRUD**: Creation, listing, metadata updates, and cascading deletion.
- **Sharing & Membership**: Role-based access control (`owner`, `editor`, `viewer`).
- **Version History**: Snapshot retrieval and point-in-time document state restoration.
- **WebSocket Ticket Service**: Issues short-lived (30s), single-use tickets to prevent exposing long-lived auth credentials in WebSocket URLs.

### 2. WebSocket Manager (`internal/ws`)
- Upgrades incoming HTTP connections using `nhooyr.io/websocket`.
- Enforces a 64KB maximum message size limit to protect against denial-of-service memory exhaustion.
- Runs concurrent, decoupled reader and writer goroutines per connection with buffered message channels.
- Manages connection lifecycle and reports active connection metrics to Prometheus.

### 3. Room Manager (`internal/collab/room`)
- Manages active collaboration rooms on a per-document basis.
- When the first client connects to a document, loads the latest snapshot and replays subsequent operations to reconstruct the authoritative RGA in memory.
- Handles atomic peer joining, leaving, and broadcast distribution.
- Integrates with Redis presence to broadcast online collaborator rosters to all participants.

### 4. Sync Engine (`internal/collab/sync`)
- Orchestrates the full lifecycle of an edit operation:
  1. Validates operation structure and replica identifiers.
  2. Applies operation to the in-memory RGA CRDT.
  3. Broadcasts the operation to all other connected room clients.
  4. Returns an acknowledgment (`ack`) to the originating client.
  5. Queues the operation for batched database persistence.
  6. Publishes to Redis channel `doc:{id}` for cross-instance propagation.
- **Periodic Snapshot Trigger**: Automatically captures a snapshot when 100 operations have accumulated or after 60 seconds of active editing, pruning older operation logs.

### 5. Ephemeral Presence & Cursors (`internal/presence`)
- Ephemeral user states stored in Redis hashes with a 60-second TTL.
- Throttled cursor updates (maximum 1 update per 100ms per client) to minimize broadcast overhead while maintaining smooth UI feedback.
