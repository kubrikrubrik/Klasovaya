// boyars.js — Боярская дума: финансовые наблюдения строго по данным пользователя.
// Каждый совет хранит «основание»: периоды, суммы и записи, из которых он выведен.
import * as db from './database.js';
import { icon } from './icons.js';
import { $, $$, esc, D, money, num, plural, pct, modal, sound, sleep, heading, empty } from './ui.js';
import { BOYARS, boyar, setMood } from './art.js';
import { dumaScene } from './scenes.js';
import { select, sumBy } from './analytics.js';

const NOT_ENOUGH = 'Государь, пока у меня маловато сведений. Продолжайте вести записи, и я раскрою вам тайны казны.';
const catName = (id) => { const c = id ? db.get('categories', id) : null; return c ? c.name : 'Без статьи'; };
const tot = (l) => l.reduce((s, o) => s + o.amount, 0);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const range = (a, b) => `${D.dmy(a)} — ${D.dmy(b)}`;
const opsRows = (list, n = 6) => [...list].sort((a, b) => b.amount - a.amount).slice(0, n).map(o => [`${D.dmy(o.date)} · ${o.title || catName(o.categoryId)}`, money(o.amount)]);
function share(x) { if (x >= .5) return 'больше половины'; if (x >= 1 / 3) return 'больше трети'; if (x >= .25) return 'более четверти'; if (x >= .2) return 'около пятой части'; return Math.round(x * 100) + '%'; }
const ratioWord = (r) => r >= 4 ? `в ${Math.floor(r)} раза` : r >= 3 ? 'втрое' : r >= 2 ? 'вдвое' : `в ${num(r, 1)} раза`;
const cat = (o) => o.categoryId || '';

