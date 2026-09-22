"use client";

import React, { useState, useEffect } from "react";
import { api, SnapshotItem } from "@/lib/api";
import { History, X, RotateCcw, Clock, Layers, FileCheck, AlertCircle } from "lucide-react";

interface VersionHistoryProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
  canRestore: boolean;
}

export function VersionHistory({
  docId,
  isOpen,
  onClose,
  onRestored,
  canRestore,
}: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listVersions(docId);
      setSnapshots(data);
      if (data.length > 0) {
        setSelectedSnapshot(data[0]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load version snapshots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, docId]);

  if (!isOpen) return null;

  const handleRestore = async (version: number) => {
    if (!confirm(`Are you sure you want to restore Version ${version}? This will create a new current snapshot based on Version ${version}.`)) {
      return;
    }

    setRestoring(true);
    setError(null);
    try {
      await api.restoreVersion(docId, version);
      onRestored();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to restore version");
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-slate-900 border-l border-white/10 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-5">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Version History</h3>
            <p className="text-xs text-slate-400">Snapshot-based recovery points</p>
          </div>
        </div>
        <button
          id="btn-close-history"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="m-4 flex items-center space-x-2 rounded-lg bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Versions List */}
        <div className="w-1/2 border-r border-white/10 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">Loading snapshots...</div>
          ) : snapshots.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 px-4">
              <Clock className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <p>No snapshots recorded yet.</p>
              <p className="mt-1 text-[11px] text-slate-600">
                Snapshots are automatically created every 100 operations or 60s of active typing.
              </p>
            </div>
          ) : (
            snapshots.map((snap) => {
              const isSelected = selectedSnapshot?.version === snap.version;
              const dateStr = new Date(snap.created_at).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <button
                  key={snap.id}
                  onClick={() => setSelectedSnapshot(snap)}
                  className={`w-full text-left rounded-xl p-3 border transition-all ${
                    isSelected
                      ? "bg-blue-600/20 border-blue-500/50 text-white"
                      : "bg-slate-800/40 border-white/5 text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-blue-400">Version {snap.version}</span>
                    <span className="text-[10px] text-slate-400">{dateStr}</span>
                  </div>
                  <div className="mt-2 flex items-center space-x-3 text-[11px] text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Layers className="h-3 w-3 text-slate-500" />
                      <span>{snap.op_count} ops</span>
                    </span>
                    <span className="truncate">
                      {snap.content ? `${snap.content.length} chars` : "empty"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Selected Snapshot Preview */}
        <div className="w-1/2 flex flex-col p-4 overflow-hidden">
          {selectedSnapshot ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Preview: V{selectedSnapshot.version}
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Captured at {new Date(selectedSnapshot.created_at).toLocaleTimeString()}
                  </p>
                </div>

                {canRestore && (
                  <button
                    id="btn-restore-version"
                    onClick={() => handleRestore(selectedSnapshot.version)}
                    disabled={restoring}
                    className="flex items-center space-x-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>{restoring ? "Restoring..." : "Restore"}</span>
                  </button>
                )}
              </div>

              <div className="mt-3 flex-1 overflow-y-auto rounded-lg bg-slate-950/80 p-3 border border-white/5 font-mono text-xs text-slate-300 whitespace-pre-wrap">
                {selectedSnapshot.content || <span className="italic text-slate-600">(Document was empty)</span>}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Select a snapshot to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
