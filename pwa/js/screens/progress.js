import { state, subscribe } from '../state.js';
import { exercises, exerciseById, painZoneLabel, armLabel, isHold } from '../exercises.js';
import {
  weekStart, dayOf, trainingDaysInWeek, rangeTrend, holdTrend, weightTrend, compareArms, painEvents, weekdayShort, formatDay,
  setAvgRange, fmtKg,
} from '../analysis.js';
import { esc, eyebrow, pill, chips, on } from '../ui.js';
import { trendChart } from '../charts.js';

let exerciseId = null; // remembered while the app is open

export function mount(root, api) {
  const render = () => {
    const now = new Date();
    exerciseId ??= state.sets[0]?.ex ?? exercises[0].id;
    const ex = exerciseById(exerciseId);
    const exSets = state.sets.filter((s) => s.ex === ex.id);
    const hold = isHold(ex);
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
            return `<div><div class="day ${trained.has(t) ? 'done' : ''} ${t === todayMs ? 'today' : ''}">${trained.has(t) ? '✓' : ''}</div><div class="muted tiny">${l}</div></div>`;
          }).join('')}
        </div>
      </div>
      ${chips('ex', exercises.map((e) => [e.id, e.name]), ex.id)}
      ${exSets.length === 0
        ? `<div class="glass muted">Todavía no hay series de ${esc(ex.name.toLowerCase())}. Grábalas en Analizar.</div>`
        : `<div class="glass"><div class="bold" style="margin-bottom:10px">${hold ? 'Tiempo bajo tensión por día' : `Rango medio por día (${ex.joint === 'elbow' ? 'codo' : 'muñeca'})`}</div>${trendChart(trend, { unit })}</div>
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
          <div class="bold small">${isHold(exerciseById(s.ex)) ? `${Math.round(s.dur / 1000)} s` : `${s.reps.length} reps · ${Math.round(setAvgRange(s))}°`}</div>
        </div>`).join('')}
    </div>`;
  };
  render();
  const off = subscribe(render);
  const offClick = on(root, {
    '[data-chip="ex"]': (el) => { exerciseId = el.dataset.v; render(); },
    '[data-open]': (el) => {
      const set = state.sets.find((s) => s.id === el.dataset.open);
      if (set) api.openReport({ set, isNew: false });
    },
  });
  return () => { off(); offClick(); };
}
