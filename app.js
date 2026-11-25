// app.js — запуск «Царской казны»: хранилище, навигация, начальные данные, фоновые проверки.
import * as db from './database.js';
import { iconSprite, icon } from './icons.js';
import { $, $$, esc, D, bus, toast, sound, closeAllModals } from './ui.js';
import * as home from './home.js';
import * as finance from './finance.js';
import * as game from './game.js';
import * as boyars from './boyars.js';
import * as pantry from './pantry.js';
import * as settings from './settings.js';

const SECTIONS = {
  kazna: { label: 'Казна', icon: 'crown', screens: [
    { id: 'home', label: 'Главная', icon: 'castle' }, { id: 'treasurer', label: 'Казначей', icon: 'scroll' },
    { id: 'wheel', label: 'Колесо', icon: 'wheel' }, { id: 'boyars', label: 'Бояре', icon: 'boyar' }] },
  kladovaya: { label: 'Кладовая', icon: 'jar', screens: [
    { id: 'pantry', label: 'Запасы', icon: 'jar' }, { id: 'cart', label: 'Корзина', icon: 'basket' }, { id: 'manage', label: 'Управление', icon: 'book' }] }
};
const SCREENS = { home: home.screen, treasurer: finance.screen, wheel: game.wheelScreen, boyars: boyars.screen, pantry: pantry.pantryScreen, cart: pantry.cartScreen, manage: pantry.manageScreen, settings: settings.screen };
const sectionOf = (id) => id === 'settings' ? null : (SECTIONS.kazna.screens.some(s => s.id === id) ? 'kazna' : 'kladovaya');
const state = { current: null, section: 'kazna', last: { kazna: 'home', kladovaya: 'pantry' }, mounted: new Set() };
export function currentScreen() { return state.current; }

// ---------- навигация ----------
const emblemSVG = `<svg class="emblem" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#5a1520" stroke="#e8c86e" stroke-width="2.5"/><circle cx="32" cy="32" r="24" fill="none" stroke="#c9a043" stroke-width="1" stroke-dasharray="2 3"/><path d="M18 40h28l-2 9H20Z" fill="#c9a043" stroke="#2a1b12" stroke-width="1.5"/><path d="M18 40c0-7 6-10 14-10s14 3 14 10Z" fill="#8e6a22" stroke="#2a1b12" stroke-width="1.5"/><path d="M21 28l-1-11l6 5l6-8l6 8l6-5l-1 11Z" fill="#e8c86e" stroke="#2a1b12" stroke-width="1.5" stroke-linejoin="round"/><circle cx="32" cy="44" r="2" fill="#2a1b12"/></svg>`;
function renderNav() {
  const sect = state.section;
  const sw = `<div class="sect-switch">${Object.entries(SECTIONS).map(([k, s]) => `<button class="sect-btn ${k === sect ? 'on' : ''}" data-sect="${k}" aria-pressed="${k === sect}"><span class="seal">${icon(s.icon)}</span><span>${s.label}</span></button>`).join('')}</div>`;
  const items = (SECTIONS[sect] || SECTIONS.kazna).screens.map(s => `<button class="nav-it ${state.current === s.id ? 'on' : ''}" data-go="${s.id}" aria-current="${state.current === s.id ? 'page' : 'false'}">${icon(s.icon)}<span>${s.label}</span>${s.id === 'cart' ? cartBadge() : ''}</button>`).join('');
  $('#rail').innerHTML = `${emblemSVG}${sw}<div class="nav-items">${items}</div><div class="rail-bottom"><button class="nav-it ${state.current === 'settings' ? 'on' : ''}" data-go="settings">${icon('key')}<span>Настройки</span>${backupBadge()}</button></div>`;
  $('#topbar').innerHTML = `${emblemSVG}${sw}<button class="gear" data-go="settings" aria-label="Настройки и данные">${icon('key')}</button>`;
  $('#tabbar').innerHTML = items;
}
function cartBadge() { const n = pantry.cartCount(); return n ? `<i class="badge">${n}</i>` : ''; }
function backupBadge() { return settings.backupOverdue() ? '<i class="badge">!</i>' : ''; }

