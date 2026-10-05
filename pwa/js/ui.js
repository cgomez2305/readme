// Small helpers for building markup and wiring events.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const pill = (text, kind = '') => `<span class="pill ${kind}">${esc(text)}</span>`;

export const metric = (label, value, pillText, kind = '') => `
  <div class="glass metric">
    <div class="label">${esc(label)}</div>
    <div class="big">${esc(value)}</div>
    ${pillText ? pill(pillText, kind) : ''}
  </div>`;

export const eyebrow = (t) => `<div class="eyebrow">${esc(t)}</div>`;

/** Segmented control. Buttons carry data-seg=<name> and data-v=<value>. */
export const seg = (name, options, value) => `
  <div class="glass tight seg" data-seg-group="${esc(name)}">
    ${options.map(([v, label]) => `<button type="button" data-seg="${esc(name)}" data-v="${esc(v)}" class="${String(v) === String(value) ? 'on' : ''}">${esc(label)}</button>`).join('')}
  </div>`;

export const chips = (name, options, value) => `
  <div class="chips">
    ${options.map(([v, label]) => `<button type="button" class="chip ${String(v) === String(value) ? 'on' : ''}" data-chip="${esc(name)}" data-v="${esc(v)}">${esc(label)}</button>`).join('')}
  </div>`;

/** Delegated click handling: handlers = { selector: (el, event) => void }. */
export function on(root, handlers) {
  const fn = (e) => {
    for (const [sel, h] of Object.entries(handlers)) {
      const el = e.target.closest(sel);
      if (el && root.contains(el)) {
        h(el, e);
        return;
      }
    }
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}

let toastTimer;
export function toast(text, ms = 3500) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

export const icons = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  analyze: '<circle cx="12" cy="12" r="8"/><path d="M12 12l5-5"/><circle cx="12" cy="12" r="1.5"/>',
  progress: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
  team: '<circle cx="9" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.4"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 15c2.4-.2 4.6.8 5.5 3.5"/>',
  plan: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  train: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M7 11v4.5c0 1.4 2.2 2.8 5 2.8s5-1.4 5-2.8V11"/><path d="M21 8.5V14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
