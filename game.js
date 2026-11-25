// game.js — игровая система: опыт и уровни, карта пути, боссы, сокровища, задания и колесо шута.
import * as db from './database.js';
import { icon } from './icons.js';
import { $, $$, esc, D, money, plural, bus, modal, form, toast, undoToast, confirmDialog, seg, empty, heading, sound, rand, pick, say, sleep, resizeImage, pickFile, clamp } from './ui.js';
import { P, G, Pt, L, E, C, setMood, heroes, daggerSVG, coin, star4 } from './art.js';
import { BOSSES, BOSS_ART, bossSVG, bossG, setBossState, chestSVG, treasureTier } from './bosses.js';
import { MAP, stageScene } from './scenes.js';
import { burst, flyText } from './animations.js';

export const PER_LEVEL = 100, MAX_LEVEL = 40;
export { BOSSES };

// ---------------- опыт и уровни ----------------
export function totalXP() { return db.all('xpLog').reduce((s, x) => s + (x.amount || 0), 0); }
export function levelInfo(xp = totalXP()) {
  const done = xp >= MAX_LEVEL * PER_LEVEL;
  const level = done ? MAX_LEVEL : Math.floor(xp / PER_LEVEL) + 1;
  const inLevel = done ? PER_LEVEL : xp % PER_LEVEL;
  const nextBoss = BOSSES.find(b => xp < b.level * PER_LEVEL) || null;
  return { xp, level, inLevel, done, nextBoss, toBoss: nextBoss ? nextBoss.level * PER_LEVEL - xp : 0, glory: Math.max(0, xp - MAX_LEVEL * PER_LEVEL) };
}
const openedSet = () => new Set(db.gstate('opened', []));
export function bossState(b, xp = totalXP()) {
  if (xp >= b.level * PER_LEVEL) return openedSet().has(b.level) ? 'opened' : 'defeated';
  const lvl = Math.floor(xp / PER_LEVEL) + 1;
  if (lvl === b.level) return 'fight';
  if (lvl >= b.level - 4) return 'waiting';
  return 'locked';
}
export const STATE_LABEL = { locked: 'ещё не открыт', waiting: 'ожидает', fight: 'противостояние', defeated: 'побеждён', opened: 'сокровище открыто' };
export function treasure(level) { return db.get('treasures', 'L' + level) || null; }

// ---------------- задания и цели ----------------
export const KIND = { regular: 'Регулярная', weekly: 'Еженедельная', monthly: 'Ежемесячная', once: 'Разовая', wheel: 'Для колеса' };
const PERIODIC = ['regular', 'weekly', 'monthly'];
export function quests() { return db.all('quests').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt); }
export function runs() { return db.all('questRuns'); }
export function activeRuns() { return runs().filter(r => r.status === 'active').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')); }
function currentPeriod(q, t) {
  if (q.kind === 'weekly') return { key: D.isoWeek(t), start: D.weekStart(t), due: D.weekEnd(t) };
  if (q.kind === 'monthly') return { key: t.slice(0, 7), start: D.monthStart(t), due: D.monthEnd(t) };
  const n = Math.max(1, parseInt(q.everyDays) || 1), anchor = q.createdDate || t;
  const idx = Math.max(0, Math.floor(D.diff(anchor, t) / n)); const start = D.add(anchor, idx * n);
  return { key: 'r' + idx, start, due: D.add(start, n - 1) };
}
const mkRun = (q, key, start, due, source) => ({ id: `${q.id}:${key}`, questId: q.id, periodKey: key, title: q.title, description: q.description || '', xp: q.xp, steps: Math.max(1, q.steps || 1), progress: 0, start, due, status: 'active', source, createdAt: Date.now() });
export async function refreshQuests() {
  const t = D.today(); const ops = [];
  for (const q of db.all('quests')) {
    if (q.status !== 'active') continue;
    if (PERIODIC.includes(q.kind)) {
      const p = currentPeriod(q, t);
      if (!db.get('questRuns', `${q.id}:${p.key}`)) ops.push({ store: 'questRuns', put: mkRun(q, p.key, p.start, p.due, 'schedule') });
    } else if (q.kind === 'once' && !q.inWheel) {
      if (!db.get('questRuns', `${q.id}:once`)) ops.push({ store: 'questRuns', put: mkRun(q, 'once', q.createdDate || t, q.deadline || '', 'schedule') });
    }
  }
  for (const r of runs()) if (r.status === 'active' && r.due && r.due < t) { ops.push({ store: 'questRuns', put: { ...r, status: 'expired', endedAt: Date.now() } }); }
  if (ops.length) await db.commit(ops);
  const expired = ops.filter(o => o.put && o.put.status === 'expired');
  if (expired.length) db.journal('quest', `Просрочено заданий: ${expired.length} (${expired.map(o => o.put.title).slice(0, 3).join(', ')})`);
}
export function streak(q) {
  if (!PERIODIC.includes(q.kind)) return 0;
  const rs = runs().filter(r => r.questId === q.id && r.source === 'schedule').sort((a, b) => b.start.localeCompare(a.start));
  let n = 0, i = 0;
  if (rs[0] && rs[0].status === 'active') i = 1;
  for (; i < rs.length; i++) { if (rs[i].status === 'done') n++; else break; }
  return n;
}
export async function stepRun(runId, origin) {
  const r = db.get('questRuns', runId);
  if (!r || r.status !== 'active') { toast('Это задание уже завершено'); return; }
  const progress = (r.progress || 0) + 1;
  if (progress < r.steps) {
    await db.commit([{ store: 'questRuns', put: { ...r, progress } }]);
    sound.play('step'); toast(`Шаг ${progress} из ${r.steps}: «${r.title}»`);
    return;
  }
  await completeRun(r, origin);
}
export async function completeRun(r, origin) {
  const before = totalXP();
  const fresh = { ...r, progress: r.steps, status: 'done', doneAt: Date.now(), doneDate: D.today() };
  try {
    await db.commit([{ store: 'questRuns', put: fresh }, { store: 'xpLog', add: { id: 'run:' + r.id, amount: r.xp, ts: Date.now(), date: D.today(), source: 'quest', refId: r.id, title: r.title } }]);
  } catch (e) {
    if (e && e.name === 'ConstraintError') { toast('Опыт за это задание уже начислен'); return; }
    throw e;
  }
  const after = totalXP();
  db.journal('quest', `Выполнено задание «${r.title}»: +${r.xp} опыта`);
  sound.play('fanfare');
  if (origin) { const rc = origin.getBoundingClientRect(); flyText(rc.left + rc.width / 2, rc.top, `+${r.xp} опыта`); burst(rc.left + rc.width / 2, rc.top + rc.height / 2, 14); }
  bus.emit('xp', { from: before, to: after, title: r.title });
  const lb = Math.floor(before / PER_LEVEL), la = Math.floor(after / PER_LEVEL);
  toast(la > lb ? `Задание выполнено! +${r.xp} опыта — новый уровень ${Math.min(MAX_LEVEL, la + 1)}!` : `Задание выполнено! +${r.xp} опыта`, { kind: 'good', action: { label: 'Отменить', fn: async () => {
    await db.commit([{ store: 'questRuns', put: r, keepStamp: true }, { store: 'xpLog', del: 'run:' + r.id }]);
    bus.emit('xp', { from: after, to: totalXP(), undo: true }); toast('Выполнение отменено, опыт возвращён');
  } } });
}
export async function abandonRun(runId) {
  const r = db.get('questRuns', runId); if (!r) return;
  if (!await confirmDialog({ title: 'Отказаться от задания?', text: `«${r.title}» уйдёт в летопись как оставленное, опыт не начислится.`, ok: 'Отказаться' })) return;
  await db.commit([{ store: 'questRuns', put: { ...r, status: 'abandoned', endedAt: Date.now() } }]);
  undoToast('Задание оставлено', () => db.commit([{ store: 'questRuns', put: r, keepStamp: true }]));
}
export async function startRun(q, source = 'manual') {
  const t = D.today(); const key = (source === 'wheel' ? 'w' : 'm') + Date.now().toString(36);
  const due = q.kind === 'once' && q.deadline ? q.deadline : D.add(t, Math.max(1, parseInt(q.durationDays) || 7) - 1);
  const run = mkRun(q, key, t, due, source);
  await db.commit([{ store: 'questRuns', put: run }]);
  db.journal('quest', `Принято задание «${q.title}» до ${D.dmy(due)}`);
  return run;
}
export function wheelCandidates() {
  const act = new Set(activeRuns().map(r => r.questId));
  const done = new Set(runs().filter(r => r.status === 'done').map(r => r.questId));
  return quests().filter(q => q.status === 'active' && q.inWheel && !PERIODIC.includes(q.kind) && !act.has(q.id) && (q.repeatable || !done.has(q.id)));
}
export function questRow(r, { compact = false } = {}) {
  const q = db.get('quests', r.questId);
  const st = q ? streak(q) : 0;
  const left = r.due ? D.diff(D.today(), r.due) : null;
  const dueTxt = r.due ? (left === 0 ? 'сегодня последний день' : left === 1 ? 'до завтра' : `ещё ${left} ${plural(left, ['день', 'дня', 'дней'])}`) : 'без срока';
  const pips = r.steps > 1 ? `<div class="pips">${Array.from({ length: Math.min(r.steps, 20) }, (_, i) => `<i class="${i < r.progress ? 'on' : ''}"></i>`).join('')}</div>` : '';
  return `<div class="quest" data-run="${r.id}"><div class="qmain"><div class="qt">${esc(r.title)}</div>
    <div class="qm"><span class="xp">+${r.xp} опыта</span><span>${q ? KIND[q.kind] : ''}</span><span>${dueTxt}</span>${r.steps > 1 ? `<span>шаг ${r.progress}/${r.steps}</span>` : ''}${st ? `<span class="streak">${icon('candle')}серия ${st}</span>` : ''}</div>${pips}</div>
    ${compact ? '' : `<button class="icon-btn sm" data-abandon="${r.id}" title="Отказаться">${icon('close')}</button>`}
    <button class="qbtn ${r.steps > 1 && r.progress + 1 < r.steps ? 'step' : ''}" data-step="${r.id}" aria-label="${r.steps > 1 && r.progress + 1 < r.steps ? 'Отметить шаг' : 'Выполнено'}">${r.steps > 1 && r.progress + 1 < r.steps ? `+1` : icon('check')}</button></div>`;
}
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-step]'); if (s) { e.preventDefault(); stepRun(s.dataset.step, s); return; }
  const a = e.target.closest('[data-abandon]'); if (a) { e.preventDefault(); abandonRun(a.dataset.abandon); }
});

