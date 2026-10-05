// Personalised weekly plans: choose sparring / days / cycle week, preview the week, check it against the
// guidelines (frequency, intensity, tendon recovery) and apply it. Each day can be edited by hand.
import { state, subscribe, updatePlan, clearPlan, setOneRm } from '../state.js';
import { exercises, exerciseById, freqText, freqMax, intensityText } from '../exercises.js';
import { weeklyDaysFor, setsInWeek } from '../analysis.js';
import { openResetWeek } from './manage.js';
import {
  generatePlan, checkPlan, allowedDays, CYCLE, dayName, prescriptionText, pctText, itemKg, weakArms, planToStored,
  setSessionExercises, GROUP_LABEL, GROUP,
} from '../plans.js';
import { esc, eyebrow, pill, seg, on, toast } from '../ui.js';

const pad = (n) => String(n).padStart(2, '0');
const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const kgStr = (v) => `${Math.round(v * 10) / 10}`;

// What the user is looking at. It starts from the active plan, if there is one.
let params = null;
let dirty = false; // true while the shown plan is a preview that has not been applied yet

function initParams() {
  if (params) return;
  const p = state.plan.program;
  params = p ? { sparring: p.sparring, days: p.days, week: p.week } : { sparring: true, days: 5, week: 1 };
  dirty = !p;
}

