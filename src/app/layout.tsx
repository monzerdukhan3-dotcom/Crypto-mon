import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import AuthProvider from "@/components/AuthProvider";
import BackgroundDecor from "@/components/BackgroundDecor";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Crypto-mon",
  description: "أداة تحليل فني للعملات الرقمية",
  // iOS has no notion of the web manifest (manifest.ts) — "Add to Home
  // Screen" there reads these tags instead: capable removes Safari's
  // browser chrome once launched from the home screen, statusBarStyle
  // keeps the status bar dark to match the app's own default theme, and
  // apple-icon.png (the file-convention icon Next already serves) becomes
  // the home-screen icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Crypto-mon",
  },
};

export const viewport: Viewport = {
  // Matches --background's dark value in globals.css — colors the
  // browser's own UI (status bar, address bar) to match the app instead
  // of defaulting to white, on every platform that reads this (Android
  // Chrome, and Safari once manifest.ts's own background_color doesn't
  // apply, i.e. before it's installed).
  themeColor: "#0b0f1a",
};

// Runs before hydration so the page paints in the right theme immediately —
// a stored choice from the header toggle, or dark (the app's default)
// otherwise — instead of flashing one theme and then switching once React
// takes over. Keep the localStorage key in sync with ThemeToggle.tsx.
const THEME_INIT_SCRIPT = `
try {
  var stored = localStorage.getItem('crypto-mon:theme');
  document.documentElement.setAttribute('data-theme', stored === 'light' ? 'light' : 'dark');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" className={`${tajawal.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="relative flex min-h-full flex-col overflow-x-hidden bg-background text-foreground">
        <AuthProvider>
          <ServiceWorkerRegister />
          <BackgroundDecor />
          <Header />
          {children}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
