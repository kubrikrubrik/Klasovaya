// art.js — персонажи «Царской казны». Ручная векторная графика в духе средневековых
// маргиналий и лубка: чернильный контур, плоские цвета, печальные лица с косым взглядом.
// Каждый персонаж собран из подвижных частей (голова, руки, предплечья, мимика),
// которые анимируются через CSS (art.css) и Web Animations.

export const P = {
  ink: '#2a1b12', skin: '#f0d3b3', skinSh: '#d9aa86', cheek: '#d9705c',
  white: '#fbf3e2', parch: '#efe0bf', cream: '#f6ead0',
  burg: '#7a1f2b', burgD: '#561520', red: '#a63a2e', redL: '#c4553f',
  gold: '#c9a043', goldL: '#e8c86e', goldD: '#8e6a22',
  green: '#3d5a3a', greenD: '#2a4029', greenL: '#6a8455',
  blue: '#34506e', blueD: '#243a52', blueL: '#5d7c98',
  wood: '#6b4528', woodD: '#43291a', woodL: '#93633a',
  brown: '#6b4423', brownD: '#4a2e18', grey: '#8b8478', greyL: '#c4beb2', iron: '#55575c',
  furD: '#3a2a22', fur: '#6a4b35', furR: '#a5612f', snow: '#f4efe6', silver: '#cfd2d4'
};

// ---------- примитивы ----------
export const at = (o) => (o ? ` style="transform-origin:${o[0]}px ${o[1]}px"` : '');
export const G = (cls, inner, o, extra = '') => `<g class="${cls}"${at(o)}${extra}>${inner}</g>`;
export const Pt = (d, f, c = 'k') => `<path${c ? ` class="${c}"` : ''} d="${d}" fill="${f}"/>`;
export const L = (d, c = 'k') => `<path class="${c} nf" d="${d}"/>`;
export const E = (cx, cy, rx, ry, f, c = 'k') => `<ellipse${c ? ` class="${c}"` : ''} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"/>`;
export const C = (cx, cy, r, f, c = 'k') => `<circle${c ? ` class="${c}"` : ''} cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`;
export const SH = (d, o = 0.17) => `<path d="${d}" fill="${P.ink}" opacity="${o}"/>`;
export const HL = (d) => `<path class="hl" d="${d}"/>`;
export const MIR = (w, inner) => `<g transform="translate(${w} 0) scale(-1 1)">${inner}</g>`;
const f1 = (n) => Math.round(n * 10) / 10;

export function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function zigQ(x0, y0, cx, cy, x1, y1, n, amp) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n, m = 1 - t;
    const x = m * m * x0 + 2 * m * t * cx + t * t * x1, y = m * m * y0 + 2 * m * t * cy + t * t * y1 + (i % 2 ? amp : -amp);
    d += (i ? 'L' : 'M') + f1(x) + ' ' + f1(y);
  }
  return d;
}
// короткие штрихи меха / травы в прямоугольнике
export function strokes(x0, y0, w, h, n, len, seed, ang = 90, cls = 'k1 nf') {
  const r = rng(seed); let d = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w, y = y0 + r() * h, a = (ang + (r() - 0.5) * 30) * Math.PI / 180, l = len * (0.6 + r() * 0.6);
    d += `M${f1(x)} ${f1(y)}l${f1(Math.cos(a) * l)} ${f1(Math.sin(a) * l)}`;
  }
  return `<path class="${cls}" d="${d}"/>`;
}
export function star4(x, y, r, f = P.goldL) {
  return `<path class="k1" fill="${f}" d="M${x} ${y - r}Q${x + r * .18} ${y - r * .18} ${x + r} ${y}Q${x + r * .18} ${y + r * .18} ${x} ${y + r}Q${x - r * .18} ${y + r * .18} ${x - r} ${y}Q${x - r * .18} ${y - r * .18} ${x} ${y - r}Z"/>`;
}
export function coin(x, y, r = 6) {
  return `<g>${C(x, y, r, P.gold)}${C(x, y, r * .62, 'none', 'k1')}${HL(`M${x - r * .5} ${y - r * .35}q${r * .3} ${-r * .4} ${r * .7} ${-r * .45}`)}</g>`;
}

