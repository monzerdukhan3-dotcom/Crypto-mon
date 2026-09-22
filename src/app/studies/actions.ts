"use server";

import { redirect } from "next/navigation";
import {
  ActionError,
  analystStudy,
  clientStudy,
  managerStudy,
  researcherTask,
} from "@/lib/studies/access";
import { MAX_REVISIONS, PHASE_KEYS } from "@/lib/studies/labels";
import { activeStudy, analysisBlocker, hoursSince, liveTasks, reportFor, taskFiles } from "@/lib/studies/queries";
import { MAX_UPLOAD_BYTES, mutate, newId, newToken, writeUpload } from "@/lib/studies/store";
import type { Db, DataFile, IssueKind, Scope, Study } from "@/lib/studies/types";

// Every action re-derives the caller from the token in the submitted form —
// Server Actions are plain POST endpoints, so nothing from the page is trusted.

type Flash = { ok?: string; error?: string };

function withFlash(path: string, flash: Flash): string {
  const params = new URLSearchParams();
  if (flash.ok) params.set("ok", flash.ok);
  if (flash.error) params.set("error", flash.error);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Applies `fn` to the database and redirects back with a flash message.
 * `fn` may return a different path to land on (e.g. a newly created link).
 */
async function perform(back: string, fn: (db: Db) => string | void | Promise<string | void>, ok?: string) {
  let target = back;
  let flash: Flash = { ok };
  try {
    target = (await mutate(fn)) ?? back;
  } catch (error) {
    if (!(error instanceof ActionError)) throw error;
    flash = { error: error.message };
  }
  redirect(withFlash(target, flash));
}

function text(form: FormData, name: string, label?: string, max = 5000): string {
  const value = String(form.get(name) ?? "").trim();
  if (label && !value) throw new ActionError(`الحقل "${label}" مطلوب.`);
  if (value.length > max) throw new ActionError(`الحقل "${label ?? name}" أطول من المسموح.`);
  return value;
}

function now(): string {
  return new Date().toISOString();
}

function pushUpdate(study: Study, kind: Study["updates"][number]["kind"], message: string) {
  study.updates.push({ at: now(), kind, text: message });
}

const clientPath = (token: string) => `/studies/c/${token}`;
const managerStudyPath = (token: string, studyId: string) => `/studies/m/${token}/s/${studyId}`;
const taskPath = (token: string, taskId: string) => `/studies/r/${token}/t/${taskId}`;
const analysisPath = (token: string, studyId: string) => `/studies/r/${token}/a/${studyId}`;

// ─── Client: request a study (spec §5.1) ────────────────────────────────────

function readRequest(form: FormData, submitting: boolean) {
  const need = (label: string) => (submitting ? label : undefined);
  return {
    companyName: text(form, "companyName", need("اسم الشركة"), 200),
    contactName: text(form, "contactName", need("الشخص المسؤول"), 200),
    phone: text(form, "phone", need("الهاتف"), 50),
    email: text(form, "email", need("البريد الإلكتروني"), 200),
    title: text(form, "title", undefined, 200),
    studyType: text(form, "studyType", need("نوع الدراسة"), 100),
  };
}

export async function createRequest(form: FormData) {
  const submitting = form.get("intent") === "submit";
  await perform(
    "/studies/request",
    (db) => {
      const data = readRequest(form, submitting);
      if (!submitting && !data.companyName && !data.studyType) {
        throw new ActionError("اكتب اسم الشركة أو نوع الدراسة على الأقل لحفظ المسودة.");
      }
      const manager = db.managers[0];
      if (!manager) throw new ActionError("لا يوجد مدير دراسة متاح حاليًا.");
      const client = {
        id: newId(),
        companyName: data.companyName,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
      };
      const token = newToken();
      const at = now();
      const study: Study = {
        id: newId(),
        clientId: client.id,
        clientToken: token,
        title: data.title || data.studyType,
        studyType: data.studyType,
        status: submitting ? "submitted" : "draft",
        createdAt: at,
        submittedAt: submitting ? at : null,
        scope: { objective: "", targetAudience: "", regions: "", timeline: "", budget: "" },
        scopeApprovedAt: null,
        scopeHistory: [],
        plan: null,
        managerId: manager.id,
        analystId: null,
        executionStartedAt: null,
        analysisStartedAt: null,
        updates: [],
        delays: [],
      };
      if (submitting) pushUpdate(study, "system", "تم استلام طلب الدراسة.");
      db.clients.push(client);
      db.studies.push(study);
      return clientPath(token);
    },
    submitting
      ? "تم استلام طلبك. احفظ رابط هذه الصفحة — هو طريقك لمتابعة الدراسة."
      : "حُفظ الطلب كمسودة. احفظ رابط هذه الصفحة للعودة إليه وإكماله لاحقًا."
  );
}

export async function updateDraftRequest(form: FormData) {
  const token = text(form, "token");
  const submitting = form.get("intent") === "submit";
  await perform(
    clientPath(token),
    (db) => {
      const { study, client } = clientStudy(db, token);
      if (study.status !== "draft") throw new ActionError("تم إرسال هذا الطلب مسبقًا.");
      const data = readRequest(form, submitting);
      Object.assign(client, {
        companyName: data.companyName,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
      });
      study.title = data.title || data.studyType;
      study.studyType = data.studyType;
      if (submitting) {
        study.status = "submitted";
        study.submittedAt = now();
        pushUpdate(study, "system", "تم استلام طلب الدراسة.");
      }
    },
    submitting ? "تم استلام طلبك. الخطوة التالية: تحديد نطاق الدراسة." : "حُفظت المسودة."
  );
}

// ─── Scope (spec §5.1 "يحدد نطاق ومتطلبات الدراسة") ──────────────────────────

function readScope(form: FormData, required: boolean): Scope {
  const need = (label: string) => (required ? label : undefined);
  return {
    objective: text(form, "objective", need("الهدف من الدراسة")),
    targetAudience: text(form, "targetAudience", need("الفئة المستهدفة")),
    regions: text(form, "regions", need("المناطق"), 1000),
    timeline: text(form, "timeline", need("الجدول الزمني"), 1000),
    budget: text(form, "budget", need("الميزانية المتوقعة"), 500),
  };
}

export async function saveClientScope(form: FormData) {
  const token = text(form, "token");
  const approving = form.get("intent") === "approve";
  await perform(
    clientPath(token),
    (db) => {
      const { study } = clientStudy(db, token);
      if (study.status !== "submitted") throw new ActionError("لا يمكن تعديل النطاق في هذه المرحلة.");
      study.scope = readScope(form, approving);
      if (approving) {
        study.scopeApprovedAt = now();
        study.status = "planning";
        pushUpdate(study, "scope", "اعتُمد نطاق الدراسة كنسخة نهائية. يعمل مدير الدراسة الآن على خطة التنفيذ.");
      }
    },
    approving ? "اعتُمد النطاق. انتقلت الدراسة إلى مرحلة التخطيط." : "حُفظ النطاق."
  );
}

export async function managerSaveScope(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (!["submitted", "planning", "execution", "analysis"].includes(study.status)) {
        throw new ActionError("لا يمكن تعديل النطاق في هذه المرحلة.");
      }
      if (!study.scopeApprovedAt) {
        // Still being defined with the client — edit in place.
        study.scope = readScope(form, false);
        return;
      }
      // An approved scope only changes with a documented, agreed impact.
      const summary = text(form, "summary", "ما الذي تغيّر");
      const impact = text(form, "impact", "الأثر على الوقت والتكلفة");
      study.scopeHistory.push({ at: now(), by: "manager", previous: study.scope, summary, impact });
      study.scope = readScope(form, true);
      pushUpdate(study, "scope", `تعديل على نطاق الدراسة: ${summary} — الأثر المتفق عليه: ${impact}`);
    },
    "حُفظ النطاق."
  );
}

