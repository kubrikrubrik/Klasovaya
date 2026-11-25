// scenes.js — места действия: сокровищница, палата казначея, балаган шута,
// боярская дума, царская кухня и земли на карте пути.
import { P, G, Pt, L, E, C, SH, HL, MIR, strokes, star4, coin, rng, servant, treasurer, treasurerDesk, jester, cook, cookTable, cookPot } from './art.js';

const op = (s, o) => s.replace('/>', ` opacity="${o}"/>`);

function stoneWall(x0, y0, w, h, rowH, seed, base, line) {
  const r = rng(seed); let d = '', blocks = '';
  for (let y = y0, row = 0; y < y0 + h; y += rowH, row++) {
    d += `M${x0} ${y}H${x0 + w}`;
    const off = row % 2 ? rowH : 0;
    for (let x = x0 + off; x < x0 + w; x += rowH * 2) {
      d += `M${x} ${y}v${rowH}`;
      if (r() < .18) blocks += `<rect x="${x + 2}" y="${y + 2}" width="${rowH * 2 - 4}" height="${rowH - 4}" fill="${base}" opacity=".5"/>`;
    }
  }
  return blocks + `<path d="${d}" stroke="${line}" stroke-width="2" fill="none" opacity=".55"/>`;
}
function banner(x, y, len, col, emblem) {
  return G('banner', L(`M${x - 46} ${y}H${x + 46}`, 'k') + C(x - 48, y, 4, P.gold, 'k1') + C(x + 48, y, 4, P.gold, 'k1')
    + Pt(`M${x - 38} ${y}L${x + 38} ${y}L${x + 38} ${y + len}L${x} ${y + len - 26}L${x - 38} ${y + len}Z`, col)
    + Pt(`M${x - 31} ${y + 6}L${x + 31} ${y + 6}L${x + 31} ${y + len - 14}L${x} ${y + len - 36}L${x - 31} ${y + len - 14}Z`, 'none', 'k1').replace('k1', 'k1 goldline')
    + emblem + SH(`M${x + 14} ${y}L${x + 38} ${y}L${x + 38} ${y + len}L${x + 14} ${y + len - 18}Z`, .18), [x, y]);
}
function emblemKey(x, y) {
  return Pt(`M${x - 14} ${y - 10}L${x - 12} ${y - 24}L${x - 5} ${y - 16}L${x} ${y - 28}L${x + 5} ${y - 16}L${x + 12} ${y - 24}L${x + 14} ${y - 10}Z`, P.goldL, 'k1')
    + C(x, y + 6, 11, 'none', 'k').replace('class="k"', 'class="k goldstroke"') + Pt(`M${x - 2.5} ${y + 16}h5v28h-5Z`, P.goldL, 'k1') + Pt(`M${x + 2} ${y + 34}h8v4h-4v4h4v3h-8Z`, P.goldL, 'k1');
}
function sconce(x, y, id) {
  return `<g class="sconce">${`<circle cx="${x}" cy="${y - 34}" r="70" fill="url(#${id})" class="glowlight"/>`}${Pt(`M${x - 18} ${y + 18}Q${x} ${y + 30} ${x + 18} ${y + 18}L${x + 12} ${y + 8}L${x - 12} ${y + 8}Z`, P.iron)}${L(`M${x} ${y + 24}v22l-14 10`, 'k')}${Pt(`M${x - 6} ${y - 20}h12v28h-12Z`, P.cream)}${G('flame', Pt(`M${x} ${y - 46}C${x - 8} ${y - 36} ${x - 6} ${y - 26} ${x} ${y - 22}C${x + 6} ${y - 26} ${x + 8} ${y - 36} ${x} ${y - 46}Z`, P.goldL, 'k1') + Pt(`M${x} ${y - 38}C${x - 3} ${y - 32} ${x - 2} ${y - 27} ${x} ${y - 25}C${x + 2} ${y - 27} ${x + 3} ${y - 32} ${x} ${y - 38}Z`, '#fff3c4', ''), [x, y - 22])}</g>`;
}
const glowDef = (id, col = '#ffd98a') => `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
function motes(n, x0, y0, w, h, seed) {
  const r = rng(seed); let s = '';
  for (let i = 0; i < n; i++) s += `<circle class="mote" cx="${(x0 + r() * w).toFixed(0)}" cy="${(y0 + r() * h).toFixed(0)}" r="${(1 + r() * 1.6).toFixed(1)}" fill="#fff2c8" style="animation-delay:${(-r() * 9).toFixed(1)}s"/>`;
  return `<g class="motes">${s}</g>`;
}
function sack(x, y, s = 1, label = '', col = '#b08a55') {
  return `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-26 0C-32-24-22-46 0-50C22-46 32-24 26 0Z', col)}${Pt('M-10-48Q0-56 10-48L8-58Q0-62-8-58Z', col, 'k1')}${L('M-12-46q12 5 24 0', 'k')}${label ? `<text x="0" y="-18" text-anchor="middle" font-size="11" font-weight="700" fill="${P.brownD}" font-family="Lora, serif">${label}</text>` : ''}${SH('M10-44C22-36 28-18 26 0H12C16-16 16-32 10-44Z', .18)}</g>`;
}
function barrel(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-30 0C-38-26-38-58-30-84L30-84C38-58 38-26 30 0Z', P.woodL)}${L('M-34-18h68M-35-66h70', 'k')}${Pt('M-36-22h72v6h-72ZM-36-70h72v6h-72Z', P.iron, 'k1')}${L('M-14-84v84M10-84v84', 'k1')}${E(0, -84, 30, 7, P.wood)}${SH('M14-84C24-60 24-24 14 0H30C38-26 38-58 30-84Z', .2)}</g>`;
}
function jar(x, y, h, col, lid = P.wood) {
  return Pt(`M${x - 10} ${y}C${x - 14} ${y - h * .4} ${x - 12} ${y - h * .8} ${x - 7} ${y - h}L${x + 7} ${y - h}C${x + 12} ${y - h * .8} ${x + 14} ${y - h * .4} ${x + 10} ${y}Z`, col)
    + Pt(`M${x - 8} ${y - h - 6}h16v6h-16Z`, lid, 'k1') + HL(`M${x - 6} ${y - h * .7}v${h * .4}`);
}

