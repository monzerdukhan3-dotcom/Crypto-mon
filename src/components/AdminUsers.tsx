"use client";

import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface AdminUser {
  id: number;
  email: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (res.ok) setUsers(json.users);
  }

  useEffect(() => {
    async function run() {
      await loadUsers();
    }
    run();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error ?? "فشل إنشاء الحساب");
      return;
    }

    setEmail("");
    setPassword("");
    loadUsers();
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) loadUsers();
  }

  return (
    <div className="w-full max-w-xl rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-soft text-info">
          <Users className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <h2 className="font-semibold text-foreground">حسابات الدخول</h2>
      </div>

      <form onSubmit={handleCreate} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
          البريد الإلكتروني
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-success/40"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
          كلمة المرور
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-surface-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-success/40"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-success/90 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} /> : <UserPlus className="h-4 w-4" strokeWidth={2.25} />}
          إضافة
        </button>
      </form>

      {error && <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {users === null ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
          جاري التحميل...
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{u.email}</span>
                <span className="text-xs text-muted">{formatDate(u.createdAt)}</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(u.id)}
                disabled={deletingId === u.id || users.length <= 1}
                title={users.length <= 1 ? "لا يمكن حذف آخر حساب متبقٍ" : "حذف الحساب"}
                className="rounded-lg p-1.5 text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
              >
                {deletingId === u.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
