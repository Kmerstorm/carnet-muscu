const VERSION = 'palier-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // App page: network first (to get updates), cache if offline or slow network
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const net = await Promise.race([fetch(req), new Promise((_, j) => setTimeout(j, 3000))]);
        cache.put('./index.html', net.clone());
        return net;
      } catch {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Fonts & static files: cache first, then network (and store)
  if (url.origin === location.origin || url.host.endsWith('gstatic.com') || url.host.endsWith('googleapis.com')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit)));
  }
});

/* Rest-timer notifications: the page tells us when the rest ends; we wait, then notify
   (only if the app isn't on screen — when it is, the page beeps and vibrates itself). */
let restToken = 0;
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'rest-cancel') { restToken++; return; }
  if (d.type !== 'rest-start') return;
  const my = ++restToken;
  const ms = Math.max(0, Math.min(d.end - Date.now(), 10 * 60 * 1000));
  e.waitUntil(new Promise(r => setTimeout(r, ms)).then(async () => {
    if (my !== restToken) return;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification('Repos terminé 💪', {
      body: d.body || 'Série suivante', tag: 'rest', renotify: true, requireInteraction: false,
      vibrate: [350, 120, 350, 120, 350], icon: 'icon-192.png', badge: 'icon-192.png'
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(ws => ws.length ? ws[0].focus() : self.clients.openWindow('./')));
});
