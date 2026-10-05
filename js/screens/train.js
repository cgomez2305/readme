// "Entrenar": build reference profiles from videos. The video is analysed on this phone and only the angle
// curves of the repetitions are kept (never the video). References are then used to score the user's sets.
import { state, subscribe, allRefs, addRef, deleteRef, setUseRefs, setSens, deleteTrainedModel } from '../state.js';
import { collectData, trainModel, MIN_GOOD, MIN_BAD } from '../model.js';
import { exercises, exerciseById, repDelta, sensitivityLabel } from '../exercises.js';
import { RepTracker, mean, formatDay } from '../analysis.js';
import { buildProfile, resolveTargets, toRefReps, percentile } from '../score.js';
import { analyzeVideoFile } from '../pose.js';
import { seriesChart, lossChart } from '../charts.js';
import { esc, eyebrow, pill, seg, on, toast } from '../ui.js';
import { confirmSheet } from './manage.js';

const SOURCES = [['pro', 'Profesional'], ['mate', 'Compañero'], ['own', 'Yo']];
const SOURCE_LABEL = { pro: 'Profesional', mate: 'Compañero', own: 'Mía' };
const repExercises = exercises.filter((e) => e.mode === 'reps');

// Kept while the app is open so a half-filled form survives tab changes.
const form = { ex: repExercises[0].id, source: 'pro', label: '', consent: false };
let view = 'form'; // 'form' | 'busy' | 'result'
let busy = { p: 0, cancel: false };
let result = null; // { ex, out, reps:{left,right}, sel }
let error = null;
let fileName = '';
let pickedFile = null;
const mdl = { ex: repExercises[0].id, busy: false, phase: '', p: 0, err: null }; // the model being trained

function trackSeries(series, delta) {
  const t = new RepTracker(delta);
  for (const [ms, a] of series) t.add(ms, a);
  return t.reps;
}

function compute() {
  const ex = exerciseById(result.ex);
  const delta = repDelta(ex, state.sens);
  result.reps = { left: trackSeries(result.out.series.left, delta), right: trackSeries(result.out.series.right, delta) };
  const score = (arm) => result.reps[arm].length * 10 + result.out.cov[arm];
  result.sel = result.sel && result.reps[result.sel] ? result.sel : (score('right') >= score('left') ? 'right' : 'left');
  if (result.reps[result.sel].length === 0 && result.reps[result.sel === 'left' ? 'right' : 'left'].length) result.sel = result.sel === 'left' ? 'right' : 'left';
}

const armStats = (reps) => ({
  n: reps.length,
  range: reps.length ? percentile(reps.map((r) => r.mx - r.mn), 0.5) : 0,
  dur: reps.length ? percentile(reps.map((r) => r.e - r.s), 0.5) : 0,
});

