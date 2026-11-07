// Offline cache for the app shell and the narrator's voice.
// Music streams from the network (range requests) and is cached only as whole files.
const CACHE = 'ctu-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './net.js',
  './vendor/peerjs.min.js',
  './vendor/qrcode.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './voice/narration.json',
  './voice/narration.m4a',
  './music/playlist.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Let the browser stream music tracks directly (it uses range requests).
  if (url.pathname.includes('/music/') && url.pathname.endsWith('.m4a')) return;
  // Network first so updates show up straight away; cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