/** Renegotiate before execution: send the scope back to the client (spec §7). */
export async function reopenScope(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (study.status !== "planning") throw new ActionError("إعادة التفاوض متاحة فقط قبل بدء التنفيذ.");
      const note = text(form, "note", "سبب إعادة التفاوض");
      study.scopeApprovedAt = null;
      study.status = "submitted";
      pushUpdate(study, "scope", `يحتاج نطاق الدراسة لإعادة الاتفاق قبل البدء: ${note}`);
    },
    "أُعيد النطاق للعميل لإعادة الاتفاق."
  );
}

// ─── Client: follow up, talk to the team, receive the report ────────────────

export async function sendClientMessage(form: FormData) {
  const token = text(form, "token");
  await perform(
    clientPath(token),
    (db) => {
      const { study } = clientStudy(db, token);
      if (study.status === "draft") throw new ActionError("أرسل الطلب أولًا.");
      db.messages.push({
        id: newId(),
        studyId: study.id,
        from: "client",
        body: text(form, "body", "الرسالة"),
        at: now(),
        repliedAt: null,
        forwardedToTaskId: null,
      });
    },
    "أُرسلت رسالتك إلى مدير الدراسة."
  );
}

export async function confirmReceipt(form: FormData) {
  const token = text(form, "token");
  await perform(
    clientPath(token),
    (db) => {
      const { study } = clientStudy(db, token);
      const report = reportFor(db, study.id);
      if (!report || report.status !== "delivered") throw new ActionError("لا يوجد تقرير مُسلَّم بعد.");
      if (report.receivedAt) throw new ActionError("تم تأكيد الاستلام مسبقًا.");
      report.receivedAt = now();
      study.status = "completed";
      pushUpdate(study, "system", `أكد العميل استلام التقرير (النسخة ${report.deliveredVersion}).`);
    },
    "شكرًا لك، تم تأكيد استلام التقرير."
  );
}

