self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
    // PWA functionality ke liye basic fetch event zaroori hai
});