// pantry.js — Кладовая царской семьи: запасы, корзина по магазинам, управление и каталог.
import * as db from './database.js';
import { icon, ICON_CHOICES_PANTRY } from './icons.js';
import { $, $$, esc, D, num, fmtQty, parseNum, plural, bus, modal, form, toast, undoToast, confirmDialog, seg, empty, heading, sound, pick, say, sleep, copyText, download, pickFile, readText, clamp } from './ui.js';
import { setMood } from './art.js';
import { kitchenScene } from './scenes.js';

// ---------------- справочники ----------------
export const pcats = () => db.all('pantryCategories').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const stores = () => db.all('stores').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const units = () => db.all('units').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const pc = (id) => id ? db.get('pantryCategories', id) : null;
const st = (id) => id ? db.get('stores', id) : null;
export const unit = (id) => db.get('units', id) || { id, short: 'шт', name: 'штуки', step: 1 };
const pcByKey = (key) => db.all('pantryCategories').find(c => c.key === key);
export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9%\s-]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------- каталог ----------------
let base = null, baseMeta = null, merged = null;
export async function loadCatalog() {
  if (base) return base;
  try {
    const r = await fetch('products.json', { cache: 'no-cache' }).catch(() => fetch('products.json'));
    const j = await r.json(); baseMeta = j;
    base = j.items.map((it, i) => ({ id: 'b' + i, name: it[0], cat: it[1], unit: it[2], syn: it[3] || [], base: true }));
  } catch (e) { console.warn('Каталог недоступен', e); base = []; }
  try { // необязательный пользовательский файл каталога рядом с приложением
    const r = await fetch('kladovaya_product_catalog.json', { cache: 'no-cache' });
    if (r.ok) { const j = await r.json(); const extra = parseExternalCatalog(j).items; const seen = new Set(base.map(x => norm(x.name))); extra.forEach((x, i) => { if (!seen.has(norm(x.name))) { seen.add(norm(x.name)); base.push({ ...x, id: 'k' + i, base: true, ext: true }); } }); }
  } catch (_) {}
  merged = null; return base;
}
export function catalog() {
  if (merged) return merged;
  const user = new Map(db.all('catalogUser').map(u => [u.id, u]));
  const out = [];
  for (const b of (base || [])) { const o = user.get(b.id); if (o && o.deleted) continue; out.push(o ? { ...b, ...o, edited: true } : b); }
  for (const u of user.values()) if (!u.deleted && !(base || []).some(b => b.id === u.id)) out.push({ ...u, user: true });
  for (const x of out) { x._n = norm(x.name); x._w = x._n.split(' '); x._s = (x.syn || []).map(norm); }
  merged = out; return out;
}
db.on('catalogUser', () => { merged = null; });
function lev1(a, b) { // расстояние Левенштейна не больше 1
  if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return e + (a.length - i) + (b.length - j) <= 1;
}
export function searchCatalog(q, limit = 12) {
  const n = norm(q); if (!n) return [];
  const toks = n.split(' ');
  const res = [];
  for (const x of catalog()) {
    let s = 0;
    if (x._n === n) s = 100; else if (x._n.startsWith(n)) s = 85 - Math.min(20, x._n.length - n.length) / 2;
    else if (x._s.includes(n)) s = 75; else if (x._w.some(w => w.startsWith(n))) s = 62; else if (x._s.some(y => y.startsWith(n))) s = 55;
    else if (x._n.includes(n)) s = 42; else if (x._s.some(y => y.includes(n))) s = 32;
    else if (toks.length > 1 && toks.every(t => x._w.some(w => w.startsWith(t)) || x._s.some(y => y.split(' ').some(w => w.startsWith(t))))) s = 50;
    if (s) res.push([s, x]);
  }
  if (res.length < 4 && n.length >= 4) { // опечатки — только если точных совпадений мало
    for (const x of catalog()) if (!res.some(r => r[1] === x) && x._w.concat(x._s).some(w => lev1(w.slice(0, n.length), n) || lev1(w, n))) res.push([18, x]);
  }
  return res.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length).slice(0, limit).map(r => r[1]);
}
export function parseExternalCatalog(j) {
  const list = Array.isArray(j) ? j : (j.items || j.products || j.catalog || j.товары || []);
  const items = [], skipped = [];
  const keyFor = (name) => { const n = norm(name); const c = pcats().find(c => norm(c.name) === n || n.startsWith(norm(c.name).split(' ')[0])); return c ? c.key : 'other'; };
  for (const it of list) {
    if (Array.isArray(it)) { if (it[0]) items.push({ name: String(it[0]), cat: it[1] || 'other', unit: it[2] || 'шт', syn: it[3] || [] }); continue; }
    if (!it || typeof it !== 'object') { skipped.push(it); continue; }
    const name = it.name || it.title || it.название || it.наименование || it.product;
    if (!name) { skipped.push(it); continue; }
    const catName = it.category || it.категория || it.cat || '';
    const syn = it.synonyms || it.синонимы || it.aliases || [];
    const stores = it.stores || it.магазины || it.store_hints || it.shops || [];
    items.push({ name: String(name).trim(), cat: catName ? keyFor(catName) : 'other', catLabel: catName, unit: it.unit || it.единица || it.default_unit || 'шт', syn: Array.isArray(syn) ? syn.map(String) : String(syn).split(/[,;]/).map(s => s.trim()).filter(Boolean), storeHints: Array.isArray(stores) ? stores.map(String) : [] });
  }
  return { items, skipped };
}

// ---------------- товары и статусы ----------------
export const products = () => db.all('products');
export function status(p) {
  if (!(p.qty > 0)) return 'out';
  const thr = p.threshold !== null && p.threshold !== undefined && p.threshold !== '' ? Number(p.threshold) : null;
  if (thr !== null ? p.qty <= thr : p.qty < (p.target || 0)) return 'low';
  return 'ok';
}
export const STATUS_LABEL = { ok: 'достаточно', low: 'заканчивается', out: 'закончилось' };
export function need(p) {
  const u = unit(p.unitId); const raw = (p.target || 0) - (p.qty || 0); if (raw <= 0) return 0;
  const stp = u.step >= 1 ? 1 : u.step || 1; return Math.round(Math.ceil(raw / stp - 1e-9) * stp * 1000) / 1000;
}
const wantsCart = (p) => !p.nonPermanent && (p.target || 0) > 0 && status(p) !== 'ok' && need(p) > 0 && !(p.cartDismissed && p.qty >= p.cartDismissed.qty) && db.setting('autoCart', true) !== false;
export async function setQty(p, qty, reason = 'manual') {
  qty = Math.max(0, Math.round(qty * 1000) / 1000);
  if (qty === p.qty) return;
  const n = { ...p, qty, cartDismissed: qty > p.qty ? null : p.cartDismissed || null };
  await db.commit([{ store: 'products', put: n }, { store: 'stockLog', put: { id: db.uid('sl'), ts: Date.now(), productId: p.id, name: p.name, from: p.qty, to: qty, unitId: p.unitId, reason } }]);
  bus.emit('stock', { before: p, after: n });
  return n;
}
export async function saveProduct(p) { await db.commit([{ store: 'products', put: p }]); }

// ---------------- корзина ----------------
export const cart = () => db.all('cart');
export const cartCount = () => db.all('cart').length;
let syncing = false, again = false;
export async function syncCart() {
  if (syncing) { again = true; return; } syncing = true;
  try {
    const ops = []; const entries = db.all('cart');
    const byProd = new Map(); for (const c of entries) if (c.productId) byProd.set(c.productId, c);
    for (const p of products()) {
      const e = byProd.get(p.id); const want = wantsCart(p);
      if (want && !e) ops.push({ store: 'cart', put: { id: 'ca_' + p.id, productId: p.id, name: p.name, qty: need(p), unitId: p.unitId, storeId: (p.stores || [])[0] || '', categoryId: p.categoryId || null, source: 'auto', createdAt: Date.now() } });
      else if (e && e.source === 'auto') {
        if (!want) ops.push({ store: 'cart', del: e.id });
        else { const upd = { ...e, name: p.name, unitId: p.unitId, categoryId: p.categoryId || null, qty: e.qtyEdited ? e.qty : need(p), storeId: e.storeEdited ? e.storeId : ((p.stores || [])[0] || '') };
          if (JSON.stringify([upd.name, upd.unitId, upd.categoryId, upd.qty, upd.storeId]) !== JSON.stringify([e.name, e.unitId, e.categoryId, e.qty, e.storeId])) ops.push({ store: 'cart', put: upd }); }
      }
    }
    if (ops.length) await db.commit(ops);
  } finally { syncing = false; if (again) { again = false; syncCart(); } }
}
let syncT = 0; db.on(['products', 'settings', 'units'], () => { clearTimeout(syncT); syncT = setTimeout(syncCart, 60); });

