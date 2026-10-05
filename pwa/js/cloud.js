// Login, group and shared stats on Supabase. Optional: without a configured project the app
// works fully offline. Only per-set summaries are shared with the group, never the video.
import { setAvgRange, setAvgTempo } from './analysis.js';

const cfg = window.FULCRO_CONFIG ?? {};
let client = null;
let session = null;
export let group = null; // { id, name, code }
export let loadingGroup = false;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

export const configured = () => Boolean(cfg.supabaseUrl && cfg.supabaseKey);
export const subscribeCloud = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const signedIn = () => Boolean(session?.user);
export const displayName = () => session?.user?.user_metadata?.name || session?.user?.email || '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.append(s);
  });
}

export async function init() {
  if (!configured()) return;
  try {
    await loadScript('vendor/supabase.js');
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const { data } = await client.auth.getSession();
    session = data.session;
    client.auth.onAuthStateChange((_e, s) => {
      session = s;
      group = null;
      emit();
      refreshGroup();
    });
    if (session) refreshGroup();
    emit();
  } catch (e) {
    console.warn('Fulcro: no se pudo iniciar la nube', e);
  }
}

const spanish = (m = '') => {
  const s = m.toLowerCase();
  if (s.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (s.includes('already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (s.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (s.includes('email not confirmed')) return 'Confirma tu correo con el enlace que te enviamos.';
  return m;
};
const offline = 'No hay conexión con el servidor. Revisa tu internet.';

export async function signIn(email, password) {
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return error ? spanish(error.message) : null;
  } catch { return offline; }
}
/** Returns an error message or null. When the project requires email confirmation, signedIn() stays false. */
export async function signUp(email, password, name) {
  try {
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return spanish(error.message);
    if (data.session) session = data.session;
    return null;
  } catch { return offline; }
}
export async function signOut() {
  try { await client.auth.signOut(); } catch { /* ignore */ }
}

export async function refreshGroup() {
  if (!client || !signedIn()) return;
  loadingGroup = true;
  emit();
  try {
    const { data, error } = await client.rpc('my_group');
    if (error) throw error;
    group = data?.length ? { id: data[0].id, name: data[0].name, code: data[0].code } : null;
  } catch (e) {
    console.warn('Fulcro: no se pudo leer el grupo', e);
  }
  loadingGroup = false;
  emit();
}

async function rpcAction(fn, args) {
  try {
    const { error } = await client.rpc(fn, args);
    if (error) return error.message;
    await refreshGroup();
    return null;
  } catch { return offline; }
}
export const createGroup = (name) => rpcAction('create_group', { p_name: name.trim() });
export const joinGroup = (code) => rpcAction('join_group', { p_code: code.trim().toUpperCase() });
export const leaveGroup = () => rpcAction('leave_group', {});

/** Uploads one set summary. Failures are silent: the set is already saved on the phone. */
export async function pushSet(set) {
  if (!client || !signedIn()) return;
  try {
    await client.from('sets').upsert({
      id: set.id,
      user_id: session.user.id,
      exercise: set.ex,
      arm: set.arm,
      weight_kg: set.kg,
      started_at: new Date(set.at).toISOString(),
      reps: set.reps.length,
      avg_range: setAvgRange(set),
      avg_tempo_ms: setAvgTempo(set),
      fatigue_rep: set.fat ?? null,
      pain_zone: set.pz ?? null,
      pain_level: set.pl ?? 0,
    });
  } catch (e) {
    console.warn('Fulcro: no se pudo subir la serie', e);
  }
}

export async function activity() {
  const { data, error } = await client.rpc('group_activity');
  if (error) throw error;
  return data.map((r) => ({
    userId: r.user_id, name: r.name || 'Atleta', daysWeek: r.days_week, setsWeek: r.sets_week,
    avgRangeWeek: r.avg_range_week ?? 0, lastExercise: r.last_exercise, lastAt: r.last_at ? new Date(r.last_at) : null,
  }));
}
export async function exerciseStats(exId) {
  const { data, error } = await client.rpc('group_exercise_stats', { p_exercise: exId });
  if (error) throw error;
  return data.map((r) => ({
    userId: r.user_id, name: r.name || 'Atleta', sets: r.sets, avgRange: r.avg_range ?? 0,
    avgTempoMs: r.avg_tempo_ms ?? 0, bestKg: r.best_kg ?? 0,
  }));
}
