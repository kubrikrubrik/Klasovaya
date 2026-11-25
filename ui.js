// ui.js — общие инструменты интерфейса: форматирование, даты, окна, формы, уведомления, звук.
import { icon, ICON_CHOICES_FIN } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export function rand(n) { // честная случайность 0..n-1
  if (n <= 1) return 0;
  const lim = Math.floor(0xFFFFFFFF / n) * n; const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
export function pick(list, avoid) {
  if (!list.length) return undefined;
  if (list.length === 1) return list[0];
  let v; do { v = list[rand(list.length)]; } while (v === avoid);
  return v;
}

// ---------- шина событий ----------
const handlers = new Map();
export const bus = {
  on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev).add(fn); return () => handlers.get(ev).delete(fn); },
  emit(ev, data) { for (const fn of (handlers.get(ev) || [])) { try { fn(data); } catch (e) { console.error(e); } } }
};

// ---------- числа и деньги (суммы хранятся в копейках) ----------
const NB = ' ';
export function num(n, digits = 0) {
  const s = Math.abs(n).toFixed(digits).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? '−' : '') + s.join(',');
}
export function money(k, o = {}) {
  const v = Math.round(k || 0);
  const rub = Math.trunc(Math.abs(v) / 100), kop = Math.abs(v) % 100;
  let s = rub.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (kop && !o.round) s += ',' + String(kop).padStart(2, '0');
  const sign = v < 0 ? '−' : (o.sign && v > 0 ? '+' : '');
  return sign + s + (o.bare ? '' : NB + '₽');
}
export function moneyShort(k) {
  const r = Math.abs(k) / 100, sign = k < 0 ? '−' : '';
  if (r >= 1e6) return sign + num(r / 1e6, r >= 1e7 ? 0 : 1) + NB + 'млн';
  if (r >= 1e4) return sign + num(r / 1e3, 0) + NB + 'тыс';
  return sign + num(r, 0);
}
export function parseMoney(str) {
  if (typeof str === 'number') return Math.round(str * 100);
  const s = String(str || '').replace(/\s| | |₽|руб\.?/gi, '').replace(',', '.').replace('−', '-');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}
export function parseNum(str) {
  const s = String(str ?? '').replace(/\s| | /g, '').replace(',', '.');
  if (s === '' || !/^-?\d*(\.\d*)?$/.test(s)) return NaN;
  return parseFloat(s);
}
export function fmtQty(q) { return num(Math.round((q || 0) * 1000) / 1000, Number.isInteger(Math.round((q || 0) * 1000) / 1000) ? 0 : (Math.round(q * 100) % 10 ? 2 : 1)).replace(/,?0+$/, m => m.startsWith(',') ? '' : m); }
export function plural(n, f) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return f[2]; if (n1 > 1 && n1 < 5) return f[1]; if (n1 === 1) return f[0]; return f[2]; }
export function pct(a, b) { return b ? Math.round((a - b) / b * 100) : null; }

// ---------- даты (строки YYYY-MM-DD в местном времени) ----------
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_N = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WDS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const pad = (n) => String(n).padStart(2, '0');
export const D = {
  fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
  today() { return D.fmt(new Date()); },
  parse(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); },
  valid(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false; const d = D.parse(s); return D.fmt(d) === s; },
  add(s, n) { const d = D.parse(s); d.setDate(d.getDate() + n); return D.fmt(d); },
  dim(y, m) { return new Date(y, m + 1, 0).getDate(); },
  addMonths(s, n, dom) {
    const d = D.parse(s); const day = dom || d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(day, D.dim(t.getFullYear(), t.getMonth()))); return D.fmt(t);
  },
  diff(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 86400000); },
  dow(s) { return (D.parse(s).getDay() + 6) % 7; },
  weekStart(s) { return D.add(s, -D.dow(s)); }, weekEnd(s) { return D.add(D.weekStart(s), 6); },
  monthStart(s) { return s.slice(0, 8) + '01'; },
  monthEnd(s) { const d = D.parse(s); return D.fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0)); },
  isoWeek(s) { const d = D.parse(s); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(t.getFullYear(), 0, 4); return `${t.getFullYear()}-W${pad(1 + Math.round(((t - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7))}`; },
  human(s) { const d = D.parse(s); return `${d.getDate()} ${MONTHS_G[d.getMonth()]} ${d.getFullYear()}`; },
  dm(s) { const d = D.parse(s); return `${d.getDate()} ${MONTHS_G[d.getMonth()]}`; },
  short(s) { const d = D.parse(s); return `${d.getDate()} ${MONTHS_S[d.getMonth()]}`; },
  dmy(s) { return s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : ''; },
  month(s) { const d = D.parse(s); return `${MONTHS_N[d.getMonth()]} ${d.getFullYear()}`; },
  monthName(i) { return MONTHS_N[i]; }, monthShort(i) { return MONTHS_S[i]; },
  weekday(s) { return WD[D.dow(s)]; }, wds(i) { return WDS[i]; },
  rel(s) { const t = D.today(); if (s === t) return 'сегодня'; if (s === D.add(t, -1)) return 'вчера'; if (s === D.add(t, 1)) return 'завтра'; return D.dm(s) + (s.slice(0, 4) !== t.slice(0, 4) ? ' ' + s.slice(0, 4) : ''); },
  time(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
  stamp(ts) { if (!ts) return '—'; const d = new Date(ts); return `${D.rel(D.fmt(d))}, ${D.time(ts)}`; }
};

