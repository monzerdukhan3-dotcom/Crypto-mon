import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "منصة الدراسات",
  description: "طلب ومتابعة وتنفيذ وتسليم الدراسات والأبحاث للشركات",
  // Access is by secret link — keep those links out of search engines and
  // out of the Referer header sent to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function StudiesLayout({ children }: LayoutProps<"/studies">) {
  return (
    <div dir="rtl" lang="ar" className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-surface-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/studies" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info text-white">
              <ClipboardList className="h-4 w-4" />
            </span>
            منصة الدراسات
          </Link>
          <Link href="/studies/request" className="rounded-lg bg-info px-3 py-1.5 text-sm font-semibold text-white">
            اطلب دراسة
          </Link>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t border-surface-border py-5 text-center text-xs text-muted">
        منصة إدارة وتنفيذ الدراسات — النسخة الأولى
      </footer>
    </div>
  );
}
