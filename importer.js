// importer.js — перенос истории из прежнего приложения (CSV, в т.ч. формат «Тропы фонарей»).
// Ничего не подгоняется молча: нераспознанные строки перечисляются в отчёте, дубли пропускаются.
import * as db from './database.js';
import { esc, D, money, plural, parseMoney } from './ui.js';

export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = [';', '\t', ','].map(d => [d, (firstLine.match(new RegExp(d === '\t' ? '\t' : '\\' + d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') { q = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; continue; }
    cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
  return { delim, rows };
}
const COLS = {
  date: ['дата', 'date', 'день', 'дата операции'], type: ['тип', 'type', 'вид', 'операция'], amount: ['сумма', 'amount', 'sum', 'сумма операции'],
  category: ['категория', 'category', 'статья'], title: ['название', 'описание', 'title', 'description', 'name', 'наименование'],
  note: ['заметка', 'комментарий', 'note', 'comment', 'примечание'], who: ['кто', 'member', 'user', 'пользователь', 'автор'],
  from: ['откуда', 'from', 'счёт', 'счет', 'кошелёк', 'кошелек'], to: ['куда', 'to']
};
const n = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');
export function parseDate(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return fix(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/))) return fix(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/))) return fix('20' + m[3], m[2], m[1]);
  return null;
  function fix(y, mo, d) { const r = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return D.valid(r) ? r : null; }
}
const ICON_GUESS = [[/продукт|еда|бакале|супермаркет/, 'bread'], [/доставк|самокат/, 'courier'], [/кафе|ресторан|кофе/, 'goblet'], [/транспорт|такси|метро|бензин|авто/, 'horse'], [/дом|коммун|квартир|аренд|жкх/, 'house'], [/здоров|аптек|медиц|врач/, 'potion'], [/красот|уход|космет/, 'mirror'], [/связь|подпис|интернет|телефон/, 'bell'], [/игр/, 'dice'], [/развлеч|кино|театр/, 'mask'], [/покуп|маркетплейс|вб|озон/, 'basket'], [/одежд|обув/, 'shirt'], [/подар/, 'gift'], [/путеш|отпуск|поездк/, 'ship'], [/дет/, 'cradle'], [/питом|живот|кот|собак/, 'paw'], [/образ|книг|курс/, 'book'], [/ремонт|инструм/, 'hammer'], [/налог|штраф|пошлин/, 'seal'], [/зарплат|оклад|аванс/, 'wheat'], [/подработ|фриланс|премия/, 'purse'], [/кэшбэк|кешбек|возврат/, 'coins'], [/кредит|долг|ипотек/, 'scroll']];
const guessIcon = (name) => (ICON_GUESS.find(([r]) => r.test(n(name))) || [0, 'star'])[1];
const PALETTE = ['#7a1f2b', '#3d5a3a', '#34506e', '#8e6a22', '#a63a2e', '#6a8455', '#5b3f6e', '#6b4423', '#5d7c98', '#c4553f'];
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/** Анализ файла без записи в базу. Возвращает план импорта и отчёт. */
export function analyzeCSV(text, fileName = '') {
  const { delim, rows } = parseCSV(text);
  if (rows.length < 2) return { ok: false, reason: 'В файле нет строк с данными (нужна строка заголовков и хотя бы одна строка операции).' };
  const head = rows[0].map(n); const idx = {};
  for (const [k, names] of Object.entries(COLS)) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) idx[k] = i; }
  if (idx.date === undefined || idx.amount === undefined) {
    return { ok: false, header: rows[0], reason: `Не найдены обязательные столбцы ${idx.date === undefined ? '«Дата»' : ''}${idx.date === undefined && idx.amount === undefined ? ' и ' : ''}${idx.amount === undefined ? '«Сумма»' : ''}. Распознанные заголовки: ${rows[0].map(h => '«' + h + '»').join(', ')}.` };
  }
  const cell = (r, k) => idx[k] === undefined ? '' : String(r[idx[k]] ?? '').trim();
  const known = new Set(Object.values(idx));
  const extraCols = rows[0].filter((h, i) => !known.has(i) && h.trim());
  const ops = [], errors = [], seen = new Map(); const members = new Set(); const catsNeeded = new Map();
  for (let li = 1; li < rows.length; li++) {
    const r = rows[li]; const line = li + 1;
    const date = parseDate(cell(r, 'date'));
    if (!date) { errors.push({ line, reason: `не распознана дата «${cell(r, 'date')}»`, raw: r.join(delim) }); continue; }
    const rawAmt = cell(r, 'amount'); const k = parseMoney(rawAmt.replace(/^\+/, ''));
    if (isNaN(k)) { errors.push({ line, reason: `не распознана сумма «${rawAmt}»`, raw: r.join(delim) }); continue; }
    if (k === 0) { errors.push({ line, reason: 'нулевая сумма', raw: r.join(delim) }); continue; }
    const tRaw = n(cell(r, 'type'));
    let type = /перев|transfer/.test(tRaw) ? 'transfer' : /расх|expens|spend|списан/.test(tRaw) ? 'expense' : /дох|incom|поступ|зачисл/.test(tRaw) ? 'income' : (tRaw ? null : (k < 0 ? 'expense' : 'income'));
    if (!type) { errors.push({ line, reason: `неизвестный тип операции «${cell(r, 'type')}»`, raw: r.join(delim) }); continue; }
    const amount = Math.abs(k);
    const category = cell(r, 'category'), title = cell(r, 'title'), note = cell(r, 'note'), who = cell(r, 'who'), from = cell(r, 'from'), to = cell(r, 'to');
    const extra = extraCols.length ? rows[0].map((h, i) => !known.has(i) && h.trim() && String(r[i] || '').trim() ? `${h}: ${String(r[i]).trim()}` : '').filter(Boolean).join('; ') : '';
    const sig = [date, type, amount, n(category), n(title), n(note), n(who), n(from), n(to)].join('|');
    const occ = (seen.get(sig) || 0) + 1; seen.set(sig, occ);
    const importKey = 'imp_' + hash(sig) + '_' + occ;
    if (who) members.add(who);
    if (type !== 'transfer' && category) { const key = (type === 'income' ? 'i:' : 'e:') + n(category); if (!catsNeeded.has(key)) catsNeeded.set(key, { kind: type, name: category }); }
    ops.push({ line, date, type, amount, category, title, note: [note, extra].filter(Boolean).join(' · '), who, from, to, importKey });
  }
  if (!ops.length) return { ok: false, reason: `Ни одна строка не распознана (${errors.length} ${plural(errors.length, ['ошибка', 'ошибки', 'ошибок'])}). Первая: строка ${errors[0] ? errors[0].line + ' — ' + errors[0].reason : '?'}.`, errors };
  // сопоставление с базой
  const existingKeys = new Set(db.all('operations').map(o => o.importKey).filter(Boolean));
  const dups = ops.filter(o => existingKeys.has(o.importKey)); const fresh = ops.filter(o => !existingKeys.has(o.importKey));
  const catMap = new Map(); const newCats = [];
  for (const [key, c] of catsNeeded) {
    const ex = db.all('categories').find(x => x.kind === c.kind && n(x.name) === n(c.name));
    if (ex) catMap.set(key, ex.id); else { const id = db.uid('c'); catMap.set(key, id); newCats.push({ id, kind: c.kind, name: c.name, icon: guessIcon(c.name), color: PALETTE[newCats.length % PALETTE.length], order: db.all('categories').filter(x => x.kind === c.kind).length + newCats.filter(x => x.kind === c.kind).length, createdAt: Date.now(), imported: true }); }
  }
  const sum = (t) => fresh.filter(o => o.type === t).reduce((s, o) => s + o.amount, 0);
  const dates = ops.map(o => o.date).sort();
  return { ok: true, fileName, delim, total: rows.length - 1, ops, fresh, dups, errors, newCats, catMap, members: [...members], extraCols,
    stats: { expense: { n: fresh.filter(o => o.type === 'expense').length, sum: sum('expense') }, income: { n: fresh.filter(o => o.type === 'income').length, sum: sum('income') }, transfer: { n: fresh.filter(o => o.type === 'transfer').length, sum: sum('transfer') } },
    from: dates[0], to: dates[dates.length - 1] };
}
export async function applyImport(plan) {
  const ops = [];
  for (const c of plan.newCats) ops.push({ store: 'categories', put: c });
  for (const o of plan.fresh) {
    const catId = o.type === 'transfer' || !o.category ? null : plan.catMap.get((o.type === 'income' ? 'i:' : 'e:') + n(o.category)) || null;
    ops.push({ store: 'operations', put: { id: 'op_' + o.importKey, type: o.type, amount: o.amount, categoryId: catId, title: o.title, note: o.note, date: o.date, member: o.who, place: '', from: o.from, to: o.to, recurringId: null, importKey: o.importKey, createdAt: Date.now() } });
  }
  // члены семьи: заменяем стартовые «Государь/Государыня», если ими ещё не пользовались
  const cur = db.setting('members', []) || []; const used = new Set(db.all('operations').map(o => o.member).filter(Boolean));
  let members = cur;
  if (plan.members.length) { const defaults = ['Государь', 'Государыня']; const keep = cur.filter(m => !defaults.includes(m) || used.has(m)); members = [...new Set([...keep, ...plan.members])]; }
  ops.push({ store: 'settings', put: { key: 'members', value: members } });
  if (plan.fresh.length) await db.createSnapshot('Перед импортом истории');
  await db.commit(ops);
  const report = { at: Date.now(), file: plan.fileName, total: plan.total, imported: plan.fresh.length, duplicates: plan.dups.length, errors: plan.errors.length, stats: plan.stats, newCats: plan.newCats.map(c => c.name), members, from: plan.from, to: plan.to };
  await db.commit([{ store: 'meta', put: { key: 'lastImport', value: report } }]);
  db.journal('import', `Импорт «${plan.fileName}»: записано ${plan.fresh.length}, дублей пропущено ${plan.dups.length}, ошибок ${plan.errors.length}`);
  return report;
}
export function planHTML(plan) {
  if (!plan.ok) return `<div class="report"><p class="bad">Импорт невозможен</p><p>${esc(plan.reason)}</p>
    <p>Подходящий формат — CSV (разделитель «;» или «,»), первая строка — заголовки. Обязательные столбцы: <b>Дата</b> (ГГГГ-ММ-ДД или ДД.ММ.ГГГГ) и <b>Сумма</b>. Необязательные: Тип (Доход/Расход/Перевод; без него расход — отрицательная сумма), Категория, Название, Заметка, Кто, Откуда, Куда.</p>
    <p class="small muted">Пример строки: <code>"2026-11-01";"Расход";-3474;"Игры";"Сплитфикшн";"";"Егор";"";""</code></p>
    ${plan.errors && plan.errors.length ? `<p>Ошибки:</p><ul>${plan.errors.slice(0, 8).map(e => `<li>строка ${e.line}: ${esc(e.reason)}</li>`).join('')}</ul>` : ''}</div>`;
  const s = plan.stats;
  return `<div class="report"><p>Файл <b>${esc(plan.fileName)}</b>: ${plan.total} ${plural(plan.total, ['строка', 'строки', 'строк'])} с ${D.dmy(plan.from)} по ${D.dmy(plan.to)}.</p>
    <ul><li class="ok">Будет записано: ${plan.fresh.length}</li>
      <li>расходов — ${s.expense.n} на ${money(s.expense.sum)}</li><li>доходов — ${s.income.n} на ${money(s.income.sum)}</li>
      ${s.transfer.n ? `<li>переводов между своими кошельками — ${s.transfer.n} на ${money(s.transfer.sum)}: сохранятся в истории, но не изменят общую казну и аналитику (деньги не уходили из семьи)</li>` : ''}
      ${plan.dups.length ? `<li class="warn">Уже были импортированы раньше (пропущены как дубли): ${plan.dups.length}</li>` : ''}
      ${plan.errors.length ? `<li class="bad">Не распознано строк: ${plan.errors.length}</li>` : ''}</ul>
    ${plan.newCats.length ? `<p>Новые статьи будут созданы: ${plan.newCats.map(c => `«${esc(c.name)}» (${c.kind === 'income' ? 'доход' : 'расход'})`).join(', ')}.</p>` : '<p>Все статьи из файла уже есть в казне.</p>'}
    ${plan.members.length ? `<p>Кто вёл записи: ${plan.members.map(esc).join(', ')} — имена появятся в поле «Кто».</p>` : ''}
    ${plan.extraCols.length ? `<p class="small">Дополнительные столбцы (${plan.extraCols.map(esc).join(', ')}) будут сохранены в комментарии операций.</p>` : ''}
    ${plan.errors.length ? `<details><summary>Нераспознанные строки</summary><ul>${plan.errors.slice(0, 30).map(e => `<li>строка ${e.line}: ${esc(e.reason)}</li>`).join('')}</ul></details>` : ''}
    <p class="small muted">Исходные даты сохраняются. Начального остатка в файле нет: казна будет равна разнице доходов и расходов из файла. Реальный остаток можно указать ниже или позже в настройках.</p></div>`;
}
