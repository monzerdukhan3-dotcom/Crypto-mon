"use client";

import { CalendarPlus, Infinity as InfinityIcon, Loader2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface AdminUser {
  id: number;
  email: string;
  isAdmin: boolean;
  accessUntil: string | null;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

function accessStatus(u: AdminUser): { label: string; tone: "success" | "danger" | "muted" } {
  if (u.isAdmin) return { label: "مدير — وصول كامل", tone: "muted" };
  if (u.accessUntil === null) return { label: "وصول دائم", tone: "success" };
  const until = new Date(u.accessUntil);
  if (until > new Date()) return { label: `نشط حتى ${formatDate(u.accessUntil)}`, tone: "success" };
  return { label: `منتهي منذ ${formatDate(u.accessUntil)}`, tone: "danger" };
}

const STATUS_CLASSES: Record<"success" | "danger" | "muted", string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-border text-muted",
};

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

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
      body: JSON.stringify({ email, password, isAdmin }),
    });
    const json = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(json.error ?? "فشل إنشاء الحساب");
      return;
    }

    setEmail("");
    setPassword("");
    setIsAdmin(false);
    loadUsers();
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) loadUsers();
  }

  // Called after confirming a Telegram payment — billing is manual, this is
  // the one place that access actually gets granted/extended.
  async function handleExtend(id: number, days: number) {
    setUpdatingId(id);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, days }),
    });
    setUpdatingId(null);
    if (res.ok) loadUsers();
  }

  async function handleGrantUnlimited(id: number) {
    setUpdatingId(id);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, unlimited: true }),
    });
    setUpdatingId(null);
    if (res.ok) loadUsers();
  }

  const adminCount = users?.filter((u) => u.isAdmin).length ?? 0;

  return (
    <div className="w-full max-w-xl rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-soft text-info">
          <Users className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <h2 className="font-semibold text-foreground">حسابات الدخول والاشتراكات</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        المستخدم العادي يرى الصفحات الرئيسية فقط (الشارت، سجل الصفقات، الفرص الآن). المدير وحده يصل لهذه الصفحة
        (الإعدادات) وإدارة الحسابات. حساب جديد من هنا يحصل على وصول دائم مباشرة — التجربة المجانية (يومين) فقط لمن
        يسجّل بنفسه من صفحة /signup. الفوترة يدوية عبر تلغرام: بعد تأكيد الدفع، مدّد وصول الحساب من هنا.
      </p>

      <form onSubmit={handleCreate} className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
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
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border accent-success"
            />
            منح صلاحيات مدير (وصول كامل، بما فيها هذه الصفحة)
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-success/90 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} /> : <UserPlus className="h-4 w-4" strokeWidth={2.25} />}
            إضافة
          </button>
        </div>
      </form>

      {error && <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {users === null ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
          جاري التحميل...
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => {
            const isLastAdmin = u.isAdmin && adminCount <= 1;
            const disabled = deletingId === u.id || users.length <= 1 || isLastAdmin;
            const status = accessStatus(u);
            const busy = updatingId === u.id;
            return (
              <li key={u.id} className="flex flex-col gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {u.email}
                      {u.isAdmin && (
                        <span className="flex items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
                          <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />
                          مدير
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted">{formatDate(u.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(u.id)}
                    disabled={disabled}
                    title={isLastAdmin ? "لا يمكن حذف آخر حساب مدير متبقٍ" : users.length <= 1 ? "لا يمكن حذف آخر حساب متبقٍ" : "حذف الحساب"}
                    className="rounded-lg p-1.5 text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                  >
                    {deletingId === u.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                    )}
                  </button>
                </div>

                {!u.isAdmin && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status.tone]}`}>
                      {status.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleExtend(u.id, 30)}
                        disabled={busy}
                        title="تمديد 30 يومًا"
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-info transition-colors duration-150 hover:bg-info-soft disabled:opacity-50"
                      >
                        <CalendarPlus className="h-3 w-3" strokeWidth={2.25} />
                        30 يوم
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExtend(u.id, 365)}
                        disabled={busy}
                        title="تمديد سنة"
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-info transition-colors duration-150 hover:bg-info-soft disabled:opacity-50"
                      >
                        <CalendarPlus className="h-3 w-3" strokeWidth={2.25} />
                        سنة
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGrantUnlimited(u.id)}
                        disabled={busy}
                        title="منح وصول دائم"
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-success transition-colors duration-150 hover:bg-success-soft disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.25} />
                        ) : (
                          <InfinityIcon className="h-3 w-3" strokeWidth={2.25} />
                        )}
                        دائم
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
