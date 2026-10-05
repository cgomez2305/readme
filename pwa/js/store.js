// Persistence. Small data (sets, plan, preferences) lives in localStorage; videos and pose
// frames live in IndexedDB because they are large. Every call tolerates storage being blocked.

const LS_SETS = 'fulcro.sets.v1';
const LS_PLAN = 'fulcro.plan.v1';
const LS_PREFS = 'fulcro.prefs.v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const defaultPlan = { goal: 3, days: {}, hour: 19, minute: 0 };

export const loadSets = () => {
  const list = readJson(LS_SETS, []);
  return Array.isArray(list) ? list.sort((a, b) => new Date(b.at) - new Date(a.at)) : [];
};
export const saveSets = (sets) => writeJson(LS_SETS, sets);
export const loadPlan = () => ({ ...defaultPlan, ...readJson(LS_PLAN, {}) });
export const savePlan = (plan) => writeJson(LS_PLAN, plan);
export const loadPrefs = () => readJson(LS_PREFS, {});
export const savePrefs = (prefs) => writeJson(LS_PREFS, prefs);

// ---- IndexedDB: videos and frames ----------------------------------------------------------
let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB no disponible'));
    const req = indexedDB.open('fulcro', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('videos');
      req.result.createObjectStore('frames');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(storeName, mode, fn) {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, mode);
      const result = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(result?.result ?? undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return undefined;
  }
}

export const putVideo = (id, blob) => idb('videos', 'readwrite', (s) => s.put(blob, id));
export const getVideo = (id) => idb('videos', 'readonly', (s) => s.get(id));
export const putFrames = (id, frames) => idb('frames', 'readwrite', (s) => s.put(frames, id));
export const getFrames = async (id) => (await idb('frames', 'readonly', (s) => s.get(id))) ?? [];
export async function deleteMedia(id) {
  await idb('videos', 'readwrite', (s) => s.delete(id));
  await idb('frames', 'readwrite', (s) => s.delete(id));
}
