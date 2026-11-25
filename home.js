// home.js — главная: сокровищница с сундуком и слугой, баланс, путь героев, задания и летопись.
import * as db from './database.js';
import { icon } from './icons.js';
import { $, $$, esc, D, money, plural, bus, toast, pick, say, sleep, sound, heading, empty, clamp } from './ui.js';
import { setMood } from './art.js';
import { treasuryScene } from './scenes.js';
import { bossSVG, treasureTier, chestSVG } from './bosses.js';
import * as fin from './finance.js';
import * as game from './game.js';
import { coinsFly, coinsAway, countTo, burst, center } from './animations.js';
import { backupNote } from './settings.js';

const UP = ['Чай теперь не помрём!', 'Царь-батюшка сегодня щедр!', 'Вот это звон монет!', 'Господи, да мы почти богаты!', 'Надо же, казна пополняется!', 'Ох, сундук-то потяжелел!', 'Пересчитаю-ка… нет, всё верно, прибыло!', 'Монетка к монетке — вот и горка!', 'Слышите? Это золото поёт!', 'Запирайте ворота, у нас прибыток!', 'Вот бы так каждый день, государь!', 'Матушка-казна, расти большая!'];
const DOWN = ['Казна пустеет, милорд!', 'Скоро пойдём побираться…', 'Опять эти купцы обобрали нас!', 'Может, продадим королевскую карету?', 'Государь, я бы на вашем месте задумался…', 'Ох, звенело и уплыло…', 'Сундук-то лёгкий стал, как пёрышко.', 'Ещё немного — и паутину считать будем.', 'Не губите, государь, хоть грошик оставьте!', 'Эх, была монетка — и нет монетки.', 'Запишу… с тяжёлым сердцем запишу.', 'Купцы довольны, а мы-то как же?'];
const IDLE = ['Считаю, государь, считаю…', 'Ключи на месте, сундук заперт.', 'Всё под присмотром, милорд.', 'Сорок пять, сорок шесть… сбился!', 'Пыль смахнул, монеты протёр.'];
const NEG = ['Государь, в сундуке одна паутина…', 'Казна в долгах, как в шелках!'];
let el, pendingDelta = 0, lastShown = null, busy = false, idleTimer = 0, lastPhrase = '';
const sv = () => el.querySelector('.servant');
const sceneSvg = () => el.querySelector('.treasury-box svg');

function phrases(kind) { const custom = (db.setting('servantPhrases', {}) || {})[kind] || []; return [...(kind === 'up' ? UP : DOWN), ...custom]; }
function speak(text, ms = 3200) { const s = sv(); if (!s) return; lastPhrase = text; say(el.querySelector('.treasury-box'), s.querySelector('.head'), text, { ms }); }
function fillLevel(b) { const r = b / 100; return b <= 0 ? 0 : r < 10000 ? 1 : r < 50000 ? 2 : r < 200000 ? 3 : 4; }

