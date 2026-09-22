package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	ActiveConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "syncforge_ws_connections_active",
		Help: "Current number of active WebSocket connections.",
	})

	OperationsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "syncforge_operations_total",
		Help: "Total number of CRDT operations processed.",
	}, []string{"type"})

	OperationLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "syncforge_operation_latency_seconds",
		Help:    "Latency of CRDT operation processing in seconds.",
		Buckets: prometheus.DefBuckets,
	})

	ActiveRooms = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "syncforge_active_rooms",
		Help: "Current number of active document collaboration rooms.",
	})

	PersistenceDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "syncforge_persistence_duration_seconds",
		Help:    "Duration of batch persistence flushes to database.",
		Buckets: prometheus.DefBuckets,
	})

	PersistenceErrors = promauto.NewCounter(prometheus.CounterOpts{
		Name: "syncforge_persistence_errors_total",
		Help: "Total number of persistence flush errors.",
	})
)
