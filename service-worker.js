/**
 * Service Worker — offline support for the Ouarpeggiator PWA.
 *
 * Strategy: network-first with cache fallback. The app is actively developed
 * and deployed without filename hashing, so we always prefer fresh files when
 * online (avoids serving stale code after a deploy) and fall back to the cache
 * only when the network is unavailable — which is what makes it work offline.
 *
 * Bump CACHE_VERSION to force old caches to be discarded on the next activate.
 */

const CACHE_VERSION = 'ouarp-v1';

// App shell — precached on install so the app opens offline.
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg',
    './css/styles.css',
    './js/appState.js',
    './js/chordMatcher.js',
    './js/chordProgression.js',
    './js/chordProgressionSequencer.js',
    './js/clockWorker.js',
    './js/euclidean.js',
    './js/euclideanCircle.js',
    './js/main.js',
    './js/midi.js',
    './js/midiDiagnostics.js',
    './js/midiSetup.js',
    './js/noteSchedulerWorker.js',
    './js/persistence.js',
    './js/pianoRoll.js',
    './js/sequencerCore.js',
    './js/transport.js',
    './js/ui.js',
    './js/modules/audio.js',
    './js/modules/musicTheory.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;

    // Only handle same-origin GETs; let everything else (e.g. cross-origin
    // Juno-106 window, POSTs) pass straight through to the network.
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(req)
            .then(res => {
                // Cache a copy of successful responses for offline use.
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
});
