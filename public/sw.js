const CACHE_NAME = 'family-vault-v1';

// 1. Install Event - Service worker ko turant install karna
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installed');
    self.skipWaiting();
});

// 2. Activate Event - Purane caches ko clean karna
self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Activated');
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        })
    );
    return self.clients.claim();
});

// 3. Fetch Event - NETWORK FIRST, FALLBACK TO CACHE
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return; // Sirf GET (images/HTML) cache karenge

    e.respondWith(
        fetch(e.request)
            .then(res => {
                const resClone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
                return res;
            })
            .catch(() => caches.match(e.request)) // Agar Net band hai toh Cache se photo do
    );
});