import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
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
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header />
        {children}
      </body>
    </html>
  );
}