// ---------- звук (синтез WebAudio, без файлов) ----------
let actx = null;
export const sound = {
  enabled: true, volume: .5,
  ctx() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); return actx; },
  tone(f, t0, dur, type = 'sine', vol = .3, slide = 0) {
    const c = this.ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), c.currentTime + t0 + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol * this.volume, c.currentTime + t0 + .01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur); o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + .02);
  },
  noise(t0, dur, freq = 1200, vol = .2) {
    const c = this.ctx(); if (!c) return;
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate); const ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol * this.volume;
    s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + t0);
  },
  play(name) {
    if (!this.enabled || !this.volume) return;
    try {
      switch (name) {
        case 'coin': this.tone(1760, 0, .12, 'triangle', .25); this.tone(2637, .05, .2, 'sine', .18); break;
        case 'coins': for (let i = 0; i < 6; i++) { this.tone(1500 + Math.random() * 1400, i * .07, .14, 'triangle', .14); } break;
        case 'loss': this.tone(392, 0, .22, 'triangle', .2, -60); this.tone(311, .2, .35, 'triangle', .2, -80); break;
        case 'tick': this.tone(1100, 0, .03, 'square', .05); break;
        case 'thunk': this.tone(140, 0, .18, 'sine', .4, -60); this.noise(0, .08, 900, .25); break;
        case 'fanfare': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * .12, .3, 'sawtooth', .07)); this.tone(1046, .5, .6, 'triangle', .12); break;
        case 'level': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * .08, .35, 'sine', .16)); break;
        case 'quill': for (let i = 0; i < 4; i++) this.noise(i * .09, .06, 3500, .06); break;
        case 'creak': this.tone(180, 0, .5, 'sawtooth', .04, 120); break;
        case 'step': this.noise(0, .05, 500, .08); break;
        case 'pop': this.tone(660, 0, .08, 'sine', .18, 200); break;
        case 'bow': this.noise(0, .4, 300, .12); break;
        case 'chop': this.noise(0, .05, 2000, .15); this.tone(220, 0, .06, 'square', .05); break;
      }
    } catch (_) {}
  }
};