export const screen = {
  mount(root) {
    el = root;
    root.innerHTML = `<div class="screen-head"><h1>Сокровищница</h1><span class="sub home-date"></span><span class="grow"></span></div>
      <div class="home-note"></div>
      <div class="home-grid">
        <div>
          <div class="scene-box treasury-box"><svg class="art scene" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice">${treasuryScene()}</svg>
            <button class="scene-lvl" data-act="to-map"><span class="lvl-medal">1</span><span class="lvl-txt"></span></button>
            <div class="balance-plaque" data-go="treasurer" title="Открыть книгу казначея"><div class="lbl">Золото в казне</div><div class="val">0 ₽</div><div class="delta"></div></div>
            <div class="scene-actions"><button class="seal-btn inc" data-act="inc" aria-label="Добавить доход">${icon('plus')}<span>Доход</span></button><button class="seal-btn exp" data-act="exp" aria-label="Добавить расход">${icon('minus')}<span>Расход</span></button></div>
          </div>
        </div>
        <div class="side-col">
          <div class="paper next-boss-card"></div>
          <div class="paper quests-card"></div>
        </div>
        <div class="paper map-card span">
          <div class="map-head">${heading('Путь к сокровищам')}<span class="stat map-stat"></span></div>
          <div class="map-wrap"></div>
        </div>
        <div class="paper chronicle span"></div>
      </div>`;
    root.addEventListener('click', onClick);
    bus.on('money', ({ delta }) => { pendingDelta += delta; if (el.classList.contains('active')) react(); });
    bus.on('xp', () => { if (el.classList.contains('active')) walkPending(); });
    bus.on('day', () => { if (el.classList.contains('active')) renderSide(); });
    db.on(['operations', 'settings'], () => { if (el.classList.contains('active') && !busy) { renderChronicle(); if (!pendingDelta) setBalance(false); } });
    db.on(['quests', 'questRuns', 'treasures', 'gameState'], () => { if (el.classList.contains('active')) renderSide(); });
    db.on(['treasures', 'gameState'], () => { if (el.classList.contains('active') && !busy) renderMap(true); });
    const wrap = root.querySelector('.map-wrap');
    let drag = null;
    wrap.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') drag = { x: e.clientX, s: wrap.scrollLeft }; });
    window.addEventListener('pointermove', (e) => { if (drag) wrap.scrollLeft = drag.s - (e.clientX - drag.x); });
    window.addEventListener('pointerup', () => { drag = null; });
  },
  show() {
    el.querySelector('.home-date').textContent = `${D.weekday(D.today())}, ${D.human(D.today())}`;
    el.querySelector('.home-note').innerHTML = backupNote();
    if (lastShown === null) { lastShown = fin.balance(); pendingDelta = 0; }
    setBalance(false);
    renderSide(); renderChronicle(); renderMap(false);
    setMood(sv(), 'idle');
    if (pendingDelta) setTimeout(react, 450);
    setTimeout(walkPending, 700);
    scheduleIdle();
  },
  hide() { clearTimeout(idleTimer); }
};

function setBalance(animate) {
  const b = fin.balance(); const val = el.querySelector('.balance-plaque .val');
  if (animate) countTo(val, lastShown ?? b, b); else { val.textContent = money(b, { round: Math.abs(b) >= 100000 }); val.classList.toggle('neg', b < 0); }
  sceneSvg().setAttribute('data-fill', fillLevel(b));
  lastShown = b;
}
async function react() {
  if (busy || !pendingDelta) return; busy = true;
  const delta = pendingDelta; pendingDelta = 0;
  const s = sv(), chest = el.querySelector('.main-chest'), mouth = el.querySelector('.chest-mouth rect'), lid = el.querySelector('.mlid');
  const plaque = el.querySelector('.balance-plaque'), dEl = plaque.querySelector('.delta');
  const target = center(mouth);
  dEl.textContent = money(delta, { sign: true }); dEl.style.color = delta > 0 ? '#bfe3a0' : '#f3a58f'; dEl.classList.remove('show'); void dEl.offsetWidth; dEl.classList.add('show');
  if (delta > 0) {
    setMood(s, 'surprised');
    const btn = el.querySelector('.seal-btn.inc'); const from = btn ? center(btn) : { x: target.x - 200, y: target.y - 200 };
    sound.play('coins');
    const n = clamp(Math.round(Math.log10(delta / 100 + 1) * 4), 5, 16);
    const fly = coinsFly({ x: from.x, y: from.y - 40 }, target, n);
    await sleep(500); setMood(s, 'joy'); speak(pick(phrases('up').filter(p => p !== lastPhrase)));
    await fly; lid.classList.remove('bounce'); void lid.getBoundingClientRect(); lid.classList.add('bounce'); chest.classList.add('jolt'); setTimeout(() => chest.classList.remove('jolt'), 500);
    burst(target.x, target.y, 10); setBalance(true);
    await sleep(1600); setMood(s, 'rub'); await sleep(1600);
  } else {
    const big = -delta > Math.abs(lastShown || 1) * .1;
    setMood(s, big ? 'sad' : 'shrug'); sound.play('loss');
    lid.classList.remove('bounce'); void lid.getBoundingClientRect(); lid.classList.add('bounce');
    coinsAway(target, clamp(Math.round(Math.log10(-delta / 100 + 1) * 3), 3, 12));
    speak(pick((fin.balance() < 0 ? NEG : phrases('down')).filter(p => p !== lastPhrase)));
    setBalance(true);
    await sleep(2400); setMood(s, 'sigh'); await sleep(2200);
  }
  setMood(s, 'idle'); busy = false;
  if (pendingDelta) react();
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!el.classList.contains('active')) return;
    if (!busy && !document.body.classList.contains('anim-off')) { const m = pick(['count', 'sigh', 'rub', 'count']); setMood(sv(), m); setTimeout(() => { if (!busy) setMood(sv(), 'idle'); }, m === 'count' ? 3400 : 2300); }
    scheduleIdle();
  }, 15000 + Math.random() * 12000);
}

