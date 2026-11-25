// settings.js — настройки и управление данными: сохранность, резервные копии, восстановление, импорт.
import * as db from './database.js';
import { icon } from './icons.js';
import { $, $$, esc, D, money, num, plural, modal, form, toast, confirmDialog, heading, empty, sound, shareFile, download, pickFile, readText, parseMoney } from './ui.js';
import { analyzeCSV, applyImport, planHTML } from './importer.js';

let el, swReg = null;
export function setSWReg(r) { swReg = r; }
const DAY = 86400000;
export function backupOverdue() {
  const has = db.count('operations') + db.count('products') + db.count('xpLog') > 0; if (!has) return false;
  const last = db.setting('lastBackupAt', 0) || 0; const inst = (db.get('meta', 'installedAt') || {}).value || Date.now();
  return Date.now() - Math.max(last, inst) > 14 * DAY;
}
export function backupNote() {
  if (!backupOverdue()) return '';
  const last = db.setting('lastBackupAt', 0);
  return `<div class="paper tight" style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap"><span style="color:var(--warn)">${icon('warn')}</span><span style="flex:1">${last ? `Последняя резервная копия была ${Math.floor((Date.now() - last) / DAY)} дн. назад.` : 'Резервной копии ещё не было.'} Данные живут только на этом устройстве — сохраните копию в «Файлы».</span><button class="btn btn-gold sm" data-go="settings">${icon('download')}Сделать копию</button></div>`;
}
export function maybeRemindBackup() {
  if (!backupOverdue()) return;
  const k = db.APP_ID + ':remind'; const t = D.today();
  try { if (localStorage.getItem(k) === t) return; localStorage.setItem(k, t); } catch (_) {}
  setTimeout(() => toast('Давно не было резервной копии. Загляните в «Настройки и данные».', { ms: 7000 }), 3000);
}

