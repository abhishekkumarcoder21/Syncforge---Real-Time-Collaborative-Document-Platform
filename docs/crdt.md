# Replicated Growable Array (RGA) Specification

SyncForge implements a sequence CRDT based on the **Replicated Growable Array (RGA)** algorithm. Unlike Operational Transformation (OT), which requires a central sequencer and complex n-way transformation functions, RGA guarantees deterministic convergence across any number of replicas regardless of network delivery order.

## Core Data Structures

### Operation Identifier (`OpID`)
Every character inserted into the document receives a globally unique, immutable identifier:
```
OpID = {
    ReplicaID: string, // Unique client/tab identifier
    Counter:   uint64  // Monotonically increasing counter per replica
}
```

The sentinel head of the document is denoted as `OpID{ReplicaID: "", Counter: 0}`.

### Deterministic Total Ordering (`Less`)
When two operations occur concurrently at the same position, ties are broken deterministically:
```
OpID.Less(other, ts1, ts2) =
    if ts1 != ts2:
        return ts1 < ts2
    return ReplicaID < other.ReplicaID
```
1. Higher Lamport timestamps take precedence (placed to the left among concurrent siblings).
2. If timestamps are identical, lexicographical comparison of `ReplicaID` acts as the deterministic tiebreaker.

### Operation Types
1. **Insert (`OpType = 0`)**:
   - `ParentID`: The `OpID` of the character immediately preceding this insertion.
   - `Char`: Unicode code point (rune).
   - `Ts`: Logical Lamport timestamp.
2. **Delete (`OpType = 1`)**:
   - `TargetID`: The `OpID` of the element to delete.
   - Note: In RGA, deletion does not remove the node from the linked list; it flags the node as a **tombstone** (`deleted = true`). This preserves the causal tree structure so subsequent concurrent inserts referencing that node can still resolve their insertion point correctly.

## Insertion Algorithm

When applying an insert operation `op`:
1. Check if `op.ID` already exists in `elements` map (idempotency check). If so, ignore.
2. Locate the node matching `op.ParentID`.
3. Scan rightward past existing children of `parent` until reaching a node with lower priority or a node that is not a descendant of `parent`:
   ```go
   cursor := parent.next
   for cursor != nil {
       if !isDescendantOf(cursor, parent) {
           break
       }
       if op.ID.Less(cursor.id, op.Ts, cursor.ts) {
           break
       }
       cursor = cursor.next
   }
   ```
4. Splice the new node into the doubly-linked list immediately before `cursor`.

## Convergence Guarantees

SyncForge's test suite verifies convergence under:
1. **Commutativity**: $Apply(Op_A, Op_B) == Apply(Op_B, Op_A)$ for all concurrent operations.
2. **All 6 Permutations**: 3 replicas generating concurrent edits converge across all permutations.
3. **Property-Based Testing**: Randomized fuzzing of concurrent inserts and deletes converges across 100% of iterations.
