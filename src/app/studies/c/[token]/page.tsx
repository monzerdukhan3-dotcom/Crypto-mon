import { clientStudy } from "@/lib/studies/access";
import { MAX_REVISIONS, PHASE_LABELS, STUDY_STATUS_LABELS, formatDateTime } from "@/lib/studies/labels";
import { reportFor } from "@/lib/studies/queries";
import { readDb } from "@/lib/studies/store";
import {
  confirmReceipt,
  requestRevision,
  saveClientScope,
  sendClientMessage,
  updateDraftRequest,
} from "../../actions";
import MessageThread from "../../_components/MessageThread";
import RequestFields from "../../_components/RequestFields";
import ReportView from "../../_components/ReportView";
import ScopeFields from "../../_components/ScopeFields";
import SubmitButton from "../../_components/SubmitButton";
import { Badge, Card, Details, Field, Flash, Hidden, KeyValue, PageShell, StageStepper, UpdatesFeed } from "../../_components/ui";

export default async function ClientStudyPage({ params, searchParams }: PageProps<"/studies/c/[token]">) {
  const { token } = await params;
  const db = await readDb();
  const { study, client } = clientStudy(db, token);
  const manager = db.managers.find((m) => m.id === study.managerId);
  const report = reportFor(db, study.id);
  const messages = db.messages.filter((m) => m.studyId === study.id);
  const delivered = report?.versions.find((v) => v.version === report.deliveredVersion) ?? null;
  const revisionsLeft = MAX_REVISIONS - (report?.revisionRequests.length ?? 0);

  return (
    <PageShell title={study.title || "طلب دراسة"} subtitle={`${client.companyName} · ${study.studyType || "—"}`}>
      <Flash searchParams={searchParams} />

      {study.status === "draft" ? (
        <Card title="طلبك محفوظ كمسودة ولم يُرسل بعد">
          <p className="mb-4 text-sm text-muted">
            أكمل البيانات وأرسل الطلب متى كنت جاهزًا. هذا الرابط يعيدك إلى المسودة في أي وقت.
          </p>
          <form action={updateDraftRequest} className="flex flex-col gap-5">
            <Hidden token={token} />
            <RequestFields client={client} study={study} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="submit">
                إرسال الطلب
              </SubmitButton>
              <SubmitButton name="intent" value="draft" variant="ghost">
                حفظ المسودة
              </SubmitButton>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              المرحلة الحالية: <Badge tone="info">{STUDY_STATUS_LABELS[study.status]}</Badge>
            </p>
            <p className="text-xs text-muted">
              مدير الدراسة: {manager?.name} · استُلم الطلب {formatDateTime(study.submittedAt)}
            </p>
          </div>
          <StageStepper status={study.status} />
        </Card>
      )}

      {study.status === "submitted" && (
        <Card title="حدّد نطاق ومتطلبات الدراسة" step={2}>
          <p className="mb-4 text-sm text-muted">
            يمكنك الحفظ والعودة لاحقًا، أو التنسيق مع مدير الدراسة عبر الرسائل أدناه. بعد الاعتماد يصبح النطاق نسخة نهائية.
          </p>
          <form action={saveClientScope} className="flex flex-col gap-5">
            <Hidden token={token} />
            <ScopeFields scope={study.scope} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="approve" variant="success">
                اعتماد النطاق كنسخة نهائية
              </SubmitButton>
              <SubmitButton name="intent" value="save" variant="ghost">
                حفظ
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {study.scopeApprovedAt && (
        <Card title="النطاق المعتمد">
          <KeyValue
            items={[
              ["الهدف من الدراسة", study.scope.objective],
              ["الفئة المستهدفة", study.scope.targetAudience],
              ["المناطق", study.scope.regions],
              ["الجدول الزمني", study.scope.timeline],
              ["الميزانية المتوقعة", study.scope.budget],
              ["تاريخ الاعتماد", formatDateTime(study.scopeApprovedAt)],
            ]}
          />
          {study.plan && (
            <div className="mt-5 flex flex-wrap gap-2">
              {study.plan.map((p) => (
                <Badge key={p.key}>
                  {PHASE_LABELS[p.key]}: {p.durationDays} يوم
                </Badge>
              ))}
            </div>
          )}
          {study.scopeHistory.length > 0 && (
            <div className="mt-5">
              <Details summary={`سجل تغييرات النطاق (${study.scopeHistory.length})`}>
                <ul className="flex flex-col gap-2 text-sm">
                  {study.scopeHistory.map((c, i) => (
                    <li key={i}>
                      {formatDateTime(c.at)} — {c.summary} <span className="text-muted">(الأثر: {c.impact})</span>
                    </li>
                  ))}
                </ul>
              </Details>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">لطلب تغيير في النطاق أرسل رسالة لمدير الدراسة؛ يوثَّق التغيير ويُتفق على أثره قبل الاستمرار.</p>
        </Card>
      )}

      {delivered && report && (
        <Card title="التقرير النهائي">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="success">النسخة {delivered.version}</Badge>
            <span className="text-muted">سُلِّم {formatDateTime(report.deliveredAt)}</span>
            {report.receivedAt && <Badge tone="success">أكدت الاستلام {formatDateTime(report.receivedAt)}</Badge>}
            {report.status !== "delivered" && <Badge tone="warning">طلب التعديل قيد التنفيذ</Badge>}
          </div>
          <ReportView version={delivered} fileHref={delivered.fileId ? `/studies/files/${delivered.fileId}?t=${token}` : null} />

          {report.status === "delivered" && (
            <div className="mt-6 flex flex-col gap-4 border-t border-surface-border pt-5">
              {!report.receivedAt && (
                <form action={confirmReceipt}>
                  <Hidden token={token} />
                  <SubmitButton variant="success">تأكيد استلام التقرير</SubmitButton>
                </form>
              )}
              {revisionsLeft > 0 ? (
                <Details summary={`وجدت نقصًا أو خطأ؟ اطلب تعديلًا (متبقٍ ${revisionsLeft} من ${MAX_REVISIONS})`}>
                  <form action={requestRevision} className="flex flex-col gap-3">
                    <Hidden token={token} />
                    <Field label="ما الذي يحتاج تعديلًا؟" name="text" multiline required />
                    <div>
                      <SubmitButton variant="ghost">إرسال طلب التعديل</SubmitButton>
                    </div>
                  </form>
                </Details>
              ) : (
                <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
                  استُنفد الحد الأقصى للتعديلات على هذا التقرير ({MAX_REVISIONS} مرتان). لأي ملاحظة إضافية تواصل مع مدير الدراسة.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {study.status !== "draft" && (
        <>
          <Card title="تحديثات الدراسة">
            <UpdatesFeed updates={study.updates} />
          </Card>
          <Card title="التواصل مع فريق الدراسة">
            <MessageThread messages={messages} viewer="client" />
            <form action={sendClientMessage} className="mt-4 flex flex-col gap-3">
              <Hidden token={token} />
              <Field label="استفسار أو ملاحظة" name="body" multiline />
              <div>
                <SubmitButton>إرسال</SubmitButton>
              </div>
            </form>
          </Card>
        </>
      )}
    </PageShell>
  );
}
