// animations.js — эффекты: летящие монеты, искры, всплывающий опыт, счётчики.
// Все эффекты рисуются в отдельном слое #fx и уважают режим уменьшенной анимации.
import { money } from './ui.js';

const layer = () => document.getElementById('fx');
const off = () => document.body.classList.contains('anim-off');
const low = () => document.body.classList.contains('anim-low');
const rnd = (a, b) => a + Math.random() * (b - a);

/** Монеты летят по дуге из точки from в точку to (координаты окна). */
export function coinsFly(from, to, n = 10, { spread = 40, dur = 900, fade = false } = {}) {
  if (off()) return Promise.resolve();
  const L = layer(); if (!L) return Promise.resolve();
  n = low() ? Math.min(4, n) : n;
  const all = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div'); c.className = 'fx-coin'; L.appendChild(c);
    const x0 = from.x + rnd(-spread, spread) * .4, y0 = from.y + rnd(-spread, spread) * .3;
    const x1 = to.x + rnd(-spread, spread), y1 = to.y + rnd(-8, 8);
    const mx = (x0 + x1) / 2 + rnd(-60, 60), my = Math.min(y0, y1) - rnd(60, 150);
    const kf = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1; kf.push({ transform: `translate(${x}px,${y}px) rotateY(${t * 720}deg) scale(${1 - (fade ? t * .5 : 0)})`, opacity: fade && t > .7 ? 1 - (t - .7) / .3 : 1 }); }
    const a = c.animate(kf, { duration: dur + rnd(-150, 250), delay: i * 55, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'both' });
    all.push(a.finished.then(() => c.remove()).catch(() => c.remove()));
  }
  return Promise.all(all);
}
/** Монеты разлетаются вверх и исчезают (траты). */
export function coinsAway(from, n = 8) {
  if (off()) return Promise.resolve();
  const L = layer(); if (!L) return Promise.resolve();
  n = low() ? Math.min(3, n) : n;
  const all = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div'); c.className = 'fx-coin'; L.appendChild(c);
    const x0 = from.x + rnd(-30, 30), y0 = from.y + rnd(-10, 10);
    const dx = rnd(-160, 160), dy = rnd(-220, -120);
    const a = c.animate([{ transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1 }, { transform: `translate(${x0 + dx * .6}px,${y0 + dy}px) scale(.9) rotate(200deg)`, opacity: .9, offset: .55 }, { transform: `translate(${x0 + dx}px,${y0 + dy * .6}px) scale(.3) rotate(400deg)`, opacity: 0 }],
      { duration: 1100 + rnd(0, 300), delay: i * 70, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' });
    all.push(a.finished.then(() => c.remove()).catch(() => c.remove()));
  }
  return Promise.all(all);
}
/** Искры-звёздочки из точки. */
export function burst(x, y, n = 12, big = false) {
  if (off()) return;
  const L = layer(); if (!L) return;
  n = low() ? Math.min(5, n) : n;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div'); s.className = 'fx-spark'; L.appendChild(s);
    const a = Math.random() * Math.PI * 2, r = rnd(40, big ? 180 : 110), sc = rnd(.8, big ? 2.4 : 1.6);
    s.animate([{ transform: `translate(${x}px,${y}px) scale(.2)`, opacity: 1 }, { transform: `translate(${x + Math.cos(a) * r}px,${y + Math.sin(a) * r}px) scale(${sc}) rotate(180deg)`, opacity: 0 }],
      { duration: rnd(600, 1100), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }).finished.then(() => s.remove()).catch(() => s.remove());
  }
}
/** Всплывающая надпись (например, «+40 опыта»). */
export function flyText(x, y, text) {
  const L = layer(); if (!L) return;
  const t = document.createElement('div'); t.className = 'fx-xp'; t.textContent = text; L.appendChild(t);
  t.animate([{ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(.6)`, opacity: 0 }, { transform: `translate(${x}px,${y - 30}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: .25 }, { transform: `translate(${x}px,${y - 90}px) translate(-50%,-50%) scale(1)`, opacity: 0 }],
    { duration: off() ? 900 : 1600, easing: 'ease-out', fill: 'both' }).finished.then(() => t.remove()).catch(() => t.remove());
}
/** Плавный счётчик денег в элементе. */
const counters = new WeakMap();
export function countTo(el, from, to, dur = 1100) {
  if (!el) return;
  const prev = counters.get(el); if (prev) cancelAnimationFrame(prev);
  if (off() || from === to) { el.textContent = money(to, { round: Math.abs(to) >= 100000 }); el.classList.toggle('neg', to < 0); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
    const v = Math.round(from + (to - from) * e);
    el.textContent = money(v, { round: Math.abs(to) >= 100000 }); el.classList.toggle('neg', v < 0);
    if (k < 1) counters.set(el, requestAnimationFrame(step)); else counters.delete(el);
  };
  counters.set(el, requestAnimationFrame(step));
}
export const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
