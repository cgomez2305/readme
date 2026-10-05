// Live camera + on-device arm tracking for the chosen exercise and arm.
// While idle it only checks light and framing; while recording it also builds repetitions
// (or the hold time), stores pose frames and records the video.
// The selfie camera is the default; the front or back camera, or a specific lens, can be chosen.
import {
  state, subscribe, subscribeRest, currentExercise, pickExercise, pickArm, setKg, setRestSeconds, setsToday, startRest, addRest, cancelRest,
  setCam, setDeviceId, setOneRm, plannedItemFor, hasPlan, todaySession,
} from '../state.js';
import { openDeleteSet, setLine } from './manage.js';
import { prescriptionText, pctText, itemKg } from '../plans.js';
import {
  exercises, exerciseById, jointLabel, isHold, freqText, freqMax, intensityText, recommendedKg, intensityStatus, repDelta,
} from '../exercises.js';
import { RepTracker, Smoother, detectFatigue, stdDev, weeklyDaysFor } from '../analysis.js';
import { loadLandmarker, readArm, drawArm, trackedAngle } from '../pose.js';
import { esc, eyebrow, pill, metric, seg, on, toast } from '../ui.js';

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const pickMime = () => (typeof MediaRecorder === 'undefined' ? null : MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null);
const kgText = (v) => `${Math.round(v * 10) / 10}`;

/** With an active plan only today's planned exercises can be trained. Without a plan, any exercise. */
const planRestricted = () => hasPlan();
const allowedExercises = () => (planRestricted() ? (todaySession()?.items ?? []).map((i) => exerciseById(i.ex)) : exercises);

/** Rest and sparring days: no camera, just what the plan says. */
function mountRestDay(root, api) {
  const s = todaySession();
  const wd = ((new Date().getDay() + 6) % 7) + 1;
  const tomorrow = state.plan.sessions?.[(wd % 7) + 1];
  root.innerHTML = `<div class="col">
    <div>${eyebrow('Analizar')}<div class="title">${s?.kind === 'sparring' ? 'Hoy hay sparring' : 'Hoy toca descansar'}</div></div>
    <div class="glass"><div class="bold">${esc(s?.title ?? 'Descanso')}</div>
      <p class="muted small" style="margin-top:6px">${esc(s?.note ?? 'Tu plan no tiene ejercicios para hoy.')}</p>
      <p class="muted small" style="margin-top:10px">Analizar solo muestra los ejercicios del día según tu plan.${tomorrow?.items.length ? ` Mañana: <b style="color:var(--text)">${esc(tomorrow.title)}</b>.` : ''}</p></div>
    <button class="btn" id="rd-plan">Ver mi plan</button>
    <p class="muted tiny center">Si quieres otro ejercicio hoy, edita el día en Plan.</p></div>`;
  const off = on(root, { '#rd-plan': () => api.go('plan') });
  return () => off();
}