export function computeInsights() {
  const all = db.all('operations').filter(o => o.type !== 'transfer' && o.date <= D.today());
  if (all.length < 5) return { enough: false, list: [] };
  const first = all.reduce((m, o) => o.date < m ? o.date : m, '9999'), last = all.reduce((m, o) => o.date > m ? o.date : m, '0000');
  if (D.diff(first, last) < 6) return { enough: false, list: [] };
  const t = D.today(), out = [];
  const W30 = [D.add(t, -29), t], P30 = [D.add(t, -59), D.add(t, -30)], W7 = [D.add(t, -6), t], P7 = [D.add(t, -13), D.add(t, -7)];
  const e30 = select(...W30, { type: 'expense' }), pe30 = select(...P30, { type: 'expense' });
  const e7 = select(...W7, { type: 'expense' }), pe7 = select(...P7, { type: 'expense' });
  const coverPrev30 = first <= P30[0] || D.diff(first, P30[1]) >= 20; // предыдущий период покрыт записями
  // 1. сравнение 30 дней
  if (e30.length >= 5 && pe30.length >= 5 && coverPrev30) {
    const a = tot(e30), b = tot(pe30), d = pct(a, b);
    if (d !== null && Math.abs(d) >= 3) out.push({ key: 'cmp30', boyar: 'schetov', weight: 6, text: `Государь, за последние 30 дней расходы составили ${money(a, { round: true })} — на ${Math.abs(d)}% ${d > 0 ? 'больше' : 'меньше'}, чем за предыдущие 30 дней (${money(b, { round: true })}).`,
      basis: { rows: [[`Последние 30 дней (${range(...W30)})`, money(a)], ['Операций', String(e30.length)], [`Предыдущие 30 дней (${range(...P30)})`, money(b)], ['Операций', String(pe30.length)]] } });
  }
  // 2. сравнение 7 дней
  if (e7.length >= 3 && pe7.length >= 3 && first <= P7[0]) {
    const a = tot(e7), b = tot(pe7), diff = a - b;
    if (Math.abs(diff) >= 500) out.push({ key: 'cmp7', boyar: 'schetov', weight: 5, text: `За последние 7 дней вы потратили на ${money(Math.abs(diff), { round: true })} ${diff < 0 ? 'меньше' : 'больше'}, чем за предыдущие 7 дней: ${money(a, { round: true })} против ${money(b, { round: true })}.`,
      basis: { rows: [[`Последние 7 дней (${range(...W7)})`, money(a)], [`Предыдущие 7 дней (${range(...P7)})`, money(b)], ['Разница', money(diff, { sign: true })]] } });
  }
  // 3–4. рост и снижение по статьям
  if (coverPrev30 && pe30.length >= 5) {
    const ca = sumBy(e30), cb = sumBy(pe30);
    for (const id of new Set([...ca.keys(), ...cb.keys()])) {
      const a = ca.get(id) || 0, b = cb.get(id) || 0; const d = pct(a, b);
      if (b >= 50000 && d !== null && d >= 25 && a - b >= 100000) out.push({ key: 'grow:' + id, boyar: 'trevogin', weight: 8 + Math.min(4, d / 25), text: `Государь, за последние 30 дней вы потратили на «${catName(id)}» на ${d}% больше, чем за предыдущие 30 дней: ${money(a, { round: true })} против ${money(b, { round: true })}.`,
        basis: { rows: [[`«${catName(id)}», ${range(...W30)}`, money(a)], [`«${catName(id)}», ${range(...P30)}`, money(b)], ...opsRows(e30.filter(o => cat(o) === id), 5)] } });
      if (b >= 100000 && d !== null && d <= -25 && b - a >= 100000) out.push({ key: 'drop:' + id, boyar: 'radostin', weight: 7, text: `Хвала бережливости! На «${catName(id)}» за последние 30 дней ушло ${money(a, { round: true })} — на ${Math.abs(d)}% меньше, чем месяцем ранее (${money(b, { round: true })}).`,
        basis: { rows: [[`«${catName(id)}», ${range(...W30)}`, money(a)], [`«${catName(id)}», ${range(...P30)}`, money(b)]] } });
    }
  }
  // 5. крупнейшая доля
  const win = e30.length >= 5 ? e30 : null;
  if (win) {
    const m = sumBy(win), all30 = tot(win); const top = [...m.entries()].sort((a, b) => b[1] - a[1]);
    if (top.length && all30 > 0 && top[0][1] / all30 >= .2) {
      const [id, v] = top[0];
      out.push({ key: 'share:' + id, boyar: 'puzatov', weight: 6, text: `${share(v / all30)[0].toUpperCase() + share(v / all30).slice(1)} всех ваших расходов за последние 30 дней приходится на «${catName(id)}» — ${money(v, { round: true })} из ${money(all30, { round: true })}.`,
        basis: { rows: top.slice(0, 7).map(([k, x]) => [`«${catName(k)}»`, `${money(x)} · ${Math.round(x / all30 * 100)}%`]) } });
    }
    // 6. изменение структуры
    if (coverPrev30 && pe30.length >= 5) {
      const pm = sumBy(pe30), pall = tot(pe30);
      for (const [id, v] of m) { const s1 = v / all30, s0 = (pm.get(id) || 0) / (pall || 1); if (Math.abs(s1 - s0) >= .1 && pall) out.push({ key: 'struct:' + id, boyar: 'puzatov', weight: 5, text: `Доля «${catName(id)}» в ваших расходах ${s1 > s0 ? 'выросла' : 'снизилась'} с ${Math.round(s0 * 100)}% до ${Math.round(s1 * 100)}% по сравнению с предыдущими 30 днями.`,
        basis: { rows: [[`Доля за ${range(...W30)}`, Math.round(s1 * 100) + '%'], [`Доля за ${range(...P30)}`, Math.round(s0 * 100) + '%'], ['Сумма сейчас', money(v)], ['Сумма тогда', money(pm.get(id) || 0)]] } }); }
    }
  }
  // 7. подписки и повторяющиеся платежи
  const subCats = db.all('categories').filter(c => /подпис|связь|интернет|телефон/i.test(c.name)).map(c => c.id);
  const subs = e30.filter(o => subCats.includes(o.categoryId));
  if (subs.length >= 3 || tot(subs) >= 150000) {
    const s = tot(subs), all30 = tot(e30);
    out.push({ key: 'subs', boyar: 'podpiskin', weight: 7, text: `Похоже, милорд, подписки незаметно съедают вашу казну: за последние 30 дней на «${[...new Set(subs.map(o => catName(o.categoryId)))].join('», «')}» ушло ${money(s, { round: true })} — ${subs.length} ${plural(subs.length, ['платёж', 'платежа', 'платежей'])}${all30 ? `, ${Math.round(s / all30 * 100)}% всех трат` : ''}.`,
      basis: { rows: opsRows(subs, 10) } });
  }
  const byTitle = new Map();
  for (const o of all.filter(o => o.type === 'expense' && o.title)) { const k = o.title.trim().toLowerCase(); if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(o); }
  const repeats = [];
  for (const [, l] of byTitle) {
    const months = new Set(l.map(o => o.date.slice(0, 7))); if (months.size < 2) continue;
    const med = median(l.map(o => o.amount)); const stable = l.filter(o => Math.abs(o.amount - med) <= med * .15);
    if (stable.length >= 2 && new Set(stable.map(o => o.date.slice(0, 7))).size >= 2) repeats.push({ title: l[0].title, med, n: stable.length, last: stable.sort((a, b) => b.date.localeCompare(a.date))[0] });
  }
  if (repeats.length) out.push({ key: 'repeats', boyar: 'podpiskin', weight: 6, text: `Я приметил повторяющиеся платежи: ${repeats.slice(0, 3).map(r => `«${r.title}» около ${money(r.med, { round: true })}`).join(', ')}. Вместе это примерно ${money(repeats.reduce((s, r) => s + r.med, 0), { round: true })} в месяц.`,
    basis: { rows: repeats.map(r => [`«${r.title}» — ${r.n} раз, последний ${D.dmy(r.last.date)}`, money(r.med)]) } });
  const rules = db.all('recurring').filter(r => r.active && r.type === 'expense');
  if (rules.length) { const perMonth = rules.reduce((s, r) => s + r.amount * ({ daily: 30, weekly: 4.33, monthly: 1, yearly: 1 / 12 }[r.freq] || 1), 0); out.push({ key: 'rules', boyar: 'podpiskin', weight: 4, text: `Регулярных расходов у вас ${rules.length} — в среднем около ${money(Math.round(perMonth), { round: true })} в месяц по правилам казначея.`, basis: { rows: rules.map(r => [r.title || catName(r.categoryId), money(r.amount)]) } }); }
  // 8. необычные покупки
  const cand = [];
  for (const [id, list] of groupBy(all.filter(o => o.type === 'expense'), cat)) {
    if (list.length < 4) continue; const med = median(list.map(o => o.amount));
    for (const o of e30.filter(o => cat(o) === id)) if (med > 0 && o.amount >= 100000 && o.amount / med >= 3) cand.push({ o, med, r: o.amount / med, n: list.length });
  }
  cand.sort((a, b) => b.r - a.r);
  if (cand.length) { const { o, med, r, n } = cand[0]; out.push({ key: 'odd:' + o.id, boyar: 'dikovinov', weight: 7, text: `Диковинная трата, государь: ${money(o.amount, { round: true })} на «${catName(o.categoryId)}» ${D.dm(o.date)}${o.title ? ` («${o.title}»)` : ''} — ${ratioWord(r)} больше обычной покупки в этой статье.`,
    basis: { rows: [['Эта трата', money(o.amount)], [`Медиана по статье (${n} ${plural(n, ['запись', 'записи', 'записей'])})`, money(Math.round(med))], ...opsRows(all.filter(x => x.type === 'expense' && cat(x) === cat(o)), 5)] } }); }
  // 9–10. средний чек и частота
  if (e30.length >= 8) {
    const avg = Math.round(tot(e30) / e30.length);
    const cnt = new Map(); for (const o of e30) cnt.set(cat(o), (cnt.get(cat(o)) || 0) + 1);
    const [fid, fn] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    const fl = e30.filter(o => cat(o) === fid); const favg = Math.round(tot(fl) / fl.length);
    const pavg = pe30.length >= 8 && coverPrev30 ? Math.round(tot(pe30) / pe30.length) : 0;
    out.push({ key: 'avg', boyar: 'chekushkin', weight: 4, text: `Ваш средний чек за последние 30 дней — ${money(avg, { round: true })}${pavg ? ` (${avg > pavg ? 'выше' : 'ниже'}, чем ${money(pavg, { round: true })} месяцем ранее)` : ''}. Чаще всего вы платите за «${catName(fid)}» — ${fn} ${plural(fn, ['раз', 'раза', 'раз'])}.`,
      basis: { rows: [['Расходов за 30 дней', money(tot(e30))], ['Число покупок', String(e30.length)], ['Средний чек', money(avg)], ...(pavg ? [['Средний чек за предыдущие 30 дней', money(pavg)]] : [])] } });
    const days = Math.max(1, D.diff(first > W30[0] ? first : W30[0], t) + 1);
    const pfl = pe30.filter(o => cat(o) === fid);
    if (coverPrev30 && pfl.length >= 4 && fn >= pfl.length * 1.3 && favg <= (tot(pfl) / pfl.length) * .85) out.push({ key: 'freqUp:' + fid, boyar: 'chekushkin', weight: 8, text: `Вы стали чаще покупать «${catName(fid)}» небольшими партиями: ${fn} раз против ${pfl.length}, в среднем по ${money(favg, { round: true })} вместо ${money(Math.round(tot(pfl) / pfl.length), { round: true })}. Возможно, стоит пересмотреть планирование закупок.`,
      basis: { rows: [[`${range(...W30)}: покупок`, String(fn)], ['Средняя покупка', money(favg)], [`${range(...P30)}: покупок`, String(pfl.length)], ['Средняя покупка', money(Math.round(tot(pfl) / pfl.length))]] } });
    else if (fn >= 6) out.push({ key: 'freq:' + fid, boyar: 'chekushkin', weight: 5, text: `«${catName(fid)}» вы покупали ${fn} ${plural(fn, ['раз', 'раза', 'раз'])} за ${days} ${plural(days, ['день', 'дня', 'дней'])} — примерно раз в ${num(days / fn, 1)} дня, в среднем по ${money(favg, { round: true })}. Крупные закупки по списку обычно выходят дешевле частых мелких.`,
      basis: { rows: [['Период', range(first > W30[0] ? first : W30[0], t)], ['Покупок', String(fn)], ['Сумма', money(tot(fl))], ['Средняя покупка', money(favg)], ...opsRows(fl, 4)] } });
  }
  // 11. баланс месяца и накопления
  const ms = D.monthStart(t); const mi = select(ms, t, { type: 'income' }), me = select(ms, t, { type: 'expense' });
  if (mi.length + me.length >= 5) {
    const a = tot(mi), b = tot(me);
    if (a > 0) out.push({ key: 'save:' + ms, boyar: 'letopiscev', weight: 6, text: a >= b ? `В этом месяце казна прибавила ${money(a - b, { round: true })}: доходы ${money(a, { round: true })}, расходы ${money(b, { round: true })}. Вы сберегли ${Math.round((a - b) / a * 100)}% доходов.` : `В этом месяце расходы (${money(b, { round: true })}) превысили доходы (${money(a, { round: true })}) на ${money(b - a, { round: true })}. Летопись советует присмотреться к крупным статьям.`,
      basis: { rows: [['Период', range(ms, t)], ['Доходы', money(a)], ['Расходы', money(b)], ['Итог', money(a - b, { sign: true })]] } });
  }
  // 12. максимум за три месяца
  const m1 = D.addMonths(ms, -1, 1), m2 = D.addMonths(ms, -2, 1);
  if (first <= m2) {
    const c0 = sumBy(me), c1 = sumBy(select(m1, D.monthEnd(m1), { type: 'expense' })), c2 = sumBy(select(m2, D.monthEnd(m2), { type: 'expense' }));
    for (const [id, v] of c0) { const p = Math.max(c1.get(id) || 0, c2.get(id) || 0); if (v >= 100000 && p > 0 && v > p) out.push({ key: 'max3:' + id + ms, boyar: 'trevogin', weight: 7, text: `В этом месяце расходы на «${catName(id)}» достигли максимума за последние три месяца: ${money(v, { round: true })}.`, basis: { rows: [[D.month(ms), money(v)], [D.month(m1), money(c1.get(id) || 0)], [D.month(m2), money(c2.get(id) || 0)]] } }); }
  }
  // 13. дни недели
  if (D.diff(first, t) >= 20) {
    const from = first > D.add(t, -89) ? first : D.add(t, -89); const ex = select(from, t, { type: 'expense' });
    const s = [0, 0, 0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0, 0, 0]; for (let d = from; d <= t; d = D.add(d, 1)) n[D.dow(d)]++; for (const o of ex) s[D.dow(o.date)] += o.amount;
    const avg = s.map((v, i) => n[i] ? v / n[i] : 0); const i = avg.indexOf(Math.max(...avg)); const others = avg.filter((_, k) => k !== i); const oavg = others.reduce((a, b) => a + b, 0) / (others.length || 1);
    const WDN = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
    if (oavg > 0 && avg[i] >= oavg * 1.4) out.push({ key: 'wd' + i, boyar: 'letopiscev', weight: 4, text: `Больше всего вы тратите по ${WDN[i]}: в среднем ${money(Math.round(avg[i]), { round: true })} в день против ${money(Math.round(oavg), { round: true })} в остальные дни.`, basis: { rows: avg.map((v, k) => [D.weekday(D.add(D.weekStart(t), k)), money(Math.round(v))]) } });
  }
  // 14. дни без трат
  const from30 = first > W30[0] ? first : W30[0]; const spentDays = new Set(select(from30, t, { type: 'expense' }).map(o => o.date));
  const span = D.diff(from30, t) + 1, free = span - spentDays.size;
  if (span >= 10 && free >= 2) out.push({ key: 'free:' + t, boyar: 'radostin', weight: 3, text: `По записям, за последние ${span} ${plural(span, ['день', 'дня', 'дней'])} было ${free} ${plural(free, ['день', 'дня', 'дней'])} совсем без трат. Каждый такой день — маленькая победа!`, basis: { rows: [['Период', range(from30, t)], ['Дней с тратами', String(spentDays.size)], ['Дней без трат', String(free)]] } });
  return { enough: true, list: out };
}
function groupBy(list, fn) { const m = new Map(); for (const x of list) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

// ---------- экран ----------
let el, cur = null, queue = [], qi = 0, showBasis = false;
const POS = [[190, 446, .5], [345, 446, .5], [855, 446, .5], [1010, 446, .5], [110, 486, .58], [430, 486, .58], [770, 486, .58], [1090, 486, .58]];
export const screen = {
  mount(root) {
    el = root;
    root.innerHTML = `<div class="screen-head"><h1>Боярская дума</h1><span class="sub">советы по вашей казне</span><span class="grow"></span></div>
      <div class="scene-box duma-box"><svg class="art scene" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice">${dumaScene()}</svg></div>
      <div class="insight-scroll"><div class="roller"></div><div class="sheet"><div class="insight-body"></div></div><div class="roller"></div></div>`;
    const holder = root.querySelector('.boyars-holder');
    holder.innerHTML = BOYARS.map((b, i) => { const [x, y, s] = POS[i]; return `<g class="slot-wrap" data-i="${i}" transform="translate(${x - 80 * s} ${y - 350 * s}) scale(${s})"><g class="boyar-slot" data-b="${b.id}" style="transform-origin:80px 350px">${boyar(b)}</g></g>`; }).join('');
    $$('.boyar', root).forEach((b, i) => b.style.setProperty('--bd', (-i * .7) + 's'));
    root.addEventListener('click', onClick);
  },
  async show() { await enter(); },
  hide() {}
};
function pickQueue() {
  const { enough, list } = computeInsights();
  if (!enough || !list.length) return [];
  const log = new Map(db.all('insightLog').map(x => [x.id, x]));
  return list.map(x => ({ ...x, seen: (log.get(x.key) || {}).lastShown || 0 })).sort((a, b) => (a.seen - b.seen) || (b.weight - a.weight));
}
async function enter() {
  queue = pickQueue(); qi = 0; showBasis = false;
  const body = el.querySelector('.insight-body'); body.innerHTML = `<p class="insight muted">Бояре входят в палату…</p>`;
  reset();
  const boyars = $$('.boyar', el);
  if (!document.body.classList.contains('anim-off')) {
    boyars.forEach(b => { setMood(b, 'bow'); b.classList.remove('bowing'); void b.getBoundingClientRect(); b.classList.add('bowing'); });
    sound.play('bow');
    await sleep(2150);
    boyars.forEach(b => { b.classList.remove('bowing'); setMood(b, 'idle'); });
  }
  present();
}
function reset() { $$('.boyar-slot', el).forEach(s => { s.style.transform = ''; s.classList.remove('back'); }); }
async function present() {
  const body = el.querySelector('.insight-body');
  if (!queue.length) {
    const b = BOYARS[Math.floor(Math.random() * BOYARS.length)];
    stepForward(b.id);
    body.innerHTML = `<div class="insight-who">${icon('boyar')}${esc(b.name)}</div><p class="insight">«${esc(NOT_ENOUGH)}»</p><p class="small muted">Советы появятся, когда в книге казначея будет хотя бы 5 записей за неделю и больше. Бояре не выдумывают цифр — только считают ваши.</p>`;
    return;
  }
  cur = queue[qi % queue.length];
  const b = BOYARS.find(x => x.id === cur.boyar) || BOYARS[0];
  stepForward(b.id);
  await db.commit([{ store: 'insightLog', put: { id: cur.key, lastShown: Date.now(), count: ((db.get('insightLog', cur.key) || {}).count || 0) + 1, text: cur.text } }]);
  body.innerHTML = `<div class="insight-who">${icon('boyar')}${esc(b.name)}<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">— ${esc(b.title)}</span></div>
    <p class="insight">«${esc(cur.text)}»</p>
    <div class="insight-acts"><button class="btn btn-ink" data-act="basis">${icon('eye')}На чём основано</button><button class="btn btn-gold" data-act="next" ${queue.length < 2 ? 'disabled' : ''}>${icon('boyar')}Другой совет</button><button class="btn btn-ghost" data-act="all">${icon('list')}Все советы (${queue.length})</button></div>
    <div class="basis" ${showBasis ? '' : 'hidden'}>${basisHTML(cur)}</div>`;
}
function basisHTML(x) { return `<b>Основание совета</b><table>${x.basis.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table><p class="small muted" style="margin:8px 0 0">Расчёт по вашим записям; переводы между кошельками не учитываются.</p>`; }
function stepForward(id) {
  const holder = el.querySelector('.boyars-holder');
  $$('.slot-wrap', el).forEach((w) => {
    const i = +w.dataset.i; const s = w.querySelector('.boyar-slot'); const [x, y, sc] = POS[i];
    if (s.dataset.b === id) {
      const tx = 600, ty = 512, ts = .92; const k = ts / sc;
      const dx = (tx - x) / sc, dy = (ty - y) / sc;
      holder.appendChild(w); void w.getBoundingClientRect();
      s.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(3)})`; s.classList.remove('back');
      const ch = s.querySelector('.boyar'); setMood(ch, 'speak'); setTimeout(() => setMood(ch, 'idle'), 3200);
    } else { s.style.transform = ''; s.classList.add('back'); setMood(s.querySelector('.boyar'), 'idle'); }
  });
}
function onClick(e) {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'basis') { showBasis = !showBasis; el.querySelector('.basis').hidden = !showBasis; return; }
  if (a.dataset.act === 'next') { qi++; showBasis = false; present(); return; }
  if (a.dataset.act === 'all') {
    const m = modal({ title: 'Все советы думы', wide: true, body: `<ul class="ledger all-insights">${queue.map((x, i) => { const b = BOYARS.find(y => y.id === x.boyar); return `<li class="lrow" data-qi="${i}"><span class="cat-ic" style="--c:#7a1f2b">${icon('boyar')}</span><div class="main"><div class="m">${esc(b.name)}</div><div class="t">«${esc(x.text)}»</div></div></li>`; }).join('')}</ul>` });
    m.el.addEventListener('click', (ev) => { const r = ev.target.closest('[data-qi]'); if (r) { qi = +r.dataset.qi; m.close(); present(); } });
  }
}
