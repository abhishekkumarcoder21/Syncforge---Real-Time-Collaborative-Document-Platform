"use client";

import React, { useState, useEffect } from "react";
import { api, DocumentMember } from "@/lib/api";
import { X, UserPlus, Trash2, Shield, UserCheck, AlertCircle } from "lucide-react";

interface ShareModalProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
  isOwner: boolean;
}

export function ShareModal({ docId, isOpen, onClose, isOwner }: ShareModalProps) {
  const [members, setMembers] = useState<DocumentMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      const data = await api.listMembers(docId);
      setMembers(data);
    } catch (err: any) {
      console.error("Failed to load members:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, docId]);

  if (!isOpen) return null;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.addMember(docId, email.trim(), role);
      setSuccess(`Added ${email} as ${role}`);
      setEmail("");
      await fetchMembers();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await api.removeMember(docId, userId);
      await fetchMembers();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/10 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Share Document</h3>
              <p className="text-xs text-slate-400">Invite collaborators to edit or view</p>
            </div>
          </div>
          <button
            id="btn-close-share-modal"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-300">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Invite Form (only owner can invite) */}
        {isOwner ? (
          <form onSubmit={handleAddMember} className="mt-5 space-y-3">
            <label className="block text-xs font-medium text-slate-300">Collaborator Email</label>
            <div className="flex space-x-2">
              <input
                id="input-share-email"
                type="email"
                required
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <select
                id="select-share-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                className="rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button
              id="btn-submit-share"
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/30 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {loading ? "Adding..." : "Send Invite"}
            </button>
          </form>
        ) : (
          <div className="mt-4 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
            Only the document owner can invite or remove collaborators.
          </div>
        )}

        {/* Members List */}
        <div className="mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Current Members ({members.length})
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {members.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No other members yet.</p>
            ) : (
              members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-lg bg-slate-800/50 p-2.5 border border-white/5"
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-200">
                      {m.user_name ? m.user_name[0].toUpperCase() : "U"}
                    </div>
                    <div className="truncate text-left">
                      <p className="text-xs font-medium text-slate-200 truncate">{m.user_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{m.user_email}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="flex items-center space-x-1 rounded bg-slate-700/80 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                      <Shield className="h-3 w-3 text-blue-400" />
                      <span>{m.role}</span>
                    </span>

                    {isOwner && (
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        className="rounded p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            id="btn-done-share"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-slate-800 px-4 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