export async function requestRevision(form: FormData) {
  const token = text(form, "token");
  await perform(
    clientPath(token),
    (db) => {
      const { study } = clientStudy(db, token);
      const report = reportFor(db, study.id);
      if (!report || report.status !== "delivered") throw new ActionError("لا يوجد تقرير مُسلَّم لطلب تعديله.");
      if (report.revisionRequests.length >= MAX_REVISIONS) {
        throw new ActionError(`استُنفد الحد الأقصى للتعديلات على هذا التقرير (${MAX_REVISIONS} مرتان).`);
      }
      const request = text(form, "text", "ما الذي يحتاج تعديلًا");
      report.revisionRequests.push({ at: now(), text: request });
      report.status = "drafting";
      report.managerNote = `طلب تعديل من العميل: ${request}`;
      report.halted = false;
      report.receivedAt = null;
      study.status = "analysis";
      pushUpdate(
        study,
        "system",
        `استُلم طلب التعديل رقم ${report.revisionRequests.length} من ${MAX_REVISIONS}. سيُعاد إرسال التقرير بعد تعديله.`
      );
    },
    "استُلم طلب التعديل."
  );
}

// ─── Manager: plan, team, tasks (spec §5.2) ──────────────────────────────────

export async function savePlan(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (study.status !== "planning" && study.status !== "execution") {
        throw new ActionError("الخطة تُحدَّد بعد اعتماد النطاق وقبل التحليل.");
      }
      study.plan = PHASE_KEYS.map((key) => {
        const days = Number(form.get(`days_${key}`));
        if (!Number.isInteger(days) || days < 1 || days > 365) {
          throw new ActionError("مدة كل مرحلة يجب أن تكون عددًا صحيحًا من الأيام (1–365).");
        }
        return { key, durationDays: days };
      });
    },
    "حُفظت خطة التنفيذ."
  );
}

function assignableResearcher(db: Db, form: FormData, field = "researcherId") {
  const researcher = db.researchers.find((r) => r.id === text(form, field, "الباحث"));
  if (!researcher) throw new ActionError("اختر باحثًا من القائمة.");
  return researcher;
}

function readDeadline(form: FormData): string {
  const deadline = text(form, "deadline", "الموعد النهائي", 20);
  if (Number.isNaN(Date.parse(deadline))) throw new ActionError("الموعد النهائي غير صالح.");
  return deadline;
}

export async function createTask(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (study.status !== "planning" && study.status !== "execution") {
        throw new ActionError("المهام تُوزَّع في مرحلتي التخطيط والتنفيذ.");
      }
      if (!study.plan) throw new ActionError("حدّد خطة التنفيذ ومراحلها أولًا.");
      const researcher = assignableResearcher(db, form);
      db.tasks.push({
        id: newId(),
        studyId: study.id,
        researcherId: researcher.id,
        description: text(form, "description", "وصف المهمة"),
        deadline: readDeadline(form),
        status: "pending_acceptance",
        createdAt: now(),
        acceptedAt: null,
        completedAt: null,
        declineReason: null,
        replacedByTaskId: null,
        issues: [],
        notes: [],
        queries: [],
      });
    },
    "أُسندت المهمة وأُبلغ الباحث عبر رابطه."
  );
}