export function mount(root, api) {
  const profileCard = () => {
    const refs = allRefs();
    const byEx = exercises.filter((e) => refs.some((r) => r.ex === e.id));
    return `<div class="glass">
      <div class="row"><div class="grow"><div class="bold">Modelo de referencia</div>
        <div class="muted tiny">Perfiles de rango, ritmo y forma del movimiento con los que se puntúan tus series.</div></div>
        <input type="checkbox" class="switch" id="tr-use" ${state.useRefs ? 'checked' : ''} aria-label="Usar referencias al puntuar"></div>
      ${byEx.length ? byEx.map((e) => {
        const mine = refs.filter((r) => r.ex === e.id);
        const prof = buildProfile(mine, e.id), T = resolveTargets(e, state.useRefs ? refs : []);
        return `<div style="padding:8px 0;border-top:1px solid var(--edge);margin-top:8px"><div class="small bold">${esc(e.name)}</div>
          <div class="muted tiny">${mine.length} ${mine.length === 1 ? 'referencia' : 'referencias'} · ${prof.n} repeticiones · rango mediano ${Math.round(prof.range.med)}° · ritmo ${(prof.dur.med / 1000).toFixed(1)} s</div>
          <div class="tiny" style="color:var(--teal)">Objetivo de rango: ${Math.round(T.range)}° (${esc(T.rangeSrc)})${T.curveSrc ? ` · forma: ${esc(T.curveSrc)}` : ''}</div></div>`;
      }).join('') : '<div class="muted small" style="margin-top:10px">Todavía no hay referencias. Sube un vídeo o marca una buena serie tuya como referencia desde su informe. Mientras tanto se usan los objetivos por defecto.</div>'}
    </div>`;
  };

  const modelCard = () => {
    const { pos, neg, counts } = collectData(mdl.ex);
    const m = state.models[mdl.ex], ex = exerciseById(mdl.ex);
    const missing = Math.max(0, MIN_GOOD - pos.length);
    const phaseText = mdl.phase === 'clf' ? 'Entrenando el clasificador de buenas y malas' : 'Entrenando el modelo de buena ejecución';
    return `<div class="glass stack">
      <div><div class="bold" style="font-size:16px">Modelo de IA de la técnica</div>
        <div class="muted tiny">Una red neuronal pequeña que se entrena aquí, en tu móvil. Aprende cómo es una buena repetición con tus referencias y tus series valoradas, y luego ayuda a puntuar la técnica.</div></div>
      <select id="md-ex" aria-label="Ejercicio del modelo">${repExercises.map((e) => `<option value="${e.id}" ${mdl.ex === e.id ? 'selected' : ''}>${esc(e.name)}${state.models[e.id] ? ' · entrenado' : ''}</option>`).join('')}</select>
      <div class="small">Buenas: <b>${pos.length}</b> <span class="muted tiny">(${counts.refs} de referencias, ${counts.good} de series 👍)</span> · Malas: <b>${neg.length}</b> <span class="muted tiny">(series 👎)</span></div>
      ${m ? `<div class="glass good" style="padding:10px 14px"><div class="small bold">Modelo entrenado · ${formatDay(new Date(m.at))}</div>
        <div class="muted tiny">${m.nPos} repeticiones buenas${m.nNeg ? ` y ${m.nNeg} malas` : ''}. Error en datos que no vio: ${m.ae.stats.valLoss != null ? m.ae.stats.valLoss.toFixed(4) : 'n/d'}${m.clf?.stats?.valAcc != null ? ` · acierta buenas/malas el ${Math.round(m.clf.stats.valAcc * 100)}%` : ''}.</div>
        ${lossChart(m.ae.stats.curve, m.ae.stats.valCurve)}
        <div class="muted tiny"><span style="color:var(--copper)">■</span> entrenamiento <span style="color:var(--teal)">■</span> datos que no vio</div></div>` : '<div class="muted small">Todavía no hay modelo para este ejercicio. Mientras tanto la técnica se puntúa solo con la forma de las referencias.</div>'}
      ${pos.length > 0 && pos.length < 40 ? '<div class="tiny" style="color:var(--amber)">Con menos de 40 repeticiones buenas el modelo es orientativo. Más vídeos y más series valoradas lo mejoran.</div>' : ''}
      ${neg.length > 0 && neg.length < MIN_BAD ? `<div class="tiny muted">Con ${MIN_BAD} repeticiones malas o más también aprende a distinguir buenas de malas.</div>` : ''}
      ${mdl.err ? `<div class="small" style="color:var(--warn)">${esc(mdl.err)}</div>` : ''}
      ${mdl.busy ? `<div class="stack"><div class="small">${phaseText}...</div><div class="bar-track"><div class="bar-fill" id="md-bar" style="width:${Math.round(mdl.p * 100)}%"></div></div></div>`
        : `<div class="grid2">${m ? '<button class="btn ghost" id="md-del">Quitar modelo</button>' : '<span></span>'}<button class="btn" id="md-train" ${missing ? 'disabled' : ''}>${m ? 'Entrenar de nuevo' : 'Entrenar modelo'}</button></div>
        ${missing ? `<div class="muted tiny">Faltan ${missing} repeticiones buenas (hacen falta ${MIN_GOOD}). Sube un vídeo de referencia o valora tus series con 👍.</div>` : ''}`}
    </div>`;
  };

  const formCard = () => `<div class="glass stack">
    <div class="bold" style="font-size:16px">Crear una referencia desde un vídeo</div>
    <div class="muted tiny">El vídeo se analiza en tu móvil. Solo se guardan las curvas de ángulo de las repeticiones, no el vídeo. Para obtener buenos datos, el brazo completo debe verse y el vídeo debe tener varias repeticiones del mismo ejercicio.</div>
    ${error ? `<div class="small" style="color:var(--warn)">${esc(error)}</div>` : ''}
    <label class="muted small" for="tr-ex">Ejercicio del vídeo</label>
    <select id="tr-ex">${repExercises.map((e) => `<option value="${e.id}" ${form.ex === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
    ${seg('trsrc', SOURCES, form.source)}
    <input type="text" id="tr-label" placeholder="Nombre o alias del deportista" value="${esc(form.label)}" maxlength="40">
    <label class="glass row" style="padding:10px 14px;cursor:pointer"><input type="checkbox" class="switch" id="tr-consent" ${form.consent ? 'checked' : ''}>
      <span class="grow small">Tengo permiso para usar este vídeo. Solo se guardan los números de la técnica.</span></label>
    <label class="btn ghost" style="text-align:center;cursor:pointer;display:block">${fileName ? esc(fileName) : 'Elegir vídeo'}<input type="file" id="tr-file" accept="video/*" style="display:none"></label>
    <button class="btn" id="tr-start" ${pickedFile && form.consent ? '' : 'disabled'}>Analizar vídeo</button>
    ${!form.consent ? '<div class="muted tiny">Marca el permiso para poder analizar.</div>' : ''}
  </div>`;

  const busyCard = () => `<div class="glass stack center"><div class="bold">Analizando el vídeo...</div>
    <div class="muted tiny">Esto corre en tu móvil y puede tardar lo que dura el vídeo. No cierres la pestaña.</div>
    <div class="bar-track"><div class="bar-fill" id="tr-bar" style="width:${Math.round(busy.p * 100)}%"></div></div>
    <div class="small" id="tr-pct">${Math.round(busy.p * 100)}%</div>
    <button class="btn ghost" id="tr-cancel">Cancelar</button></div>`;

  const resultCard = () => {
    const ex = exerciseById(result.ex), { out, reps, sel } = result;
    const L = armStats(reps.left), R = armStats(reps.right);
    const delta = repDelta(ex, state.sens);
    const armCard = (arm, st) => `<button class="glass ${sel === arm ? 'good' : ''}" data-arm="${arm}" style="text-align:left;cursor:pointer;color:inherit">
      <div class="bold">Brazo ${arm === 'left' ? 'izquierdo' : 'derecho'}</div>
      <div class="big" style="font-size:22px">${st.n} reps</div>
      <div class="muted tiny">${st.n ? `rango ${Math.round(st.range)}° · ${(st.dur / 1000).toFixed(1)} s` : 'sin repeticiones'}</div>
      <div class="muted tiny">visto el ${Math.round(out.cov[arm] * 100)}% del vídeo</div></button>`;
    const n = reps[sel].length;
    return `<div class="glass"><div class="bold">${esc(ex.name)} · ${Math.round(out.durationMs / 1000)} s de vídeo</div>
      <div style="margin-top:10px">${seriesChart(out.series, { durationMs: out.durationMs, sel: sel === 'left' ? 'left' : 'right', reps: reps[sel] })}</div>
      <div class="muted tiny" style="margin-top:6px"><span style="color:var(--teal)">■</span> izquierdo · <span style="color:var(--copper)">■</span> derecho. Las franjas son las repeticiones contadas del brazo elegido (tramos de al menos ${delta}°).</div></div>
      <div class="grid2">${armCard('left', L)}${armCard('right', R)}</div>
      <div class="glass stack"><div class="small bold">Sensibilidad del conteo</div>${seg('trsens', Object.entries(sensitivityLabel), state.sens)}
        <div class="muted tiny">Si faltan repeticiones, sube la sensibilidad. Si cuenta de más, bájala.</div></div>
      ${n >= 3 ? `<div class="glass stack"><div class="small">Se guardarán <b>${n} repeticiones</b> como referencia de <b>${esc(ex.name)}</b>${form.label ? ` (${esc(form.label)})` : ''}.</div>
        <button class="btn" id="tr-save">Guardar referencia</button></div>`
        : `<div class="glass"><div class="bold" style="color:var(--warn)">No hay suficientes repeticiones</div>
        <div class="muted small" style="margin-top:4px">${n} de las 3 mínimas. ${out.cov[sel] < 0.5 ? `Solo se vio el brazo el ${Math.round(out.cov[sel] * 100)}% del vídeo: usa un vídeo donde se vea el brazo completo.` : 'Prueba con la sensibilidad alta o con un vídeo de más repeticiones.'}</div></div>`}
      <button class="btn ghost" id="tr-again">Elegir otro vídeo</button>`;
  };

  const refsList = () => {
    const refs = allRefs().sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!refs.length) return '';
    return `<div class="bold" style="margin-top:6px">Referencias guardadas</div>${refs.map((r) => {
      const local = state.refs.some((x) => x.id === r.id);
      return `<div class="glass row" style="padding:10px 14px"><div class="grow"><div class="small bold">${esc(r.label || 'Sin nombre')} · ${esc(exerciseById(r.ex).name)}</div>
        <div class="muted tiny">${r.reps.length} reps · brazo ${r.arm === 'left' ? 'izquierdo' : 'derecho'} · ${formatDay(new Date(r.at))} · rango ${Math.round(mean(r.reps.map((x) => x.r)))}°</div></div>
        ${pill(SOURCE_LABEL[r.source] ?? r.source, r.source === 'own' ? 'good' : '')}${local ? `<button class="btn ghost small" data-delref="${esc(r.id)}">Eliminar</button>` : pill('Del grupo', 'mute')}</div>`;
    }).join('')}`;
  };

  const render = () => {
    root.innerHTML = `<div class="col">
      <div>${eyebrow('Referencias')}<div class="title">Entrenar</div></div>
      <div class="glass muted small">No es un modelo que aprenda solo: con los vídeos que subas se calculan perfiles de referencia (rango, ritmo y forma del movimiento) y tus series se comparan contra ellos para puntuarlas. Con más vídeos, el objetivo se parece más a un buen modelo.</div>
      ${profileCard()}
      ${view === 'form' ? modelCard() : ''}
      ${view === 'busy' ? busyCard() : view === 'result' ? resultCard() : formCard()}
      ${view === 'form' ? refsList() : ''}
    </div>`;
  };

  async function start() {
    error = null;
    view = 'busy';
    busy = { p: 0, cancel: false };
    render();
    try {
      const ex = exerciseById(form.ex);
      const out = await analyzeVideoFile(pickedFile, {
        joint: ex.joint,
        shouldCancel: () => busy.cancel,
        onProgress: (p) => {
          busy.p = p;
          const bar = root.querySelector('#tr-bar'), pct = root.querySelector('#tr-pct');
          if (bar) bar.style.width = `${Math.round(p * 100)}%`;
          if (pct) pct.textContent = `${Math.round(p * 100)}%`;
        },
      });
      if (out.cancelled) { view = 'form'; } else { result = { ex: ex.id, out, reps: null, sel: null }; compute(); view = 'result'; }
    } catch (e) {
      console.warn(e);
      error = e?.message || 'No se pudo analizar el vídeo.';
      view = 'form';
    }
    render();
  }

  render();
  const off = subscribe(() => { if (view !== 'busy' && !mdl.busy) render(); });
  const offClick = on(root, {
    '[data-seg="trsrc"]': (el) => { form.source = el.dataset.v; render(); },
    '[data-seg="trsens"]': (el) => { setSens(el.dataset.v); if (result) { compute(); render(); } },
    '[data-arm]': (el) => { result.sel = el.dataset.arm; render(); },
    '#tr-start': start,
    '#md-train': async () => {
      mdl.busy = true; mdl.err = null; mdl.p = 0; mdl.phase = 'ae';
      render();
      try {
        await trainModel(mdl.ex, (phase, e, n) => {
          mdl.phase = phase;
          mdl.p = phase === 'ae' ? (e / n) * (collectData(mdl.ex).neg.length >= MIN_BAD ? 0.5 : 1) : 0.5 + (e / n) * 0.5;
          const bar = root.querySelector('#md-bar');
          if (bar) bar.style.width = `${Math.round(mdl.p * 100)}%`;
        });
        toast('Modelo entrenado. Tus próximas series usan este modelo.');
      } catch (e) {
        mdl.err = e?.message || 'No se pudo entrenar el modelo.';
      }
      mdl.busy = false;
      render();
    },
    '#md-del': () => confirmSheet({
      title: '¿Quitar el modelo entrenado?',
      text: 'Se borra el modelo de este ejercicio (también del grupo y de la nube). Las referencias y tus series no se tocan. Puedes entrenarlo de nuevo.',
      confirmLabel: 'Quitar modelo',
      onDone: () => { deleteTrainedModel(mdl.ex); toast('Modelo quitado.'); },
    }),
    '#tr-cancel': () => { busy.cancel = true; },
    '#tr-again': () => { view = 'form'; result = null; pickedFile = null; fileName = ''; render(); },
    '#tr-save': () => {
      const ex = exerciseById(result.ex), reps = result.reps[result.sel];
      addRef({
        id: `ref-${Date.now().toString(36)}`, ex: ex.id, arm: result.sel, source: form.source,
        label: form.label.trim() || (form.source === 'own' ? 'Yo' : 'Sin nombre'), at: new Date().toISOString(),
        cov: Math.round(result.out.cov[result.sel] * 100) / 100, durMs: Math.round(result.out.durationMs), reps: toRefReps(reps),
      });
      toast('Referencia guardada. Tus series de este ejercicio se puntuarán con ella.');
      view = 'form'; result = null; pickedFile = null; fileName = '';
      render();
    },
    '[data-delref]': (el) => confirmSheet({
      title: '¿Eliminar esta referencia?',
      text: 'Se quita del modelo de referencia y de tu grupo si estaba compartida. No se puede deshacer.',
      onDone: () => { deleteRef(el.dataset.delref); toast('Referencia eliminada.'); },
    }),
  });
  const onChange = (e) => {
    const id = e.target.id;
    if (id === 'md-ex') { mdl.ex = e.target.value; mdl.err = null; render(); }
    else if (id === 'tr-ex') form.ex = e.target.value;
    else if (id === 'tr-label') form.label = e.target.value;
    else if (id === 'tr-consent') { form.consent = e.target.checked; render(); }
    else if (id === 'tr-use') setUseRefs(e.target.checked);
    else if (id === 'tr-file') {
      pickedFile = e.target.files?.[0] ?? null;
      fileName = pickedFile?.name ?? '';
      error = null;
      render();
    }
  };
  const onInput = (e) => { if (e.target.id === 'tr-label') form.label = e.target.value; };
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  return () => {
    busy.cancel = true;
    off(); offClick();
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
  };
}
