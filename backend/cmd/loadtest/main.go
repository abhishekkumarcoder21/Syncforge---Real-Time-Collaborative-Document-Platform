package main

import (
	"flag"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/syncforge/backend/internal/collab/crdt"
)

func main() {
	clients := flag.Int("clients", 10, "Number of concurrent simulated clients")
	opsPerClient := flag.Int("ops", 50, "Operations per client")
	flag.Parse()

	fmt.Printf("=== SyncForge Real-Time Concurrency & Convergence Benchmark ===\n")
	fmt.Printf("Simulating %d concurrent clients, %d ops each (Total %d ops)...\n\n",
		*clients, *opsPerClient, (*clients)*(*opsPerClient))

	// Global central bus simulating the network & server broadcast
	type networkOp struct {
		originIdx int
		op        crdt.Operation
	}
	bus := make(chan networkOp, 10000)

	// Replicas
	replicas := make([]*crdt.RGA, *clients)
	counters := make([]uint64, *clients)
	clocks := make([]uint64, *clients)
	replicaIDs := make([]string, *clients)

	for i := 0; i < *clients; i++ {
		replicas[i] = crdt.NewRGA()
		counters[i] = 0
		clocks[i] = 0
		replicaIDs[i] = fmt.Sprintf("client-%02d", i+1)
	}

	var totalOpsDispatched atomic.Int64
	var opsApplied atomic.Int64
	start := time.Now()

	var wg sync.WaitGroup

	// Start concurrent typers
	for i := 0; i < *clients; i++ {
		wg.Add(1)
		go func(cIdx int) {
			defer wg.Done()
			r := rand.New(rand.NewSource(time.Now().UnixNano() + int64(cIdx)))

			for j := 0; j < *opsPerClient; j++ {
				// Random sleep to simulate human or burst typing
				time.Sleep(time.Duration(r.Intn(5)+1) * time.Millisecond)

				counters[cIdx]++
				clocks[cIdx]++

				parentID := replicas[cIdx].ElementAtVisibleIndex(replicas[cIdx].Len() - 1)
				char := rune('a' + r.Intn(26))

				op := crdt.Operation{
					ID: crdt.OpID{
						ReplicaID: replicaIDs[cIdx],
						Counter:   counters[cIdx],
					},
					Type:     crdt.OpInsert,
					ParentID: parentID,
					Char:     char,
					Ts:       clocks[cIdx],
				}

				// Apply locally (optimistic UI)
				replicas[cIdx].Apply(op)
				opsApplied.Add(1)
				totalOpsDispatched.Add(1)

				// Broadcast to network
				bus <- networkOp{originIdx: cIdx, op: op}
			}
		}(i)
	}

	// Wait for all typers to finish sending
	wg.Wait()
	close(bus)

	// Process all broadcast messages across all other replicas
	var networkDeliveries int64
	for netOp := range bus {
		for i := 0; i < *clients; i++ {
			if i != netOp.originIdx {
				applied, err := replicas[i].Apply(netOp.op)
				if err != nil {
					panic(err)
				}
				if applied {
					opsApplied.Add(1)
					networkDeliveries++
				}
			}
		}
	}

	elapsed := time.Since(start)

	// Verify Convergence
	referenceText := replicas[0].Content()
	allConverged := true
	for i := 1; i < *clients; i++ {
		if replicas[i].Content() != referenceText {
			allConverged = false
			fmt.Printf("Divergence detected on replica %s!\n", replicaIDs[i])
			break
		}
	}

	fmt.Printf("Benchmark Results:\n")
	fmt.Printf("--------------------------------------------------\n")
	fmt.Printf("Total Wall Time:         %v\n", elapsed)
	fmt.Printf("Total Local Edits:       %d\n", totalOpsDispatched.Load())
	fmt.Printf("Cross-Network Applies:   %d\n", networkDeliveries)
	fmt.Printf("Total CRDT Applications: %d\n", opsApplied.Load())
	fmt.Printf("Throughput:              %.0f ops/sec\n", float64(opsApplied.Load())/elapsed.Seconds())
	fmt.Printf("Final Text Length:       %d runes\n", len(referenceText))
	if allConverged {
		fmt.Printf("Convergence Status:      ✓ 100%% CONVERGED ACROSS ALL REPLICAS\n")
	} else {
		fmt.Printf("Convergence Status:      ✗ DIVERGENCE DETECTED\n")
	}
	fmt.Printf("--------------------------------------------------\n")
}
