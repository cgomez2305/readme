// Deleting recordings: one set, a whole day, or the whole week. Everything asks for confirmation first
// and also removes the stored video and, with a group connected, the shared summary.
import { state, deleteSets } from '../state.js';
import { exerciseById, armLabel, isHold } from '../exercises.js';
import { setsInDay, setsInWeek, weekStart, weekdayName, formatDay, formatTime, setAvgRange, fmtKg } from '../analysis.js';
import { esc, toast } from '../ui.js';

function sheet(html, onClick) {
  document.querySelector('.sheet-back.manage')?.remove();
  const back = document.createElement('div');
  back.className = 'sheet-back manage';
  back.innerHTML = `<div class="sheet">${html}</div>`;
  back.addEventListener('click', (ev) => {
    if (ev.target === back) return back.remove();
    onClick?.(ev, () => back.remove(), back);
  });
  document.body.append(back);
  return back;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const dayTitle = (d) => `${weekdayName[(d.getDay() + 6) % 7]} ${formatDay(d)}`;

/** Describes one set in a single line. */
export function setLine(s) {
  const ex = exerciseById(s.ex);
  const what = isHold(ex) ? `${Math.round(s.dur / 1000)} s` : `${s.reps.length} reps · ${Math.round(setAvgRange(s))}°`;
  return `${formatTime(new Date(s.at))} · ${ex.name} · brazo ${armLabel(s.arm).toLowerCase()} · ${fmtKg(s.kg)} kg · ${what}`;
}

/** Generic "are you sure?" sheet. */
export function confirmSheet({ title, text, confirmLabel = 'Eliminar', onDone }) {
  sheet(`<div class="title" style="margin-bottom:8px">${esc(title)}</div>
    <p class="muted small" style="margin-bottom:16px">${esc(text)}</p>
    <div class="grid2"><button class="btn ghost" id="cf-no">Cancelar</button><button class="btn" id="cf-yes" style="background:var(--danger);color:#fff;box-shadow:none">${esc(confirmLabel)}</button></div>`,
  async (ev, close) => {
    if (ev.target.closest('#cf-no')) close();
    if (ev.target.closest('#cf-yes')) { close(); await onDone?.(); }
  });
}

export function openDeleteSet(id) {
  const s = state.sets.find((x) => x.id === id);
  if (!s) return;
  confirmSheet({
    title: '¿Eliminar esta serie?',
    text: `${setLine(s)}. Se borra también su vídeo. No se puede deshacer.`,
    onDone: async () => { await deleteSets([id]); toast('Serie eliminada.'); },
  });
}

/** Sets of one day with a delete button each, and one to delete the whole day. */
export function openDaySheet(dayMs) {
  const day = new Date(Number(dayMs));
  const render = () => {
    const list = setsInDay(state.sets, day).sort((a, b) => new Date(a.at) - new Date(b.at));
    return `<div class="title" style="margin-bottom:4px">${esc(dayTitle(day))}</div>
      <p class="muted small" style="margin-bottom:12px">${list.length ? `${plural(list.length, 'serie guardada', 'series guardadas')}.` : 'No queda ninguna serie este día.'}</p>
      <div class="stack">${list.map((s) => `<div class="glass row" style="padding:10px 14px"><div class="grow small">${esc(setLine(s))}</div>
        <button class="btn ghost small" data-del="${esc(s.id)}">Eliminar</button></div>`).join('')}</div>
      ${list.length ? `<button class="btn ghost" id="dd-all" style="margin-top:14px;color:var(--danger)">Eliminar todo el día</button>` : ''}`;
  };
  sheet(render(), (ev, close, back) => {
    const del = ev.target.closest('[data-del]');
    if (del) {
      close();
      confirmSheet({
        title: '¿Eliminar esta serie?',
        text: 'Se borra también su vídeo. No se puede deshacer.',
        onDone: async () => { await deleteSets([del.dataset.del]); toast('Serie eliminada.'); if (setsInDay(state.sets, day).length) openDaySheet(dayMs); },
      });
    }
    if (ev.target.closest('#dd-all')) {
      const ids = setsInDay(state.sets, day).map((s) => s.id);
      close();
      confirmSheet({
        title: `¿Eliminar ${dayTitle(day)}?`,
        text: `Se borran ${plural(ids.length, 'serie', 'series')} de este día, con sus vídeos. No se puede deshacer.`,
        confirmLabel: 'Eliminar el día',
        onDone: async () => { await deleteSets(ids); toast('Día eliminado.'); },
      });
    }
    void back;
  });
}

/** Deletes every set of the current week so it can start again. */
export function openResetWeek(ref = new Date()) {
  const list = setsInWeek(state.sets, ref);
  if (!list.length) { toast('Esta semana todavía no tiene series.'); return; }
  const days = new Set(list.map((s) => new Date(s.at).toDateString())).size;
  confirmSheet({
    title: '¿Reiniciar la semana?',
    text: `Se borran ${plural(list.length, 'serie', 'series')} de ${plural(days, 'día', 'días')} (semana del ${formatDay(weekStart(ref))}), con sus vídeos. Tu plan y tus 1RM no cambian. No se puede deshacer.`,
    confirmLabel: 'Reiniciar semana',
    onDone: async () => { await deleteSets(list.map((s) => s.id)); toast('Semana reiniciada.'); },
  });
}