// ---------- мимика: глаза, брови, рты в нескольких вариантах ----------
function eye(cx, cy, s, look, lid, skin, side) {
  const w = 6.6 * s, h = 5 * s;
  const top = cy - h * 0.62, bot = cy + h * 0.5;
  const almond = `M${f1(cx - w)} ${cy}Q${cx} ${f1(cy - h * 1.25)} ${f1(cx + w)} ${cy}Q${cx} ${f1(cy + h)} ${f1(cx - w)} ${cy}Z`;
  const pup = (lx, ly, r) => `<circle class="pup" cx="${f1(cx + lx)}" cy="${f1(cy + ly)}" r="${f1(r)}" fill="${P.ink}"/>`;
  const lidded = (l, lx, ly) => {
    const ly2 = top + (bot - top) * l, cp = 2 * ly2 - cy;
    const cover = `M${f1(cx - w - 1)} ${cy}Q${cx} ${f1(cy - h * 1.9)} ${f1(cx + w + 1)} ${cy}Q${cx} ${f1(cp)} ${f1(cx - w - 1)} ${cy}Z`;
    return `<path d="${almond}" fill="${P.white}"/>${pup(lx, ly, 2.35 * s)}${l > 0 ? `<path d="${cover}" fill="${skin}"/>` : ''}<path class="k1 nf" d="${almond}"/><path class="k nf" d="M${f1(cx - w - .8)} ${f1(cy + .3)}Q${cx} ${f1(l > 0 ? cp : cy - h * 1.3)} ${f1(cx + w + .8)} ${f1(cy + .3)}"/>`;
  };
  return G('e e-open', lidded(lid, look * 2.6 * s, .5 * s), [cx, cy])
    + G('e e-sad', lidded(Math.max(lid, .55), look * 1.5 * s, 1.6 * s))
    + G('e e-sly', lidded(.6, look * 3.2 * s, .6 * s))
    + G('e e-closed', L(`M${f1(cx - w)} ${cy}Q${cx} ${f1(cy + 3.4 * s)} ${f1(cx + w)} ${cy}`))
    + G('e e-happy', L(`M${f1(cx - w)} ${f1(cy + 1.6 * s)}Q${cx} ${f1(cy - 5 * s)} ${f1(cx + w)} ${f1(cy + 1.6 * s)}`))
    + G('e e-wide', C(cx, cy, f1(5.6 * s), P.white, 'k1') + C(f1(cx + look * 1.2 * s), cy, f1(1.9 * s), P.ink, '') + C(f1(cx + look * 1.2 * s - .8), f1(cy - .8), .7, '#fff', ''))
    + G('e e-x', L(`M${f1(cx - 4 * s)} ${f1(cy - 4 * s)}l${f1(8 * s)} ${f1(8 * s)}M${f1(cx + 4 * s)} ${f1(cy - 4 * s)}l${f1(-8 * s)} ${f1(8 * s)}`));
}
function brows(cx, cy, s, side, thick = 1) {
  // side: -1 левый глаз, +1 правый; «внутренний» край бровей смотрит к носу
  const w = 7 * s, by = cy - 9.5 * s, inn = -side, cls = thick > 1.4 ? 'k kb' : 'k';
  const xi = cx + inn * w, xo = cx - inn * w;
  const seg = (yi, yo, arch) => `<path class="${cls} nf" d="M${f1(xo)} ${f1(yo)}Q${cx} ${f1(Math.min(yi, yo) - arch)} ${f1(xi)} ${f1(yi)}"/>`;
  return G('b b-n', seg(by, by + .5 * s, 2.2 * s)) + G('b b-s', seg(by - 3.4 * s, by + 1.6 * s, 1 * s))
    + G('b b-u', seg(by - 4.5 * s, by - 3 * s, 3.4 * s)) + G('b b-a', seg(by + 2.6 * s, by - 2.4 * s, .6 * s));
}
function mouths(x, y, s, lip = P.burgD) {
  const k = (n) => f1(n * s);
  return G('m m-n', L(`M${f1(x - k(5))} ${y}Q${x} ${f1(y + k(1.4))} ${f1(x + k(5))} ${y}`))
    + G('m m-s', L(`M${f1(x - k(7))} ${f1(y - k(1.5))}Q${x} ${f1(y + k(6))} ${f1(x + k(7))} ${f1(y - k(1.5))}`))
    + G('m m-g', Pt(`M${f1(x - k(8.5))} ${f1(y - k(2))}Q${x} ${f1(y + k(12))} ${f1(x + k(8.5))} ${f1(y - k(2))}Q${x} ${f1(y + k(1.5))} ${f1(x - k(8.5))} ${f1(y - k(2))}Z`, lip) + Pt(`M${f1(x - k(6.5))} ${f1(y - k(.6))}Q${x} ${f1(y + k(2.4))} ${f1(x + k(6.5))} ${f1(y - k(.6))}L${f1(x + k(5.5))} ${f1(y + k(1.8))}Q${x} ${f1(y + k(4))} ${f1(x - k(5.5))} ${f1(y + k(1.8))}Z`, '#fff8ea', 'k1'))
    + G('m m-sad', L(`M${f1(x - k(6))} ${f1(y + k(3))}Q${x} ${f1(y - k(3.5))} ${f1(x + k(6))} ${f1(y + k(3))}`))
    + G('m m-o', E(x, f1(y + k(1)), k(3.6), k(4.8), lip), [x, y])
    + G('m m-w', L(`M${f1(x - k(7))} ${y}q${k(1.75)} ${k(-2.4)} ${k(3.5)} 0t${k(3.5)} 0t${k(3.5)} 0t${k(3.5)} 0`))
    + G('m m-t', E(x, f1(y + k(.8)), k(4.2), k(2.8), lip), [x, y]);
}
/** Полный набор мимики. o: {x,y (линия глаз), dx, s, look, lid, skin, mx,my (рот), browThick, far} */
export function face(o) {
  const s = o.s || 1, sk = o.skin || P.skin, fs = o.far || 1;
  const lx = o.x - o.dx, rx = o.x + o.dx;
  return G('eyes', eye(lx, o.y, s * (o.look < 0 ? fs : 1), o.look, o.lid ?? .3, sk, -1) + eye(rx, o.y, s * (o.look > 0 ? fs : 1), o.look, o.lid ?? .3, sk, 1))
    + G('brows', brows(lx, o.y, s, -1, o.browThick) + brows(rx, o.y, s, 1, o.browThick))
    + mouths(o.mx, o.my, o.ms || s, o.lip);
}

// ---------- настроения персонажей ----------
const MOOD = {
  idle: ['open', 'n', 'n', 'rest'], joy: ['happy', 'u', 'g', 'up'], sad: ['sad', 's', 'sad', 'limp'],
  surprised: ['wide', 'u', 'o', 'fright'], count: ['sad', 'n', 't', 'count'], sigh: ['closed', 's', 'o', 'rest'],
  shrug: ['open', 'u', 'w', 'out'], rub: ['sly', 'a', 's', 'rub'], talk: ['open', 'n', 't', 'rest'],
  nervous: ['wide', 's', 'w', 'nervous'], laugh: ['happy', 'u', 'g', 'laugh'], spin: ['sly', 'a', 'g', 'spin'],
  windup: ['sly', 'a', 's', 'windup'], throw: ['wide', 'u', 'o', 'throw'], cut: ['sad', 'n', 'n', 'cut'],
  stir: ['open', 'n', 's', 'stir'], taste: ['closed', 'u', 'o', 'taste'], point: ['wide', 'u', 't', 'point'],
  upset: ['sad', 's', 'sad', 'cheeks'], write: ['sad', 'n', 'n', 'write'], dip: ['sad', 'n', 'n', 'dip'],
  look: ['open', 'u', 'n', 'rest'], bow: ['closed', 'n', 'n', 'rest'], speak: ['open', 'u', 't', 'gesture'],
  angry: ['open', 'a', 'sad', 'rest'], sleepy: ['closed', 'n', 'n', 'rest'], defeated: ['x', 's', 'o', 'limp']
};
export function setMood(el, mood) {
  if (!el) return;
  const m = MOOD[mood] || MOOD.idle;
  el.setAttribute('data-e', m[0]); el.setAttribute('data-b', m[1]); el.setAttribute('data-m', m[2]); el.setAttribute('data-pose', m[3]);
  el.setAttribute('data-mood', mood);
}
const root = (cls, inner, o, extra = '') => `<g class="ch ${cls}" data-e="open" data-b="n" data-m="n" data-pose="rest" data-mood="idle"${at(o)}${extra}>${inner}</g>`;