/** Weekly recurring calendar events with an alarm, so the phone's calendar does the reminding. */
function buildIcs(plan) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fulcro//Plan semanal//ES', 'CALSCALE:GREGORIAN'];
  for (const [wd, ids] of Object.entries(plan.days)) {
    const d = new Date();
    d.setDate(d.getDate() + ((Number(wd) % 7) - d.getDay() + 7) % 7); // JS getDay: 0 = Sunday
    const local = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(plan.hour)}${pad(plan.minute)}00`;
    const title = plan.sessions?.[wd]?.title ?? 'Entrenamiento';
    const list = ids.map((id) => exerciseById(id).name).join(', ');
    lines.push('BEGIN:VEVENT', `UID:fulcro-${wd}@fulcro`, `DTSTAMP:${stamp}`, `DTSTART:${local}`, 'DURATION:PT1H',
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[Number(wd) - 1]}`, `SUMMARY:Fulcro: ${title}`,
      `DESCRIPTION:${list}. Nunca al fallo.`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hoy toca entrenar', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function mount(root) {
  initParams();

  const render = () => {
    const plan = state.plan;
    const hasProgram = Boolean(plan.program);
    const weak = weakArms(state.sets);
    const preview = generatePlan({ ...params, weakArms: weak });
    const showActive = hasProgram && !dirty;
    const sessions = showActive ? plan.sessions : preview.sessions;
    const sparring = showActive ? plan.sparring : params.sparring;
    const week = showActive ? plan.program.week : params.week;
    const checks = checkPlan(sessions, { sparring });
    const warns = checks.filter((c) => c.level === 'warn');
    const today = ((new Date().getDay() + 6) % 7) + 1;

    const itemLine = (it) => {
      const e = exerciseById(it.ex), kg = itemKg(it, state.oneRm[it.ex]);
      return `<div style="padding:5px 0;border-top:1px solid var(--edge)"><div class="row"><div class="grow small bold">${esc(e.name)}${it.light ? ' <span class="muted tiny">(ligero)</span>' : ''}</div>
        <div class="small" style="text-align:right">${esc(prescriptionText(it))}</div></div>
        <div class="muted tiny">${esc(pctText(it))} del 1RM${kg ? ` · <b style="color:var(--text)">${kg.low === kg.high ? kgStr(kg.low) : `${kgStr(kg.low)}-${kgStr(kg.high)}`} kg</b>` : ''} · descanso ${it.rest} s${it.extraArm ? ` · <span style="color:var(--amber)">+1 serie brazo ${it.extraArm === 'left' ? 'izquierdo' : 'derecho'} (más débil)</span>` : ''}</div></div>`;
    };
    const dayCard = (wd) => {
      const s = sessions[wd];
      const kindPill = s.kind === 'sparring' ? pill('Sparring', 'warn') : s.kind === 'recovery' ? '' : s.kind === 'rest' ? pill('Descanso', 'mute') : '';
      return `<div class="glass ${wd === today ? 'good' : ''}" style="padding:12px 14px">
        <div class="row"><div class="grow"><span class="bold" style="${wd === today ? 'color:var(--teal)' : ''}">${dayName(wd)}</span> <span class="muted small">· ${esc(s.title ?? '')}</span></div>${kindPill}
          ${showActive && s.kind !== 'sparring' ? `<button class="btn ghost small" data-edit="${wd}">Editar</button>` : ''}</div>
        ${s.items.map(itemLine).join('')}
        <div class="muted tiny" style="margin-top:6px">${esc(s.note ?? '')}</div></div>`;
    };

    const planned = {};
    for (const s of Object.values(sessions)) for (const it of s.items) planned[it.ex] = (planned[it.ex] ?? 0) + 1;
    const haveRm = exercises.some((e) => state.oneRm[e.id] > 0);

    root.innerHTML = `<div class="col">
      <div>${eyebrow('Organiza tu semana')}<div class="title">Plan</div></div>
      <div class="glass stack">
        <div class="bold" style="font-size:16px">Plan personalizado</div>
        <div class="muted tiny">Cumple la guía de frecuencia e intensidad y deja descansar los tendones. Los domingos suele haber sparring.</div>
        ${seg('psp', [['1', 'Con sparring (domingo)'], ['0', 'Sin sparring']], params.sparring ? '1' : '0')}
        <div class="row"><span class="muted small" style="width:96px">Días de gimnasio</span><div class="grow">${seg('pdays', allowedDays(params.sparring).map((d) => [d, `${d}`]), params.days)}</div></div>
        <div class="row"><span class="muted small" style="width:96px">Semana del ciclo</span><div class="grow">${seg('pweek', CYCLE.map((c, i) => [i + 1, c === 'Descarga' ? 'Descarga' : `S${i + 1}`]), params.week)}</div></div>
        <div class="row"><div class="grow muted tiny">${haveRm ? 'Con tus 1RM ves los kg de cada serie.' : 'Define tu 1RM para ver los kg de cada serie.'}</div><button class="btn ghost small" id="plan-rm">Mis 1RM</button></div>
        ${showActive
          ? `<div class="row">${pill('Plan activo', 'good')}<span class="grow muted tiny">${esc(plan.program.name)} · ${plan.program.days} días · ${esc(CYCLE[plan.program.week - 1])}</span><button class="link" id="plan-clear">Quitar plan</button></div>`
          : `<button class="btn" id="plan-apply">Usar este plan</button>`}
        ${Object.keys(weak).length ? `<div class="tiny" style="color:var(--amber)">Según tus últimos 30 días, ${Object.entries(weak).map(([id, a]) => `${exerciseById(id).name}: brazo ${a === 'left' ? 'izquierdo' : 'derecho'}`).join(', ')}. Ese brazo tiene una serie extra.</div>` : ''}
      </div>
      ${week === 4 ? '<div class="glass good"><div class="bold">Semana de descarga</div><div class="muted small">Menos series para que los tendones se recuperen. Mantén la técnica y no busques récords.</div></div>' : ''}
      ${!showActive ? '<div class="muted tiny center">Vista previa: aún no es tu plan.</div>' : ''}
      ${[1, 2, 3, 4, 5, 6, 7].map(dayCard).join('')}
      <div class="glass">
        <div class="row"><div class="grow bold">Cumple la guía</div>${pill(warns.length ? `${warns.length} ${warns.length === 1 ? 'aviso' : 'avisos'}` : 'Todo en orden', warns.length ? 'warn' : 'good')}</div>
        <div style="margin-top:8px">${checks.map((c) => `<div class="small" style="padding:3px 0;color:${c.level === 'warn' ? 'var(--warn)' : c.level === 'good' ? 'var(--teal)' : 'var(--muted)'}">${c.level === 'warn' ? '⚠' : c.level === 'good' ? '✓' : '·'} ${esc(c.text)}</div>`).join('')}</div>
        <p class="muted tiny" style="margin-top:10px">Series, repeticiones, descansos y el ciclo de 4 semanas son sugerencias generales. La frecuencia máxima y el porcentaje del 1RM vienen de un entrenador. Termina siempre con 2 repeticiones en reserva: nunca al fallo.</p>
      </div>
      <div class="glass">
        <div class="bold">Guía básica de frecuencia</div>
        <p class="muted tiny" style="margin:4px 0 10px">Recomendaciones generales de un entrenador. No sustituyen a un entrenador ni a un médico.</p>
        ${exercises.map((e) => {
          const done = weeklyDaysFor(state.sets, e.id, new Date()), max = freqMax(e, sparring);
          return `<div class="row" style="padding:6px 0;border-top:1px solid var(--edge)"><div class="grow"><div class="small bold">${esc(e.name)}</div>
            <div class="muted tiny">${esc(freqText(e, sparring))} · ${esc(intensityText(e))} · ${esc(GROUP_LABEL[GROUP[e.id]])}</div></div>
            <span class="pill ${done > max ? 'warn' : done === max ? 'good' : ''}">${done}${max < 7 ? `/${max}` : ''}</span></div>`;
        }).join('')}
        <p class="tiny" style="margin-top:10px;color:var(--teal)">Intensidad: trabaja con el 60% de tu 1RM (side pressure, 30-40%). Nunca vayas al máximo ni al fallo: ahí aparece la tendinitis.</p>
      </div>
      <div class="glass row"><div class="grow"><div class="bold">Esta semana</div>
        <div class="muted tiny">${(() => { const n = setsInWeek(state.sets, new Date()).length; return n ? `${n} ${n === 1 ? 'serie guardada' : 'series guardadas'}. Si las grabaciones no quedaron bien, puedes empezar de cero.` : 'Todavía no hay series guardadas esta semana.'; })()}</div></div>
        <button class="btn ghost small" id="plan-reset" ${setsInWeek(state.sets, new Date()).length ? '' : 'disabled'}>Reiniciar semana</button></div>
      <div class="glass">
        <div class="bold">Recordatorios</div>
        <p class="muted small" style="margin:4px 0 12px">Una app web no puede avisarte con la app cerrada. Descarga el plan como evento semanal y tu calendario te avisará 10 minutos antes.</p>
        <div class="row" style="margin-bottom:12px"><div class="grow muted small">Hora del entrenamiento</div>
          <input type="time" id="plan-time" value="${pad(plan.hour)}:${pad(plan.minute)}" style="width:auto;font-family:var(--display)"/></div>
        <button class="btn ghost" id="plan-ics" ${Object.keys(plan.days).length ? '' : 'disabled'}>Añadir al calendario</button>
        ${Object.keys(plan.days).length ? '' : '<p class="muted tiny" style="margin-top:8px">Usa un plan para crear el evento.</p>'}
      </div>
    </div>`;
  };

  // ---- sheets -----------------------------------------------------------------------------------
  function openSheet(html, onClick) {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = `<div class="sheet">${html}</div>`;
    back.addEventListener('click', (ev) => {
      if (ev.target === back) return back.remove();
      onClick?.(ev, () => back.remove(), back);
    });
    document.body.append(back);
    return back;
  }

  function openRm() {
    openSheet(`<div class="title" style="margin-bottom:4px">Mis 1RM</div>
      <p class="muted small" style="margin-bottom:12px">El máximo peso con el que haces una sola repetición, en kg. Sirve para calcular el 60% (30-40% en side pressure). No hace falta probarlo al máximo: usa una estimación honesta.</p>
      <div class="stack">${exercises.map((e) => `<div class="row"><label class="grow small" for="rm-${e.id}">${esc(e.name)}</label>
        <input type="number" id="rm-${e.id}" inputmode="decimal" min="0" max="500" step="0.5" placeholder="kg" value="${state.oneRm[e.id] ?? ''}" style="width:96px"></div>`).join('')}</div>
      <button class="btn" id="rm-save" style="margin-top:14px">Guardar</button>`, (ev, close, back) => {
      if (ev.target.closest('#rm-save')) {
        for (const e of exercises) setOneRm(e.id, back.querySelector(`#rm-${e.id}`).value);
        close();
      }
    });
  }

  function openEdit(wd) {
    const s = state.plan.sessions[wd];
    const cur = new Set(s.items.map((i) => i.ex));
    openSheet(`<div class="title" style="margin-bottom:4px">${dayName(wd)}</div>
      <p class="muted small" style="margin-bottom:12px">Elige los ejercicios del día. Más de 3 o dos días seguidos con el mismo tendón darán un aviso.</p>
      <div class="stack">${exercises.map((e) => `<label class="glass row" style="padding:10px 14px;cursor:pointer">
        <input type="checkbox" class="switch" data-ex="${e.id}" ${cur.has(e.id) ? 'checked' : ''}>
        <div class="grow"><div class="bold small">${esc(e.name)}</div><div class="muted tiny">${esc(freqText(e, state.plan.sparring))}</div></div></label>`).join('')}</div>
      <button class="btn" id="ed-save" style="margin-top:14px">Guardar día</button>`, (ev, close, back) => {
      if (ev.target.closest('#ed-save')) {
        const ids = [...back.querySelectorAll('[data-ex]')].filter((c) => c.checked).map((c) => c.dataset.ex);
        const sessions = { ...state.plan.sessions, [wd]: setSessionExercises(s, ids, { week: state.plan.program?.week ?? 1, wd, sparring: state.plan.sparring }) };
        updatePlan({ sessions });
        close();
      }
    });
  }

  render();
  const off = subscribe(render);
  const offClick = on(root, {
    '[data-seg="psp"]': (el) => {
      params = { ...params, sparring: el.dataset.v === '1' };
      if (!allowedDays(params.sparring).includes(params.days)) params.days = Math.max(...allowedDays(params.sparring));
      dirty = true; render();
    },
    '[data-seg="pdays"]': (el) => { params = { ...params, days: Number(el.dataset.v) }; dirty = true; render(); },
    '[data-seg="pweek"]': (el) => { params = { ...params, week: Number(el.dataset.v) }; dirty = true; render(); },
    '#plan-rm': openRm,
    '#plan-reset': () => openResetWeek(),
    '[data-edit]': (el) => openEdit(Number(el.dataset.edit)),
    '#plan-apply': () => {
      const generated = generatePlan({ ...params, weakArms: weakArms(state.sets) });
      updatePlan(planToStored(generated, { hour: state.plan.hour, minute: state.plan.minute }));
      dirty = false;
      toast('Plan activo. Hoy verás tu sesión en Inicio.');
      render();
    },
    '#plan-clear': () => { clearPlan(); dirty = true; render(); },
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
    if (e.target.id === 'plan-time' && e.target.value) {
      const [h, m] = e.target.value.split(':').map(Number);
      updatePlan({ hour: h, minute: m });
    }
  };
  root.addEventListener('change', onChange);
  return () => { off(); offClick(); root.removeEventListener('change', onChange); };
}
