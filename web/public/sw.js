/*
 * Service worker de l'app installée : elle s'ouvre et fonctionne sans réseau (en salle, sous terre…).
 * - la page (index.html) : réseau d'abord, pour recevoir les mises à jour ; copie locale hors ligne ;
 * - le reste (scripts et styles nommés par leur contenu, moteur d'échecs, icônes) : copie locale d'abord.
 * Les données (murs, joueurs, cotes) ne passent pas par ici : elles sont dans le stockage du navigateur.
 * À chaque nouvelle page reçue, les scripts et styles des anciennes versions sont retirés de la copie locale.
 */
const CACHE = "brlok-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Recherche de mise à jour (?maj=…) : toujours le réseau, rien n'est gardé.
  if (url.searchParams.has("maj")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            const html = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
            html.text().then(pruneAssets);
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

/** Retire de la copie locale les fichiers `assets/` que la page actuelle n'utilise plus (anciennes versions). */
async function pruneAssets(html) {
  const used = new Set([...html.matchAll(/assets\/[\w.-]+/g)].map((m) => m[0]));
  if (used.size === 0) return;
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    const i = path.indexOf("/assets/");
    if (i >= 0 && !used.has(path.slice(i + 1))) await cache.delete(request);
  }
}