// ============ СОКРОВИЩНИЦА (главная). viewBox 0 0 1000 560 ============
export function mainChest() {
  const pile = (lvl, d, extra) => `<g class="pile pile${lvl}">${Pt(d, P.gold)}${extra}</g>`;
  const coinsRow = (pts) => pts.map(([x, y, r]) => coin(x, y, r || 9)).join('');
  return `<g class="main-chest">
    ${op(E(150, 234, 160, 13, P.ink, ''), .3)}
    <g class="mlid"${' style="transform-origin:150px 100px"'}>${Pt('M24 100C24 44 64 14 150 14C236 14 276 44 276 100Z', P.woodD)}${Pt('M40 98C40 54 74 30 150 30C226 30 260 54 260 98Z', '#2c1a10', 'k1')}
      ${Pt('M60 22l10 76M240 22l-10 76', 'none').replace('fill="none"', 'fill="none" class="k1"')}${Pt('M140 14h20v12h-20Z', P.gold, 'k1')}${HL('M44 70q10-34 60-46')}</g>
    ${Pt('M26 98L274 98L270 116L30 116Z', '#22150d')}
    <g class="piles">
      <g class="pile pile0">${L('M36 104l40 10M36 104l18 12M264 104l-38 10M264 104l-16 12M44 108q10 4 18 0M248 108q-10 4-18 0', 'k1').replace('k1 nf', 'k1 nf web')}<g class="moth">${Pt('M150 70c-8-8-18-6-16 2c2 6 10 6 16-2Zm0 0c8-8 18-6 16 2c-2 6-10 6-16-2Z', '#c9bfa8', 'k1')}</g></g>
      ${pile(1, 'M40 116C80 102 120 100 150 102C180 100 220 102 260 116Z', coinsRow([[96, 108, 8], [150, 103, 8], [200, 108, 8]]))}
      ${pile(2, 'M36 116C64 92 104 78 150 76C196 78 236 92 264 116Z', coinsRow([[84, 100], [120, 86], [158, 80], [196, 88], [228, 102], [140, 98]]) + C(176, 98, 6, P.red, 'k1'))}
      ${pile(3, 'M32 116C52 76 96 52 150 48C204 52 248 76 268 116Z', coinsRow([[76, 96], [104, 74], [138, 58], [170, 56], [204, 70], [232, 94], [120, 94], [186, 92], [154, 80]]) + C(128, 76, 6, P.greenL, 'k1') + C(196, 82, 6, P.red, 'k1')
        + `<g transform="translate(206 34)">${Pt('M0 0h22l-4 16q-7 6-14 0Z', P.goldL)}${L('M11 16v12M4 30h14', 'k')}${C(11, 6, 3, P.red, 'k1')}</g>` + L('M60 104q30 14 60 6q30-8 52 4', 'k1').replace('k1 nf', 'k1 nf pearls'))}
      ${pile(4, 'M24 118C40 64 90 28 150 22C210 28 260 64 276 118Z', coinsRow([[60, 104], [86, 78], [112, 56], [142, 36], [172, 34], [200, 50], [228, 72], [252, 100], [100, 98], [130, 80], [160, 64], [190, 82], [220, 100], [150, 104]]) + C(118, 70, 6, P.greenL, 'k1') + C(206, 70, 6, P.red, 'k1') + C(160, 92, 6, P.blueL, 'k1')
        + `<g transform="translate(128 0)">${Pt('M0 22L2 6L10 14L22 0L34 14L42 6L44 22Z', P.goldL)}${Pt('M0 22h44v6H0Z', P.gold, 'k1')}${C(22, 12, 2.6, P.red, 'k1')}</g>` + coinsRow([[40, 140, 8], [262, 150, 8], [232, 172, 7]]))}
    </g>
    <g class="chest-mouth"><rect x="40" y="70" width="220" height="40" fill="none"/></g>
    ${Pt('M22 106L278 106L270 234L30 234Z', P.wood)}
    ${L('M26 140H274M28 172H272M29 204H271', 'k1')}${SH('M214 106L278 106L270 234L222 234Z', .2)}
    ${Pt('M70 106h22v128H70ZM208 106h22v128h-22Z', P.iron, 'k1')}${[120, 150, 180, 210].map(y => C(81, y, 2.6, P.greyL, 'k1') + C(219, y, 2.6, P.greyL, 'k1')).join('')}
    ${Pt('M22 106h40v14l-26 10l-14-6ZM278 106h-40v14l26 10l14-6ZM30 234h34v-14l-24-8l-10 6ZM270 234h-34v-14l24-8l10 6Z', P.gold, 'k1')}
    ${Pt('M20 102h260v10H20Z', P.goldD, 'k1')}
    ${Pt('M126 124h48v52l-24 12l-24-12Z', P.gold)}${C(150, 146, 6, P.ink, '')}${Pt('M147 148h6l2 16h-10Z', P.ink, '')}${star4(150, 132, 5, P.goldL)}
    ${HL('M34 124q2 50 6 96')}
  </g>`;
}
export function treasuryScene() {
  const floorLines = Array.from({ length: 11 }, (_, i) => { const k = i - 5; return `M${500 + k * 110} 440L${500 + k * 250} 560`; }).join('') + 'M0 474H1000M0 512H1000';
  return `<defs>${glowDef('sg1')}${glowDef('chestglow', '#ffd36b')}<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeec4" stop-opacity=".34"/><stop offset="1" stop-color="#ffeec4" stop-opacity="0"/></linearGradient></defs>
  <rect width="1000" height="560" fill="#46362c"/>
  ${stoneWall(0, 0, 1000, 440, 44, 7, '#55443a', '#2c211b')}
  ${Pt('M330 440L330 220C330 128 402 74 500 74C598 74 670 128 670 220L670 440Z', '#2b2019')}
  <path d="M318 440L318 218C318 118 396 60 500 60C604 60 682 118 682 218L682 440" fill="none" stroke="#5e4c40" stroke-width="22"/>
  <path d="M318 440L318 218C318 118 396 60 500 60C604 60 682 118 682 218L682 440" fill="none" class="k" stroke-dasharray="2 26" stroke-width="24" opacity=".35"/>
  ${Pt('M60 440V250C60 196 104 160 160 160C216 160 260 196 260 250V440Z', '#2b2019')}${Pt('M740 440V250C740 196 784 160 840 160C896 160 940 196 940 250V440Z', '#2b2019')}
  ${Pt('M76 330h168v10H76ZM756 330h168v10H756Z', P.woodD)}
  ${sack(110, 330, .9, '₽')}${sack(170, 330, .75)}${`<g transform="translate(216 296)">${Pt('M-22 34L22 34L20 6L-20 6Z', P.burgD)}${Pt('M-22 6C-22-8 22-8 22 6Z', P.burg)}${Pt('M-3 10h6v10h-6Z', P.gold, 'k1')}</g>`}
  ${sack(120, 440, 1.05)}${`<g transform="translate(200 440)">${Pt('M-34 0L34 0L32-46L-32-46Z', P.wood)}${Pt('M-34-46C-34-66 34-66 34-46Z', P.woodD)}${Pt('M-36-30h72v6h-72Z', P.gold, 'k1')}${Pt('M-5-40h10v12h-10Z', P.gold, 'k1')}</g>`}
  ${barrel(790, 440, .95)}${barrel(870, 440, .8)}
  ${jar(800, 330, 46, P.burgD, P.goldD)}${jar(840, 330, 34, P.greenD)}${`<g transform="translate(890 318)">${Pt('M-22 12h44v-24h-44Z', P.parch)}${E(-22, 0, 4, 12, P.cream)}${E(22, 0, 4, 12, P.cream)}</g>`}${`<g transform="translate(886 300)">${Pt('M-18 0h36v-10h-36Z', P.parch, 'k1')}${E(-18, -5, 3, 5, P.cream, 'k1')}</g>`}
  <g class="window">${Pt('M436 120C436 96 464 84 500 84C536 84 564 96 564 120V176H436Z', '#f4dfae')}${L('M436 140H564M436 158H564M468 90V176M500 84V176M532 90V176', 'k1')}${Pt('M430 176h140v10H430Z', P.woodD)}</g>
  <path class="ray" d="M440 180L560 180L700 440L300 440Z" fill="url(#ray)"/>
  ${motes(16, 360, 190, 280, 240, 3)}
  ${banner(300, 40, 190, P.burg, emblemKey(300, 108))}${banner(700, 40, 190, P.burg, emblemKey(700, 108))}
  ${sconce(250, 270, 'sg1')}${sconce(750, 270, 'sg1')}
  ${Pt('M0 440H1000V560H0Z', '#5c493b')}<path d="${floorLines}" stroke="#3a2c23" stroke-width="2" fill="none" opacity=".6"/>
  ${Pt('M370 440L630 440L720 560L280 560Z', P.burg)}${L('M384 448L616 448L700 556M384 448L300 556', 'k1').replace('k1 nf', 'k1 nf goldline')}
  ${coin(300, 520, 8)}${coin(318, 534, 7)}${coin(690, 528, 8)}
  <circle class="chestglow" cx="500" cy="380" r="210" fill="url(#chestglow)"/>
  <g class="chest-pos" transform="translate(350 230)">${mainChest()}</g>
  <g class="servant-pos" transform="translate(640 226) scale(.98)">${servant()}</g>`;
}

