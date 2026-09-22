import type { FileStatus, IssueKind, PhaseKey, ReportStatus, StudyStatus, TaskStatus } from "./types";

export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  draft: "مسودة",
  submitted: "تحديد النطاق",
  planning: "تخطيط",
  execution: "تنفيذ",
  analysis: "تحليل",
  delivered: "تسليم",
  completed: "مكتملة",
};

/** The four stages the client sees (spec §8: تخطيط، تنفيذ، تحليل، تسليم). */
export const CLIENT_STAGES = [
  { key: "planning", label: "تخطيط", statuses: ["submitted", "planning"] },
  { key: "execution", label: "تنفيذ", statuses: ["execution"] },
  { key: "analysis", label: "تحليل", statuses: ["analysis"] },
  { key: "delivery", label: "تسليم", statuses: ["delivered", "completed"] },
] as const satisfies { key: string; label: string; statuses: StudyStatus[] }[];

export const PHASE_LABELS: Record<PhaseKey, string> = {
  collection: "جمع البيانات",
  analysis: "التحليل",
  report: "إعداد التقرير",
};

export const PHASE_KEYS: PhaseKey[] = ["collection", "analysis", "report"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending_acceptance: "بانتظار القبول",
  in_progress: "جارية",
  completed: "مكتملة",
  declined: "اعتذر الباحث",
  reassigned: "أُعيد إسنادها",
};

export const FILE_STATUS_LABELS: Record<FileStatus, string> = {
  pending: "بانتظار المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض ويحتاج تصحيح",
  replaced: "مستبدَل",
};

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  source_refused: "مصدر البيانات رفض التعاون / غير متاح",
  missing_data: "غياب بيانات",
  field: "ظرف ميداني",
  other: "أخرى",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  drafting: "قيد الإعداد",
  in_review: "قيد المراجعة",
  approved: "معتمد",
  delivered: "مُسلَّم",
};

export const STUDY_TYPES = [
  "دراسة سوق",
  "دراسة جدوى",
  "قياس رضا العملاء",
  "دراسة المنافسين",
  "دراسة ميدانية",
  "أخرى",
];

export const MAX_REVISIONS = 2;

const dateTime = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  timeStyle: "short",
  numberingSystem: "latn",
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : "—";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
