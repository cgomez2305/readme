// Report of one series. A new series offers Save / Discard; a saved one allows editing notes
// and pain, watching the video and deleting.
import { state, addSet, updateSet, deleteSet, targetsFor, addRef, deleteRef, refFromSet } from '../state.js';
import { scoreSet, scoreHold, scoreAdvice } from '../score.js';
import { exerciseById, jointLabel, armLabel, painZones, isHold, repDelta } from '../exercises.js';
import {
  summarize, summarizeHold, diagnoseSet, intensityTips, frequencyTips, weeklyDaysFor, repRange, repDuration, formatDay, formatTime, fmtKg,
} from '../analysis.js';
import { esc, eyebrow, metric, seg, on, icon, toast } from '../ui.js';
import { repBars } from '../charts.js';
import { confirmSheet } from './manage.js';

export function mount(root, api, { set, isNew, frames = [], blob = null, onSaved }) {
  const ex = exerciseById(set.ex);
  let saving = false;
  let wantRef = false; // a new set: make it a reference when saved

  const hold = isHold(ex);
  const render = () => {
    const T = targetsFor(ex.id);
    const s = hold ? { reps: 0, fatigueRep: null, tips: [] }
      : summarize(set.reps, ex, { range: T.range, tempoLo: T.tempoLo, tempoHi: T.tempoHi, rangeSrc: T.rangeSrc });
    const sc = set.sc ?? (hold ? scoreHold(set.sd) : scoreSet(set.reps, T)); // sets from older versions have no stored score
    const advice = hold || !sc ? [] : scoreAdvice(sc, set.reps, T).map((a) => ({ level: 'warn', title: 'Para mejorar la puntuación', text: a.text }));
    const isRef = state.refs.some((r) => r.id === `set-${set.id}`) || wantRef;
    const canRef = !hold && set.reps.filter((r) => r.c).length >= 3;
    const h = hold ? summarizeHold(set.dur, set.sd) : null;
    // Guidelines: weight against the 1RM and weekly frequency, counted up to the day of this set.
    const days = weeklyDaysFor(isNew ? [...state.sets, set] : state.sets, ex.id, new Date(set.at));
    const diag = diagnoseSet(set, ex, repDelta(ex));
    const tips = [...advice, ...(!hold && s.reps < 3 ? diag : []), ...(h ? h.tips : s.tips), ...(hold || s.reps >= 3 ? diag : []), ...intensityTips(ex, set.kg, state.oneRm[ex.id]), ...frequencyTips(ex, days, state.plan.sparring)];
    const fatIdx = s.fatigueRep == null ? undefined : s.fatigueRep - 1;
    const tipIcon = { good: ['✓', 'var(--teal)'], warn: ['!', 'var(--warn)'], info: ['i', 'var(--muted)'] };
    const note = root.querySelector('#r-note')?.value ?? set.note;
    root.innerHTML = `<div class="col">
      <div class="row"><button class="icon-btn" id="r-back" aria-label="Volver">${icon('back')}</button>
        <div class="grow">${eyebrow(isNew ? 'Informe de la serie' : `${formatDay(new Date(set.at))} · ${formatTime(new Date(set.at))}`)}</div></div>
      <div><div class="title">${esc(ex.name)}</div>
        <div class="muted small" style="margin-top:4px">Brazo ${armLabel(set.arm).toLowerCase()} · ${fmtKg(set.kg)} kg · ${Math.round(set.dur / 1000)} s${set.cov != null ? ` · brazo visto el ${Math.round(set.cov * 100)}%` : ''}</div></div>
      ${sc ? scoreCard(sc, hold) : ''}
      <div class="grid2">
        ${hold ? `
          ${metric('Tiempo bajo tensión', `${Math.round(h.seconds)} s`)}
          ${metric('Firmeza de muñeca', h.sd == null ? '--' : `±${h.sd.toFixed(1)}°`, h.sd == null ? '' : h.sd <= 5 ? 'Firme' : h.sd <= 10 ? 'Algo inestable' : 'Inestable', h.sd == null ? 'mute' : h.sd <= 5 ? 'good' : 'warn')}`
        : `
          ${metric('Repeticiones', String(s.reps))}
          ${metric('Rango medio', s.reps ? `${Math.round(s.avgRange)}°` : '--', s.reps ? (s.avgRange >= ex.minRange ? 'En objetivo' : 'Corto') : '', s.avgRange >= ex.minRange ? 'good' : 'warn')}
          ${metric('Tempo por rep', s.reps ? `${(s.avgTempoMs / 1000).toFixed(1)} s` : '--')}
          ${metric('Fatiga', s.fatigueRep == null ? 'No' : `Rep ${s.fatigueRep}`, s.reps < 5 ? 'Necesita 5 reps' : '', 'mute')}`}
      </div>
      ${s.reps ? `<div class="glass">
        <div class="bold" style="margin-bottom:12px">Rango por repetición (${jointLabel(ex).toLowerCase()})</div>
        ${repBars(set.reps.map(repRange), { target: ex.minRange, highlightFrom: fatIdx })}
        <div class="bold" style="margin:16px 0 12px">Duración por repetición</div>
        ${repBars(set.reps.map((r) => repDuration(r) / 1000), { unit: ' s', decimals: 1, height: 90, highlightFrom: fatIdx })}
      </div>` : ''}
      ${tips.map((t) => `<div class="glass row top"><div class="day" style="margin:0;background:var(--glass-strong);color:${tipIcon[t.level][1]};width:34px;height:34px;border-radius:12px;flex:none">${tipIcon[t.level][0]}</div>
        <div><div class="bold">${esc(t.title)}</div><div class="muted small">${esc(t.text)}</div></div></div>`).join('')}
      <div class="glass stack">
        <div class="bold">Entrena a la app</div>
        <div class="muted tiny">Tu valoración enseña al modelo qué es una buena ejecución y qué no.</div>
        <div class="grid2">
          <button class="chip ${set.rate === 'good' ? 'on' : ''}" data-rate="good" style="${set.rate === 'good' ? 'border-color:var(--teal);color:var(--teal)' : ''}">👍 Bien hecha</button>
          <button class="chip ${set.rate === 'bad' ? 'on' : ''}" data-rate="bad" style="${set.rate === 'bad' ? 'border-color:var(--warn);color:var(--warn)' : ''}">👎 Mal hecha</button>
        </div>
        ${canRef ? `<button class="btn ghost small" id="r-ref">${isRef ? 'Quitar de mis referencias' : 'Usar como mi referencia'}</button>
          <div class="muted tiny">Una referencia es una serie que consideras bien hecha: tus próximas series se puntúan contra ella.</div>` : (hold ? '' : '<div class="muted tiny">Para usarla como referencia hacen falta 3 repeticiones contadas.</div>')}
      </div>
      <div class="glass stack">
        <div class="bold">¿Sentiste dolor?</div>
        <div class="wrap">${painZones.map(([id, label]) => `<button class="chip ${set.pz === id ? 'on' : ''}" data-pz="${id}">${esc(label)}</button>`).join('')}</div>
        ${set.pz ? seg('pl', [[1, 'Leve'], [2, 'Moderado'], [3, 'Fuerte']], set.pl || 1) : ''}
        <textarea id="r-note" placeholder="Notas de la serie (cómo te sentiste, ajustes de agarre...)">${esc(note)}</textarea>
      </div>
      <button class="btn" id="r-save">${isNew ? 'Guardar serie' : 'Guardar cambios'}</button>
      ${!isNew && set.video ? '<button class="btn ghost" id="r-replay">Ver en cámara lenta</button>' : ''}
      <button class="btn ghost" id="r-del">${isNew ? 'Descartar' : 'Eliminar serie'}</button>
    </div>`;
  };
  render();

  const readNote = () => { set.note = root.querySelector('#r-note')?.value.trim() ?? set.note; };
  const offClick = on(root, {
    '#r-back': () => api.closeOverlay(),
    '[data-pz]': (el) => {
      readNote();
      const id = el.dataset.pz;
      if (set.pz === id) { delete set.pz; set.pl = 0; } else { set.pz = id; set.pl ||= 1; }
      render();
    },
    '[data-seg="pl"]': (el) => { readNote(); set.pl = Number(el.dataset.v); render(); },
    '[data-rate]': (el) => {
      readNote();
      set.rate = set.rate === el.dataset.rate ? undefined : el.dataset.rate;
      if (!set.rate) delete set.rate;
      render();
      if (!isNew) updateSet(set);
    },
    '#r-ref': () => {
      readNote();
      const id = `set-${set.id}`;
      if (isNew) wantRef = !wantRef;
      else if (state.refs.some((r) => r.id === id)) { deleteRef(id); toast('Quitada de tus referencias.'); }
      else { const ref = refFromSet(set); if (ref) { addRef(ref); toast('Guardada como tu referencia.'); } }
      render();
    },
    '#r-save': async () => {
      if (saving) return;
      saving = true;
      readNote();
      const ok = isNew ? await addSet(set, { blob, frames }) : await updateSet(set);
      if (!ok) toast('No hay espacio en el móvil para guardar todo. Libera espacio o borra series viejas.', 6000);
      if (isNew && wantRef) { const ref = refFromSet(set); if (ref) addRef(ref); }
      api.closeOverlay();
      if (isNew) onSaved?.();
    },
    '#r-replay': () => api.openReplay(set.id),
    '#r-del': () => {
      if (isNew) return api.closeOverlay();
      confirmSheet({
        title: '¿Eliminar esta serie?', text: 'Se borra también su vídeo. No se puede deshacer.',
        onDone: () => { deleteSet(set.id); api.closeOverlay(); toast('Serie eliminada.'); },
      });
    },
  });
  return offClick;
}

