import type { Db, Study, Task } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function hoursSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / (60 * 60 * 1000);
}

/** Tasks that still count toward the study (not replaced by a reassignment). */
export function liveTasks(db: Db, studyId: string): Task[] {
  return db.tasks.filter((t) => t.studyId === studyId && t.status !== "reassigned");
}

export function taskFiles(db: Db, taskId: string) {
  return db.files.filter((f) => f.kind === "data" && f.taskId === taskId && f.status !== "replaced");
}

export function reportFor(db: Db, studyId: string) {
  return db.reports.find((r) => r.studyId === studyId) ?? null;
}

/** Only one study may be in execution at a time (spec §3.7). */
export function activeStudy(db: Db, exceptId?: string): Study | null {
  return db.studies.find((s) => s.id !== exceptId && (s.status === "execution" || s.status === "analysis")) ?? null;
}

export function plannedEndDate(study: Study): Date | null {
  if (!study.plan || !study.executionStartedAt) return null;
  const days = study.plan.reduce((sum, p) => sum + p.durationDays, 0);
  return new Date(new Date(study.executionStartedAt).getTime() + days * DAY_MS);
}

/** Why the study can't move to analysis yet, or null when it can. */
export function analysisBlocker(db: Db, study: Study): string | null {
  if (study.status !== "execution") return "الدراسة ليست في مرحلة التنفيذ.";
  if (!study.analystId) return "حدّد المحلل أولًا.";
  const tasks = liveTasks(db, study.id);
  if (tasks.length === 0) return "لا توجد مهام في الدراسة.";
  for (const task of tasks) {
    if (task.status !== "completed") return "كل المهام يجب أن تكون مكتملة.";
    const files = taskFiles(db, task.id);
    if (files.length === 0 || files.some((f) => f.status !== "accepted")) {
      return "كل الملفات المرفوعة يجب أن تكون مقبولة.";
    }
  }
  return null;
}

export type AlertLevel = "urgent" | "warning" | "info";

export interface Alert {
  level: AlertLevel;
  text: string;
}

/**
 * Automatic alerts for the study manager — and only for them; there is no
 * escalation above the manager (spec §4 note 2).
 */
export function managerAlerts(db: Db, study: Study, now = Date.now()): Alert[] {
  const alerts: Alert[] = [];
  const researcherName = (id: string) => db.researchers.find((r) => r.id === id)?.name ?? "باحث";

  for (const task of liveTasks(db, study.id)) {
    for (const issue of task.issues) {
      if (issue.resolvedAt) continue;
      alerts.push({
        level: issue.urgent ? "urgent" : "info",
        text: `${issue.urgent ? "عاجل — " : ""}بلاغ من ${researcherName(task.researcherId)}: ${issue.text}`,
      });
    }
    if (task.status === "pending_acceptance" && hoursSince(task.createdAt, now) >= 24) {
      alerts.push({
        level: "warning",
        text: `${researcherName(task.researcherId)} لم يؤكد استلام مهمة منذ أكثر من 24 ساعة — أعد إسنادها.`,
      });
    }
    if (task.status === "declined") {
      alerts.push({ level: "warning", text: `${researcherName(task.researcherId)} اعتذر عن مهمة — أعد إسنادها.` });
    }
  }

  const unanswered = db.messages.filter((m) => m.studyId === study.id && m.from === "client" && !m.repliedAt);
  const overdue = unanswered.filter((m) => hoursSince(m.at, now) >= 24);
  if (overdue.length > 0) {
    alerts.push({ level: "warning", text: `تذكير: ${overdue.length} استفسار من العميل بلا رد منذ أكثر من 24 ساعة.` });
  } else if (unanswered.length > 0) {
    alerts.push({ level: "info", text: `${unanswered.length} رسالة جديدة من العميل.` });
  }

  const pendingFiles = db.files.filter((f) => f.studyId === study.id && f.kind === "data" && f.status === "pending");
  if (pendingFiles.length > 0) {
    alerts.push({ level: "info", text: `${pendingFiles.length} ملف بانتظار مراجعة الجودة.` });
  }

  const report = reportFor(db, study.id);
  if (report?.status === "in_review") alerts.push({ level: "info", text: "التقرير بانتظار اعتمادك." });

  const end = plannedEndDate(study);
  const lastDelay = study.delays.at(-1);
  if (
    end &&
    end.getTime() < now &&
    (study.status === "execution" || study.status === "analysis") &&
    (!lastDelay || new Date(lastDelay.newDate).getTime() < now)
  ) {
    alerts.push({ level: "warning", text: "الدراسة تجاوزت جدولها الزمني — أبلغ العميل بسبب التأخير والموعد الجديد." });
  }

  return alerts;
}