// ---------- окна ----------
let modalStack = [];
export function modal({ title = '', body = '', actions = [], cls = '', onClose, dismissible = true, wide = false, art = '' } = {}) {
  const root = document.getElementById('modals');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${cls} ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    ${art ? `<div class="modal-art">${art}</div>` : ''}
    ${title ? `<header class="modal-head"><h2>${esc(title)}</h2>${dismissible ? `<button class="seal-close" data-close aria-label="Закрыть">${icon('close')}</button>` : ''}</header>` : ''}
    <div class="modal-body"></div><footer class="modal-foot"></footer></div>`;
  const m = wrap.firstElementChild, b = m.querySelector('.modal-body'), f = m.querySelector('.modal-foot');
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  let closed = false;
  const close = (val) => {
    if (closed) return; closed = true;
    wrap.classList.add('closing');
    modalStack = modalStack.filter(x => x !== api);
    setTimeout(() => wrap.remove(), 220);
    document.body.classList.toggle('has-modal', modalStack.length > 0);
    onClose && onClose(val);
  };
  const api = { el: m, body: b, foot: f, close, wrap };
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.kind || 'btn-ink'); btn.type = 'button';
    btn.innerHTML = (a.icon ? icon(a.icon) : '') + `<span>${esc(a.label)}</span>`;
    btn.addEventListener('click', async () => {
      if (a.onClick) { btn.disabled = true; try { const r = await a.onClick(api); if (r !== false && a.close !== false) close(r); } catch (e) { console.error(e); toast(e.message || 'Ошибка', { kind: 'bad' }); } finally { btn.disabled = false; } }
      else close();
    });
    f.appendChild(btn);
  }
  if (!actions.length) f.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap && dismissible) close(); if (e.target.closest('[data-close]')) close(); });
  root.appendChild(wrap); modalStack.push(api);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const first = m.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea');
  if (first && matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 60);
  return api;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close(); });
export function closeAllModals() { [...modalStack].forEach(m => m.close()); }

export function confirmDialog({ title = 'Подтвердите', text = '', ok = 'Да', cancel = 'Отмена', danger = false, html = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal({ title, body: html ? text : `<p class="confirm-text">${esc(text)}</p>`, cls: 'confirm',
      actions: [{ label: cancel, kind: 'btn-ghost', onClick: () => { answered = true; resolve(false); } }, { label: ok, kind: danger ? 'btn-danger' : 'btn-gold', onClick: () => { answered = true; resolve(true); } }],
      onClose: () => { if (!answered) resolve(false); } });
  });
}

export function toast(text, { action, kind = '', ms = 4200 } = {}) {
  const root = document.getElementById('toasts');
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(text)}</span>`;
  if (action) { const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = action.label; b.onclick = () => { action.fn(); dismiss(); }; t.appendChild(b); }
  root.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
  let timer = setTimeout(dismiss, action ? Math.max(ms, 6000) : ms);
  function dismiss() { clearTimeout(timer); t.classList.remove('show'); setTimeout(() => t.remove(), 300); }
  while (root.children.length > 3) root.firstElementChild.remove();
  return dismiss;
}
export function undoToast(text, revert) { return toast(text, { action: { label: 'Отменить', fn: async () => { try { await revert(); toast('Отменено'); } catch (e) { toast('Не удалось отменить: ' + e.message, { kind: 'bad' }); } } } }); }

// ---------- формы ----------
export const COLORS = ['#7a1f2b', '#a63a2e', '#c4553f', '#c9a043', '#8e6a22', '#6b4423', '#3d5a3a', '#6a8455', '#34506e', '#5d7c98', '#5b3f6e', '#4a4a4a'];
/**
 * fields: [{name,label,type,options,value,required,hint,min,max,step,placeholder,show:(v)=>bool,icons}]
 * type: text|number|money|date|select|textarea|checkbox|segmented|chips|icon|color|range
 */