export function go(id, params = {}, { push = true } = {}) {
  if (!SCREENS[id]) id = 'home';
  const prevSect = state.section;
  const sect = sectionOf(id);
  if (sect) { state.section = sect; state.last[sect] = id; }
  if (state.current && state.current !== id) { const prev = SCREENS[state.current]; prev && prev.hide && prev.hide(); }
  document.body.classList.toggle('switching', !!sect && sect !== prevSect);
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === id));
  const el = document.getElementById('scr-' + id);
  const scr = SCREENS[id];
  if (!state.mounted.has(id)) { scr.mount(el); state.mounted.add(id); }
  state.current = id;
  $('#stage').scrollTop = 0;
  scr.show(el, params);
  renderNav();
  if (push && location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id);
  try { localStorage.setItem(db.APP_ID + ':nav', JSON.stringify({ id, last: state.last })); } catch (_) {}
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); sound.ctx(); go(g.dataset.go); return; }
  const s = e.target.closest('[data-sect]'); if (s) { e.preventDefault(); sound.ctx(); go(state.last[s.dataset.sect] || SECTIONS[s.dataset.sect].screens[0].id); }
});
window.addEventListener('hashchange', () => { const id = location.hash.replace('#/', ''); if (id && id !== state.current && SCREENS[id]) { closeAllModals(); go(id, {}, { push: false }); } });
bus.on('nav', ({ id, params }) => go(id, params));
bus.on('refreshNav', renderNav);

// ---------- начальные данные ----------
const FIN_CATS = [
  ['expense', 'Продукты', 'bread', '#6a8455'], ['expense', 'Доставка еды', 'courier', '#c4553f'], ['expense', 'Кафе и рестораны', 'goblet', '#a63a2e'],
  ['expense', 'Транспорт', 'horse', '#34506e'], ['expense', 'Дом и коммуналка', 'house', '#6b4423'], ['expense', 'Здоровье', 'potion', '#3d5a3a'],
  ['expense', 'Красота и уход', 'mirror', '#5b3f6e'], ['expense', 'Одежда', 'shirt', '#5d7c98'], ['expense', 'Связь и подписки', 'bell', '#8e6a22'],
  ['expense', 'Развлечения', 'mask', '#7a1f2b'], ['expense', 'Игры', 'dice', '#4a4a4a'], ['expense', 'Покупки', 'basket', '#a63a2e'],
  ['expense', 'Подарки', 'gift', '#c9a043'], ['expense', 'Прочее', 'star', '#4a4a4a'],
  ['income', 'Зарплата', 'wheat', '#3d5a3a'], ['income', 'Подработка', 'purse', '#6a8455'], ['income', 'Подарки', 'gift', '#c9a043'],
  ['income', 'Возвраты и кэшбэк', 'coins', '#8e6a22'], ['income', 'Прочие доходы', 'star', '#4a4a4a']
];
const PANTRY_CATS = [['veg', 'Овощи', 'carrot', '#6a8455'], ['fruit', 'Фрукты', 'apple', '#a63a2e'], ['dairy', 'Молочные продукты и яйца', 'milk', '#5d7c98'], ['meat', 'Мясо', 'meat', '#7a1f2b'],
  ['fish', 'Рыба и морепродукты', 'fish', '#34506e'], ['grocery', 'Бакалея', 'sack', '#8e6a22'], ['grains', 'Крупы и макароны', 'wheat', '#c9a043'], ['sweets', 'Сладости', 'candy', '#c4553f'],
  ['drinks', 'Напитки', 'bottle', '#3d5a3a'], ['bread', 'Хлеб и выпечка', 'bread', '#6b4423'], ['frozen', 'Заморозка', 'snow', '#5d7c98'], ['sauces', 'Соусы и специи', 'sauce', '#a63a2e'],
  ['chem', 'Бытовая химия', 'bucket', '#34506e'], ['hygiene', 'Гигиена', 'soap', '#5b3f6e'], ['other', 'Прочее', 'box', '#4a4a4a']];