export async function reassignTask(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const task = db.tasks.find((t) => t.id === text(form, "taskId") && t.studyId === study.id);
      if (!task) throw new ActionError("المهمة غير موجودة.");
      if (!["pending_acceptance", "declined", "in_progress"].includes(task.status)) {
        throw new ActionError("لا يمكن إعادة إسناد هذه المهمة.");
      }
      const researcher = assignableResearcher(db, form);
      if (researcher.id === task.researcherId) throw new ActionError("اختر باحثًا مختلفًا.");
      const previous = db.researchers.find((r) => r.id === task.researcherId);
      if (previous && task.status === "pending_acceptance" && hoursSince(task.createdAt) >= 24) {
        previous.performanceNotes.push({
          at: now(),
          studyId: study.id,
          text: "لم يؤكد استلام مهمة خلال 24 ساعة فأُعيد إسنادها.",
        });
      }
      const replacement = {
        ...task,
        id: newId(),
        researcherId: researcher.id,
        deadline: form.get("deadline") ? readDeadline(form) : task.deadline,
        status: "pending_acceptance" as const,
        createdAt: now(),
        acceptedAt: null,
        completedAt: null,
        declineReason: null,
        issues: [],
        queries: [],
        notes: [...task.notes],
      };
      task.status = "reassigned";
      task.replacedByTaskId = replacement.id;
      db.tasks.push(replacement);
    },
    "أُعيد إسناد المهمة."
  );
}

export async function addTaskNote(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const task = db.tasks.find((t) => t.id === text(form, "taskId") && t.studyId === study.id);
      if (!task) throw new ActionError("المهمة غير موجودة.");
      task.notes.push({ at: now(), text: text(form, "text", "الملاحظة") });
    },
    "أُرسلت الملاحظة للباحث."
  );
}

export async function resolveIssue(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const task = db.tasks.find((t) => t.id === text(form, "taskId") && t.studyId === study.id);
      const issue = task?.issues.find((i) => i.id === text(form, "issueId"));
      if (!issue) throw new ActionError("البلاغ غير موجود.");
      issue.resolvedAt = now();
    },
    "أُغلق البلاغ."
  );
}

export async function addPerformanceNote(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const researcher = assignableResearcher(db, form);
      researcher.performanceNotes.push({ at: now(), studyId: study.id, text: text(form, "text", "الملاحظة", 1000) });
    },
    "حُفظت ملاحظة الأداء."
  );
}

export async function setAnalyst(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (study.status !== "planning" && study.status !== "execution") {
        throw new ActionError("يُحدَّد المحلل قبل بدء مرحلة التحليل.");
      }
      study.analystId = assignableResearcher(db, form).id;
    },
    "أُسند دور المحلل."
  );
}

export async function startExecution(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (study.status !== "planning") throw new ActionError("الدراسة ليست في مرحلة التخطيط.");
      if (!study.plan) throw new ActionError("حدّد خطة التنفيذ أولًا.");
      if (liveTasks(db, study.id).length === 0) throw new ActionError("وزّع مهمة واحدة على الأقل قبل البدء.");
      const other = activeStudy(db, study.id);
      if (other) {
        throw new ActionError(`لا يمكن تنفيذ أكثر من دراسة في نفس الوقت — "${other.title}" قيد التنفيذ حاليًا.`);
      }
      study.status = "execution";
      study.executionStartedAt = now();
      pushUpdate(study, "system", "بدأ تنفيذ الدراسة وجمع البيانات.");
    },
    "بدأ التنفيذ."
  );
}

// ─── Manager: data quality ───────────────────────────────────────────────────

export async function reviewFile(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  const accepting = form.get("decision") === "accept";
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      if (study.status !== "execution") throw new ActionError("مراجعة الملفات تتم أثناء التنفيذ.");
      const file = db.files.find((f) => f.id === text(form, "fileId") && f.studyId === study.id && f.kind === "data");
      if (!file || file.status === "replaced") throw new ActionError("الملف غير موجود.");
      file.reviewedAt = now();
      if (accepting) {
        file.status = "accepted";
        file.reviewNote = null;
        return;
      }
      file.status = "rejected";
      file.reviewNote = text(form, "note", "ملاحظات الرفض", 2000);
      const task = db.tasks.find((t) => t.id === file.taskId);
      if (task?.status === "completed") {
        task.status = "in_progress";
        task.completedAt = null;
      }
    },
    accepting ? "قُبل الملف." : "رُفض الملف وأُعيد للباحث مع الملاحظات."
  );
}

