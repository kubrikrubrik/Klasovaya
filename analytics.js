// analytics.js — аналитика казны: периоды, сравнения и графики в стилистике рукописной книги.
import * as db from './database.js';
import { icon } from './icons.js';
import { $, $$, esc, D, money, moneyShort, num, plural, pct, heading, empty } from './ui.js';

export const PERIODS = [
  ['today', 'Сегодня'], ['yesterday', 'Вчера'], ['week', 'Текущая неделя'], ['pweek', 'Прошлая неделя'], ['month', 'Текущий месяц'], ['pmonth', 'Прошлый месяц'],
  ['d7', '7 дней'], ['d30', '30 дней'], ['d90', '90 дней'], ['custom', 'Свой период']
];
/** Возвращает {from,to,label, prev:{from,to,label}} — prev сопоставим по длине и положению. */
export function periodRange(p, from, to) {
  const t = D.today();
  const mk = (a, b, label, pa, pb, plabel) => ({ from: a, to: b, label, days: D.diff(a, b) + 1, prev: { from: pa, to: pb, label: plabel } });
  switch (p) {
    case 'today': return mk(t, t, 'сегодня', D.add(t, -1), D.add(t, -1), 'вчера');
    case 'yesterday': { const y = D.add(t, -1); return mk(y, y, 'вчера', D.add(t, -2), D.add(t, -2), 'позавчера'); }
    case 'week': { const s = D.weekStart(t), n = D.diff(s, t); return mk(s, t, 'текущая неделя', D.add(s, -7), D.add(s, -7 + n), 'те же дни прошлой недели'); }
    case 'pweek': { const s = D.add(D.weekStart(t), -7); return mk(s, D.add(s, 6), 'прошлая неделя', D.add(s, -7), D.add(s, -1), 'позапрошлая неделя'); }
    case 'month': { const s = D.monthStart(t), ps = D.addMonths(s, -1, 1), dayN = D.parse(t).getDate(); const pe = D.addMonths(ps, 0, Math.min(dayN, D.dim(D.parse(ps).getFullYear(), D.parse(ps).getMonth()))); return mk(s, t, 'текущий месяц', ps, pe, 'те же дни прошлого месяца'); }
    case 'pmonth': { const s = D.addMonths(D.monthStart(t), -1, 1), ps = D.addMonths(s, -1, 1); return mk(s, D.monthEnd(s), D.month(s), ps, D.monthEnd(ps), D.month(ps)); }
    case 'd7': case 'd30': case 'd90': { const n = +p.slice(1); return mk(D.add(t, -(n - 1)), t, `последние ${n} дней`, D.add(t, -(2 * n - 1)), D.add(t, -n), `предыдущие ${n} дней`); }
    case 'custom': { const a = from && D.valid(from) ? from : D.add(t, -29), b = to && D.valid(to) ? to : t; const [x, y] = a <= b ? [a, b] : [b, a]; const n = D.diff(x, y) + 1; return mk(x, y, `${D.dmy(x)} — ${D.dmy(y)}`, D.add(x, -n), D.add(x, -1), 'предыдущий такой же период'); }
  }
  return periodRange('month');
}
export function select(from, to, { type, member } = {}) {
  return db.all('operations').filter(o => o.type !== 'transfer' && o.date >= from && o.date <= to && (!type || o.type === type) && (!member || o.member === member));
}
export function sumBy(list, key = 'categoryId') {
  const m = new Map(); for (const o of list) m.set(o[key] || '', (m.get(o[key] || '') || 0) + o.amount); return m;
}
const total = (l) => l.reduce((s, o) => s + o.amount, 0);
const catOf = (id) => id ? db.get('categories', id) : null;
const FALLBACK = ['#7a1f2b', '#c9a043', '#3d5a3a', '#34506e', '#a63a2e', '#6a8455', '#5b3f6e', '#8e6a22', '#5d7c98', '#c4553f', '#6b4423', '#4a4a4a'];
function colorize(rows) { const used = new Set(); let k = 0; return rows.map(r => { let c = r.color; if (!c || used.has(c)) { while (used.has(FALLBACK[k % FALLBACK.length]) && k < 40) k++; c = FALLBACK[k++ % FALLBACK.length]; } used.add(c); return { ...r, color: c }; }); }
export function catRows(list, limit = 8) {
  const m = sumBy(list); const all = total(list);
  let rows = [...m.entries()].map(([id, v]) => { const c = catOf(id); return { id, label: c ? c.name : 'Без статьи', value: v, color: c ? c.color : '#8a7058', icon: c ? c.icon : 'star', share: all ? v / all : 0 }; }).sort((a, b) => b.value - a.value);
  if (rows.length > limit) { const rest = rows.slice(limit - 1); rows = rows.slice(0, limit - 1).concat([{ id: '__rest', label: `Остальное (${rest.length})`, value: total(rest.map(r => ({ amount: r.value }))), color: '#b9a98a', icon: 'more', share: rest.reduce((s, r) => s + r.share, 0) }]); }
  return colorize(rows);
}

