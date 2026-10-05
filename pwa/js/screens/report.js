// Report of one series. A new series offers Save / Discard; a saved one allows editing notes
// and pain, watching the video and deleting.
import { state, addSet, updateSet, deleteSet } from '../state.js';
import { exerciseById, jointLabel, armLabel, painZones, isHold } from '../exercises.js';
import {
  summarize, summarizeHold, intensityTips, frequencyTips, weeklyDaysFor, repRange, repDuration, formatDay, formatTime, fmtKg,
} from '../analysis.js';
import { esc, eyebrow, metric, seg, on, icon, toast } from '../ui.js';
import { repBars } from '../charts.js';

export function mount(root, api, { set, isNew, frames = [], blob = null, onSaved }) {
  const ex = exerciseById(set.ex);
  let saving = false;

  const hold = isHold(ex);
  const render = () => {
    const s = hold ? { reps: 0, fatigueRep: null, tips: [] } : summarize(set.reps, ex);
    const h = hold ? summarizeHold(set.dur, set.sd) : null;
    // Guidelines: weight against the 1RM and weekly frequency, counted up to the day of this set.
    const days = weeklyDaysFor(isNew ? [...state.sets, set] : state.sets, ex.id, new Date(set.at));
    const tips = [...(h ? h.tips : s.tips), ...intensityTips(ex, set.kg, state.oneRm[ex.id]), ...frequencyTips(ex, days, state.plan.sparring)];
    const fatIdx = s.fatigueRep == null ? undefined : s.fatigueRep - 1;
    const tipIcon = { good: ['✓', 'var(--teal)'], warn: ['!', 'var(--warn)'], info: ['i', 'var(--muted)'] };
    const note = root.querySelector('#r-note')?.value ?? set.note;
    root.innerHTML = `<div class="col">
      <div class="row"><button class="icon-btn" id="r-back" aria-label="Volver">${icon('back')}</button>
        <div class="grow">${eyebrow(isNew ? 'Informe de la serie' : `${formatDay(new Date(set.at))} · ${formatTime(new Date(set.at))}`)}</div></div>
      <div><div class="title">${esc(ex.name)}</div>
        <div class="muted small" style="margin-top:4px">Brazo ${armLabel(set.arm).toLowerCase()} · ${fmtKg(set.kg)} kg · ${Math.round(set.dur / 1000)} s</div></div>
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
    '#r-save': async () => {
      if (saving) return;
      saving = true;
      readNote();
      const ok = isNew ? await addSet(set, { blob, frames }) : await updateSet(set);
      if (!ok) toast('No hay espacio en el móvil para guardar todo. Libera espacio o borra series viejas.', 6000);
      api.closeOverlay();
      if (isNew) onSaved?.();
    },
    '#r-replay': () => api.openReplay(set.id),
    '#r-del': async () => {
      if (!isNew) await deleteSet(set.id);
      api.closeOverlay();
    },
  });
  return offClick;
}