// ---------------- карта пути ----------------
const NODE_X = (i) => 110 + i * 110, MAP_W = NODE_X(MAX_LEVEL) + 150, MAP_H = 260;
const NODE_Y = (i) => Math.round(172 + 26 * Math.sin(i * .78) + 10 * Math.sin(i * 2.1 + 1));
const nodes = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => [NODE_X(i), NODE_Y(i)]);
function segPts(i) { // контрольные точки сегмента i: nodes[i] → nodes[i+1]
  const p0 = nodes[Math.max(0, i - 1)], p1 = nodes[i], p2 = nodes[i + 1], p3 = nodes[Math.min(MAX_LEVEL, i + 2)];
  return [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2];
}
function bez(s, t) { const m = 1 - t; const f = (k) => m * m * m * s[0][k] + 3 * m * m * t * s[1][k] + 3 * m * t * t * s[2][k] + t * t * t * s[3][k]; return [f(0), f(1)]; }
export function heroPoint(xp) { const v = clamp(xp, 0, MAX_LEVEL * PER_LEVEL); const i = Math.min(MAX_LEVEL - 1, Math.floor(v / PER_LEVEL)); const t = v >= MAX_LEVEL * PER_LEVEL ? 1 : (v % PER_LEVEL) / PER_LEVEL; return bez(segPts(i), t); }
const segD = (i) => { const s = segPts(i); return `M${s[0][0]} ${s[0][1]}C${s[1][0].toFixed(1)} ${s[1][1].toFixed(1)} ${s[2][0].toFixed(1)} ${s[2][1].toFixed(1)} ${s[3][0]} ${s[3][1]}`; };
const REGION_COL = ['#b9c27f', '#a4a493', '#9fbf8a', '#d8c070', '#8f9a62', '#8a7f8c', '#6f8a5a', '#c9b98a'];
function regionArt(r) {
  const x0 = NODE_X(r * 5), x1 = NODE_X(r * 5 + 5), mid = (x0 + x1) / 2, M = MAP;
  switch (r) {
    case 0: return M.hill(x0 + 90, 120, 260, 50, '#a9b46e') + M.windmill(x0 + 210, 112, 1) + M.tree(x0 + 300, 125, .9) + M.tree(x0 + 330, 130, .7) + M.stall(x1 - 120, 118, 1, P.red) + M.stall(x1 - 70, 112, .9, P.gold) + M.stall(x1 - 165, 124, .8, P.greenL) + M.rock(x0 + 160, 238, .8) + M.tree(x0 + 420, 250, .7);
    case 1: return M.mountain(x0 + 120, 130, 240, 100) + M.mountain(x0 + 260, 130, 200, 80, false) + M.mountain(mid + 120, 130, 300, 115) + M.mountain(x1 - 60, 132, 220, 95) + Pt(`M${x1 - 70} 132C${x1 - 70} 108 ${x1 - 30} 108 ${x1 - 30} 132Z`, '#2a2420') + M.rock(x0 + 230, 236, 1.1) + M.rock(mid + 60, 244, .9);
    case 2: return M.waves(x0 + 140, x0 + 330, 214, '#7fa6b8') + M.bridge(x0 + 170, 206, 120) + M.house(mid + 80, 118, 1.1, P.burgD) + M.tree(x0 + 60, 122, .9) + M.tree(mid, 124, 1) + Pt(`M${x1 - 120} 126h12v-44h-12Z`, P.wood) + Pt(`M${x1 - 114} 90L${x1 - 30} 84L${x1 - 30} 92L${x1 - 114} 98Z`, P.white, 'k1') + M.house(x1 - 160, 124, .8);
    case 3: return M.tent(x0 + 90, 124, 1.1, P.burg) + M.tent(x0 + 160, 118, .9, P.gold) + M.tent(mid + 40, 126, 1.2, P.greenD) + M.tent(x1 - 150, 120, 1, P.red) + L(`M${x0 + 60} 72Q${mid} 104 ${x1 - 60} 72`, 'k1') + Array.from({ length: 9 }, (_, i) => Pt(`M${x0 + 80 + i * 45} ${80 + Math.sin(i / 8 * Math.PI) * 18}l14 1l-7 12Z`, [P.burg, P.gold, P.greenD][i % 3], 'k1')).join('') + M.stall(mid + 140, 232, .9, P.gold);
    case 4: return Pt(`M${x0 + 60} 238q60-16 130 0q-60 12-130 0Z`, '#7f9b86', 'k1') + Pt(`M${mid + 20} 120q80-14 160 0q-80 12-160 0Z`, '#7f9b86', 'k1') + M.reeds(x0 + 70, 236) + M.reeds(x0 + 190, 238) + M.reeds(mid + 30, 120) + M.reeds(mid + 170, 118) + M.reeds(x1 - 80, 240) + Pt(`M${x0 + 300} 126l-4-40l-14-14M${x0 + 296} 96l12-14`, 'none').replace('fill="none"', 'fill="none" class="k"') + `<ellipse cx="${mid}" cy="100" rx="200" ry="14" fill="#fff" opacity=".35"/>`;
    case 5: return M.hill(mid + 20, 132, 380, 70, '#776c78') + M.castle(mid + 40, 98, 1.1) + Pt(`M${x0 + 80} 128l-2-36l-12-12M${x0 + 78} 102l12-10`, 'none').replace('fill="none"', 'fill="none" class="k"') + M.crow(x0 + 140, 70) + M.crow(mid + 160, 54) + M.rock(x1 - 70, 242, 1) + M.rock(x0 + 120, 240, .8);
    case 6: return Array.from({ length: 11 }, (_, i) => M.fir(x0 + 30 + i * 50, 128 + (i % 2) * 6, .9 + (i % 3) * .15, i % 2 ? P.greenD : '#2f4a2e')).join('') + M.hut(mid + 30, 128, 1.1) + M.fir(x0 + 60, 250, .7) + M.fir(mid + 150, 252, .8) + M.fir(x1 - 40, 250, .7);
    case 7: return `<rect x="${mid - 40}" y="60" width="${x1 - mid + 190}" height="72" fill="#7fa6b8" opacity=".55"/>` + M.waves(mid - 40, x1 + 150, 104, '#5d8aa0') + M.ship(mid + 60, 98, 1) + Pt(`M${x0} 132Q${mid - 60} 120 ${mid - 40} 132Z`, '#d9c79a', 'k1') + M.waves(x0 + 140, x1 + 150, 234, '#7fa6b8');
  }
  return '';
}
function obstacles() {
  const M = MAP; let s = '';
  [[2, 'rock'], [7, 'rock'], [12, 'log'], [18, 'rock'], [23, 'puddle'], [28, 'rock'], [32, 'log'], [38, 'rock']].forEach(([i, k]) => {
    const [x, y] = heroPointRaw(i * PER_LEVEL + 50);
    if (k === 'rock') s += M.rock(x + 6, y + 30, .7);
    if (k === 'log') s += `<g transform="translate(${x - 18} ${y + 26}) rotate(-8)">${Pt('M0 0h40v9H0Z', P.wood)}${E(40, 4.5, 3, 4.5, P.woodL, 'k1')}</g>`;
    if (k === 'puddle') s += E(x + 8, y + 30, 22, 5, '#7f9b86', 'k1');
  });
  return s;
}
function heroPointRaw(v) { return heroPoint(v); }
export function mapSVG(xp) {
  const li = levelInfo(xp); const opened = openedSet();
  const stops = REGION_COL.map((c, r) => `<stop offset="${(NODE_X(r * 5) / MAP_W).toFixed(3)}" stop-color="${c}"/><stop offset="${(NODE_X(r * 5 + 5) / MAP_W).toFixed(3)}" stop-color="${c}"/>`).join('');
  let roads = '', done = '', nodesS = '', flags = '', bosses = '', chests = '';
  for (let i = 0; i < MAX_LEVEL; i++) { roads += segD(i); done += `<path class="road-seg" data-seg="${i}" d="${segD(i)}" fill="none" stroke="#7a4a1e" stroke-width="7" stroke-linecap="round" stroke-dasharray="0 9999"/>`; }
  for (let i = 1; i <= MAX_LEVEL; i++) {
    const [x, y] = nodes[i]; const isBoss = i % 5 === 0; const passed = xp >= i * PER_LEVEL; const cur = li.level === i && !li.done;
    nodesS += `<g class="map-node ${passed ? 'passed' : ''} ${cur ? 'current' : ''}" data-node="${i}"><circle class="ring" cx="${x}" cy="${y}" r="13" fill="none" stroke="#e8c86e" stroke-width="3"/><circle class="stone" cx="${x}" cy="${y}" r="${isBoss ? 12 : 9}" fill="${passed ? '#c9a043' : '#efe0bf'}" stroke="#2a1b12" stroke-width="2"/><text x="${x}" y="${y + 4}" text-anchor="middle" style="font:700 ${isBoss ? 11 : 10}px Lora,serif;fill:#2a1b12">${i}</text></g>`;
    if (!isBoss) flags += `<g class="map-flag ${passed ? 'up' : ''}" data-flag="${i}"><line x1="${x + 12}" y1="${y - 6}" x2="${x + 12}" y2="${y - 34}" stroke="#2a1b12" stroke-width="1.6"/><path class="fl" d="M${x + 12} ${y - 34}h14l-4 5l4 5h-14Z" fill="${passed ? '#7a1f2b' : '#c4beb2'}" stroke="#2a1b12" stroke-width="1"/></g>`;
    else {
      const b = BOSSES.find(x => x.level === i); const st = bossState(b, xp); const tr = treasure(i);
      bosses += `<g class="map-boss" data-boss="${b.id}" transform="translate(${x + 4} ${y - 128}) scale(.5)">${bossG(b.id, st)}</g>`;
      const open = st === 'opened';
      const tier = tr ? treasureTier(tr.cost).tier : 1; const band = [0, '#b0703a', '#cfd2d4', '#c9a043', '#c9a043', '#e8c86e'][tier];
      chests += `<g class="map-chest ${open ? 'open' : ''}" data-boss="${b.id}" transform="translate(${x + 30} ${y + 14})"><circle class="shine" cx="14" cy="4" r="22" fill="#ffe9a6" opacity=".7"/>${Pt('M0 6h28v16H0Z', tier >= 4 ? P.burgD : P.wood, 'k1')}<g class="lidm">${Pt('M0 6C0-4 28-4 28 6Z', tier >= 4 ? P.burgD : P.woodD, 'k1')}</g>${Pt('M0 12h28v3H0Z', band, 'k1')}${C(14, 14, 2.4, P.gold, 'k1')}${tr ? '' : `<text x="14" y="36" text-anchor="middle" style="font:600 9px Lora,serif;fill:#5b4231">?</text>`}</g>`;
    }
  }
  const [hx, hy] = heroPoint(xp);
  return `<svg class="art map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}">
    <defs><linearGradient id="landg" x1="0" x2="${MAP_W}" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>
    <rect width="${MAP_W}" height="${MAP_H}" fill="#e9d7ae"/>
    <path d="M0 140C400 120 800 150 1200 132S2000 150 2400 134S3200 150 3600 136S4400 146 ${MAP_W} 138V${MAP_H}H0Z" fill="url(#landg)" opacity=".6"/>
    ${Array.from({ length: 8 }, (_, r) => `<g class="region r${r}">${regionArt(r)}</g>`).join('')}
    <g class="town">${MAP.house(40, 150, 1, P.burg)}${MAP.church(80, 146, 1.1)}${MAP.house(118, 128, .8, P.greenD)}${MAP.castle(54, 112, .55, '#8a7a6a')}<text x="70" y="250" text-anchor="middle" style="font:italic 600 13px Lora,serif;fill:#5b4231">Стольный град</text></g>
    ${BOSSES.map((b, r) => `<text x="${(NODE_X(r * 5) + NODE_X(r * 5 + 5)) / 2}" y="24" text-anchor="middle" style="font:italic 600 14px Lora,serif;fill:#5b4231;letter-spacing:.04em">${esc(b.place)}</text>`).join('')}
    <path d="${roads}" fill="none" stroke="#efe0bf" stroke-width="13" stroke-linecap="round"/>
    <path d="${roads}" fill="none" stroke="#a07a4c" stroke-width="2" stroke-dasharray="6 7" stroke-linecap="round"/>
    ${done}${obstacles()}${chests}${flags}${nodesS}${bosses}
    <g class="hero-pos" transform="translate(${(hx - 40).toFixed(1)} ${(hy - 84).toFixed(1)}) scale(.9)">${heroes()}</g>
  </svg>`;
}
/** Отрисовать пройденную дорогу до xp (мгновенно). */
export function paintRoad(svg, xp) {
  $$('.road-seg', svg).forEach(p => {
    const i = +p.dataset.seg; const len = p.getTotalLength();
    const frac = clamp((xp - i * PER_LEVEL) / PER_LEVEL, 0, 1);
    p.style.strokeDasharray = `${(len * frac).toFixed(1)} 9999`;
  });
}
export function placeHero(svg, xp) { const [x, y] = heroPoint(xp); const h = svg.querySelector('.hero-pos'); h && h.setAttribute('transform', `translate(${(x - 40).toFixed(1)} ${(y - 84).toFixed(1)}) scale(.9)`); }
export function scrollToHero(wrap, xp, smooth = false) {
  const svg = wrap.querySelector('svg'); if (!svg) return;
  const scale = svg.getBoundingClientRect().height / MAP_H;
  const [x] = heroPoint(xp); const target = x * scale - wrap.clientWidth * .38;
  wrap.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
}
/** Анимированный путь героя от xp0 до xp1: шаги, флажки, приближение и победа над боссом. */
export async function walk(wrap, xp0, xp1, onBoss) {
  const svg = wrap.querySelector('svg'); if (!svg) return;
  const hero = svg.querySelector('.heroes'); const reduce = document.body.classList.contains('anim-off');
  if (reduce || xp0 === xp1) { paintRoad(svg, xp1); placeHero(svg, xp1); scrollToHero(wrap, xp1); return; }
  const dir = xp1 > xp0 ? 1 : -1; const dist = Math.abs(xp1 - xp0);
  const dur = clamp(dist * 22, 900, 6500);
  hero && hero.classList.add('walking');
  if (dir < 0) hero && hero.setAttribute('transform', 'translate(90 0) scale(-1 1)');
  const t0 = performance.now(); let lastStep = 0;
  const bossesCrossed = BOSSES.filter(b => dir > 0 && xp0 < b.level * PER_LEVEL && xp1 >= b.level * PER_LEVEL);
  const flagsCrossed = new Set();
  await new Promise(res => {
    const frame = (now) => {
      const k = clamp((now - t0) / dur, 0, 1); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const v = xp0 + (xp1 - xp0) * e;
      placeHero(svg, v); paintRoad(svg, v); scrollToHero(wrap, v);
      if (now - lastStep > 180) { sound.play('step'); lastStep = now; }
      const lvl = Math.floor(v / PER_LEVEL);
      for (let i = 1; i <= lvl; i++) if (!flagsCrossed.has(i) && i * PER_LEVEL > xp0) { flagsCrossed.add(i); const f = svg.querySelector(`[data-flag="${i}"]`); if (f) { f.classList.add('up'); f.querySelector('.fl').setAttribute('fill', '#7a1f2b'); } const n = svg.querySelector(`[data-node="${i}"]`); n && n.classList.add('passed'); n && n.querySelector('.stone').setAttribute('fill', '#c9a043'); }
      if (k < 1) requestAnimationFrame(frame); else res();
    };
    requestAnimationFrame(frame);
  });
  hero && hero.classList.remove('walking'); hero && hero.removeAttribute('transform');
  $$('.map-node', svg).forEach(n => n.classList.toggle('current', +n.dataset.node === levelInfo(xp1).level && !levelInfo(xp1).done));
  // приближение к боссу
  const li = levelInfo(xp1);
  if (li.nextBoss && li.level === li.nextBoss.level) {
    const bg = svg.querySelector(`.map-boss[data-boss="${li.nextBoss.id}"] .boss`);
    if (bg && bg.getAttribute('data-state') !== 'fight') { setBossState(bg, 'fight'); bg.classList.add('boss-near'); say(wrap.parentElement, bg, pick(li.nextBoss.taunts), { ms: 3400 }); }
  }
  for (const b of bossesCrossed) {
    const bg = svg.querySelector(`.map-boss[data-boss="${b.id}"] .boss`);
    if (bg) { setBossState(bg, 'defeated'); say(wrap.parentElement, bg, b.defeat, { ms: 3600 }); }
    sound.play('fanfare');
    const ch = svg.querySelector(`.map-chest[data-boss="${b.id}"]`); ch && ch.classList.add('open');
    await sleep(1400);
    onBoss && await onBoss(b);
  }
  if (Math.floor(xp1 / PER_LEVEL) > Math.floor(xp0 / PER_LEVEL) && !bossesCrossed.length && dir > 0) sound.play('level');
}