export const screen = {
  mount(root) {
    el = root; root.addEventListener('click', onClick); root.addEventListener('change', onChange);
    db.on('*', () => { if (root.classList.contains('active')) updateSaved(); });
  },
  async show() { await render(); },
  hide() {}
};
const counts = () => ({ ops: db.count('operations'), cats: db.count('categories'), rec: db.count('recurring'), q: db.count('quests'), runs: db.count('questRuns'), prod: db.count('products'), cart: db.count('cart'), tre: db.count('treasures') });
function updateSaved() { const s = el.querySelector('.saved-at'); if (s) s.textContent = db.status.lastSavedAt ? D.stamp(db.status.lastSavedAt) : 'ещё не было'; }
async function render() {
  const info = await db.storageInfo(); const snaps = await db.listSnapshots().catch(() => []);
  const integ = (db.get('meta', 'integrity') || {}).value; const imp = (db.get('meta', 'lastImport') || {}).value;
  const c = counts(); const lastB = db.setting('lastBackupAt', 0);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mem = db.setting('members', []) || []; const phr = db.setting('servantPhrases', { up: [], down: [] }) || { up: [], down: [] };
  const journal = db.all('journal').sort((a, b) => b.ts - a.ts).slice(0, 60);
  el.innerHTML = `<div class="screen-head"><h1>Настройки и данные</h1><span class="sub">сохранность казны и кладовой</span><span class="grow"></span></div>
  ${backupNote()}
  <div class="set-grid">
    <div class="paper">${heading('Сохранность')}
      <div class="set-row"><div class="l">Последнее сохранение<small>Каждое изменение записывается сразу</small></div><b class="saved-at">${db.status.lastSavedAt ? D.stamp(db.status.lastSavedAt) : 'ещё не было'}</b></div>
      <div class="set-row"><div class="l">Хранилище<small>IndexedDB на этом устройстве${info.usage !== null ? ` · занято ${num(info.usage / 1048576, 1)} МБ` : ''}</small></div><span class="pill-ok">${icon('lock')}IndexedDB</span></div>
      <div class="set-row"><div class="l">Защита от автоочистки<small>${info.persisted ? 'Браузер обещает не удалять данные сам' : 'Браузер может очистить данные при нехватке места. Установите приложение на экран «Домой» и нажмите кнопку.'}</small></div>${info.persisted ? `<span class="pill-ok">${icon('check')}включена</span>` : `<button class="btn btn-ink sm" data-a="persist">${icon('lock')}Включить</button>`}</div>
      <div class="set-row"><div class="l">Проверка целостности<small>${integ ? `${D.stamp(integ.at)} · ${integ.fixed ? `исправлено записей: ${integ.fixed}` : 'всё в порядке'}` : 'ещё не выполнялась'}</small></div><button class="btn btn-ghost sm" data-a="integrity">${icon('repeat')}Проверить</button></div>
      <p class="small muted" style="margin:8px 0 0">Записей: операций ${c.ops}, статей ${c.cats}, регулярных ${c.rec}, заданий ${c.q}, товаров ${c.prod}, в корзине ${c.cart}, сокровищ ${c.tre}.</p>
    </div>
    <div class="paper">${heading('Резервные копии')}
      <div class="set-row"><div class="l">Последняя копия<small>${lastB ? D.stamp(lastB) : 'ещё не создавалась'}</small></div>${lastB && !backupOverdue() ? `<span class="pill-ok">${icon('check')}свежая</span>` : `<span class="pill-warn">${icon('warn')}нужна</span>`}</div>
      <div class="set-actions"><button class="btn btn-gold" data-a="backup">${icon('download')}Создать резервную копию</button><button class="btn btn-ink" data-a="restore">${icon('upload')}Восстановить из файла</button></div>
      <p class="small muted">Копия — один файл JSON со всеми данными: казна, игра, кладовая, настройки. ${isIOS ? 'На iPad выберите «Сохранить в Файлы».' : ''} Перед восстановлением текущее состояние автоматически сохраняется снимком.</p>
      ${heading('Снимки на устройстве')}${snaps.length ? `<ul class="ledger">${snaps.map(s => `<li class="lrow" style="cursor:default;min-height:48px"><span class="cat-ic" style="--c:#8e6a22;width:32px;height:32px">${icon('hourglass')}</span><div class="main"><div class="t" style="font-size:15px">${esc(s.reason)}</div><div class="m">${D.stamp(s.createdAt)} · операций ${(s.counts || {}).operations ?? '—'}, товаров ${(s.counts || {}).products ?? '—'}</div></div><button class="btn btn-ghost sm" data-snap="${s.id}">${icon('undo')}Вернуть</button></li>`).join('')}</ul>` : '<p class="small muted">Снимков пока нет — они создаются ежедневно и перед импортом, восстановлением и сбросом.</p>'}
    </div>
    <div class="paper">${heading('Перенос из прежнего приложения')}
      <p class="small" style="margin-top:0">Выгрузка CSV (например, из «Тропы фонарей»): даты, суммы, статьи, «Кто», переводы. Повторный импорт того же файла не создаст дублей.</p>
      <button class="btn btn-gold" data-a="import-csv">${icon('upload')}Выбрать CSV-файл</button>
      ${imp ? `<div class="basis report"><b>Последний импорт</b> · ${D.stamp(imp.at)}<ul><li>Файл: ${esc(imp.file)}</li><li class="ok">Записано: ${imp.imported} из ${imp.total}</li><li>Дублей пропущено: ${imp.duplicates}</li><li>${imp.errors ? `<span class="bad">Ошибок: ${imp.errors}</span>` : 'Ошибок нет'}</li><li>Расходов ${imp.stats.expense.n} на ${money(imp.stats.expense.sum)}, доходов ${imp.stats.income.n} на ${money(imp.stats.income.sum)}${imp.stats.transfer.n ? `, переводов ${imp.stats.transfer.n}` : ''}</li>${imp.newCats.length ? `<li>Созданы статьи: ${imp.newCats.map(esc).join(', ')}</li>` : ''}</ul></div>` : ''}
    </div>
    <div class="paper">${heading('Казна и семья')}
      <div class="set-row"><div class="l">Начальный остаток<small>Деньги, которые были до первой записи. Влияет только на «Золото в казне».</small></div><b>${money(db.setting('openingBalance', 0) || 0)}</b><button class="icon-btn sm" data-a="opening">${icon('edit')}</button></div>
      <div class="set-row"><div class="l">Кто ведёт записи<small>${mem.length ? mem.map(esc).join(', ') : 'не указано'}</small></div><button class="icon-btn sm" data-a="members">${icon('edit')}</button></div>
      <div class="set-row"><div class="l">Свои фразы слуги<small>При пополнении: ${phr.up.length}, при тратах: ${phr.down.length}</small></div><button class="icon-btn sm" data-a="phrases">${icon('edit')}</button></div>
    </div>
    <div class="paper">${heading('Вид и звук')}
      <div class="set-row"><div class="l">Анимация<small>Умеренная отключает мелкие фоновые эффекты</small></div><div class="seg" data-set="animations">${[['full', 'Полная'], ['low', 'Умеренная'], ['off', 'Без анимации']].map(([v, l]) => `<button class="seg-b ${db.setting('animations', 'full') === v ? 'on' : ''}" data-val="${v}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><div class="l">Звуки</div><label class="check"><input type="checkbox" data-s="sound" ${db.setting('sound', true) ? 'checked' : ''}><span class="box">${icon('check')}</span></label></div>
      <div class="set-row"><div class="l">Громкость</div><input type="range" min="0" max="1" step="0.05" value="${db.setting('volume', .5)}" data-s="volume" style="max-width:180px"><button class="icon-btn sm" data-a="test-sound">${icon('sound')}</button></div>
      <div class="set-row"><div class="l">Компактные списки</div><label class="check"><input type="checkbox" data-s="compact" ${db.setting('compact', false) ? 'checked' : ''}><span class="box">${icon('check')}</span></label></div>
      <div class="set-row"><div class="l">Компактные сцены<small>Меньше иллюстраций — больше места для данных</small></div><label class="check"><input type="checkbox" data-s="compactScenes" ${db.setting('compactScenes', false) ? 'checked' : ''}><span class="box">${icon('check')}</span></label></div>
    </div>
    <div class="paper">${heading('О приложении')}
      <div class="set-row"><div class="l">Версия</div><b>${db.APP_VERSION} · сборка ${db.APP_BUILD}</b></div>
      <div class="set-row"><div class="l">Структура базы / формат копий</div><b>v${db.SCHEMA_VERSION} / v${db.BACKUP_FORMAT}</b></div>
      <div class="set-row"><div class="l">Работа без интернета<small>${'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'включена — файлы приложения сохранены на устройстве' : 'включится после перезапуска приложения') : 'браузер не поддерживает'}</small></div><button class="btn btn-ghost sm" data-a="update">${icon('repeat')}Проверить обновление</button></div>
      <div class="set-row"><div class="l">Режим запуска</div><b>${standalone ? 'с экрана «Домой»' : 'в браузере'}</b></div>
      ${standalone ? '' : `<p class="small">${isIOS ? 'Чтобы установить: в Safari нажмите «Поделиться» → «На экран „Домой“». Пользуйтесь приложением только с иконки — на iPad данные иконки и Safari хранятся раздельно.' : 'Чтобы установить: меню браузера → «Установить приложение» или «Добавить на главный экран».'}</p>`}
    </div>
    <div class="paper">${heading('Журнал событий')}${journal.length ? `<ul class="ledger" style="max-height:340px;overflow:auto">${journal.map(j => `<li class="lrow" style="cursor:default;min-height:40px;padding:6px 2px"><div class="main"><div class="t" style="font-size:14.5px;font-weight:500;white-space:normal">${esc(j.text)}</div><div class="m">${D.stamp(j.ts)}</div></div></li>`).join('')}</ul>` : empty('Событий пока нет')}</div>
    <div class="paper">${heading('Опасная зона')}<p class="small">Полный сброс удалит все данные с этого устройства. Перед сбросом сохраняется снимок, но надёжнее сначала сделать резервную копию.</p><button class="btn btn-danger" data-a="wipe">${icon('trash')}Удалить все данные</button></div>
  </div>`;
}
async function onChange(e) {
  const s = e.target.closest('[data-s]'); if (!s) return;
  const v = s.type === 'checkbox' ? s.checked : s.type === 'range' ? Number(s.value) : s.value;
  await db.setSetting(s.dataset.s, v);
  if (s.dataset.s === 'volume') sound.play('coin');
}
async function onClick(e) {
  const sg = e.target.closest('[data-set] .seg-b'); if (sg) { await db.setSetting(sg.closest('[data-set]').dataset.set, sg.dataset.val); render(); return; }
  const sn = e.target.closest('[data-snap]'); if (sn) {
    if (!await confirmDialog({ title: 'Вернуть снимок?', text: 'Текущие данные будут заменены данными снимка. Перед этим текущее состояние тоже сохранится снимком.', ok: 'Вернуть', danger: true })) return;
    try { await db.restoreSnapshot(sn.dataset.snap); toast('Данные восстановлены из снимка', { kind: 'good' }); render(); } catch (err) { toast('Не удалось: ' + err.message, { kind: 'bad' }); }
    return;
  }
  const a = e.target.closest('[data-a]'); if (!a) return;
  switch (a.dataset.a) {
    case 'persist': { const ok = await db.requestPersist(); toast(ok ? 'Защита включена' : 'Браузер пока не разрешил защиту. Она чаще даётся установленным на экран «Домой» приложениям.', { kind: ok ? 'good' : '' }); render(); break; }
    case 'integrity': { const m = await import('./app.js'); const r = await m.checkIntegrity(); toast(r.fixed ? `Исправлено записей: ${r.fixed}` : 'Проверка пройдена: всё в порядке', { kind: 'good' }); render(); break; }
    case 'backup': return backup();
    case 'restore': return restore();
    case 'import-csv': return importCSV();
    case 'opening': return editOpening();
    case 'members': return editMembers();
    case 'phrases': return editPhrases();
    case 'test-sound': sound.play('coins'); break;
    case 'update': { if (!swReg) { toast('Обновления проверяются, когда приложение открыто с сайта'); break; } try { await swReg.update(); toast(swReg.waiting || swReg.installing ? 'Найдена новая версия — она предложит обновиться' : 'У вас последняя версия'); } catch (_) { toast('Нет связи с сайтом — проверьте интернет'); } break; }
    case 'wipe': return wipe();
  }
}
async function backup() {
  const data = db.exportData();
  const name = `tsarskaya-kazna-${D.today()}.json`;
  const text = JSON.stringify(data);
  await shareFile(name, text, 'application/json');
  await db.setSetting('lastBackupAt', Date.now());
  db.journal('backup', `Создана резервная копия (${Object.values(data.counts).reduce((a, b) => a + b, 0)} записей)`);
  toast('Резервная копия готова. Сохраните файл в надёжное место.', { kind: 'good' });
  render();
}
async function restore() {
  const file = await pickFile('.json,application/json'); if (!file) return;
  let obj; try { obj = JSON.parse(await readText(file)); } catch (e) { modal({ title: 'Файл не прочитан', body: `<p>Это не похоже на резервную копию: ${esc(e.message)}</p>`, actions: [{ label: 'Понятно', kind: 'btn-gold' }] }); return; }
  const v = db.validateBackup(obj);
  if (!v.ok) { modal({ title: 'Копию нельзя восстановить', body: `<div class="report"><ul>${v.errors.map(x => `<li class="bad">${esc(x)}</li>`).join('')}</ul></div>`, actions: [{ label: 'Понятно', kind: 'btn-gold' }] }); return; }
  const c = v.counts; const cur = counts();
  modal({ title: 'Восстановить из копии?', wide: true, body: `<div class="report"><p>Копия от <b>${v.exportedAt ? D.stamp(Date.parse(v.exportedAt)) : 'неизвестной даты'}</b>, версия приложения ${esc(v.appVersion || '?')}.</p>
    <ul><li>операций: ${c.operations || 0} (сейчас ${cur.ops})</li><li>товаров: ${c.products || 0} (сейчас ${cur.prod})</li><li>заданий: ${c.quests || 0}, выполнений: ${c.questRuns || 0}</li><li>сокровищ: ${c.treasures || 0}</li></ul>
    ${v.warnings.length ? `<ul>${v.warnings.map(w => `<li class="warn">${esc(w)}</li>`).join('')}</ul>` : ''}
    <p class="bad">Все текущие данные на этом устройстве будут заменены содержимым копии.</p><p class="small muted">Перед заменой текущее состояние сохранится снимком — его можно будет вернуть в разделе «Снимки на устройстве».</p></div>`,
    actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Заменить данные', kind: 'btn-danger', icon: 'upload', onClick: async () => {
      await db.replaceAll(v.data, 'Перед восстановлением из файла');
      db.journal('restore', `Данные восстановлены из копии «${file.name}»`);
      toast('Данные восстановлены', { kind: 'good' }); render();
    } }] });
}
async function importCSV() {
  const file = await pickFile('.csv,text/csv,text/plain'); if (!file) return;
  let text; try { text = await readText(file); } catch (e) { toast('Не удалось прочитать файл', { kind: 'bad' }); return; }
  const plan = analyzeCSV(text, file.name);
  const box = document.createElement('div'); box.innerHTML = planHTML(plan);
  let f = null;
  if (plan.ok && plan.fresh.length) {
    f = form([{ name: 'actual', label: 'Сколько денег у вас сейчас на самом деле (необязательно)', type: 'money', value: '', hint: 'Если указать, приложение подберёт начальный остаток так, чтобы «Золото в казне» совпало с реальностью. Пусто — остаток не меняется.' }]);
    box.appendChild(f.el);
  }
  modal({ title: plan.ok ? 'Импорт истории' : 'Импорт невозможен', wide: true, body: box, actions: plan.ok && plan.fresh.length ? [{ label: 'Отмена', kind: 'btn-ghost' }, { label: `Импортировать ${plan.fresh.length}`, kind: 'btn-gold', icon: 'upload', onClick: async () => {
    if (f && !f.validate()) return false;
    const actual = f ? f.values().actual : null;
    const report = await applyImport(plan);
    if (actual !== null && actual !== undefined && !isNaN(actual)) {
      const { balance } = await import('./finance.js');
      const curOpening = db.setting('openingBalance', 0) || 0; const without = balance() - curOpening;
      await db.setSetting('openingBalance', actual - without);
    }
    showReport(report); render();
  } }] : [{ label: 'Понятно', kind: 'btn-gold' }] });
}
function showReport(r) {
  modal({ title: 'Импорт завершён', body: `<div class="report"><ul><li class="ok">Записано операций: ${r.imported} из ${r.total} строк</li><li>Дублей пропущено: ${r.duplicates}</li><li>${r.errors ? `<span class="bad">Не распознано строк: ${r.errors}</span>` : 'Нераспознанных строк нет'}</li>
    <li>Расходов: ${r.stats.expense.n} на ${money(r.stats.expense.sum)}</li><li>Доходов: ${r.stats.income.n} на ${money(r.stats.income.sum)}</li>${r.stats.transfer.n ? `<li>Переводов между кошельками: ${r.stats.transfer.n} (не влияют на казну)</li>` : ''}
    ${r.newCats.length ? `<li>Созданы статьи: ${r.newCats.map(esc).join(', ')}</li>` : ''}<li>Период: ${D.dmy(r.from)} — ${D.dmy(r.to)}</li></ul><p class="small muted">Отчёт сохранён в «Настройки и данные → Перенос из прежнего приложения».</p></div>`, actions: [{ label: 'Отлично', kind: 'btn-gold' }] });
}
function editOpening() {
  const f = form([{ name: 'v', label: 'Начальный остаток', type: 'money', value: db.setting('openingBalance', 0) || 0, hint: 'Можно и отрицательный, если начинали с долга: введите со знаком минус' }]);
  modal({ title: 'Начальный остаток казны', body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Сохранить', kind: 'btn-gold', onClick: async () => { const raw = f.el.querySelector('input').value; const v = parseMoney(raw || '0'); if (isNaN(v)) { f.error('v', 'Введите число'); return false; } await db.setSetting('openingBalance', v); toast('Начальный остаток сохранён', { kind: 'good' }); render(); } }] });
}
function listEditor(title, items, placeholder, onSave) {
  let list = [...items];
  const box = document.createElement('div');
  const draw = () => { box.innerHTML = `<ul class="ledger">${list.map((m, i) => `<li class="lrow" style="cursor:default;min-height:46px"><div class="main"><div class="t" style="white-space:normal;font-weight:500">${esc(m)}</div></div><button class="icon-btn sm" data-rm="${i}">${icon('trash')}</button></li>`).join('')}</ul><div class="toolbar" style="margin-top:10px"><label class="search" style="flex:1"><input id="le-in" placeholder="${esc(placeholder)}" style="padding-left:16px"></label><button class="btn btn-ink" data-add>${icon('plus')}Добавить</button></div>`; };
  draw();
  box.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { list.splice(+r.dataset.rm, 1); draw(); return; } if (e.target.closest('[data-add]')) { const v = box.querySelector('#le-in').value.trim(); if (v && !list.includes(v)) { list.push(v); draw(); } } });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'le-in') { e.preventDefault(); box.querySelector('[data-add]').click(); } });
  modal({ title, body: box, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Сохранить', kind: 'btn-gold', onClick: async () => { const pend = box.querySelector('#le-in').value.trim(); if (pend && !list.includes(pend)) list.push(pend); await onSave(list); render(); } }] });
}
function editMembers() { listEditor('Кто ведёт записи', db.setting('members', []) || [], 'Имя', (l) => db.setSetting('members', l)); }
function editPhrases() {
  const p = db.setting('servantPhrases', { up: [], down: [] }) || { up: [], down: [] };
  modal({ title: 'Фразы слуги', body: `<p>Свои реплики добавляются к встроенным и выбираются случайно, без повторов подряд.</p>`, actions: [
    { label: 'Когда казна растёт', kind: 'btn-ink', onClick: () => { setTimeout(() => listEditor('Фразы при пополнении', p.up || [], 'Например: «Ура, жалованье!»', (l) => db.setSetting('servantPhrases', { ...p, up: l })), 100); } },
    { label: 'Когда тратим', kind: 'btn-ink', onClick: () => { setTimeout(() => listEditor('Фразы при тратах', p.down || [], 'Например: «Ох, опять доставка…»', (l) => db.setSetting('servantPhrases', { ...p, down: l })), 100); } }] });
}
async function wipe() {
  const f = form([{ name: 'w', label: 'Введите слово УДАЛИТЬ для подтверждения', type: 'text', required: true }]);
  modal({ title: 'Удалить все данные?', body: f.el, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Удалить всё', kind: 'btn-danger', icon: 'trash', onClick: async () => {
    if (f.values().w.trim().toUpperCase() !== 'УДАЛИТЬ') { f.error('w', 'Слово не совпадает'); return false; }
    await db.wipeAll(); try { localStorage.removeItem(db.APP_ID + ':nav'); } catch (_) {}
    toast('Все данные удалены. Снимок перед удалением сохранён.'); setTimeout(() => location.reload(), 900);
  } }] });
}