export function form(fields, values = {}) {
  const el = document.createElement('form'); el.className = 'form'; el.noValidate = true; el.autocomplete = 'off';
  el.addEventListener('submit', e => e.preventDefault());
  const state = { ...values }; const listeners = {};
  const row = (f) => {
    const v = state[f.name] ?? f.value ?? (f.type === 'checkbox' ? false : f.type === 'chips' ? [] : '');
    state[f.name] = v;
    const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 6);
    let input = '';
    switch (f.type) {
      case 'textarea': input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 2}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`; break;
      case 'select': input = `<select id="${id}" name="${f.name}">${(f.options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`; break;
      case 'checkbox': input = `<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}><span class="box">${icon('check')}</span><span>${esc(f.text || f.label)}</span></label>`; break;
      case 'segmented': input = `<div class="seg" role="radiogroup">${(f.options || []).map(o => `<button type="button" class="seg-b ${String(o.value) === String(v) ? 'on' : ''}" data-val="${esc(o.value)}">${o.icon ? icon(o.icon) : ''}${esc(o.label)}</button>`).join('')}</div>`; break;
      case 'chips': input = `<div class="chips">${(f.options || []).map(o => `<button type="button" class="chip ${(v || []).map(String).includes(String(o.value)) ? 'on' : ''}" data-val="${esc(o.value)}">${o.color ? `<i class="dot" style="background:${o.color}"></i>` : ''}${esc(o.label)}</button>`).join('')}${f.addLabel ? `<button type="button" class="chip add" data-add>${icon('plus')}${esc(f.addLabel)}</button>` : ''}</div>`; break;
      case 'icon': input = `<div class="iconpick">${(f.icons || ICON_CHOICES_FIN).map(n => `<button type="button" class="ip ${n === v ? 'on' : ''}" data-val="${n}" aria-label="${n}">${icon(n)}</button>`).join('')}</div>`; break;
      case 'color': input = `<div class="colorpick">${COLORS.map(c => `<button type="button" class="cp ${c === v ? 'on' : ''}" data-val="${c}" style="background:${c}" aria-label="цвет"></button>`).join('')}</div>`; break;
      case 'range': input = `<input type="range" id="${id}" name="${f.name}" min="${f.min ?? 0}" max="${f.max ?? 100}" step="${f.step ?? 1}" value="${esc(v)}">`; break;
      default: {
        const t = f.type === 'date' ? 'date' : 'text';
        const mode = f.type === 'money' || f.type === 'number' ? `inputmode="decimal"` : '';
        const shown = f.type === 'money' && v !== '' && v !== null && !isNaN(v) ? (v / 100).toString().replace('.', ',') : v;
        input = `<div class="inp ${f.type === 'money' ? 'money' : ''}"><input type="${t}" id="${id}" name="${f.name}" value="${esc(shown)}" ${mode} placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${f.list}"` : ''} ${f.min ? `min="${f.min}"` : ''}>${f.type === 'money' ? '<b>₽</b>' : ''}${f.suffix ? `<b>${esc(f.suffix)}</b>` : ''}</div>`;
      }
    }
    return `<div class="field f-${f.type || 'text'} ${f.wide ? 'wide' : ''} ${f.half ? 'half' : ''}" data-name="${f.name}">
      ${f.type !== 'checkbox' && f.label ? `<label for="${id}">${esc(f.label)}${f.required ? ' <i class="req">*</i>' : ''}</label>` : ''}
      ${input}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}<small class="err"></small></div>`;
  };
  el.innerHTML = fields.map(row).join('');
  const fieldOf = (name) => fields.find(f => f.name === name);
  const read = (name) => {
    const f = fieldOf(name); const box = el.querySelector(`.field[data-name="${name}"]`); if (!box) return state[name];
    if (['segmented', 'chips', 'icon', 'color'].includes(f.type)) return state[name];
    const i = box.querySelector('input,select,textarea'); if (!i) return state[name];
    if (f.type === 'checkbox') return i.checked;
    if (f.type === 'money') return i.value.trim() === '' ? null : parseMoney(i.value);
    if (f.type === 'number') return i.value.trim() === '' ? null : parseNum(i.value);
    if (f.type === 'range') return Number(i.value);
    return i.value;
  };
  const sync = () => { for (const f of fields) { state[f.name] = read(f.name); const box = el.querySelector(`.field[data-name="${f.name}"]`); if (box && f.show) box.hidden = !f.show(state); } };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-b,.chip,.ip,.cp'); if (!b || !b.isConnected) return;
    const box = b.closest('.field[data-name]'); if (!box || !el.contains(box)) return;
    const f = fieldOf(box.dataset.name); if (!f || !['segmented', 'chips', 'icon', 'color'].includes(f.type)) return;
    if (!('val' in b.dataset) && !b.hasAttribute('data-add')) return;
    if (b.hasAttribute('data-add')) { listeners['add:' + f.name] && listeners['add:' + f.name](); return; }
    const val = b.dataset.val;
    if (f.type === 'chips') { const set = new Set((state[f.name] || []).map(String)); set.has(val) ? set.delete(val) : set.add(val); state[f.name] = (f.options || []).map(o => String(o.value)).filter(x => set.has(x)); b.classList.toggle('on'); }
    else { state[f.name] = f.type === 'segmented' && typeof (f.options[0] || {}).value === 'number' ? Number(val) : val; box.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); }
    sync(); (listeners[f.name] || (() => {}))(state[f.name], state);
  });
  el.addEventListener('input', (e) => { const box = e.target.closest('.field'); if (!box) return; box.classList.remove('bad'); sync(); (listeners[box.dataset.name] || (() => {}))(state[box.dataset.name], state); });
  el.addEventListener('change', (e) => { const box = e.target.closest('.field'); if (!box) return; sync(); (listeners[box.dataset.name] || (() => {}))(state[box.dataset.name], state); });
  setTimeout(sync, 0); sync();
  return {
    el,
    values() { sync(); return { ...state }; },
    on(name, fn) { listeners[name] = fn; },
    set(name, v) { state[name] = v; const box = el.querySelector(`.field[data-name="${name}"]`); if (!box) return; const f = fieldOf(name); const i = box.querySelector('input,select,textarea');
      if (f.type === 'money' && i) i.value = v === null || v === '' || isNaN(v) ? '' : (v / 100).toString().replace('.', ',');
      else if (f.type === 'checkbox' && i) i.checked = !!v; else if (['segmented', 'chips', 'icon', 'color'].includes(f.type)) box.querySelectorAll('[data-val]').forEach(b => b.classList.toggle('on', f.type === 'chips' ? (v || []).map(String).includes(b.dataset.val) : b.dataset.val === String(v)));
      else if (i) i.value = v ?? ''; sync(); },
    setOptions(name, options, value) { const f = fieldOf(name); f.options = options; const box = el.querySelector(`.field[data-name="${name}"]`); const tmp = document.createElement('div'); state[name] = value ?? state[name]; tmp.innerHTML = row(f); box.replaceWith(tmp.firstElementChild); sync(); },
    error(name, msg) { const box = el.querySelector(`.field[data-name="${name}"]`); if (!box) return; box.classList.add('bad'); box.querySelector('.err').textContent = msg; box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    clearErrors() { el.querySelectorAll('.field.bad').forEach(b => { b.classList.remove('bad'); b.querySelector('.err').textContent = ''; }); },
    validate() {
      this.clearErrors(); let ok = true; const v = this.values();
      for (const f of fields) {
        const box = el.querySelector(`.field[data-name="${f.name}"]`); if (!box || box.hidden) continue;
        const x = v[f.name];
        if (f.required && (x === '' || x === null || x === undefined || (Array.isArray(x) && !x.length))) { this.error(f.name, 'Заполните это поле'); ok = false; continue; }
        if ((f.type === 'money' || f.type === 'number') && x !== null && x !== '' && isNaN(x)) { this.error(f.name, 'Введите число'); ok = false; continue; }
        if ((f.type === 'money' || f.type === 'number') && f.min !== undefined && x !== null && x < f.min) { this.error(f.name, f.minMsg || `Не меньше ${f.min}`); ok = false; continue; }
        if (f.type === 'date' && x && !D.valid(x)) { this.error(f.name, 'Неверная дата'); ok = false; }
        if (f.check) { const m = f.check(x, v); if (m) { this.error(f.name, m); ok = false; } }
      }
      return ok;
    }
  };
}

