import Link from "next/link";
import { researcherTask } from "@/lib/studies/access";
import { FILE_STATUS_LABELS, ISSUE_KIND_LABELS, TASK_STATUS_LABELS, formatBytes, formatDateTime } from "@/lib/studies/labels";
import { taskFiles } from "@/lib/studies/queries";
import { readDb } from "@/lib/studies/store";
import type { IssueKind } from "@/lib/studies/types";
import {
  acceptTask,
  answerQuery,
  completeTask,
  declineTask,
  replaceTaskFile,
  reportIssue,
  uploadTaskFiles,
} from "../../../../actions";
import SubmitButton from "../../../../_components/SubmitButton";
import { Badge, Card, Details, Field, Flash, Hidden, KeyValue, PageShell, Select } from "../../../../_components/ui";

const FILE_TONES = { pending: "warning", accepted: "success", rejected: "danger", replaced: "neutral" } as const;

export default async function ResearcherTaskPage({ params, searchParams }: PageProps<"/studies/r/[token]/t/[taskId]">) {
  const { token, taskId } = await params;
  const db = await readDb();
  const { task, study } = researcherTask(db, token, taskId);
  const files = taskFiles(db, task.id);
  const ids = { token, taskId };
  const collecting = study.status === "execution";
  const canUpload = collecting && (task.status === "in_progress" || task.status === "completed");
  const canReplace = canUpload && !study.analysisStartedAt;
  const active = task.status !== "reassigned" && task.status !== "declined";

  return (
    <PageShell title={study.title} subtitle={`${study.studyType} · مهمة جمع بيانات`}>
      <Link href={`/studies/r/${token}`} className="-mt-3 text-sm text-info">
        ← مهامي
      </Link>
      <Flash searchParams={searchParams} />

      <Card title="تفاصيل المهمة">
        <KeyValue
          items={[
            ["الوصف وأداة الجمع", task.description],
            ["الموعد النهائي", task.deadline],
            ["الحالة", <Badge key="s" tone="info">{TASK_STATUS_LABELS[task.status]}</Badge>],
            ["الفئة المستهدفة", study.scope.targetAudience],
          ]}
        />
        {task.notes.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {task.notes.map((n, i) => (
              <li key={i} className="rounded-lg bg-info-soft px-3 py-2 text-sm">
                <span className="text-xs text-muted">ملاحظة من مدير الدراسة · {formatDateTime(n.at)}</span>
                <p className="whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
        {task.status === "pending_acceptance" && (
          <div className="mt-5 flex flex-col gap-3 border-t border-surface-border pt-5">
            <form action={acceptTask}>
              <Hidden {...ids} />
              <SubmitButton variant="success">تأكيد استلام المهمة</SubmitButton>
            </form>
          </div>
        )}
        {(task.status === "pending_acceptance" || task.status === "in_progress") && (
          <div className="mt-3">
            <Details summary="الاعتذار عن المهمة">
              <form action={declineTask} className="flex flex-col gap-3">
                <Hidden {...ids} />
                <Field label="سبب الاعتذار" name="reason" multiline required />
                <div>
                  <SubmitButton variant="danger">إرسال الاعتذار</SubmitButton>
                </div>
              </form>
            </Details>
          </div>
        )}
        {task.status === "reassigned" && <p className="mt-4 text-sm text-muted">أُعيد إسناد هذه المهمة لباحث آخر.</p>}
        {study.status === "planning" && task.status === "in_progress" && (
          <p className="mt-4 text-sm text-muted">لم يبدأ تنفيذ الدراسة بعد — سيتاح رفع البيانات عند بدء التنفيذ.</p>
        )}
      </Card>

      {(task.status === "in_progress" || task.status === "completed") && (
        <Card title="البيانات والملفات">
          {files.length === 0 && <p className="text-sm text-muted">لم تُرفع ملفات بعد.</p>}
          <ul className="flex flex-col gap-3">
            {files.map((file) => (
              <li key={file.id} className="rounded-lg border border-surface-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={`/studies/files/${file.id}?t=${token}`} className="font-medium text-info">
                    {file.originalName}
                  </a>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {formatBytes(file.size)}
                    <Badge tone={FILE_TONES[file.status]}>{FILE_STATUS_LABELS[file.status]}</Badge>
                  </span>
                </div>
                {file.reviewNote && <p className="mt-1 text-danger">ملاحظات مدير الدراسة: {file.reviewNote}</p>}
                {canReplace && (
                  <form action={replaceTaskFile} className="mt-2 flex flex-wrap items-center gap-2">
                    <Hidden {...ids} fileId={file.id} />
                    <input type="file" name="file" className="text-xs" />
                    <SubmitButton variant="ghost">{file.status === "rejected" ? "رفع نسخة مصححة" : "استبدال الملف"}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {canUpload && task.status === "in_progress" && (
            <div className="mt-5 flex flex-col gap-4 border-t border-surface-border pt-5">
              <form action={uploadTaskFiles} className="flex flex-wrap items-center gap-3">
                <Hidden {...ids} />
                <input type="file" name="files" multiple className="text-sm" />
                <SubmitButton>رفع الملفات</SubmitButton>
                <span className="w-full text-xs text-muted">حتى 4MB في المرة الواحدة.</span>
              </form>
              <form action={completeTask}>
                <Hidden {...ids} />
                <SubmitButton variant="success">تعليم المهمة كمكتملة</SubmitButton>
              </form>
            </div>
          )}
          {study.analysisStartedAt && <p className="mt-4 text-xs text-muted">بدأ التحليل على البيانات؛ لم يعد استبدال الملفات متاحًا.</p>}
        </Card>
      )}

      {task.queries.length > 0 && (
        <Card title="استفسارات المحلل عن البيانات">
          <ul className="flex flex-col gap-4">
            {task.queries.map((q) => (
              <li key={q.id} className="text-sm">
                <p className="font-medium">{q.text}</p>
                <p className="text-xs text-muted">{formatDateTime(q.at)}</p>
                {q.answer ? (
                  <p className="mt-1 rounded-lg bg-success-soft px-3 py-2">ردك: {q.answer}</p>
                ) : (
                  <form action={answerQuery} className="mt-2 flex flex-col gap-2">
                    <Hidden {...ids} queryId={q.id} />
                    <Field label="ردك بعد التأكد من البيانات" name="answer" multiline />
                    <div>
                      <SubmitButton>إرسال الرد</SubmitButton>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active && (
        <Card title="الإبلاغ عن مشكلة أو عائق">
          {task.issues.length > 0 && (
            <ul className="mb-4 flex flex-col gap-2">
              {task.issues.map((issue) => (
                <li key={issue.id} className="rounded-lg bg-background px-3 py-2 text-sm">
                  <strong>{ISSUE_KIND_LABELS[issue.kind]}</strong>: {issue.text}
                  <span className="block text-xs text-muted">
                    {formatDateTime(issue.at)} {issue.urgent && "· عاجل"} {issue.resolvedAt && "· تمت المعالجة"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={reportIssue} className="flex flex-col gap-3">
            <Hidden {...ids} />
            <Select
              label="نوع المشكلة"
              name="kind"
              defaultValue="source_refused"
              options={(Object.keys(ISSUE_KIND_LABELS) as IssueKind[]).map((k) => ({ value: k, label: ISSUE_KIND_LABELS[k] }))}
            />
            <Field label="وصف المشكلة" name="text" multiline required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="urgent" />
              تؤثر على كامل الجدول الزمني للدراسة (تنبيه عاجل)
            </label>
            <div>
              <SubmitButton variant="ghost">إرسال لمدير الدراسة</SubmitButton>
            </div>
          </form>
        </Card>
      )}
    </PageShell>
  );
}
