// database.js — надёжное локальное хранилище «Царской казны» на IndexedDB.
// Принципы: каждое изменение — отдельная транзакция с подтверждением записи на диск,
// журнал незавершённых записей (WAL) в localStorage для восстановления после сбоя,
// версионные миграции, снимки состояния и резервные копии JSON с проверкой версии.

export const APP_ID = 'tsarskaya-kazna';
export const APP_VERSION = '1.0.0';
export const APP_BUILD = '2026-11-25';
export const DB_NAME = 'tsarskaya-kazna';
export const SCHEMA_VERSION = 1;      // версия структуры IndexedDB
export const BACKUP_FORMAT = 1;       // версия формата файла резервной копии

const STORE_DEFS = {
  operations: 'id', categories: 'id', recurring: 'id',
  quests: 'id', questRuns: 'id', xpLog: 'id', treasures: 'id', gameState: 'key',
  products: 'id', pantryCategories: 'id', stores: 'id', units: 'id',
  catalogUser: 'id', cart: 'id', purchases: 'id', stockLog: 'id',
  journal: 'id', insightLog: 'id', settings: 'key', meta: 'key', snapshots: 'id'
};
export const DATA_STORES = Object.keys(STORE_DEFS).filter(s => s !== 'snapshots');
const KEY_OF = STORE_DEFS;

// Миграции структуры. Ключ — номер версии, до которой выполняется миграция.
// Миграции только добавляют хранилища/поля и никогда не удаляют пользовательские данные.
const MIGRATIONS = {
  1(db) {
    for (const [name, keyPath] of Object.entries(STORE_DEFS)) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
    }
  }
};

// Миграции формата резервных копий (для импорта старых файлов).
const BACKUP_MIGRATIONS = {
  // 2: (data) => { ...; return data; }
};

let db = null;
let available = true;
export const cache = {};          // store -> Map(id -> record)
const arrays = {};                // store -> кэшированный массив
const listeners = new Map();      // store -> Set(fn)
const WAL_KEY = APP_ID + ':wal';
const SAVED_KEY = APP_ID + ':lastSaved';
let channel = null;
export const status = { lastSavedAt: 0, walReplayed: 0, walFailed: 0, error: null, opened: false };

export function uid(prefix = '') {
  const r = (globalThis.crypto && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 9)
    : Math.random().toString(36).slice(2, 11);
  return prefix + Date.now().toString(36) + r;
}

export function isAvailable() { return available; }

function reqP(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

function runTx(stores, fn, mode = 'readwrite') {
  return new Promise((resolve, reject) => {
    let tx, result;
    try { tx = db.transaction(stores, mode, { durability: 'strict' }); }
    catch (e) { try { tx = db.transaction(stores, mode); } catch (e2) { reject(e2); return; } }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));
    try { result = fn(tx); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); }
  });
}

// ---------- открытие и загрузка ----------
export async function open() {
  if (!('indexedDB' in globalThis)) { available = false; throw new Error('Браузер не поддерживает IndexedDB'); }
  db = await new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, SCHEMA_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = (e) => {
      const d = req.result;
      for (let v = (e.oldVersion || 0) + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v] && MIGRATIONS[v](d, req.transaction, e.oldVersion);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Не удалось открыть базу'));
    req.onblocked = () => console.warn('IndexedDB: открытие заблокировано другой вкладкой');
  }).catch(e => { available = false; status.error = String(e && e.message || e); throw e; });
  db.onversionchange = () => { try { db.close(); } catch (_) {} location.reload(); };
  status.opened = true;
  await replayWal();
  await loadAll();
  status.lastSavedAt = (cache.meta.get('lastSavedAt') || {}).value || Number(localStorage.getItem(SAVED_KEY)) || 0;
  try {
    channel = new BroadcastChannel(APP_ID);
    channel.onmessage = async (ev) => { if (ev.data && ev.data.type === 'changed') { await loadAll(ev.data.stores); emit(ev.data.stores, true); } };
  } catch (_) {}
}