// ============ ПАЛАТА КАЗНАЧЕЯ. viewBox 0 0 1000 300 ============
export function deskRoomScene() {
  const books = [[778, 22, P.burg], [798, 18, P.greenD], [814, 24, P.blueD], [836, 20, P.goldD], [854, 16, P.burgD], [868, 22, P.green]]
    .map(([x, w, c], i) => Pt(`M${x} 96h${w * .8}v-${44 + (i % 3) * 6}h-${w * .8}Z`, c, 'k1') + L(`M${x + 3} ${80 - (i % 3) * 6}h${w * .8 - 6}`, 'k1')).join('');
  return `<defs>${glowDef('lampglow')}</defs>
  <rect width="1000" height="300" fill="#5a3a24"/>
  ${Pt('M0 0H1000V132H0Z', '#a88a62', '')}${strokes(0, 0, 1000, 130, 60, 6, 41, 20, 'k1 nf faint')}
  ${Pt('M0 120H1000V136H0Z', P.woodD)}${Array.from({ length: 20 }, (_, i) => L(`M${i * 50 + 25} 136V300`, 'k1')).join('')}
  ${Array.from({ length: 25 }, (_, i) => Pt(`M${i * 40 + 8} 18l12 -10l12 10l-12 10Z`, P.burg, 'k1')).join('')}${L('M0 32H1000M0 4H1000', 'k1')}
  <g class="window">${Pt('M80 200V70C80 40 108 26 140 26C172 26 200 40 200 70V200Z', '#f2ddb0')}${Array.from({ length: 7 }, (_, i) => L(`M${80 + i * 20} 26L${200} ${146 - i * 20}M${80 + i * 20} 200L200 ${80 + i * 20}`, 'k1')).join('')}${Pt('M70 200h140v12H70Z', P.woodD)}</g>
  <path class="ray" d="M90 200L200 200L330 300L150 300Z" fill="#ffeec4" opacity=".14"/>
  ${Pt('M760 96h200v8H760ZM760 170h200v8H760Z', P.woodD)}${books}
  <g transform="translate(900 96)">${Pt('M-14-40h28l-12 18l12 18h-28l12-18Z', '#f4dfae')}${Pt('M-16-44h32v4h-32ZM-16-4h32v4h-32Z', P.wood, 'k1')}<path class="sand" d="M-8-36h16l-8 12Z" fill="#c9a043"/></g>
  <g transform="translate(790 170)">${Pt('M0 0h50v-14H0Z', P.parch, 'k1')}${E(0, -7, 4, 7, P.cream)}${E(50, -7, 4, 7, P.cream)}</g>${`<g transform="translate(870 170)">${sack(10, 0, .5, '')}</g>`}
  <g class="lantern" style="transform-origin:620px 0px">${L('M620 0v60', 'k')}<circle cx="620" cy="84" r="60" fill="url(#lampglow)" class="glowlight"/>${Pt('M606 60h28l-4 40h-20Z', P.goldD)}${Pt('M610 66h20l-3 28h-14Z', '#ffe9a6', 'k1')}${Pt('M602 58h36l-6-8h-24Z', P.iron, 'k1')}</g>
  <g class="treasurer-pos" transform="translate(340 52)">${treasurer()}${treasurerDesk()}</g>
  ${Pt('M0 274H1000V300H0Z', P.woodD)}${Pt('M0 268H1000V276H0Z', P.woodL)}`;
}

