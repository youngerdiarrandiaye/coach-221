/* Service worker CoachSen.
   Objectif : l'application s'ouvre même sans réseau (coque de l'app), mais aucune donnée personnelle n'est jamais mise en cache.
   - /api/ et /auth/ : toujours le réseau, jamais le cache (données des clients, session).
   - Pages et fichiers de l'app : le réseau d'abord, le cache seulement en secours hors ligne. */
/* BUILD est remplacé à la construction de l'image (deploy/web.Dockerfile) par l'identifiant du commit déployé :
   le fichier change à chaque déploiement, donc le navigateur installe la nouvelle version et purge l'ancien cache. */
const BUILD = '__BUILD__';
const CACHE = 'coachsen-shell-' + BUILD;
const PRECACHE = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const offlineResponse = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne</title>' +
  '<body style="font-family:system-ui;background:#0a0a0a;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">' +
  '<div><h1>Hors ligne</h1><p>Reconnectez-vous à internet pour ouvrir CoachSen.</p></div></body>',
  { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
);

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('/index.html', copy)); }
          return response;
        })
        .catch(() => caches.match('/index.html').then(cached => cached || offlineResponse()))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || Response.error()))
  );
});

/* Un clic sur une notification de rappel ouvre (ou ramène au premier plan) l'application sur la bonne page. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') { event.waitUntil(syncAppBadge()); return; }
  const target = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    syncAppBadge().then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true })).then(windows => {
      for (const client of windows) {
        if ('focus' in client) {
          return (client.navigate ? client.navigate(target) : Promise.resolve()).catch(() => undefined).then(() => client.focus());
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/* Notification push envoyée par le serveur (application fermée).
   Présentation façon messagerie : le titre est le nom du client, le corps un aperçu court. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  if (data.kind === 'update') { event.waitUntil(announceUpdate(data)); return; }
  const title = data.title || 'CoachSen';
  const options = {
    body: data.body || '',
    tag: data.tag || 'coachsen',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    renotify: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { url: data.url || '/dashboard' },
    actions: data.kind === 'test' ? [] : [{ action: 'open', title: 'Ouvrir' }, { action: 'dismiss', title: 'Ignorer' }],
  };
  event.waitUntil(self.registration.showNotification(title, options).then(syncAppBadge));
});

/* Annonce d'une nouvelle version (webhook de déploiement). Le worker se met à jour tout de suite.
   Application ouverte : le message arrive à la page, qui propose « Actualiser » (pas de notification en plus).
   Application fermée : une notification discrète, remplacée à chaque version (même tag), invite à rouvrir l'application. */
function announceUpdate(data) {
  return self.registration.update().catch(() => undefined)
    .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .then(windows => {
      const visible = windows.filter(w => w.visibilityState === 'visible');
      if (visible.length) { visible.forEach(w => w.postMessage({ type: 'update-available', version: data.version || '' })); return undefined; }
      return self.registration.showNotification(data.title || 'CoachSen est à jour', {
        body: data.body || '', tag: 'coachsen-update', icon: '/icon-192.png', badge: '/badge-72.png', silent: true,
        data: { url: data.url || '/dashboard' },
      });
    });
}

/* Pastille sur l'icône de l'application installée : nombre de notifications non lues
   (ignorée sans effet là où le navigateur ne gère pas le badge). */
function syncAppBadge() {
  return self.registration.getNotifications().then(list => {
    const nav = self.navigator;
    if (!nav) return undefined;
    if (list.length > 0 && nav.setAppBadge) return nav.setAppBadge(list.length);
    if (list.length === 0 && nav.clearAppBadge) return nav.clearAppBadge();
    return undefined;
  }).catch(() => undefined);
}

self.addEventListener('notificationclose', event => { event.waitUntil(syncAppBadge()); });
