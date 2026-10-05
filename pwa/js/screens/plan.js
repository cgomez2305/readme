import { state, subscribe, updatePlan } from '../state.js';
import { exercises, exerciseById } from '../exercises.js';
import { weekdayName } from '../analysis.js';
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
    root.innerHTML = `<div class="col">
      <div>${eyebrow('Organiza tu semana')}<div class="title">Plan</div></div>
      <div class="glass row">
        <div class="grow"><div class="bold">Meta semanal</div><div class="muted tiny">Días de entreno por semana</div></div>
        <button class="icon-btn" data-goal="-1" aria-label="Menos" ${plan.goal <= 1 ? 'disabled' : ''}>−</button>
        <div class="big" style="width:28px;text-align:center">${plan.goal}</div>
        <button class="icon-btn" data-goal="1" aria-label="Más" ${plan.goal >= 7 ? 'disabled' : ''}>+</button>
      </div>
      <div class="bold" style="margin-top:4px">Días y ejercicios</div>
      ${weekdayName.map((n, i) => `
        <div class="glass row" style="padding:6px 14px;border-radius:18px">
          <div style="width:92px;font-weight:600;color:${todayWd === i + 1 ? 'var(--teal)' : 'inherit'}">${n}</div>
          <select data-day="${i + 1}" aria-label="Ejercicio del ${n}" style="background:transparent">
            <option value="">Descanso</option>
            ${exercises.map((e) => `<option value="${e.id}" ${plan.days[i + 1] === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
          </select>
        </div>`).join('')}
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
    } else if (e.target.id === 'plan-time' && e.target.value) {
      const [h, m] = e.target.value.split(':').map(Number);
      state.plan = { ...state.plan, hour: h, minute: m };
      updatePlan({ hour: h, minute: m });
    }
  };
  root.addEventListener('change', onChange);
  return () => { off(); offClick(); root.removeEventListener('change', onChange); };
}
