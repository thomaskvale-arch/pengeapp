// Service worker: lagrer appens filer slik at den åpner også uten nett.
// Henter alltid nyeste versjon når det er nett, og bruker lagret kopi ellers.

// Øk tallet (og ?v= i index.html) når det publiseres en ny versjon
const VERSJON = 5;
const CACHE = `pengeoversikt-v${VERSJON}`;
const FILER = [
  "./",
  "index.html",
  `style.css?v=${VERSJON}`,
  `app.js?v=${VERSJON}`,
  `sparing.js?v=${VERSJON}`,
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
    // «no-cache» betyr: spør alltid serveren om det finnes noe nyere,
    // i stedet for å bruke nettleserens gamle kopi
    fetch(e.request, { cache: "no-cache" })
      .then((svar) => {
        const kopi = svar.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopi));
        return svar;
      })
      .catch(() => caches.match(e.request))
  );
});
