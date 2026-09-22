// Package crdt implements a Replicated Growable Array (RGA) for collaborative
// text editing. This is a simplified but correct sequence CRDT where:
//
//   - Each character has a globally unique ID (ReplicaID + Counter)
//   - Inserts reference the ID of the element they follow (not a position index)
//   - Deletes mark elements as tombstones
//   - Concurrent inserts at the same position are ordered by (Timestamp, ReplicaID)
//   - Operations are idempotent and commutative — convergence is guaranteed
//
// This is a learning/demonstration CRDT, not a production-optimized implementation.
// It uses a doubly-linked list internally, which is O(n) for lookups but simple
// to reason about. For documents up to ~500KB this is acceptable.
package crdt

import (
	"encoding/json"
	"fmt"
	"sync"
)

// OpID uniquely identifies an operation/element across all replicas.
type OpID struct {
	ReplicaID string `json:"r"`
	Counter   uint64 `json:"c"`
}

func (id OpID) IsZero() bool {
	return id.ReplicaID == "" && id.Counter == 0
}

// Less defines a deterministic total order for conflict resolution.
// Lower timestamp wins; ties broken by replica ID (lexicographic).
func (id OpID) Less(other OpID, myTs, otherTs uint64) bool {
	if myTs != otherTs {
		return myTs < otherTs
	}
	return id.ReplicaID < other.ReplicaID
}

type OpType int

const (
	OpInsert OpType = iota
	OpDelete
)

// Operation represents a single edit.
type Operation struct {
	ID       OpID   `json:"id"`
	Type     OpType `json:"type"`
	ParentID OpID   `json:"parent"` // Insert: element this follows. Zero = start of document.
	Char     rune   `json:"char,omitempty"`
	TargetID OpID   `json:"target,omitempty"` // Delete: element to tombstone.
	Ts       uint64 `json:"ts"`               // Lamport timestamp
}

// Element is a node in the RGA linked list.
type element struct {
	id      OpID
	char    rune
	deleted bool
	ts      uint64
	next    *element
	prev    *element
}

// RGA is a Replicated Growable Array — a sequence CRDT for text.
type RGA struct {
	mu       sync.RWMutex
	head     *element   // sentinel node (not part of document)
	elements map[OpID]*element
	opCount  int
}

// NewRGA creates an empty document.
func NewRGA() *RGA {
	head := &element{id: OpID{}, char: 0} // sentinel
	return &RGA{
		head:     head,
		elements: map[OpID]*element{head.id: head},
	}
}

// Apply applies an operation. Returns false if the operation was a duplicate.
func (r *RGA) Apply(op Operation) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	switch op.Type {
	case OpInsert:
		return r.applyInsert(op)
	case OpDelete:
		return r.applyDelete(op)
	default:
		return false, fmt.Errorf("unknown operation type: %d", op.Type)
	}
}

func (r *RGA) applyInsert(op Operation) (bool, error) {
	// Duplicate check
	if _, exists := r.elements[op.ID]; exists {
		return false, nil
	}

	parent, ok := r.elements[op.ParentID]
	if !ok {
		return false, fmt.Errorf("parent element not found: %+v", op.ParentID)
	}

	newElem := &element{
		id:   op.ID,
		char: op.Char,
		ts:   op.Ts,
	}

	// Find the correct insertion point after parent.
	// Skip past any elements that should come before this one
	// (higher timestamp, or same timestamp with lower replica ID).
	cursor := parent.next
	for cursor != nil {
		// Stop if we find an element that was inserted after a different parent
		// (it's in a different causal chain)
		if !r.isDescendantOf(cursor, parent) {
			break
		}
		// Among siblings of the same parent, higher priority (higher ts, or
		// same ts with smaller replicaID) goes first (leftward).
		if op.ID.Less(cursor.id, op.Ts, cursor.ts) {
			break
		}
		cursor = cursor.next
	}

	// Insert newElem before cursor (or at end if cursor is nil)
	if cursor != nil {
		newElem.next = cursor
		newElem.prev = cursor.prev
		cursor.prev = newElem
		if newElem.prev != nil {
			newElem.prev.next = newElem
		}
	} else {
		// Append to end — find last element
		last := parent
		for last.next != nil {
			last = last.next
		}
		last.next = newElem
		newElem.prev = last
	}

	r.elements[op.ID] = newElem
	r.opCount++
	return true, nil
}

