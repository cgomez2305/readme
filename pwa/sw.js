// Offline support. App code is served stale-while-revalidate (an update applies on the next open);
// big static assets (model, wasm, fonts, icons) live in their own cache that survives app updates.
const SHELL_CACHE = 'fulcro-shell-__VERSION__'; // __VERSION__ is replaced with the commit id on deploy
const HEAVY_CACHE = 'fulcro-heavy-v1';
const CORE = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/state.js', 'js/store.js', 'js/ui.js', 'js/charts.js', 'js/analysis.js', 'js/exercises.js', 'js/pose.js', 'js/cloud.js', 'js/plans.js', 'js/score.js', 'js/nn.js', 'js/model.js',
  'js/screens/home.js', 'js/screens/analyze.js', 'js/screens/progress.js', 'js/screens/team.js', 'js/screens/plan.js',
  'js/screens/report.js', 'js/screens/replay.js', 'js/screens/manage.js', 'js/screens/train.js',
];
// Cached up front so the first offline visit looks right; the model and wasm are cached when first used.
const HEAVY_CORE = ['fonts/Figtree.ttf', 'fonts/Unbounded.ttf', 'icons/icon.svg', 'icons/icon-192.png'];
const HEAVY = /\/(vendor|fonts|icons)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((c) => c.addAll(CORE)),
      caches.open(HEAVY_CACHE).then((c) => c.addAll(HEAVY_CORE)),
    ]).then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== HEAVY_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    if (HEAVY.test(req.url)) {
      const cache = await caches.open(HEAVY_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (hit) { network.catch(() => {}); return hit; }
    try { return await network; } catch { return (await cache.match('index.html')) ?? Response.error(); }
  })());
});
