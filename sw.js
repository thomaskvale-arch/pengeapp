// Service worker: lagrer appens filer slik at den åpner også uten nett.
// Henter alltid nyeste versjon når det er nett, og bruker lagret kopi ellers.

const CACHE = "pengeoversikt-v1";
const FILER = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILER)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((navn) =>
      Promise.all(navn.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((svar) => {
        const kopi = svar.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopi));
        return svar;
      })
      .catch(() => caches.match(e.request))
  );
});