// ─── Manager: analysis, report approval and delivery ─────────────────────────

export async function startAnalysis(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const blocker = analysisBlocker(db, study);
      if (blocker) throw new ActionError(blocker);
      study.status = "analysis";
      study.analysisStartedAt = now();
      if (!reportFor(db, study.id)) {
        db.reports.push({
          studyId: study.id,
          status: "drafting",
          draft: { summary: "", findings: "", recommendations: "" },
          versions: [],
          managerNote: null,
          halted: false,
          deliveredVersion: null,
          deliveredAt: null,
          receivedAt: null,
          revisionRequests: [],
        });
      }
      pushUpdate(study, "system", "اكتمل جمع البيانات واعتمادها، وبدأ التحليل.");
    },
    "أُرسلت البيانات المعتمدة للمحلل."
  );
}

export async function reviewReport(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  const decision = String(form.get("decision"));
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const report = reportFor(db, study.id);
      if (!report || report.status !== "in_review") throw new ActionError("لا يوجد تقرير بانتظار المراجعة.");
      const latest = report.versions.at(-1)!;
      if (decision === "approve") {
        report.status = "approved";
        report.managerNote = null;
        report.halted = false;
        latest.reviewNote = text(form, "note", undefined, 2000) || null;
        return;
      }
      const note = text(form, "note", "ملاحظات المراجعة", 2000);
      latest.reviewNote = note;
      report.status = "drafting";
      report.managerNote = note;
      report.halted = decision === "halt";
      if (report.halted) {
        pushUpdate(study, "system", "أُوقف التسليم لمراجعة التحليل وضمان موثوقية النتائج.");
      }
    },
    decision === "approve"
      ? "اعتُمد التقرير وأصبح جاهزًا للتسليم."
      : decision === "halt"
        ? "أُوقف التسليم وأُعيد التحليل للمحلل."
        : "أُعيد التقرير للمحلل مع ملاحظات التعديل."
  );
}

export async function deliverReport(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const report = reportFor(db, study.id);
      if (!report || report.status !== "approved") throw new ActionError("اعتمد التقرير أولًا.");
      const version = report.versions.at(-1)!.version;
      report.status = "delivered";
      report.deliveredVersion = version;
      report.deliveredAt = now();
      report.receivedAt = null;
      study.status = "delivered";
      pushUpdate(study, "system", `سُلِّم التقرير النهائي (النسخة ${version}). يرجى تأكيد الاستلام.`);
    },
    "سُلِّم التقرير للعميل."
  );
}

// ─── Manager: keep the client informed ───────────────────────────────────────

export async function postUpdate(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      pushUpdate(study, "update", text(form, "text", "التحديث", 2000));
    },
    "نُشر التحديث للعميل."
  );
}

export async function recordDelay(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const reason = text(form, "reason", "سبب التأخير", 2000);
      const newDate = readDeadline(form);
      study.delays.push({ at: now(), reason, newDate });
      pushUpdate(study, "delay", `تأخير في الدراسة: ${reason} — الموعد الجديد: ${newDate}`);
    },
    "أُبلغ العميل بالتأخير والموعد الجديد."
  );
}

export async function replyToClient(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const at = now();
      db.messages.push({
        id: newId(),
        studyId: study.id,
        from: "manager",
        body: text(form, "body", "الرد"),
        at,
        repliedAt: null,
        forwardedToTaskId: null,
      });
      for (const m of db.messages) {
        if (m.studyId === study.id && m.from === "client" && !m.repliedAt) m.repliedAt = at;
      }
    },
    "أُرسل الرد للعميل."
  );
}

