import Link from "next/link";
import { researcherByToken } from "@/lib/studies/access";
import { REPORT_STATUS_LABELS, STUDY_STATUS_LABELS, TASK_STATUS_LABELS } from "@/lib/studies/labels";
import { reportFor } from "@/lib/studies/queries";
import { readDb } from "@/lib/studies/store";
import { Badge, Card, PageShell } from "../../_components/ui";

export default async function ResearcherHome({ params }: PageProps<"/studies/r/[token]">) {
  const { token } = await params;
  const db = await readDb();
  const researcher = researcherByToken(db, token);
  // Only this researcher's own tasks — never other researchers' (spec §4).
  const tasks = db.tasks
    .filter((t) => t.researcherId === researcher.id && t.status !== "reassigned")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const analyses = db.studies.filter((s) => s.analystId === researcher.id);

  return (
    <PageShell title={`مرحبًا ${researcher.name}`} subtitle="المهام المسندة إليك">
      <Card title="مهامي">
        {tasks.length === 0 && <p className="text-sm text-muted">لا توجد مهام مسندة إليك حاليًا.</p>}
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => {
            const study = db.studies.find((s) => s.id === task.studyId)!;
            const openQueries = task.queries.filter((q) => !q.answer).length;
            return (
              <li key={task.id}>
                <Link
                  href={`/studies/r/${token}/t/${task.id}`}
                  className="block rounded-xl border border-surface-border p-4 transition hover:border-info"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{study.title}</span>
                    <span className="flex gap-1.5">
                      {openQueries > 0 && <Badge tone="warning">استفسار من المحلل</Badge>}
                      <Badge tone={task.status === "pending_acceptance" ? "warning" : "info"}>{TASK_STATUS_LABELS[task.status]}</Badge>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{task.description}</p>
                  <p className="mt-1 text-xs text-muted">الموعد النهائي: {task.deadline}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      {analyses.length > 0 && (
        <Card title="دراسات مسندة إليك للتحليل">
          <ul className="flex flex-col gap-3">
            {analyses.map((study) => {
              const report = reportFor(db, study.id);
              return (
                <li key={study.id}>
                  <Link
                    href={`/studies/r/${token}/a/${study.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-surface-border p-4 transition hover:border-info"
                  >
                    <span className="font-semibold">{study.title}</span>
                    <span className="flex gap-1.5">
                      <Badge>{STUDY_STATUS_LABELS[study.status]}</Badge>
                      {report && <Badge tone="info">التقرير: {REPORT_STATUS_LABELS[report.status]}</Badge>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
