import { exercises, exerciseById, isHold } from '../exercises.js';
import { formatDay } from '../analysis.js';
import { esc, eyebrow, pill, chips, seg, on, toast } from '../ui.js';
import * as cloud from '../cloud.js';

let register = false;
let compare = false;
let exId = exercises[0].id;

export function mount(root) {
  let message = null;
  let busy = false;
  let activityHtml = null; // cached HTML so re-rendering does not flash
  let statsHtml = null;

  const plans = `
    <div class="bold" style="margin-top:8px">Planes</div>
    <div class="glass good row"><div class="grow"><div class="bold">Grupo</div><div class="muted small">Hasta 10 atletas. Análisis ilimitado.</div></div>${pill('Actual', 'good')}</div>
    <div class="glass row"><div class="grow"><div class="bold">Pro</div><div class="muted small">Comparación con referencias y plan adaptativo.</div></div><span class="tiny" style="color:var(--amber)">Próximamente</span></div>`;

  const notConfigured = `<div class="glass"><div class="bold">Grupo sin conectar</div>
    <p class="muted small" style="margin-top:6px">Esta versión no tiene servidor configurado, así que todo se guarda solo en tu móvil. Para compartir progreso con tu grupo hay que conectar Supabase (ver README, sección Grupo).</p></div>`;

  const authForm = () => `<div class="glass stack">
    <div class="bold" style="font-size:16px">${register ? 'Crear cuenta' : 'Iniciar sesión'}</div>
    <div class="muted tiny">Solo se comparten los resúmenes de tus series con tu grupo. El vídeo se queda en tu móvil.</div>
    ${register ? '<input type="text" id="t-name" placeholder="Tu nombre" autocomplete="name">' : ''}
    <input type="email" id="t-email" placeholder="Correo" autocomplete="email">
    <input type="password" id="t-pass" placeholder="Contraseña (mínimo 6 caracteres)" autocomplete="${register ? 'new-password' : 'current-password'}">
    ${message ? `<div class="small" style="color:var(--warn)">${esc(message)}</div>` : ''}
    <button class="btn" id="t-auth" ${busy ? 'disabled' : ''}>${busy ? 'Un momento...' : register ? 'Crear cuenta' : 'Entrar'}</button>
    <button class="link" id="t-toggle">${register ? 'Ya tengo cuenta' : 'No tengo cuenta'}</button></div>`;

  const noGroup = () => `<div class="stack">
    <div class="glass stack"><div class="bold">Únete con un código</div>
      <input type="text" id="t-code" placeholder="Código de 6 letras" autocapitalize="characters" maxlength="6">
      <button class="btn" id="t-join" ${busy ? 'disabled' : ''}>Unirme</button></div>
    <div class="glass stack"><div class="bold">O crea tu grupo</div>
      <input type="text" id="t-gname" placeholder="Nombre del grupo">
      <button class="btn ghost" id="t-create" ${busy ? 'disabled' : ''}>Crear grupo</button></div>
    ${message ? `<div class="small" style="color:var(--warn)">${esc(message)}</div>` : ''}
    <button class="link" id="t-out">Cerrar sesión (${esc(cloud.displayName())})</button></div>`;

  const groupView = () => `<div class="stack">
    <div class="glass row"><div class="grow muted small">Código para invitar</div><div class="big" style="font-size:20px">${esc(cloud.group.code)}</div></div>
    ${seg('tcmp', [['0', 'Esta semana'], ['1', 'Comparar']], compare ? '1' : '0')}
    <div id="t-body">${compare ? (statsHtml ?? '<div class="muted center">Cargando...</div>') : (activityHtml ?? '<div class="muted center">Cargando...</div>')}</div>
    <div class="row"><button class="link" id="t-refresh">Actualizar</button><span class="grow"></span><button class="link" id="t-leave">Salir del grupo</button></div>
    <button class="link" id="t-out">Cerrar sesión (${esc(cloud.displayName())})</button></div>`;

  async function loadBody() {
    if (!cloud.group) return;
    try {
      if (!compare) {
        const list = await cloud.activity();
        activityHtml = `<div class="glass flat">${list.map((m, i) => `
          <div class="row" style="padding:12px 14px;${i ? 'border-top:1px solid var(--edge)' : ''}">
            <div class="day done" style="margin:0;font-size:14px">${esc((m.name[0] || '?').toUpperCase())}</div>
            <div class="grow"><div class="bold">${esc(m.name)}</div>
              <div class="muted tiny">${m.lastAt ? `${esc(exerciseById(m.lastExercise ?? '').name)} · ${formatDay(m.lastAt)}` : 'Sin series todavía'}</div></div>
            <div style="text-align:right"><div class="bold">${m.daysWeek} días</div><div class="muted tiny">${m.setsWeek} series</div></div></div>`).join('')}</div>`;
      } else {
        const list = await cloud.exerciseStats(exId);
        const hold = isHold(exerciseById(exId));
        const value = (m) => (hold ? m.avgTempoMs / 1000 : m.avgRange); // hold sets upload their time under tension
        const top = Math.max(0, ...list.map(value));
        statsHtml = `${chips('texid', exercises.map((e) => [e.id, e.name]), exId)}
          <div class="glass" style="margin-top:12px"><div class="bold" style="margin-bottom:12px">${hold ? 'Tiempo bajo tensión medio' : 'Rango medio'} · últimos 30 días</div>
          ${list.map((m) => `<div class="row" style="margin-bottom:8px"><div style="width:76px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</div>
            <div class="grow bar-track"><div class="bar-fill" style="width:${top ? (value(m) / top) * 100 : 0}%"></div></div>
            <div class="muted tiny" style="width:96px;text-align:right">${m.sets === 0 ? 'sin datos' : `${Math.round(value(m))}${hold ? ' s' : '°'} · ${m.bestKg} kg`}</div></div>`).join('')}</div>`;
      }
    } catch {
      const err = '<div class="glass muted small">No se pudo cargar. Revisa tu internet y pulsa Actualizar.</div>';
      if (compare) statsHtml = err; else activityHtml = err;
    }
    const body = root.querySelector('#t-body');
    if (body) body.innerHTML = compare ? statsHtml : activityHtml;
  }

  const render = () => {
    let body;
    if (!cloud.configured()) body = notConfigured;
    else if (!cloud.signedIn()) body = authForm();
    else if (cloud.loadingGroup && !cloud.group) body = '<div class="center muted" style="padding:40px">Cargando...</div>';
    else if (!cloud.group) body = noGroup();
    else body = groupView();
    root.innerHTML = `<div class="col"><div>${eyebrow(cloud.group?.name ?? 'Grupo de entrenamiento')}<div class="title">Equipo</div></div>${body}${plans}</div>`;
    if (cloud.configured() && cloud.signedIn() && cloud.group && (compare ? !statsHtml : !activityHtml)) loadBody();
  };

  const run = async (fn) => {
    busy = true; message = null; render();
    message = await fn();
    busy = false; activityHtml = null; statsHtml = null; render();
  };
  const val = (id) => root.querySelector(id)?.value.trim() ?? '';

  render();
  const offCloud = cloud.subscribeCloud(() => { if (!busy) render(); });
  const offClick = on(root, {
    '#t-toggle': () => { register = !register; message = null; render(); },
    '#t-auth': () => run(async () => {
      const email = val('#t-email'), pass = root.querySelector('#t-pass').value;
      if (!email || !pass) return 'Escribe tu correo y contraseña.';
      if (register) {
        const name = val('#t-name');
        if (!name) return 'Escribe tu nombre.';
        const err = await cloud.signUp(email, pass, name);
        if (err) return err;
        return cloud.signedIn() ? null : 'Cuenta creada. Confirma tu correo con el enlace que te enviamos y luego inicia sesión.';
      }
      return cloud.signIn(email, pass);
    }),
    '#t-join': () => run(() => cloud.joinGroup(val('#t-code'))),
    '#t-create': () => run(async () => (val('#t-gname') ? cloud.createGroup(val('#t-gname')) : 'Escribe un nombre para el grupo.')),
    '#t-leave': () => run(() => cloud.leaveGroup()),
    '#t-out': () => cloud.signOut(),
    '#t-refresh': () => { activityHtml = null; statsHtml = null; render(); toast('Actualizando...', 1200); },
    '[data-seg="tcmp"]': (el) => { compare = el.dataset.v === '1'; render(); },
    '[data-chip="texid"]': (el) => { exId = el.dataset.v; statsHtml = null; render(); },
  });
  return () => { offCloud(); offClick(); };
}