// ======================================================================
// СЛУГА-КЛЮЧНИК ПРОШКА — живёт у сундука. Холст 200×330, ноги на y=318.
// ======================================================================
function key(x, y, ang) {
  return `<g transform="rotate(${ang} ${x} ${y})">${C(x, y + 5, 3.6, 'none')}${Pt(`M${x - 1.6} ${y + 8.5}L${x - 1.4} ${y + 27}L${x + 1.6} ${y + 27}L${x + 1.6} ${y + 8.5}Z`, P.iron, 'k1')}${Pt(`M${x + 1.5} ${y + 21}h4.5v2.6h-2.2v2.4h2.2v1h-4.5Z`, P.iron, 'k1')}</g>`;
}
export function servant() {
  const s = P.skin;
  const arm = (cls, extra = '') => G(`arm ${cls}`,
    Pt('M60 125C55 140 54 158 56 177L73 178C73 161 76 143 78 129Z', P.green) + SH('M66 128C64 145 63 162 64 177L73 178C73 161 76 143 78 129Z', .12)
    + G(`fore`,
      Pt('M56 173C55 187 54 199 51 209L74 211C73 199 72 187 73 174Z', P.green)
      + Pt('M51 204.5L74 206.5L74 213L50 211Z', P.burg)
      + Pt('M53 211C51 220 53 228 60 230C67 231 71 226 71 218L71 212Z', s) + L('M69 214C74 215 75 221 71 224', 'k1')
      + extra, [64, 175]),
    [69, 129]);
  const hemZig = `<path class="zig" d="${zigQ(52, 232, 100, 244, 148, 232, 22, 2.4)}"/>`;
  const body =
    Pt('M87 232C86 255 85 280 86 304L98 304C98 280 99 255 99 232Z', '#5b4030') + Pt('M102 232C102 255 103 280 103 304L115 304C116 280 115 255 114 232Z', '#5b4030')
    + L('M87 252l11-4M87 266l11-4M86 280l12-4M86 294l12-4M103 252l12-4M103 266l12-4M103 280l12-4M104 294l11-4', 'k1')
    + Pt('M99 300C96 297 88 297 82 301C74 306 64 308 58 313C57 316 60 318 66 318L98 318C101 314 101 305 99 300Z', P.woodD)
    + Pt('M102 300C101 305 101 314 104 318L136 318C142 318 145 316 144 313C138 308 128 306 120 301C114 297 106 297 102 300Z', P.woodD)
    + Pt('M82 116C72 118 66 124 63 134C58 160 54 200 49 238Q100 250 151 238C146 200 142 160 137 134C134 124 128 118 118 116Q100 123 82 116Z', P.green)
    + SH('M118 118C128 122 136 128 138 140C142 175 146 205 151 238Q140 242 128 243C130 200 128 160 118 118Z')
    + L('M84 182C82 200 80 220 78 240M100 186L100 244M116 182C118 200 120 220 122 241', 'k1')
    + Pt('M50 226Q100 238 150 226L151 238Q100 250 49 238Z', P.burg) + hemZig
    + Pt('M83 113Q100 124 117 113L118 119Q100 131 82 119Z', P.burg) + `<path class="zig" d="${zigQ(85, 118, 100, 126, 115, 118, 8, 1.4)}"/>`
    + L('M92 125L89 158', 'k1') + C(91.6, 134, 1.6, P.gold, 'k1') + C(90.7, 143, 1.6, P.gold, 'k1') + C(89.8, 152, 1.6, P.gold, 'k1')
    + Pt('M57 165Q100 177 143 165L144 172Q100 185 56 172Z', P.red) + E(82, 174, 5, 4, P.redL)
    + L('M80 177C78 185 77 191 76 198M84 177C85 186 86 192 87 199', 'k1') + E(76, 200, 2.6, 3.6, P.red, 'k1') + E(87, 201, 2.6, 3.6, P.red, 'k1')
    + G('keys', `<circle class="k ring" cx="121" cy="187" r="8" fill="none"/>` + key(115, 193, 18) + key(121, 194, 0) + key(127, 193, -16), [121, 179]);
  const head = G('head',
    E(74.5, 85, 5, 8, s) + L('M74 81q-2 4 0 8', 'k1') + E(125.5, 85, 5, 8, s) + L('M126 81q2 4 0 8', 'k1')
    + Pt('M100 47C115 47 126 59 126 78C126 97 116 112 100 113C84 112 74 97 74 78C74 59 85 47 100 47Z', s)
    + SH('M112 52C122 58 126 68 126 78C126 96 117 110 104 112C114 100 118 80 112 52Z', .12)
    + Pt('M70 88C66 62 80 38 100 38C120 38 134 62 130 88C128 82 126 74 124 67L76 67C74 74 72 82 70 88Z', P.brown)
    + L('M82 67l1-7M88 67l0-8M94 67l1-8M100 67l0-9M106 67l-1-8M112 67l0-8M118 67l-1-7', 'k1') + HL('M86 46q10-5 22-2')
    + C(84, 95, 5.5, P.cheek, '').replace('/>', ' opacity=".42"/>') + C(116, 95, 5.5, P.cheek, '').replace('/>', ' opacity=".42"/>')
    + face({ x: 100, y: 81, dx: 11, look: -1, lid: .34, mx: 100, my: 104 })
    + L('M99 81C98 87 96 93 98 97C100 99 104 98 104 95', 'k1')
    + `<path class="prop tear k1" d="M86 89q-3.5 6 0 9.5q3.5-3.5 0-9.5Z" fill="#9cc3d8"/>`
    + `<path class="prop sweat k1" d="M128 62q-3.5 6 0 9.5q3.5-3.5 0-9.5Z" fill="#9cc3d8"/>`,
    [100, 113]);
  const props = G('prop puff', E(72, 108, 7, 5, '#fff', 'k1') + E(62, 104, 5.5, 4, '#fff', 'k1') + E(54, 98, 4, 3, '#fff', 'k1'))
    + G('prop spark', star4(60, 50, 7) + star4(144, 42, 6) + star4(150, 78, 4.5) + star4(52, 82, 4));
  return root('servant',
    E(100, 318, 54, 7, P.ink, '').replace('/>', ' opacity=".18"/>')
    + G('body', body + `<path d="M92 102L92 119Q100 123 108 119L108 102Z" fill="${s}" class="k"/>` + head
      + arm('arm-l', coin(64, 224, 6).replace('<g>', '<g class="prop held">'))
      + MIR(200, arm('arm-r')) + props, [100, 318]),
    [100, 318]);
}