export function mount(root, api) {
  if (planRestricted() && allowedExercises().length === 0) return mountRestDay(root, api);
  if (planRestricted() && !allowedExercises().some((e) => e.id === state.exerciseId)) {
    const items = todaySession().items;
    pickExercise((items.find((i) => setsToday(i.ex) < i.sets) ?? items[0]).ex);
  }
  // The camera comes first so you can see yourself; the settings sit below it.
  root.innerHTML = `<div class="col">
    <div id="a-head"></div>
    <div id="a-warn"></div>
    <div class="stage" id="stage">
      <video id="vid" playsinline muted autoplay></video>
      <canvas id="cv"></canvas>
      <span class="badge" id="badge"></span>
      <button class="icon-btn flip" id="a-flip" aria-label="Cambiar de cámara" title="Cambiar de cámara"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><path d="M9 13.5a3 3 0 0 1 5.2-2M15 13.5a3 3 0 0 1-5.2 2"/><path d="M14.2 10.6V12h-1.4M9.8 16.4V15h1.4"/></svg></button>
      <div class="msg" id="msg">Abriendo la cámara...</div>
    </div>
    <div class="wrap" id="a-status"></div>
    <div id="a-rest"></div>
    <div id="a-last"></div>
    <div class="grid3" id="a-live"></div>
    <div id="a-setup" class="stack"></div>
    <div class="glass" id="a-tip"></div>
    <div class="sticky-cta"><button class="btn" id="a-rec" disabled>Cargando...</button></div>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const video = $('#vid'), canvas = $('#cv'), ctx = canvas.getContext('2d'), stage = $('#stage');
  const luma = document.createElement('canvas');
  luma.width = luma.height = 16;
  const lctx = luma.getContext('2d', { willReadFrequently: true });

  let stream = null, landmarker = null, modelError = null, camError = null, devices = [];
  let alive = true, paused = false, rafId = 0, loopStarted = false, lastTime = -1, frameCount = 0, lastUi = 0, wakeLock = null;
  let opening = 0; // guards against overlapping camera switches
  let mirrored = state.cam === 'user';
  let recording = false, tracker = null, frames = [], recorder = null, chunks = [], t0 = 0, startedAt = new Date();
  let reading = null, brightness = 128, lastRepMs = 0, elapsedMs = 0;
  // Detection quality while recording, so a failed set can be explained.
  const smoother = new Smoother(0.5);
  let recFrames = 0, recSeen = 0, obsMin = Infinity, obsMax = -Infinity, lostSince = 0, otherSeen = 0;

  const ex = () => currentExercise();

  // ---- static parts ---------------------------------------------------------------------------
  function renderHead() {
    const e = ex();
    const days = weeklyDaysFor(state.sets, e.id, new Date());
    const max = freqMax(e, state.plan.sparring);
    const item = plannedItemFor(e.id); // today's prescription from the plan, if this exercise is in it
    const kg = item && itemKg(item, state.oneRm[e.id]);
    $('#a-head').innerHTML = `${eyebrow(`Serie ${setsToday(e.id) + 1} de ${item?.sets ?? e.defaultSets} · hoy`)}
      <button class="title" id="a-pick" style="background:none;border:0;color:inherit;padding:2px 0;text-align:left;cursor:pointer" ${recording || allowedExercises().length < 2 ? 'disabled' : ''}>${esc(e.name)} ${recording || allowedExercises().length < 2 ? '' : '▾'}</button>
      <div class="muted small">${isHold(e) ? 'Mide: tiempo y firmeza de la muñeca' : `Mide: ${jointLabel(e).toLowerCase()}`} · ${esc(e.focus)}</div>
      ${item ? `<div class="glass good" style="margin-top:10px;padding:10px 14px"><div class="small"><b>Plan de hoy:</b> ${esc(prescriptionText(item))} · ${esc(pctText(item))} del 1RM${kg ? ` (${kg.low === kg.high ? kg.low : `${kg.low}-${kg.high}`} kg)` : ''} · descanso ${item.rest} s</div>
        ${item.extraArm ? `<div class="tiny" style="color:var(--amber);margin-top:2px">+1 serie con el brazo ${item.extraArm === 'left' ? 'izquierdo' : 'derecho'} (más débil)</div>` : ''}
        <div class="muted tiny" style="margin-top:2px">Termina con 2 repeticiones en reserva: nunca al fallo.</div></div>` : ''}
      <div class="wrap" style="margin-top:8px">${pill(`${days}/${max >= 7 ? '7' : max} días esta semana`, days > max ? 'warn' : days === max ? 'good' : '')}${pill(freqText(e, state.plan.sparring), 'mute')}</div>`;
    const warnDays = days >= max && setsToday(e.id) === 0 && max < 7;
    $('#a-warn').innerHTML = warnDays
      ? `<div class="glass accent"><div class="bold">Ya llegaste al máximo semanal</div><div class="muted small" style="margin-top:4px">Entrenaste ${esc(e.name)} ${days} ${days === 1 ? 'día' : 'días'} esta semana y la guía es máx. ${max}. Mejor deja descansar ese tendón.</div></div>` : '';
    const camTip = state.cam === 'user' || mirrored
      ? 'Cámara frontal: apoya el móvil en la mesa frente a ti, con el brazo completo a la vista. Así ves la pantalla mientras entrenas.'
      : 'Cámara trasera: apoya el móvil en un soporte o pide a alguien que grabe.';
    $('#a-tip').innerHTML = `<div class="muted small">${esc(e.camera)}</div><div class="muted small" style="margin-top:6px">${camTip}</div>${e.precision !== 'Alta' ? `<div class="tiny" style="color:var(--amber);margin-top:6px">Precisión: ${esc(e.precision)}</div>` : ''}`;
  }
  function renderSetup() {
    const el = $('#a-setup');
    if (recording) { el.innerHTML = ''; return; }
    const e = ex(), oneRm = state.oneRm[e.id];
    const rec = recommendedKg(e, oneRm), st = intensityStatus(e, state.kg, oneRm);
    const lens = devices.length > 1
      ? `<select id="a-device" aria-label="Elegir cámara"><option value="">Cámara automática</option>${devices.map((d, i) => `<option value="${esc(d.deviceId)}" ${state.deviceId === d.deviceId ? 'selected' : ''}>${esc(d.label || `Cámara ${i + 1}`)}</option>`).join('')}</select>` : '';
    el.innerHTML = `${seg('cam', [['user', 'Cámara frontal'], ['environment', 'Cámara trasera']], state.cam)}${lens}
      ${seg('arm', [['right', 'Brazo derecho'], ['left', 'Brazo izquierdo']], state.arm)}
      <div class="glass tight row" style="padding:4px 8px"><div class="grow muted small" style="padding-left:8px">Peso o resistencia</div>
        <button class="icon-btn" data-kg="-2.5" aria-label="Menos peso">−</button>
        <div style="width:64px;text-align:center;font-weight:800">${state.kg} kg</div>
        <button class="icon-btn" data-kg="2.5" aria-label="Más peso">+</button></div>
      <div class="glass row" style="padding:10px 14px"><div class="grow small">
        <span class="muted">Guía: ${intensityText(e)}</span>${rec ? ` <b>= ${kgText(rec.low)}${rec.high !== rec.low ? `-${kgText(rec.high)}` : ''} kg</b> <span class="muted">(1RM ${kgText(oneRm)} kg)</span>` : ''}
        ${st === 'max' ? `<div style="color:var(--danger);margin-top:2px">Cerca de tu máximo: no entrenes al máximo.</div>` : st === 'high' ? `<div style="color:var(--warn);margin-top:2px">Por encima de la guía.</div>` : ''}</div>
        <button class="btn ghost small" id="a-1rm">${rec ? 'Cambiar 1RM' : 'Definir 1RM'}</button></div>
      <div class="row"><span class="muted small">Descanso</span><div class="grow">${seg('rest', [[60, '1 min'], [90, '1:30'], [120, '2 min'], [180, '3 min']], state.restSeconds)}</div></div>`;
  }
  /** The newest set saved today, with a quick way to delete a recording that did not turn out well. */
  function renderLast() {
    const n = new Date();
    const last = state.sets.find((x) => {
      const d = new Date(x.at);
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    });
    $('#a-last').innerHTML = last && !recording
      ? `<div class="glass row" style="padding:10px 14px"><div class="grow"><div class="tiny muted">Última serie guardada hoy</div><div class="small">${esc(setLine(last))}</div></div>
          <button class="btn ghost small" data-lastdel="${esc(last.id)}">Eliminar</button></div>` : '';
  }
  function renderRest() {
    const left = state.restLeft;
    $('#a-rest').innerHTML = left == null ? '' : `<div class="glass accent center">
      ${eyebrow('Descanso')}<div class="big" style="font-size:40px;margin:4px 0 10px">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>
      <div class="grid2"><button class="btn ghost" data-rest="30">+30 s</button><button class="btn" data-rest="skip">Saltar</button></div></div>`;
  }
  function renderLive() {
    const e = ex();
    const tracked = trackedAngle(reading, e.joint);
    const swing = obsMax > obsMin ? Math.round(obsMax - obsMin) : 0;
    $('#a-live').innerHTML = metric(jointLabel(e), tracked == null ? '--' : `${Math.round(tracked)}°`)
      + (isHold(e)
        ? metric('Tiempo', recording ? `${(elapsedMs / 1000).toFixed(0)} s` : '--') + metric('Peso', `${state.kg} kg`)
        : metric('Repeticiones', String(tracker?.reps.length ?? 0)) + metric('Rango visto', recording && swing ? `${swing}°` : '--'));
    const lightOk = brightness >= 55, armOk = Boolean(reading?.inFrame);
    const lost = recording && !reading && performance.now() - lostSince > 1200;
    $('#a-status').innerHTML = pill(lightOk ? 'Luz buena' : 'Luz baja', lightOk ? 'good' : 'warn')
      + pill(!reading ? 'Buscando brazo' : armOk ? 'Brazo visible' : 'Brazo fuera de cuadro', armOk ? 'good' : 'warn')
      + (lost ? pill('No veo tu brazo', 'bad') : '')
      + (otherSeen > 8 && !reading ? `<button class="chip on" data-switcharm style="border-color:var(--warn);color:var(--warn)">Veo tu otro brazo · Cambiar</button>` : '')
      + (lightOk && armOk && !recording ? pill('Listo para grabar', 'good') : '');
  }
  function renderChrome() {
    renderHead(); renderSetup(); renderRest(); renderLast(); renderLive();
    const badge = $('#badge'), msg = $('#msg'), rec = $('#a-rec');
    badge.innerHTML = recording
      ? `<span class="pill bad"><span class="rec-dot"></span>Grabando${recorder ? '' : ' (sin vídeo)'}</span>`
      : (stream ? pill(landmarker ? 'Vista previa' : 'Cargando modelo...') : '');
    const text = camError ?? modelError;
    msg.hidden = !text && Boolean(stream);
    if (!stream && !camError) msg.textContent = 'Abriendo la cámara...';
    if (text) msg.textContent = text;
    rec.textContent = recording ? 'Detener y ver informe' : isHold(ex()) ? 'Empezar retención' : 'Grabar serie';
    rec.classList.toggle('ghost', recording);
    rec.disabled = !stream || (!landmarker && !recording);
    video.classList.toggle('mirror', mirrored);
    $('#a-flip').hidden = recording;
  }

  // ---- camera ---------------------------------------------------------------------------------
  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    reading = null;
    lastTime = -1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function requestStream() {
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const attempts = [];
    if (state.deviceId) attempts.push({ ...size, deviceId: { exact: state.deviceId } });
    attempts.push({ ...size, facingMode: { ideal: state.cam } });
    attempts.push(true); // any camera at all
    let lastErr;
    for (const v of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
      } catch (e) {
        lastErr = e;
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break;
      }
    }
    throw lastErr;
  }

  async function openCamera() {
    const mine = ++opening;
    stopStream();
    camError = null;
    renderChrome();
    if (!navigator.mediaDevices?.getUserMedia) {
      camError = 'Este navegador no permite usar la cámara. Abre Fulcro en Chrome o Brave y usa la dirección https.';
      return renderChrome();
    }
    try {
      const s = await requestStream();
      if (!alive || mine !== opening) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const facing = s.getVideoTracks()[0]?.getSettings?.().facingMode;
      // Selfie view is shown mirrored. Webcams that report no facing mode count as selfie when "frontal" is chosen.
      mirrored = facing ? facing === 'user' : state.cam === 'user';
      video.srcObject = s;
      await video.play().catch(() => {});
      await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
      if (!alive || mine !== opening) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      stage.style.aspectRatio = `${vw} / ${vh}`;
      stage.style.maxWidth = vw > vh ? '480px' : '320px';
      canvas.width = 360;
      canvas.height = Math.round((360 * vh) / vw);
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
      try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch { devices = []; }
      camError = null;
    } catch (e) {
      stream = null;
      camError = e?.name === 'NotAllowedError'
        ? 'Fulcro necesita permiso de cámara. Tócalo en el candado de la barra de direcciones y elige Permitir.'
        : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'No se encontró esa cámara. Prueba con la otra.' : `No se pudo abrir la cámara (${e?.name ?? 'error'}).`;
    }
    renderChrome();
    if (!landmarker) loadModel();
    if (stream && !loopStarted) { loopStarted = true; loop(); }
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
    if (paused || !stream || !landmarker || video.readyState < 2 || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    const now = performance.now();
    let result;
    try { result = globalThis.__FAKE_DETECT?.(now) ?? landmarker.detectForVideo(video, now); } catch { return; } // __FAKE_DETECT: test hook
    const e = ex();
    const lm = result.landmarks?.[0];
    reading = readArm(lm, state.arm, video.videoWidth, video.videoHeight, e.joint);
    // Is the other arm the one being seen? Then the wrong side may be selected.
    otherSeen = !reading && readArm(lm, state.arm === 'left' ? 'right' : 'left', video.videoWidth, video.videoHeight, e.joint) ? otherSeen + 1 : 0;
    let tracked = null;
    if (reading) {
      tracked = smoother.push(trackedAngle(reading, e.joint));
      lostSince = 0;
    } else {
      if (!lostSince) lostSince = now;
      if (now - lostSince > 600) smoother.reset();
    }
    drawArm(ctx, reading?.p, e.joint, tracked, mirrored);

    if (recording) {
      recFrames++;
      if (reading) {
        const t = now - t0;
        recSeen++;
        obsMin = Math.min(obsMin, tracked);
        obsMax = Math.max(obsMax, tracked);
        if (tracker) {
          tracker.add(t, tracked, reading.wristAngle);
          const last = tracker.reps.at(-1);
          if (last) lastRepMs = last.e - last.s;
        }
        frames.push({ t: Math.round(t), p: reading.p.map((v) => Math.round(v * 1e4) / 1e4), a: Math.round(tracked * 10) / 10 });
      }
      elapsedMs = now - t0;
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
    const e = ex();
    tracker = isHold(e) ? null : new RepTracker(repDelta(e));
    frames = []; chunks = []; lastRepMs = 0; elapsedMs = 0;
    recFrames = 0; recSeen = 0; obsMin = Infinity; obsMax = -Infinity; lostSince = 0;
    startedAt = new Date();
    recorder = null;
    const mime = pickMime();
    if (mime && stream) {
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
        recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
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
    const e = ex();
    const reps = tracker ? [...tracker.reps] : [];
    const set = {
      id: String(startedAt.getTime()), ex: e.id, arm: state.arm, kg: state.kg, at: startedAt.toISOString(),
      dur, reps, marks: [], video: false, note: '', pl: 0, cam: mirrored ? 'user' : 'environment',
    };
    const fat = detectFatigue(reps);
    if (fat) set.fat = fat;
    // how well the arm was followed, so the report can explain a set with few repetitions
    set.cov = recFrames ? Math.round((recSeen / recFrames) * 100) / 100 : 0;
    if (recSeen) set.obs = [Math.round(obsMin), Math.round(obsMax)];
    if (isHold(e) && frames.length >= 10) set.sd = Math.round(stdDev(frames.map((f) => f.a)) * 10) / 10;
    renderChrome();
    api.openReport({ set, isNew: true, frames, blob, onSaved: () => startRest() });
  }

  // ---- sheets -----------------------------------------------------------------------------------
  function openSheet(html, onClick) {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet">${html}</div>`;
    back.addEventListener('click', (ev) => {
      if (ev.target === back) return back.remove();
      onClick?.(ev, () => back.remove());
    });
    document.body.append(back);
    return back;
  }

  function openPicker() {
    const list = allowedExercises();
    openSheet(`<div class="title" style="margin-bottom:4px">${planRestricted() ? 'Ejercicios de hoy' : 'Ejercicio'}</div>
      <div class="muted tiny" style="margin-bottom:12px">${planRestricted()
        ? 'Solo aparecen los ejercicios de tu plan para hoy. Para cambiarlos, edita el día en Plan.'
        : 'Frecuencia e intensidad: guía básica, no sustituye a un entrenador.'}</div><div class="stack">
      ${list.map((e) => { const it = plannedItemFor(e.id); return `<button class="glass ${e.id === state.exerciseId ? 'good' : ''}" data-ex="${e.id}" style="text-align:left;cursor:pointer;color:inherit">
        <div class="row"><div class="grow bold" style="font-size:16px">${esc(e.name)}</div>${it ? pill(`${setsToday(e.id)}/${it.sets}`, setsToday(e.id) >= it.sets ? 'good' : '') : ''}${pill(isHold(e) ? 'Retención' : jointLabel(e))}</div>
        <div class="muted small">${esc(e.focus)}</div>
        ${it ? `<div class="small" style="margin-top:6px"><b>Hoy:</b> ${esc(prescriptionText(it))} · ${esc(pctText(it))} del 1RM</div>` : ''}
        <div class="small" style="margin-top:8px">${e.cues.map((c) => `· ${esc(c)}`).join('<br>')}</div>
        <div class="tiny" style="margin-top:8px;color:var(--teal)">${esc(freqText(e, state.plan.sparring))} · ${esc(intensityText(e))}</div>
        ${isHold(e) ? '' : `<div class="muted tiny" style="margin-top:4px">Objetivo: ${e.minRange}° de rango · ${(e.tempoMinMs / 1000).toFixed(1)} a ${(e.tempoMaxMs / 1000).toFixed(1)} s por rep</div>`}
        ${e.precision !== 'Alta' ? `<div class="tiny" style="color:var(--amber);margin-top:4px">Precisión: ${esc(e.precision)}</div>` : ''}</button>`; }).join('')}
    </div>`, (ev, close) => {
      const b = ev.target.closest('[data-ex]');
      if (b) { pickExercise(b.dataset.ex); close(); }
    });
  }

  function open1Rm() {
    const e = ex();
    const sheet = openSheet(`<div class="title" style="margin-bottom:4px">1RM de ${esc(e.name)}</div>
      <p class="muted small" style="margin-bottom:12px">Es el máximo peso con el que haces una sola repetición. La guía es trabajar con el ${esc(intensityText(e))}. No hace falta probarlo al máximo: usa una estimación honesta.</p>
      <input type="number" id="rm-input" inputmode="decimal" min="0" max="500" step="0.5" placeholder="kg" value="${state.oneRm[e.id] ?? ''}">
      <div class="grid2" style="margin-top:12px"><button class="btn ghost" id="rm-clear">Quitar</button><button class="btn" id="rm-save">Guardar</button></div>`, (ev, close) => {
      if (ev.target.closest('#rm-save')) { setOneRm(e.id, sheet.querySelector('#rm-input').value); close(); }
      if (ev.target.closest('#rm-clear')) { setOneRm(e.id, 0); close(); }
    });
    sheet.querySelector('#rm-input').focus();
  }

  // ---- events ---------------------------------------------------------------------------------
  let lastCamKey = `${state.cam}|${state.deviceId}`;
  const offClick = on(root, {
    '#a-pick': openPicker,
    '#a-1rm': open1Rm,
    '#a-rec': () => (recording ? stop() : start()),
    '[data-seg="arm"]': (el) => pickArm(el.dataset.v),
    '[data-switcharm]': () => { otherSeen = 0; pickArm(state.arm === 'left' ? 'right' : 'left'); toast('Brazo cambiado.'); },
    '[data-seg="cam"]': (el) => setCam(el.dataset.v),
    '[data-lastdel]': (el) => openDeleteSet(el.dataset.lastdel),
    '#a-flip': () => { if (!recording) setCam(mirrored ? 'environment' : 'user'); },
    '[data-seg="rest"]': (el) => setRestSeconds(Number(el.dataset.v)),
    '[data-kg]': (el) => setKg(state.kg + Number(el.dataset.kg)),
    '[data-rest]': (el) => (el.dataset.rest === 'skip' ? cancelRest() : addRest(30)),
  });
  const onChange = (ev) => { if (ev.target.id === 'a-device') setDeviceId(ev.target.value); };
  root.addEventListener('change', onChange);
  let lastExercise = state.exerciseId;
  const offState = subscribe(() => {
    if (!alive) return;
    const key = `${state.cam}|${state.deviceId}`;
    if (key !== lastCamKey && !recording) { lastCamKey = key; openCamera(); return; }
    if (state.exerciseId !== lastExercise) {
      lastExercise = state.exerciseId;
      if (!recording) { tracker = null; lastRepMs = 0; elapsedMs = 0; }
    }
    renderChrome(); // button label, live metrics and hints all depend on the exercise
  });
  const offRest = subscribeRest(() => { if (alive) renderRest(); });
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
    stopStream();
    try { wakeLock?.release(); } catch { /* ignore */ }
    document.removeEventListener('visibilitychange', onVisible);
    root.removeEventListener('change', onChange);
    offClick(); offState(); offRest(); offOverlay();
  };
}
