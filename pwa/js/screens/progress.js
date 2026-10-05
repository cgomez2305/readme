import { state, subscribe } from '../state.js';
import { exercises, exerciseById, painZoneLabel, armLabel, isHold } from '../exercises.js';
import {
  weekStart, dayOf, trainingDaysInWeek, rangeTrend, holdTrend, scoreTrend, weightTrend, compareArms, painEvents, weekdayShort, formatDay,
  setAvgRange, fmtKg,
} from '../analysis.js';
import { esc, eyebrow, pill, chips, on } from '../ui.js';
import { trendChart } from '../charts.js';
import { openDaySheet, openDeleteSet, openResetWeek } from './manage.js';
import { setsInWeek } from '../analysis.js';

let exerciseId = null; // remembered while the app is open

export function mount(root, api) {
  const render = () => {
    const now = new Date();
    exerciseId ??= state.sets[0]?.ex ?? exercises[0].id;
    const ex = exerciseById(exerciseId);
    const exSets = state.sets.filter((s) => s.ex === ex.id);
    const hold = isHold(ex);
    const scores = scoreTrend(state.sets, ex.id);
    const unit = hold ? ' s' : '°';
    const trend = hold ? holdTrend(state.sets, ex.id) : rangeTrend(state.sets, ex.id);
    const weights = weightTrend(state.sets, ex.id);
    const cmp = compareArms(state.sets, ex.id, now, 30, hold);
    const pain = painEvents(state.sets).slice(0, 5);
    const start = weekStart(now);
    const trained = new Set(state.sets.filter((s) => new Date(s.at) >= start).map((s) => dayOf(new Date(s.at)).getTime()));
    const days = trainingDaysInWeek(state.sets, now);
    const goal = state.plan.goal;
    const todayMs = dayOf(now).getTime();
    const weekCount = setsInWeek(state.sets, now).length;

    const armBar = (label, v, max, sub) => `
      <div class="row" style="margin-top:8px"><div style="width:78px;font-size:13px">${label}</div>
      <div class="grow bar-track"><div class="bar-fill" style="width:${max ? (v / max) * 100 : 0}%"></div></div>
      <div style="width:50px;text-align:right;font-weight:700">${Math.round(v)}${unit}</div></div>`;
    const maxRange = Math.max(cmp.leftRange, cmp.rightRange);

    root.innerHTML = `<div class="col">
      <div>${eyebrow('Historial')}<div class="title">Progreso</div></div>
      <div class="glass">
        <div class="row"><div class="grow bold">Esta semana</div>${pill(`${days} de ${goal} días`, days >= goal ? 'good' : '')}</div>
        <div class="dayrow" style="margin-top:12px">
          ${weekdayShort.map((l, i) => {
            const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i).getTime();
            return `<div>${trained.has(t)
              ? `<button class="day done ${t === todayMs ? 'today' : ''}" data-day="${t}" aria-label="Ver o eliminar series del ${l}" style="cursor:pointer;border-width:2px;border-style:solid">✓</button>`
              : `<div class="day ${t === todayMs ? 'today' : ''}"></div>`}<div class="muted tiny">${l}</div></div>`;
          }).join('')}
        </div>
        <div class="row" style="margin-top:8px"><span class="grow muted tiny">Toca un día con ✓ para ver o eliminar sus series.</span>
          ${weekCount ? '<button class="btn ghost small" id="reset-week">Reiniciar semana</button>' : ''}</div>
      </div>
      ${chips('ex', exercises.map((e) => [e.id, e.name]), ex.id)}
      ${exSets.length === 0
        ? `<div class="glass muted">Todavía no hay series de ${esc(ex.name.toLowerCase())}. Grábalas en Analizar.</div>`
        : `<div class="glass"><div class="bold" style="margin-bottom:10px">${hold ? 'Tiempo bajo tensión por día' : `Rango medio por día (${ex.joint === 'elbow' ? 'codo' : 'muñeca'})`}</div>${trendChart(trend, { unit })}</div>
           ${scores.length > 1 ? `<div class="glass"><div class="bold" style="margin-bottom:10px">Puntuación de la ejecución por día</div>${trendChart(scores, { unit: '', color: '#FFC27A' })}</div>` : ''}
           ${weights.length > 1 && weights.some((w) => w.value > 0) ? `<div class="glass"><div class="bold" style="margin-bottom:10px">Peso máximo por día</div>${trendChart(weights, { unit: ' kg', color: '#FF8A4C' })}</div>` : ''}
           <div class="glass">
             <div class="bold">Brazo derecho vs. izquierdo</div><div class="muted small">Últimos 30 días</div>
             ${!cmp.hasBoth ? `<p class="muted small" style="margin-top:12px">Graba series con los dos brazos para compararlos.</p>` : `
               ${armBar('Derecho', cmp.rightRange, maxRange)}${armBar('Izquierdo', cmp.leftRange, maxRange)}
               <p class="small" style="margin-top:12px;color:${Math.abs(cmp.rangeGapPct) < 5 ? 'var(--teal)' : 'var(--warn)'}">${Math.abs(cmp.rangeGapPct) < 5
                 ? 'Rango equilibrado entre los dos brazos.'
                 : `El brazo ${cmp.rangeGapPct > 0 ? 'izquierdo' : 'derecho'} tiene ${Math.round(Math.abs(cmp.rangeGapPct))}% menos ${hold ? 'tiempo' : 'rango'}. Dale una serie extra, sin llegar al fallo.`}</p>
               ${hold ? '' : `<p class="muted tiny" style="margin-top:4px">Tempo medio: derecho ${(cmp.rightTempoMs / 1000).toFixed(1)} s · izquierdo ${(cmp.leftTempoMs / 1000).toFixed(1)} s</p>`}`}
           </div>`}
      ${pain.length ? `<div class="glass"><div class="bold">Dolor reportado</div>
        <div class="muted tiny" style="margin:4px 0 8px">Compara las fechas con el peso que usabas ese día.</div>
        ${pain.map((s) => `<div class="row small" style="padding:4px 0"><span style="width:8px;height:8px;border-radius:50%;background:${s.pl >= 3 ? 'var(--danger)' : 'var(--warn)'}"></span>
          <span class="grow">${formatDay(new Date(s.at))} · ${esc(painZoneLabel(s.pz))} (${['', 'leve', 'moderado', 'fuerte'][s.pl]})</span>
          <span class="muted tiny">${esc(exerciseById(s.ex).name)} · ${fmtKg(s.kg)} kg</span></div>`).join('')}</div>` : ''}
      <div class="bold" style="margin-top:8px">Series guardadas</div>
      ${state.sets.length === 0 ? `<div class="muted">Aún no hay series.</div>` : state.sets.slice(0, 30).map((s) => `
        <div class="glass list-item" data-open="${esc(s.id)}" role="button" tabindex="0">
          <div class="grow"><div class="bold">${esc(exerciseById(s.ex).name)}</div>
            <div class="muted tiny">${formatDay(new Date(s.at))} · brazo ${armLabel(s.arm).toLowerCase()} · ${fmtKg(s.kg)} kg</div></div>
          ${s.video ? '<span title="Con vídeo">🎞</span>' : ''}${s.pz ? '<span title="Con dolor">⚠</span>' : ''}
          <button class="icon-btn" data-delset="${esc(s.id)}" aria-label="Eliminar serie" style="width:34px;height:34px">🗑</button>
          ${s.sc ? `<span class="pill ${s.sc.total >= 75 ? 'good' : s.sc.total >= 55 ? 'warn' : 'bad'}">${s.sc.total}</span>` : ''}
          <div class="bold small">${isHold(exerciseById(s.ex)) ? `${Math.round(s.dur / 1000)} s` : `${s.reps.length} reps · ${Math.round(setAvgRange(s))}°`}</div>
        </div>`).join('')}
    </div>`;
  };
  render();
  const off = subscribe(render);
  const offClick = on(root, {
    '[data-chip="ex"]': (el) => { exerciseId = el.dataset.v; render(); },
    '[data-day]': (el) => openDaySheet(el.dataset.day),
    '#reset-week': () => openResetWeek(),
    '[data-delset]': (el) => openDeleteSet(el.dataset.delset),
    '[data-open]': (el) => {
      const set = state.sets.find((s) => s.id === el.dataset.open);
      if (set) api.openReport({ set, isNew: false });
    },
  });
  return () => { off(); offClick(); };
}
