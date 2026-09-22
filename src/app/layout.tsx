import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
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

// Runs before hydration so the page paints in the right theme immediately —
// a stored choice from the header toggle, or the system preference
// otherwise — instead of flashing light and then switching to dark (or vice
// versa) once React takes over. Keep the localStorage key in sync with
// ThemeToggle.tsx.
const THEME_INIT_SCRIPT = `
try {
  var stored = localStorage.getItem('crypto-mon:theme');
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${tajawal.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="relative flex min-h-full flex-col overflow-x-hidden bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
