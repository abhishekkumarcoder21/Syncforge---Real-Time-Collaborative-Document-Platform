"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { 
  Layers, 
  LogOut, 
  Plus, 
  FileText
} from "lucide-react";

interface NavbarProps {
  onNewDoc?: () => void;
}

export function Navbar({ onNewDoc }: NavbarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="glass-panel sticky top-0 z-40 w-full border-b border-white/10 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link 
            href={user ? "/dashboard" : "/"} 
            id="nav-brand-logo"
            className="group flex items-center space-x-3 transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/25">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white">SyncForge</span>
              <span className="ml-2 hidden rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20 sm:inline-block">
                CRDT Real-Time
              </span>
            </div>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center space-x-1 text-sm font-medium text-slate-300">
              <Link 
                href="/dashboard" 
                id="nav-link-dashboard"
                className="flex items-center space-x-1.5 rounded-md px-3 py-1.5 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                <span>Documents</span>
              </Link>
            </nav>
          )}
        </div>

        {/* Actions & User State */}
        <div className="flex items-center space-x-3">
          {user ? (
            <>
              {onNewDoc && (
                <button
                  id="btn-nav-new-doc"
                  onClick={onNewDoc}
                  className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Document</span>
                </button>
              )}

              {/* User badge */}
              <div className="flex items-center space-x-2.5 rounded-lg border border-white/10 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-200">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 font-semibold text-xs border border-indigo-500/30">
                  {user.name ? user.name[0].toUpperCase() : "U"}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-semibold leading-none text-slate-200">{user.name}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{user.email}</div>
                </div>

                <button
                  id="btn-nav-logout"
                  onClick={() => logout()}
                  title="Sign out"
                  className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center space-x-2">
              <Link
                href="/login"
                id="btn-nav-login"
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                id="btn-nav-register"
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm shadow-blue-600/30 hover:bg-blue-500 transition-colors"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