// ---------------- боссы и сокровища ----------------
export function openBoss(id) {
  const b = BOSSES.find(x => x.id === id); if (!b) return;
  const xp = totalXP(); const st = bossState(b, xp); const tr = treasure(b.level);
  const lvlStart = (b.level - 1) * PER_LEVEL, toWin = Math.max(0, b.level * PER_LEVEL - xp);
  const quote = st === 'defeated' || st === 'opened' ? b.defeat : st === 'locked' ? 'Этот враг пока скрыт туманом. Пройдите путь до его земель.' : (st === 'fight' ? pick(b.taunts) : b.intro);
  const trHTML = tr ? `<div class="treasure-slot">${chestSVG(tr.cost, st === 'opened')}<div>${tr.image ? `<img class="timg" src="${tr.image}" alt="">` : ''}<div style="font-size:19px;font-weight:700;color:var(--burg2)">${esc(tr.name)}</div><div>${money(tr.cost)} · <span class="muted">${treasureTier(tr.cost).name}</span></div>${tr.description ? `<div class="small" style="margin-top:4px">${esc(tr.description)}</div>` : ''}<p class="small muted" style="margin:6px 0 0">Сокровище — мотивация. Его стоимость не списывается из казны.</p></div></div>`
    : `<div class="treasure-slot">${chestSVG(0, false)}<div><b>Сокровище не назначено</b><p class="small muted" style="margin:4px 0 0">Назначьте желанную покупку — после победы над ${esc(b.ins || b.name)} откроется сундук с ней.</p></div></div>`;
  const m = modal({ cls: 'boss-modal', wide: true, title: b.name, art: bossSVG(b.id, st === 'opened' ? 'defeated' : st),
    body: `<div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:6px"><span class="boss-state ${st}">${STATE_LABEL[st]}</span><span class="muted">${esc(b.place)} · уровень ${b.level}</span></div>
      <p style="margin:6px 0">${esc(b.nature)}</p><p class="ital" style="font-size:18px;margin:8px 0;color:var(--burg2)">«${esc(quote)}»</p>
      ${st === 'fight' || st === 'waiting' ? `<div class="kv"><span>До победы</span><b>${toWin} ${plural(toWin, ['шаг', 'шага', 'шагов'])}</b></div><div class="rope red" style="margin-top:6px"><i style="width:${clamp((xp - (b.level - 5) * PER_LEVEL) / (5 * PER_LEVEL) * 100, 0, 100)}%"></i></div>` : ''}
      ${heading('Сокровищница')}${trHTML}`,
    actions: [
      ...(tr ? [{ label: 'Удалить', kind: 'btn-ghost', icon: 'trash', onClick: async () => { if (!await confirmDialog({ title: 'Удалить сокровище?', text: `«${tr.name}» исчезнет из сокровищницы.`, ok: 'Удалить', danger: true })) return false; await db.commit([{ store: 'treasures', del: tr.id }]); undoToast('Сокровище удалено', () => db.commit([{ store: 'treasures', put: tr, keepStamp: true }])); } }] : []),
      ...((st === 'defeated') ? [{ label: 'Открыть сундук', kind: 'btn-gold', icon: 'chest', onClick: () => { setTimeout(() => openTreasureScene(b), 120); } }] : []),
      { label: tr ? 'Изменить сокровище' : 'Назначить сокровище', kind: st === 'defeated' ? 'btn-ink' : 'btn-gold', icon: 'edit', onClick: () => { setTimeout(() => editTreasure(b.level), 120); } }
    ] });
  const art = m.el.querySelector('.boss-art .boss'); if (art && st === 'fight') art.classList.add('boss-near');
}
const PRIZE_ICONS = ['gift', 'ship', 'crown', 'lute', 'dice', 'book', 'horse', 'house', 'shirt', 'goblet', 'chest', 'mirror', 'cup', 'paw', 'star', 'sword', 'map', 'candle'];
export function editTreasure(level) {
  const tr = treasure(level);
  const free = BOSSES.map(b => ({ value: b.level, label: `${b.name} (ур. ${b.level})${treasure(b.level) && b.level !== level ? ' — занято' : ''}` }));
  let image = tr ? tr.image || '' : '';
  const f = form([
    { name: 'name', label: 'Название', type: 'text', required: true, value: tr ? tr.name : '', placeholder: 'Например: новая настольная игра' },
    { name: 'cost', label: 'Стоимость', type: 'money', value: tr ? tr.cost : '', required: true, min: 1, half: true },
    { name: 'level', label: 'Босс-хранитель', type: 'select', options: free, value: level, half: true },
    { name: 'description', label: 'Описание', type: 'textarea', value: tr ? tr.description : '', placeholder: 'Почему хочется именно это' },
    { name: 'icon', label: 'Значок', type: 'icon', icons: PRIZE_ICONS, value: tr ? tr.icon || 'gift' : 'gift' }
  ]);
  const imgBox = document.createElement('div'); imgBox.className = 'field';
  const drawImg = () => { imgBox.innerHTML = `<label>Изображение</label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${image ? `<img src="${image}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;box-shadow:0 0 0 2px var(--gold)">` : '<span class="muted small">Можно добавить фото желанной вещи</span>'}<button type="button" class="btn btn-ink sm" data-img>${icon('upload')}${image ? 'Заменить' : 'Выбрать фото'}</button>${image ? `<button type="button" class="btn btn-ghost sm" data-noimg>${icon('trash')}Убрать</button>` : ''}</div>`; };
  drawImg(); f.el.appendChild(imgBox);
  imgBox.addEventListener('click', async (e) => {
    if (e.target.closest('[data-noimg]')) { image = ''; drawImg(); return; }
    if (e.target.closest('[data-img]')) { const file = await pickFile('image/*'); if (!file) return; try { image = await resizeImage(file, 520); drawImg(); } catch (err) { toast(err.message, { kind: 'bad' }); } }
  });
  const preview = document.createElement('div'); preview.className = 'small muted'; preview.style.gridColumn = '1/-1';
  const upd = () => { const v = f.values(); preview.innerHTML = v.cost ? `Вид сундука: <b>${treasureTier(v.cost).name}</b> — чем дороже мечта, тем богаче ларец.` : ''; };
  f.on('cost', upd); upd(); f.el.appendChild(preview);
  modal({ title: tr ? 'Сокровище' : 'Назначить сокровище', body: f.el, wide: true, actions: [{ label: 'Отмена', kind: 'btn-ghost' }, { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => {
    if (!f.validate()) return false;
    const v = f.values(); const to = Number(v.level);
    const rec = { id: 'L' + to, level: to, name: v.name.trim(), cost: v.cost, description: (v.description || '').trim(), icon: v.icon, image, createdAt: tr ? tr.createdAt : Date.now() };
    const ops = [{ store: 'treasures', put: rec }];
    if (to !== level) { const other = treasure(to); if (tr) ops.push({ store: 'treasures', del: 'L' + level }); if (other) ops.push({ store: 'treasures', put: { ...other, id: 'L' + level, level } }); }
    await db.commit(ops); db.journal('treasure', `Сокровище «${rec.name}» (${money(rec.cost)}) у босса уровня ${to}`);
    toast('Сокровище сохранено', { kind: 'good' });
  } }] });
}
export function openTreasureScene(b) {
  return new Promise((resolve) => {
    const tr = treasure(b.level);
    const prize = tr ? (tr.image ? `<img src="${tr.image}" alt="">` : icon(tr.icon || 'gift')) : icon('star');
    const m = modal({ cls: 'treasure-modal', title: `Победа над ${b.ins || b.name}!`, dismissible: false,
      body: `<div class="treasure-stage"><div class="rays"></div>${chestSVG(tr ? tr.cost : 0, false)}<div class="prize">${prize}</div></div>
        ${tr ? `<div class="treasure-name">${esc(tr.name)}</div><div class="treasure-cost">${money(tr.cost)} · ${treasureTier(tr.cost).name}</div>${tr.description ? `<p>${esc(tr.description)}</p>` : ''}<p class="small" style="color:#c9b089">Сундук открыт — мечта заслужена. Покупка остаётся на ваше усмотрение: казна не тронута.</p>`
          : `<div class="treasure-name">Сундук пуст!</div><p>Вы не назначили сокровище этому боссу. Самое время решить, чем себя наградить.</p>`}
        <p class="ital" style="color:#e5cf9e">«${esc(b.defeat)}»</p>`,
      actions: [...(tr ? [] : [{ label: 'Назначить сокровище', kind: 'btn-ink', onClick: async () => { await mark(); setTimeout(() => editTreasure(b.level), 150); } }]), { label: tr ? 'Забрать в летопись' : 'Позже', kind: 'btn-gold', icon: 'crown', onClick: async () => { await mark(); } }],
      onClose: () => resolve() });
    async function mark() { const s = openedSet(); s.add(b.level); await db.setGState('opened', [...s]); db.journal('boss', `Победа над ${b.ins || b.name}${tr ? `, открыто сокровище «${tr.name}»` : ''}`); }
    const stage = m.el.querySelector('.treasure-stage'), ch = m.el.querySelector('.chest-art');
    sound.play('creak');
    setTimeout(() => { ch.setAttribute('data-open', '1'); stage.classList.add('open'); sound.play('coins'); const r = ch.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * .4, 26, true); }, 700);
  });
}

