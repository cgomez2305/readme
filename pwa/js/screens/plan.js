import { state, subscribe, updatePlan } from '../state.js';
import { exercises, exerciseById, freqText, freqMax, intensityText } from '../exercises.js';
import { weekdayName, weeklyDaysFor } from '../analysis.js';
import { esc, eyebrow, on, toast } from '../ui.js';

const pad = (n) => String(n).padStart(2, '0');
const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Weekly recurring calendar events with an alarm, so the phone's calendar does the reminding. */
function buildIcs(plan) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fulcro//Plan semanal//ES', 'CALSCALE:GREGORIAN'];
  for (const [wd, exId] of Object.entries(plan.days)) {
    const d = new Date();
    const target = (Number(wd) % 7); // JS getDay: 0 = Sunday
    d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
    const local = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(plan.hour)}${pad(plan.minute)}00`;
    lines.push('BEGIN:VEVENT', `UID:fulcro-${wd}@fulcro`, `DTSTAMP:${stamp}`, `DTSTART:${local}`, 'DURATION:PT1H',
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[Number(wd) - 1]}`, `SUMMARY:Fulcro: ${exerciseById(exId).name}`,
      'DESCRIPTION:Graba tu serie en Fulcro.', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hoy toca entrenar', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function mount(root) {
  const render = () => {
    const plan = state.plan;
    const todayWd = ((new Date().getDay() + 6) % 7) + 1;
    // Planned days per exercise against the weekly guideline.
    const planned = {};
    for (const id of Object.values(plan.days)) planned[id] = (planned[id] ?? 0) + 1;
    const over = exercises.filter((e) => (planned[e.id] ?? 0) > freqMax(e, plan.sparring));
    root.innerHTML = `<div class="col">
      <div>${eyebrow('Organiza tu semana')}<div class="title">Plan</div></div>
      <div class="glass row">
        <div class="grow"><div class="bold">Meta semanal</div><div class="muted tiny">Días de entreno por semana</div></div>
        <button class="icon-btn" data-goal="-1" aria-label="Menos" ${plan.goal <= 1 ? 'disabled' : ''}>−</button>
        <div class="big" style="width:28px;text-align:center">${plan.goal}</div>
        <button class="icon-btn" data-goal="1" aria-label="Más" ${plan.goal >= 7 ? 'disabled' : ''}>+</button>
      </div>
      <div class="glass row"><div class="grow"><div class="bold">Esta semana hay sparring</div><div class="muted tiny">Side pressure baja a máx. 1 vez por semana</div></div>
        <input type="checkbox" class="switch" id="plan-sparring" ${plan.sparring ? 'checked' : ''} aria-label="Hay sparring esta semana"></div>
      <div class="bold" style="margin-top:4px">Días y ejercicios</div>
      ${weekdayName.map((n, i) => `
        <div class="glass row" style="padding:6px 14px;border-radius:18px">
          <div style="width:92px;font-weight:600;color:${todayWd === i + 1 ? 'var(--teal)' : 'inherit'}">${n}</div>
          <select data-day="${i + 1}" aria-label="Ejercicio del ${n}" style="background-color:transparent">
            <option value="">Descanso</option>
            ${exercises.map((e) => `<option value="${e.id}" ${plan.days[i + 1] === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
          </select>
        </div>`).join('')}
      ${over.length ? `<div class="glass accent"><div class="bold">Demasiados días para un mismo ejercicio</div>
        ${over.map((e) => `<div class="small" style="margin-top:6px;color:var(--warn)">${esc(e.name)}: ${planned[e.id]} días planificados y la guía es máx. ${freqMax(e, plan.sparring)}.</div>`).join('')}</div>` : ''}
      <div class="glass">
        <div class="bold">Guía básica de frecuencia</div>
        <p class="muted tiny" style="margin:4px 0 10px">Recomendaciones generales de un entrenador. No sustituyen a un entrenador ni a un médico.</p>
        ${exercises.map((e) => {
          const done = weeklyDaysFor(state.sets, e.id, new Date());
          return `<div class="row" style="padding:6px 0;border-top:1px solid var(--edge)"><div class="grow"><div class="small bold">${esc(e.name)}</div>
            <div class="muted tiny">${esc(freqText(e, plan.sparring))} · ${esc(intensityText(e))}</div></div>
            <span class="pill ${done > freqMax(e, plan.sparring) ? 'warn' : done === freqMax(e, plan.sparring) ? 'good' : ''}">${done}${freqMax(e, plan.sparring) < 7 ? `/${freqMax(e, plan.sparring)}` : ''}</span></div>`;
        }).join('')}
        <p class="tiny" style="margin-top:10px;color:var(--teal)">Intensidad: trabaja con el 60% de tu 1RM (side pressure, 30-40%). Nunca vayas al máximo ni al fallo: ahí aparece la tendinitis.</p>
      </div>
      <div class="glass">
        <div class="bold">Recordatorios</div>
        <p class="muted small" style="margin:4px 0 12px">Una app web no puede avisarte con la app cerrada. Descarga el plan como evento semanal y tu calendario te avisará 10 minutos antes.</p>
        <div class="row" style="margin-bottom:12px"><div class="grow muted small">Hora del entrenamiento</div>
          <input type="time" id="plan-time" value="${pad(plan.hour)}:${pad(plan.minute)}" style="width:auto;font-family:var(--display)"/></div>
        <button class="btn ghost" id="plan-ics" ${Object.keys(plan.days).length ? '' : 'disabled'}>Añadir al calendario</button>
        ${Object.keys(plan.days).length ? '' : '<p class="muted tiny" style="margin-top:8px">Elige al menos un día para crear el evento.</p>'}
      </div>
    </div>`;
  };
  render();
  const off = subscribe(render);
  const offClick = on(root, {
    '[data-goal]': (el) => updatePlan({ goal: Math.min(7, Math.max(1, state.plan.goal + Number(el.dataset.goal))) }),
    '#plan-ics': () => {
      const blob = new Blob([buildIcs(state.plan)], { type: 'text/calendar' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fulcro-plan.ics';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Abre el archivo descargado para añadirlo al calendario.');
    },
  });
  const onChange = (e) => {
    if (e.target.matches('[data-day]')) {
      const days = { ...state.plan.days };
      if (e.target.value) days[e.target.dataset.day] = e.target.value; else delete days[e.target.dataset.day];
      updatePlan({ days });
    } else if (e.target.id === 'plan-sparring') {
      updatePlan({ sparring: e.target.checked });
    } else if (e.target.id === 'plan-time' && e.target.value) {
      const [h, m] = e.target.value.split(':').map(Number);
      state.plan = { ...state.plan, hour: h, minute: m };
      updatePlan({ hour: h, minute: m });
    }
  };
  root.addEventListener('change', onChange);
  return () => { off(); offClick(); root.removeEventListener('change', onChange); };
}