async function loadAll(only) {
  const names = (only || DATA_STORES).filter(n => n !== 'snapshots' && KEY_OF[n]);
  await runTx(names, (tx) => {
    for (const n of names) {
      const r = tx.objectStore(n).getAll();
      r.onsuccess = () => { const m = new Map(); for (const rec of r.result) m.set(rec[KEY_OF[n]], rec); cache[n] = m; arrays[n] = null; };
    }
  }, 'readonly');
}

// ---------- чтение из кэша ----------
export function all(store) {
  if (!arrays[store]) arrays[store] = Array.from((cache[store] || new Map()).values());
  return arrays[store];
}
export function get(store, id) { return cache[store] ? cache[store].get(id) : undefined; }
export function count(store) { return cache[store] ? cache[store].size : 0; }
export function setting(key, def) { const r = get('settings', key); return r === undefined ? def : r.value; }
export function gstate(key, def) { const r = get('gameState', key); return r === undefined ? def : r.value; }

// ---------- подписки ----------
export function on(store, fn) {
  const list = Array.isArray(store) ? store : [store];
  for (const s of list) { if (!listeners.has(s)) listeners.set(s, new Set()); listeners.get(s).add(fn); }
  return () => list.forEach(s => listeners.get(s) && listeners.get(s).delete(fn));
}
function emit(stores, remote = false) {
  const called = new Set();
  for (const s of stores) {
    for (const fn of (listeners.get(s) || [])) if (!called.has(fn)) { called.add(fn); try { fn(s, remote); } catch (e) { console.error(e); } }
    for (const fn of (listeners.get('*') || [])) if (!called.has(fn)) { called.add(fn); try { fn(s, remote); } catch (e) { console.error(e); } }
  }
}

// ---------- журнал незавершённых записей ----------
function walRead() { try { return JSON.parse(localStorage.getItem(WAL_KEY) || '[]'); } catch (_) { return []; } }
function walWrite(list) { try { if (list.length) localStorage.setItem(WAL_KEY, JSON.stringify(list)); else localStorage.removeItem(WAL_KEY); } catch (_) {} }
function walAdd(entry) { try { const l = walRead(); l.push(entry); walWrite(l); return true; } catch (_) { return false; } }
function walRemove(id) { walWrite(walRead().filter(e => e.id !== id)); }

async function replayWal() {
  const list = walRead();
  if (!list.length) return;
  for (const entry of list.sort((a, b) => a.ts - b.ts)) {
    try { await applyOps(entry.ops); status.walReplayed++; }
    catch (e) { status.walFailed++; } // запись уже была применена (конфликт ключей) или повреждена
    walRemove(entry.id);
  }
}

function applyOps(ops) {
  const stores = [...new Set(ops.map(o => o.store).concat('meta'))];
  return runTx(stores, (tx) => {
    for (const o of ops) {
      const st = tx.objectStore(o.store);
      if (o.clear) st.clear();
      else if (o.del !== undefined) st.delete(o.del);
      else if (o.add) st.add(o.add);
      else if (o.put) st.put(o.put);
    }
    tx.objectStore('meta').put({ key: 'lastSavedAt', value: Date.now() });
  });
}

function applyToCache(ops) {
  for (const o of ops) {
    if (!cache[o.store]) cache[o.store] = new Map();
    const m = cache[o.store];
    if (o.clear) m.clear();
    else if (o.del !== undefined) m.delete(o.del);
    else { const v = o.add || o.put; m.set(v[KEY_OF[o.store]], v); }
    arrays[o.store] = null;
  }
}

/**
 * Атомарно применяет набор изменений. ops: [{store, put}|{store, add}|{store, del}|{store, clear:true}]
 * add — вставка только если ключа ещё нет (защита от дублей).
 */
