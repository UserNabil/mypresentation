import { Puppet, loadRig, register, unregister, wakeLoop } from './puppet.js';

const ROOT = '/studio/img/brand/';
const CSS_ID = 'bee-css';
const SLEEP_MS = 4 * 60 * 1000;
const LOOK_KEY = 'bee.look';

const bees = new Set();
let io = null;
let mo = null;
let last = Date.now();
let asleep = false;
let sleepTimer = 0;
let rigP = null;
let pointer = null;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const l = document.createElement('link');
  l.id = CSS_ID;
  l.rel = 'stylesheet';
  l.href = '/studio/css/modern/bee.css';
  document.head.appendChild(l);
}

function reduced() {
  return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function lookOn() {
  try { return localStorage.getItem(LOOK_KEY) !== '0'; } catch (e) { return true; }
}

export function beeHtml({ size = 96, flying = true, label = '' } = {}) {
  ensureCss();
  return '<span class="bee' + (flying ? ' is-flying' : '') + '" style="--bee-size:' + size + 'px" role="img" aria-label="' + (label || 'Eden bee') + '">'
    + '<span class="bee-fly">'
    + '<img class="bee-wing-l" src="' + ROOT + 'bee_wing_l.png" alt="" draggable="false">'
    + '<img class="bee-wing-r" src="' + ROOT + 'bee_wing_r.png" alt="" draggable="false">'
    + '<img class="bee-body" src="' + ROOT + 'bee_body.png" alt="" draggable="false">'
    + '</span></span>';
}

export function beeLoaderHtml({ size = 140, label = '' } = {}) {
  ensureCss();
  return '<span class="bee-loader" style="--bee-loader-size:' + size + 'px" role="status" aria-live="polite">'
    + '<img class="bee-loader-ring" src="' + ROOT + 'loader_ring.png" alt="" draggable="false">'
    + beeHtml({ size: Math.round(size * .8), flying: true, label: label || 'Loading' })
    + '<img class="bee-loader-spark" src="' + ROOT + 'sparkles.png" alt="" draggable="false">'
    + (label ? '<span class="bee-loader-label">' + label + '</span>' : '')
    + '</span>';
}

function sizeOf(el) {
  const w = el.offsetWidth;
  if (w > 0) return w;
  const v = parseFloat(el.style.getPropertyValue('--bee-size'));
  return Number.isFinite(v) ? v : 0;
}

function accentHue() {
  const root = document.documentElement;
  const acc = root.getAttribute('data-accent');
  if (!acc || acc === 'gold' || root.getAttribute('data-ui') !== 'modern') return null;
  const v = getComputedStyle(root).getPropertyValue('--ui-accent').trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.05) return null;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function zColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--ui-accent-text').trim() || '#9A6A00';
}

function applyLook() {
  const on = lookOn();
  bees.forEach((b) => { if (b.p) b.p.follow = on; });
}

function applyTheme() {
  const hue = accentHue();
  const col = zColor();
  bees.forEach((b) => { if (b.p) { b.p.accent = col; b.p.setTint(hue); } });
}

function dprFor(size) {
  const d = window.devicePixelRatio || 1;
  return size <= 96 ? Math.max(2, Math.min(3, d)) : Math.max(1, Math.min(2, d));
}

function fpsFor(size) {
  if (size <= 64) return 20;
  if (size <= 200) return 30;
  return 60;
}