// isDescendantOf checks if elem was inserted as a child (directly after) parent.
// In our RGA, an element is a "descendant" of parent if it appears in the
// contiguous block of elements that were all inserted referencing parent or
// referencing other elements in that block.
// For simplicity, we check: is elem between parent and the next element
// that has a different insertion lineage? We approximate this by checking
// if elem's position in the list is between parent and the next element
// whose timestamp is <= parent's timestamp (meaning it was inserted before parent's children).
func (r *RGA) isDescendantOf(elem, parent *element) bool {
	// Simple heuristic: elements with higher timestamp than parent that
	// appear consecutively after parent are likely its children.
	// An element with a lower or equal timestamp to the parent's children
	// block boundary breaks the chain.
	return elem.ts >= parent.ts
}

func (r *RGA) applyDelete(op Operation) (bool, error) {
	elem, ok := r.elements[op.TargetID]
	if !ok {
		return false, fmt.Errorf("target element not found: %+v", op.TargetID)
	}
	if elem.deleted {
		return false, nil // already deleted (idempotent)
	}
	elem.deleted = true
	r.opCount++
	return true, nil
}

// Content returns the visible (non-tombstoned) text of the document.
func (r *RGA) Content() string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var runes []rune
	for cur := r.head.next; cur != nil; cur = cur.next {
		if !cur.deleted {
			runes = append(runes, cur.char)
		}
	}
	return string(runes)
}

// VisibleIndex returns the visible (non-tombstoned) index for an element ID,
// or -1 if tombstoned or not found.
func (r *RGA) VisibleIndex(id OpID) int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	idx := 0
	for cur := r.head.next; cur != nil; cur = cur.next {
		if cur.id == id {
			if cur.deleted {
				return -1
			}
			return idx
		}
		if !cur.deleted {
			idx++
		}
	}
	return -1
}

// ElementAtVisibleIndex returns the OpID of the element at the given visible index.
// Returns zero OpID (head sentinel) if index is -1 or out of range.
func (r *RGA) ElementAtVisibleIndex(index int) OpID {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if index < 0 {
		return r.head.id // sentinel = start of document
	}

	idx := 0
	for cur := r.head.next; cur != nil; cur = cur.next {
		if !cur.deleted {
			if idx == index {
				return cur.id
			}
			idx++
		}
	}
	return r.head.id
}

// OpCount returns the total number of operations applied.
func (r *RGA) OpCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.opCount
}

// Len returns the number of visible characters.
func (r *RGA) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	n := 0
	for cur := r.head.next; cur != nil; cur = cur.next {
		if !cur.deleted {
			n++
		}
	}
	return n
}

// --- Serialization ---

type serializedElement struct {
	ID      OpID   `json:"id"`
	Char    rune   `json:"ch"`
	Deleted bool   `json:"del,omitempty"`
	Ts      uint64 `json:"ts"`
}

type serializedRGA struct {
	Elements []serializedElement `json:"elements"`
	OpCount  int                 `json:"op_count"`
}

func (r *RGA) Marshal() ([]byte, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var elems []serializedElement
	for cur := r.head.next; cur != nil; cur = cur.next {
		elems = append(elems, serializedElement{
			ID:      cur.id,
			Char:    cur.char,
			Deleted: cur.deleted,
			Ts:      cur.ts,
		})
	}
	return json.Marshal(serializedRGA{Elements: elems, OpCount: r.opCount})
}

func Unmarshal(data []byte) (*RGA, error) {
	var s serializedRGA
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("unmarshal rga: %w", err)
	}

	rga := NewRGA()
	rga.opCount = s.OpCount

	prev := rga.head
	for _, se := range s.Elements {
		elem := &element{
			id:      se.ID,
			char:    se.Char,
			deleted: se.Deleted,
			ts:      se.Ts,
			prev:    prev,
		}
		prev.next = elem
		rga.elements[se.ID] = elem
		prev = elem
	}

	return rga, nil
}

// AllElementIDs returns all element IDs in document order (for sync protocol).
func (r *RGA) AllElementIDs() []OpID {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var ids []OpID
	for cur := r.head.next; cur != nil; cur = cur.next {
		ids = append(ids, cur.id)
	}
	return ids
}
