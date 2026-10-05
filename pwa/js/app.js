// Shell: bottom tabs, overlay layer (report / replay), install prompt and service worker.
import { subscribe, onSetSaved, onSetsDeleted } from './state.js';
import * as cloud from './cloud.js';
import { icon, on } from './ui.js';
import * as home from './screens/home.js';
import * as analyze from './screens/analyze.js';
import * as progress from './screens/progress.js';
import * as team from './screens/team.js';
import * as plan from './screens/plan.js';
import * as report from './screens/report.js';
import * as replay from './screens/replay.js';

const TABS = [
  ['inicio', 'Inicio', 'home', home],
  ['analizar', 'Analizar', 'analyze', analyze],
  ['progreso', 'Progreso', 'progress', progress],
  ['equipo', 'Equipo', 'team', team],
  ['plan', 'Plan', 'plan', plan],
];

const view = document.getElementById('view');
const overlay = document.getElementById('overlay');
const tabsEl = document.getElementById('tabs');

let current = null;
let cleanup = null;
let overlayCleanup = null;
const overlayListeners = new Set();

const api = {
  go(tab) {
    if (!TABS.some((t) => t[0] === tab)) tab = 'inicio';
    if (location.hash !== `#/${tab}`) history.replaceState(null, '', `#/${tab}`);
    show(tab);
  },
  openReport(opts) { openOverlay(report, opts); },
  openReplay(id) { openOverlay(replay, { id }); },
  closeOverlay() { if (!overlay.hidden) history.back(); },
  onOverlay(fn) {
    overlayListeners.add(fn);
    return () => overlayListeners.delete(fn);
  },
};

function renderTabs() {
  tabsEl.innerHTML = TABS.map(([id, label, ic]) =>
    `<button class="tab ${id === current ? 'on' : ''}" data-tab="${id}" ${id === current ? 'aria-current="page"' : ''}>${icon(ic)}${label}</button>`).join('');
}

function show(tab) {
  if (tab === current) return;
  cleanup?.();
  current = tab;
  view.scrollTop = 0;
  view.innerHTML = '';
  cleanup = TABS.find((t) => t[0] === tab)[3].mount(view, api);
  renderTabs();
}

function openOverlay(screen, opts) {
  overlayCleanup?.();
  overlay.hidden = false;
  overlay.scrollTop = 0;
  overlay.innerHTML = '';
  overlayCleanup = screen.mount(overlay, api, opts);
  history.pushState({ overlay: true }, '');
  overlayListeners.forEach((f) => f(true));
}
function closeOverlayNow() {
  if (overlay.hidden) return;
  overlayCleanup?.();
  overlayCleanup = null;
  overlay.hidden = true;
  overlay.innerHTML = '';
  overlayListeners.forEach((f) => f(false));
}
window.addEventListener('popstate', () => {
  if (!overlay.hidden) closeOverlayNow();
  else api.go(location.hash.replace('#/', '') || 'inicio');
});

on(tabsEl, { '[data-tab]': (el) => { if (!overlay.hidden) closeOverlayNow(); api.go(el.dataset.tab); } });

// MediaPipe tries to send anonymous usage statistics to Google. Nothing should leave the phone,
// so that request is answered locally (the Content-Security-Policy in index.html blocks it as well).
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  return url.includes('odml.pa.googleapis.com') ? Promise.resolve(new Response(null, { status: 204 })) : realFetch(input, init);
};

// ---- install prompt ---------------------------------------------------------------------------
const installEl = document.getElementById('install');
let deferredPrompt = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const dismissed = () => { try { return localStorage.getItem('fulcro.installDismissed') === '1'; } catch { return false; } };
function showInstall(html, withButton) {
  if (standalone || dismissed()) return;
  installEl.hidden = false;
  installEl.innerHTML = `<div class="glass row" style="padding:10px 14px"><div class="grow small">${html}</div>
    ${withButton ? '<button class="btn small" id="i-yes">Instalar</button>' : ''}<button class="icon-btn" id="i-no" style="width:36px;height:36px" aria-label="Cerrar">✕</button></div>`;
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstall('Instala Fulcro en tu pantalla de inicio.', true);
});
window.addEventListener('appinstalled', () => { installEl.hidden = true; });
on(installEl, {
  '#i-yes': async () => { installEl.hidden = true; deferredPrompt?.prompt(); deferredPrompt = null; },
  '#i-no': () => { installEl.hidden = true; try { localStorage.setItem('fulcro.installDismissed', '1'); } catch { /* ignore */ } },
});
if (/iphone|ipad/i.test(navigator.userAgent) && !standalone) {
  showInstall('Para instalar: toca Compartir y luego «Añadir a pantalla de inicio».', false);
}

// ---- start ------------------------------------------------------------------------------------
onSetSaved((set) => cloud.pushSet(set));
onSetsDeleted((ids) => cloud.deleteSets(ids));
cloud.init();
api.go(location.hash.replace('#/', '') || 'inicio');
renderTabs();

// Warm the cache with the arm model so the Analizar tab also works without a connection (gym with no wifi).
function warmModelCache() {
  if (navigator.connection?.saveData) return;
  const urls = ['vendor/vision_bundle.mjs', 'vendor/wasm/vision_wasm_internal.js', 'vendor/wasm/vision_wasm_internal.wasm', 'vendor/models/pose_landmarker_lite.task'];
  urls.forEach((u) => fetch(u).catch(() => {}));
}
window.addEventListener('load', () => setTimeout(warmModelCache, 4000));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo sin conexión:', e));
  });
}
window.__fulcro = { api, subscribe }; // handy for tests
