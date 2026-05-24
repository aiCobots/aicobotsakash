// ⚡ aiAkash Vault — Service Worker v4  (Offline-First)
const CACHE = 'aiakash-vault-v4';
const BASE  = self.location.pathname.replace('/sw.js', '');

// ── Static files: install par cache ho jaaye ──
const STATIC = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/sw.js',
  BASE + '/icon.png',
];

// ── CDN fonts: best-effort cache ──
const CDN = [
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap',
];

/* ════════════════════════════════════════════
   INSTALL — sab kuch pre-cache karo
════════════════════════════════════════════ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      // Static files — ek ek karke try karo
      for (const url of STATIC) {
        try { await cache.add(url); } catch(_) {}
      }
      // CDN fonts — best effort
      for (const url of CDN) {
        try {
          const r = await fetch(url, { mode: 'cors' });
          if (r.ok) await cache.put(url, r);
        } catch(_) {}
      }
    })
  );
  self.skipWaiting(); // turant activate
});

/* ════════════════════════════════════════════
   ACTIVATE — purane saare cache delete karo
════════════════════════════════════════════ */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ════════════════════════════════════════════
   FETCH — 3 alag strategies
════════════════════════════════════════════ */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (!url.startsWith('http')) return;

  /* ── Strategy 1: Firebase GET ──────────────────────────
     Network first → response cache karo
     Offline mein: last cached Firebase data serve karo
     (Isliye previously dekhe slots offline bhi kholenge)
  ─────────────────────────────────────────────────────── */
  if (url.includes('firebaseio.com')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r && r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then(c => { try { c.put(e.request, clone); } catch(_) {} });
          }
          return r;
        })
        .catch(() => caches.match(e.request)) // offline: cached Firebase data
    );
    return;
  }

  /* ── Strategy 2: Navigation (HTML pages) ──────────────
     Cache first (instant load) + background mein update
     Offline: cached index.html se kaam chalega
  ─────────────────────────────────────────────────────── */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(BASE + '/index.html').then(cached => {
        // Background mein fresh version fetch + cache update
        const networkUpdate = fetch(e.request)
          .then(r => {
            if (r && r.ok) {
              caches.open(CACHE).then(c => {
                try { c.put(BASE + '/index.html', r.clone()); } catch(_) {}
              });
            }
            return r;
          })
          .catch(() => null);

        // Agar cache mein hai → turant do, background mein update hoga
        // Agar cache mein nahi → network se lo
        return cached || networkUpdate;
      })
    );
    return;
  }

  /* ── Strategy 3: Baaki sab (CSS, fonts, images) ───────
     Cache first → miss hone par network se fetch + cache
  ─────────────────────────────────────────────────────── */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then(c => { try { c.put(e.request, clone); } catch(_) {} });
        }
        return r;
      }).catch(() => {});
    })
  );
});
