"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12
        c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24
        c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039
        l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36
        c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571
        c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24
        C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base p-4 font-sans">
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-chip bg-accent-emerald text-sm font-semibold text-text-inverse">
            N
          </div>
          <div className="text-center">
            <h1 className="text-display-md text-text-primary">
              Sign in to Numa
            </h1>
            <p className="mt-1.5 text-sm text-text-secondary">
              Welcome back — enter your details to continue.
            </p>
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface-raised shadow-elevation-2">
          <div className="p-8">
            {error && (
              <div className="mb-5 rounded-chip border-l-2 border-status-concerning bg-status-concerning-soft px-3 py-2.5 text-sm text-status-concerning">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                  Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  className="w-full rounded-control border border-border bg-surface-base px-3.5 py-2.5 text-sm text-text-primary outline-none transition-editorial duration-150 placeholder:text-text-muted focus:border-accent-emerald focus:ring-1 focus:ring-accent-emerald/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                    Password
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-xs font-medium text-accent-emerald hover:underline"
                  >
                    Forgot?
                  </a>
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-control border border-border bg-surface-base px-3.5 py-2.5 text-sm text-text-primary outline-none transition-editorial duration-150 placeholder:text-text-muted focus:border-accent-emerald focus:ring-1 focus:ring-accent-emerald/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full rounded-control bg-accent-emerald py-2.5 text-sm font-medium text-text-inverse transition-editorial duration-150 hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-2.5 rounded-control border border-border bg-surface-raised py-2.5 text-sm font-medium text-text-primary transition-editorial duration-150 hover:bg-surface-sunken"
            >
              <GoogleIcon />
              Sign in with Google
            </button>

            <p className="mt-6 text-center text-sm text-text-secondary">
              Don't have an account?{" "}
              <a
                href="/signup"
                className="font-medium text-accent-emerald hover:underline"
              >
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}