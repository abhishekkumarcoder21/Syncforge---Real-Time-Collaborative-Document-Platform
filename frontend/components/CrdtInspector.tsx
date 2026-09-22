"use client";

import React, { useState, useEffect } from "react";
import { SyncForgeClient } from "@/lib/ws";
import {
  Cpu,
  X,
  Zap,
  Activity,
  GitCommit,
  Wifi,
  WifiOff,
  Clock,
  Layers,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface CrdtInspectorProps {
  client: SyncForgeClient | null;
  isOpen: boolean;
  onClose: () => void;
  replicaId: string;
}

export function CrdtInspector({
  client,
  isOpen,
  onClose,
  replicaId,
}: CrdtInspectorProps) {
  const [stats, setStats] = useState<any>(null);
  const [isOfflineSim, setIsOfflineSim] = useState(false);
  const [simLatency, setSimLatency] = useState<number>(0);

  useEffect(() => {
    if (!isOpen || !client) return;

    const interval = setInterval(() => {
      const s = client.crdt.getInspectorStats();
      setStats({
        ...s,
        pendingOps: client.getPendingCount(),
        latency: client.latency,
        status: client.status,
      });
    }, 500);

    // Initial load
    const s = client.crdt.getInspectorStats();
    setStats({
      ...s,
      pendingOps: client.getPendingCount(),
      latency: client.latency,
      status: client.status,
    });

    return () => clearInterval(interval);
  }, [isOpen, client]);

  if (!isOpen) return null;

  const handleToggleOffline = () => {
    if (!client) return;
    const nextState = !isOfflineSim;
    setIsOfflineSim(nextState);
    client.setSimulatedOffline(nextState);
  };

  const handleLatencyChange = (ms: number) => {
    if (!client) return;
    setSimLatency(ms);
    client.setSimulatedLatency(ms);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-slate-950/95 border-l border-white/10 shadow-2xl backdrop-blur-2xl text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-5 bg-slate-900/60">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-white">CRDT & Distributed Inspector</h3>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
                RGA Active
              </span>
            </div>
            <p className="text-xs text-slate-400">Live causal order & node state verification</p>
          </div>
        </div>
        <button
          id="btn-close-crdt-inspector"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Network Chaos & Resilience Simulation */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center space-x-2 mb-3 text-amber-400">
            <Zap className="h-4 w-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Fault Injection & Simulation</h4>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-200">Simulate Offline / Network Partition</p>
                <p className="text-[11px] text-slate-400">
                  Type edits while disconnected; reconnect to test CRDT convergence.
                </p>
              </div>
              <button
                id="btn-toggle-simulate-offline"
                onClick={handleToggleOffline}
                className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isOfflineSim
                    ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {isOfflineSim ? (
                  <>
                    <WifiOff className="h-3.5 w-3.5" />
                    <span>Offline (Simulated)</span>
                  </>
                ) : (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Online</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                <span>Simulated Latency: {simLatency}ms</span>
                {simLatency > 0 && (
                  <span className="text-amber-400 font-mono text-[10px]">Lag Active</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 150, 400, 800].map((ms) => (
                  <button
                    key={ms}
                    onClick={() => handleLatencyChange(ms)}
                    className={`rounded-md py-1 text-xs font-mono transition-all ${
                      simLatency === ms
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {ms === 0 ? "0ms (Real)" : `${ms}ms`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* State Metrics Grid */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Internal RGA State
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px]">Lamport Clock</span>
                <Clock className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <p className="mt-1 text-xl font-bold font-mono text-white">
                {stats?.clock ?? 0}
              </p>
              <span className="text-[10px] text-slate-500">Logical causal timer</span>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px]">Total Operations</span>
                <GitCommit className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <p className="mt-1 text-xl font-bold font-mono text-white">
                {stats?.opCount ?? 0}
              </p>
              <span className="text-[10px] text-slate-500">Applied edits count</span>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px]">Total Nodes</span>
                <Layers className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <p className="mt-1 text-xl font-bold font-mono text-white">
                {stats?.totalNodes ?? 0}
              </p>
              <span className="text-[10px] text-slate-500">
                {stats?.visibleChars ?? 0} visible chars
              </span>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px]">Tombstones</span>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <p className="mt-1 text-xl font-bold font-mono text-rose-400">
                {stats?.tombstones ?? 0}
              </p>
              <span className="text-[10px] text-slate-500">Deleted preserved elements</span>
            </div>
          </div>
        </div>

        {/* Local Session Identifiers */}
        <div className="rounded-xl border border-white/5 bg-slate-900/60 p-4 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Session Details
          </h4>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Replica ID:</span>
            <span className="text-blue-400 truncate max-w-[200px]" title={replicaId}>
              {replicaId}
            </span>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Pending Sync Queue:</span>
            <span className={stats?.pendingOps > 0 ? "text-amber-400 font-bold" : "text-slate-300"}>
              {stats?.pendingOps ?? 0} ops
            </span>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">WebSocket Ping:</span>
            <span className="text-emerald-400">{stats?.latency ?? 0}ms</span>
          </div>
        </div>

        {/* Node Stream Visualization */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              RGA Node Stream (Order in Linked List)
            </h4>
            <span className="text-[10px] text-slate-500">
              Showing first {Math.min(stats?.nodes?.length || 0, 150)} nodes
            </span>
          </div>

          <div className="rounded-xl border border-white/5 bg-slate-950 p-3 max-h-64 overflow-y-auto">
            {(!stats?.nodes || stats.nodes.length === 0) ? (
              <p className="text-xs text-slate-500 italic text-center py-4">
                No nodes in CRDT. Type in the editor to create nodes.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                {stats.nodes.map((node: any, idx: number) => (
                  <div
                    key={`${node.id.r}:${node.id.c}-${idx}`}
                    title={`Replica: ${node.id.r}, Counter: ${node.id.c}, Ts: ${node.ts}, ${node.deleted ? "DELETED (Tombstone)" : "Visible"}`}
                    className={`flex items-center space-x-1 rounded px-2 py-1 border transition-all ${
                      node.deleted
                        ? "bg-rose-950/40 border-rose-800/40 text-rose-500 line-through opacity-60"
                        : "bg-slate-800/80 border-slate-700/60 text-slate-200 hover:border-blue-500"
                    }`}
                  >
                    <span className="font-bold">
                      {node.char === " " ? "␣" : node.char === "\n" ? "↵" : node.char}
                    </span>
                    <span className="text-[9px] text-slate-500 ml-0.5">
                      {node.ts}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