const BAR = { range: 'Rango', tempo: 'Ritmo', consistency: 'Constancia', technique: 'Técnica', steadiness: 'Firmeza' };

/** Big score ring, the grade and one bar per part. */
function scoreCard(sc, hold) {
  const total = sc.total, color = total >= 75 ? '#3FE0C5' : total >= 55 ? '#FFB347' : '#FF5A5A';
  const circ = 2 * Math.PI * 34;
  const bars = Object.entries(sc.parts).filter(([, v]) => v != null);
  const model = sc.tSrc?.model;
  return `<div class="glass">
    <div class="row">
      <div class="ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>
        <circle cx="42" cy="42" r="34" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - total / 100)).toFixed(1)}"/></svg><span>${total}</span></div>
      <div class="grow"><div class="eyebrow">Puntuación de la ejecución</div><div class="big" style="font-size:22px;color:${color}">${esc(sc.grade)}</div>
        <div class="muted tiny">${hold ? 'Qué tan firme quedó la muñeca.' : 'Rango, ritmo, constancia y técnica (0 a 100).'}</div></div>
    </div>
    <div style="margin-top:12px">${bars.map(([k, v]) => `<div class="row" style="margin-top:6px"><div class="small" style="width:84px">${BAR[k]}</div>
      <div class="grow bar-track"><div class="bar-fill" style="width:${v}%;background:${v >= 75 ? 'var(--teal)' : v >= 55 ? 'var(--warn)' : 'var(--danger)'}"></div></div><div class="small bold" style="width:34px;text-align:right">${v}</div></div>`).join('')}</div>
    ${!hold && sc.tSrc ? `<div class="muted tiny" style="margin-top:10px">Objetivo de rango: ${esc(sc.tSrc.range ?? '')}${sc.tSrc.shape ? ` · forma: ${esc(sc.tSrc.shape)}` : ''}${model ? ` · técnica evaluada también con tu modelo entrenado (${model} repeticiones)` : ''}.</div>` : ''}
    ${!hold && sc.perRep?.length ? `<div class="bold small" style="margin:14px 0 8px">Puntuación por repetición</div>${repBars(sc.perRep, { target: 75, unit: '', height: 90 })}` : ''}
  </div>`;
}
