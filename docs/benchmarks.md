# SyncForge Performance & Concurrency Benchmarks

## Overview

Benchmarks were conducted to measure real-time CRDT application throughput, cross-client broadcast distribution latency, and convergence guarantees under high concurrency.

## Concurrency & Convergence Benchmark

Executed via `go run ./cmd/loadtest/main.go -clients 15 -ops 40`:

| Metric | Result |
|--------|--------|
| **Concurrent Clients** | 15 simulated active typers |
| **Local Edits Dispatched** | 600 total local edits |
| **Cross-Network Deliveries** | 8,400 distributed deliveries |
| **Total CRDT Applications** | 9,000 operations |
| **Execution Wall Time** | 145.035 ms |
| **Throughput** | **62,054 operations / sec** |
| **Convergence Rate** | **100.0% Converged Across All 15 Replicas** |

## Test Invariants Verified

1. **Deterministic Sibling Placement**: Concurrent inserts sharing an identical parent are ordered by $(Timestamp, ReplicaID)$ with zero divergence.
2. **Tombstone Preservation**: Deleting a character prior to a delayed concurrent insertion preserving causal positioning retains the new character in correct order.
3. **Reconnection Replay**: Replaying un-acknowledged operations over an authoritative server snapshot merges idempotently with zero dropped edits.
