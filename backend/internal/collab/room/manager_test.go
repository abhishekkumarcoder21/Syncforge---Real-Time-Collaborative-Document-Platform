package room

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/syncforge/backend/internal/collab/crdt"
	"github.com/syncforge/backend/internal/presence"
)

func drainPresenceMessages(ch chan []byte) []byte {
	for {
		select {
		case msg := <-ch:
			var parsed map[string]interface{}
			if err := json.Unmarshal(msg, &parsed); err == nil && parsed["type"] == "presence" {
				continue
			}
			return msg
		case <-time.After(500 * time.Millisecond):
			return nil
		}
	}
}

func TestRoomMultiClientBroadcast(t *testing.T) {
	pService := presence.NewService(nil)
	mgr := NewManager(nil, pService)

	room := &Room{
		DocumentID:  "doc-test-1",
		RGA:         crdt.NewRGA(),
		Connections: make(map[*Conn]struct{}),
		SnapshotVer: 0,
	}

	conn1 := &Conn{
		UserID:   "user-1",
		UserName: "Alice",
		Send:     make(chan []byte, 10),
	}
	conn2 := &Conn{
		UserID:   "user-2",
		UserName: "Bob",
		Send:     make(chan []byte, 10),
	}
	conn3 := &Conn{
		UserID:   "user-3",
		UserName: "Charlie",
		Send:     make(chan []byte, 10),
	}

	mgr.Join(room, conn1)
	mgr.Join(room, conn2)
	mgr.Join(room, conn3)

	assert.Equal(t, 3, len(room.Connections))

	// Test Broadcast to all except sender
	testMsg := []byte(`{"type":"operation","payload":"insert"}`)
	room.Broadcast(testMsg, conn1)

	msg2 := drainPresenceMessages(conn2.Send)
	require.NotNil(t, msg2, "conn2 should receive non-presence message")
	assert.Equal(t, string(testMsg), string(msg2))

	msg3 := drainPresenceMessages(conn3.Send)
	require.NotNil(t, msg3, "conn3 should receive non-presence message")
	assert.Equal(t, string(testMsg), string(msg3))

	// Leave
	mgr.Leave(room, conn1)
	assert.Equal(t, 2, len(room.Connections))

	mgr.Leave(room, conn2)
	mgr.Leave(room, conn3)
	assert.Equal(t, 0, len(room.Connections))
}

func TestRoomConcurrentOperations(t *testing.T) {
	rga := crdt.NewRGA()
	room := &Room{
		DocumentID:  "doc-concurrent-test",
		RGA:         rga,
		Connections: make(map[*Conn]struct{}),
	}

	head := crdt.OpID{}
	opA := crdt.Operation{
		ID:       crdt.OpID{ReplicaID: "Alice", Counter: 1},
		Type:     crdt.OpInsert,
		ParentID: head,
		Char:     'A',
		Ts:       1,
	}
	opB := crdt.Operation{
		ID:       crdt.OpID{ReplicaID: "Bob", Counter: 1},
		Type:     crdt.OpInsert,
		ParentID: head,
		Char:     'B',
		Ts:       1,
	}

	appliedA, errA := room.RGA.Apply(opA)
	require.NoError(t, errA)
	assert.True(t, appliedA)

	appliedB, errB := room.RGA.Apply(opB)
	require.NoError(t, errB)
	assert.True(t, appliedB)

	// In this RGA, smaller replica ID ("Alice" < "Bob") is placed to the left
	assert.Equal(t, "AB", room.RGA.Content())
}
