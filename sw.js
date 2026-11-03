/* O app tem de abrir sem rede -- e um livro de contas, nao um site.
   Estrategia: a rede primeiro, a cache como rede de seguranca. Assim uma
   versao nova chega sem ficar presa numa cache velha, e um aparelho sem sinal
   abre com a ultima que viu. */

const CACHE = 'vero-v11';
const BASE = ['./', './index.html', './estilo.css', './app.js', './sync.js', './manifest.webmanifest', './icone.svg', './icone-192.png', './icone-512.png'];
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
