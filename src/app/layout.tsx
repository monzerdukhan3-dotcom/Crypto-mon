import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Crypto-mon",
  description: "أداة تحليل فني للعملات الرقمية",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${tajawal.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col overflow-x-hidden bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[440px] w-[780px] -translate-x-1/2 rounded-full bg-info/10 blur-3xl" />
          <div className="absolute top-72 -right-48 h-[360px] w-[360px] rounded-full bg-success/10 blur-3xl" />
          <div className="absolute -left-40 bottom-0 h-[320px] w-[320px] rounded-full bg-info/[0.06] blur-3xl" />
        </div>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
