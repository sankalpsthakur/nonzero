"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="mb-8 flex items-center justify-center gap-2">
        <Activity className="h-8 w-8 text-[#3b82f6]" />
        <span className="text-xl font-semibold tracking-wide text-white">
          nonzero
        </span>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-8">
        <h2 className="mb-1 text-lg font-semibold text-white">Welcome back</h2>
        <p className="mb-6 text-sm text-[#71717a]">
          Sign in to your account to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[#7f1d1d] bg-[#7f1d1d]/20 px-4 py-3 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-[#a1a1aa]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3.5 py-2.5 text-sm text-white placeholder-[#52525b] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-[#a1a1aa]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3.5 py-2.5 text-sm text-white placeholder-[#52525b] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#71717a]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-[#3b82f6] hover:text-[#2563eb] transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
