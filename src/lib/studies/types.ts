/**
 * Data model for the studies platform MVP (spec §8). Every role reaches the
 * platform through a unique link (token) instead of accounts: the client's
 * link is per study, the manager's and researcher's are per person.
 */

export type ISODate = string;

export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
}

export interface Manager {
  id: string;
  name: string;
  email: string;
  token: string;
}

export interface PerformanceNote {
  at: ISODate;
  studyId: string;
  text: string;
}

/**
 * Everyone in the researchers & experts pool. "Researcher" vs "analyst" is not
 * a property of the person — it depends on whether they were given a task or
 * a study's analysis.
 */
export interface Researcher {
  id: string;
  name: string;
  phone: string;
  email: string;
  expertise: string[];
  token: string;
  /** Visible to study managers only (spec §8 sensitive data). */
  performanceNotes: PerformanceNote[];
}

export interface Scope {
  objective: string;
  targetAudience: string;
  regions: string;
  timeline: string;
  budget: string;
}

export interface ScopeChange {
  at: ISODate;
  by: "client" | "manager";
  previous: Scope;
  summary: string;
  /** Agreed effect on time and cost (spec §7). */
  impact: string;
}

export type PhaseKey = "collection" | "analysis" | "report";

export interface PlanPhase {
  key: PhaseKey;
  durationDays: number;
}

/**
 * draft → submitted (scope being defined) → planning → execution → analysis
 * → delivered → completed (client confirmed receipt).
 */
export type StudyStatus =
  | "draft"
  | "submitted"
  | "planning"
  | "execution"
  | "analysis"
  | "delivered"
  | "completed";

export interface StudyUpdate {
  at: ISODate;
  kind: "update" | "delay" | "scope" | "system";
  text: string;
}

export interface Delay {
  at: ISODate;
  reason: string;
  newDate: string;
}

export interface Study {
  id: string;
  clientId: string;
  clientToken: string;
  title: string;
  studyType: string;
  status: StudyStatus;
  createdAt: ISODate;
  submittedAt: ISODate | null;
  scope: Scope;
  scopeApprovedAt: ISODate | null;
  scopeHistory: ScopeChange[];
  plan: PlanPhase[] | null;
  managerId: string;
  analystId: string | null;
  executionStartedAt: ISODate | null;
  analysisStartedAt: ISODate | null;
  updates: StudyUpdate[];
  delays: Delay[];
}

export type TaskStatus = "pending_acceptance" | "in_progress" | "completed" | "declined" | "reassigned";

export type IssueKind = "source_refused" | "missing_data" | "field" | "other";

export interface TaskIssue {
  id: string;
  at: ISODate;
  kind: IssueKind;
  text: string;
  /** Affects the whole study schedule → urgent alert for the manager. */
  urgent: boolean;
  resolvedAt: ISODate | null;
}

export interface TaskNote {
  at: ISODate;
  text: string;
}

/** An analyst asking the researcher to double-check inconsistent data. */
export interface TaskQuery {
  id: string;
  at: ISODate;
  text: string;
  answer: string | null;
  answeredAt: ISODate | null;
}

export interface Task {
  id: string;
  studyId: string;
  researcherId: string;
  description: string;
  deadline: string;
  status: TaskStatus;
  createdAt: ISODate;
  acceptedAt: ISODate | null;
  completedAt: ISODate | null;
  declineReason: string | null;
  /** Set on a reassigned task: the task that replaced it. */
  replacedByTaskId: string | null;
  issues: TaskIssue[];
  notes: TaskNote[];
  queries: TaskQuery[];
}

export type FileStatus = "pending" | "accepted" | "rejected" | "replaced";

export interface DataFile {
  id: string;
  kind: "data" | "report";
  studyId: string;
  taskId: string | null;
  uploadedBy: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: ISODate;
  status: FileStatus;
  reviewNote: string | null;
  reviewedAt: ISODate | null;
}

export interface ReportVersion extends ReportDraft {
  version: number;
  submittedAt: ISODate;
  fileId: string | null;
  reviewNote: string | null;
}

export type ReportStatus = "drafting" | "in_review" | "approved" | "delivered";

export interface RevisionRequest {
  at: ISODate;
  text: string;
}

export interface ReportDraft {
  summary: string;
  findings: string;
  recommendations: string;
}

export interface Report {
  studyId: string;
  status: ReportStatus;
  /** The analyst's work in progress, before it is submitted as a version. */
  draft: ReportDraft;
  versions: ReportVersion[];
  /** Latest manager note sent back to the analyst (changes / halted delivery). */
  managerNote: string | null;
  halted: boolean;
  deliveredVersion: number | null;
  deliveredAt: ISODate | null;
  receivedAt: ISODate | null;
  revisionRequests: RevisionRequest[];
}

export interface Message {
  id: string;
  studyId: string;
  from: "client" | "manager";
  body: string;
  at: ISODate;
  repliedAt: ISODate | null;
  forwardedToTaskId: string | null;
}

export interface Db {
  clients: Client[];
  managers: Manager[];
  researchers: Researcher[];
  studies: Study[];
  tasks: Task[];
  files: DataFile[];
  reports: Report[];
  messages: Message[];
}
