import { MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import { getTelegramContactUrl } from "@/lib/telegram";

const TELEGRAM_CONTACT_URL = getTelegramContactUrl();

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrlParam = params?.callbackUrl;
  const callbackUrl = typeof callbackUrlParam === "string" && callbackUrlParam.startsWith("/") ? callbackUrlParam : "/";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-md ring-1 ring-success/30">
          <Image src="/logo-mark.png" alt="MDA Crypto" fill sizes="56px" className="object-cover" priority />
        </span>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold text-foreground">تسجيل الدخول</h1>
          <p className="text-sm text-muted">Crypto-mon — أداة التحليل الفني</p>
        </div>

        <LoginForm callbackUrl={callbackUrl} />

        <p className="text-center text-xs text-muted">
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="font-medium text-success hover:underline">
            جرّبه مجانًا لمدة يومين
          </Link>
        </p>

        <div className="flex w-full flex-col gap-2">
          <a
            href={TELEGRAM_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-success/90"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
            تواصل عبر تلغرام للاشتراك
          </a>
          <Link
            href="/pricing"
            className="flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-foreground ring-1 ring-surface-border transition-colors duration-150 hover:bg-surface"
          >
            عرض الأسعار
          </Link>
        </div>

        <p className="text-center text-xs text-muted">
          <Link href="/track-record" className="hover:text-success hover:underline">
            سجل الأداء
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-success hover:underline">
            سياسة الخصوصية
          </Link>
        </p>
      </div>
    </div>
  );
}
