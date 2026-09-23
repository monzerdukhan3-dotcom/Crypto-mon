import type { MetadataRoute } from "next";

// Makes the site installable as a PWA (Android's "Install app" prompt, and
// iOS/desktop "Add to Home Screen") — a home-screen icon that opens
// full-screen with no browser chrome, no app-store review or native
// rebuild required. See layout.tsx's `appleWebApp` metadata for the iOS
// side of this, and public/sw.js for the (deliberately no-op) service
// worker Chrome's install criteria also want registered.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crypto-mon — تحليل فني للعملات الرقمية",
    short_name: "Crypto-mon",
    description: "أداة تحليل فني آلي للعملات الرقمية: مناطق عرض وطلب، خطط صفقات، ومسح آلي للفرص.",
    start_url: "/",
    display: "standalone",
    // Matches --background's dark value in globals.css — the app is dark
    // by default, so the splash screen and any un-painted browser chrome
    // area should match instead of flashing white.
    background_color: "#0b0f1a",
    theme_color: "#0b0f1a",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