// ---------- мелкие элементы ----------
export function seg(name, options, value, cls = '') {
  return `<div class="seg ${cls}" data-seg="${name}" role="tablist">${options.map(o => `<button type="button" class="seg-b ${o.value === value ? 'on' : ''}" data-val="${esc(o.value)}" role="tab" aria-selected="${o.value === value}">${o.icon ? icon(o.icon) : ''}<span>${esc(o.label)}</span>${o.badge ? `<i class="badge">${esc(o.badge)}</i>` : ''}</button>`).join('')}</div>`;
}
export function empty(text, sub = '', art = '') { return `<div class="empty">${art}<p>${esc(text)}</p>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`; }
export function heading(text, extra = '') { return `<h3 class="hd"><span>${esc(text)}</span>${extra}</h3>`; }
export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export async function shareFile(filename, text, type = 'application/json') {
  try {
    const file = new File([text], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return true; }
  download(filename, text, type); return true;
}
export function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.onchange = () => { const f = i.files && i.files[0]; i.remove(); resolve(f || null); };
    document.body.appendChild(i); i.click();
  });
}
export function readText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok;
  }
}
export function resizeImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', .82)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    img.src = url;
  });
}
/** Пузырь реплики над персонажем: позиционируется по координатам элемента в сцене. */
export function say(container, anchorEl, text, { ms = 3800, side = 'left', cls = '' } = {}) {
  if (!container || !anchorEl) return;
  container.querySelectorAll('.bubble' + (cls ? '.' + cls : '')).forEach(b => b.remove());
  const b = document.createElement('div'); b.className = `bubble ${side} ${cls}`; b.textContent = text;
  container.appendChild(b);
  const place = () => {
    const cr = container.getBoundingClientRect(), ar = anchorEl.getBoundingClientRect();
    const x = ar.left + ar.width / 2 - cr.left, y = ar.top - cr.top;
    b.style.left = Math.round(clamp(x, 90, cr.width - 90)) + 'px'; b.style.top = Math.round(Math.max(8, y)) + 'px';
  };
  place(); requestAnimationFrame(() => b.classList.add('show'));
  if (ms) setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 400); }, ms);
  return b;
}