// ============ БАЛАГАН ШУТА. viewBox 0 0 1000 640 ============
export function stageScene() {
  const flags = Array.from({ length: 13 }, (_, i) => { const x = 40 + i * 72, y = 30 + Math.sin(i / 12 * Math.PI) * 30; return Pt(`M${x} ${y}L${x + 52} ${y + 2}L${x + 26} ${y + 42}Z`, [P.burg, P.gold, P.greenD][i % 3]); }).join('');
  const drape = (x, flip) => { const d = `M0 0H150C140 120 150 260 130 420C120 500 140 560 150 640H0Z`; const folds = L('M30 0C40 200 30 400 40 640M70 0C80 200 70 420 84 640M110 0C116 160 108 330 112 640', 'k1'); return `<g transform="translate(${x} 0) scale(${flip} 1)">${Pt(d, P.burg)}${folds}${SH('M110 0H150C140 120 150 260 130 420C120 500 140 560 150 640H110Z', .2)}${Pt('M126 360q20-10 30 4q-14 14-30 6Z', P.gold, 'k1')}${Pt('M150 368l6 40l-10 0Z', P.gold, 'k1')}</g>`; };
  return `<rect width="1000" height="640" fill="#3a2420"/>
  ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 100}" y="0" width="50" height="560" fill="${i % 2 ? '#4a2c26' : '#432823'}"/>`).join('')}
  ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 100 + 50}" y="0" width="50" height="560" fill="#55302a" opacity=".6"/>`).join('')}
  <g class="bunting">${L('M30 28Q500 90 970 28', 'k')}${flags}</g>
  ${Pt('M0 560H1000V640H0Z', P.woodL)}${L('M0 580H1000M0 604H1000M0 626H1000', 'k1')}${Array.from({ length: 12 }, (_, i) => L(`M${i * 90 + (i % 2) * 40} 560v20M${i * 90 + 30} 580v24M${i * 90 + 60} 604v22`, 'k1')).join('')}
  ${Pt('M320 560L388 300L412 300L340 560ZM480 560L412 300L388 300L460 560Z', P.wood)}${Pt('M340 470h120v10H340Z', P.woodD)}
  <g transform="translate(860 560)">${Pt('M-40 0C-44-30-36-52 0-54C36-52 44-30 40 0Z', P.burg)}${E(0, -50, 38, 8, P.cream)}${L('M-36-30l72 18M-36-12l72-18', 'k1').replace('k1 nf', 'k1 nf goldline')}</g>
  ${C(120, 548, 12, P.red)}${C(150, 552, 9, P.gold)}${C(176, 550, 10, P.greenL)}
  ${drape(0, 1)}${drape(1000, -1)}
  <g class="wheel-holder" transform="translate(400 300)"></g>
  <g class="wheel-pointer" transform="translate(400 46)">${Pt('M-16 0h32l-16 30Z', P.goldL)}${C(0, -2, 8, P.gold)}</g>
  <g class="jester-pos" transform="translate(660 258) scale(1.06)">${jester()}</g>
  <g class="dagger-layer"></g>`;
}

// ============ БОЯРСКАЯ ДУМА. viewBox 0 0 1200 520 ============
export function dumaScene() {
  const frieze = Array.from({ length: 30 }, (_, i) => { const x = i * 40 + 20; return `M${x - 14} 120q14-22 28 0M${x} 120v-16M${x - 8} 108q8-10 16 0`; }).join('');
  const column = (x) => Pt(`M${x - 26} 470V170Q${x} 150 ${x + 26} 170V470Z`, '#b9833d') + Pt(`M${x - 34} 170h68v-16h-68Z`, P.burg, 'k1') + Pt(`M${x - 34} 470h68v-14h-68Z`, P.burg, 'k1')
    + L(`M${x - 26} 230h52M${x - 26} 300h52M${x - 26} 370h52`, 'k1') + Array.from({ length: 4 }, (_, i) => Pt(`M${x} ${194 + i * 70}l10 14l-10 14l-10-14Z`, P.burg, 'k1')).join('') + SH(`M${x + 8} 168Q${x + 18} 160 ${x + 26} 170V470H${x + 8}Z`, .22);
  const win = (x) => `<g>${Pt(`M${x - 50} 330V220C${x - 50} 196 ${x - 26} 180 ${x} 180C${x + 26} 180 ${x + 50} 196 ${x + 50} 220V330Z`, '#f3e0b2')}${Array.from({ length: 6 }, (_, i) => L(`M${x - 50 + i * 20} 180L${x + 50} ${280 - i * 20}M${x - 50} ${230 + i * 20}L${x - 50 + (100 - i * 20)} 330`, 'k1')).join('')}${Pt(`M${x - 58} 330h116v10h-116Z`, P.woodD)}</g>`;
  const tiles = Array.from({ length: 6 }, (_, r) => Array.from({ length: 4 }, (_, c) => `<rect x="${1086 + c * 22}" y="${220 + r * 40}" width="22" height="40" fill="#efe7d6" stroke="#2a1b12" stroke-width="1"/><path d="M${1097 + c * 22} ${228 + r * 40}l6 12l-6 12l-6-12Z" fill="${(r + c) % 2 ? '#3c6a7a' : '#7a3a2a'}"/>`).join('')).join('');
  return `<rect width="1200" height="520" fill="#9c6a3a"/>
  ${Pt('M0 0H1200V130H0Z', P.burgD)}<path d="${frieze}" fill="none" stroke="#e8c86e" stroke-width="2"/>
  ${Array.from({ length: 12 }, (_, i) => Pt(`M${i * 100 + 50} 0C${i * 100 + 50} 50 ${i * 100 + 10} 70 ${i * 100 - 10} 90`, 'none').replace('fill="none"', 'fill="none" class="k1 goldline"')).join('')}
  ${Pt('M0 130H1200V146H0Z', P.gold)}
  ${strokes(0, 150, 1200, 300, 90, 8, 77, 60, 'k1 nf faint')}
  ${win(280)}${win(920)}
  <path class="ray" d="M240 330L330 330L470 470L300 470Z" fill="#ffeec4" opacity=".12"/><path class="ray" d="M880 330L970 330L1000 470L870 470Z" fill="#ffeec4" opacity=".1"/>
  ${Pt('M40 400h1120v22H40Z', P.wood)}${Pt('M40 386h1120v16H40Z', P.burg)}${L('M60 422v48M400 422v48M800 422v48M1140 422v48', 'k')}
  ${column(110)}${column(450)}${column(750)}${column(1050)}
  <g>${Pt('M1076 470V214l10-24h88l10 24V470Z', '#e4d8c2')}${tiles}${Pt('M1070 190h120v-24h-120Z', P.burgD)}${Pt('M1086 166h88v-30h-88Z', '#e4d8c2')}</g>
  ${Pt('M0 470H1200V520H0Z', '#6b4528')}${L('M0 486H1200M0 504H1200', 'k1')}
  ${Pt('M520 470L680 470L760 520L440 520Z', P.burg)}${L('M532 476L668 476L740 518M532 476L460 518', 'k1').replace('k1 nf', 'k1 nf goldline')}
  <g class="boyars-holder"></g>`;
}

// ============ ЦАРСКАЯ КУХНЯ. viewBox 0 0 1200 460 ============
export function kitchenScene() {
  const hang = (x, kind) => {
    let g = '';
    if (kind === 'garlic') g = L(`M${x} 30v40`, 'k1') + [0, 1, 2, 3].map(i => C(x + (i % 2 ? 6 : -6), 76 + i * 16, 9, '#efe6d2')).join('');
    if (kind === 'onion') g = L(`M${x} 30v36`, 'k1') + [0, 1, 2].map(i => Pt(`M${x - 9 + (i % 2) * 6} ${86 + i * 18}c-12 0-12-16 0-20c2-4 2-6 2-8c0 2 0 4 2 8c12 4 12 20-4 20Z`, '#c98a3a')).join('');
    if (kind === 'sausage') g = L(`M${x - 20} 34h40`, 'k1') + [-14, 0, 14].map((dx, i) => Pt(`M${x + dx - 5} 34c-4 16-4 36 2 ${44 + i * 6}c6 2 8-2 8-8c-2-12-2-24 0-36Z`, '#9a3a2a')).join('');
    if (kind === 'herbs') g = L(`M${x} 30v30`, 'k1') + Pt(`M${x - 4} 60L${x + 4} 60L${x + 16} 120L${x - 16} 120Z`, P.greenL) + L(`M${x} 64v52M${x - 6} 80l-8 30M${x + 6} 80l8 30`, 'k1');
    if (kind === 'pan') g = L(`M${x} 30v20`, 'k1') + C(x, 72, 22, '#b86a3a') + C(x, 72, 15, 'none', 'k1') + Pt(`M${x - 3} 92h6v34h-6Z`, P.woodD);
    return `<g class="hang" style="transform-origin:${x}px 30px;animation-delay:${(x % 7) * -.4}s">${g}</g>`;
  };
  const fire = `<g class="fire">${Pt('M960 400C944 372 960 344 972 330C970 352 986 360 990 344C1004 362 1010 380 1000 400Z', '#e8873a', 'k1')}${Pt('M1000 400C992 380 1004 362 1014 352C1014 372 1030 376 1032 360C1044 378 1046 392 1038 400Z', '#e8873a', 'k1')}${Pt('M972 400C966 384 976 370 984 362C986 378 996 380 998 370C1006 384 1006 394 1002 400Z', '#f6c35a', '')}${Pt('M1008 400C1004 388 1012 378 1018 372C1020 384 1028 384 1028 378C1034 388 1034 396 1030 400Z', '#f6c35a', '')}</g>`;
  return `<defs>${glowDef('fireglow', '#ffb35a')}${glowDef('winglow', '#fff0c8')}</defs>
  <rect width="1200" height="460" fill="#5f4b3d"/>
  ${stoneWall(0, 40, 1200, 380, 40, 19, '#6e5949', '#3a2c23')}
  ${Pt('M0 0H1200V40H0Z', P.woodD)}${Pt('M0 36H1200V48H0Z', P.wood)}
  ${[60, 320, 600, 880, 1140].map(x => Pt(`M${x - 14} 0h28v48h-28Z`, P.woodD)).join('')}
  <g class="window">${Pt('M392 200V110C392 82 414 66 440 66C466 66 488 82 488 110V200Z', '#f4e2b4')}${L('M392 134H488M392 168H488M424 70V200M456 70V200', 'k1')}${Pt('M384 200h112v10H384Z', P.woodD)}<circle cx="440" cy="140" r="110" fill="url(#winglow)" opacity=".6"/></g>
  ${Pt('M30 170h300v10H30ZM30 270h300v10H30Z', P.woodD)}
  ${jar(60, 170, 40, '#8a6a4a')}${jar(96, 170, 54, P.greenD)}${jar(134, 170, 34, P.burgD)}${C(184, 154, 16, '#e0c36a')}${L('M170 150h28', 'k1')}${jar(226, 170, 46, '#6a7f8f')}${jar(266, 170, 30, '#b8894e')}${Pt('M290 170c0-20 30-20 30 0Z', '#d9a35b')}
  ${Pt('M50 270c0-26 50-26 50 0Z', '#d9a35b')}${L('M58 258l10-6M70 262l12-8', 'k1')}${jar(130, 270, 44, P.burg)}${Pt('M170 270h50v-26h-50Z', '#c9a36b')}${L('M170 256h50', 'k1')}${jar(254, 270, 36, '#8a6a4a')}${jar(296, 270, 50, P.greenD)}
  ${hang(560, 'garlic')}${hang(620, 'sausage')}${hang(700, 'onion')}${hang(760, 'herbs')}${hang(830, 'pan')}${hang(180, 'herbs')}${hang(250, 'onion')}
  ${barrel(70, 420, 1)}${barrel(150, 420, .82)}${sack(230, 420, 1.1, 'МУКА', '#d8c39a')}${sack(300, 420, .95, 'КРУПА')}
  <g>${Pt('M880 420V200C880 160 930 130 1000 130C1070 130 1120 160 1120 200V420Z', '#4a3a30')}${Pt('M910 420V230C910 200 950 180 1000 180C1050 180 1090 200 1090 230V420Z', '#1e1511')}
    <circle cx="1000" cy="380" r="120" fill="url(#fireglow)" class="fireglow"/>${L('M1000 180v80', 'k')}
    ${fire}${Pt('M940 404h120v16H940Z', '#3a2c23')}${L('M950 404l20-18M990 404l-14-18M1030 404l20-16', 'k')}
    <g transform="translate(970 262)">${cookPot()}</g>
    ${Pt('M866 130h268v24H866Z', P.woodD)}${jar(900, 130, 26, '#b86a3a')}${jar(1100, 130, 30, P.iron)}</g>
  ${Pt('M0 420H1200V460H0Z', '#4a3a30')}
  <g class="cook-pos" transform="translate(470 160)">${cook()}<g class="cook-table">${cookTable()}</g><g transform="translate(206 192)">${cookPot()}</g></g>`;
}

// ============ ЗЕМЛИ НА КАРТЕ ============
export const MAP = {
  fir: (x, y, s = 1, c = P.greenD) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M0-64L-18-28H-8L-24 0H24L8-28H18Z', c)}${Pt('M-3 0h6v8h-6Z', P.woodD, 'k1')}</g>`,
  tree: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-4 0L-3-22H3L4 0Z', P.wood, 'k1')}${C(0, -34, 18, P.greenL)}${C(-12, -26, 10, P.greenL)}${C(12, -28, 11, P.greenL)}${op(C(6, -38, 8, '#fff', ''), .15)}</g>`,
  hill: (x, y, w, h, c) => Pt(`M${x - w / 2} ${y}C${x - w / 4} ${y - h} ${x + w / 4} ${y - h} ${x + w / 2} ${y}Z`, c, 'k1'),
  house: (x, y, s = 1, roof = P.burg) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-16 0V-22H16V0Z', P.parch)}${Pt('M-20-22L0-40L20-22Z', roof)}${Pt('M-5 0v-10h10V0Z', P.woodD, 'k1')}${Pt('M6-17h6v6h-6Z', '#f2d58a', 'k1')}</g>`,
  church: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-14 0V-34H14V0Z', P.cream)}${Pt('M-10-34C-14-46-6-52 0-60C6-52 14-46 10-34Z', P.gold)}${L('M0-60v-10M-4-66h8', 'k1')}${Pt('M-4 0v-12h8V0Z', P.woodD, 'k1')}</g>`,
  tent: (x, y, s = 1, c = P.burg) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-24 0L0-40L24 0Z', c)}${Pt('M0-40L-8 0H8Z', P.cream, 'k1')}${L('M0-40v-12', 'k1')}${Pt('M0-52l12 4l-12 4Z', P.gold, 'k1')}</g>`,
  stall: (x, y, s = 1, c = P.red) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-22 0v-26h44V0Z', P.woodL)}${Pt('M-26-26L-20-38H20L26-26Z', c)}${L('M-14-38l-4 12M-4-38v12M6-38l2 12M16-38l4 12', 'k1')}${coin(-8, -6, 4)}${coin(6, -8, 4)}</g>`,
  mountain: (x, y, w, h, snow = true) => Pt(`M${x - w / 2} ${y}L${x - w * .08} ${y - h}L${x + w * .06} ${y - h * .9}L${x + w / 2} ${y}Z`, '#7d8a86') + (snow ? Pt(`M${x - w * .17} ${y - h * .7}L${x - w * .08} ${y - h}L${x + w * .06} ${y - h * .9}L${x + w * .14} ${y - h * .62}L${x + w * .02} ${y - h * .7}L${x - w * .06} ${y - h * .6}Z`, P.snow, 'k1') : '') + SH(`M${x + w * .06} ${y - h * .9}L${x + w / 2} ${y}L${x + w * .12} ${y}Z`, .2),
  reeds: (x, y) => L(`M${x} ${y}q-2-20 2-34M${x + 6} ${y}q2-16 0-28M${x - 6} ${y}q-4-14-8-22`, 'k1') + E(x + 2, y - 36, 2.5, 7, P.brown, 'k1'),
  rock: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-16 0C-18-10-10-18 0-18C12-18 18-8 16 0Z', '#8b8478')}${HL('M-8-12q6-4 12-2')}</g>`,
  castle: (x, y, s = 1, c = '#3a3540') => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-40 0V-50H-28V-58H-20V-50H20V-58H28V-50H40V0Z', c)}${Pt('M-46-50V-86H-26V-50Z', c)}${Pt('M26-50V-96H46V-50Z', c)}${Pt('M-50-86L-36-104L-22-86Z', P.burgD)}${Pt('M22-96L36-116L50-96Z', P.burgD)}${Pt('M-8 0v-20q8-10 16 0V0Z', '#120e10', 'k1')}${C(-36, -66, 3, '#9cf07a', 'k1')}${C(36, -74, 3, '#9cf07a', 'k1')}</g>`,
  hut: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${L('M-10-26l-6 26M10-26l6 26M-16 0l-6 4M-16 0l4 4M16 0l6 4M16 0l-4 4', 'k')}${Pt('M-22-26V-52H22V-26Z', P.woodL)}${L('M-22-34h44M-22-42h44', 'k1')}${Pt('M-28-50L0-72L28-50Z', P.brown)}${Pt('M-6-36h12v-10h-12Z', '#f2d58a', 'k1')}</g>`,
  ship: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-30 0L30 0L22 12H-22Z', P.wood)}${L('M0 0v-40', 'k')}${Pt('M2-38L24-8H2Z', P.cream)}${Pt('M-2-34L-20-8H-2Z', P.cream)}</g>`,
  windmill: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${Pt('M-12 0L-8-40H8L12 0Z', P.parch)}${Pt('M-10-40L0-52L10-40Z', P.burg)}<g class="mill-blades" style="transform-origin:0px -40px">${L('M0-40l-22-22M0-40l22-22M0-40l22 22M0-40l-22 22', 'k')}</g>${C(0, -40, 3, P.woodD, 'k1')}</g>`,
  bridge: (x, y, w) => Pt(`M${x} ${y}Q${x + w / 2} ${y - 24} ${x + w} ${y}L${x + w} ${y + 8}Q${x + w / 2} ${y - 14} ${x} ${y + 8}Z`, P.woodL) + L(`M${x + 8} ${y - 4}v-14M${x + w / 2} ${y - 16}v-14M${x + w - 8} ${y - 4}v-14M${x + 8} ${y - 18}Q${x + w / 2} ${y - 40} ${x + w - 8} ${y - 18}`, 'k1'),
  waves: (x0, x1, y, c = '#5d8aa0') => { let d = `M${x0} ${y}`; for (let x = x0; x < x1; x += 30) d += `q7.5-7 15 0t15 0`; return `<path class="k1" d="${d}L${x1} ${y + 30}L${x0} ${y + 30}Z" fill="${c}"/>`; },
  crow: (x, y) => `<g class="crow" transform="translate(${x} ${y})">${Pt('M-8 0q8-8 8 0q0-8 8 0q-8-3-8 2q0-5-8-2Z', P.ink, '')}</g>`
};
