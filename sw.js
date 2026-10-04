const CACHE = "correr-v6";
const FILES = [
  "./", "./index.html", "./style.css", "./game.js", "./manifest.json",
  "./images/hero1.png", "./images/hero2.png", "./images/enemy1.png", "./images/enemy2.png", "./images/victoria.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match("./index.html"))));
});
