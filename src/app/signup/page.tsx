import Image from "next/image";
import Link from "next/link";
import SignupForm from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-md ring-1 ring-success/30">
          <Image src="/logo-mark.png" alt="MDA Crypto" fill sizes="56px" className="object-cover" priority />
        </span>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold text-foreground">إنشاء حساب</h1>
          <p className="text-sm text-muted">تجربة مجانية لمدة يومين — بدون بطاقة دفع</p>
        </div>

        <SignupForm />

        <p className="text-center text-xs text-muted">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-medium text-success hover:underline">
            تسجيل الدخول
          </Link>
        </p>
        <p className="text-center text-xs leading-relaxed text-muted">
          بإنشاء حساب أنت توافق على{" "}
          <Link href="/terms" className="text-success hover:underline">
            شروط الاستخدام
          </Link>{" "}
          و
          <Link href="/privacy" className="text-success hover:underline">
            سياسة الخصوصية
          </Link>
        </p>
      </div>
    </div>
  );
}
