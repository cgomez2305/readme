import { state, subscribe, pickExercise, setsToday, todayPlanned } from '../state.js';
import { exerciseById } from '../exercises.js';
import {
  trainingDaysInWeek, weeklyStreak, rangeTrend, formatDay, formatTime, weekdayName, setAvgRange, setAvgTempo, fmtKg,
} from '../analysis.js';
import { esc, eyebrow, pill, on } from '../ui.js';
import { trendChart } from '../charts.js';
import { displayName } from '../cloud.js';
import { armLabel } from '../exercises.js';

export function mount(root, api) {
  const render = () => {
    const now = new Date();
    const planned = todayPlanned();
    const ex = planned ?? exerciseById(state.exerciseId);
    const days = trainingDaysInWeek(state.sets, now);
    const goal = state.plan.goal;
    const streak = weeklyStreak(state.sets, goal, now);
    const last = state.sets[0];
    const trend = rangeTrend(state.sets, ex.id);
    const name = displayName().split(' ')[0];
    const done = setsToday(ex.id);
    const pct = goal ? Math.min(1, days / goal) : 0;
    const circ = 2 * Math.PI * 34;
    const wd = (now.getDay() + 6) % 7;

    root.innerHTML = `<div class="col">
      <div class="row">
        <img src="icons/icon.svg" width="40" height="40" alt="" />
        <div class="grow">${eyebrow(`${weekdayName[wd]} · ${formatDay(now)}`)}<div class="title">${name ? `Hola, ${esc(name)}` : 'Hola, atleta'}</div></div>
      </div>
      <div class="glass">
        ${eyebrow(planned ? 'Sesión de hoy' : 'Sin sesión planificada hoy')}
        <div class="row" style="margin-top:6px">
          <div class="grow"><div class="bold" style="font-size:20px">${esc(ex.name)}</div><div class="muted small">${ex.defaultSets} series · ${esc(ex.focus)}</div></div>
          ${pill(`${done}/${ex.defaultSets}`, done >= ex.defaultSets ? 'good' : '')}
        </div>
        <div style="margin-top:14px"><button class="btn" data-analyze="${ex.id}">Grabar y analizar</button></div>
      </div>
      <div class="glass row">
        <div class="ring">
          <svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>
            <circle cx="42" cy="42" r="34" fill="none" stroke="${days >= goal ? '#3FE0C5' : '#FF8A4C'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct)).toFixed(1)}"/></svg>
          <span>${days}/${goal}</span>
        </div>
        <div class="grow">
          <div class="bold" style="font-size:16px">Meta semanal</div>
          <div class="muted small">${days >= goal
            ? `Meta cumplida. Racha de ${streak} ${streak === 1 ? 'semana' : 'semanas'}.`
            : `Te ${goal - days === 1 ? 'falta 1 día' : `faltan ${goal - days} días`} de entreno.${streak > 0 ? ` Racha de ${streak}.` : ''}`}</div>
          <button class="link" data-go="plan">Ajustar plan</button>
        </div>
      </div>
      ${last ? `
        <div class="glass">
          <div class="row"><div class="grow bold" style="font-size:16px">Última serie</div><span class="muted tiny">${formatDay(new Date(last.at))} · ${formatTime(new Date(last.at))}</span></div>
          <div class="muted small" style="margin:4px 0 12px">${esc(exerciseById(last.ex).name)} · brazo ${armLabel(last.arm).toLowerCase()}</div>
          <div class="grid4">
            ${[['Reps', last.reps.length], ['Rango', `${Math.round(setAvgRange(last))}°`], ['Tempo', `${(setAvgTempo(last) / 1000).toFixed(1)} s`], ['Fatiga', last.fat ? `Rep ${last.fat}` : 'No']]
              .map(([l, v]) => `<div><div class="muted tiny">${l}</div><div style="font-family:var(--display);font-weight:700;font-size:15px">${v}</div></div>`).join('')}
          </div>
        </div>
        ${trend.length > 1 ? `<div class="glass"><div class="bold" style="margin-bottom:10px">Rango en ${esc(ex.name.toLowerCase())}</div>${trendChart(trend)}</div>` : ''}`
      : `<div class="glass muted">Aquí verás tu progreso. Graba tu primera serie en Analizar y se guardará con su informe.</div>`}
    </div>`;
  };
  render();
  const off = subscribe(render);
  const offClick = on(root, {
    '[data-analyze]': (el) => { pickExercise(el.dataset.analyze); api.go('analizar'); },
    '[data-go]': (el) => api.go(el.dataset.go),
  });
  return () => { off(); offClick(); };
}
