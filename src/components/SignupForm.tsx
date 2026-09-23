"use client";

import { Loader2, Lock, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "فشل إنشاء الحساب");
      setLoading(false);
      return;
    }

    // Same credentials just registered — sign straight in rather than
    // sending them back through /login separately.
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("تم إنشاء الحساب، لكن تعذّر تسجيل الدخول تلقائيًا — جرّب تسجيل الدخول يدويًا.");
      setLoading(false);
      return;
    }

    const redirectTo = "/";
    window.location.href = redirectTo;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-muted">
        البريد الإلكتروني
        <span className="relative">
          <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2.25} />
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-background px-3 py-2 pr-9 text-base text-foreground transition-colors duration-150 hover:border-success/40 focus:outline-none focus:ring-2 focus:ring-success/40"
          />
        </span>
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-muted">
        كلمة المرور
        <span className="relative">
          <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2.25} />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-background px-3 py-2 pr-9 text-base text-foreground transition-colors duration-150 hover:border-success/40 focus:outline-none focus:ring-2 focus:ring-success/40"
          />
        </span>
        <span className="text-xs text-muted">8 أحرف على الأقل</span>
      </label>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-success/90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />}
        ابدأ التجربة المجانية
      </button>
    </form>
  );
}