// ======================================================================
// КАЗНАЧЕЙ ФОМА СЧЁТОВИЧ — за столом. Холст 320×250.
// ======================================================================
export function treasurer() {
  const s = P.skin;
  const quill = Pt('M0 0C-6-14-8-34-2-52C4-40 6-20 2-2Z', P.cream, 'k1') + L('M-1-4C-2-20-2-36-1-48', 'k1') + L('M0 2l-1.5 6', 'k');
  const armL = G('arm arm-l',
    Pt('M98 128C88 136 84 152 86 170L104 172C104 158 108 144 114 134Z', P.greenD)
    + G('fore',
      Pt('M86 166C86 178 88 188 92 196L110 192C108 184 106 176 105 168Z', P.greenD) + Pt('M90 190L110 186L112 193L92 198Z', P.gold)
      + Pt('M93 196C92 204 97 210 104 209C110 208 113 203 112 196Z', s) + L('M98 197l-5 7', 'k1')
      + G('quill', `<g transform="translate(101 204) rotate(-28)">${quill}</g>`, [101, 204]), [95, 170]),
    [106, 132]);
  const armR = G('arm arm-r',
    Pt('M222 128C232 136 236 152 234 168L216 170C216 156 212 144 206 134Z', P.greenD)
    + G('fore', Pt('M234 164C238 176 236 186 230 194L214 188C218 182 218 174 216 166Z', P.greenD) + Pt('M231 190L214 184L210 191L227 198Z', P.gold)
      + Pt('M227 196C222 204 214 206 208 201C204 197 206 191 211 189Z', s), [225, 168]),
    [214, 132]);
  const body =
    Pt('M112 118C96 124 88 140 86 170L84 214L236 214L234 170C232 140 224 124 208 118Q160 128 112 118Z', P.greenD)
    + SH('M200 120C218 128 230 146 232 170L234 214L212 214C212 170 210 140 200 120Z', .2)
    + Pt('M118 116Q160 130 202 116L206 126Q160 140 114 126Z', P.fur) + strokes(118, 116, 86, 14, 40, 4, 11)
    + C(132, 150, 2.6, P.gold) + C(132, 166, 2.6, P.gold) + C(132, 182, 2.6, P.gold) + C(188, 150, 2.6, P.gold) + C(188, 166, 2.6, P.gold) + C(188, 182, 2.6, P.gold);
  const beard = Pt('M132 96C128 120 132 150 140 178C146 194 152 206 158 214C160 204 166 196 170 186C178 166 186 132 186 96C176 106 168 108 160 108C150 108 140 104 132 96Z', P.greyL)
    + L('M146 112C146 140 150 166 158 196M160 114C160 144 162 170 166 192M172 110C172 136 172 156 168 180', 'k1') + HL('M140 108c0 20 4 40 10 58');
  const head = G('head',
    E(126, 78, 5, 9, s) + E(194, 78, 5, 9, s)
    + Pt('M160 38C178 38 192 52 192 74C192 96 180 112 160 114C140 112 128 96 128 74C128 52 142 38 160 38Z', s)
    + SH('M176 44C188 52 192 64 192 76C192 96 182 110 166 113C180 98 184 70 176 44Z', .12)
    + L('M141 86q8 5 15 0M164 86q8 5 15 0', 'k1')
    + face({ x: 160, y: 76, dx: 12, look: 0, lid: .52, mx: 160, my: 101, ms: .9 })
    + G('pince', C(148, 77, 8.5, 'none', 'k1') + C(172, 77, 8.5, 'none', 'k1') + L('M156.5 76q3.5-3 7 0', 'k1') + `<path d="M140 74l-10-4" class="k1 nf"/>`, [160, 77])
    + L('M159 76C158 84 156 90 158 94C160 96 164 95 164 92', 'k1')
    + beard
    + Pt('M150 98C154 94 158 95 160 97C162 95 166 94 170 98C166 101 162 101 160 99C158 101 154 101 150 98Z', P.grey)
    + Pt('M126 56C121 24 138 -4 160 -8C174 -10 184 -2 187 8C196 24 199 40 196 56Q160 46 126 56Z', P.burg) + SH('M180 2C193 18 198 38 196 56L182 53C184 36 184 18 180 2Z', .2) + L('M142 20q14-8 30-4M136 36q20-8 46-2', 'k1')
    + Pt('M120 60C118 50 128 44 160 44C192 44 202 50 200 60C198 66 186 64 160 64C134 64 122 66 120 60Z', P.fur) + strokes(122, 46, 76, 16, 50, 4, 7)
    + HL('M140 14q10-16 24-18'), [160, 112]);
  const props = G('prop puff', E(118, 104, 8, 6, '#fff', 'k1') + E(106, 98, 6, 4.5, '#fff', 'k1') + E(97, 91, 4, 3, '#fff', 'k1'));
  return root('treasurer', G('body', body + head + armL + armR + props, [160, 214]), [160, 214]);
}
/** Стол казначея — отдельно, поверх фигуры. */
export function treasurerDesk() {
  const coins = [ [262, 196], [270, 192], [256, 190], [266, 186], [260, 182] ].map(([x, y]) => E(x, y, 9, 3.4, P.gold, 'k1')).join('');
  return Pt('M10 206L310 206L320 222L0 222Z', P.woodL) + Pt('M0 222L320 222L320 250L0 250Z', P.wood)
    + L('M20 232h80M140 238h120M40 244h60M200 230h90', 'k1') + SH('M0 222L320 222L320 228L0 228Z', .25)
    + Pt('M96 200L226 200L232 210L90 210Z', P.parch, 'k1') + L('M110 204h50M170 204h40M108 207h70', 'k1')
    + G('inkwell', Pt('M40 186C38 194 38 202 42 206L64 206C68 202 68 194 66 186Z', P.iron) + E(53, 186, 13, 4, '#1b120d') + HL('M44 190v10'))
    + Pt('M236 182L276 182L278 206L234 206Z', P.burgD) + Pt('M238 174L274 174L276 182L236 182Z', P.burg) + L('M240 178h32', 'k1')
    + coins
    + G('candle', Pt('M14 150L28 150L28 206L14 206Z', P.cream) + Pt('M12 200L30 200L32 206L10 206Z', P.goldD)
      + G('flame', Pt('M21 128C14 138 15 146 21 149C27 146 28 138 21 128Z', P.goldL, 'k1') + Pt('M21 136C18 141 19 145 21 146C23 145 24 141 21 136Z', '#fff3c4', ''), [21, 149])
      + L('M21 149v2', 'k1'));
}

// ======================================================================
// ШУТ ГОРОХОВЫЙ — при колесе. Холст 200×330.
// ======================================================================
function dagger() {
  return Pt('M-2.5 0L2.5 0L3 6L-3 6Z', P.brownD, 'k1') + Pt('M-9 6L9 6L8 10L-8 10Z', P.gold, 'k1')
    + Pt('M-3.6 10L3.6 10L0.6 46L-0.6 46Z', P.silver, 'k1') + L('M0 12V42', 'k1') + C(0, -2, 3.2, P.gold, 'k1');
}
export function jester() {
  const s = P.skin;
  const bell = (x, y) => C(x, y, 3.6, P.goldL, 'k1') + L(`M${x - 1.6} ${y + 1.2}h3.2`, 'k1');
  const arm = (cls, col, extra = '') => G(`arm ${cls}`,
    Pt('M64 128C60 142 59 160 61 176L75 177C75 162 77 146 79 132Z', col)
    + G('fore', Pt('M61 173C60 186 59 196 58 206L73 207C73 196 73 186 75 174Z', col)
      + Pt(zigQ(57, 205, 65, 207, 74, 207, 4, 2.4).replace(/^M/, 'M') + 'L74 210L57 209Z', P.green, 'k1')
      + Pt('M59 209C57 217 59 224 65 225C71 226 74 221 74 214L73 209Z', s) + L('M72 211c4 1 5 7 1 10', 'k1') + extra, [67, 175]),
    [71, 130]);
  const body =
    Pt('M88 196C87 230 86 262 88 298L97 298C98 262 99 230 99 196Z', P.gold) + Pt('M101 196C101 230 102 262 103 298L112 298C114 262 113 230 112 196Z', P.burg)
    + L('M88 230h10M87 262h11M102 230h11M102 262h11', 'k1')
    + Pt('M98 293C90 291 80 295 70 301C64 304 60 302 58 297L55 299C56 307 62 312 70 312L98 312C100 306 100 299 98 293Z', P.burg) + bell(56, 295)
    + Pt('M102 293C110 291 120 295 130 301C136 304 140 302 142 297L145 299C144 307 138 312 130 312L102 312C100 306 100 299 102 293Z', P.gold) + bell(144, 295)
    + Pt('M100 125Q90 125 80 120C70 124 66 132 65 144L63 198L72 206L80 198L90 207L100 198Z', P.burg)
    + Pt('M100 125Q110 125 120 120C130 124 134 132 135 144L137 198L128 206L120 198L110 207L100 198Z', P.gold)
    + SH('M120 122C130 128 134 138 135 150L137 198L128 206L124 200C126 170 126 140 120 122Z', .16)
    + L('M100 128V198', 'k1') + Pt('M64 168Q100 178 136 168L136 175Q100 185 64 175Z', P.brownD) + Pt('M112 176L126 175L127 192L113 193Z', P.wood, 'k1')
    + Pt('M78 118L72 132L84 128L88 140L96 130L100 142L104 130L112 140L116 128L128 132L122 118Q100 126 78 118Z', P.green)
    + bell(72, 133) + bell(88, 141) + bell(100, 143) + bell(112, 141) + bell(128, 133);
  const horn = (cls, d, col, b, o) => G(`horn ${cls}`, Pt(d, col) + bell(b[0], b[1]), o);
  const head = G('head',
    horn('h1', 'M84 62C70 50 54 48 42 58C36 63 34 72 38 78C44 68 56 64 77 74Z', P.burg, [37, 81], [80, 66])
    + horn('h3', 'M116 62C130 50 146 48 158 58C164 63 166 72 162 78C156 68 144 64 123 74Z', P.gold, [163, 81], [120, 66])
    + horn('h2', 'M91 56C90 38 98 22 112 15C120 11 128 13 131 20C121 21 111 31 109 54Z', P.green, [132, 23], [100, 56])
    + Pt('M100 58C113 58 122 68 122 84C122 100 112 112 100 114C90 112 79 102 78 86C78 69 87 58 100 58Z', s)
    + Pt('M75 94C70 72 82 52 100 51C118 52 130 72 125 94C123 84 121 77 117 71Q100 62 83 71C79 77 77 84 75 94Z', P.burg)
    + Pt('M100 51C118 52 130 72 125 94C123 84 121 77 117 71Q110 67 100 66Z', P.gold)
    + C(87, 99, 6, P.cheek, '').replace('/>', ' opacity=".55"/>') + C(113, 99, 6, P.cheek, '').replace('/>', ' opacity=".55"/>')
    + face({ x: 100, y: 85, dx: 10, look: -1, lid: .18, mx: 101, my: 104, ms: 1.05 })
    + Pt('M99 84C99 92 95 97 91 100C94 103 100 102 103 99C101 95 101 90 101 84Z', s, 'k1'),
    [100, 114]);
  return root('jester',
    E(100, 312, 48, 6, P.ink, '').replace('/>', ' opacity=".18"/>')
    + G('body', body + `<path d="M94 108L94 121Q100 124 106 121L106 108Z" fill="${s}" class="k"/>` + head
      + arm('arm-l', P.gold) + MIR(200, arm('arm-r', P.burg, `<g class="held dagger-in-hand" transform="translate(66 213)">${dagger()}</g>`))
      + G('prop sweat', `<path class="k1" d="M128 70q-3.5 6 0 9.5q3.5-3.5 0-9.5Z" fill="#9cc3d8"/>`), [100, 312]),
    [100, 312]);
}
export function daggerSVG() { return `<svg class="art fly-dagger" viewBox="-12 -8 24 58">${dagger()}</svg>`; }

