import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { STUDY_STATUS_LABELS } from "@/lib/studies/labels";
import { readDb } from "@/lib/studies/store";
import { Badge, Card, PageShell } from "../_components/ui";

/**
 * Operator shortcut listing every access link, so the whole journey can be
 * walked through while testing. Off in production unless explicitly enabled
 * with STUDIES_DEMO_LINKS=1 — these links are the only credentials there are.
 */
export default async function DemoLinks() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.STUDIES_DEMO_LINKS !== "1") notFound();
  const db = await readDb();
  const linkClass = "text-info underline-offset-2 hover:underline";

  return (
    <PageShell title="روابط الوصول (للتجربة)" subtitle="كل دور يدخل عبر رابط فريد — افتح كل رابط في تبويب منفصل لتجربة الرحلة كاملة.">
      <Card title="مديرو الدراسات">
        <ul className="flex flex-col gap-2 text-sm">
          {db.managers.map((m) => (
            <li key={m.id}>
              <Link className={linkClass} href={`/studies/m/${m.token}`}>
                {m.name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="الباحثون والخبراء (والمحللون)">
        <ul className="flex flex-col gap-2 text-sm">
          {db.researchers.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <Link className={linkClass} href={`/studies/r/${r.token}`}>
                {r.name}
              </Link>
              <span className="text-xs text-muted">{r.expertise.join("، ")}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="العملاء (رابط لكل دراسة)">
        {db.studies.length === 0 && (
          <p className="text-sm text-muted">
            لا توجد طلبات بعد. <Link className={linkClass} href="/studies/request">اطلب دراسة</Link>
          </p>
        )}
        <ul className="flex flex-col gap-2 text-sm">
          {db.studies.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <Link className={linkClass} href={`/studies/c/${s.clientToken}`}>
                {db.clients.find((c) => c.id === s.clientId)?.companyName || "—"} — {s.title || "بدون عنوان"}
              </Link>
              <Badge>{STUDY_STATUS_LABELS[s.status]}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
