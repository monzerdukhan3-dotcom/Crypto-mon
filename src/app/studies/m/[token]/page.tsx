import Link from "next/link";
import { managerByToken } from "@/lib/studies/access";
import { STUDY_STATUS_LABELS, formatDateTime } from "@/lib/studies/labels";
import { managerAlerts } from "@/lib/studies/queries";
import { readDb } from "@/lib/studies/store";
import { Badge, Card, PageShell } from "../../_components/ui";

export default async function ManagerHome({ params }: PageProps<"/studies/m/[token]">) {
  const { token } = await params;
  const db = await readDb();
  const manager = managerByToken(db, token);
  // Drafts stay with the client until they submit them.
  const studies = db.studies
    .filter((s) => s.managerId === manager.id && s.status !== "draft")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));

  return (
    <PageShell title={`مرحبًا ${manager.name}`} subtitle="الدراسات التي تديرها">
      {studies.length === 0 && (
        <Card>
          <p className="text-sm text-muted">لا توجد دراسات مسندة إليك بعد.</p>
        </Card>
      )}
      {studies.map((study) => {
        const client = db.clients.find((c) => c.id === study.clientId);
        const alerts = managerAlerts(db, study);
        const urgent = alerts.filter((a) => a.level === "urgent").length;
        const warnings = alerts.filter((a) => a.level === "warning").length;
        return (
          <Link
            key={study.id}
            href={`/studies/m/${token}/s/${study.id}`}
            className="block rounded-2xl border border-surface-border bg-surface p-5 shadow-sm transition hover:border-info"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{study.title}</p>
                <p className="text-xs text-muted">
                  {client?.companyName} · استُلم {formatDateTime(study.submittedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {urgent > 0 && <Badge tone="danger">{urgent} عاجل</Badge>}
                {warnings > 0 && <Badge tone="warning">{warnings} تنبيه</Badge>}
                {alerts.length - urgent - warnings > 0 && <Badge tone="info">{alerts.length - urgent - warnings} جديد</Badge>}
                <Badge tone="info">{STUDY_STATUS_LABELS[study.status]}</Badge>
              </div>
            </div>
          </Link>
        );
      })}
    </PageShell>
  );
}