/** Route a client's question to the researcher concerned, without their contact details. */
export async function forwardMessage(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    managerStudyPath(token, studyId),
    (db) => {
      const { study } = managerStudy(db, token, studyId);
      const message = db.messages.find((m) => m.id === text(form, "messageId") && m.studyId === study.id);
      const task = liveTasks(db, study.id).find((t) => t.id === text(form, "taskId", "المهمة"));
      if (!message || !task) throw new ActionError("اختر المهمة المعنية.");
      task.notes.push({ at: now(), text: `استفسار من العميل: ${message.body}` });
      message.forwardedToTaskId = task.id;
    },
    "وُجِّه الاستفسار للباحث المعني."
  );
}

// ─── Researcher: tasks (spec §5.3) ───────────────────────────────────────────

export async function acceptTask(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  await perform(
    taskPath(token, taskId),
    (db) => {
      const { task } = researcherTask(db, token, taskId);
      if (task.status !== "pending_acceptance") throw new ActionError("لا يمكن تأكيد هذه المهمة.");
      task.status = "in_progress";
      task.acceptedAt = now();
    },
    "تم تأكيد استلام المهمة."
  );
}

export async function declineTask(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  await perform(
    taskPath(token, taskId),
    (db) => {
      const { researcher, task, study } = researcherTask(db, token, taskId);
      if (task.status !== "pending_acceptance" && task.status !== "in_progress") {
        throw new ActionError("لا يمكن الاعتذار عن هذه المهمة.");
      }
      task.status = "declined";
      task.declineReason = text(form, "reason", "سبب الاعتذار", 1000);
      researcher.performanceNotes.push({ at: now(), studyId: study.id, text: `اعتذر عن مهمة: ${task.declineReason}` });
    },
    "أُبلغ مدير الدراسة باعتذارك."
  );
}

function uploadedFiles(form: FormData, name: string): File[] {
  const files = form.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES) {
    throw new ActionError("حجم الملفات أكبر من المسموح (4MB في المرة الواحدة). ارفعها على دفعات أو اضغطها.");
  }
  return files;
}

async function storeFile(
  file: File,
  meta: Pick<DataFile, "kind" | "studyId" | "taskId" | "uploadedBy">
): Promise<DataFile> {
  const record: DataFile = {
    id: newId(),
    ...meta,
    originalName: file.name.slice(0, 255) || "ملف",
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    uploadedAt: now(),
    status: "pending",
    reviewNote: null,
    reviewedAt: null,
  };
  await writeUpload(record.id, Buffer.from(await file.arrayBuffer()));
  return record;
}

function assertCanUpload(task: { status: string }, study: Study) {
  if (study.status !== "execution") throw new ActionError("رفع البيانات متاح أثناء مرحلة التنفيذ فقط.");
  if (task.status !== "in_progress" && task.status !== "completed") {
    throw new ActionError("أكّد استلام المهمة أولًا.");
  }
}

export async function uploadTaskFiles(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  await perform(
    taskPath(token, taskId),
    async (db) => {
      const { researcher, task, study } = researcherTask(db, token, taskId);
      assertCanUpload(task, study);
      const files = uploadedFiles(form, "files");
      if (files.length === 0) throw new ActionError("اختر ملفًا واحدًا على الأقل.");
      for (const file of files) {
        db.files.push(
          await storeFile(file, { kind: "data", studyId: study.id, taskId: task.id, uploadedBy: researcher.id })
        );
      }
    },
    "رُفعت الملفات وهي بانتظار مراجعة مدير الدراسة."
  );
}

/** Swap a wrong/outdated file — only until analysis starts (spec §7). */
export async function replaceTaskFile(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  await perform(
    taskPath(token, taskId),
    async (db) => {
      const { researcher, task, study } = researcherTask(db, token, taskId);
      if (study.analysisStartedAt) throw new ActionError("بدأ التحليل على البيانات، لا يمكن استبدال الملف الآن.");
      assertCanUpload(task, study);
      const old = db.files.find((f) => f.id === text(form, "fileId") && f.taskId === task.id);
      if (!old || old.status === "replaced") throw new ActionError("الملف غير موجود.");
      const [file] = uploadedFiles(form, "file");
      if (!file) throw new ActionError("اختر الملف البديل.");
      old.status = "replaced";
      db.files.push(
        await storeFile(file, { kind: "data", studyId: study.id, taskId: task.id, uploadedBy: researcher.id })
      );
    },
    "استُبدل الملف وهو بانتظار المراجعة."
  );
}

