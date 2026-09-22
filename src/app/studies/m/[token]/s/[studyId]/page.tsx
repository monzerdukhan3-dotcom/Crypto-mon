import Link from "next/link";
import { managerStudy } from "@/lib/studies/access";
import {
  FILE_STATUS_LABELS,
  ISSUE_KIND_LABELS,
  PHASE_KEYS,
  PHASE_LABELS,
  REPORT_STATUS_LABELS,
  STUDY_STATUS_LABELS,
  TASK_STATUS_LABELS,
  formatBytes,
  formatDateTime,
} from "@/lib/studies/labels";
import { analysisBlocker, liveTasks, managerAlerts, plannedEndDate, reportFor } from "@/lib/studies/queries";
import { readDb } from "@/lib/studies/store";
import type { Db, Researcher, Study, Task } from "@/lib/studies/types";
import {
  addPerformanceNote,
  addTaskNote,
  createTask,
  deliverReport,
  forwardMessage,
  managerSaveScope,
  postUpdate,
  reassignTask,
  recordDelay,
  reopenScope,
  replyToClient,
  resolveIssue,
  reviewFile,
  reviewReport,
  savePlan,
  setAnalyst,
  startAnalysis,
  startExecution,
} from "../../../../actions";
import MessageThread from "../../../../_components/MessageThread";
import ReportView from "../../../../_components/ReportView";
import ScopeFields from "../../../../_components/ScopeFields";
import SubmitButton from "../../../../_components/SubmitButton";
import {
  AlertList,
  Badge,
  Card,
  Details,
  Field,
  Flash,
  Hidden,
  KeyValue,
  PageShell,
  Select,
  StageStepper,
  UpdatesFeed,
} from "../../../../_components/ui";

const TASK_TONES = {
  pending_acceptance: "warning",
  in_progress: "info",
  completed: "success",
  declined: "danger",
  reassigned: "neutral",
} as const;

const FILE_TONES = { pending: "warning", accepted: "success", rejected: "danger", replaced: "neutral" } as const;

function researcherOptions(researchers: Researcher[]) {
  return researchers.map((r) => ({ value: r.id, label: `${r.name} — ${r.expertise.join("، ")}` }));
}

