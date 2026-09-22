import Link from "next/link";
import { analystStudy } from "@/lib/studies/access";
import { REPORT_STATUS_LABELS, formatBytes, formatDateTime } from "@/lib/studies/labels";
import { liveTasks, reportFor, taskFiles } from "@/lib/studies/queries";
import { readDb } from "@/lib/studies/store";
import { askResearcher, saveReport } from "../../../../actions";
import ReportView from "../../../../_components/ReportView";
import SubmitButton from "../../../../_components/SubmitButton";
import { Badge, Card, Details, Field, Flash, Hidden, KeyValue, PageShell, Select } from "../../../../_components/ui";

export default async function AnalysisPage({ params, searchParams }: PageProps<"/studies/r/[token]/a/[studyId]">) {
  const { token, studyId } = await params;
  const db = await readDb();
  const { study } = analystStudy(db, token, studyId);
  const report = reportFor(db, study.id);
  const ids = { token, studyId };

  if (!study.analysisStartedAt || !report) {
    return (
      <PageShell title={study.title} subtitle="تحليل الدراسة">
        <Card>
          <p className="text-sm text-muted">
            أُسند إليك تحليل هذه الدراسة. ستصلك البيانات هنا بعد أن يعتمدها مدير الدراسة وتبدأ مرحلة التحليل.
          </p>
        </Card>
      </PageShell>
    );
  }

  const tasks = liveTasks(db, study.id);
  const researcherName = (id: string) => db.researchers.find((r) => r.id === id)?.name ?? "باحث";
  const latest = report.versions.at(-1) ?? null;
  const editing = report.status === "drafting" && study.status === "analysis";

  return (
    <PageShell title={study.title} subtitle={`${study.studyType} · التحليل وإعداد التقرير`}>
      <Link href={`/studies/r/${token}`} className="-mt-3 text-sm text-info">
        ← مهامي
      </Link>
      <Flash searchParams={searchParams} />

      <Card title="نطاق العميل الأصلي">
        <KeyValue
          items={[
            ["الهدف من الدراسة", study.scope.objective],
            ["الفئة المستهدفة", study.scope.targetAudience],
            ["المناطق", study.scope.regions],
          ]}
        />
      </Card>

      <Card title="البيانات المعتمدة" step={9}>
        <ul className="flex flex-col gap-4">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-xl border border-surface-border p-4 text-sm">
              <p className="font-semibold">{researcherName(task.researcherId)}</p>
              <p className="text-muted">{task.description}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {taskFiles(db, task.id)
                  .filter((f) => f.status === "accepted")
                  .map((f) => (
                    <li key={f.id}>
                      <a href={`/studies/files/${f.id}?t=${token}`} className="text-info">
                        {f.originalName}
                      </a>{" "}
                      <span className="text-xs text-muted">({formatBytes(f.size)})</span>
                    </li>
                  ))}
              </ul>
              {task.queries.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-xs">
                  {task.queries.map((q) => (
                    <li key={q.id}>
                      سؤالك: {q.text} —{" "}
                      {q.answer ? <span className="text-success">رد الباحث: {q.answer}</span> : <span className="text-warning">بانتظار الرد</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {study.status === "analysis" && (
          <div className="mt-4">
            <Details summary="تناقض أو قيمة غير منطقية؟ أرجعها للباحث للتأكد">
              <form action={askResearcher} className="flex flex-col gap-3">
                <Hidden {...ids} />
                <Select
                  label="المهمة"
                  name="taskId"
                  placeholder="اختر المهمة"
                  options={tasks.map((t) => ({ value: t.id, label: `${researcherName(t.researcherId)} — ${t.description.slice(0, 50)}` }))}
                />
                <Field label="ما الذي يحتاج تأكيدًا" name="text" multiline required />
                <div>
                  <SubmitButton variant="ghost">إرسال للباحث</SubmitButton>
                </div>
              </form>
            </Details>
          </div>
        )}
      </Card>

      <Card title="التقرير" step={10}>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="info">{REPORT_STATUS_LABELS[report.status]}</Badge>
          {latest && <span className="text-muted">آخر نسخة مُرسلة: {latest.version} ({formatDateTime(latest.submittedAt)})</span>}
        </div>
        {report.managerNote && editing && (
          <p className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${report.halted ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
            {report.halted ? "أوقف مدير الدراسة التسليم لخلل جوهري — أعد التحليل: " : "مطلوب تعديل: "}
            {report.managerNote}
          </p>
        )}
        {editing ? (
          <form action={saveReport} className="flex flex-col gap-4">
            <Hidden {...ids} />
            <Field label="النتائج الأساسية" name="summary" multiline required defaultValue={report.draft.summary} />
            <Field
              label="الشرح والتحليل"
              name="findings"
              multiline
              required
              defaultValue={report.draft.findings}
              hint="إن كانت النتائج نوعية لا رقمية، كيّف طريقة العرض داخل نفس القالب."
            />
            <Field label="التوصيات (إن وجدت)" name="recommendations" multiline defaultValue={report.draft.recommendations} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">ملف التقرير بالصيغة المتفق عليها (اختياري، حتى 4MB)</span>
              <input type="file" name="file" className="text-sm" />
              {latest?.fileId && <span className="text-xs text-muted">يُستخدم ملف النسخة السابقة إن لم ترفع ملفًا جديدًا.</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="submit">
                إرسال للمراجعة والاعتماد
              </SubmitButton>
              <SubmitButton name="intent" value="save" variant="ghost">
                حفظ المسودة
              </SubmitButton>
            </div>
          </form>
        ) : (
          latest && <ReportView version={latest} fileHref={latest.fileId ? `/studies/files/${latest.fileId}?t=${token}` : null} />
        )}
      </Card>
    </PageShell>
  );
}
