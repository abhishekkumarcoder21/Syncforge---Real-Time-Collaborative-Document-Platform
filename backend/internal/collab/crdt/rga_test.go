package crdt

import (
	"fmt"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func makeOp(replicaID string, counter uint64, ts uint64, opType OpType, parentID OpID, char rune, targetID OpID) Operation {
	return Operation{
		ID:       OpID{ReplicaID: replicaID, Counter: counter},
		Type:     opType,
		ParentID: parentID,
		Char:     char,
		TargetID: targetID,
		Ts:       ts,
	}
}

func insertOp(replica string, counter, ts uint64, parent OpID, ch rune) Operation {
	return makeOp(replica, counter, ts, OpInsert, parent, ch, OpID{})
}

func deleteOp(replica string, counter, ts uint64, target OpID) Operation {
	return makeOp(replica, counter, ts, OpDelete, OpID{}, 0, target)
}

var head = OpID{} // sentinel

func TestBasicInsert(t *testing.T) {
	rga := NewRGA()

	rga.Apply(insertOp("A", 1, 1, head, 'H'))
	rga.Apply(insertOp("A", 2, 2, OpID{"A", 1}, 'i'))

	assert.Equal(t, "Hi", rga.Content())
}

func TestBasicDelete(t *testing.T) {
	rga := NewRGA()

	rga.Apply(insertOp("A", 1, 1, head, 'A'))
	rga.Apply(insertOp("A", 2, 2, OpID{"A", 1}, 'B'))
	rga.Apply(insertOp("A", 3, 3, OpID{"A", 2}, 'C'))

	assert.Equal(t, "ABC", rga.Content())

	rga.Apply(deleteOp("A", 4, 4, OpID{"A", 2}))
	assert.Equal(t, "AC", rga.Content())
}

func TestConcurrentInsertsSamePosition(t *testing.T) {
	// The key convergence test: two replicas insert at the same position.
	// Both must converge to the same state regardless of operation order.

	ops := []Operation{
		insertOp("A", 1, 1, head, 'X'), // A inserts X at start
		insertOp("B", 1, 1, head, 'Y'), // B inserts Y at start (concurrently)
	}

	// Apply in order A, B
	rga1 := NewRGA()
	rga1.Apply(ops[0])
	rga1.Apply(ops[1])

	// Apply in order B, A
	rga2 := NewRGA()
	rga2.Apply(ops[1])
	rga2.Apply(ops[0])

	assert.Equal(t, rga1.Content(), rga2.Content(),
		"replicas must converge regardless of operation order")
	t.Logf("converged content: %q", rga1.Content())
}

func TestConvergenceWithInitialDocument(t *testing.T) {
	// Initial document: ABC
	// Replica A: insert X after A (position 1)
	// Replica B: insert Y after A (position 1) — concurrent

	setup := []Operation{
		insertOp("S", 1, 1, head, 'A'),
		insertOp("S", 2, 2, OpID{"S", 1}, 'B'),
		insertOp("S", 3, 3, OpID{"S", 2}, 'C'),
	}

	concurrent := []Operation{
		insertOp("A", 1, 4, OpID{"S", 1}, 'X'), // A inserts X after 'A'
		insertOp("B", 1, 4, OpID{"S", 1}, 'Y'), // B inserts Y after 'A'
	}

	// Replica 1: setup + A then B
	rga1 := NewRGA()
	for _, op := range setup {
		rga1.Apply(op)
	}
	rga1.Apply(concurrent[0])
	rga1.Apply(concurrent[1])

	// Replica 2: setup + B then A
	rga2 := NewRGA()
	for _, op := range setup {
		rga2.Apply(op)
	}
	rga2.Apply(concurrent[1])
	rga2.Apply(concurrent[0])

	assert.Equal(t, rga1.Content(), rga2.Content())
	t.Logf("converged content: %q", rga1.Content())
}

func TestConcurrentDeleteAndInsert(t *testing.T) {
	setup := []Operation{
		insertOp("S", 1, 1, head, 'A'),
		insertOp("S", 2, 2, OpID{"S", 1}, 'B'),
		insertOp("S", 3, 3, OpID{"S", 2}, 'C'),
	}

	// A deletes B, B inserts X after A — concurrent
	deleteB := deleteOp("A", 1, 4, OpID{"S", 2})
	insertX := insertOp("B", 1, 4, OpID{"S", 1}, 'X')

	rga1 := NewRGA()
	for _, op := range setup {
		rga1.Apply(op)
	}
	rga1.Apply(deleteB)
	rga1.Apply(insertX)

	rga2 := NewRGA()
	for _, op := range setup {
		rga2.Apply(op)
	}
	rga2.Apply(insertX)
	rga2.Apply(deleteB)

	assert.Equal(t, rga1.Content(), rga2.Content())
	t.Logf("converged content: %q", rga1.Content())
}

func TestDuplicateOperation(t *testing.T) {
	rga := NewRGA()

	op := insertOp("A", 1, 1, head, 'X')
	applied1, err := rga.Apply(op)
	require.NoError(t, err)
	assert.True(t, applied1)

	applied2, err := rga.Apply(op)
	require.NoError(t, err)
	assert.False(t, applied2, "duplicate should be detected")

	assert.Equal(t, "X", rga.Content())
}

func TestDuplicateDelete(t *testing.T) {
	rga := NewRGA()

	rga.Apply(insertOp("A", 1, 1, head, 'X'))

	del := deleteOp("A", 2, 2, OpID{"A", 1})
	applied1, _ := rga.Apply(del)
	assert.True(t, applied1)

	applied2, _ := rga.Apply(del)
	assert.False(t, applied2, "duplicate delete should be idempotent")

	assert.Equal(t, "", rga.Content())
}

func TestThreeReplicaConvergence(t *testing.T) {
	setup := []Operation{
		insertOp("S", 1, 1, head, 'A'),
		insertOp("S", 2, 2, OpID{"S", 1}, 'B'),
		insertOp("S", 3, 3, OpID{"S", 2}, 'C'),
	}

	// Three concurrent inserts at position after 'A'
	concurrent := []Operation{
		insertOp("R1", 1, 4, OpID{"S", 1}, 'X'),
		insertOp("R2", 1, 4, OpID{"S", 1}, 'Y'),
		insertOp("R3", 1, 4, OpID{"S", 1}, 'Z'),
	}

	// Try all 6 permutations
	perms := [][]int{
		{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0},
	}

	var results []string
	for _, perm := range perms {
		rga := NewRGA()
		for _, op := range setup {
			rga.Apply(op)
		}
		for _, idx := range perm {
			rga.Apply(concurrent[idx])
		}
		results = append(results, rga.Content())
	}

	for i := 1; i < len(results); i++ {
		assert.Equal(t, results[0], results[i],
			"permutation %d diverged: %q vs %q", i, results[0], results[i])
	}
	t.Logf("all 6 permutations converged to: %q", results[0])
}

func TestSerializeRoundtrip(t *testing.T) {
	rga := NewRGA()
	rga.Apply(insertOp("A", 1, 1, head, 'H'))
	rga.Apply(insertOp("A", 2, 2, OpID{"A", 1}, 'e'))
	rga.Apply(insertOp("A", 3, 3, OpID{"A", 2}, 'l'))
	rga.Apply(insertOp("A", 4, 4, OpID{"A", 3}, 'l'))
	rga.Apply(insertOp("A", 5, 5, OpID{"A", 4}, 'o'))
	rga.Apply(deleteOp("A", 6, 6, OpID{"A", 3})) // delete first 'l'

	data, err := rga.Marshal()
	require.NoError(t, err)

	restored, err := Unmarshal(data)
	require.NoError(t, err)

	assert.Equal(t, rga.Content(), restored.Content())
	assert.Equal(t, rga.OpCount(), restored.OpCount())
}

func TestPropertyConvergence(t *testing.T) {
	// Property-based test: generate random operations on multiple replicas,
	// deliver all operations to all replicas, verify convergence.

	rng := rand.New(rand.NewSource(42))
	const numReplicas = 3
	const opsPerReplica = 20

	// Each replica generates operations
	type replicaState struct {
		rga       *RGA
		replicaID string
		counter   uint64
		ts        uint64
		ops       []Operation
	}

	replicas := make([]*replicaState, numReplicas)
	for i := range replicas {
		replicas[i] = &replicaState{
			rga:       NewRGA(),
			replicaID: fmt.Sprintf("R%d", i),
		}
	}

	// Seed with initial content
	seedOps := []Operation{
		insertOp("seed", 1, 1, head, 'A'),
		insertOp("seed", 2, 2, OpID{"seed", 1}, 'B'),
		insertOp("seed", 3, 3, OpID{"seed", 2}, 'C'),
		insertOp("seed", 4, 4, OpID{"seed", 3}, 'D'),
		insertOp("seed", 5, 5, OpID{"seed", 4}, 'E'),
	}
	for _, r := range replicas {
		for _, op := range seedOps {
			r.rga.Apply(op)
		}
		r.ts = 5
	}

	// Generate random operations on each replica
	for _, r := range replicas {
		for j := 0; j < opsPerReplica; j++ {
			r.ts++
			r.counter++

			visibleLen := r.rga.Len()
			if visibleLen > 0 && rng.Float64() < 0.3 {
				// Delete random visible element
				idx := rng.Intn(visibleLen)
				targetID := r.rga.ElementAtVisibleIndex(idx)
				op := deleteOp(r.replicaID, r.counter, r.ts, targetID)
				r.rga.Apply(op)
				r.ops = append(r.ops, op)
			} else {
				// Insert random character at random position
				idx := -1
				if visibleLen > 0 {
					idx = rng.Intn(visibleLen)
				}
				parentID := r.rga.ElementAtVisibleIndex(idx)
				ch := rune('a' + rng.Intn(26))
				op := insertOp(r.replicaID, r.counter, r.ts, parentID, ch)
				r.rga.Apply(op)
				r.ops = append(r.ops, op)
			}
		}
	}

	// Deliver all operations to all replicas
	for _, source := range replicas {
		for _, target := range replicas {
			if source == target {
				continue
			}
			for _, op := range source.ops {
				target.rga.Apply(op)
			}
		}
	}

	// All replicas must converge
	content0 := replicas[0].rga.Content()
	for i := 1; i < numReplicas; i++ {
		assert.Equal(t, content0, replicas[i].rga.Content(),
			"replica %d diverged from replica 0", i)
	}
	t.Logf("all %d replicas converged (content length: %d)", numReplicas, len(content0))
}

func TestEmptyDocument(t *testing.T) {
	rga := NewRGA()
	assert.Equal(t, "", rga.Content())
	assert.Equal(t, 0, rga.Len())
}

func TestInsertAtEnd(t *testing.T) {
	rga := NewRGA()
	rga.Apply(insertOp("A", 1, 1, head, 'A'))
	rga.Apply(insertOp("A", 2, 2, OpID{"A", 1}, 'B'))
	rga.Apply(insertOp("A", 3, 3, OpID{"A", 2}, 'C'))
	assert.Equal(t, "ABC", rga.Content())
}

func TestInsertAtStart(t *testing.T) {
	rga := NewRGA()
	rga.Apply(insertOp("A", 1, 1, head, 'C'))
	rga.Apply(insertOp("A", 2, 2, head, 'B'))
	rga.Apply(insertOp("A", 3, 3, head, 'A'))
	// Each insert goes after head, so they stack in reverse
	assert.Equal(t, 3, rga.Len())
}

func TestDeleteAllCharacters(t *testing.T) {
	rga := NewRGA()
	rga.Apply(insertOp("A", 1, 1, head, 'A'))
	rga.Apply(insertOp("A", 2, 2, OpID{"A", 1}, 'B'))

	rga.Apply(deleteOp("A", 3, 3, OpID{"A", 1}))
	rga.Apply(deleteOp("A", 4, 4, OpID{"A", 2}))

	assert.Equal(t, "", rga.Content())
	// Tombstones still exist in the structure
	assert.Equal(t, 4, rga.OpCount())
}

func TestInsertAfterDeletedElement(t *testing.T) {
	rga := NewRGA()
	rga.Apply(insertOp("A", 1, 1, head, 'A'))
	rga.Apply(insertOp("A", 2, 2, OpID{"A", 1}, 'B'))
	rga.Apply(deleteOp("A", 3, 3, OpID{"A", 1})) // delete A

	// Insert after the tombstoned A — should still work
	rga.Apply(insertOp("B", 1, 4, OpID{"A", 1}, 'X'))

	content := rga.Content()
	assert.Contains(t, content, "X")
	assert.Contains(t, content, "B")
	assert.NotContains(t, content, "A")
}