export async function commit(ops) {
  ops = ops.filter(Boolean);
  if (!ops.length) return;
  if (!db) throw new Error('База данных не открыта');
  for (const o of ops) {
    const v = o.put || o.add;
    if (v && typeof v === 'object') { v.updatedAt = v.updatedAt && o.keepStamp ? v.updatedAt : Date.now(); }
  }
  const entry = { id: uid('w'), ts: Date.now(), ops: ops.map(o => { const c = { ...o }; delete c.keepStamp; return c; }) };
  const big = JSON.stringify(entry).length > 1_500_000;
  if (!big) walAdd(entry);
  let attempt = 0, lastErr;
  while (attempt < 2) {
    try {
      await applyOps(entry.ops);
      if (!big) walRemove(entry.id);
      applyToCache(entry.ops);
      status.lastSavedAt = Date.now();
      try { localStorage.setItem(SAVED_KEY, String(status.lastSavedAt)); } catch (_) {}
      const stores = [...new Set(entry.ops.map(o => o.store))];
      emit(stores);
      try { channel && channel.postMessage({ type: 'changed', stores }); } catch (_) {}
      return;
    } catch (e) {
      lastErr = e;
      if (e && (e.name === 'ConstraintError' || e.name === 'DataError')) break; // повтор бессмысленен
      attempt++;
      await new Promise(r => setTimeout(r, 250));
    }
  }
  if (!big) walRemove(entry.id);
  status.error = String(lastErr && lastErr.message || lastErr);
  throw lastErr;
}

export const put = (store, rec) => commit([{ store, put: rec }]);
export async function journal(kind, text, data) {
  try { await commit([{ store: 'journal', put: { id: uid('j'), ts: Date.now(), kind, text, data: data || null } }]); } catch (_) {}
}
export const del = (store, id) => commit([{ store, del: id }]);
export const putMany = (store, recs) => commit(recs.map(r => ({ store, put: r })));
export const setSetting = (key, value) => commit([{ store: 'settings', put: { key, value } }]);
export const setGState = (key, value) => commit([{ store: 'gameState', put: { key, value } }]);

// ---------- хранилище: устойчивость к очистке ----------
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (_) {}
  return false;
}
export async function storageInfo() {
  const info = { persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage) {
      if (navigator.storage.persisted) info.persisted = await navigator.storage.persisted();
      if (navigator.storage.estimate) { const e = await navigator.storage.estimate(); info.usage = e.usage; info.quota = e.quota; }
    }
  } catch (_) {}
  return info;
}

// ---------- резервные копии ----------
export function exportData() {
  const stores = {};
  for (const s of DATA_STORES) stores[s] = all(s).map(r => ({ ...r }));
  const counts = {};
  for (const s of DATA_STORES) counts[s] = stores[s].length;
  return { app: APP_ID, format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), counts, stores };
}

const STORE_TITLES = {
  operations: 'операций', categories: 'категорий финансов', recurring: 'регулярных платежей', quests: 'заданий и целей',
  questRuns: 'записей о выполнении', xpLog: 'начислений опыта', treasures: 'сокровищ', products: 'товаров в кладовой',
  pantryCategories: 'категорий кладовой', stores: 'магазинов', units: 'единиц измерения', catalogUser: 'правок каталога',
  cart: 'позиций корзины', purchases: 'покупок', stockLog: 'изменений запасов', journal: 'событий журнала',
  insightLog: 'показанных советов', settings: 'настроек', meta: 'служебных записей', gameState: 'игровых отметок'
};
export function storeTitle(s) { return STORE_TITLES[s] || s; }

