"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Layers, ArrowRight, Lock, Mail, User as UserIcon, AlertCircle, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await register(email.trim(), password, name.trim());
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-gradient-to-tr from-blue-600/15 to-indigo-600/15 blur-[120px] -z-10 rounded-full" />

      <div className="glass-panel w-full max-w-md rounded-2xl p-8 shadow-2xl border border-white/10">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center space-x-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/30">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">SyncForge</span>
          </Link>
          <h2 className="mt-5 text-xl font-bold text-white">Create Your Account</h2>
          <p className="mt-1 text-xs text-slate-400">Join real-time CRDT collaborative workspace</p>
        </div>

        {error && (
          <div className="mt-5 flex items-center space-x-2 rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                id="input-register-name"
                type="text"
                required
                placeholder="Alice Hopper"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/90 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                id="input-register-email"
                type="email"
                required
                placeholder="alice@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/90 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                id="input-register-password"
                type="password"
                required
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/90 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            id="btn-register-submit"
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Register & Continue</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-blue-400 hover:text-blue-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
