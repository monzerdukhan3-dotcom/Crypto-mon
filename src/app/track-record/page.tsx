"use client";

import { CircleCheckBig, Layers, Loader2, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrackRecordStats } from "@/lib/trackRecord";

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const valueClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  const badgeClass = tone === "success" ? "bg-success-soft text-success" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-info-soft text-info";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-surface p-5 shadow-sm">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${badgeClass}`}>
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-3xl font-extrabold ${valueClass}`}>{value}</p>
    </div>
  );
}

export default function TrackRecordPage() {
  const [stats, setStats] = useState<TrackRecordStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/track-record")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: TrackRecordStats) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="flex w-full max-w-3xl flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-extrabold text-foreground">سجل الأداء الحقيقي</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          أرقام حقيقية 100% محسوبة من نفس بيانات السوق الحية (Binance) التي يعرضها الشارت — ليست تجربة أو محاكاة.
          كل صفقة هنا نتيجة اكتشاف آلي لمنطقة طلب صالحة، ثم عودة سعر حقيقية إليها
          {stats ? `، محلّلة على ${stats.symbolsCovered} عملة عبر ${stats.timeframesCovered} أطر زمنية.` : "."}
        </p>
      </div>

      {!stats && !error && (
        <div className="mt-12 flex flex-col items-center gap-2 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-success" strokeWidth={2.25} />
          جاري حساب الأداء من بيانات السوق الحية...
        </div>
      )}

      {error && <p className="mt-12 text-sm text-danger">تعذّر تحميل سجل الأداء حاليًا — حاول مرة أخرى بعد قليل.</p>}

      {stats && (
        <>
          <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={CircleCheckBig}
              label="نسبة النجاح"
              value={`${stats.winRatePct}%`}
              tone={stats.winRatePct >= 50 ? "success" : "danger"}
            />
            <StatCard
              icon={TrendingUp}
              label="متوسط العائد المحقق"
              value={`${stats.averageRR >= 0 ? "+" : ""}${stats.averageRR}R`}
              tone={stats.averageRR >= 0 ? "success" : "danger"}
            />
            <StatCard icon={Layers} label="صفقات محسومة" value={stats.resolvedSignals.toLocaleString("en-US")} />
            <StatCard icon={Target} label="صفقات قيد الانتظار الآن" value={stats.pendingSignals.toLocaleString("en-US")} />
          </div>

          <div className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-4 text-center text-sm text-muted">
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <span className="block text-lg font-bold text-success">{stats.wins.toLocaleString("en-US")}</span>
              صفقة رابحة (حققت هدفًا واحدًا على الأقل)
            </div>
            <div className="rounded-xl border border-surface-border bg-surface p-4">
              <span className="block text-lg font-bold text-danger">{stats.losses.toLocaleString("en-US")}</span>
              صفقة خاسرة (ضربت وقف الخسارة قبل أي هدف)
            </div>
          </div>
        </>
      )}

      <p className="mt-8 max-w-xl text-center text-xs leading-relaxed text-muted">
        هذا تحليل فني آلي وليس نصيحة استثمارية. الأداء السابق لا يضمن نتائج مستقبلية. تُحسب الأرقام تلقائيًا من نفس
        السجل الذي يراه كل مشترك في صفحة «سجل الصفقات» — لا يوجد أي انتقاء يدوي للصفقات المعروضة هنا.
      </p>

      <Link
        href="/pricing"
        className="mt-8 rounded-lg bg-success px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-success/90"
      >
        اشترك الآن
      </Link>
    </div>
  );
}
