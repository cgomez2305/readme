// Live camera + on-device arm tracking for the chosen exercise and arm.
// While idle it only checks light and framing; while recording it also builds repetitions,
// stores pose frames and records the video.
import {
  state, subscribe, currentExercise, pickExercise, pickArm, setKg, setRestSeconds, setsToday, startRest, addRest, cancelRest,
} from '../state.js';
import { exercises, jointLabel, armLabel } from '../exercises.js';
import { RepTracker, detectFatigue } from '../analysis.js';
import { loadLandmarker, readArm, drawArm } from '../pose.js';
import { esc, eyebrow, pill, metric, seg, on, toast } from '../ui.js';

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const pickMime = () => (typeof MediaRecorder === 'undefined' ? null : MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null);

export function mount(root, api) {
  root.innerHTML = `<div class="col">
    <div id="a-head"></div>
    <div id="a-setup" class="stack"></div>
    <div id="a-rest"></div>
    <div class="stage" id="stage">
      <video id="vid" playsinline muted autoplay></video>
      <canvas id="cv"></canvas>
      <span class="badge" id="badge"></span>
      <div class="msg" id="msg">Abriendo la cámara...</div>
    </div>
    <div class="wrap" id="a-status"></div>
    <div class="grid3" id="a-live"></div>
    <div class="glass" id="a-tip"></div>
    <div class="sticky-cta"><button class="btn" id="a-rec" disabled>Cargando...</button></div>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const video = $('#vid'), canvas = $('#cv'), ctx = canvas.getContext('2d'), stage = $('#stage');
  const luma = document.createElement('canvas');
  luma.width = luma.height = 16;
  const lctx = luma.getContext('2d', { willReadFrequently: true });

  let stream = null, landmarker = null, modelError = null, camError = null;
  let alive = true, paused = false, rafId = 0, lastTime = -1, frameCount = 0, lastUi = 0, wakeLock = null;
  let recording = false, tracker = null, frames = [], recorder = null, chunks = [], t0 = 0, startedAt = new Date();
  let reading = null, brightness = 128, lastRepMs = 0;

  // ---- static parts ---------------------------------------------------------------------------
  function renderHead() {
    const ex = currentExercise();
    $('#a-head').innerHTML = `${eyebrow(`Serie ${setsToday(ex.id) + 1} de ${ex.defaultSets} · hoy`)}
      <button class="title" id="a-pick" style="background:none;border:0;color:inherit;padding:2px 0;text-align:left;cursor:pointer" ${recording ? 'disabled' : ''}>${esc(ex.name)} ${recording ? '' : '▾'}</button>
      <div class="muted small">Mide: ${jointLabel(ex).toLowerCase()} · ${esc(ex.focus)}</div>`;
    $('#a-tip').innerHTML = `<div class="muted small">${esc(ex.camera)}</div>${ex.precision !== 'Alta' ? `<div class="tiny" style="color:var(--amber);margin-top:6px">Precisión: ${esc(ex.precision)}</div>` : ''}`;
  }
  function renderSetup() {
    const el = $('#a-setup');
    if (recording) { el.innerHTML = ''; return; }
    el.innerHTML = `${seg('arm', [['right', 'Brazo derecho'], ['left', 'Brazo izquierdo']], state.arm)}
      <div class="glass tight row" style="padding:4px 8px"><div class="grow muted small" style="padding-left:8px">Peso o resistencia</div>
        <button class="icon-btn" data-kg="-2.5" aria-label="Menos peso">−</button>
        <div style="width:64px;text-align:center;font-weight:800">${state.kg} kg</div>
        <button class="icon-btn" data-kg="2.5" aria-label="Más peso">+</button></div>
      <div class="row"><span class="muted small">Descanso</span><div class="grow">${seg('rest', [[60, '1 min'], [90, '1:30'], [120, '2 min'], [180, '3 min']], state.restSeconds)}</div></div>`;
  }
  function renderRest() {
    const left = state.restLeft;
    $('#a-rest').innerHTML = left == null ? '' : `<div class="glass accent center">
      ${eyebrow('Descanso')}<div class="big" style="font-size:40px;margin:4px 0 10px">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>
      <div class="grid2"><button class="btn ghost" data-rest="30">+30 s</button><button class="btn" data-rest="skip">Saltar</button></div></div>`;
  }
  function renderLive() {
    const ex = currentExercise();
    const tracked = reading ? (ex.joint === 'elbow' ? reading.elbowAngle : reading.wristAngle) : null;
    $('#a-live').innerHTML = metric(jointLabel(ex), tracked == null ? '--' : `${Math.round(tracked)}°`)
      + metric('Repeticiones', String(tracker?.reps.length ?? 0))
      + metric('Última rep', lastRepMs ? `${(lastRepMs / 1000).toFixed(1)}s` : '--');
    const lightOk = brightness >= 55, armOk = Boolean(reading?.inFrame);
    $('#a-status').innerHTML = pill(lightOk ? 'Luz buena' : 'Luz baja', lightOk ? 'good' : 'warn')
      + pill(!reading ? 'Buscando brazo' : armOk ? 'Brazo visible' : 'Brazo fuera de cuadro', armOk ? 'good' : 'warn')
      + (lightOk && armOk && !recording ? pill('Listo para grabar', 'good') : '');
  }
  function renderChrome() {
    renderHead(); renderSetup(); renderRest(); renderLive();
    const badge = $('#badge'), msg = $('#msg'), rec = $('#a-rec');
    badge.innerHTML = recording
      ? `<span class="pill bad"><span class="rec-dot"></span>Grabando${recorder ? '' : ' (sin vídeo)'}</span>`
      : (stream ? pill(landmarker ? 'Vista previa' : 'Cargando modelo...') : '');
    const text = camError ?? modelError;
    msg.hidden = !text && Boolean(stream);
    if (!stream && !camError) msg.textContent = 'Abriendo la cámara...';
    if (text) msg.textContent = text;
    rec.textContent = recording ? 'Detener y ver informe' : 'Grabar serie';
    rec.classList.toggle('ghost', recording);
    rec.disabled = !stream || (!landmarker && !recording);
  }

  // ---- camera ---------------------------------------------------------------------------------
  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      camError = 'Este navegador no permite usar la cámara. Abre Fulcro en Chrome o Brave y usa la dirección https.';
      return renderChrome();
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
      const vw = video.videoWidth, vh = video.videoHeight;
      stage.style.aspectRatio = `${vw} / ${vh}`;
      if (vw > vh) stage.style.maxWidth = '480px';
      canvas.width = 360;
      canvas.height = Math.round((360 * vh) / vw);
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
      camError = null;
    } catch (e) {
      camError = e?.name === 'NotAllowedError'
        ? 'Fulcro necesita permiso de cámara. Tócalo en el candado de la barra de direcciones y elige Permitir.'
        : e?.name === 'NotFoundError' ? 'Este dispositivo no tiene cámara.' : `No se pudo abrir la cámara (${e?.name ?? 'error'}).`;
    }
    renderChrome();
    loadModel();
    if (stream) loop();
  }

  async function loadModel() {
    try {
      landmarker = await loadLandmarker();
      modelError = null;
    } catch (e) {
      console.warn(e);
      modelError = 'No se pudo cargar el detector de brazo. Revisa tu conexión y recarga la app.';
    }
    if (alive) renderChrome();
  }

  function loop() {
    if (!alive) return;
    rafId = requestAnimationFrame(loop);
    if (paused || !landmarker || video.readyState < 2 || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    const now = performance.now();
    let result;
    try { result = globalThis.__FAKE_DETECT?.(now) ?? landmarker.detectForVideo(video, now); } catch { return; } // __FAKE_DETECT: test hook
    const ex = currentExercise();
    reading = readArm(result.landmarks?.[0], state.arm, video.videoWidth, video.videoHeight);
    const tracked = reading ? (ex.joint === 'elbow' ? reading.elbowAngle : reading.wristAngle) : null;
    drawArm(ctx, reading?.p, ex.joint, tracked);

    if (recording && reading && tracker) {
      const t = now - t0;
      tracker.add(t, tracked, reading.wristAngle);
      frames.push({ t: Math.round(t), p: reading.p.map((v) => Math.round(v * 1e4) / 1e4), a: Math.round(tracked * 10) / 10 });
      const last = tracker.reps.at(-1);
      if (last) lastRepMs = last.e - last.s;
    }
    if (++frameCount % 10 === 0) {
      lctx.drawImage(video, 0, 0, 16, 16);
      const d = lctx.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      brightness = sum / (d.length / 4);
    }
    if (now - lastUi > 120) { lastUi = now; renderLive(); }
  }

  // ---- recording ------------------------------------------------------------------------------
  function start() {
    const ex = currentExercise();
    tracker = new RepTracker(ex.openAbove, ex.closedBelow);
    frames = []; chunks = []; lastRepMs = 0;
    startedAt = new Date();
    recorder = null;
    const mime = pickMime();
    if (mime && stream) {
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstart = () => { t0 = performance.now(); };
        recorder.start(1000);
      } catch { recorder = null; }
    }
    t0 = performance.now();
    recording = true;
    renderChrome();
  }

  async function stop() {
    recording = false;
    const dur = Math.round(performance.now() - t0);
    let blob = null;
    if (recorder && recorder.state !== 'inactive') {
      blob = await new Promise((resolve) => {
        recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'video/webm' }) : null);
        recorder.stop();
      });
    }
    const reps = tracker ? [...tracker.reps] : [];
    const ex = currentExercise();
    const set = {
      id: String(startedAt.getTime()), ex: ex.id, arm: state.arm, kg: state.kg, at: startedAt.toISOString(),
      dur, reps, marks: [], video: false, note: '', pl: 0,
    };
    const fat = detectFatigue(reps);
    if (fat) set.fat = fat;
    renderChrome();
    api.openReport({ set, isNew: true, frames, blob, onSaved: () => startRest() });
  }

  // ---- sheet to choose the exercise -------------------------------------------------------------
  function openPicker() {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet"><div class="title" style="margin-bottom:12px">Ejercicio</div><div class="stack">
      ${exercises.map((e) => `<button class="glass ${e.id === state.exerciseId ? 'good' : ''}" data-ex="${e.id}" style="text-align:left;cursor:pointer;color:inherit">
        <div class="row"><div class="grow bold" style="font-size:16px">${esc(e.name)}</div>${pill(jointLabel(e))}</div>
        <div class="muted small">${esc(e.focus)}</div>
        <div class="small" style="margin-top:8px">${e.cues.map((c) => `· ${esc(c)}`).join('<br>')}</div>
        <div class="muted tiny" style="margin-top:8px">Objetivo: ${e.minRange}° de rango · ${(e.tempoMinMs / 1000).toFixed(1)} a ${(e.tempoMaxMs / 1000).toFixed(1)} s por rep</div>
        ${e.precision !== 'Alta' ? `<div class="tiny" style="color:var(--amber);margin-top:4px">Precisión: ${esc(e.precision)}</div>` : ''}</button>`).join('')}
    </div></div>`;
    back.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ex]');
      if (b) { pickExercise(b.dataset.ex); back.remove(); } else if (ev.target === back) back.remove();
    });
    document.body.append(back);
  }

  // ---- events ---------------------------------------------------------------------------------
  const offClick = on(root, {
    '#a-pick': openPicker,
    '#a-rec': () => (recording ? stop() : start()),
    '[data-seg="arm"]': (el) => pickArm(el.dataset.v),
    '[data-seg="rest"]': (el) => setRestSeconds(Number(el.dataset.v)),
    '[data-kg]': (el) => setKg(state.kg + Number(el.dataset.kg)),
    '[data-rest]': (el) => (el.dataset.rest === 'skip' ? cancelRest() : addRest(30)),
  });
  const offState = subscribe(() => { if (alive) { renderHead(); renderSetup(); renderRest(); } });
  const offOverlay = api.onOverlay((open) => { paused = open; });
  const onVisible = async () => {
    if (document.visibilityState === 'visible' && stream && !wakeLock) {
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  renderChrome();
  openCamera();

  return () => {
    alive = false;
    cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* ignore */ } }
    stream?.getTracks().forEach((t) => t.stop());
    try { wakeLock?.release(); } catch { /* ignore */ }
    document.removeEventListener('visibilitychange', onVisible);
    offClick(); offState(); offOverlay();
  };
}