// ======================================================================
// ПОВАР КУЗЬМА — за кухонным столом. Холст 260×300.
// ======================================================================
export function cook() {
  const s = P.skin;
  const cleaver = Pt('M-3 0L3 0L3 18L-3 18Z', P.brownD, 'k1') + Pt('M-4 18L22 18L24 44L-4 44Z', P.silver, 'k1') + C(18, 23, 2, 'none', 'k1') + L('M-2 40h24', 'k1');
  const ladle = Pt('M-2 0L2 0L3 50L-3 50Z', P.woodL, 'k1') + Pt('M-11 50C-11 62 11 62 11 50Z', P.iron, 'k1');
  const arm = (cls, extra = '') => G(`arm ${cls}`,
    Pt('M70 132C56 140 50 156 52 176L76 180C76 164 80 150 88 140Z', '#9a4a2e') + Pt('M50 168L78 172L78 182L50 178Z', '#b86a45')
    + G('fore', Pt('M54 176C52 190 52 202 56 212L76 210C76 200 76 190 76 180Z', s) + L('M58 186l4 2M60 194l4 2M58 202l4 2', 'k1')
      + Pt('M54 208C50 218 54 228 64 229C74 230 80 222 78 212Z', s) + L('M58 214c-2 4-2 8 2 10', 'k1') + extra, [64, 178]),
    [76, 138]);
  const body =
    Pt('M84 124C64 132 52 152 50 180C48 210 58 232 70 244L190 244C202 232 212 210 210 180C208 152 196 132 176 124Q130 136 84 124Z', '#9a4a2e')
    + Pt('M96 148C92 180 94 214 100 244L160 244C166 214 168 180 164 148Q130 158 96 148Z', P.white)
    + E(118, 196, 6, 4, '#c9a27a', '').replace('/>', ' opacity=".7"/>') + E(146, 214, 8, 5, '#b98a5f', '').replace('/>', ' opacity=".55"/>') + E(132, 176, 4, 3, '#a8452f', '').replace('/>', ' opacity=".5"/>')
    + L('M98 150L90 128M162 150L170 128', 'k1') + SH('M176 128C196 136 208 156 210 180C212 210 202 232 190 244L172 244C188 214 190 168 176 128Z', .18)
    + Pt('M94 210Q130 220 166 210L166 218Q130 228 94 218Z', '#e0d4bc', 'k1');
  const head = G('head',
    E(86, 86, 7, 10, s) + E(174, 86, 7, 10, s)
    + Pt('M130 42C154 42 172 60 172 86C172 110 156 128 130 128C104 128 88 110 88 86C88 60 106 42 130 42Z', s)
    + Pt('M108 120Q130 136 152 120Q148 132 130 134Q112 132 108 120Z', s, 'k1')
    + SH('M152 48C166 58 172 72 172 86C172 108 160 124 140 128C162 110 166 76 152 48Z', .12)
    + Pt('M88 78C84 70 88 62 94 60M172 78C176 70 172 62 166 60', 'none') + Pt('M86 84C82 74 86 64 96 62L94 76Z', P.brownD) + Pt('M174 84C178 74 174 64 164 62L166 76Z', P.brownD)
    + Pt('M98 58C92 40 108 24 130 26C152 24 168 40 162 58Q130 66 98 58Z', P.white) + Pt('M96 56Q130 66 164 56L166 64Q130 74 94 64Z', '#e4dccb')
    + L('M112 34q4 8 2 20M130 30v24M148 34q-4 8-2 20', 'k1')
    + C(110, 100, 7, P.cheek, '').replace('/>', ' opacity=".45"/>') + C(150, 100, 7, P.cheek, '').replace('/>', ' opacity=".45"/>')
    + face({ x: 130, y: 82, dx: 14, look: -1, lid: .42, mx: 130, my: 112, ms: 1.1, browThick: 2 })
    + E(130, 96, 8.5, 7.5, '#e9b29a') + E(127, 94, 2.4, 1.8, '#fff', '').replace('/>', ' opacity=".6"/>')
    + Pt('M130 104C120 98 106 99 99 108C104 106 111 108 115 112C120 110 125 107 130 107C135 107 140 110 145 112C149 108 156 106 161 108C154 99 140 98 130 104Z', P.brownD),
    [130, 128]);
  const props = G('prop steam-puff', E(84, 52, 8, 6, '#fff', 'k1') + E(74, 44, 5, 4, '#fff', 'k1'));
  return root('cook',
    G('body', body + head
      + arm('arm-l', `<g class="held carrot" transform="translate(66 226)">${Pt('M0 0L26 -6L28 2Z', '#e07b2c', 'k1')}${L('M-2 -1l-6-4M-2 1l-7 1', 'k1')}</g>`)
      + MIR(260, arm('arm-r', `<g class="held cleaver" transform="translate(66 222) rotate(160)">${cleaver}</g><g class="held ladle" transform="translate(66 222) rotate(170)">${ladle}</g>`))
      + props, [130, 244]),
    [130, 244]);
}
/** Кухонный стол с доской, овощами и котелком (перед поваром). */
export function cookTable() {
  const slices = [0, 1, 2, 3, 4].map(i => `<g class="slice s${i}">${E(150 + i * 9, 232, 4.2, 3, '#e8873a', 'k1')}${E(150 + i * 9, 232, 1.6, 1.1, '#f3b26a', '')}</g>`).join('');
  return Pt('M0 244L260 244L260 300L0 300Z', P.wood) + Pt('M-4 236L264 236L260 248L0 248Z', P.woodL) + L('M10 262h70M110 272h110M30 286h90', 'k1') + SH('M0 248L260 248L260 254L0 254Z', .25)
    + Pt('M78 226L196 226L202 240L72 240Z', '#c99a62') + L('M84 236h100', 'k1')
    + G('cabbage', C(96, 222, 14, '#7c9b58') + L('M88 216q8 4 8 14M104 214q-6 6-6 16M90 228q6-2 12 0', 'k1'))
    + G('onion', Pt('M226 238C214 238 212 222 222 216C224 212 226 210 226 206C226 210 228 212 230 216C240 222 238 238 226 238Z', '#d8a85a') + L('M222 220q4 8 4 18M230 220q-2 8-4 18', 'k1'))
    + slices;
}
export function cookPot() {
  return G('pot', Pt('M0 0C-4 20 4 34 30 34C56 34 64 20 60 0Z', '#2d2a28') + E(30, 0, 31, 7, '#3a3532') + E(30, 0, 26, 4.5, '#7a5a2a', 'k1')
    + L('M-2 6h-6M62 6h6', 'k') + HL('M6 8q2 14 12 20')
    + G('steam', `<path class="st st1" d="M18-6c-6-8 6-14 0-24" /><path class="st st2" d="M32-8c-6-8 6-14 0-24" /><path class="st st3" d="M46-6c-6-8 6-14 0-24" />`));
}