// ---------------- общие формы ----------------
function catChips(value) { return pcats().map(c => ({ value: c.id, label: c.name, color: c.color })); }
export function openProductForm(init = {}) {
  const p = init.id ? db.get('products', init.id) : null;
  const u0 = p ? p.unitId : (init.unitId || unitIdByShort(init.unit) || 'u_sht');
  const f = form([
    { name: 'name', label: 'Название', type: 'text', required: true, value: p ? p.name : init.name || '', check: (x) => { const n = norm(x); const d = products().find(q => norm(q.name) === n && (!p || q.id !== p.id)); return d ? 'Такой товар уже есть в кладовой' : ''; } },
    { name: 'categoryId', label: 'Категория', type: 'select', options: [{ value: '', label: '— без категории —' }, ...pcats().map(c => ({ value: c.id, label: c.name }))], value: p ? p.categoryId || '' : init.categoryId || '', half: true },
    { name: 'unitId', label: 'Единица', type: 'select', options: units().map(u => ({ value: u.id, label: `${u.name} (${u.short})` })), value: u0, half: true },
    { name: 'qty', label: 'Сейчас дома', type: 'number', value: p ? p.qty : (init.qty ?? 0), min: 0, half: true, required: true },
    { name: 'target', label: 'Желаемый запас', type: 'number', value: p ? p.target : (init.target ?? 1), min: 0, half: true, hint: 'Ниже — товар «заканчивается»' },
    { name: 'threshold', label: 'Порог пополнения (необязательно)', type: 'number', value: p && p.threshold !== null && p.threshold !== undefined ? p.threshold : '', min: 0, hint: 'Если указан: в корзину, когда осталось столько или меньше. Пусто — когда меньше желаемого.' },
    { name: 'stores', label: 'Где обычно покупаем', type: 'chips', options: stores().map(s => ({ value: s.id, label: s.name, color: s.color })), value: p ? p.stores || [] : (init.stores || (db.setting('defaultStore', '') ? [db.setting('defaultStore', '')] : [])), addLabel: 'Магазин', hint: 'Первый выбранный — основной для корзины' },
    { name: 'nonPermanent', type: 'checkbox', text: 'Непостоянный товар — не добавлять в корзину автоматически', value: p ? !!p.nonPermanent : !!init.nonPermanent },
    { name: 'note', label: 'Заметка', type: 'text', value: p ? p.note || '' : '' }
  ]);
  f.on('add:stores', async () => { const s = await openStoreForm(); if (s) { const v = f.values(); f.setOptions('stores', stores().map(x => ({ value: x.id, label: x.name, color: x.color })), [...(v.stores || []), s.id]); } });
  return new Promise((resolve) => {
    let saved = null;
    modal({ title: p ? 'Товар' : 'Новый товар в кладовой', body: f.el, wide: true, onClose: () => resolve(saved), actions: [
      ...(p ? [{ label: 'Удалить', kind: 'btn-danger', icon: 'trash', onClick: async () => {
        if (!await confirmDialog({ title: 'Удалить товар?', text: `«${p.name}» исчезнет из кладовой${db.get('cart', 'ca_' + p.id) ? ' и корзины' : ''}. История покупок сохранится.`, ok: 'Удалить', danger: true })) return false;
        const ce = db.all('cart').filter(c => c.productId === p.id);
        await db.commit([{ store: 'products', del: p.id }, ...ce.map(c => ({ store: 'cart', del: c.id }))]);
        db.journal('pantry', `Удалён товар «${p.name}»`);
        undoToast(`«${p.name}» удалён`, () => db.commit([{ store: 'products', put: p, keepStamp: true }, ...ce.map(c => ({ store: 'cart', put: c, keepStamp: true }))]));
      } }] : [{ label: 'Отмена', kind: 'btn-ghost' }]),
      { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => {
        if (!f.validate()) return false;
        const v = f.values();
        const rec = { ...(p || {}), id: p ? p.id : db.uid('p'), name: v.name.trim(), catalogId: p ? p.catalogId : init.catalogId || null, categoryId: v.categoryId || null, unitId: v.unitId, qty: Math.max(0, v.qty || 0), target: Math.max(0, v.target || 0),
          threshold: v.threshold === null || v.threshold === '' || isNaN(v.threshold) ? null : Math.max(0, v.threshold), stores: v.stores || [], nonPermanent: !!v.nonPermanent, note: (v.note || '').trim(), createdAt: p ? p.createdAt : Date.now() };
        if (p && rec.qty !== p.qty) rec.cartDismissed = rec.qty > p.qty ? null : p.cartDismissed || null;
        const ops = [{ store: 'products', put: rec }];
        if (!p || rec.qty !== p.qty) ops.push({ store: 'stockLog', put: { id: db.uid('sl'), ts: Date.now(), productId: rec.id, name: rec.name, from: p ? p.qty : 0, to: rec.qty, unitId: rec.unitId, reason: p ? 'edit' : 'create' } });
        await db.commit(ops);
        if (!p) db.journal('pantry', `Добавлен товар «${rec.name}»`);
        saved = rec; toast(p ? 'Товар сохранён' : `«${rec.name}» в кладовой`, { kind: 'good' });
        if (p) bus.emit('stock', { before: p, after: rec });
      } }] });
  });
}
function unitIdByShort(s) { if (!s) return null; const n = norm(s); const u = units().find(u => norm(u.short) === n || norm(u.name) === n || norm(u.name).startsWith(n)); return u ? u.id : null; }
/** Поиск по каталогу и добавление: без дублей. */
export function openAddProduct(prefill = '') {
  loadCatalog();
  const box = document.createElement('div');
  box.innerHTML = `<label class="search" style="display:block">${icon('search')}<input type="search" id="cat-q" placeholder="Начните вводить: молоко, гречка, мыло…" value="${esc(prefill)}" autocomplete="off"></label><ul class="ac-list" id="cat-res"></ul><p class="small muted" id="cat-note" style="margin:8px 2px 0"></p>`;
  const m = modal({ title: 'Добавить в кладовую', body: box, wide: true, actions: [{ label: 'Закрыть', kind: 'btn-ghost' }] });
  const inp = box.querySelector('#cat-q'), res = box.querySelector('#cat-res'), note = box.querySelector('#cat-note');
  const draw = async () => {
    await loadCatalog();
    const q = inp.value.trim(); const n = norm(q);
    const inPantry = products().filter(p => n && (norm(p.name).includes(n)));
    const hits = q ? searchCatalog(q, 14) : [];
    let html = inPantry.slice(0, 4).map(p => `<li data-pid="${p.id}"><span>${esc(p.name)}</span><small>уже в кладовой · ${fmtQty(p.qty)} ${esc(unit(p.unitId).short)}</small></li>`).join('');
    html += hits.filter(h => !products().some(p => norm(p.name) === h._n)).map(h => `<li data-cid="${h.id}"><span>${esc(h.name)}</span><small>${esc((pcByKey(h.cat) || {}).name || '')}${h._s.length && !h._n.includes(n) ? ' · ' + esc((h.syn || [])[0] || '') : ''}</small></li>`).join('');
    if (q && !products().some(p => norm(p.name) === n) && !hits.some(h => h._n === n)) html += `<li data-new="1"><span>${icon('plus')} Создать «${esc(q)}»</span><small>новый товар — попадёт и в ваш каталог</small></li>`;
    res.innerHTML = html || '';
    note.textContent = q ? '' : `В каталоге ${catalog().length} позиций. Поиск понимает часть слова, синонимы и небольшие опечатки.`;
  };
  inp.addEventListener('input', draw); draw(); setTimeout(() => inp.focus(), 80);
  res.addEventListener('click', async (e) => {
    const li = e.target.closest('li'); if (!li) return;
    if (li.dataset.pid) { m.close(); openProductForm({ id: li.dataset.pid }); return; }
    if (li.dataset.cid) { const c = catalog().find(x => x.id === li.dataset.cid); m.close(); const cat = pcByKey(c.cat); openProductForm({ name: c.name, catalogId: c.id, categoryId: c.categoryId || (cat ? cat.id : ''), unit: c.unit, target: 1, qty: 0 }); return; }
    if (li.dataset.new) {
      const name = inp.value.trim(); m.close();
      const saved = await openProductForm({ name, qty: 0, target: 1 });
      if (saved && !catalog().some(x => x._n === norm(saved.name))) { await db.commit([{ store: 'catalogUser', put: { id: db.uid('uc'), name: saved.name, cat: (pc(saved.categoryId) || {}).key || 'other', categoryId: saved.categoryId, unit: unit(saved.unitId).short, syn: [] } }]); }
    }
  });
}
export function openStoreForm(init = null) {
  return new Promise((resolve) => {
    const f = form([{ name: 'name', label: 'Название магазина', type: 'text', required: true, value: init ? init.name : '', check: x => stores().some(s => norm(s.name) === norm(x) && (!init || s.id !== init.id)) ? 'Такой магазин уже есть' : '' }, { name: 'color', label: 'Цвет', type: 'color', value: init ? init.color : '#34506e' }]);
    let r = null;
    modal({ title: init ? 'Магазин' : 'Новый магазин', body: f.el, onClose: () => resolve(r), actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => { if (!f.validate()) return false; const v = f.values(); r = init ? { ...init, name: v.name.trim(), color: v.color } : { id: db.uid('s'), name: v.name.trim(), color: v.color, order: stores().length }; await db.commit([{ store: 'stores', put: r }]); toast('Магазин сохранён', { kind: 'good' }); } }] });
  });
}
function askQty(title, value, u, { allowZero = true } = {}) {
  return new Promise((resolve) => {
    const f = form([{ name: 'q', label: `Количество, ${u.short}`, type: 'number', value, required: true, min: allowZero ? 0 : 0.001 }]);
    const quick = document.createElement('div'); quick.className = 'chips'; const stp = u.step || 1;
    quick.innerHTML = [-stp * 2, -stp, stp, stp * 2, stp * 5].map(d => `<button type="button" class="chip" data-d="${d}">${d > 0 ? '+' : '−'}${fmtQty(Math.abs(d))}</button>`).join('');
    quick.addEventListener('click', e => { const c = e.target.closest('[data-d]'); if (!c) return; const v = f.values().q || 0; f.set('q', Math.max(0, Math.round((v + +c.dataset.d) * 1000) / 1000)); });
    f.el.appendChild(quick);
    let r = null;
    modal({ title, body: f.el, onClose: () => resolve(r), actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Готово', kind: 'btn-gold', icon: 'check', onClick: () => { if (!f.validate()) return false; r = f.values().q; } }] });
  });
}

// ---------------- повар ----------------
const COOK = {
  low: ['Государь, у нас тут кое-что заканчивается!', 'Милорд, пора бы пополнить кладовую.', 'Полки пустеют, государь!'],
  many: ['Кто опять съел все запасы?!', 'Милорд, у нас тут настоящее бедствие! Срочно к купцам!'],
  full: ['О, господи, да у нас целый пир!', 'Государь, кладовые полны! Можно жить спокойно.', 'Всего вдоволь — хоть пир закатывай!'],
  empty: ['Кладовая пуста, государь! Запишем, что у нас есть?', 'Ни крошки на полках… Начнём учёт?'],
  restock: ['Вот это я понимаю — запасы!', 'Ох, полные закрома!', 'Теперь и пирог испечём!'],
  out: ['Ой-ой, совсем кончилось!', 'Последнее съели, государь!', 'Пусто! Хоть шаром покати!']
};
function cookLine() {
  const ps = products(); if (!ps.length) return pick(COOK.empty);
  const low = ps.filter(p => status(p) !== 'ok' && !p.nonPermanent);
  const flour = low.find(p => /мук/i.test(p.name)); if (flour && Math.random() < .5) return 'Без муки даже пирог не испечь!';
  if (low.length >= 6) return pick(COOK.many);
  if (low.length) return pick(COOK.low);
  return pick(COOK.full);
}
async function cookEntrance(root) {
  const c = root.querySelector('.cook'), table = root.querySelector('.cook-table'), box = root.querySelector('.kitchen-box');
  if (!c) return;
  if (document.body.classList.contains('anim-off')) { setMood(c, 'idle'); say(box, c.querySelector('.head'), cookLine(), { ms: 3200 }); return; }
  setMood(c, 'cut'); table.classList.add('cutting'); const chop = setInterval(() => sound.play('chop'), 420);
  await sleep(1300); clearInterval(chop); table.classList.remove('cutting');
  setMood(c, 'surprised'); await sleep(800);
  setMood(c, 'point'); say(box, c.querySelector('.head'), cookLine(), { ms: 3400 });
  await sleep(2600);
  if (!root.classList.contains('active')) return;
  setMood(c, pick(['cut', 'stir', 'cut', 'taste'])); if (c.getAttribute('data-pose') === 'cut') table.classList.add('cutting');
  setTimeout(() => { setMood(c, 'idle'); table.classList.remove('cutting'); }, 5000);
}
function cookReact(root, kind) {
  const c = root.querySelector('.cook'); if (!c || !root.classList.contains('active')) return;
  setMood(c, kind === 'restock' ? 'joy' : 'upset'); say(root.querySelector('.kitchen-box'), c.querySelector('.head'), pick(COOK[kind]), { ms: 2400 });
  setTimeout(() => setMood(c, 'idle'), 2200);
}

// ---------------- экран «Запасы» ----------------
let pEl, PF = { q: '', status: 'all', cat: '' };
export const pantryScreen = {
  mount(root) {
    pEl = root;
    root.innerHTML = `<div class="screen-head"><h1>Кладовая</h1><span class="sub">запасы царской семьи</span><span class="grow"></span></div>
      <div class="scene-box kitchen-box"><svg class="art scene" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMax slice">${kitchenScene()}</svg></div>
      <div class="scroll-roll"><div class="roller"></div><div class="sheet">
        <div class="ops-actions"><button class="btn btn-gold big-add" data-pa="add">${icon('plus')}Добавить товар</button><span class="grow"></span><span class="small muted p-summary"></span></div>
        <div class="toolbar"><label class="search">${icon('search')}<input type="search" id="p-search" placeholder="Найти в кладовой…"></label></div>
        <div class="status-chips p-status"></div><div class="chips p-cats" style="margin:8px 0 4px"></div>
        <div class="p-list"></div></div><div class="roller"></div></div>`;
    root.addEventListener('input', e => { if (e.target.id === 'p-search') { PF.q = e.target.value; renderPList(); } });
    root.addEventListener('click', onPantryClick);
    db.on(['products', 'pantryCategories', 'stores', 'units', 'cart'], () => { if (root.classList.contains('active')) renderPList(); });
    bus.on('stock', ({ before, after }) => { if (after.qty > before.qty) cookReact(root, 'restock'); else if (after.qty <= 0 && before.qty > 0) cookReact(root, 'out'); });
  },
  show() { loadCatalog(); renderPList(); cookEntrance(pEl); },
  hide() {}
};
function sortProducts(list) {
  const ord = { out: 0, low: 1, ok: 2 }; const co = new Map(pcats().map((c, i) => [c.id, i]));
  return list.sort((a, b) => (ord[status(a)] - ord[status(b)]) || ((co.get(a.categoryId) ?? 99) - (co.get(b.categoryId) ?? 99)) || a.name.localeCompare(b.name, 'ru'));
}
function renderPList() {
  const all = products(); const q = norm(PF.q);
  const cnt = { all: all.length, low: 0, out: 0, ok: 0, np: 0 }; for (const p of all) { cnt[status(p)]++; if (p.nonPermanent) cnt.np++; }
  pEl.querySelector('.p-summary').textContent = all.length ? `${all.length} ${plural(all.length, ['товар', 'товара', 'товаров'])} · в корзине ${cartCount()}` : '';
  pEl.querySelector('.p-status').innerHTML = [['all', 'Все', cnt.all], ['out', 'Закончилось', cnt.out], ['low', 'Заканчивается', cnt.low], ['ok', 'Достаточно', cnt.ok], ['np', 'Непостоянные', cnt.np]].map(([v, l, n]) => `<button class="chip ${PF.status === v ? 'on' : ''}" data-ps="${v}">${v !== 'all' && v !== 'np' ? `<span class="st-dot ${v}"></span>` : ''}${l} · ${n}</button>`).join('');
  const usedCats = new Set(all.map(p => p.categoryId));
  pEl.querySelector('.p-cats').innerHTML = `<button class="chip ${!PF.cat ? 'on' : ''}" data-pc="">Все категории</button>` + pcats().filter(c => usedCats.has(c.id)).map(c => `<button class="chip ${PF.cat === c.id ? 'on' : ''}" data-pc="${c.id}">${icon(c.icon)}${esc(c.name)}</button>`).join('');
  let list = all.filter(p => (PF.status === 'all' || (PF.status === 'np' ? p.nonPermanent : status(p) === PF.status)) && (!PF.cat || p.categoryId === PF.cat) && (!q || norm(p.name).includes(q) || norm((pc(p.categoryId) || {}).name).includes(q)));
  list = sortProducts(list);
  const box = pEl.querySelector('.p-list');
  if (!all.length) { box.innerHTML = empty('Кладовая пока пуста', 'Добавьте товары, которые есть дома: каталог подскажет названия') + `<div style="text-align:center"><button class="btn btn-gold" data-pa="add">${icon('plus')}Добавить первый товар</button></div>`; return; }
  if (!list.length) { box.innerHTML = empty('Ничего не нашлось') + (PF.q ? `<div style="text-align:center"><button class="btn btn-ink" data-pa="add-q">${icon('plus')}Добавить «${esc(PF.q)}»</button></div>` : ''); return; }
  box.innerHTML = list.map(prow).join('');
}
function prow(p) {
  const c = pc(p.categoryId), u = unit(p.unitId), s = status(p);
  const fill = p.target ? clamp(p.qty / p.target * 100, 0, 100) : (p.qty > 0 ? 100 : 0);
  const storeN = (p.stores || []).map(id => (st(id) || {}).name).filter(Boolean);
  const inCart = db.all('cart').some(x => x.productId === p.id);
  return `<div class="prow ${s}"><span class="cat-ic" style="--c:${c ? c.color : '#8a7058'}">${icon(c ? c.icon : 'box')}</span>
    <div class="pmain" data-edit="${p.id}"><div class="pn">${esc(p.name)}</div><div class="pm"><span class="st-dot ${s}">${STATUS_LABEL[s]}</span>${p.target ? `<span class="jar"><i style="width:${fill}%"></i></span><span>из ${fmtQty(p.target)} ${esc(u.short)}</span>` : ''}${storeN.length ? `<span>${esc(storeN[0])}${storeN.length > 1 ? ' +' + (storeN.length - 1) : ''}</span>` : ''}${p.nonPermanent ? '<span class="tag">непостоянный</span>' : ''}${inCart ? `<span class="tag">${icon('basket')}в корзине</span>` : ''}</div></div>
    <div class="stepper"><button data-dec="${p.id}" aria-label="Меньше">${icon('minus')}</button><div class="q" data-qty="${p.id}">${fmtQty(p.qty)}<small>${esc(u.short)}</small></div><button data-inc="${p.id}" aria-label="Больше">${icon('plus')}</button></div></div>`;
}
async function onPantryClick(e) {
  const t = e.target;
  const ps = t.closest('[data-ps]'); if (ps) { PF.status = ps.dataset.ps; renderPList(); return; }
  const pcB = t.closest('[data-pc]'); if (pcB) { PF.cat = pcB.dataset.pc; renderPList(); return; }
  const pa = t.closest('[data-pa]'); if (pa) { if (pa.dataset.pa === 'add') return openAddProduct(); if (pa.dataset.pa === 'add-q') return openAddProduct(PF.q); }
  const ed = t.closest('[data-edit]'); if (ed) return openProductForm({ id: ed.dataset.edit });
  const inc = t.closest('[data-inc]'), dec = t.closest('[data-dec]');
  if (inc || dec) { const p = db.get('products', (inc || dec).dataset[inc ? 'inc' : 'dec']); if (!p) return; const stp = unit(p.unitId).step || 1; await setQty(p, (p.qty || 0) + (inc ? stp : -stp)); sound.play('pop'); return; }
  const qd = t.closest('[data-qty]'); if (qd) { const p = db.get('products', qd.dataset.qty); const v = await askQty(`${p.name}: сколько дома?`, p.qty, unit(p.unitId)); if (v !== null && v !== undefined) await setQty(p, v); return; }
  if (t.closest('.cook')) { const c = pEl.querySelector('.cook'); setMood(c, 'taste'); say(pEl.querySelector('.kitchen-box'), c.querySelector('.head'), cookLine(), { ms: 2600 }); setTimeout(() => setMood(c, 'idle'), 2200); }
}

// ---------------- экран «Корзина» ----------------
let cEl, storeTab = 'all';
export const cartScreen = {
  mount(root) {
    cEl = root;
    root.innerHTML = `<div class="screen-head"><h1>Корзина</h1><span class="sub">список покупок по лавкам</span><span class="grow"></span></div>
      <div class="scene-box kitchen-box no-print" style="aspect-ratio:950/292"><svg class="art scene" viewBox="250 168 950 292" preserveAspectRatio="xMidYMax slice">${kitchenScene()}</svg></div>
      <div class="scroll-roll"><div class="roller no-print"></div><div class="sheet"><div class="c-body"></div></div><div class="roller no-print"></div></div>`;
    root.addEventListener('click', onCartClick);
    db.on(['cart', 'products', 'stores', 'purchases'], () => { if (root.classList.contains('active')) renderCart(); });
  },
  show() { renderCart(true); },
  hide() {}
};
function renderCart(enter) {
  const items = cart(); const body = cEl.querySelector('.c-body');
  const c = cEl.querySelector('.cook'), box = cEl.querySelector('.kitchen-box');
  if (enter && c) { setMood(c, items.length > 7 ? 'upset' : items.length ? 'point' : 'joy'); say(box, c.querySelector('.head'), items.length > 7 ? 'Милорд, у нас тут настоящее бедствие! Срочно к купцам!' : items.length ? pick(COOK.low) : 'Государь, кладовые полны! Можно жить спокойно.', { ms: 3600 }); setTimeout(() => setMood(c, 'idle'), 3000); }
  const groups = new Map(); for (const it of items) { const k = st(it.storeId) ? it.storeId : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const order = [...stores().map(s => s.id).filter(id => groups.has(id)), ...(groups.has('') ? [''] : [])];
  if (storeTab !== 'all' && !groups.has(storeTab)) storeTab = 'all';
  const today = D.today(); const bought = db.all('purchases').filter(p => p.date === today).sort((a, b) => b.ts - a.ts);
  body.innerHTML = `<div class="ops-actions no-print"><button class="btn btn-gold" data-ca="manual">${icon('plus')}Добавить вручную</button><button class="btn btn-ink" data-ca="copy" ${items.length ? '' : 'disabled'}>${icon('copy')}Копировать</button><button class="btn btn-ink" data-ca="print" ${items.length ? '' : 'disabled'}>${icon('print')}Печать</button><span class="grow"></span><button class="btn btn-ghost" data-ca="clear" ${items.length ? '' : 'disabled'}>${icon('trash')}Очистить</button></div>
    ${items.length ? `<div class="store-tabs no-print"><button class="chip ${storeTab === 'all' ? 'on' : ''}" data-st="all">Все лавки · ${items.length}</button>${order.map(id => `<button class="chip ${storeTab === id ? 'on' : ''}" data-st="${id}">${id ? `<i class="dot" style="background:${st(id).color}"></i>${esc(st(id).name)}` : 'Без магазина'} · ${groups.get(id).length}</button>`).join('')}</div>
      ${order.filter(id => storeTab === 'all' || storeTab === id).map(id => `<div class="store-group"><div class="store-title">${id ? `<i class="sw" style="background:${st(id).color}"></i>${esc(st(id).name)}` : 'Без магазина'}<span class="grow"></span><span class="small muted" style="letter-spacing:0;text-transform:none">${groups.get(id).length} ${plural(groups.get(id).length, ['позиция', 'позиции', 'позиций'])}</span></div>
        ${groups.get(id).sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(crow).join('')}</div>`).join('')}`
      : empty('Корзина пуста', 'Сюда сами попадают товары, которые заканчиваются (кроме непостоянных). Можно добавить и вручную.')}
    ${bought.length ? `<div class="store-group no-print">${heading('Куплено сегодня')}${bought.map(b => `<div class="crow-row bought-row"><span class="buy-check" style="color:var(--ok)">${icon('check')}</span><div class="cmain"><div class="cn">${esc(b.name)}</div><div class="cm">${fmtQty(b.qty)} ${esc(unit(b.unitId).short)}${b.storeId && st(b.storeId) ? ' · ' + esc(st(b.storeId).name) : ''}${b.updatedStock ? ' · запасы обновлены' : ''}</div></div><button class="btn btn-ghost sm" data-undo-buy="${b.id}">${icon('undo')}Вернуть</button></div>`).join('')}</div>` : ''}`;
}
function crow(it) {
  const p = it.productId ? db.get('products', it.productId) : null; const u = unit(it.unitId); const c = pc(it.categoryId);
  return `<div class="crow-row" data-cid="${it.id}"><button class="buy-check" data-buy="${it.id}" aria-label="Куплено">${icon('check')}</button>
    <div class="cmain"><div class="cn">${esc(it.name)}</div><div class="cm">${c ? esc(c.name) : 'без категории'}${p ? ` · дома ${fmtQty(p.qty)} из ${fmtQty(p.target)} ${esc(unit(p.unitId).short)}` : ' · добавлено вручную'}</div></div>
    <span class="cq" data-cq="${it.id}">${fmtQty(it.qty)} ${esc(u.short)}</span>
    <button class="icon-btn sm no-print" data-cmove="${it.id}" aria-label="Другой магазин">${icon('stall')}</button><button class="icon-btn sm no-print" data-cdel="${it.id}" aria-label="Убрать">${icon('close')}</button></div>`;
}
function cartText() {
  const items = cart(); const groups = new Map(); for (const it of items) { const k = st(it.storeId) ? st(it.storeId).name : 'Без магазина'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  let s = `Список покупок · ${D.human(D.today())}\n`;
  for (const [k, l] of groups) { s += `\n${k.toUpperCase()}\n`; for (const it of l) s += `• ${it.name} — ${fmtQty(it.qty)} ${unit(it.unitId).short}\n`; }
  return s;
}
async function onCartClick(e) {
  const t = e.target;
  const stb = t.closest('[data-st]'); if (stb) { storeTab = stb.dataset.st; renderCart(); return; }
  const ca = t.closest('[data-ca]');
  if (ca) {
    const a = ca.dataset.ca;
    if (a === 'manual') return addManual();
    if (a === 'copy') { const ok = await copyText(cartText()); toast(ok ? 'Список скопирован' : 'Не удалось скопировать', { kind: ok ? 'good' : 'bad' }); return; }
    if (a === 'print') { cEl.classList.add('printing'); setTimeout(() => { window.print(); setTimeout(() => cEl.classList.remove('printing'), 500); }, 50); return; }
    if (a === 'clear') {
      if (!await confirmDialog({ title: 'Очистить корзину?', text: 'Все позиции будут убраны. Товары кладовой не изменятся; автоматические позиции вернутся, только если запас снова уменьшится.', ok: 'Очистить', danger: true })) return;
      const items = cart(); const prods = items.filter(i => i.productId && db.get('products', i.productId)).map(i => db.get('products', i.productId));
      await db.commit([...items.map(i => ({ store: 'cart', del: i.id })), ...prods.map(p => ({ store: 'products', put: { ...p, cartDismissed: { qty: p.qty, at: Date.now() } } }))]);
      undoToast('Корзина очищена', () => db.commit([...items.map(i => ({ store: 'cart', put: i, keepStamp: true })), ...prods.map(p => ({ store: 'products', put: p, keepStamp: true }))]));
      return;
    }
  }
  const b = t.closest('[data-buy]'); if (b) return buy(b.dataset.buy, b);
  const q = t.closest('[data-cq]'); if (q) { const it = db.get('cart', q.dataset.cq); const v = await askQty(`${it.name}: сколько купить?`, it.qty, unit(it.unitId)); if (v) await db.commit([{ store: 'cart', put: { ...it, qty: v, qtyEdited: true } }]); return; }
  const mv = t.closest('[data-cmove]'); if (mv) { const it = db.get('cart', mv.dataset.cmove); const f = form([{ name: 's', label: 'Магазин', type: 'segmented', options: [...stores().map(s => ({ value: s.id, label: s.name })), { value: '', label: 'Без магазина' }], value: it.storeId || '' }]); modal({ title: `Где купить «${it.name}»?`, body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Переместить', kind: 'btn-gold', onClick: async () => { await db.commit([{ store: 'cart', put: { ...it, storeId: f.values().s, storeEdited: true } }]); } }] }); return; }
  const dl = t.closest('[data-cdel]'); if (dl) {
    const it = db.get('cart', dl.dataset.cdel); const p = it.productId ? db.get('products', it.productId) : null;
    const ops = [{ store: 'cart', del: it.id }]; if (p && it.source === 'auto') ops.push({ store: 'products', put: { ...p, cartDismissed: { qty: p.qty, at: Date.now() } } });
    await db.commit(ops); undoToast(`«${it.name}» убран из корзины`, () => db.commit([{ store: 'cart', put: it, keepStamp: true }, ...(p ? [{ store: 'products', put: p, keepStamp: true }] : [])])); return;
  }
  const ub = t.closest('[data-undo-buy]'); if (ub) return undoBuy(ub.dataset.undoBuy);
}
async function buy(id, btn) {
  const it = db.get('cart', id); if (!it) return; const p = it.productId ? db.get('products', it.productId) : null; const u = unit(it.unitId);
  const f = form([
    { name: 'qty', label: `Сколько купили, ${u.short}`, type: 'number', value: it.qty, required: true, min: 0.001, half: true },
    { name: 'storeId', label: 'Где', type: 'select', options: [{ value: '', label: '—' }, ...stores().map(s => ({ value: s.id, label: s.name }))], value: it.storeId || '', half: true },
    { name: 'update', type: 'checkbox', text: p ? 'Обновить запас в кладовой' : 'Добавить в кладовую как новый товар', value: !!p }
  ]);
  const prev = document.createElement('p'); prev.className = 'small'; prev.style.gridColumn = '1/-1';
  const upd = () => { const v = f.values(); prev.innerHTML = v.update ? (p ? `Было дома <b>${fmtQty(p.qty)} ${esc(unit(p.unitId).short)}</b> → станет <b>${fmtQty(Math.round(((p.qty || 0) + (v.qty || 0)) * 1000) / 1000)} ${esc(unit(p.unitId).short)}</b>` : `Товар «${esc(it.name)}» появится в кладовой с запасом ${fmtQty(v.qty || 0)} ${esc(u.short)}`) : 'Покупка будет записана в историю, запасы не изменятся.'; };
  f.on('qty', upd); f.on('update', upd); f.el.appendChild(prev); upd();
  modal({ title: `Куплено: ${it.name}`, body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Отметить купленным', kind: 'btn-green', icon: 'check', onClick: async () => {
    if (!f.validate()) return false; const v = f.values();
    const pur = { id: db.uid('pu'), productId: p ? p.id : null, name: it.name, qty: v.qty, unitId: it.unitId, storeId: v.storeId || '', categoryId: it.categoryId || null, date: D.today(), ts: Date.now(), cartEntry: it, updatedStock: !!v.update };
    const ops = [{ store: 'cart', del: it.id }];
    let newProd = null;
    if (v.update && p) { const to = Math.round(((p.qty || 0) + v.qty) * 1000) / 1000; pur.prevQty = p.qty; ops.push({ store: 'products', put: { ...p, qty: to, cartDismissed: null } }, { store: 'stockLog', put: { id: db.uid('sl'), ts: Date.now(), productId: p.id, name: p.name, from: p.qty, to, unitId: p.unitId, reason: 'purchase' } }); }
    if (v.update && !p) { newProd = { id: db.uid('p'), name: it.name, categoryId: it.categoryId || null, unitId: it.unitId, qty: v.qty, target: v.qty, threshold: null, stores: v.storeId ? [v.storeId] : [], nonPermanent: true, note: '', createdAt: Date.now() }; pur.productId = newProd.id; pur.createdProduct = newProd.id; ops.push({ store: 'products', put: newProd }); }
    ops.push({ store: 'purchases', put: pur });
    await db.commit(ops); sound.play('coin');
    if (btn) { const r = btn.getBoundingClientRect(); import('./animations.js').then(a => a.burst(r.left + r.width / 2, r.top + r.height / 2, 8)); }
    db.journal('purchase', `Куплено: ${it.name} — ${fmtQty(v.qty)} ${u.short}`);
    if (p && v.update) bus.emit('stock', { before: p, after: { ...p, qty: (p.qty || 0) + v.qty } });
    toast(`«${it.name}» куплено${v.update ? ', запасы обновлены' : ''}`, { kind: 'good', action: { label: 'Вернуть', fn: () => undoBuy(pur.id) } });
    if (newProd) toast('Новый товар отмечен непостоянным — при желании задайте ему желаемый запас');
  } }] });
}
async function undoBuy(pid) {
  const pur = db.get('purchases', pid); if (!pur) return;
  const ops = [{ store: 'purchases', del: pid }];
  if (pur.cartEntry) ops.push({ store: 'cart', put: pur.cartEntry, keepStamp: true });
  if (pur.createdProduct) ops.push({ store: 'products', del: pur.createdProduct });
  else if (pur.updatedStock && pur.productId && db.get('products', pur.productId)) { const p = db.get('products', pur.productId); const to = Math.max(0, Math.round((p.qty - pur.qty) * 1000) / 1000); ops.push({ store: 'products', put: { ...p, qty: to } }, { store: 'stockLog', put: { id: db.uid('sl'), ts: Date.now(), productId: p.id, name: p.name, from: p.qty, to, unitId: p.unitId, reason: 'undo' } }); }
  await db.commit(ops); toast('Покупка отменена, товар снова в корзине');
}
async function addManual() {
  await loadCatalog();
  const f = form([
    { name: 'name', label: 'Что купить', type: 'text', required: true, list: 'dl-cat' },
    { name: 'qty', label: 'Сколько', type: 'number', value: 1, required: true, min: 0.001, half: true },
    { name: 'unitId', label: 'Единица', type: 'select', options: units().map(u => ({ value: u.id, label: u.short })), value: 'u_sht', half: true },
    { name: 'storeId', label: 'Магазин', type: 'segmented', options: [...stores().map(s => ({ value: s.id, label: s.name })), { value: '', label: 'Любой' }], value: storeTab !== 'all' ? storeTab : '' }
  ]);
  const dl = document.createElement('datalist'); dl.id = 'dl-cat'; f.el.appendChild(dl);
  f.on('name', v => { const hits = [...products().filter(p => norm(p.name).includes(norm(v))).map(p => p.name), ...searchCatalog(v, 10).map(x => x.name)]; dl.innerHTML = [...new Set(hits)].slice(0, 10).map(n => `<option value="${esc(n)}">`).join(''); const p = products().find(p => norm(p.name) === norm(v)); if (p) { f.set('unitId', p.unitId); if ((p.stores || [])[0]) f.set('storeId', p.stores[0]); } else { const c = catalog().find(x => x._n === norm(v)); if (c) { const u = unitIdByShort(c.unit); if (u) f.set('unitId', u); } } });
  modal({ title: 'Добавить в корзину', body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Добавить', kind: 'btn-gold', icon: 'plus', onClick: async () => {
    if (!f.validate()) return false; const v = f.values(); const name = v.name.trim();
    const p = products().find(p => norm(p.name) === norm(name));
    const dup = cart().find(c => norm(c.name) === norm(name));
    if (dup) { await db.commit([{ store: 'cart', put: { ...dup, qty: Math.round((dup.qty + v.qty) * 1000) / 1000, qtyEdited: true } }]); toast(`«${name}» уже был в корзине — количество увеличено`); return; }
    const cat = p ? p.categoryId : (() => { const c = catalog().find(x => x._n === norm(name)); return c ? (pcByKey(c.cat) || {}).id || null : null; })();
    await db.commit([{ store: 'cart', put: { id: db.uid('cm'), productId: p ? p.id : null, name, qty: v.qty, unitId: v.unitId, storeId: v.storeId, categoryId: cat, source: 'manual', createdAt: Date.now() } }]);
    toast(`«${name}» в корзине`, { kind: 'good' });
  } }] });
}

// ---------------- экран «Управление» ----------------
let mEl, mTab = 'cats', catQ = '', catLimit = 80;
const MTABS = [['cats', 'Категории', 'jar'], ['stores', 'Магазины', 'stall'], ['catalog', 'Каталог товаров', 'book'], ['units', 'Единицы измерения', 'scales'], ['settings', 'Настройки кладовой', 'key'], ['io', 'Импорт и экспорт', 'download'], ['history', 'История запасов', 'hourglass']];
export const manageScreen = {
  mount(root) {
    mEl = root;
    root.innerHTML = `<div class="screen-head"><h1>Управление кладовой</h1><span class="sub">справочники, каталог и история</span><span class="grow"></span></div>
      <div class="mgr-grid"><nav class="paper mgr-nav"></nav><div class="paper m-body"></div></div>`;
    root.addEventListener('click', onManageClick);
    root.addEventListener('input', e => { if (e.target.id === 'cat-filter') { catQ = e.target.value; catLimit = 80; renderCatalogList(); } });
    root.addEventListener('change', onManageChange);
    db.on(['pantryCategories', 'stores', 'units', 'catalogUser', 'products', 'stockLog', 'purchases', 'settings'], () => { if (root.classList.contains('active')) renderManage(); });
  },
  async show() { await loadCatalog(); renderManage(); },
  hide() {}
};
function renderManage() {
  mEl.querySelector('.mgr-nav').innerHTML = MTABS.map(([v, l, ic]) => `<button class="${mTab === v ? 'on' : ''}" data-mt="${v}">${icon(ic)}${l}</button>`).join('');
  const b = mEl.querySelector('.m-body');
  if (mTab === 'cats') {
    const list = pcats(); const counts = {}; for (const p of products()) counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
    b.innerHTML = `${heading('Категории товаров', `<button class="btn btn-gold sm hd-act" data-mact="new-cat">${icon('plus')}Новая</button>`)}<ul class="ledger">${list.map((c, i) => `<li class="lrow" style="cursor:default"><span class="cat-ic" style="--c:${c.color}">${icon(c.icon)}</span><div class="main"><div class="t">${esc(c.name)}</div><div class="m">${counts[c.id] || 0} ${plural(counts[c.id] || 0, ['товар', 'товара', 'товаров'])}</div></div><div class="order-btns"><button class="icon-btn sm" data-mord="pantryCategories:${c.id}:-1" ${i ? '' : 'disabled'}>${icon('up')}</button><button class="icon-btn sm" data-mord="pantryCategories:${c.id}:1" ${i < list.length - 1 ? '' : 'disabled'}>${icon('down')}</button></div><button class="icon-btn sm" data-medit="cat:${c.id}">${icon('edit')}</button><button class="icon-btn sm" data-mdel="cat:${c.id}">${icon('trash')}</button></li>`).join('')}</ul>`;
  } else if (mTab === 'stores') {
    const list = stores(); const counts = {}; for (const p of products()) for (const s of (p.stores || [])) counts[s] = (counts[s] || 0) + 1;
    b.innerHTML = `${heading('Магазины', `<button class="btn btn-gold sm hd-act" data-mact="new-store">${icon('plus')}Новый</button>`)}<ul class="ledger">${list.map((s, i) => `<li class="lrow" style="cursor:default"><span class="cat-ic" style="--c:${s.color}">${icon('stall')}</span><div class="main"><div class="t">${esc(s.name)}</div><div class="m">${counts[s.id] || 0} ${plural(counts[s.id] || 0, ['товар', 'товара', 'товаров'])} с этим магазином${db.setting('defaultStore', '') === s.id ? ' · основной для новых товаров' : ''}</div></div><div class="order-btns"><button class="icon-btn sm" data-mord="stores:${s.id}:-1" ${i ? '' : 'disabled'}>${icon('up')}</button><button class="icon-btn sm" data-mord="stores:${s.id}:1" ${i < list.length - 1 ? '' : 'disabled'}>${icon('down')}</button></div><button class="icon-btn sm" data-medit="store:${s.id}">${icon('edit')}</button><button class="icon-btn sm" data-mdel="store:${s.id}">${icon('trash')}</button></li>`).join('')}</ul><p class="small muted">Список магазинов — ваш личный справочник. Приложение не знает реального ассортимента и цен сетей.</p>`;
  } else if (mTab === 'catalog') {
    const all = catalog(); const mine = all.filter(x => x.user || x.edited).length;
    b.innerHTML = `${heading('Каталог товаров', `<button class="btn btn-gold sm hd-act" data-mact="new-cat-item">${icon('plus')}Добавить</button>`)}<p class="small muted" style="margin-top:-4px">${all.length} позиций, из них ваших и изменённых: ${mine}. Исходный каталог не меняется — правки хранятся отдельно и попадают в резервную копию.</p><label class="search" style="display:block;margin-bottom:8px">${icon('search')}<input id="cat-filter" type="search" placeholder="Поиск по каталогу (с синонимами)…" value="${esc(catQ)}"></label><div class="cat-list"></div>`;
    renderCatalogList();
  } else if (mTab === 'units') {
    const used = {}; for (const p of products()) used[p.unitId] = (used[p.unitId] || 0) + 1;
    b.innerHTML = `${heading('Единицы измерения', `<button class="btn btn-gold sm hd-act" data-mact="new-unit">${icon('plus')}Своя единица</button>`)}<ul class="ledger">${units().map(u => `<li class="lrow" style="cursor:default"><span class="cat-ic" style="--c:#8e6a22">${icon('scales')}</span><div class="main"><div class="t">${esc(u.name)} <span class="muted">(${esc(u.short)})</span></div><div class="m">шаг кнопок ± ${fmtQty(u.step)} · товаров: ${used[u.id] || 0}${u.builtIn ? ' · встроенная' : ''}</div></div><button class="icon-btn sm" data-medit="unit:${u.id}">${icon('edit')}</button>${u.builtIn ? '' : `<button class="icon-btn sm" data-mdel="unit:${u.id}">${icon('trash')}</button>`}</li>`).join('')}</ul>`;
  } else if (mTab === 'settings') {
    b.innerHTML = `${heading('Настройки кладовой')}<div class="set-row"><div class="l">Автоматически добавлять в корзину<small>Товары, которые заканчиваются (кроме непостоянных)</small></div><label class="check"><input type="checkbox" data-ms="autoCart" ${db.setting('autoCart', true) !== false ? 'checked' : ''}><span class="box">${icon('check')}</span></label></div>
      <div class="set-row"><div class="l">Магазин по умолчанию для новых товаров</div><div class="field" style="width:200px"><select data-ms="defaultStore"><option value="">— нет —</option>${stores().map(s => `<option value="${s.id}" ${db.setting('defaultStore', '') === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></div>
      <div class="set-row"><div class="l">Компактный список<small>Меньше высота строк, без подробностей</small></div><label class="check"><input type="checkbox" data-ms="compact" ${db.setting('compact', false) ? 'checked' : ''}><span class="box">${icon('check')}</span></label></div>`;
  } else if (mTab === 'io') {
    b.innerHTML = `${heading('Импорт и экспорт')}<div class="set-row"><div class="l">Экспорт запасов в таблицу (CSV)<small>Открывается в Excel и Google Таблицах</small></div><button class="btn btn-ink" data-mact="export-csv">${icon('download')}Скачать</button></div>
      <div class="set-row"><div class="l">Экспорт каталога (JSON)<small>Исходный каталог и ваши правки</small></div><button class="btn btn-ink" data-mact="export-cat">${icon('download')}Скачать</button></div>
      <div class="set-row"><div class="l">Импорт каталога товаров (JSON)<small>Например, kladovaya_product_catalog.json: названия, категории, единицы, синонимы. Дубли пропускаются.</small></div><button class="btn btn-gold" data-mact="import-cat">${icon('upload')}Выбрать файл</button></div>
      <div class="set-row"><div class="l">Полная резервная копия<small>Казна, игра и кладовая — в разделе «Настройки и данные»</small></div><button class="btn btn-ghost" data-go="settings">${icon('key')}Открыть</button></div>
      ${baseMeta ? `<p class="small muted">Источник встроенного каталога: ${esc(baseMeta.source || '')}</p>` : ''}`;
  } else {
    const log = db.all('stockLog').sort((a, b) => b.ts - a.ts).slice(0, 200), pur = db.all('purchases').sort((a, b) => b.ts - a.ts).slice(0, 100);
    const R = { manual: 'вручную', edit: 'правка', create: 'добавлен', purchase: 'покупка', undo: 'отмена покупки', import: 'импорт' };
    b.innerHTML = `${heading('История изменений запасов')}${log.length ? `<ul class="ledger">${log.map(l => `<li class="lrow" style="cursor:default;min-height:44px"><span class="cat-ic" style="--c:${l.to > l.from ? '#4a6f36' : '#9b2c2c'};width:32px;height:32px">${icon(l.to > l.from ? 'arrowUp' : 'arrowDown')}</span><div class="main"><div class="t" style="font-size:15px">${esc(l.name)}</div><div class="m">${D.stamp(l.ts)} · ${R[l.reason] || l.reason}</div></div><div class="amt" style="font-size:15px">${fmtQty(l.from)} → ${fmtQty(l.to)} ${esc(unit(l.unitId).short)}</div></li>`).join('')}</ul>` : empty('Изменений пока нет')}
      ${heading('Покупки')}${pur.length ? `<ul class="ledger">${pur.map(p => `<li class="lrow" style="cursor:default;min-height:44px"><span class="cat-ic" style="--c:#8e6a22;width:32px;height:32px">${icon('basket')}</span><div class="main"><div class="t" style="font-size:15px">${esc(p.name)}</div><div class="m">${D.dmy(p.date)}${p.storeId && st(p.storeId) ? ' · ' + esc(st(p.storeId).name) : ''}</div></div><div class="amt" style="font-size:15px">${fmtQty(p.qty)} ${esc(unit(p.unitId).short)}</div></li>`).join('')}</ul>` : empty('Покупок пока нет')}`;
  }
}
function renderCatalogList() {
  const box = mEl.querySelector('.cat-list'); if (!box) return;
  const list = catQ.trim() ? searchCatalog(catQ, 300) : [...catalog()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  box.innerHTML = `<ul class="ledger">${list.slice(0, catLimit).map(x => { const c = pcByKey(x.cat) || pc(x.categoryId); return `<li class="lrow" style="cursor:default;min-height:48px"><span class="cat-ic" style="--c:${c ? c.color : '#8a7058'};width:32px;height:32px">${icon(c ? c.icon : 'box')}</span><div class="main"><div class="t" style="font-size:15.5px">${esc(x.name)}${x.user ? ' <span class="tag">ваш</span>' : x.edited ? ' <span class="tag">изменён</span>' : ''}</div><div class="m">${esc(c ? c.name : 'Прочее')} · ${esc(x.unit || 'шт')}${(x.syn || []).length ? ' · ' + esc(x.syn.slice(0, 4).join(', ')) : ''}</div></div><button class="icon-btn sm" data-citem="${x.id}">${icon('edit')}</button><button class="icon-btn sm" data-cdelitem="${x.id}">${icon('trash')}</button></li>`; }).join('')}</ul>${list.length > catLimit ? `<div style="text-align:center"><button class="btn btn-ink" data-mact="more-cat">Показать ещё (${list.length - catLimit})</button></div>` : ''}`;
}
async function onManageChange(e) {
  const s = e.target.closest('[data-ms]'); if (!s) return;
  await db.setSetting(s.dataset.ms, s.type === 'checkbox' ? s.checked : s.value);
  toast('Настройка сохранена');
}
async function onManageClick(e) {
  const t = e.target;
  const mt = t.closest('[data-mt]'); if (mt) { mTab = mt.dataset.mt; renderManage(); return; }
  const ord = t.closest('[data-mord]'); if (ord) { const [store, id, d] = ord.dataset.mord.split(':'); const list = store === 'stores' ? stores() : pcats(); const i = list.findIndex(x => x.id === id), j = i + +d; const arr = [...list]; [arr[i], arr[j]] = [arr[j], arr[i]]; await db.commit(arr.map((x, k) => ({ store, put: { ...x, order: k } }))); return; }
  const ma = t.closest('[data-mact]');
  if (ma) {
    const a = ma.dataset.mact;
    if (a === 'new-cat') return editPCat();
    if (a === 'new-store') return openStoreForm();
    if (a === 'new-unit') return editUnit();
    if (a === 'new-cat-item') return editCatItem();
    if (a === 'more-cat') { catLimit += 200; renderCatalogList(); return; }
    if (a === 'export-csv') { const rows = [['Название', 'Категория', 'Количество', 'Единица', 'Желаемый запас', 'Статус', 'Магазины', 'Непостоянный']]; for (const p of sortProducts([...products()])) rows.push([p.name, (pc(p.categoryId) || {}).name || '', String(p.qty).replace('.', ','), unit(p.unitId).short, String(p.target).replace('.', ','), STATUS_LABEL[status(p)], (p.stores || []).map(id => (st(id) || {}).name).filter(Boolean).join(', '), p.nonPermanent ? 'да' : 'нет']); download(`kladovaya-${D.today()}.csv`, '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv'); return; }
    if (a === 'export-cat') { download(`katalog-${D.today()}.json`, JSON.stringify({ source: 'Царская казна', exportedAt: new Date().toISOString(), items: catalog().map(x => [x.name, x.cat || (pc(x.categoryId) || {}).key || 'other', x.unit || 'шт', x.syn || []]) }, null, 1)); return; }
    if (a === 'import-cat') return importCatalogFile();
  }
  const me = t.closest('[data-medit]'); if (me) { const [k, id] = me.dataset.medit.split(':'); if (k === 'cat') return editPCat(db.get('pantryCategories', id)); if (k === 'store') return openStoreForm(db.get('stores', id)); if (k === 'unit') return editUnit(db.get('units', id)); }
  const md = t.closest('[data-mdel]'); if (md) { const [k, id] = md.dataset.mdel.split(':'); return delRef(k, id); }
  const ci = t.closest('[data-citem]'); if (ci) return editCatItem(catalog().find(x => x.id === ci.dataset.citem));
  const cd = t.closest('[data-cdelitem]'); if (cd) { const x = catalog().find(y => y.id === cd.dataset.cdelitem); if (!x) return; if (!await confirmDialog({ title: 'Убрать из каталога?', text: `«${x.name}» больше не будет подсказываться. Товары в кладовой не затронуты.`, ok: 'Убрать', danger: true })) return; const prev = db.get('catalogUser', x.id); await db.commit([x.base ? { store: 'catalogUser', put: { ...(prev || {}), id: x.id, deleted: true } } : { store: 'catalogUser', del: x.id }]); undoToast('Убрано из каталога', () => db.commit([prev ? { store: 'catalogUser', put: prev, keepStamp: true } : { store: 'catalogUser', del: x.id }])); }
}
function editPCat(c = null) {
  const f = form([{ name: 'name', label: 'Название', type: 'text', required: true, value: c ? c.name : '', check: x => pcats().some(y => norm(y.name) === norm(x) && (!c || y.id !== c.id)) ? 'Такая категория уже есть' : '' }, { name: 'icon', label: 'Значок', type: 'icon', icons: ICON_CHOICES_PANTRY, value: c ? c.icon : 'box' }, { name: 'color', label: 'Цвет', type: 'color', value: c ? c.color : '#3d5a3a' }]);
  modal({ title: c ? 'Категория' : 'Новая категория', body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => { if (!f.validate()) return false; const v = f.values(); await db.commit([{ store: 'pantryCategories', put: c ? { ...c, name: v.name.trim(), icon: v.icon, color: v.color } : { id: db.uid('pc'), key: 'u' + Date.now().toString(36), name: v.name.trim(), icon: v.icon, color: v.color, order: pcats().length } }]); } }] });
}
function editUnit(u = null) {
  const f = form([{ name: 'name', label: 'Название', type: 'text', required: true, value: u ? u.name : '', placeholder: 'например: банки' }, { name: 'short', label: 'Сокращение', type: 'text', required: true, value: u ? u.short : '', half: true, check: x => units().some(y => norm(y.short) === norm(x) && (!u || y.id !== u.id)) ? 'Такое сокращение уже есть' : '' }, { name: 'step', label: 'Шаг кнопок ±', type: 'number', required: true, value: u ? u.step : 1, min: 0.001, half: true }]);
  modal({ title: u ? 'Единица измерения' : 'Новая единица', body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => { if (!f.validate()) return false; const v = f.values(); await db.commit([{ store: 'units', put: u ? { ...u, name: v.name.trim(), short: v.short.trim(), step: v.step } : { id: db.uid('u'), name: v.name.trim(), short: v.short.trim(), step: v.step, builtIn: false, order: units().length } }]); } }] });
}
function editCatItem(x = null) {
  const f = form([{ name: 'name', label: 'Название', type: 'text', required: true, value: x ? x.name : '', check: v => catalog().some(y => y._n === norm(v) && (!x || y.id !== x.id)) ? 'Такая позиция уже есть в каталоге' : '' },
    { name: 'cat', label: 'Категория', type: 'select', options: pcats().map(c => ({ value: c.key, label: c.name })), value: x ? x.cat || (pc(x.categoryId) || {}).key : 'other', half: true },
    { name: 'unit', label: 'Единица', type: 'select', options: units().map(u => ({ value: u.short, label: u.short })), value: x ? x.unit : 'шт', half: true },
    { name: 'syn', label: 'Синонимы (через запятую)', type: 'text', value: x ? (x.syn || []).join(', ') : '' }]);
  modal({ title: x ? 'Позиция каталога' : 'Новая позиция каталога', body: f.el, actions: [
    ...(x && x.edited ? [{ label: 'Вернуть исходную', kind: 'btn-ghost', onClick: async () => { await db.commit([{ store: 'catalogUser', del: x.id }]); toast('Позиция возвращена к исходной'); } }] : [{ label: 'Отмена', kind: 'btn-ghost' }]),
    { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => { if (!f.validate()) return false; const v = f.values(); const rec = { id: x ? x.id : db.uid('uc'), name: v.name.trim(), cat: v.cat, unit: v.unit, syn: v.syn.split(',').map(s => s.trim()).filter(Boolean) }; await db.commit([{ store: 'catalogUser', put: rec }]); toast('Каталог обновлён', { kind: 'good' }); } }] });
}
async function delRef(kind, id) {
  if (kind === 'unit') { const used = products().filter(p => p.unitId === id).length; if (used) { toast(`Единица используется в ${used} ${plural(used, ['товаре', 'товарах', 'товарах'])} — сначала смените её у товаров`, { kind: 'bad' }); return; } const u = db.get('units', id); await db.commit([{ store: 'units', del: id }]); undoToast('Единица удалена', () => db.commit([{ store: 'units', put: u, keepStamp: true }])); return; }
  if (kind === 'store') {
    const s = db.get('stores', id); const prods = products().filter(p => (p.stores || []).includes(id)); const ce = cart().filter(c => c.storeId === id);
    if (!await confirmDialog({ title: `Удалить «${s.name}»?`, text: `Магазин уберётся из ${prods.length} ${plural(prods.length, ['товара', 'товаров', 'товаров'])}; позиции корзины перейдут в «Без магазина». Товары не удалятся.`, ok: 'Удалить', danger: true })) return;
    await db.commit([{ store: 'stores', del: id }, ...prods.map(p => ({ store: 'products', put: { ...p, stores: p.stores.filter(x => x !== id) } })), ...ce.map(c => ({ store: 'cart', put: { ...c, storeId: '' } }))]);
    undoToast('Магазин удалён', () => db.commit([{ store: 'stores', put: s, keepStamp: true }, ...prods.map(p => ({ store: 'products', put: p, keepStamp: true })), ...ce.map(c => ({ store: 'cart', put: c, keepStamp: true }))])); return;
  }
  const c = db.get('pantryCategories', id); const prods = products().filter(p => p.categoryId === id); const others = pcats().filter(x => x.id !== id);
  const f = form([{ name: 'to', label: prods.length ? `Куда перенести ${prods.length} ${plural(prods.length, ['товар', 'товара', 'товаров'])}?` : 'Категория пуста', type: 'select', options: [{ value: '', label: 'Оставить без категории' }, ...others.map(x => ({ value: x.id, label: x.name }))], value: (others.find(x => x.key === 'other') || {}).id || '', show: () => prods.length > 0 }]);
  modal({ title: `Удалить категорию «${c.name}»`, body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Удалить', kind: 'btn-danger', icon: 'trash', onClick: async () => { const to = f.values().to || null; await db.commit([{ store: 'pantryCategories', del: id }, ...prods.map(p => ({ store: 'products', put: { ...p, categoryId: to } }))]); undoToast('Категория удалена', () => db.commit([{ store: 'pantryCategories', put: c, keepStamp: true }, ...prods.map(p => ({ store: 'products', put: p, keepStamp: true }))])); } }] });
}
async function importCatalogFile() {
  const file = await pickFile('.json,application/json'); if (!file) return;
  let j; try { j = JSON.parse(await readText(file)); } catch (e) { toast('Файл не является корректным JSON: ' + e.message, { kind: 'bad' }); return; }
  const { items, skipped } = parseExternalCatalog(j);
  if (!items.length) { modal({ title: 'Импорт невозможен', body: `<p>В файле не найдено ни одной позиции. Ожидается массив товаров или объект с полем <code>items</code> / <code>products</code>, где у каждого товара есть название (<code>name</code> или <code>название</code>), а по возможности — <code>category</code>, <code>unit</code>, <code>synonyms</code>, <code>stores</code>.</p>`, actions: [{ label: 'Понятно', kind: 'btn-gold' }] }); return; }
  const have = new Set(catalog().map(x => x._n)); const add = []; let dup = 0; const storeHints = new Set();
  for (const it of items) { const n = norm(it.name); if (!n || have.has(n)) { dup++; continue; } have.add(n); (it.storeHints || []).forEach(s => storeHints.add(s)); add.push({ store: 'catalogUser', put: { id: db.uid('uc'), name: it.name, cat: it.cat, unit: it.unit, syn: it.syn || [], imported: true } }); }
  modal({ title: 'Импорт каталога', body: `<div class="report"><p>Найдено позиций: <b>${items.length}</b></p><ul><li class="ok">Будет добавлено: ${add.length}</li><li>Уже есть в каталоге (пропущено): ${dup}</li>${skipped.length ? `<li class="warn">Не распознано записей: ${skipped.length}</li>` : ''}${storeHints.size ? `<li>Подсказки магазинов в файле: ${esc([...storeHints].slice(0, 8).join(', '))} — магазины можно завести вручную во вкладке «Магазины».</li>` : ''}</ul><p class="small muted">Импортированные позиции хранятся отдельно от исходного каталога и попадают в резервную копию.</p></div>`,
    actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: `Добавить ${add.length}`, kind: 'btn-gold', onClick: async () => { if (add.length) await db.commit(add); db.journal('catalog', `Импорт каталога: добавлено ${add.length}`); toast(`В каталог добавлено: ${add.length}`, { kind: 'good' }); } }] });
}
