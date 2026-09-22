package room

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/syncforge/backend/internal/collab/crdt"
	"github.com/syncforge/backend/internal/presence"
	"github.com/syncforge/backend/internal/storage"
)

// Conn represents a connected client in a room.
type Conn struct {
	UserID   string
	UserName string
	Send     chan []byte
}

// Room manages a single document's collaboration state.
type Room struct {
	mu          sync.RWMutex
	DocumentID  string
	RGA         *crdt.RGA
	Connections map[*Conn]struct{}
	SnapshotVer int // current snapshot version this room is based on
	OpsSinceSnap int
}

// Broadcast sends a message to all connections except the sender.
func (r *Room) Broadcast(msg []byte, except *Conn) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for conn := range r.Connections {
		if conn == except {
			continue
		}
		select {
		case conn.Send <- msg:
		default:
			slog.Warn("dropping message, send buffer full", "user_id", conn.UserID, "doc_id", r.DocumentID)
		}
	}
}

// BroadcastAll sends to all connections including sender.
func (r *Room) BroadcastAll(msg []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for conn := range r.Connections {
		select {
		case conn.Send <- msg:
		default:
		}
	}
}

// Manager manages document rooms.
type Manager struct {
	mu       sync.RWMutex
	rooms    map[string]*Room
	store    *storage.Store
	presence *presence.Service
}

func NewManager(store *storage.Store, presence *presence.Service) *Manager {
	return &Manager{
		rooms:    make(map[string]*Room),
		store:    store,
		presence: presence,
	}
}

// GetOrCreateRoom returns the room for a document, loading state from the database if needed.
func (m *Manager) GetOrCreateRoom(documentID string) (*Room, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[documentID]; ok {
		return r, nil
	}

	rga, snapshotVer, err := m.loadDocumentState(documentID)
	if err != nil {
		return nil, err
	}

	r := &Room{
		DocumentID:  documentID,
		RGA:         rga,
		Connections: make(map[*Conn]struct{}),
		SnapshotVer: snapshotVer,
	}
	m.rooms[documentID] = r
	return r, nil
}

func (m *Manager) loadDocumentState(documentID string) (*crdt.RGA, int, error) {
	ctx := context.Background()

	snap, err := m.store.GetLatestSnapshot(ctx, documentID)
	if err != nil {
		return nil, 0, err
	}

	if snap == nil {
		return crdt.NewRGA(), 0, nil
	}

	rga, err := crdt.Unmarshal(snap.CRDTState)
	if err != nil {
		return nil, 0, err
	}

	// Replay operations after the snapshot
	opData, err := m.store.GetOperationsAfterSnapshot(ctx, documentID, snap.Version)
	if err != nil {
		return nil, snap.Version, err
	}

	for _, data := range opData {
		var op crdt.Operation
		if err := json.Unmarshal(data, &op); err != nil {
			slog.Warn("skip invalid op during replay", "error", err)
			continue
		}
		rga.Apply(op)
	}

	return rga, snap.Version, nil
}

// Join adds a connection to a room and broadcasts presence.
func (m *Manager) Join(r *Room, conn *Conn) {
	r.mu.Lock()
	r.Connections[conn] = struct{}{}
	r.mu.Unlock()

	m.presence.SetPresence(r.DocumentID, conn.UserID, conn.UserName)
	m.broadcastPresence(r)
}

// Leave removes a connection from a room.
func (m *Manager) Leave(r *Room, conn *Conn) {
	r.mu.Lock()
	delete(r.Connections, conn)
	empty := len(r.Connections) == 0
	r.mu.Unlock()

	close(conn.Send)
	m.presence.RemovePresence(r.DocumentID, conn.UserID)
	m.broadcastPresence(r)

	if empty {
		m.mu.Lock()
		// Double-check: room might have gotten a new connection
		r.mu.RLock()
		stillEmpty := len(r.Connections) == 0
		r.mu.RUnlock()
		if stillEmpty {
			delete(m.rooms, r.DocumentID)
		}
		m.mu.Unlock()
	}
}

func (m *Manager) broadcastPresence(r *Room) {
	users, err := m.presence.GetPresence(r.DocumentID)
	if err != nil {
		slog.Error("get presence", "error", err, "doc_id", r.DocumentID)
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type":    "presence",
		"payload": users,
	})
	r.BroadcastAll(msg)
}

// ActiveRoomCount returns the number of active rooms.
func (m *Manager) ActiveRoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

// Shutdown cleanly closes all rooms.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, r := range m.rooms {
		r.mu.Lock()
		for conn := range r.Connections {
			close(conn.Send)
			delete(r.Connections, conn)
		}
		r.mu.Unlock()
	}
	m.rooms = make(map[string]*Room)
}
