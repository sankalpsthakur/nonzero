"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed");
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
        <h2 className="mb-1 text-lg font-semibold text-white">
          Create your account
        </h2>
        <p className="mb-6 text-sm text-[#71717a]">
          Get started with your trading lab
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[#7f1d1d] bg-[#7f1d1d]/20 px-4 py-3 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-medium text-[#a1a1aa]"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3.5 py-2.5 text-sm text-white placeholder-[#52525b] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
              placeholder="Your name"
            />
          </div>

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
              autoComplete="new-password"
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3.5 py-2.5 text-sm text-white placeholder-[#52525b] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
              placeholder="Min. 8 characters"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-[#a1a1aa]"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-[#1e1e2e] bg-[#0a0a0f] px-3.5 py-2.5 text-sm text-white placeholder-[#52525b] outline-none transition-colors focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
              placeholder="Re-enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#71717a]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[#3b82f6] hover:text-[#2563eb] transition-colors"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
