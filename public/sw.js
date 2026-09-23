// Deliberately a pass-through, not a cache. Every page here is either live
// market data or behind a login, so caching responses would risk serving a
// stale price, a stale trade plan, or (worse) one signed-in visitor's page
// to another — there is no offline mode worth that trade-off. This file
// exists only because Chrome's install-to-home-screen criteria still look
// for a registered service worker; it does the minimum to satisfy that
// (install + activate immediately, forward every fetch to the network
// unchanged) and nothing else.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