// ---------------- экран колеса ----------------
const SPIN_LINES = ['Ох, сейчас узнаем, кому сегодня не повезло!', 'А вот и судьба ваша, государь!', 'Ставлю три гроша на неприятности!', 'Крутись, родимое, крутись!', 'Держите шапки, бояре!', 'Ой-ой-ой, что-то будет!', 'Колесо Фортуны не любит скупых!', 'Глаза закрою — так страшнее!', 'Кто не рискует, тот не пьёт квас!', 'Сейчас как выпадет что-нибудь благородное…', 'Звенят бубенцы — к заданию!', 'А ну, кинжал мой, не подведи!', 'Колесо скрипит — значит, к добру. Наверное.', 'Шут крутит — царь платит!', 'Быстрее, быстрее! Ой, голова кружится…'];
const AFTER_LINES = ['Удачи, царь-батюшка!', 'В добрый путь!', 'Ну что, государь, сами напросились!', 'Да это же сущие пустяки… Наверное.', 'Попал! Я всегда попадаю. Иногда.', 'Хе-хе, вот это вам досталось!', 'Сам бы взялся, да бубенцы мешают.', 'Задание благородное, почти рыцарское!', 'Не благодарите, благодарите кинжал!', 'Пусть казна прибудет, а живот не убудет!', 'С таким заданием и до босса рукой подать!', 'Ох и хитро выпало, ох и мудро!', 'Принимайте, пока судьба не передумала!', 'Ну-ка, покажите, кто тут царь!', 'Я бы на вашем месте начал прямо сейчас.'];
const IDLE_LINES = ['Покрутим колесо, государь?', 'Кинжал наточен, колесо смазано!', 'Скучно без заданий, ох скучно…', 'Я тут подумал… нет, забыл.', 'Бубенцы звенят — шут не спит!'];
let wEl = null, wTab = 'wheel', spinning = false, angle = 0, sectors = [], qKindFilter = 'all';
const R = 230;
function sectorPath(i, n) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; const p = (a) => `${(R * Math.sin(a)).toFixed(1)} ${(-R * Math.cos(a)).toFixed(1)}`; return `M0 0L${p(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}Z`; }
const SECT_COL = ['#7a1f2b', '#e8c86e', '#3d5a3a', '#efe0bf', '#a63a2e', '#c9a043', '#34506e', '#f6ead0'];
function wheelMarkup(list) {
  const n = Math.max(1, list.length);
  const items = list.length ? list : [{ id: '', title: 'Добавьте задания' }];
  let s = `<g class="wheel-rot" style="transform:rotate(${angle}deg)">`;
  items.forEach((q, i) => {
    const col = SECT_COL[i % SECT_COL.length] === SECT_COL[0] && i === n - 1 && n % 2 ? '#5b3f6e' : SECT_COL[i % SECT_COL.length];
    const dark = ['#7a1f2b', '#3d5a3a', '#a63a2e', '#34506e', '#5b3f6e'].includes(col);
    const mid = (i + .5) / n * 360; const lim = n > 9 ? 17 : 19; const t = q.title.length > lim ? q.title.slice(0, lim - 1).trim() + '…' : q.title;
    s += `<g class="wheel-sector ${dark ? 'dark' : ''}" data-i="${i}"><path d="${sectorPath(i, n)}" fill="${col}" stroke="#2a1b12" stroke-width="2.4"/><text transform="rotate(${(mid - 90).toFixed(2)}) translate(${R - 16} 6)" text-anchor="end" style="font-size:${n > 9 ? 15 : n > 6 ? 17 : 19}px">${esc(t)}</text></g>`;
  });
  s += `<circle r="${R}" fill="none" stroke="#2a1b12" stroke-width="5"/><circle r="${R + 12}" fill="none" stroke="#6b4528" stroke-width="20"/><circle r="${R + 12}" fill="none" stroke="#2a1b12" stroke-width="2" stroke-dasharray="3 14"/>`;
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; s += `<circle cx="${((R + 12) * Math.sin(a)).toFixed(1)}" cy="${(-(R + 12) * Math.cos(a)).toFixed(1)}" r="4" fill="#e8c86e" stroke="#2a1b12" stroke-width="1.2"/>`; }
  s += `<circle r="46" fill="#c9a043" stroke="#2a1b12" stroke-width="3"/><circle r="34" fill="#e8c86e" stroke="#2a1b12" stroke-width="1.5"/>
    <path d="M-14 -4c4-4 8-4 10 0M4 -4c4-4 8-4 10 0" fill="none" stroke="#2a1b12" stroke-width="2"/><path d="M-10 10q10 8 20 0" fill="none" stroke="#2a1b12" stroke-width="2"/><circle cx="-9" cy="3" r="2.5" fill="#d9705c" opacity=".6"/><circle cx="9" cy="3" r="2.5" fill="#d9705c" opacity=".6"/>`;
  s += `<g class="stuck-dagger"></g></g>`;
  return s;
}
export function sectorAt(ang, n) { const a = ((-ang % 360) + 360) % 360; return Math.floor(a / (360 / n)) % n; }
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buildSectors() { const c = wheelCandidates(); sectors = c.length > 12 ? shuffle(c).slice(0, 12) : c; }

