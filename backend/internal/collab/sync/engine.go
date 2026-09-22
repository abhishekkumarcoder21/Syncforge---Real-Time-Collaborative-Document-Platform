package sync

import (
	"context"
	"encoding/json"
	"log/slog"
	gosync "sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/syncforge/backend/internal/collab/crdt"
	"github.com/syncforge/backend/internal/collab/room"
	"github.com/syncforge/backend/internal/metrics"
	"github.com/syncforge/backend/internal/storage"
)

const (
	snapshotOpThreshold   = 100
	snapshotTimeThreshold = 60 * time.Second
	persistInterval       = 5 * time.Second
)

// Engine orchestrates operation flow: validate → apply → broadcast → persist.
type Engine struct {
	rooms *room.Manager
	store *storage.Store
	rdb   *redis.Client

	pendingOps   map[string][]pendingOp // documentID → ops to persist
	pendingMu    gosync.Mutex
	lastSnapshot map[string]time.Time

	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

type pendingOp struct {
	Op   crdt.Operation
	Data []byte
}

func NewEngine(rooms *room.Manager, store *storage.Store) *Engine {
	ctx, cancel := context.WithCancel(context.Background())
	e := &Engine{
		rooms:        rooms,
		store:        store,
		pendingOps:   make(map[string][]pendingOp),
		lastSnapshot: make(map[string]time.Time),
		ctx:          ctx,
		cancel:       cancel,
		done:         make(chan struct{}),
	}
	go e.persistLoop()
	return e
}

func (e *Engine) SetRedis(rdb *redis.Client) {
	e.rdb = rdb
}

// HandleOperation processes an incoming operation from a client.
func (e *Engine) HandleOperation(r *room.Room, conn *room.Conn, op crdt.Operation) error {
	start := time.Now()
	defer func() {
		metrics.OperationLatency.Observe(time.Since(start).Seconds())
	}()

	opTypeStr := "insert"
	if op.Type == crdt.OpDelete {
		opTypeStr = "delete"
	}
	metrics.OperationsTotal.WithLabelValues(opTypeStr).Inc()

	applied, err := r.RGA.Apply(op)
	if err != nil {
		return err
	}
	if !applied {
		return nil // duplicate, silently ignore
	}

	// Broadcast to other clients
	msg, _ := json.Marshal(map[string]interface{}{
		"type":    "operation",
		"payload": op,
	})
	r.Broadcast(msg, conn)

	// Send ack to sender
	ack, _ := json.Marshal(map[string]interface{}{
		"type": "ack",
		"payload": map[string]interface{}{
			"id": op.ID,
		},
	})
	select {
	case conn.Send <- ack:
	default:
	}

	// Queue for persistence
	opData, _ := json.Marshal(op)
	e.pendingMu.Lock()
	e.pendingOps[r.DocumentID] = append(e.pendingOps[r.DocumentID], pendingOp{Op: op, Data: opData})
	r.OpsSinceSnap++
	e.pendingMu.Unlock()

	// Multi-instance synchronization via Redis pub/sub
	if e.rdb != nil {
		go func() {
			pubCtx, pubCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer pubCancel()
			e.rdb.Publish(pubCtx, "doc:"+r.DocumentID, opData)
		}()
	}

	return nil
}

// GetSyncState returns the current document state for a connecting client.
func (e *Engine) GetSyncState(r *room.Room) ([]byte, error) {
	state, err := r.RGA.Marshal()
	if err != nil {
		return nil, err
	}

	resp, err := json.Marshal(map[string]interface{}{
		"type": "sync_response",
		"payload": map[string]interface{}{
			"state":        json.RawMessage(state),
			"snapshot_ver": r.SnapshotVer,
		},
	})
	return resp, err
}

func (e *Engine) persistLoop() {
	defer close(e.done)

	ticker := time.NewTicker(persistInterval)
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			e.flushAll()
			return
		case <-ticker.C:
			e.flushAll()
		}
	}
}

func (e *Engine) flushAll() {
	e.pendingMu.Lock()
	pending := e.pendingOps
	e.pendingOps = make(map[string][]pendingOp)
	e.pendingMu.Unlock()

	for docID, ops := range pending {
		if err := e.persistOps(docID, ops); err != nil {
			slog.Error("persist operations", "error", err, "doc_id", docID, "count", len(ops))
			// Put them back for retry
			e.pendingMu.Lock()
			e.pendingOps[docID] = append(ops, e.pendingOps[docID]...)
			e.pendingMu.Unlock()
		}
	}
}

func (e *Engine) persistOps(docID string, ops []pendingOp) error {
	start := time.Now()
	defer func() {
		metrics.PersistenceDuration.Observe(time.Since(start).Seconds())
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get the room to read snapshot version
	r, err := e.rooms.GetOrCreateRoom(docID)
	if err != nil {
		metrics.PersistenceErrors.Inc()
		return err
	}

	records := make([]storage.OpRecord, len(ops))
	for i, op := range ops {
		records[i] = storage.OpRecord{
			Data:      op.Data,
			ReplicaID: op.Op.ID.ReplicaID,
			Counter:   op.Op.ID.Counter,
		}
	}

	if err := e.store.SaveOperations(ctx, docID, r.SnapshotVer, records); err != nil {
		metrics.PersistenceErrors.Inc()
		return err
	}

	// Check if we should create a snapshot
	e.pendingMu.Lock()
	opsSinceSnap := r.OpsSinceSnap
	lastSnap := e.lastSnapshot[docID]
	e.pendingMu.Unlock()

	if opsSinceSnap >= snapshotOpThreshold || (opsSinceSnap > 0 && time.Since(lastSnap) > snapshotTimeThreshold) {
		if err := e.createSnapshot(ctx, r); err != nil {
			slog.Error("create snapshot", "error", err, "doc_id", docID)
			// Non-fatal — ops are already persisted
		}
	}

	e.store.TouchDocument(ctx, docID)
	return nil
}

func (e *Engine) createSnapshot(ctx context.Context, r *room.Room) error {
	newVersion := r.SnapshotVer + 1
	content := r.RGA.Content()
	crdtState, err := r.RGA.Marshal()
	if err != nil {
		return err
	}

	if err := e.store.SaveSnapshot(ctx, r.DocumentID, newVersion, content, crdtState, r.RGA.OpCount(), ""); err != nil {
		return err
	}

	// Clean up old operations
	e.store.DeleteOperationsBeforeSnapshot(ctx, r.DocumentID, newVersion)

	r.SnapshotVer = newVersion
	r.OpsSinceSnap = 0
	e.pendingMu.Lock()
	e.lastSnapshot[r.DocumentID] = time.Now()
	e.pendingMu.Unlock()

	slog.Info("snapshot created", "doc_id", r.DocumentID, "version", newVersion)
	return nil
}

func (e *Engine) Shutdown() {
	e.cancel()
	<-e.done
}
