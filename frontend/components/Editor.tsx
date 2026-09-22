"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  SyncForgeClient, 
  ConnectionStatus, 
  RemoteUser, 
  RemoteCursor 
} from "@/lib/ws";
import { api, DocumentItem } from "@/lib/api";
import { ShareModal } from "./ShareModal";
import { VersionHistory } from "./VersionHistory";
import { CrdtInspector } from "./CrdtInspector";
import { 
  Users, 
  Share2, 
  History, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  Loader2,
  Copy,
  Check,
  Download,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";

interface EditorProps {
  documentId: string;
}

export function Editor({ documentId }: EditorProps) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [title, setTitle] = useState("Untitled Document");
  const [titleSaving, setTitleSaving] = useState(false);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [latency, setLatency] = useState<number>(0);
  const [pendingOps, setPendingOps] = useState<number>(0);
  const [presence, setPresence] = useState<RemoteUser[]>([]);
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Panels
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // References
  const clientRef = useRef<SyncForgeClient | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replicaIdRef = useRef<string>("");
  const isLocalEditRef = useRef<boolean>(false);
  const cursorPosRef = useRef<number>(0);

  // Generate unique replica ID for this client tab
  if (!replicaIdRef.current) {
    replicaIdRef.current = user?.id ? `${user.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}` : Math.random().toString(36).slice(2, 10);
  }

  // Load document metadata
  useEffect(() => {
    let active = true;
    api.getDocument(documentId).then((d) => {
      if (active && d) {
        setDoc(d);
        setTitle(d.title || "Untitled Document");
      }
    }).catch((err) => {
      if (active) setErrorMessage(err.message || "Failed to load document");
    });
    return () => { active = false; };
  }, [documentId]);

  // Connect WebSocket & CRDT Client
  useEffect(() => {
    if (!user) return;

    const client = new SyncForgeClient(documentId, replicaIdRef.current, {
      onStatusChange: (newStatus, lat, pending) => {
        setStatus(newStatus);
        if (lat !== undefined) setLatency(lat);
        if (pending !== undefined) setPendingOps(pending);
      },
      onTextChange: (newText, originOp) => {
        // If the update came from remote, we update text and carefully maintain local cursor
        if (!isLocalEditRef.current) {
          const prevCursor = textareaRef.current?.selectionStart || 0;
          setContent(newText);
          
          // Re-adjust cursor if necessary
          setTimeout(() => {
            if (textareaRef.current) {
              const targetCursor = Math.min(prevCursor, newText.length);
              textareaRef.current.setSelectionRange(targetCursor, targetCursor);
            }
          }, 0);
        } else {
          setContent(newText);
        }
      },
      onPresenceChange: (users) => {
        setPresence(users);
      },
      onCursorChange: (newCursors) => {
        setCursors(new Map(newCursors));
      },
      onError: (msg) => {
        setErrorMessage(msg);
        setTimeout(() => setErrorMessage(null), 4000);
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.destroy();
      clientRef.current = null;
    };
  }, [documentId, user]);

  // Handle local text changes with precise diff mapping to RGA operations
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const client = clientRef.current;
    if (!client) return;

    const prevVal = content;
    const cursor = e.target.selectionStart;
    cursorPosRef.current = cursor;

    isLocalEditRef.current = true;

    // Diff calculation between prevVal and nextVal
    let prefix = 0;
    while (
      prefix < prevVal.length &&
      prefix < nextVal.length &&
      prevVal[prefix] === nextVal[prefix]
    ) {
      prefix++;
    }

    let suffix = 0;
    while (
      suffix < prevVal.length - prefix &&
      suffix < nextVal.length - prefix &&
      prevVal[prevVal.length - 1 - suffix] === nextVal[nextVal.length - 1 - suffix]
    ) {
      suffix++;
    }

    const deletedCount = prevVal.length - prefix - suffix;
    const insertedText = nextVal.slice(prefix, nextVal.length - suffix);

    if (deletedCount > 0) {
      client.deleteText(prefix, deletedCount);
    }
    if (insertedText.length > 0) {
      client.insertText(prefix, insertedText);
    }

    // Broadcast cursor position
    client.sendCursor(cursor);

    isLocalEditRef.current = false;
  };

  const handleCursorMove = useCallback(() => {
    if (textareaRef.current && clientRef.current) {
      const pos = textareaRef.current.selectionStart;
      cursorPosRef.current = pos;
      clientRef.current.sendCursor(pos);
    }
  }, []);

  // Title update with debouncing
  const handleTitleBlur = async () => {
    if (!title.trim() || !doc || title === doc.title) return;
    setTitleSaving(true);
    try {
      await api.updateDocument(documentId, title.trim());
      setDoc((prev) => prev ? { ...prev, title: title.trim() } : null);
    } catch (err: any) {
      console.error("Failed to update title:", err);
    } finally {
      setTitleSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_") || "document"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cursor position line and column calculation
  const getLineCol = () => {
    const sub = content.slice(0, cursorPosRef.current);
    const lines = sub.split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    return { line, col };
  };
  const { line, col } = getLineCol();

  const isOwner = doc?.owner_id === user?.id;

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Navigation & Status Header */}
      <header className="glass-panel z-30 flex items-center justify-between border-b border-white/10 px-4 py-2.5 sm:px-6">
        {/* Left: Back & Editable Title */}
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard"
            id="btn-back-dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center space-x-2">
            <input
              id="input-doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled Document"
              className="rounded-lg bg-transparent px-2.5 py-1 text-base font-semibold text-white hover:bg-slate-800/60 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all sm:text-lg"
            />
            {titleSaving && (
              <span className="text-[11px] text-slate-400 italic">Saving...</span>
            )}
          </div>
        </div>

        {/* Center: Live Connection Pill */}
        <div className="hidden md:flex items-center space-x-2">
          <div className="flex items-center space-x-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs">
            {status === "connected" && (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span className="font-medium text-emerald-400">Connected</span>
                {latency > 0 && (
                  <span className="font-mono text-[10px] text-slate-400">({latency}ms)</span>
                )}
              </>
            )}
            {status === "reconnecting" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                <span className="font-medium text-amber-400">Reconnecting...</span>
                {pendingOps > 0 && (
                  <span className="font-mono text-[10px] text-amber-300">({pendingOps} queued)</span>
                )}
              </>
            )}
            {status === "connecting" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                <span className="font-medium text-blue-400">Connecting...</span>
              </>
            )}
            {status === "offline" && (
              <>
                <WifiOff className="h-3 w-3 text-rose-400" />
                <span className="font-medium text-rose-400">Offline (Simulated)</span>
                {pendingOps > 0 && (
                  <span className="font-mono text-[10px] text-rose-300">({pendingOps} pending)</span>
                )}
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircle className="h-3 w-3 text-rose-400" />
                <span className="font-medium text-rose-400">Sync Error</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Presence Avatars & Actions */}
        <div className="flex items-center space-x-2.5">
          {/* Presence list */}
          <div className="flex items-center -space-x-2 overflow-hidden px-1">
            {presence.slice(0, 4).map((p) => (
              <div
                key={p.id}
                title={`${p.name} (Online)`}
                style={{ backgroundColor: p.color }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-900 text-[11px] font-bold text-white shadow-sm ring-1 ring-white/10"
              >
                {p.name[0]?.toUpperCase() || "U"}
              </div>
            ))}
            {presence.length > 4 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-900 bg-slate-800 text-[10px] font-semibold text-slate-300 ring-1 ring-white/10">
                +{presence.length - 4}
              </div>
            )}
          </div>

          {/* Share Modal Trigger */}
          <button
            id="btn-open-share"
            onClick={() => setIsShareOpen(true)}
            className="flex items-center space-x-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Share2 className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Version History Trigger */}
          <button
            id="btn-open-history"
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center space-x-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <History className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* CRDT Inspector Trigger */}
          <button
            id="btn-open-crdt-inspector"
            onClick={() => setIsInspectorOpen(true)}
            className="flex items-center space-x-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors shadow-sm"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CRDT Inspector</span>
          </button>
        </div>
      </header>

      {/* Floating Error Alert */}
      {errorMessage && (
        <div className="mx-6 mt-2 flex items-center justify-between rounded-lg bg-rose-500/20 border border-rose-500/40 p-2.5 text-xs text-rose-200">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Remote Cursors Floating Tag Overlay Bar */}
      {cursors.size > 0 && (
        <div className="flex items-center space-x-2 px-6 py-1 bg-slate-900/40 border-b border-white/5 text-[11px] text-slate-400 overflow-x-auto">
          <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Active Cursors:</span>
          {Array.from(cursors.values()).map((c) => (
            <div
              key={c.userId}
              style={{ borderColor: c.color }}
              className="flex items-center space-x-1 rounded-full border bg-slate-900 px-2.5 py-0.5 text-slate-200"
            >
              <span style={{ backgroundColor: c.color }} className="h-1.5 w-1.5 rounded-full" />
              <span className="font-medium text-[11px]">{c.userName}</span>
              <span className="text-[10px] text-slate-400 font-mono">pos {c.position}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Collaborative Text Editor Canvas */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Line Numbers Column */}
        <div className="hidden select-none bg-slate-950/80 py-4 pl-4 pr-3 text-right font-mono text-xs text-slate-600 sm:block border-r border-white/5 min-w-[52px]">
          {content.split("\n").map((_, i) => (
            <div key={i} className="leading-6">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea Surface */}
        <div className="relative flex-1 h-full bg-slate-950 p-4 sm:p-6 overflow-hidden">
          <textarea
            id="editor-textarea"
            ref={textareaRef}
            value={content}
            onChange={handleInputChange}
            onKeyUp={handleCursorMove}
            onMouseUp={handleCursorMove}
            onClick={handleCursorMove}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Start typing simultaneously with collaborators... Changes synchronize deterministically via RGA CRDT."
            className="editor-font h-full w-full resize-none bg-transparent leading-6 text-slate-100 placeholder-slate-600 focus:outline-none overflow-y-auto"
          />
        </div>
      </div>

      {/* Bottom Status Footer Bar */}
      <footer className="glass-panel z-20 flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-slate-400 sm:px-6">
        <div className="flex items-center space-x-4">
          <span>Ln {line}, Col {col}</span>
          <span>{content.length} characters</span>
          <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
          {pendingOps > 0 ? (
            <span className="text-amber-400 font-medium">⚡ {pendingOps} pending sync ops</span>
          ) : (
            <span className="flex items-center space-x-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span>CRDT Synced</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button
            id="btn-copy-content"
            onClick={handleCopy}
            className="flex items-center space-x-1 rounded p-1 text-slate-400 hover:text-white transition-colors"
            title="Copy content"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            id="btn-download-content"
            onClick={handleDownload}
            className="flex items-center space-x-1 rounded p-1 text-slate-400 hover:text-white transition-colors"
            title="Export as text"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </footer>

      {/* Modals & Slide-out Panels */}
      <ShareModal
        docId={documentId}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        isOwner={isOwner}
      />

      <VersionHistory
        docId={documentId}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onRestored={() => {
          // Re-fetch sync state on restore
          if (clientRef.current) {
            clientRef.current.connect();
          }
        }}
        canRestore={isOwner}
      />

      <CrdtInspector
        client={clientRef.current}
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        replicaId={replicaIdRef.current}
      />
    </div>
  );
}