// ======================================================================
// БОЯРЕ — параметрический конструктор. Холст 170×360, ноги на y=350, лицом влево (3/4).
// ======================================================================
const HATS = {
  gorlatka(h, col, top) { // высокая меховая шапка, расширяется кверху
    const y0 = 104, y1 = y0 - h;
    return Pt(`M58 ${y0}C56 ${y0 - h * .5} 52 ${y1 + 8} 50 ${y1}Q80 ${y1 - 10} 110 ${y1}C108 ${y1 + 8} 104 ${y0 - h * .5} 102 ${y0}Q80 ${y0 + 6} 58 ${y0}Z`, col)
      + strokes(54, y1 + 4, 52, h - 6, Math.round(h * .9), 5, h * 7, 92) + E(80, y1, 30, 6, top || col) + SH(`M92 ${y0 + 2}C94 ${y0 - h * .5} 100 ${y1 + 8} 104 ${y1 + 2}L110 ${y1}C108 ${y1 + 8} 104 ${y0 - h * .5} 102 ${y0}Z`, .2);
  },
  murmolka(h, col, top) { // шапка с плоским верхом и меховой отворотом
    const y0 = 104, y1 = y0 - h;
    return Pt(`M56 ${y0 - 14}C54 ${y1 + 20} 60 ${y1} 80 ${y1}C100 ${y1} 106 ${y1 + 20} 104 ${y0 - 14}Z`, top) + L(`M62 ${y1 + 14}q18 -6 36 0M60 ${y1 + 26}q20 -6 40 0`, 'k1')
      + Pt(`M52 ${y0 + 2}C50 ${y0 - 10} 54 ${y0 - 18} 80 ${y0 - 18}C106 ${y0 - 18} 110 ${y0 - 10} 108 ${y0 + 2}Q80 ${y0 + 8} 52 ${y0 + 2}Z`, col) + strokes(54, y0 - 16, 52, 16, 26, 4, h * 5, 90);
  },
  fox(h, col) { // круглая лисья шапка
    const y0 = 104;
    return Pt(`M54 ${y0}C48 ${y0 - h * .7} 62 ${y0 - h} 80 ${y0 - h}C98 ${y0 - h} 112 ${y0 - h * .7} 106 ${y0}Q80 ${y0 + 6} 54 ${y0}Z`, col) + strokes(54, y0 - h + 4, 52, h - 4, 30, 5, h * 3, 70)
      + Pt(`M104 ${y0 - h * .5}C118 ${y0 - h * .3} 124 ${y0 - 8} 120 ${y0 + 6}C116 ${y0} 112 ${y0 - 8} 106 ${y0 - 10}Z`, col) + E(120, y0 + 6, 3, 4, P.snow, 'k1');
  },
  kolpak(h, col, top) { // мягкий высокий колпак с загнутой макушкой
    const y0 = 104;
    return Pt(`M56 ${y0}C54 ${y0 - h * .6} 62 ${y0 - h} 84 ${y0 - h - 6}C96 ${y0 - h - 8} 104 ${y0 - h + 4} 98 ${y0 - h + 10}C108 ${y0 - h * .6} 106 ${y0 - 20} 104 ${y0}Z`, col)
      + Pt(`M52 ${y0 + 2}C50 ${y0 - 8} 56 ${y0 - 12} 80 ${y0 - 12}C104 ${y0 - 12} 110 ${y0 - 8} 108 ${y0 + 2}Q80 ${y0 + 8} 52 ${y0 + 2}Z`, top) + strokes(54, y0 - 11, 52, 12, 20, 3.5, h * 2, 90);
  }
};
const BEARDS = {
  long: 'M62 140C58 160 60 190 70 226C76 206 82 186 84 160C86 150 86 144 86 140C80 146 70 146 62 140Z',
  fork: 'M60 140C56 160 58 190 64 214C68 198 72 192 74 186C76 194 80 202 86 212C90 186 90 160 88 140C80 146 70 146 60 140Z',
  round: 'M58 138C52 150 54 172 72 180C88 180 96 164 92 138C82 148 66 148 58 138Z',
  spade: 'M58 138C50 156 52 182 60 200L90 200C96 182 98 158 92 138C82 148 66 148 58 138Z',
  vlong: 'M62 140C56 180 58 240 66 292C70 270 76 250 80 230C86 200 88 160 88 140C80 146 70 146 62 140Z',
  goatee: 'M66 146C64 156 66 166 72 176C76 168 80 158 80 146C76 150 70 150 66 146Z',
  curly: 'M58 138C48 146 50 160 56 166C52 174 58 186 66 186C70 194 82 194 86 186C96 184 98 172 94 164C100 156 98 144 92 138C82 148 66 148 58 138Z'
};
const BEARD_LINES = {
  long: 'M68 150C68 170 70 190 72 210M78 150C78 168 78 186 76 200', fork: 'M66 152C66 172 66 190 66 206M82 152C82 172 82 190 84 204',
  round: 'M66 150q2 14 6 22M80 150q0 14-4 22', spade: 'M64 152q0 22 2 42M76 154v40M86 152q0 22-2 42',
  vlong: 'M68 150C66 190 68 240 68 280M78 150C78 190 76 230 74 260', goatee: 'M72 150v20', curly: 'M62 160q6-4 10 2t10 2M60 174q6-4 10 2t12 0'
};
function boyarProp(kind, b) {
  switch (kind) {
    case 'abacus': return `<g transform="translate(38 206)">${Pt('M0 0h40v30H0Z', P.woodL)}${[7, 15, 23].map((y, i) => L(`M2 ${y}h36`, 'k1') + [0, 1, 2, 3, 4].map(j => E(6 + j * 6 + (i % 2) * 8, y, 2.6, 3, i === 1 ? P.burg : P.gold, 'k1')).join('')).join('')}</g>`;
    case 'scroll': return `<g transform="translate(40 208) rotate(-12)">${Pt('M0 0h34v14H0Z', P.parch)}${E(0, 7, 4, 7, P.cream)}${E(34, 7, 4, 7, P.cream)}${C(17, 7, 3, P.burg, 'k1')}</g>`;
    case 'list': return `<g>${Pt('M44 212h30l-4 128c-6 4-18 4-26 0Z', P.parch)}${L('M50 224h18M50 234h16M50 244h18M50 254h14M50 264h18M50 274h16M50 284h18M50 294h12M50 304h18M50 314h16', 'k1')}${E(59, 212, 16, 5, P.cream)}</g>`;
    case 'staff': return `<g>${Pt('M36 150L42 150L44 350L38 350Z', P.woodD)}${C(39, 146, 7, P.gold)}${L('M34 146h10', 'k1')}</g>`;
    case 'purse': return `<g transform="translate(44 214)">${Pt('M4 0C-6 10-6 30 14 32C34 30 34 10 24 0Z', P.burg)}${Pt('M2 -2h24l-4 6H6Z', P.gold, 'k1')}${coin(14, 18, 5)}</g>`;
    case 'book': return `<g transform="translate(30 200)">${Pt('M0 4L24 0L48 4L48 40L24 36L0 40Z', P.burgD)}${Pt('M3 6L24 3L45 6L45 37L24 33L3 37Z', P.parch, 'k1')}${L('M24 3V33M8 12h12M8 18h12M28 12h12M28 18h10', 'k1')}</g><g transform="translate(70 196) rotate(20)">${Pt('M0 0C-5-12-6-28-1-42C4-30 5-14 2-1Z', P.cream, 'k1')}</g>`;
    case 'glass': return `<g transform="translate(36 186)">${L('M14 20L22 44', 'k')}${C(10, 12, 12, '#d9e6e8', 'k')}${C(10, 12, 9, 'none', 'k1')}${HL('M4 8q4-5 9-5')}</g>`;
    case 'chain': return `<g>${L('M52 164Q72 196 96 164', 'k1')}${C(73, 186, 7, P.gold)}${star4(73, 186, 4, P.goldL)}</g>`;
    default: return '';
  }
}
/** b: {w, sc, robe, trim, hat:{t,h,c,top}, beard:{t,c}, hair, look, lid, brow, nose:'long'|'round'|'hook', prop, glasses, cheeks, pattern} */
export function boyar(b) {
  const w = b.w || 1, s = P.skin;
  const xl = (x) => f1(80 - (80 - x) * w), xr = (x) => f1(80 + (x - 80) * w);
  const robe = Pt(`M${xl(54)} 158C${xl(40)} 172 ${xl(30)} 260 ${xl(24)} 346L${xr(136)} 346C${xr(130)} 260 ${xr(120)} 172 ${xr(106)} 158Q80 150 ${xl(54)} 158Z`, b.robe)
    + (b.pattern === 'dots' ? strokes(xl(34), 180, 100 * w, 150, 40, 1.2, 31, 0, 'k1 nf dots') : '')
    + (b.pattern === 'brocade' ? [0, 1, 2, 3].map(i => `<path class="k1" fill="${b.trim2 || P.goldL}" d="M${xr(98)} ${196 + i * 36}l6 -8l6 8l-6 8Z"/>`).join('') + [0, 1, 2].map(i => `<path class="k1" fill="${b.trim2 || P.goldL}" d="M${xl(46)} ${214 + i * 40}l6 -8l6 8l-6 8Z"/>`).join('') : '')
    + SH(`M${xr(100)} 162C${xr(116)} 176 ${xr(124)} 260 ${xr(136)} 346L${xr(112)} 346C${xr(110)} 260 ${xr(106)} 190 ${xr(100)} 162Z`, .2)
    + Pt(`M${xl(64)} 166C${xl(62)} 220 ${xl(60)} 280 ${xl(58)} 346L${xl(74)} 346C${xl(74)} 280 ${xl(74)} 220 ${xl(72)} 166Z`, b.trim) + strokes(xl(60), 170, 12 * w, 174, 30, 3, 91, 90)
    + Pt(`M${xl(24)} 332Q80 344 ${xr(136)} 332L${xr(136)} 346L${xl(24)} 346Z`, b.trim) + strokes(xl(26), 334, 108 * w, 12, 30, 3, 17, 90)
    + (w > 1.15 ? Pt(`M${xl(40)} 200C${xl(26)} 220 ${xl(26)} 262 ${xl(44)} 282L${xl(56)} 282C${xl(50)} 250 ${xl(50)} 220 ${xl(48)} 200Z`, b.robe) : '')
    + Pt('M50 346C44 346 34 348 30 352L60 352L60 346Z', P.woodD) + Pt('M96 346L96 352L124 352C120 348 110 346 104 346Z', P.woodD);
  const collar = Pt(`M${xl(46)} 160C${xl(46)} 146 ${xr(114)} 146 ${xr(114)} 160C${xr(114)} 176 ${xl(46)} 176 ${xl(46)} 160Z`, b.trim) + strokes(xl(48), 150, 64 * w, 24, 40, 4, 23, 80);
  const beard = b.beard ? Pt(BEARDS[b.beard.t], b.beard.c) + L(BEARD_LINES[b.beard.t], 'k1') : '';
  const nose = b.nose === 'round' ? Pt('M66 124C60 128 58 136 64 138C68 139 70 136 70 132Z', s, 'k1')
    : b.nose === 'hook' ? Pt('M68 118C64 124 56 132 58 138C62 140 66 138 70 134Z', s, 'k1')
      : Pt('M68 120C64 126 60 134 62 138C66 140 69 138 71 134Z', s, 'k1');
  const head = G('head',
    E(98, 126, 5, 8, s) + Pt('M80 98C96 98 104 110 104 126C104 142 94 152 80 152C66 152 60 140 60 124C60 108 66 98 80 98Z', s)
    + SH('M92 102C100 108 104 118 104 126C104 142 96 150 84 152C96 140 98 118 92 102Z', .13)
    + (b.hair ? Pt('M98 108C106 112 108 126 104 138C102 130 100 120 96 114Z', b.hair) : '')
    + C(68, 134, 5, P.cheek, '').replace('/>', ` opacity="${b.cheeks ?? .38}"/>`)
    + face({ x: 75, y: 120, dx: 9, s: .92, look: b.look ?? -1, lid: b.lid ?? .4, mx: 72, my: 144, ms: .8, far: .85, browThick: b.brow || 1 })
    + beard
    + Pt('M60 140C64 136 70 136 74 139C78 136 84 136 88 140C84 143 78 143 74 141C70 143 64 143 60 140Z', b.beard ? b.beard.c : P.brownD)
    + nose
    + (b.glasses ? C(66, 120, 6, 'none', 'k1') + C(83, 120, 6, 'none', 'k1') + L('M72 119h5M89 119l9-3', 'k1') : '')
    + HATS[b.hat.t](b.hat.h, b.hat.c, b.hat.top),
    [80, 150]);
  const hands = G('hands', Pt('M64 210C58 212 58 222 64 224C70 226 76 222 76 216C76 212 70 208 64 210Z', s));
  const arm = G('arm', Pt(`M${xr(104)} 166C${xr(112)} 190 ${f1(96 + 10 * (w - 1))} 214 76 226L60 214C${f1(76 + 6 * (w - 1))} 202 ${xr(88)} 188 ${xr(92)} 170Z`, b.robe) + Pt('M76 226L60 214L56 220L72 232Z', b.trim, 'k1') + Pt('M57 219C50 219 47 228 53 232C59 235 66 232 68 227Z', s) + L('M53 224l-7-6', 'k1'), [f1(80 + 18 * w), 168]);
  return `<g class="ch boyar" data-e="open" data-b="${b.browDefault || 'n'}" data-m="n" data-pose="rest" data-mood="idle"${at([80, 350])}>`
    + E(80, 350, 58 * w, 6, P.ink, '').replace('/>', ' opacity=".2"/>')
    + G('body', `<g transform="translate(80 350) scale(${b.sc || 1}) translate(-80 -350)">` + robe + Pt('M72 144L72 158Q80 162 88 158L88 144Z', s) + collar + head + arm + boyarProp(b.prop, b) + hands + '</g>', [80, 350])
    + '</g>';
}
export const BOYARS = [
  { id: 'schetov', name: 'Боярин Счётов', title: 'сравнивает времена', w: .9, sc: 1.02, robe: P.greenD, trim: P.furD, hat: { t: 'gorlatka', h: 76, c: P.furD }, beard: { t: 'long', c: P.greyL }, hair: P.greyL, glasses: true, prop: 'abacus', lid: .5 },
  { id: 'puzatov', name: 'Боярин Пузатов', title: 'ведает долями казны', w: 1.32, sc: .95, robe: P.burg, trim: P.fur, pattern: 'brocade', hat: { t: 'fox', h: 34, c: P.furR }, beard: { t: 'round', c: '#a2552c' }, hair: '#a2552c', prop: 'chain', nose: 'round', cheeks: .6 },
  { id: 'trevogin', name: 'Боярин Тревогин', title: 'бьёт тревогу', w: .86, sc: 1.04, robe: P.blueD, trim: P.furD, hat: { t: 'gorlatka', h: 112, c: '#2b211c' }, beard: { t: 'fork', c: '#1f1a17' }, hair: '#1f1a17', prop: 'scroll', lid: 0, browDefault: 's', nose: 'hook' },
  { id: 'radostin', name: 'Боярин Радостин', title: 'хвалит за бережливость', w: 1.16, sc: .93, robe: P.goldD, trim: P.snow, pattern: 'brocade', trim2: P.burg, hat: { t: 'murmolka', h: 46, c: P.snow, top: P.burg }, beard: { t: 'spade', c: P.snow }, hair: P.snow, cheeks: .7, prop: 'purse' },
  { id: 'podpiskin', name: 'Боярин Подпискин', title: 'считает повторы', w: 1, sc: 1, robe: P.greenL, trim: P.fur, hat: { t: 'murmolka', h: 58, c: P.fur, top: P.greenD }, beard: { t: 'long', c: P.brown }, hair: P.brown, prop: 'list', lid: .45 },
  { id: 'dikovinov', name: 'Боярин Диковинов', title: 'замечает диковинное', w: .95, sc: .98, robe: P.blue, trim: P.snow, pattern: 'dots', hat: { t: 'kolpak', h: 64, c: P.snow, top: P.furD }, beard: { t: 'curly', c: '#3b2a20' }, hair: '#3b2a20', prop: 'glass', look: -1, lid: .1 },
  { id: 'chekushkin', name: 'Боярин Чекушкин', title: 'знает средний чек', w: 1.08, sc: .86, robe: P.red, trim: P.furD, hat: { t: 'kolpak', h: 40, c: P.burgD, top: P.furD }, beard: { t: 'goatee', c: P.brownD }, hair: P.brownD, prop: 'purse', nose: 'round', cheeks: .55 },
  { id: 'letopiscev', name: 'Боярин Летописцев', title: 'хранит летопись казны', w: 1.02, sc: 1.03, robe: P.burgD, trim: P.fur, hat: { t: 'gorlatka', h: 90, c: P.fur }, beard: { t: 'vlong', c: P.snow }, hair: P.snow, prop: 'book', lid: .55, brow: 2 }
];