export const wheelScreen = {
  mount(root) {
    wEl = root;
    root.innerHTML = `<div class="screen-head"><h1>Колесо заданий</h1><span class="sub">шут Гороховый к вашим услугам</span><span class="grow"></span></div>
      <div class="tabs">${seg('wtab', [{ value: 'wheel', label: 'Колесо', icon: 'wheel' }, { value: 'quests', label: 'Задания и цели', icon: 'scroll' }, { value: 'hist', label: 'Летопись подвигов', icon: 'book' }], wTab, 'wide')}</div>
      <div class="w-body"></div>`;
    root.addEventListener('click', onWheelClick);
    db.on(['quests', 'questRuns', 'xpLog'], () => { if (wEl.classList.contains('active') && !spinning) renderWheelTab(); });
  },
  show() { renderWheelTab(); },
  hide() {}
};
function renderWheelTab() {
  $$('[data-seg="wtab"] .seg-b', wEl).forEach(b => b.classList.toggle('on', b.dataset.val === wTab));
  const body = wEl.querySelector('.w-body');
  if (wTab === 'wheel') renderWheel(body); else if (wTab === 'quests') renderQuests(body); else renderHistory(body);
}
function renderWheel(body) {
  buildSectors();
  const act = activeRuns();
  body.innerHTML = `<div class="wheel-layout"><div><div class="scene-box stage-box"><svg class="art scene" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice">${stageScene()}</svg></div>
      <div class="spin-bar"><button class="btn btn-gold spin-btn" data-act="spin" ${sectors.length ? '' : 'disabled'}>${icon('wheel')}Крутить колесо</button></div></div>
    <div class="side-col"><div class="paper">${heading('Принятые задания', `<button class="btn btn-ghost sm hd-act" data-wtab="quests">${icon('edit')}Все задания</button>`)}
      ${act.length ? act.map(r => questRow(r)).join('') : empty('Нет принятых заданий', 'Крутите колесо — шут подберёт испытание')}</div>
      <div class="paper"><p class="small" style="margin:0">${sectors.length ? `На колесе ${sectors.length} ${plural(sectors.length, ['задание', 'задания', 'заданий'])}${wheelCandidates().length > sectors.length ? ` из ${wheelCandidates().length} (каждый раз выбираются случайно)` : ''}. Выбор делает честный генератор случайных чисел, а колесо лишь показывает результат.` : 'Для колеса нет свободных заданий: все уже приняты или отключены. Добавьте новые во вкладке «Задания и цели».'}</p></div></div></div>`;
  body.querySelector('.wheel-holder').innerHTML = wheelMarkup(sectors);
  const j = body.querySelector('.jester'); setMood(j, 'idle');
}
async function onWheelClick(e) {
  const t = e.target.closest('[data-seg="wtab"] .seg-b, [data-wtab]');
  if (t) { wTab = t.dataset.val || t.dataset.wtab; renderWheelTab(); return; }
  if (e.target.closest('[data-act="spin"]')) return spin();
  if (e.target.closest('.jester') && !spinning) { const j = wEl.querySelector('.jester'); say(wEl.querySelector('.stage-box'), j.querySelector('.head'), pick(IDLE_LINES), { ms: 2400 }); setMood(j, 'laugh'); setTimeout(() => setMood(j, 'idle'), 1200); return; }
  const qa = e.target.closest('[data-qact]'); if (qa) return questAction(qa.dataset.q, qa.dataset.qact);
  const kf = e.target.closest('[data-qkind]'); if (kf) { qKindFilter = kf.dataset.qkind; renderWheelTab(); return; }
  if (e.target.closest('[data-act="new-quest"]')) return editQuest();
}
async function spin() {
  if (spinning) return; buildSectors(); if (!sectors.length) return;
  spinning = true;
  const box = wEl.querySelector('.stage-box'), holder = box.querySelector('.wheel-holder'), j = box.querySelector('.jester');
  holder.innerHTML = wheelMarkup(sectors);
  const rot = holder.querySelector('.wheel-rot'); const btn = wEl.querySelector('[data-act="spin"]'); btn.disabled = true;
  box.querySelectorAll('.fly-dagger').forEach(d => d.remove()); j.classList.remove('thrown');
  const n = sectors.length; const k = rand(n); const chosen = sectors[k];
  const width = 360 / n; const delta = (rand(1000) / 1000 - .5) * width * .7;
  const target = (((-(k + .5) * width + delta) % 360) + 360) % 360;
  const cur = ((angle % 360) + 360) % 360; const spins = 5 + rand(3);
  const final = angle + spins * 360 + ((target - cur + 360) % 360);
  setMood(j, 'nervous'); say(box, j.querySelector('.head'), pick(SPIN_LINES), { ms: 2600 });
  await sleep(document.body.classList.contains('anim-off') ? 0 : 750);
  setMood(j, 'spin'); sound.play('creak');
  const dur = document.body.classList.contains('anim-off') ? 300 : 5200; const start = angle; const t0 = performance.now(); let lastSector = -1;
  await new Promise(res => {
    const fr = (now) => {
      const x = clamp((now - t0) / dur, 0, 1); const e = 1 - Math.pow(1 - x, 3.2);
      angle = start + (final - start) * e; rot.style.transform = `rotate(${angle}deg)`;
      const s = sectorAt(angle, n); if (s !== lastSector) { lastSector = s; sound.play('tick'); }
      if (x > .25 && j.getAttribute('data-mood') === 'spin') setMood(j, 'laugh');
      if (x > .82 && j.getAttribute('data-mood') === 'laugh') setMood(j, 'windup');
      if (x < 1) requestAnimationFrame(fr); else res();
    };
    requestAnimationFrame(fr);
  });
  angle = final;
  const landed = sectorAt(angle, n);
  if (landed !== k) console.warn('Сектор под указателем не совпал с выбором', landed, k);
  await throwDagger(box, j);
  const sec = rot.querySelector(`.wheel-sector[data-i="${k}"]`); sec && sec.classList.add('win');
  setMood(j, 'laugh'); say(box, j.querySelector('.head'), pick(AFTER_LINES), { ms: 3000 });
  await sleep(900);
  spinning = false; btn.disabled = false; setMood(j, 'idle');
  showResult(chosen);
}
async function throwDagger(box, j) {
  setMood(j, 'throw'); j.classList.add('thrown'); sound.play('pop');
  const hand = j.querySelector('.arm-r .fore'); const br = box.getBoundingClientRect();
  const hr = hand.getBoundingClientRect(); const pointer = box.querySelector('.wheel-pointer').getBoundingClientRect();
  const x0 = hr.left + hr.width / 2 - br.left, y0 = hr.top + hr.height * .8 - br.top;
  const x1 = pointer.left + pointer.width / 2 - br.left, y1 = pointer.bottom - br.top + br.height * .012;
  const d = document.createElement('div'); d.innerHTML = daggerSVG(); const el = d.firstElementChild; box.appendChild(el);
  const scale = clamp(br.width / 1000 * 1.25, .55, 1.3);
  el.style.width = 34 * scale + 'px'; el.style.height = 82 * scale + 'px'; el.style.marginLeft = -17 * scale + 'px'; el.style.marginTop = -6 * scale + 'px';
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - br.height * .18;
  const kf = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1; kf.push({ transform: `translate(${x}px, ${y}px) rotate(${-200 + t * 380}deg)` }); }
  kf[kf.length - 1].transform = `translate(${x1}px, ${y1}px) rotate(180deg)`;
  const anim = el.animate(kf, { duration: document.body.classList.contains('anim-off') ? 10 : 520, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' });
  await anim.finished.catch(() => {});
  sound.play('thunk');
  el.animate([{ transform: `translate(${x1}px, ${y1}px) rotate(180deg)` }, { transform: `translate(${x1}px, ${y1}px) rotate(186deg)` }, { transform: `translate(${x1}px, ${y1}px) rotate(176deg)` }, { transform: `translate(${x1}px, ${y1}px) rotate(180deg)` }], { duration: 380, fill: 'forwards' });
}
function showResult(q) {
  const dueDays = q.kind === 'once' && q.deadline ? D.diff(D.today(), q.deadline) + 1 : Math.max(1, parseInt(q.durationDays) || 7);
  modal({ title: 'Жребий брошен!', cls: 'result', body: `<div class="result-card"><p class="muted small" style="margin:0">Кинжал шута указал на задание:</p><div class="rt">${esc(q.title)}</div>${q.description ? `<p style="margin:0">${esc(q.description)}</p>` : ''}
    <div class="stats"><div><b>${q.steps || 1}</b><span>${plural(q.steps || 1, ['шаг', 'шага', 'шагов'])}</span></div><div><b>+${q.xp}</b><span>опыта</span></div><div><b>${dueDays}</b><span>${plural(dueDays, ['день', 'дня', 'дней'])} срок</span></div></div>
    <p class="small muted">Опыт двигает героев по дороге: 1 опыт = 1 шаг, 100 шагов = уровень.</p></div>`,
    actions: [{ label: 'Не сейчас', kind: 'btn-ghost' }, { label: 'Принять задание', kind: 'btn-gold', icon: 'check', onClick: async () => { const r = await startRun(q, 'wheel'); toast(`Задание принято до ${D.dm(r.due)}`, { kind: 'good' }); sound.play('pop'); } }] });
}

// ---------------- управление заданиями ----------------
function renderQuests(body) {
  const all = quests().filter(q => q.status !== 'archived');
  const arch = quests().filter(q => q.status === 'archived');
  const list = qKindFilter === 'all' ? all : qKindFilter === 'archived' ? arch : all.filter(q => q.kind === qKindFilter);
  const act = new Map(activeRuns().map(r => [r.questId, r]));
  body.innerHTML = `<div class="paper"><div class="ops-actions"><div class="chips">${[['all', 'Все'], ...Object.entries(KIND), ['archived', `Архив (${arch.length})`]].map(([v, l]) => `<button class="chip ${qKindFilter === v ? 'on' : ''}" data-qkind="${v}">${l}</button>`).join('')}</div><span class="grow"></span><button class="btn btn-gold" data-act="new-quest">${icon('plus')}Новое задание</button></div>
    ${list.length ? `<ul class="ledger">${list.map(q => { const r = act.get(q.id); const st = streak(q);
      return `<li class="lrow" style="cursor:default"><span class="cat-ic" style="--c:${q.status === 'paused' ? '#8a7058' : q.kind === 'wheel' ? '#7a1f2b' : '#3d5a3a'}">${icon(q.kind === 'wheel' ? 'wheel' : PERIODIC.includes(q.kind) ? 'repeat' : 'flag')}</span>
      <div class="main"><div class="t">${esc(q.title)}${q.example ? ' <span class="tag">пример</span>' : ''}</div><div class="m">${KIND[q.kind]}${q.kind === 'regular' ? ` · каждые ${q.everyDays} ${plural(q.everyDays, ['день', 'дня', 'дней'])}` : ''} · +${q.xp} опыта · ${q.steps} ${plural(q.steps, ['шаг', 'шага', 'шагов'])}${q.kind === 'wheel' || (q.kind === 'once' && q.inWheel) ? ` · срок ${q.durationDays} дн.` : ''}${q.kind === 'once' && q.deadline ? ` · до ${D.dmy(q.deadline)}` : ''}${q.inWheel && !PERIODIC.includes(q.kind) ? ' · на колесе' : ''}${q.status === 'paused' ? ' · отключено' : ''}${r ? ' · <b>в работе</b>' : ''}${st ? ` · серия ${st}` : ''}</div></div>
      ${!r && q.status === 'active' && !PERIODIC.includes(q.kind) ? `<button class="btn btn-ink sm" data-q="${q.id}" data-qact="start">Взять</button>` : ''}
      <button class="icon-btn sm" data-q="${q.id}" data-qact="${q.status === 'archived' ? 'unarchive' : q.status === 'paused' ? 'resume' : 'pause'}" title="${q.status === 'archived' ? 'Вернуть из архива' : q.status === 'paused' ? 'Включить' : 'Временно отключить'}">${icon(q.status === 'active' ? 'lock' : 'repeat')}</button>
      <button class="icon-btn sm" data-q="${q.id}" data-qact="edit" title="Изменить">${icon('edit')}</button></li>`; }).join('')}</ul>` : empty('Здесь пока пусто', 'Создайте задание: цель, награду в опыте и срок')}</div>
    <p class="small muted" style="margin:10px 4px">Регулярные, еженедельные и ежемесячные задания сами появляются в каждом новом периоде. За одно задание в одном периоде опыт начисляется только один раз. Просроченные задания уходят в летопись без опыта.</p>`;
}
async function questAction(id, act) {
  const q = db.get('quests', id); if (!q) return;
  if (act === 'edit') return editQuest(q);
  if (act === 'start') { const r = await startRun(q, 'manual'); toast(`Задание взято до ${D.dm(r.due)}`, { kind: 'good' }); return; }
  const status = act === 'pause' ? 'paused' : 'active';
  await db.commit([{ store: 'quests', put: { ...q, status } }]);
  toast(act === 'pause' ? 'Задание отключено' : 'Задание снова активно');
  if (status === 'active') refreshQuests();
}
export function editQuest(q = null) {
  const f = form([
    { name: 'title', label: 'Название', type: 'text', required: true, value: q ? q.title : '' },
    { name: 'description', label: 'Описание', type: 'textarea', value: q ? q.description : '' },
    { name: 'kind', label: 'Тип', type: 'segmented', options: Object.entries(KIND).map(([v, l]) => ({ value: v, label: l })), value: q ? q.kind : 'wheel' },
    { name: 'xp', label: 'Опыт за выполнение', type: 'number', required: true, value: q ? q.xp : 30, min: 1, half: true, hint: '1 опыт = 1 шаг героев' },
    { name: 'steps', label: 'Шагов в задании', type: 'number', required: true, value: q ? q.steps : 1, min: 1, half: true, hint: 'Сколько отметок до выполнения' },
    { name: 'everyDays', label: 'Повторять каждые N дней', type: 'number', value: q ? q.everyDays || 1 : 1, min: 1, half: true, show: v => v.kind === 'regular' },
    { name: 'durationDays', label: 'Срок выполнения, дней', type: 'number', value: q ? q.durationDays || 7 : 7, min: 1, half: true, show: v => v.kind === 'wheel' || (v.kind === 'once' && v.inWheel) },
    { name: 'deadline', label: 'Выполнить до', type: 'date', value: q ? q.deadline || '' : '', half: true, show: v => v.kind === 'once' && !v.inWheel, hint: 'Пусто — без срока' },
    { name: 'inWheel', type: 'checkbox', text: 'Участвует в колесе случайных заданий', value: q ? !!q.inWheel : true, show: v => v.kind === 'wheel' || v.kind === 'once' },
    { name: 'repeatable', type: 'checkbox', text: 'Можно выполнять повторно', value: q ? q.repeatable !== false : true, show: v => v.kind === 'wheel' || v.kind === 'once' }
  ]);
  const doneN = q ? runs().filter(r => r.questId === q.id && r.status === 'done').length : 0;
  modal({ title: q ? 'Задание' : 'Новое задание', body: f.el, wide: true, actions: [
    ...(q ? [{ label: 'Удалить', kind: 'btn-danger', icon: 'trash', onClick: async () => {
      if (!await confirmDialog({ title: 'Удалить задание?', text: doneN ? `Задание выполнялось ${doneN} раз — история и полученный опыт сохранятся в летописи.` : 'Задание будет удалено.', ok: 'Удалить', danger: true })) return false;
      const act = activeRuns().filter(r => r.questId === q.id);
      await db.commit([{ store: 'quests', del: q.id }, ...act.map(r => ({ store: 'questRuns', put: { ...r, status: 'abandoned', endedAt: Date.now() } }))]);
      undoToast('Задание удалено', () => db.commit([{ store: 'quests', put: q, keepStamp: true }, ...act.map(r => ({ store: 'questRuns', put: r, keepStamp: true }))]));
    } }, { label: q.status === 'archived' ? 'Из архива' : 'В архив', kind: 'btn-ink', icon: 'book', onClick: async () => {
      const act = activeRuns().filter(r => r.questId === q.id);
      await db.commit([{ store: 'quests', put: { ...q, status: q.status === 'archived' ? 'active' : 'archived' } }, ...(q.status === 'archived' ? [] : act.map(r => ({ store: 'questRuns', put: { ...r, status: 'abandoned', endedAt: Date.now() } })))]);
      toast(q.status === 'archived' ? 'Задание возвращено' : 'Задание в архиве'); if (q.status === 'archived') refreshQuests();
    } }] : [{ label: 'Отмена', kind: 'btn-ghost' }]),
    { label: 'Сохранить', kind: 'btn-gold', icon: 'check', onClick: async () => {
      if (!f.validate()) return false;
      const v = f.values();
      const rec = { ...(q || {}), id: q ? q.id : db.uid('q'), title: v.title.trim(), description: (v.description || '').trim(), kind: v.kind, xp: Math.round(v.xp), steps: Math.max(1, Math.round(v.steps)),
        everyDays: Math.max(1, Math.round(v.everyDays || 1)), durationDays: Math.max(1, Math.round(v.durationDays || 7)), deadline: v.deadline || '', inWheel: (v.kind === 'wheel' || v.kind === 'once') ? !!v.inWheel : false,
        repeatable: !!v.repeatable, status: q ? (q.status === 'archived' ? 'archived' : q.status) : 'active', createdAt: q ? q.createdAt : Date.now(), createdDate: q ? q.createdDate : D.today(), example: false, order: q ? q.order : quests().length };
      const ops = [{ store: 'quests', put: rec }];
      // изменения награды/шагов распространяются на текущее активное выполнение (без двойного начисления)
      for (const r of activeRuns().filter(r => r.questId === rec.id)) ops.push({ store: 'questRuns', put: { ...r, title: rec.title, xp: rec.xp, steps: rec.steps, progress: Math.min(r.progress, rec.steps - 1) } });
      await db.commit(ops); await refreshQuests();
      toast(q ? 'Задание сохранено' : 'Задание создано', { kind: 'good' });
    } }] });
}
function renderHistory(body) {
  const list = runs().filter(r => r.status !== 'active').sort((a, b) => (b.doneAt || b.endedAt || 0) - (a.doneAt || a.endedAt || 0));
  const xp = totalXP(), li = levelInfo(xp);
  const done = list.filter(r => r.status === 'done');
  body.innerHTML = `<div class="paper"><div class="sum-row"><div class="sum"><div class="l">Всего опыта</div><div class="v">${xp}</div><span class="d">уровень ${li.level}${li.done ? ' · путь пройден' : ''}</span></div><div class="sum"><div class="l">Выполнено</div><div class="v">${done.length}</div><span class="d">${plural(done.length, ['задание', 'задания', 'заданий'])}</span></div><div class="sum"><div class="l">Просрочено</div><div class="v">${list.filter(r => r.status === 'expired').length}</div><span class="d">без опыта</span></div><div class="sum"><div class="l">Побеждено боссов</div><div class="v">${BOSSES.filter(b => xp >= b.level * PER_LEVEL).length} / 8</div></div></div>
    ${list.length ? `<ul class="ledger">${list.slice(0, 300).map(r => `<li class="lrow" style="cursor:default"><span class="cat-ic" style="--c:${r.status === 'done' ? '#4a6f36' : r.status === 'expired' ? '#9b2c2c' : '#8a7058'}">${icon(r.status === 'done' ? 'check' : r.status === 'expired' ? 'hourglass' : 'close')}</span>
      <div class="main"><div class="t">${esc(r.title)}</div><div class="m">${r.status === 'done' ? 'выполнено ' + D.dm(D.fmt(new Date(r.doneAt))) : r.status === 'expired' ? 'просрочено, срок был ' + D.dm(r.due) : 'оставлено'}${r.source === 'wheel' ? ' · с колеса' : ''}</div></div>
      <div class="amt ${r.status === 'done' ? 'inc' : 'trn'}">${r.status === 'done' ? '+' + r.xp : '0'}</div></li>`).join('')}</ul>` : empty('Летопись пока пуста', 'Выполненные и просроченные задания будут записаны здесь')}</div>`;
}