// ---------- боковая колонка ----------
function renderSide() {
  const li = game.levelInfo();
  el.querySelector('.lvl-medal').textContent = li.level;
  el.querySelector('.lvl-txt').innerHTML = li.done ? 'Путь пройден!' : `${li.inLevel}/100 шагов`;
  const nb = li.nextBoss; const card = el.querySelector('.next-boss-card');
  if (nb) {
    const st = game.bossState(nb); const tr = game.treasure(nb.level);
    const from = (nb.level - 5) * game.PER_LEVEL; const prog = clamp((li.xp - from) / (5 * game.PER_LEVEL) * 100, 0, 100);
    card.innerHTML = `${heading(st === 'fight' ? 'Противостояние!' : 'Ближайший босс')}<div class="next-boss" data-boss-open="${nb.id}" style="cursor:pointer">${bossSVG(nb.id, st)}<div><h4>${esc(nb.name)}</h4><p class="small muted">${esc(nb.place)} · уровень ${nb.level}</p>
      <div class="kv"><span>До победы</span><b>${li.toBoss} ${plural(li.toBoss, ['шаг', 'шага', 'шагов'])}</b></div><div class="rope ${st === 'fight' ? 'red' : ''}" style="margin-top:6px"><i style="width:${prog}%"></i></div>
      <div class="kv"><span>Сокровище</span><span>${tr ? `<b>${esc(tr.name)}</b> · ${money(tr.cost, { round: true })}` : '<span class="muted">не назначено</span>'}</span></div></div></div>
      <div class="kv"><span class="muted small">Уровень ${li.level} · ${li.inLevel} из 100 шагов</span><button class="btn btn-ghost sm" data-boss-open="${nb.id}">${icon(tr ? 'chest' : 'plus')}${tr ? 'Сокровищница' : 'Назначить сокровище'}</button></div>`;
  } else {
    card.innerHTML = `${heading('Царство покорено')}<p>Все восемь боссов побеждены! Слава: <b>${li.glory}</b> ${plural(li.glory, ['шаг', 'шага', 'шагов'])} сверх пути. Задания продолжают приносить славу.</p>`;
  }
  const act = game.activeRuns();
  el.querySelector('.quests-card').innerHTML = `${heading('Задания', `<button class="btn btn-ghost sm hd-act" data-go="wheel">${icon('wheel')}Колесо</button>`)}
    ${act.length ? act.slice(0, 5).map(r => game.questRow(r, { compact: true })).join('') + (act.length > 5 ? `<p class="small muted">и ещё ${act.length - 5}…</p>` : '') : empty('Заданий нет', 'Загляните к шуту — колесо подберёт испытание')}`;
}
function renderChronicle() {
  const list = db.all('operations').filter(o => o.date <= D.today()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 6);
  el.querySelector('.chronicle').innerHTML = `${heading('Летопись казны', `<button class="btn btn-ghost sm hd-act" data-go="treasurer">${icon('scroll')}Вся книга</button>`)}
    ${list.length ? `<ul class="ledger">${list.map(o => fin.opRow(o, { showDate: true })).join('')}</ul>` : empty('Пока ни одной записи', 'Нажмите печать «Доход» или «Расход» у сундука')}`;
}

