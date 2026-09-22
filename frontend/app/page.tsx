"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Navbar } from "@/components/Navbar";
import {
  Layers,
  ArrowRight,
  Cpu,
  Wifi,
  History,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Database,
  GitBranch,
  RefreshCw,
  Terminal
} from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden px-6 pt-20 pb-24 md:pt-28 md:pb-32 lg:px-8">
          {/* Subtle background glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-blue-600/20 to-indigo-600/10 blur-[130px] -z-10 pointer-events-none rounded-full" />

          <div className="mx-auto max-w-5xl text-center">
            <div className="inline-flex items-center space-x-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-400 mb-6">
              <Zap className="h-3.5 w-3.5" />
              <span>Production-Grade Distributed System Architecture</span>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-tight">
              Real-Time Collaboration <br />
              <span className="text-gradient">Engineered with CRDTs</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
              SyncForge demonstrates high-performance distributed state synchronization,
              Replicated Growable Array (RGA) conflict-free resolution, optimistic UI,
              offline operation replaying, and periodic snapshot persistence.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href={user ? "/dashboard" : "/register"}
                id="btn-hero-cta"
                className="flex items-center space-x-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 hover:shadow-blue-500/40 transition-all active:scale-95"
              >
                <span>{user ? "Open Dashboard" : "Start Collaborating Now"}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/login"
                id="btn-hero-login"
                className="flex items-center space-x-2 rounded-xl border border-white/10 bg-slate-900/80 px-6 py-3.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
              >
                <span>Sign In with Existing Account</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Distributed Architecture Flow */}
        <section className="border-t border-white/10 bg-slate-900/30 py-20 px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-bold uppercase tracking-widest text-blue-400">System Topology</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                How SyncForge Synchronizes Distributed State
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="glass-card rounded-2xl p-6 relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 mb-5">
                  <Terminal className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">1. Optimistic Local Edit</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Every keystroke immediately creates an immutable RGA operation with a Lamport clock
                  and unique replica identifier. The character renders with zero local latency.
                </p>
              </div>

              {/* Step 2 */}
              <div className="glass-card rounded-2xl p-6 relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 mb-5">
                  <Wifi className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">2. WebSocket Routing & Broadcast</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Go server receives operation through authenticated WebSocket connection, validates permissions,
                  applies to authoritative room CRDT, and broadcasts to peers under 50ms.
                </p>
              </div>

              {/* Step 3 */}
              <div className="glass-card rounded-2xl p-6 relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-5">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">3. Deterministic Convergence</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  All peers apply commutative operations into their local doubly-linked lists. Concurrent inserts
                  are ordered deterministically by timestamp and replica ID without centralized locks.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-20 px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-400">Engineering Highlights</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Robust Architecture Under Real-World Conditions
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6">
                <Cpu className="h-6 w-6 text-blue-400 mb-4" />
                <h4 className="text-base font-semibold text-white">Replicated Growable Array (RGA)</h4>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Mathematical convergence guarantee. Tombstone marking for deletes preserves ordering links
                  across asynchronous network deliveries.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6">
                <RefreshCw className="h-6 w-6 text-emerald-400 mb-4" />
                <h4 className="text-base font-semibold text-white">Offline Queue & Reconnect</h4>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Connection drop? Continue typing offline. The client queues pending operations and re-synchronizes
                  cleanly upon reconnection.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6">
                <History className="h-6 w-6 text-indigo-400 mb-4" />
                <h4 className="text-base font-semibold text-white">Snapshots & Version History</h4>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Operations are batched every 100 edits. Snapshots capture the full CRDT binary state to PostgreSQL,
                  allowing point-in-time version restoration.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6">
                <Zap className="h-6 w-6 text-amber-400 mb-4" />
                <h4 className="text-base font-semibold text-white">Ephemeral Presence & Cursors</h4>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Redis-backed presence with 60s TTLs. Cursor updates throttled to 100ms to preserve network bandwidth
                  while keeping collaborative feel responsive.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6">
                <ShieldCheck className="h-6 w-6 text-cyan-400 mb-4" />
                <h4 className="text-base font-semibold text-white">JWT Single-Use WS Tickets</h4>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Never expose long-lived JWT credentials in WebSocket connection URLs. Short-lived 30s tickets
                  authenticate upgrades securely.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6">
                <GitBranch className="h-6 w-6 text-purple-400 mb-4" />
                <h4 className="text-base font-semibold text-white">Interactive CRDT Inspector</h4>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Built-in live inspection panel exposes the actual RGA node tree, Lamport clock counter,
                  tombstone counts, and network latency controls.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950 py-8 px-6 text-center text-xs text-slate-500">
        <p>SyncForge — Portfolio-Grade Real-Time Collaborative Editor</p>
        <p className="mt-1">Built with Go, Next.js, PostgreSQL, Redis, and WebSockets.</p>
      </footer>
    </div>
  );
}
