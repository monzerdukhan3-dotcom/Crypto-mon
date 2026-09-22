import { notFound } from "next/navigation";
import type { Db, Researcher, Study, Task } from "./types";

/**
 * Link-based access (spec §2): every lookup starts from the caller's token and
 * only returns records that token is entitled to. An unknown token, or a
 * record outside its reach, is indistinguishable from a missing page.
 */

export function clientStudy(db: Db, token: string) {
  const study = db.studies.find((s) => s.clientToken === token);
  if (!study) notFound();
  const client = db.clients.find((c) => c.id === study.clientId)!;
  return { study, client };
}

export function managerByToken(db: Db, token: string) {
  const manager = db.managers.find((m) => m.token === token);
  if (!manager) notFound();
  return manager;
}

export function managerStudy(db: Db, token: string, studyId: string) {
  const manager = managerByToken(db, token);
  const study = db.studies.find((s) => s.id === studyId && s.managerId === manager.id);
  if (!study) notFound();
  return { manager, study };
}

export function researcherByToken(db: Db, token: string): Researcher {
  const researcher = db.researchers.find((r) => r.token === token);
  if (!researcher) notFound();
  return researcher;
}

export function researcherTask(db: Db, token: string, taskId: string): { researcher: Researcher; task: Task; study: Study } {
  const researcher = researcherByToken(db, token);
  const task = db.tasks.find((t) => t.id === taskId && t.researcherId === researcher.id);
  if (!task) notFound();
  const study = db.studies.find((s) => s.id === task.studyId)!;
  return { researcher, task, study };
}

export function analystStudy(db: Db, token: string, studyId: string) {
  const researcher = researcherByToken(db, token);
  const study = db.studies.find((s) => s.id === studyId && s.analystId === researcher.id);
  if (!study) notFound();
  return { researcher, study };
}

/** A user-facing validation failure, shown as a flash message. */
export class ActionError extends Error {}