const STORES = [['Магнит', '#c4553f'], ['Пятёрочка', '#a63a2e'], ['Лента', '#34506e'], ['Ашан', '#6a8455'], ['Перекрёсток', '#3d5a3a']];
export const UNITS = [['sht', 'штуки', 'шт', 1], ['kg', 'килограммы', 'кг', .1], ['g', 'граммы', 'г', 50], ['l', 'литры', 'л', .5], ['ml', 'миллилитры', 'мл', 100], ['up', 'упаковки', 'уп', 1], ['pach', 'пачки', 'пачка', 1], ['but', 'бутылки', 'бут', 1]];
const EXAMPLE_QUESTS = [
  ['Не покупать кофе вне дома неделю', 'Каждый день без кофе навынос — шаг к цели.', 'wheel', 7, 40, 7],
  ['Отложить 5 000 ₽', 'Переложить в кубышку и не трогать.', 'wheel', 1, 50, 14],
  ['Три дня без импульсивных покупок', 'Только то, что было в списке.', 'wheel', 3, 30, 3],
  ['Приготовить ужин из домашних запасов', 'Без похода в лавку.', 'wheel', 1, 15, 2],
  ['Проверить все подписки', 'Отменить ненужные.', 'wheel', 1, 25, 7],
  ['Неделя без доставки еды', 'Готовим сами.', 'wheel', 7, 45, 7],
  ['Записать все траты за неделю', 'Казначей должен знать о каждой монете.', 'weekly', 1, 20, 0],
  ['Сократить расходы на развлечения', 'Потратить меньше, чем в прошлом месяце.', 'monthly', 1, 60, 0]
];
async function seed() {
  if (db.get('meta', 'seeded')) return;
  const ops = [];
  FIN_CATS.forEach(([kind, name, ic, color], i) => ops.push({ store: 'categories', put: { id: 'c_' + kind[0] + i, kind, name, icon: ic, color, order: i, createdAt: Date.now() } }));
  PANTRY_CATS.forEach(([key, name, ic, color], i) => ops.push({ store: 'pantryCategories', put: { id: 'pc_' + key, key, name, icon: ic, color, order: i } }));
  STORES.forEach(([name, color], i) => ops.push({ store: 'stores', put: { id: 's_' + i, name, color, order: i } }));
  UNITS.forEach(([id, name, short, step], i) => ops.push({ store: 'units', put: { id: 'u_' + id, name, short, step, builtIn: true, order: i } }));
  EXAMPLE_QUESTS.forEach(([title, description, kind, steps, xp, days], i) => ops.push({ store: 'quests', put: { id: 'q_ex' + i, title, description, kind, steps, xp, durationDays: days || 7, everyDays: 1, repeatable: true, inWheel: kind === 'wheel', status: 'active', example: true, order: i, createdAt: Date.now(), createdDate: D.today() } }));
  const defaults = { animations: 'full', sound: true, volume: .5, compact: false, compactScenes: false, openingBalance: 0, openingDate: '', members: ['Государь', 'Государыня'], servantPhrases: { up: [], down: [] }, defaultStore: '', lastBackupAt: 0 };
  for (const [key, value] of Object.entries(defaults)) if (db.get('settings', key) === undefined) ops.push({ store: 'settings', put: { key, value } });
  ops.push({ store: 'meta', put: { key: 'seeded', value: Date.now() } }, { store: 'meta', put: { key: 'installedAt', value: Date.now() } });
  await db.commit(ops);
}

// ---------- проверка целостности ----------
export async function checkIntegrity() {
  const fixes = [], details = [];
  const catIds = new Set(db.all('categories').map(c => c.id));
  for (const o of db.all('operations')) {
    let ch = false; const n = { ...o };
    if (!['income', 'expense', 'transfer'].includes(n.type)) { n.type = n.amount < 0 ? 'expense' : 'income'; ch = true; }
    if (typeof n.amount !== 'number' || !isFinite(n.amount)) { n.amount = Math.abs(Number(n.amount)) || 0; ch = true; }
    if (n.amount < 0) { n.amount = Math.abs(n.amount); ch = true; }
    if (n.categoryId && !catIds.has(n.categoryId)) { n.categoryId = null; ch = true; }
    if (!D.valid(n.date)) { n.date = D.fmt(new Date(n.createdAt || Date.now())); ch = true; }
    if (ch) { fixes.push({ store: 'operations', put: n, keepStamp: true }); details.push(`Операция «${o.title || o.id}» исправлена`); }
  }
  const pcIds = new Set(db.all('pantryCategories').map(c => c.id)), stIds = new Set(db.all('stores').map(s => s.id));
  for (const p of db.all('products')) {
    let ch = false; const n = { ...p };
    if (typeof n.qty !== 'number' || !isFinite(n.qty) || n.qty < 0) { n.qty = Math.max(0, Number(n.qty) || 0); ch = true; }
    if (typeof n.target !== 'number' || !isFinite(n.target) || n.target < 0) { n.target = Math.max(0, Number(n.target) || 0); ch = true; }
    if (n.categoryId && !pcIds.has(n.categoryId)) { n.categoryId = null; ch = true; }
    const st = (n.stores || []).filter(s => stIds.has(s)); if (st.length !== (n.stores || []).length) { n.stores = st; ch = true; }
    if (ch) { fixes.push({ store: 'products', put: n, keepStamp: true }); details.push(`Товар «${p.name}» исправлен`); }
  }
  const pIds = new Set(db.all('products').map(p => p.id));
  for (const c of db.all('cart')) if (c.productId && !pIds.has(c.productId)) { fixes.push({ store: 'cart', put: { ...c, productId: null, source: 'manual' }, keepStamp: true }); details.push(`Позиция корзины «${c.name}» отвязана от удалённого товара`); }
  if (fixes.length) await db.commit(fixes);
  const report = { at: Date.now(), fixed: fixes.length, details: details.slice(0, 30) };
  await db.commit([{ store: 'meta', put: { key: 'integrity', value: report } }]);
  return report;
}


