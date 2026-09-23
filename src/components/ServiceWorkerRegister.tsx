"use client";

import { useEffect } from "react";

/**
 * Registers the no-op service worker (public/sw.js) so the site meets
 * Chrome's install-to-home-screen criteria — see that file's own doc
 * comment for why it's deliberately a pass-through and not a cache.
 * Renders nothing; silently does nothing on a browser without
 * serviceWorker support (Safari on older iOS, some embedded webviews)
 * rather than erroring, since PWA installability is a nicety here, not a
 * requirement for the site to work.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail in a private window or under some content
      // blockers — the site works the same either way, just not
      // installable there.
    });
  }, []);

  return null;
}
