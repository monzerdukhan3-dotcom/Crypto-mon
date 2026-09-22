import { NextRequest } from "next/server";
import { reportFor } from "@/lib/studies/queries";
import { readDb, readUpload } from "@/lib/studies/store";
import type { DataFile, Db } from "@/lib/studies/types";

/**
 * Who may download a file, by the link token they hold:
 * - the study's manager: everything in the study;
 * - the researcher who uploaded a data file;
 * - the study's analyst: accepted data once analysis started, and reports;
 * - the client: only the report file of the version delivered to them.
 * Raw data never reaches the client (spec §8 sensitive data).
 */
function canDownload(db: Db, file: DataFile, token: string): boolean {
  const study = db.studies.find((s) => s.id === file.studyId);
  if (!study) return false;

  const manager = db.managers.find((m) => m.token === token);
  if (manager) return manager.id === study.managerId;

  if (study.clientToken === token) {
    const report = reportFor(db, study.id);
    const delivered = report?.versions.find((v) => v.version === report.deliveredVersion);
    return file.kind === "report" && delivered?.fileId === file.id;
  }

  const researcher = db.researchers.find((r) => r.token === token);
  if (!researcher) return false;
  if (file.kind === "data" && file.uploadedBy === researcher.id) return true;
  if (study.analystId !== researcher.id) return false;
  return file.kind === "report" || (file.status === "accepted" && study.analysisStartedAt !== null);
}

export async function GET(request: NextRequest, { params }: RouteContext<"/studies/files/[fileId]">) {
  const { fileId } = await params;
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const db = await readDb();
  const file = db.files.find((f) => f.id === fileId);
  if (!file || !token || !canDownload(db, file, token)) {
    return new Response("Not found", { status: 404 });
  }
  const bytes = await readUpload(file.id);
  return new Response(new Uint8Array(bytes), {
    headers: {
      // Always download, never render: uploads are untrusted content.
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