// ---------- карта ----------
function renderMap(keep) {
  const wrap = el.querySelector('.map-wrap'); const left = wrap.scrollLeft;
  const shownXP = Math.min(db.gstate('heroShownXP', 0) ?? 0, game.totalXP());
  wrap.innerHTML = game.mapSVG(shownXP);
  game.paintRoad(wrap.querySelector('svg'), shownXP);
  if (keep) wrap.scrollLeft = left; else requestAnimationFrame(() => game.scrollToHero(wrap, shownXP));
  updateMapStat();
}
function updateMapStat() {
  const li = game.levelInfo();
  el.querySelector('.map-stat').innerHTML = li.done ? `Путь пройден · слава <b>${li.glory}</b>` : `Уровень <b>${li.level}</b> из 40 · всего опыта <b>${li.xp}</b>${li.nextBoss ? ` · до босса <b>${li.toBoss}</b> ${plural(li.toBoss, ['шаг', 'шага', 'шагов'])}` : ''}`;
}
let walking = false;
async function walkPending() {
  if (walking) return;
  const xp = game.totalXP(); const shown = db.gstate('heroShownXP', null);
  if (shown === null) { await db.setGState('heroShownXP', xp); return; }
  if (shown === xp) return;
  walking = true;
  const wrap = el.querySelector('.map-wrap');
  if (xp < shown) { renderMap(true); }
  el.querySelector('.map-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await sleep(350);
  await game.walk(wrap, shown, xp, async (b) => { await game.openTreasureScene(b); });
  await db.setGState('heroShownXP', xp);
  walking = false; renderMap(true); renderSide();
  if (game.totalXP() !== xp) walkPending();
}

function onClick(e) {
  const a = e.target.closest('[data-act]');
  if (a) {
    if (a.dataset.act === 'inc') return fin.openOpForm({ type: 'income' });
    if (a.dataset.act === 'exp') return fin.openOpForm({ type: 'expense' });
    if (a.dataset.act === 'to-map') return el.querySelector('.map-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const bo = e.target.closest('[data-boss-open]'); if (bo) return game.openBoss(bo.dataset.bossOpen);
  const mb = e.target.closest('.map-boss, .map-chest'); if (mb) return game.openBoss(mb.dataset.boss);
  const nd = e.target.closest('.map-node'); if (nd) { const i = +nd.dataset.node, xp = game.totalXP(); toast(xp >= i * 100 ? `Уровень ${i} пройден` : Math.floor(xp / 100) + 1 === i ? `Уровень ${i}: пройдено ${xp % 100} из 100 шагов` : `Уровень ${i} впереди: до его завершения ${i * 100 - xp} ${plural(i * 100 - xp, ['шаг', 'шага', 'шагов'])}`); return; }
  if (e.target.closest('.servant') && !busy) { const s = sv(); setMood(s, pick(['count', 'rub', 'shrug'])); speak(fin.balance() < 0 ? pick(NEG) : pick(IDLE), 2600); setTimeout(() => { if (!busy) setMood(s, 'idle'); }, 2400); return; }
  if (e.target.closest('.main-chest')) { const c = center(el.querySelector('.chest-mouth rect')); burst(c.x, c.y, 8); sound.play('coin'); el.querySelector('.mlid').classList.remove('bounce'); void el.offsetWidth; el.querySelector('.mlid').classList.add('bounce'); }
  const op = e.target.closest('.lrow[data-op]'); if (op) return fin.openOpForm({ id: op.dataset.op });
}