/** Проверяет файл копии. Возвращает {ok, errors, warnings, counts, data(мигрированные)} */
export function validateBackup(obj) {
  const errors = [], warnings = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Файл не похож на резервную копию: не удалось прочитать JSON-объект.'], warnings };
  if (obj.app !== APP_ID) errors.push('Это не резервная копия «Царской казны» (нет подписи приложения).');
  if (typeof obj.format !== 'number') errors.push('В файле не указана версия формата резервной копии.');
  else if (obj.format > BACKUP_FORMAT) errors.push(`Копия создана более новой версией приложения (формат ${obj.format}, поддерживается до ${BACKUP_FORMAT}). Обновите приложение и повторите.`);
  if (!obj.stores || typeof obj.stores !== 'object') errors.push('В файле нет раздела с данными.');
  if (errors.length) return { ok: false, errors, warnings };
  let data = JSON.parse(JSON.stringify(obj));
  for (let v = data.format + 1; v <= BACKUP_FORMAT; v++) if (BACKUP_MIGRATIONS[v]) data = BACKUP_MIGRATIONS[v](data);
  const counts = {}; let skipped = 0;
  for (const [name, list] of Object.entries(data.stores)) {
    if (!KEY_OF[name] || name === 'snapshots') { warnings.push(`Неизвестный раздел «${name}» пропущен.`); delete data.stores[name]; continue; }
    if (!Array.isArray(list)) { warnings.push(`Раздел «${name}» повреждён и пропущен.`); delete data.stores[name]; continue; }
    const key = KEY_OF[name];
    const clean = list.filter(r => r && typeof r === 'object' && r[key] !== undefined && r[key] !== null);
    skipped += list.length - clean.length;
    data.stores[name] = clean; counts[name] = clean.length;
  }
  if (skipped) warnings.push(`Пропущено повреждённых записей: ${skipped}.`);
  for (const s of DATA_STORES) if (!data.stores[s]) data.stores[s] = [];
  return { ok: true, errors, warnings, counts, data, exportedAt: obj.exportedAt, appVersion: obj.appVersion };
}

/** Полностью заменяет данные содержимым копии одной атомарной транзакцией. */
export async function replaceAll(data, reason = 'Перед восстановлением из копии') {
  await createSnapshot(reason);
  const ops = [];
  for (const s of DATA_STORES) {
    ops.push({ store: s, clear: true });
    for (const r of (data.stores[s] || [])) ops.push({ store: s, put: r, keepStamp: true });
  }
  await commit(ops);
  await loadAll();
  emit(DATA_STORES);
}

// ---------- снимки на устройстве ----------
const SNAP_LIMIT = 8;
export async function createSnapshot(reason = 'Снимок') {
  const data = exportData();
  const snap = { id: 'snap_' + Date.now(), createdAt: Date.now(), reason, counts: data.counts, data };
  await runTx(['snapshots'], tx => tx.objectStore('snapshots').put(snap));
  const list = await listSnapshots();
  const extra = list.slice(SNAP_LIMIT);
  if (extra.length) await runTx(['snapshots'], tx => extra.forEach(s => tx.objectStore('snapshots').delete(s.id)));
  return snap.id;
}
export async function listSnapshots() {
  const res = await runTx(['snapshots'], tx => {
    const out = []; const st = tx.objectStore('snapshots');
    const r = st.openCursor();
    r.onsuccess = () => { const c = r.result; if (c) { const v = c.value; out.push({ id: v.id, createdAt: v.createdAt, reason: v.reason, counts: v.counts }); c.continue(); } };
    return out;
  }, 'readonly');
  return res.sort((a, b) => b.createdAt - a.createdAt);
}
export async function restoreSnapshot(id) {
  const snap = await runTx(['snapshots'], tx => { const o = {}; const r = tx.objectStore('snapshots').get(id); r.onsuccess = () => { o.v = r.result; }; return o; }, 'readonly');
  if (!snap.v) throw new Error('Снимок не найден');
  await replaceAll(snap.v.data, 'Перед возвратом к снимку');
}
export async function lastSnapshotTime() { const l = await listSnapshots(); return l.length ? l[0].createdAt : 0; }

export async function wipeAll() {
  await createSnapshot('Перед полным сбросом');
  await commit(DATA_STORES.map(s => ({ store: s, clear: true })));
  await loadAll();
  emit(DATA_STORES);
}