export default async function ManagerStudyPage({ params, searchParams }: PageProps<"/studies/m/[token]/s/[studyId]">) {
  const { token, studyId } = await params;
  const db = await readDb();
  const { study } = managerStudy(db, token, studyId);
  const client = db.clients.find((c) => c.id === study.clientId)!;
  const ids = { token, studyId };
  const tasks = db.tasks.filter((t) => t.studyId === study.id);
  const canPlan = study.status === "planning" || study.status === "execution";
  const end = plannedEndDate(study);

  return (
    <PageShell title={study.title} subtitle={`${client.companyName} · ${study.studyType}`}>
      <Link href={`/studies/m/${token}`} className="-mt-3 text-sm text-info">
        ← كل الدراسات
      </Link>
      <Flash searchParams={searchParams} />

      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Badge tone="info">{STUDY_STATUS_LABELS[study.status]}</Badge>
          <span className="text-xs text-muted">
            {client.contactName} · {client.phone} · {client.email}
          </span>
        </div>
        <StageStepper status={study.status} />
        <div className="mt-5">
          <AlertList alerts={managerAlerts(db, study)} />
        </div>
      </Card>

      <ScopeCard study={study} ids={ids} />

      {study.scopeApprovedAt && (
        <Card title="خطة التنفيذ ومراحلها" step={3}>
          {canPlan ? (
            <form action={savePlan} className="flex flex-col gap-4">
              <Hidden {...ids} />
              <div className="grid gap-4 sm:grid-cols-3">
                {PHASE_KEYS.map((key) => (
                  <Field
                    key={key}
                    label={`${PHASE_LABELS[key]} (أيام)`}
                    name={`days_${key}`}
                    type="number"
                    defaultValue={String(study.plan?.find((p) => p.key === key)?.durationDays ?? "")}
                  />
                ))}
              </div>
              <div>
                <SubmitButton>حفظ الخطة</SubmitButton>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {study.plan?.map((p) => (
                <Badge key={p.key}>
                  {PHASE_LABELS[p.key]}: {p.durationDays} يوم
                </Badge>
              ))}
            </div>
          )}
          {end && <p className="mt-3 text-xs text-muted">نهاية الجدول المخطط: {formatDateTime(end.toISOString())}</p>}
        </Card>
      )}

      {study.plan && (
        <Card title="الفريق والمهام" step={4}>
          <ResearcherPool db={db} ids={ids} />

          {canPlan && (
            <div className="mt-5">
              <Details summary="+ إسناد مهمة جديدة لباحث">
                <form action={createTask} className="flex flex-col gap-4">
                  <Hidden {...ids} />
                  <Select label="الباحث" name="researcherId" placeholder="اختر باحثًا" options={researcherOptions(db.researchers)} />
                  <Field label="وصف المهمة وأداة الجمع" name="description" multiline required />
                  <Field label="الموعد النهائي" name="deadline" type="date" required />
                  <div>
                    <SubmitButton>إسناد المهمة</SubmitButton>
                  </div>
                </form>
              </Details>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-4">
            {tasks.length === 0 && <p className="text-sm text-muted">لم تُوزَّع مهام بعد.</p>}
            {tasks.map((task) => (
              <TaskPanel key={task.id} db={db} study={study} task={task} ids={ids} />
            ))}
          </div>

          {study.status === "planning" && (
            <form action={startExecution} className="mt-5 border-t border-surface-border pt-5">
              <Hidden {...ids} />
              <SubmitButton variant="success">بدء التنفيذ وجمع البيانات</SubmitButton>
            </form>
          )}
        </Card>
      )}

      {study.plan && <AnalysisCard db={db} study={study} ids={ids} />}

      <Card title="التواصل مع العميل">
        <MessageThread messages={db.messages.filter((m) => m.studyId === study.id)} viewer="manager" />
        <form action={replyToClient} className="mt-4 flex flex-col gap-3">
          <Hidden {...ids} />
          <Field label="الرد على العميل" name="body" multiline />
          <div>
            <SubmitButton>إرسال الرد</SubmitButton>
          </div>
        </form>
        <ForwardForm db={db} study={study} ids={ids} />
      </Card>

      <Card title="تحديثات للعميل">
        <UpdatesFeed updates={study.updates} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Details summary="نشر تحديث">
            <form action={postUpdate} className="flex flex-col gap-3">
              <Hidden {...ids} />
              <Field label="نص التحديث" name="text" multiline />
              <div>
                <SubmitButton>نشر</SubmitButton>
              </div>
            </form>
          </Details>
          <Details summary="إبلاغ العميل بتأخير">
            <form action={recordDelay} className="flex flex-col gap-3">
              <Hidden {...ids} />
              <Field label="سبب التأخير" name="reason" multiline required />
              <Field label="الموعد الجديد" name="deadline" type="date" required />
              <div>
                <SubmitButton variant="ghost">إبلاغ العميل</SubmitButton>
              </div>
            </form>
          </Details>
        </div>
      </Card>
    </PageShell>
  );
}

type Ids = { token: string; studyId: string };

function ScopeCard({ study, ids }: { study: Study; ids: Ids }) {
  const editable = ["submitted", "planning", "execution", "analysis"].includes(study.status);
  return (
    <Card title="نطاق الدراسة ومتطلباتها" step={2}>
      {!study.scopeApprovedAt && (
        <p className="mb-4 rounded-xl bg-warning-soft px-4 py-2 text-sm text-warning">
          النطاق لم يُعتمد بعد من العميل. يمكنك تعبئته بالتنسيق معه، والعميل يعتمده من رابطه.
        </p>
      )}
      <KeyValue
        items={[
          ["الهدف من الدراسة", study.scope.objective],
          ["الفئة المستهدفة", study.scope.targetAudience],
          ["المناطق", study.scope.regions],
          ["الجدول الزمني", study.scope.timeline],
          ["الميزانية المتوقعة", study.scope.budget],
          ["اعتُمد", formatDateTime(study.scopeApprovedAt)],
        ]}
      />
      <div className="mt-5 flex flex-col gap-3">
        {editable && (
          <Details summary={study.scopeApprovedAt ? "تسجيل تغيير على النطاق المعتمد" : "تعديل النطاق"}>
            <form action={managerSaveScope} className="flex flex-col gap-4">
              <Hidden {...ids} />
              <ScopeFields scope={study.scope} />
              {study.scopeApprovedAt && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="ما الذي تغيّر" name="summary" multiline required />
                  <Field label="الأثر المتفق عليه على الوقت والتكلفة" name="impact" multiline required />
                </div>
              )}
              <div>
                <SubmitButton>حفظ</SubmitButton>
              </div>
            </form>
          </Details>
        )}
        {study.status === "planning" && (
          <Details summary="النطاق أكبر من الوقت أو الموارد؟ أعده للعميل لإعادة الاتفاق">
            <form action={reopenScope} className="flex flex-col gap-3">
              <Hidden {...ids} />
              <Field label="سبب إعادة التفاوض (يظهر للعميل)" name="note" multiline required />
              <div>
                <SubmitButton variant="ghost">إعادة النطاق للعميل</SubmitButton>
              </div>
            </form>
          </Details>
        )}
        {study.scopeHistory.length > 0 && (
          <Details summary={`سجل تغييرات النطاق (${study.scopeHistory.length})`}>
            <ul className="flex flex-col gap-3 text-sm">
              {study.scopeHistory.map((c, i) => (
                <li key={i}>
                  <p>
                    {formatDateTime(c.at)} — {c.summary}
                  </p>
                  <p className="text-xs text-muted">الأثر: {c.impact} · الهدف السابق: {c.previous.objective}</p>
                </li>
              ))}
            </ul>
          </Details>
        )}
      </div>
    </Card>
  );
}

function ResearcherPool({ db, ids }: { db: Db; ids: Ids }) {
  return (
    <Details summary={`قاعدة الباحثين والخبراء (${db.researchers.length})`}>
      <ul className="flex flex-col gap-3 text-sm">
        {db.researchers.map((r) => {
          const active = db.tasks.filter(
            (t) => t.researcherId === r.id && (t.status === "pending_acceptance" || t.status === "in_progress")
          ).length;
          return (
            <li key={r.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-muted">مهام جارية: {active}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.expertise.map((e) => (
                  <Badge key={e}>{e}</Badge>
                ))}
              </div>
              {r.performanceNotes.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-muted">
                  {r.performanceNotes.map((n, i) => (
                    <li key={i}>
                      {formatDateTime(n.at)}: {n.text}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <form action={addPerformanceNote} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <Hidden {...ids} />
        <Select label="ملاحظة أداء لـ" name="researcherId" placeholder="اختر" options={researcherOptions(db.researchers)} />
        <Field label="الملاحظة (لا يراها إلا مدير الدراسة)" name="text" />
        <SubmitButton variant="ghost">حفظ</SubmitButton>
      </form>
    </Details>
  );
}

function TaskPanel({ db, study, task, ids }: { db: Db; study: Study; task: Task; ids: Ids }) {
  const researcher = db.researchers.find((r) => r.id === task.researcherId);
  const files = db.files.filter((f) => f.kind === "data" && f.taskId === task.id);
  const reassignable = ["pending_acceptance", "declined", "in_progress"].includes(task.status);
  const taskIds = { ...ids, taskId: task.id };

  return (
    <article className={`rounded-xl border border-surface-border p-4 ${task.status === "reassigned" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{researcher?.name}</p>
        <div className="flex gap-1.5">
          {task.issues.some((i) => i.urgent && !i.resolvedAt) && <Badge tone="danger">عاجل</Badge>}
          <Badge tone={TASK_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{task.description}</p>
      <p className="mt-1 text-xs text-muted">
        الموعد النهائي: {task.deadline} · أُسندت {formatDateTime(task.createdAt)}
        {task.acceptedAt && ` · أكد الاستلام ${formatDateTime(task.acceptedAt)}`}
      </p>
      {task.declineReason && <p className="mt-2 text-sm text-danger">سبب الاعتذار: {task.declineReason}</p>}

      {task.issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {task.issues.map((issue) => (
            <li
              key={issue.id}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                issue.resolvedAt ? "bg-background text-muted" : issue.urgent ? "bg-danger-soft" : "bg-warning-soft"
              }`}
            >
              <span>
                <strong>{ISSUE_KIND_LABELS[issue.kind]}</strong>: {issue.text}
                <span className="block text-xs text-muted">{formatDateTime(issue.at)}</span>
              </span>
              {!issue.resolvedAt && (
                <form action={resolveIssue}>
                  <Hidden {...taskIds} issueId={issue.id} />
                  <SubmitButton variant="ghost">تمت المعالجة</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.id} className="rounded-lg border border-surface-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={`/studies/files/${file.id}?t=${ids.token}`} className="font-medium text-info">
                  {file.originalName}
                </a>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {formatBytes(file.size)} · {formatDateTime(file.uploadedAt)}
                  <Badge tone={FILE_TONES[file.status]}>{FILE_STATUS_LABELS[file.status]}</Badge>
                </span>
              </div>
              {file.reviewNote && <p className="mt-1 text-xs text-danger">ملاحظات الرفض: {file.reviewNote}</p>}
              {study.status === "execution" && (file.status === "pending" || file.status === "accepted") && (
                <form action={reviewFile} className="mt-2 flex flex-wrap items-end gap-2">
                  <Hidden {...ids} fileId={file.id} />
                  {file.status === "pending" && (
                    <SubmitButton name="decision" value="accept" variant="success">
                      قبول
                    </SubmitButton>
                  )}
                  <input
                    name="note"
                    placeholder="ملاحظات واضحة عند الرفض"
                    className="min-w-48 flex-1 rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
                  />
                  <SubmitButton name="decision" value="reject" variant="danger">
                    رفض وإعادة للباحث
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {(task.notes.length > 0 || task.queries.length > 0) && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
          {task.notes.map((n, i) => (
            <li key={`n${i}`}>ملاحظة للباحث ({formatDateTime(n.at)}): {n.text}</li>
          ))}
          {task.queries.map((q) => (
            <li key={q.id}>
              استفسار المحلل: {q.text} — {q.answer ? `رد الباحث: ${q.answer}` : "بانتظار رد الباحث"}
            </li>
          ))}
        </ul>
      )}

      {task.status !== "reassigned" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {reassignable && (
            <Details summary="إعادة إسناد المهمة">
              <form action={reassignTask} className="flex flex-col gap-3">
                <Hidden {...taskIds} />
                <Select
                  label="الباحث الجديد"
                  name="researcherId"
                  placeholder="اختر باحثًا"
                  options={researcherOptions(db.researchers.filter((r) => r.id !== task.researcherId))}
                />
                <Field label="موعد نهائي جديد (اختياري)" name="deadline" type="date" />
                <div>
                  <SubmitButton variant="ghost">إعادة الإسناد</SubmitButton>
                </div>
              </form>
            </Details>
          )}
          <Details summary="ملاحظة للباحث">
            <form action={addTaskNote} className="flex flex-col gap-3">
              <Hidden {...taskIds} />
              <Field label="الملاحظة" name="text" multiline />
              <div>
                <SubmitButton variant="ghost">إرسال</SubmitButton>
              </div>
            </form>
          </Details>
        </div>
      )}
    </article>
  );
}

function AnalysisCard({ db, study, ids }: { db: Db; study: Study; ids: Ids }) {
  const report = reportFor(db, study.id);
  const latest = report?.versions.at(-1) ?? null;
  const blocker = analysisBlocker(db, study);
  const analyst = db.researchers.find((r) => r.id === study.analystId);

  return (
    <Card title="التحليل والتقرير" step={5}>
      <div className="flex flex-col gap-4">
        {study.status === "planning" || study.status === "execution" ? (
          <form action={setAnalyst} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Hidden {...ids} />
            <Select
              label="المحلل المسؤول عن هذه الدراسة"
              name="researcherId"
              placeholder="اختر من قاعدة الباحثين والخبراء"
              defaultValue={study.analystId ?? undefined}
              options={researcherOptions(db.researchers)}
            />
            <SubmitButton variant="ghost">حفظ</SubmitButton>
          </form>
        ) : (
          <p className="text-sm">
            المحلل: <strong>{analyst?.name ?? "—"}</strong>
          </p>
        )}

        {study.status === "execution" && (
          <form action={startAnalysis} className="flex flex-wrap items-center gap-3">
            <Hidden {...ids} />
            <SubmitButton variant="success">إرسال البيانات المعتمدة للتحليل</SubmitButton>
            {blocker && <span className="text-xs text-muted">{blocker}</span>}
          </form>
        )}

        {report && (
          <div className="flex flex-col gap-4 border-t border-surface-border pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={report.status === "in_review" ? "warning" : report.status === "drafting" ? "neutral" : "success"}>
                {REPORT_STATUS_LABELS[report.status]}
              </Badge>
              {latest && <span className="text-muted">آخر نسخة: {latest.version}</span>}
              {report.halted && <Badge tone="danger">التسليم موقوف</Badge>}
              <span className="text-muted">طلبات تعديل العميل: {report.revisionRequests.length} من 2</span>
            </div>
            {report.managerNote && report.status === "drafting" && (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">بانتظار المحلل: {report.managerNote}</p>
            )}
            {liveTasks(db, study.id).some((t) => t.queries.some((q) => !q.answer)) && (
              <p className="text-xs text-muted">لدى المحلل استفسارات عن تناقضات بانتظار رد الباحثين.</p>
            )}

            {latest && (report.status === "in_review" || report.status === "approved") && (
              <Details summary={`قراءة التقرير — النسخة ${latest.version}`}>
                <ReportView version={latest} fileHref={latest.fileId ? `/studies/files/${latest.fileId}?t=${ids.token}` : null} />
                <p className="mt-4 text-xs text-muted">راجع التقرير مقابل النطاق الأصلي: {study.scope.objective}</p>
              </Details>
            )}

            {report.status === "in_review" && (
              <form action={reviewReport} className="flex flex-col gap-3">
                <Hidden {...ids} />
                <Field label="ملاحظات المراجعة" name="note" multiline hint="مطلوبة عند طلب التعديل أو إيقاف التسليم." />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approve" variant="success">
                    اعتماد التقرير
                  </SubmitButton>
                  <SubmitButton name="decision" value="changes" variant="ghost">
                    طلب تعديلات
                  </SubmitButton>
                  <SubmitButton name="decision" value="halt" variant="danger">
                    خلل جوهري: إيقاف التسليم وإعادة التحليل
                  </SubmitButton>
                </div>
              </form>
            )}

            {report.status === "approved" && (
              <form action={deliverReport}>
                <Hidden {...ids} />
                <SubmitButton variant="success">تسليم التقرير للعميل</SubmitButton>
              </form>
            )}

            {report.revisionRequests.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted">
                {report.revisionRequests.map((r, i) => (
                  <li key={i}>
                    طلب تعديل {i + 1} ({formatDateTime(r.at)}): {r.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ForwardForm({ db, study, ids }: { db: Db; study: Study; ids: Ids }) {
  const clientMessages = db.messages.filter((m) => m.studyId === study.id && m.from === "client" && !m.forwardedToTaskId);
  const tasks = liveTasks(db, study.id);
  if (clientMessages.length === 0 || tasks.length === 0) return null;
  return (
    <div className="mt-4">
      <Details summary="توجيه استفسار للباحث المعني">
        <form action={forwardMessage} className="flex flex-col gap-3">
          <Hidden {...ids} />
          <Select
            label="الاستفسار"
            name="messageId"
            defaultValue={clientMessages.at(-1)!.id}
            options={clientMessages.map((m) => ({ value: m.id, label: m.body.slice(0, 80) }))}
          />
          <Select
            label="المهمة"
            name="taskId"
            placeholder="اختر المهمة"
            options={tasks.map((t) => ({
              value: t.id,
              label: `${db.researchers.find((r) => r.id === t.researcherId)?.name} — ${t.description.slice(0, 50)}`,
            }))}
          />
          <p className="text-xs text-muted">يصل نص الاستفسار فقط، دون بيانات تواصل العميل.</p>
          <div>
            <SubmitButton variant="ghost">توجيه</SubmitButton>
          </div>
        </form>
      </Details>
    </div>
  );
}
