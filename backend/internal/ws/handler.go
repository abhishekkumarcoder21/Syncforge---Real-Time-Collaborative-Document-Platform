package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/syncforge/backend/internal/auth"
	"github.com/syncforge/backend/internal/collab/crdt"
	"github.com/syncforge/backend/internal/collab/room"
	syncpkg "github.com/syncforge/backend/internal/collab/sync"
	"github.com/syncforge/backend/internal/metrics"
	"github.com/syncforge/backend/internal/storage"
	"nhooyr.io/websocket"
)

const (
	writeTimeout  = 10 * time.Second
	readLimit     = 65536 // 64KB
	sendBufSize   = 64
	pongTimeout   = 30 * time.Second
	cursorThrottleMs = 100
)

type Handler struct {
	jwt    *auth.JWTManager
	sync   *syncpkg.Engine
	rooms  *room.Manager
	store  *storage.Store
}

func NewHandler(jwt *auth.JWTManager, sync *syncpkg.Engine, rooms *room.Manager, store *storage.Store) *Handler {
	return &Handler{jwt: jwt, sync: sync, rooms: rooms, store: store}
}

// HandleTicket issues a short-lived ticket for WebSocket authentication.
func (h *Handler) HandleTicket(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	docID := chi.URLParam(r, "id")

	role, err := h.store.GetUserRole(r.Context(), docID, userID)
	if err != nil || role == "" {
		http.Error(w, `{"error":"document not found or no access"}`, http.StatusNotFound)
		return
	}

	ticket, err := h.jwt.IssueTicket(userID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ticket": ticket})
}

// HandleConnect upgrades to WebSocket and runs the collaboration loop.
func (h *Handler) HandleConnect(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	ticket := r.URL.Query().Get("ticket")

	if ticket == "" {
		http.Error(w, "missing ticket", http.StatusUnauthorized)
		return
	}

	userID, err := h.jwt.Validate(ticket)
	if err != nil {
		http.Error(w, "invalid ticket", http.StatusUnauthorized)
		return
	}

	role, err := h.store.GetUserRole(r.Context(), docID, userID)
	if err != nil || role == "" {
		http.Error(w, "no access", http.StatusForbidden)
		return
	}

	user, err := h.store.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}

	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // configured properly in production
	})
	if err != nil {
		slog.Error("websocket accept", "error", err)
		return
	}
	ws.SetReadLimit(readLimit)

	rm, err := h.rooms.GetOrCreateRoom(docID)
	if err != nil {
		slog.Error("get room", "error", err, "doc_id", docID)
		ws.Close(websocket.StatusInternalError, "room error")
		return
	}

	conn := &room.Conn{
		UserID:   userID,
		UserName: user.Name,
		Send:     make(chan []byte, sendBufSize),
	}

	h.rooms.Join(rm, conn)
	metrics.ActiveConnections.Inc()
	defer metrics.ActiveConnections.Dec()
	slog.Info("ws_connected", "user_id", userID, "doc_id", docID)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Writer goroutine
	go func() {
		defer cancel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-conn.Send:
				if !ok {
					return
				}
				writeCtx, writeCancel := context.WithTimeout(ctx, writeTimeout)
				err := ws.Write(writeCtx, websocket.MessageText, msg)
				writeCancel()
				if err != nil {
					return
				}
			}
		}
	}()

	// Reader loop
	h.readLoop(ctx, ws, rm, conn, role)

	h.rooms.Leave(rm, conn)
	ws.Close(websocket.StatusNormalClosure, "")
	slog.Info("ws_disconnected", "user_id", userID, "doc_id", docID)
}

type wsMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func (h *Handler) readLoop(ctx context.Context, ws *websocket.Conn, rm *room.Room, conn *room.Conn, role string) {
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return
		}

		var msg wsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			sendError(conn, "invalid message format")
			continue
		}

		switch msg.Type {
		case "sync_request":
			h.handleSyncRequest(rm, conn)

		case "operation":
			if role == "viewer" {
				sendError(conn, "viewers cannot edit")
				continue
			}
			h.handleOperation(rm, conn, msg.Payload)

		case "cursor":
			h.handleCursor(rm, conn, msg.Payload)

		default:
			sendError(conn, "unknown message type")
		}
	}
}

func (h *Handler) handleSyncRequest(rm *room.Room, conn *room.Conn) {
	state, err := h.sync.GetSyncState(rm)
	if err != nil {
		slog.Error("get sync state", "error", err)
		sendError(conn, "sync failed")
		return
	}
	select {
	case conn.Send <- state:
	default:
	}
}

func (h *Handler) handleOperation(rm *room.Room, conn *room.Conn, payload json.RawMessage) {
	var op crdt.Operation
	if err := json.Unmarshal(payload, &op); err != nil {
		sendError(conn, "invalid operation")
		return
	}

	if op.ID.IsZero() {
		sendError(conn, "operation missing ID")
		return
	}

	if err := h.sync.HandleOperation(rm, conn, op); err != nil {
		slog.Warn("operation rejected", "error", err, "op_id", op.ID)
		sendError(conn, "operation rejected: "+err.Error())
	}
}

func (h *Handler) handleCursor(rm *room.Room, conn *room.Conn, payload json.RawMessage) {
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "cursor",
		"payload": map[string]interface{}{
			"user_id":  conn.UserID,
			"user_name": conn.UserName,
			"position": payload,
		},
	})
	rm.Broadcast(msg, conn)
}

func sendError(conn *room.Conn, message string) {
	msg, _ := json.Marshal(map[string]interface{}{
		"type":    "error",
		"payload": map[string]string{"message": message},
	})
	select {
	case conn.Send <- msg:
	default:
	}
}