// ======================================================================
// ГЕРОИ НА КАРТЕ — царь и царица, идут рука об руку. Холст 90×96.
// ======================================================================
export function heroes() {
  const s = P.skin;
  const leg = (x, cls, col) => G(`leg ${cls}`, Pt(`M${x - 3} 70L${x - 3} 86L${x + 3} 86L${x + 3} 70Z`, col, 'k1') + Pt(`M${x - 4} 85L${x + 6} 85L${x + 7} 89L${x - 4} 89Z`, P.woodD, 'k1'), [x, 70]);
  const tsar = G('tsar',
    leg(22, 'l1', P.burgD) + leg(32, 'l2', P.burgD)
    + Pt('M27 34C16 36 12 48 12 62L14 76L40 76L42 62C42 48 38 36 27 34Z', P.red) + Pt('M14 70L40 70L40 77L14 77Z', P.snow, 'k1') + strokes(15, 70, 24, 6, 10, 2, 5, 90)
    + Pt('M22 36L32 36L32 76L22 76Z', P.gold, 'k1')
    + C(27, 24, 10, s) + Pt('M19 28C19 40 23 46 27 48C31 46 35 40 35 28C31 31 23 31 19 28Z', P.brown, 'k1')
    + C(23.5, 23, 1.3, P.ink, '') + C(30.5, 23, 1.3, P.ink, '')
    + Pt('M17 16L19 8L23 13L27 5L31 13L35 8L37 16Z', P.goldL, 'k1') + Pt('M17 15h20v4H17Z', P.gold, 'k1') + C(27, 8, 1.6, P.red, 'k1'));
  const tsaritsa = G('tsaritsa',
    leg(58, 'l2', '#e3d5bd') + leg(67, 'l1', '#e3d5bd')
    + Pt('M62 34C52 36 48 50 46 66L44 84L80 84L78 66C76 50 72 36 62 34Z', P.greenD) + Pt('M56 38L68 38L72 84L52 84Z', P.burg, 'k1')
    + [46, 56, 66, 76].map(y => C(62, y, 1.6, P.goldL, 'k1')).join('')
    + C(62, 24, 9.5, s) + Pt('M53 22C52 30 52 40 50 52L56 50C56 40 57 30 58 24Z', P.brown, 'k1')
    + C(58.5, 24, 1.3, P.ink, '') + C(65.5, 24, 1.3, P.ink, '') + C(62, 28, 2.4, P.cheek, '').replace('/>', ' opacity=".5"/>')
    + Pt('M50 18C50 6 74 6 74 18C70 16 54 16 50 18Z', P.burg) + Pt('M50 18C54 15 70 15 74 18L74 21C70 19 54 19 50 21Z', P.gold, 'k1') + [54, 58, 62, 66, 70].map(x => C(x, 12, 1.2, P.goldL, 'k1')).join(''));
  const hands = Pt('M38 52C42 50 46 50 49 52', 'none') + L('M38 54C42 58 46 58 50 54', 'k') + C(44, 57, 3, s, 'k1');
  return `<g class="heroes"${at([45, 90])}>${E(45, 90, 34, 4, P.ink, '').replace('/>', ' opacity=".22"/>')}<g class="walker">${tsaritsa}${tsar}${hands}</g></g>`;
}
