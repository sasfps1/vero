/* O app tem de abrir sem rede -- e um livro de contas, nao um site.
   Estrategia: a rede primeiro, a cache como rede de seguranca. Assim uma
   versao nova chega sem ficar presa numa cache velha, e um aparelho sem sinal
   abre com a ultima que viu. */

const CACHE = 'vero-v74';
const BASE = ['./', './index.html', './estilo.css', './app.js', './sync.js', './rede.js', './manifest.webmanifest', './icone.svg', './icone-192.png', './icone-512.png'];
const BIBLIOTECA = 'https://cdn.jsdelivr.net/npm/@supabase/';

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASE); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== CACHE; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  // ⚠️ O servidor passa ao lado. Sem esta linha, um pedido ao banco sem sinal recebia
  // o index.html como resposta, em vez de falhar e deixar a fila tentar de novo.
  const meu = new URL(ev.request.url).origin === location.origin;
  const biblioteca = ev.request.url.startsWith(BIBLIOTECA);
  if (!meu && !biblioteca) return;
  ev.respondWith(
    fetch(ev.request).then(function (r) {
      if (r && r.ok) {
        const copia = r.clone();
        caches.open(CACHE).then(function (c) { c.put(ev.request, copia); });
      }
      return r;
    }).catch(function () {
      return caches.match(ev.request).then(function (r) {
        return r || caches.match('./index.html');
      });
    })
  );
});

/* ── Avisos no celular (v73). No iOS todo 'push' PRECISA mostrar uma notificação, senão o iOS
   revoga a inscrição. Por isso o showNotification fica sempre dentro do waitUntil. ── */
self.addEventListener('push', function (ev) {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { titulo: 'Vero', corpo: ev.data ? ev.data.text() : '' }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'Vero', {
    body: d.corpo || '',
    icon: './icone-192.png',
    badge: './icone-192.png',
    tag: d.tag || 'vero',
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', function (ev) {
  ev.notification.close();
  const alvo = new URL((ev.notification.data && ev.notification.data.url) || './', self.registration.scope);
  const dia = alvo.searchParams.get('dia');
  const acao = alvo.searchParams.get('acao');
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    // App já aberto: manda o dia ou a ação por mensagem (app-push: 'message').
    for (const c of lista) {
      if ('focus' in c) { if (dia || acao) c.postMessage({ tipo: 'abrir-dia', dia: dia, acao: acao }); return c.focus(); }
    }
    // App fechado: abre com ?dia= ou ?acao=, que o app lê ao iniciar.
    return self.clients.openWindow(alvo.href);
  }));
});