export async function completeTask(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  await perform(
    taskPath(token, taskId),
    (db) => {
      const { task, study } = researcherTask(db, token, taskId);
      if (study.status !== "execution") throw new ActionError("الدراسة ليست في مرحلة التنفيذ.");
      if (task.status !== "in_progress") throw new ActionError("المهمة ليست جارية.");
      const files = taskFiles(db, task.id);
      if (files.length === 0) throw new ActionError("ارفع البيانات قبل تعليم المهمة كمكتملة.");
      if (files.some((f) => f.status === "rejected")) {
        throw new ActionError("استبدل الملفات المرفوضة بنسخ مصححة أولًا.");
      }
      task.status = "completed";
      task.completedAt = now();
    },
    "عُلِّمت المهمة كمكتملة."
  );
}

const ISSUE_KINDS: IssueKind[] = ["source_refused", "missing_data", "field", "other"];

export async function reportIssue(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  const urgent = form.get("urgent") === "on";
  await perform(
    taskPath(token, taskId),
    (db) => {
      const { task } = researcherTask(db, token, taskId);
      if (task.status === "reassigned") throw new ActionError("هذه المهمة لم تعد مسندة إليك.");
      const kind = String(form.get("kind")) as IssueKind;
      task.issues.push({
        id: newId(),
        at: now(),
        kind: ISSUE_KINDS.includes(kind) ? kind : "other",
        text: text(form, "text", "وصف المشكلة", 2000),
        urgent,
        resolvedAt: null,
      });
    },
    urgent ? "وصل البلاغ لمدير الدراسة كتنبيه عاجل." : "وصل البلاغ لمدير الدراسة."
  );
}

export async function answerQuery(form: FormData) {
  const token = text(form, "token");
  const taskId = text(form, "taskId");
  await perform(
    taskPath(token, taskId),
    (db) => {
      const { task } = researcherTask(db, token, taskId);
      const query = task.queries.find((q) => q.id === text(form, "queryId"));
      if (!query) throw new ActionError("الاستفسار غير موجود.");
      query.answer = text(form, "answer", "الرد", 2000);
      query.answeredAt = now();
    },
    "أُرسل ردك للمحلل."
  );
}

// ─── Analyst: analysis and report (spec §5.4) ────────────────────────────────

export async function askResearcher(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  await perform(
    analysisPath(token, studyId),
    (db) => {
      const { study } = analystStudy(db, token, studyId);
      if (study.status !== "analysis") throw new ActionError("الدراسة ليست في مرحلة التحليل.");
      const task = liveTasks(db, study.id).find((t) => t.id === text(form, "taskId", "المهمة"));
      if (!task) throw new ActionError("اختر المهمة المعنية.");
      task.queries.push({ id: newId(), at: now(), text: text(form, "text", "الاستفسار", 2000), answer: null, answeredAt: null });
    },
    "أُرسل الاستفسار للباحث للتأكد من البيانات."
  );
}

export async function saveReport(form: FormData) {
  const token = text(form, "token");
  const studyId = text(form, "studyId");
  const submitting = form.get("intent") === "submit";
  await perform(
    analysisPath(token, studyId),
    async (db) => {
      const { researcher, study } = analystStudy(db, token, studyId);
      const report = reportFor(db, study.id);
      if (study.status !== "analysis" || !report || report.status !== "drafting") {
        throw new ActionError("التقرير ليس قيد الإعداد حاليًا.");
      }
      report.draft = {
        summary: text(form, "summary", submitting ? "النتائج الأساسية" : undefined, 20000),
        findings: text(form, "findings", submitting ? "الشرح والتحليل" : undefined, 50000),
        recommendations: text(form, "recommendations", undefined, 20000),
      };
      if (!submitting) return;
      const [file] = uploadedFiles(form, "file");
      let fileId = report.versions.at(-1)?.fileId ?? null;
      if (file) {
        const stored = await storeFile(file, { kind: "report", studyId: study.id, taskId: null, uploadedBy: researcher.id });
        stored.status = "accepted";
        db.files.push(stored);
        fileId = stored.id;
      }
      report.versions.push({
        ...report.draft,
        version: report.versions.length + 1,
        submittedAt: now(),
        fileId,
        reviewNote: null,
      });
      report.status = "in_review";
    },
    submitting ? "أُرسل التقرير لمراجعة مدير الدراسة." : "حُفظت المسودة."
  );
}
