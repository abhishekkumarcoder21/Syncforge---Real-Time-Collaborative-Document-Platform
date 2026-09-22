"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Navbar } from "@/components/Navbar";
import { api, DocumentItem } from "@/lib/api";
import {
  Plus,
  Search,
  FileText,
  Clock,
  Trash2,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  Loader2,
  FolderOpen
} from "lucide-react";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadDocuments = async () => {
    try {
      const docs = await api.listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to list documents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user]);

  const handleCreateDocument = async (customTitle?: string) => {
    const titleToUse = customTitle || newTitle.trim() || "Untitled Document";
    setCreating(true);
    try {
      const doc = await api.createDocument(titleToUse);
      setIsModalOpen(false);
      setNewTitle("");
      router.push(`/documents/${doc.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to create document");
      setCreating(false);
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, id: string, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete document");
    }
  };

  const filteredDocs = documents.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <Navbar onNewDoc={() => setIsModalOpen(true)} />

      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Header Title & Quick Stats */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-8 border-b border-white/10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Collaborative Documents
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Deterministic CRDT documents synced across all active peers
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              id="btn-create-doc-primary"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center space-x-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Create Document</span>
            </button>
          </div>
        </div>

        {/* Templates Row */}
        <div className="mt-8">
          <div className="flex items-center space-x-2 mb-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Quick Start Templates</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: "System Architecture RFC", desc: "Design specs, invariants, and sequence diagrams" },
              { title: "Distributed Systems Notes", desc: "Lamport clocks, vector timestamps, and consensus" },
              { title: "Incident Postmortem", desc: "Timeline, root cause analysis, and action items" },
              { title: "Blank Canvas", desc: "Clean document ready for concurrent pair programming" },
            ].map((tmpl, idx) => (
              <button
                key={idx}
                onClick={() => handleCreateDocument(tmpl.title)}
                disabled={creating}
                className="glass-card text-left rounded-xl p-4 border border-white/5 hover:border-blue-500/40 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                    {tmpl.title}
                  </h4>
                  <Plus className="h-3.5 w-3.5 text-slate-500 group-hover:text-blue-400" />
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {tmpl.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-10 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
            <input
              id="input-search-docs"
              type="text"
              placeholder="Search documents by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="text-xs text-slate-400">
            {filteredDocs.length} {filteredDocs.length === 1 ? "document" : "documents"}
          </div>
        </div>

        {/* Documents Grid */}
        <div className="mt-6">
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">Loading documents...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
              <FolderOpen className="mx-auto h-10 w-10 text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-white">No documents found</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No matches for "${searchQuery}". Try a different search term.`
                  : "Create your first document to start testing real-time concurrent synchronization."}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Document</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((d) => {
                const isOwner = d.owner_id === user?.id;
                const updatedDate = new Date(d.updated_at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <Link
                    key={d.id}
                    href={`/documents/${d.id}`}
                    className="glass-card flex flex-col justify-between rounded-2xl p-5 border border-white/5 hover:border-blue-500/40 transition-all group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                          <h3 className="font-semibold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                            {d.title}
                          </h3>
                        </div>

                        {isOwner && (
                          <button
                            id={`btn-delete-${d.id}`}
                            onClick={(e) => handleDeleteDocument(e, d.id, d.title)}
                            title="Delete document"
                            className="rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="mt-4 flex items-center space-x-2 text-[11px] text-slate-400">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Updated {updatedDate}</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {isOwner ? "Owner" : `Shared by ${d.owner_name || "collaborator"}`}
                      </span>

                      <span className="flex items-center space-x-1 font-medium text-blue-400 group-hover:translate-x-0.5 transition-transform">
                        <span>Open</span>
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* New Document Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/10 text-slate-100">
            <h3 className="text-lg font-bold text-white">Create New Document</h3>
            <p className="mt-1 text-xs text-slate-400">Enter a title for your new collaborative document</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateDocument();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Document Title</label>
                <input
                  id="input-create-doc-title"
                  type="text"
                  autoFocus
                  placeholder="e.g. Distributed Consensus RFC"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  id="btn-cancel-create-doc"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-confirm-create-doc"
                  disabled={creating}
                  className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{creating ? "Creating..." : "Create Document"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