// ---------- графики ----------
const f1 = (n) => Math.round(n * 10) / 10;
export function donutSVG(rows, centerTop, centerBottom) {
  const S = 240, R = 104, r0 = 62, cx = S / 2, cy = S / 2; const tot = rows.reduce((s, x) => s + x.value, 0) || 1;
  let a = -Math.PI / 2, paths = '';
  if (rows.length === 1) paths = `<circle cx="${cx}" cy="${cy}" r="${(R + r0) / 2}" fill="none" stroke="${rows[0].color}" stroke-width="${R - r0}"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#2a1b12" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${r0}" fill="none" stroke="#2a1b12" stroke-width="1.4"/>`;
  else for (const x of rows) {
    const da = x.value / tot * Math.PI * 2; if (da <= 0) continue; const b = a + da; const large = da > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${f1(cx + Math.cos(ang) * rad)} ${f1(cy + Math.sin(ang) * rad)}`;
    paths += `<path d="M${p(R, a)}A${R} ${R} 0 ${large} 1 ${p(R, b)}L${p(r0, b)}A${r0} ${r0} 0 ${large} 0 ${p(r0, a)}Z" fill="${x.color}" stroke="#2a1b12" stroke-width="1.4" stroke-linejoin="round"><title>${esc(x.label)}: ${money(x.value)}</title></path>`;
    a = b;
  }
  return `<svg class="chart" viewBox="0 0 ${S} ${S}" style="max-width:260px;margin:0 auto">${paths}
    <circle cx="${cx}" cy="${cy}" r="${r0 - 8}" fill="#f6ead0" stroke="#c9a043" stroke-width="2" stroke-dasharray="3 3"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" style="font-size:19px;font-weight:700;fill:#2a1b12">${esc(centerTop)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" style="font-size:11px;letter-spacing:.1em">${esc(centerBottom)}</text></svg>`;
}
function legend(rows, tot) {
  return `<ul class="legend">${rows.map(r => `<li><i class="sw" style="background:${r.color}"></i><span class="n">${esc(r.label)}</span><span class="v">${money(r.value, { round: true })}</span><span class="p">${tot ? Math.round(r.value / tot * 100) : 0}%</span></li>`).join('')}</ul>`;
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
export function columnsSVG(buckets) {
  const W = 640, H = 230, L = 52, B = 30, T = 12, iw = W - L - 8, ih = H - B - T;
  const max = niceMax(Math.max(1, ...buckets.map(b => Math.max(b.inc, b.exp))));
  const bw = iw / Math.max(1, buckets.length); const gap = Math.min(6, bw * .22); const w = Math.max(1.5, (bw - gap) / 2);
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = T + ih - ih * i / 4; g += `<line class="grid" x1="${L}" x2="${W - 8}" y1="${f1(y)}" y2="${f1(y)}"/><text x="${L - 6}" y="${f1(y + 4)}" text-anchor="end">${moneyShort(max * i / 4)}</text>`; }
  const step = Math.ceil(buckets.length / 10);
  buckets.forEach((b, i) => {
    const x = L + i * bw + gap / 2;
    const hi = b.inc / max * ih, he = b.exp / max * ih;
    if (b.inc) g += `<rect class="bar-i" x="${f1(x)}" y="${f1(T + ih - hi)}" width="${f1(w)}" height="${f1(hi)}" rx="1.5"><title>${esc(b.label)}: доходы ${money(b.inc)}</title></rect>`;
    if (b.exp) g += `<rect class="bar-e" x="${f1(x + w)}" y="${f1(T + ih - he)}" width="${f1(w)}" height="${f1(he)}" rx="1.5"><title>${esc(b.label)}: расходы ${money(b.exp)}</title></rect>`;
    if (i % step === 0) g += `<text x="${f1(x + w)}" y="${H - 10}" text-anchor="middle">${esc(b.short)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}<line class="ax" x1="${L}" x2="${W - 8}" y1="${T + ih}" y2="${T + ih}"/></svg>`;
}
export function lineSVG(points) {
  const W = 640, H = 210, L = 58, B = 28, T = 14, iw = W - L - 12, ih = H - B - T;
  const vals = points.map(p => p.v); const mx = Math.max(0, ...vals), mn = Math.min(0, ...vals);
  const top = niceMax(Math.max(Math.abs(mx), 1)) * (mx > 0 ? 1 : 0) || 0, bot = -niceMax(Math.max(Math.abs(mn), 1)) * (mn < 0 ? 1 : 0) || 0;
  const hi = top || (bot ? 0 : 1), lo = bot;
  const y = (v) => T + ih - (v - lo) / ((hi - lo) || 1) * ih, x = (i) => L + (points.length > 1 ? i / (points.length - 1) : .5) * iw;
  let g = '';
  [lo, (lo + hi) / 2, hi].forEach(v => { g += `<line class="grid" x1="${L}" x2="${W - 12}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text x="${L - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${moneyShort(v)}</text>`; });
  g += `<line class="ax" x1="${L}" x2="${W - 12}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>`;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${f1(x(i))} ${f1(y(p.v))}`).join('');
  g += `<path class="area" d="${d}L${f1(x(points.length - 1))} ${f1(y(0))}L${f1(x(0))} ${f1(y(0))}Z"/><path class="ln" d="${d}"/>`;
  const step = Math.ceil(points.length / 8);
  points.forEach((p, i) => { if (i % step === 0 || i === points.length - 1) { g += `<circle class="seal" cx="${f1(x(i))}" cy="${f1(y(p.v))}" r="4.5"><title>${esc(p.label)}: ${money(p.v)}</title></circle><text x="${f1(x(i))}" y="${H - 8}" text-anchor="middle">${esc(p.short)}</text>`; } });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
export function compareSVG(rows) { // rows: [{label, cur, prev}]
  const W = 640, rowH = 34, L = 170, R = 96, H = rows.length * rowH + 10, iw = W - L - R;
  const max = Math.max(1, ...rows.map(r => Math.max(r.cur, r.prev)));
  let g = '';
  rows.forEach((r, i) => {
    const y = 6 + i * rowH; const wc = r.cur / max * iw, wp = r.prev / max * iw;
    const d = pct(r.cur, r.prev);
    g += `<text x="${L - 8}" y="${y + 17}" text-anchor="end" style="font-size:13px">${esc(r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label)}</text>
      <rect class="bar-p" x="${L}" y="${y + 3}" width="${f1(Math.max(wp, r.prev ? 1.5 : 0))}" height="10" rx="2"/>
      <rect class="bar-e" x="${L}" y="${y + 15}" width="${f1(Math.max(wc, r.cur ? 1.5 : 0))}" height="12" rx="2"/>
      <text x="${W - 4}" y="${y + 19}" text-anchor="end" style="font-size:13px;font-weight:700;fill:${d === null ? '#8a7058' : d > 0 ? '#9b2c2c' : '#4a6f36'}">${d === null ? (r.cur ? 'новое' : '—') : (d > 0 ? '+' : '') + d + '%'}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
export function weekdaySVG(vals) {
  const W = 640, H = 170, L = 52, B = 26, T = 10, iw = W - L - 8, ih = H - B - T; const max = niceMax(Math.max(1, ...vals)); const bw = iw / 7;
  let g = '';
  for (let i = 0; i <= 2; i++) { const y = T + ih - ih * i / 2; g += `<line class="grid" x1="${L}" x2="${W - 8}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${moneyShort(max * i / 2)}</text>`; }
  vals.forEach((v, i) => { const h = v / max * ih; g += `<rect class="bar-e" x="${f1(L + i * bw + bw * .2)}" y="${f1(T + ih - h)}" width="${f1(bw * .6)}" height="${f1(h)}" rx="2"><title>${D.wds(i)}: ${money(v)}</title></rect><text x="${f1(L + i * bw + bw / 2)}" y="${H - 8}" text-anchor="middle">${D.wds(i)}</text>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}<line class="ax" x1="${L}" x2="${W - 8}" y1="${T + ih}" y2="${T + ih}"/></svg>`;
}
export function buckets(from, to, list) {
  const days = D.diff(from, to) + 1;
  const mode = days <= 35 ? 'day' : days <= 190 ? 'week' : 'month';
  const keyOf = (d) => mode === 'day' ? d : mode === 'week' ? D.weekStart(d) : D.monthStart(d);
  const out = []; const idx = new Map();
  let k = keyOf(from);
  while (k <= to) {
    const lab = mode === 'day' ? D.dm(k) : mode === 'week' ? `неделя с ${D.dm(k)}` : D.month(k);
    const short = mode === 'day' ? String(D.parse(k).getDate()) : mode === 'week' ? D.short(k) : D.monthShort(D.parse(k).getMonth());
    idx.set(k, out.length); out.push({ key: k, label: lab, short, inc: 0, exp: 0 });
    k = mode === 'day' ? D.add(k, 1) : mode === 'week' ? D.add(k, 7) : D.addMonths(k, 1, 1);
  }
  for (const o of list) { const i = idx.get(keyOf(o.date)); if (i === undefined) continue; if (o.type === 'income') out[i].inc += o.amount; else out[i].exp += o.amount; }
  return { mode, list: out };
}

// ---------- панель аналитики ----------
const A = { period: 'month', from: '', to: '', member: '' };
export function renderAnalytics(box) {
  const pr = periodRange(A.period, A.from, A.to);
  const cur = select(pr.from, pr.to, { member: A.member }), prev = select(pr.prev.from, pr.prev.to, { member: A.member });
  const ci = cur.filter(o => o.type === 'income'), ce = cur.filter(o => o.type === 'expense');
  const pi = prev.filter(o => o.type === 'income'), pe = prev.filter(o => o.type === 'expense');
  const inc = total(ci), exp = total(ce), pinc = total(pi), pexp = total(pe);
  const elapsed = Math.max(1, Math.min(pr.days, D.diff(pr.from, D.today()) + 1));
  const avgDay = Math.round(exp / elapsed), avgCheck = ce.length ? Math.round(exp / ce.length) : 0;
  const pavgCheck = pe.length ? Math.round(pexp / pe.length) : 0;
  const mem = db.setting('members', []) || [];
  const delta = (a, b, invert) => { const d = pct(a, b); if (d === null) return `<span class="d">нет данных за ${esc(pr.prev.label)}</span>`; const good = invert ? d < 0 : d > 0; return `<span class="d" style="color:${d === 0 ? 'var(--ink3)' : good ? 'var(--ok)' : 'var(--bad)'}">${d > 0 ? '+' : ''}${d}% к «${esc(pr.prev.label)}»</span>`; };
  const er = catRows(ce), ir = catRows(ci, 6);
  const bk = buckets(pr.from, pr.to, cur);
  let acc = 0; const cum = bk.list.map(b => { acc += b.inc - b.exp; return { label: b.label, short: b.short, v: acc }; });
  const cmpCats = [...new Set([...sumBy(ce).keys(), ...sumBy(pe).keys()])].map(id => ({ label: catOf(id) ? catOf(id).name : 'Без статьи', cur: sumBy(ce).get(id) || 0, prev: sumBy(pe).get(id) || 0 }))
    .sort((a, b) => (b.cur + b.prev) - (a.cur + a.prev)).slice(0, 8);
  const top = [...ce].sort((a, b) => b.amount - a.amount).slice(0, 10);
  const wd = [0, 0, 0, 0, 0, 0, 0], wdN = [0, 0, 0, 0, 0, 0, 0];
  for (let d = pr.from; d <= pr.to && d <= D.today(); d = D.add(d, 1)) wdN[D.dow(d)]++;
  for (const o of ce) wd[D.dow(o.date)] += o.amount;
  const wdAvg = wd.map((v, i) => wdN[i] ? Math.round(v / wdN[i]) : 0);
  box.innerHTML = `<div class="chips an-periods" style="margin-bottom:8px">${PERIODS.map(([v, l]) => `<button type="button" class="chip ${A.period === v ? 'on' : ''}" data-ap="${v}">${l}</button>`).join('')}</div>
    ${A.period === 'custom' ? `<div class="range-row"><div class="field"><label>С</label><div class="inp"><input type="date" data-af="from" value="${A.from || pr.from}"></div></div><div class="field"><label>По</label><div class="inp"><input type="date" data-af="to" value="${A.to || pr.to}"></div></div></div>` : ''}
    ${mem.length ? `<div class="chips" style="margin:8px 0"><button class="chip ${!A.member ? 'on' : ''}" data-am="">Вся семья</button>${mem.map(m => `<button class="chip ${A.member === m ? 'on' : ''}" data-am="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
    <p class="small muted" style="margin:4px 0 0">${D.dmy(pr.from)} — ${D.dmy(pr.to)} · сравнение: ${esc(pr.prev.label)} (${D.dmy(pr.prev.from)} — ${D.dmy(pr.prev.to)})</p>
    ${!cur.length ? empty('За этот период записей нет', 'Выберите другой период или добавьте операции') : `
    <div class="sum-row">
      <div class="sum"><div class="l">Доходы</div><div class="v inc-c">${money(inc, { round: true })}</div>${delta(inc, pinc)}</div>
      <div class="sum"><div class="l">Расходы</div><div class="v exp-c">${money(exp, { round: true })}</div>${delta(exp, pexp, true)}</div>
      <div class="sum"><div class="l">Чистый поток</div><div class="v" style="color:${inc - exp >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(inc - exp, { sign: true, round: true })}</div><span class="d">доходы минус расходы</span></div>
      <div class="sum"><div class="l">Средние траты</div><div class="v">${money(avgDay, { round: true })}</div><span class="d">в день, за ${elapsed} ${plural(elapsed, ['день', 'дня', 'дней'])}</span></div>
      <div class="sum"><div class="l">Средний чек</div><div class="v">${money(avgCheck, { round: true })}</div>${pavgCheck ? delta(avgCheck, pavgCheck, true) : `<span class="d">${ce.length} ${plural(ce.length, ['покупка', 'покупки', 'покупок'])}</span>`}</div>
    </div>
    <div class="chart-grid">
      <div class="chart-card">${heading('Расходы по статьям')}${er.length ? donutSVG(er, moneyShort(exp), 'РАСХОДЫ') + legend(er, exp) : empty('Расходов нет')}</div>
      <div class="chart-card">${heading('Доходы по статьям')}${ir.length ? donutSVG(ir, moneyShort(inc), 'ДОХОДЫ') + legend(ir, inc) : empty('Доходов нет')}</div>
      <div class="chart-card span2">${heading(`Динамика доходов и расходов · по ${bk.mode === 'day' ? 'дням' : bk.mode === 'week' ? 'неделям' : 'месяцам'}`)}${columnsSVG(bk.list)}<p class="small muted" style="margin:4px 0 0"><i class="who" style="background:#5f8550"></i>доходы <i class="who" style="background:#8d2b37;margin-left:10px"></i>расходы</p></div>
      <div class="chart-card span2">${heading('Чистый денежный поток (накопительно)')}${lineSVG(cum)}</div>
      <div class="chart-card">${heading('Сравнение периодов')}<p class="small muted" style="margin:-4px 0 6px">Светлая полоса — ${esc(pr.prev.label)}, тёмная — ${esc(pr.label)}</p>${cmpCats.length ? compareSVG([{ label: 'Все расходы', cur: exp, prev: pexp }, { label: 'Все доходы', cur: inc, prev: pinc }, ...cmpCats]) : ''}</div>
      <div class="chart-card">${heading('Средние траты по дням недели')}${weekdaySVG(wdAvg)}<table class="small" style="width:100%;margin-top:8px">${er.slice(0, 6).map(r => { const n = ce.filter(o => (o.categoryId || '') === r.id).length; return `<tr><td>${esc(r.label)}</td><td class="muted">${n} ${plural(n, ['раз', 'раза', 'раз'])}</td><td style="text-align:right">средний чек <b>${money(n ? Math.round(r.value / n) : 0, { round: true })}</b></td></tr>`; }).join('')}</table></div>
      <div class="chart-card span2 top-list">${heading('Самые крупные расходы')}<ul class="ledger">${top.map(o => opRowLite(o)).join('')}</ul></div>
    </div>`}`;
  box.onclick = (e) => {
    const p = e.target.closest('[data-ap]'); if (p) { A.period = p.dataset.ap; renderAnalytics(box); return; }
    const m = e.target.closest('[data-am]'); if (m) { A.member = m.dataset.am; renderAnalytics(box); return; }
  };
  box.onchange = (e) => { const t = e.target.closest('[data-af]'); if (t) { A[t.dataset.af] = t.value; renderAnalytics(box); } };
}
function opRowLite(o) {
  const c = catOf(o.categoryId);
  return `<li class="lrow" data-op="${o.id}"><span class="cat-ic" style="--c:${c ? c.color : '#8a7058'}">${icon(c ? c.icon : 'star')}</span><div class="main"><div class="t">${esc(o.title || (c ? c.name : 'Без статьи'))}</div><div class="m">${D.dm(o.date)} · ${esc(c ? c.name : 'Без статьи')}${o.member ? ' · ' + esc(o.member) : ''}</div></div><div class="amt exp">−${money(o.amount)}</div></li>`;
}
