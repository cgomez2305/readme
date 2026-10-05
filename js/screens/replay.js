// Slow-motion review: the recorded video with the skeleton on top, the fatigue point and user marks.
import { state, updateSet } from '../state.js';
import { exerciseById } from '../exercises.js';
import { getVideo, getFrames } from '../store.js';
import { drawArm } from '../pose.js';
import { esc, on, icon, seg } from '../ui.js';

const fmt = (ms) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, '0')}`;

export function mount(root, api, { id }) {
  const set = state.sets.find((s) => s.id === id);
  const ex = exerciseById(set?.ex);
  let url = null, frames = [], speed = 0.5, skeleton = true, raf = 0, alive = true, dur = (set?.dur ?? 1000);
  let error = null;
  const mirror = set?.cam === 'user'; // selfie recordings are shown mirrored, like the live view

  root.innerHTML = `<div class="col">
    <div class="row"><button class="icon-btn" id="p-back" aria-label="Volver">${icon('back')}</button><div class="title" style="font-size:18px">${esc(ex.name)}</div></div>
    <div id="p-body"><div class="muted center" style="padding:60px 0">Cargando vídeo...</div></div></div>`;
  const body = root.querySelector('#p-body');
  const offBack = on(root, { '#p-back': () => api.closeOverlay() });

  const fatMs = () => (set?.fat && set.reps[set.fat - 1] ? set.reps[set.fat - 1].s : null);

  async function init() {
    if (!set) { error = 'No se encontró la serie.'; return draw(); }
    const blob = await getVideo(set.id);
    if (!blob) { error = 'No hay vídeo guardado para esta serie.'; return draw(); }
    frames = await getFrames(set.id);
    url = URL.createObjectURL(blob);
    draw();
    const video = body.querySelector('video');
    video.src = url;
    video.playbackRate = speed;
    // MediaRecorder files report an infinite duration; seeking far forces the browser to compute it.
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth && video.videoHeight) {
        const st = body.querySelector('.stage'), cv = body.querySelector('canvas');
        st.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        if (video.videoWidth > video.videoHeight) st.style.maxWidth = '480px';
        cv.width = 360;
        cv.height = Math.round((360 * video.videoHeight) / video.videoWidth);
      }
      if (video.duration === Infinity || Number.isNaN(video.duration)) {
        video.currentTime = 1e101;
        video.addEventListener('timeupdate', function fix() {
          video.removeEventListener('timeupdate', fix);
          video.currentTime = 0;
        });
      }
    });
    video.play().catch(() => {});
    tick();
  }

  function nearest(ms) {
    if (!frames.length) return null;
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t < ms) lo = mid + 1; else hi = mid;
    }
    let best = frames[lo];
    if (lo > 0 && Math.abs(ms - frames[lo - 1].t) < Math.abs(best.t - ms)) best = frames[lo - 1];
    return Math.abs(best.t - ms) <= 250 ? best : null;
  }

  function tick() {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    const video = body.querySelector('video'), cv = body.querySelector('canvas');
    if (!video || !cv) return;
    const d = Number.isFinite(video.duration) ? video.duration * 1000 : dur;
    dur = d || dur;
    const ms = video.currentTime * 1000;
    const ctx = cv.getContext('2d');
    if (skeleton) { const f = nearest(ms); drawArm(ctx, f?.p, ex.joint, f?.a, mirror); } else ctx.clearRect(0, 0, cv.width, cv.height);
    const pct = Math.min(100, (ms / dur) * 100);
    const fill = body.querySelector('.fill'), knob = body.querySelector('.knob'), time = body.querySelector('#p-time');
    if (fill) { fill.style.width = `${pct}%`; knob.style.left = `${pct}%`; time.textContent = `${fmt(ms)} / ${fmt(dur)}`; }
    const pp = body.querySelector('#p-play');
    if (pp) pp.textContent = video.paused ? '▶' : '❚❚';
  }

  function draw() {
    if (error) { body.innerHTML = `<div class="glass muted">${esc(error)}</div>`; return; }
    const fm = fatMs();
    body.innerHTML = `<div class="stack">
      <div class="stage" style="max-width:320px"><video playsinline muted loop class="${mirror ? 'mirror' : ''}"></video><canvas width="360" height="640"></canvas></div>
      <div class="timeline" id="p-line"><div class="track"></div><div class="fill"></div>
        ${set.reps.map((r) => `<span class="tick" style="left:${(r.s / dur) * 100}%"></span>`).join('')}
        ${fm != null ? `<span class="mark" style="left:${(fm / dur) * 100}%;background:var(--warn)"></span>` : ''}
        ${set.marks.map((m) => `<span class="mark" style="left:${(m / dur) * 100}%;background:var(--teal)"></span>`).join('')}
        <div class="knob"></div></div>
      <div class="muted tiny center" id="p-time"></div>
      <div class="row"><button class="icon-btn" id="p-back5" aria-label="Atrás medio segundo">⟲</button>
        <button class="icon-btn" id="p-play" style="background:var(--grad);color:#1a0d05;width:56px" aria-label="Reproducir o pausar">❚❚</button>
        <button class="icon-btn" id="p-fwd5" aria-label="Adelante medio segundo">⟳</button><span class="grow"></span>
        <label class="row small muted" style="gap:8px">Esqueleto <input type="checkbox" class="switch" id="p-skel" ${skeleton ? 'checked' : ''}></label></div>
      ${seg('speed', [[0.25, '0.25x'], [0.5, '0.5x'], [1, '1x']], speed)}
      <button class="btn" id="p-mark">Marcar este momento</button>
      ${fm != null ? `<div class="glass moment" data-seek="${fm}"><span class="bar" style="background:var(--warn)"></span><span class="grow bold">Fatiga · repetición ${set.fat}</span><span class="muted small">${fmt(fm)}</span></div>` : ''}
      ${set.marks.map((m, i) => `<div class="glass moment" data-seek="${m}"><span class="bar" style="background:var(--teal)"></span><span class="grow bold">Marca ${i + 1}</span><span class="muted small">${fmt(m)}</span><button class="icon-btn" data-delmark="${i}" style="width:32px;height:32px" aria-label="Quitar marca">✕</button></div>`).join('')}
      <p class="muted tiny">El esqueleto sale de los datos guardados al grabar. Si no coincide con el vídeo, apágalo con el interruptor.</p></div>`;
    if (url) { const v = body.querySelector('video'); v.src = url; v.playbackRate = speed; v.play().catch(() => {}); }
  }

  const video = () => body.querySelector('video');
  const seekTo = (ms) => { const v = video(); if (v) v.currentTime = Math.max(0, Math.min(ms, dur)) / 1000; };
  const lineSeek = (e) => {
    const r = body.querySelector('#p-line').getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * dur);
  };
  let dragging = false;
  const down = (e) => { if (e.target.closest('#p-line')) { dragging = true; lineSeek(e); } };
  const move = (e) => { if (dragging) lineSeek(e); };
  const up = () => { dragging = false; };
  root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);

  const offClick = on(root, {
    '#p-play': () => { const v = video(); v.paused ? v.play() : v.pause(); },
    '#p-back5': () => seekTo(video().currentTime * 1000 - 500),
    '#p-fwd5': () => seekTo(video().currentTime * 1000 + 500),
    '[data-seg="speed"]': (el) => { speed = Number(el.dataset.v); video().playbackRate = speed; draw(); },
    '#p-mark': async () => {
      const ms = Math.round(video().currentTime * 1000);
      if (set.marks.some((m) => Math.abs(m - ms) < 300)) return;
      set.marks = [...set.marks, ms].sort((a, b) => a - b);
      await updateSet(set);
      const t = video().currentTime; draw(); video().currentTime = t;
    },
    '[data-delmark]': async (el, e) => {
      e.stopPropagation();
      set.marks = set.marks.filter((_, i) => i !== Number(el.dataset.delmark));
      await updateSet(set);
      draw();
    },
    '[data-seek]': (el) => seekTo(Number(el.dataset.seek)),
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'p-skel') skeleton = e.target.checked; });

  init();
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    offClick(); offBack();
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (url) URL.revokeObjectURL(url);
  };
}
