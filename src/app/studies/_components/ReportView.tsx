import { FileDown } from "lucide-react";
import type { ReportVersion } from "@/lib/studies/types";

export default function ReportView({ version, fileHref }: { version: ReportVersion; fileHref: string | null }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <section>
        <h3 className="mb-1 font-bold">النتائج الأساسية</h3>
        <p className="whitespace-pre-wrap leading-7">{version.summary}</p>
      </section>
      <section>
        <h3 className="mb-1 font-bold">الشرح والتحليل</h3>
        <p className="whitespace-pre-wrap leading-7">{version.findings}</p>
      </section>
      {version.recommendations && (
        <section>
          <h3 className="mb-1 font-bold">التوصيات</h3>
          <p className="whitespace-pre-wrap leading-7">{version.recommendations}</p>
        </section>
      )}
      {fileHref && (
        <a href={fileHref} className="inline-flex w-fit items-center gap-2 rounded-lg border border-surface-border px-3 py-2 font-semibold text-info">
          <FileDown className="h-4 w-4" />
          تنزيل ملف التقرير
        </a>
      )}
    </div>
  );
}