async function create(b) {
  if (b.p || b.creating) return;
  const size = sizeOf(b.el);
  b.tries = (b.tries || 0) + 1;
  if (size < 8) {
    if (b.tries < 12) setTimeout(() => { if (bees.has(b) && b.visible) create(b); }, 400);
    return;
  }
  b.creating = true;
  try {
    if (!rigP) rigP = loadRig();
    const rig = await rigP;
    if (!bees.has(b)) return;
    const cv = document.createElement('canvas');
    cv.className = 'bee-cv';
    cv.setAttribute('aria-hidden', 'true');
    b.el.appendChild(cv);
    const p = new Puppet(cv, { bee: size, w: Math.round(size * 1.5), h: Math.round(size * 1.25), fps: fpsFor(size), cssSize: false, dpr: dprFor(size) }, rig);
    p.flyingFn = () => b.el.classList.contains('is-flying');
    p.follow = lookOn();
    p.accent = zColor();
    p.hue = accentHue();
    p.pointer = pointer;
    await new Promise((res) => { const t = setInterval(() => { if (p.ready) { clearInterval(t); res(); } }, 25); });
    if (!bees.has(b)) { cv.remove(); return; }
    b.p = p;
    p.setReduced(reduced());
    if (asleep && !reduced()) p.sleep();
    register(p);
    b.el.classList.add('bee-live');
  } catch (e) {
    b.failed = true;
    if (b.tries < 4) setTimeout(() => { if (bees.has(b) && b.visible) create(b); }, 2000);
  } finally {
    b.creating = false;
  }
}

function adopt(el) {
  if (el.__bee) return;
  const b = { el, p: null, visible: false, creating: false };
  el.__bee = b;
  bees.add(b);
  if (io) io.observe(el);
}

function release(b) {
  if (io) io.unobserve(b.el);
  if (b.p) unregister(b.p);
  bees.delete(b);
  delete b.el.__bee;
}

function scan(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches('.bee')) adopt(root);
  root.querySelectorAll('.bee').forEach(adopt);
}

function sweep() {
  bees.forEach((b) => { if (!b.el.isConnected) release(b); });
}

function wake() {
  last = Date.now();
  if (!asleep) return;
  asleep = false;
  bees.forEach((b) => { if (b.p) b.p.wake(); });
}

function fallAsleep() {
  if (asleep || reduced()) return;
  asleep = true;
  bees.forEach((b) => { if (b.p && b.visible) b.p.sleep(); });
}

function armSleep() {
  clearTimeout(sleepTimer);
  if (document.hidden) return;
  const left = SLEEP_MS - (Date.now() - last);
  sleepTimer = setTimeout(() => {
    if (Date.now() - last >= SLEEP_MS) fallAsleep();
    armSleep();
  }, Math.max(left, 15000));
}

function onPointer(e) {
  pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
  bees.forEach((b) => { if (b.p) b.p.setPointer(pointer); });
  wake();
}

const REACT = {
  peek: 'peek',
  happy: 'happy',
  error: 'shake',
  sway: 'sway',
  hop: 'hop',
  spin: 'spin1'
};

export function beeReact(kind, only) {
  const act = REACT[kind];
  if (!act) return;
  wake();
  bees.forEach((b) => {
    if (!b.p || !b.visible || (only && !b.el.closest(only))) return;
    b.p.play(act);
  });
  wakeLoop();
}

function bindLogo() {
  document.addEventListener('pointerover', (e) => {
    const c = e.target.closest && e.target.closest('header .crest, .tour-bee');
    if (!c || c.contains(e.relatedTarget)) return;
    beeReact('hop', c.matches('.tour-bee') ? '.tour-bee' : '.mx-bee');
  }, { passive: true });
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('header .crest');
    if (c) beeReact('spin', '.mx-bee');
  }, { passive: true });
}

function init() {
  if (window.__beeInit) return;
  window.__beeInit = true;
  io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const b = en.target.__bee;
      if (!b) return;
      b.visible = en.isIntersecting;
      if (b.visible) create(b);
    });
  }, { rootMargin: '40px' });
  mo = new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach(scan));
    if (muts.some((m) => m.removedNodes.length)) sweep();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, t === 'pointermove' ? onPointer : wake, { passive: true }));
  document.documentElement.addEventListener('mouseleave', () => { pointer = null; bees.forEach((b) => { if (b.p) b.p.setPointer(null); }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { armSleep(); wakeLoop(); } else clearTimeout(sleepTimer); });
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent', 'data-theme', 'data-ui', 'class', 'style'] });
  addEventListener('eden:bee', (e) => beeReact(e.detail));
  addEventListener('storage', applyLook);
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.addEventListener) mq.addEventListener('change', () => bees.forEach((b) => { if (b.p) b.p.setReduced(reduced()); }));
  }
  bindLogo();
  armSleep();
}

if (typeof document !== 'undefined') {
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
}
