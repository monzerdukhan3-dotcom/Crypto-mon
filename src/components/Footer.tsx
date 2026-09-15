import Image from "next/image";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-surface-border bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-6 py-6 text-center">
        <div className="flex items-center gap-2 opacity-80">
          <span className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <Image src="/logo-mark.png" alt="MDA Crypto" fill sizes="20px" className="object-cover" />
          </span>
          <span className="text-xs font-semibold tracking-wide text-muted">MDA Crypto</span>
        </div>
        <p className="max-w-xl text-[11px] leading-relaxed text-muted/80">
          المحتوى المعروض لأغراض تعليمية وتحليل فني آلي فقط، ولا يُعد توصية استثمارية أو مالية. قرارات التداول
          مسؤوليتك الكاملة.
        </p>
      </div>
    </footer>
  );
}