// ---------- применение настроек ----------
export function applySettings() {
  const anim = db.setting('animations', 'full');
  document.body.classList.toggle('anim-low', anim === 'low');
  document.body.classList.toggle('anim-off', anim === 'off');
  document.body.classList.toggle('compact', !!db.setting('compact', false));
  document.body.classList.toggle('compact-scenes', !!db.setting('compactScenes', false));
  sound.enabled = !!db.setting('sound', true); sound.volume = Number(db.setting('volume', .5));
}
db.on('settings', applySettings);

// ---------- фоновые задачи: регулярные платежи, задания, смена дня ----------
let lastDay = D.today(), busyTick = false;
async function tick(force = false) {
  if (busyTick) return; busyTick = true;
  try {
    const t = D.today();
    const dayChanged = t !== lastDay; lastDay = t;
    const rec = await finance.processRecurring();
    if (rec.created) toast(`Казначей записал регулярных операций: ${rec.created}`, { kind: 'good' });
    await game.refreshQuests();
    if (dayChanged || force) bus.emit('day', t);
  } catch (e) { console.error(e); } finally { busyTick = false; }
}

// ---------- обновления приложения (service worker) ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./service-worker.js', { scope: './' }).then(reg => {
    const offer = (w) => toast('Доступна новая версия приложения. Данные останутся на месте.', { ms: 15000, action: { label: 'Обновить', fn: () => w.postMessage('skipWaiting') } });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    settings.setSWReg(reg);
  }).catch(e => console.warn('SW:', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
}

// ---------- запуск ----------
async function boot() {
  document.body.insertAdjacentHTML('afterbegin', iconSprite());
  try {
    await db.open();
  } catch (e) {
    $('#splash-msg').innerHTML = `<span class="err">Не удалось открыть хранилище данных (${esc(e.message || e)}). Возможно, включён частный режим браузера или память устройства заполнена. Данные не будут сохраняться — откройте приложение в обычном режиме.</span>`;
    return;
  }
  await seed();
  applySettings();
  try { await checkIntegrity(); } catch (e) { console.error(e); }
  await pantry.syncCart().catch(console.error);
  await tick(true);
  const lastSnap = await db.lastSnapshotTime().catch(() => 0);
  if (Date.now() - lastSnap > 20 * 3600 * 1000 && db.count('operations') + db.count('products') > 0) db.createSnapshot('Ежедневный автоснимок').catch(() => {});
  db.on(['cart', 'products'], () => renderNav());
  let start = 'home';
  try { const nav = JSON.parse(localStorage.getItem(db.APP_ID + ':nav') || 'null'); if (nav) { Object.assign(state.last, nav.last || {}); } } catch (_) {}
  const h = location.hash.replace('#/', ''); if (SCREENS[h]) start = h;
  go(start);
  setTimeout(() => { $('#splash').classList.add('hide'); setTimeout(() => $('#splash').remove(), 700); }, 250);
  setInterval(() => tick(), 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  document.addEventListener('pointerdown', function first() { db.requestPersist(); sound.ctx(); document.removeEventListener('pointerdown', first); }, { once: true });
  registerSW();
  settings.maybeRemindBackup();
  if (db.status.walReplayed) toast(`Восстановлено незавершённых записей после сбоя: ${db.status.walReplayed}`, { kind: 'good' });
}
window.addEventListener('error', (e) => console.error('Ошибка:', e.message));
window.addEventListener('unhandledrejection', (e) => { console.error('Необработанная ошибка:', e.reason); if (e.reason && /IndexedDB|Transaction|QuotaExceeded/i.test(String(e.reason))) toast('Не удалось сохранить данные: ' + (e.reason.message || e.reason), { kind: 'bad' }); });
boot();
