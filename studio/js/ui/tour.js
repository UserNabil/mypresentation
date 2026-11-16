import { beeHtml } from './bee.js';
import { modernOn } from './modern_gate.js';
import { lineSvg } from './line_icons.js';
import { TOURS, TOUR_NAMES, detectContext, openDialog, dialogTour } from './tour_steps.js';

const K_OFF = 'tour.bee.off';
const K_HINT = 'tour.hint.off';
const K_SEEN = 'tour.seen.';
const CSS_ID = 'tour-css';
const BEE = 46;
const GAP = 14;
const EDGE = 16;
const PAD = 6;

let USER = '';
let built = false;
let bee = null;
let spot = null;
let block = null;
let bubble = null;
let hintEl = null;
let steps = [];
let idx = 0;
let ctxKey = '';
let running = false;
let lastCtx = '';
let ctxTimer = 0;
let hintTimer = 0;
let raf = 0;
let flyTimer = 0;
let beeXY = { x: 0, y: 0 };
const hinted = new Set();

function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return; } }
function still() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function beeOff() { return read(K_OFF) === '1'; }
function active() { return modernOn() && !beeOff(); }

function seen() {
  try { const v = JSON.parse(read(K_SEEN + (USER || 'anon')) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function markSeen(k) {
  const v = seen();
  if (!k || v.includes(k)) return;
  v.push(k);
  write(K_SEEN + (USER || 'anon'), JSON.stringify(v));
}

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const l = document.createElement('link');
  l.id = CSS_ID; l.rel = 'stylesheet'; l.href = '/studio/css/modern/tour.css';
  document.head.appendChild(l);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function visible(n) {
  if (!n || !n.isConnected || n.closest('[hidden]')) return false;
  const r = n.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const cs = getComputedStyle(n);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity !== 0;
}

function find(sel) {
  try { return [...document.querySelectorAll(sel)].find(visible) || null; } catch (e) { return null; }
}

function seal() {
  const p = document.getElementById('pack-dial');
  if (!p || !visible(p)) return null;
  const r = p.getBoundingClientRect();
  return { x: r.left - 10, y: r.top - 10, w: r.width + 20, h: r.height + 20 };
}

function hit(a, b) { return !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function dockXY() {
  const logo = document.querySelector('.mx-bee');
  const lr = logo && logo.isConnected ? logo.getBoundingClientRect() : null;
  if (lr && lr.width > 4 && lr.height > 4) {
    return { x: lr.left + (lr.width - BEE) / 2, y: lr.top + (lr.height - BEE) / 2 };
  }
  return { x: 16, y: 12 };
}

function moveBee(x, y, fly) {
  if (!bee) return;
  const dx = x - beeXY.x;
  beeXY = { x, y };
  bee.style.setProperty('--tx', Math.round(x) + 'px');
  bee.style.setProperty('--ty', Math.round(y) + 'px');
  if (!fly || still()) return;
  bee.classList.toggle('face-left', dx < -4);
  bee.classList.add('is-moving');
  const b = bee.querySelector('.bee');
  if (b) b.classList.add('is-flying');
  clearTimeout(flyTimer);
  flyTimer = setTimeout(() => {
    bee.classList.remove('is-moving');
    const bb = bee.querySelector('.bee');
    if (bb) bb.classList.remove('is-flying');
  }, 700);
}

function dock(fly) {
  const p = dockXY();
  moveBee(p.x, p.y, fly);
  if (bee) bee.classList.remove('face-left');
}

function build() {
  if (built) return;
  built = true;
  ensureCss();
  bee = el('<button type="button" class="tour-bee mx-only" id="tour-bee" title="Need help? Click the bee for a tour of this page" aria-label="Start the tour of this page"><span class="tour-bee-y"><span class="tour-bee-r">' + beeHtml({ size: BEE, flying: false, label: 'Tour bee' }) + '</span></span></button>');
  document.body.appendChild(bee);
  bee.addEventListener('click', ev => { ev.stopPropagation(); if (running) close(); else start(); });
  block = el('<div class="tour-block mx-only" hidden></div>');
  spot = el('<div class="tour-spot mx-only" hidden></div>');
  bubble = el('<div class="tour-bubble mx-only" role="dialog" aria-modal="false" aria-labelledby="tour-t" hidden>'
    + '<button type="button" class="tour-x" aria-label="Close the tour" title="Close (Esc)">' + lineSvg('x', 16) + '</button>'
    + '<b id="tour-t" class="tour-t"></b><p class="tour-p"></p>'
    + '<div class="tour-foot"><span class="tour-n"></span><span class="tour-grow"></span>'
    + '<button type="button" class="tour-back">Back</button><button type="button" class="tour-next">Next</button></div></div>');
  document.body.append(block, spot, bubble);
  bubble.querySelector('.tour-x').onclick = () => close();
  bubble.querySelector('.tour-back').onclick = () => go(idx - 1, -1);
  bubble.querySelector('.tour-next').onclick = () => (idx >= steps.length - 1 ? close() : go(idx + 1, 1));
  block.addEventListener('click', ev => ev.stopPropagation());
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', relayout);
  window.addEventListener('scroll', relayout, true);
  watchContext();
  dock(false);
}

function onKey(e) {
  if (!running) return;
  const k = e.key;
  if (k !== 'Escape' && k !== 'ArrowRight' && k !== 'ArrowLeft') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (k === 'Escape') close();
  else if (k === 'ArrowRight') { if (idx >= steps.length - 1) close(); else go(idx + 1, 1); }
  else go(idx - 1, -1);
}

function usable(list) { return (list || []).filter(st => find(st.sel)); }

export function start() {
  if (!active()) return 0;
  build();
  hideHint();
  const k = detectContext();
  const dlg = k === 'dialog' ? openDialog() : null;
  const list = usable(dlg ? dialogTour(dlg) : (TOURS[k] || TOURS.shell));
  if (!list.length) return 0;
  ctxKey = k || 'shell';
  steps = list;
  running = true;
  markSeen(ctxKey);
  document.documentElement.classList.add('tour-running');
  spot.classList.add('fresh');
  bubble.classList.add('fresh');
  block.hidden = false;
  spot.hidden = false;
  bubble.hidden = false;
  go(0, 1);
  return steps.length;
}

export function close() {
  if (!running) return;
  running = false;
  steps = [];
  document.documentElement.classList.remove('tour-running');
  if (block) block.hidden = true;
  if (spot) spot.hidden = true;
  if (bubble) bubble.hidden = true;
  dock(true);
}

function go(i, dir) {
  if (!running) return;
  let n = i;
  while (n >= 0 && n < steps.length && !find(steps[n].sel)) n += dir || 1;
  if (n < 0 || n >= steps.length) {
    if (dir < 0) return;
    close();
    return;
  }
  idx = n;
  const st = steps[idx];
  const t = find(st.sel);
  try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { return; }
  bubble.querySelector('.tour-t').textContent = st.title;
  bubble.querySelector('.tour-p').textContent = st.body;
  bubble.querySelector('.tour-n').textContent = (idx + 1) + ' / ' + steps.length;
  bubble.querySelector('.tour-back').hidden = idx === 0;
  const nx = bubble.querySelector('.tour-next');
  nx.textContent = idx >= steps.length - 1 ? 'Done' : 'Next';
  bubble.setAttribute('aria-label', (TOUR_NAMES[ctxKey] || 'Tour') + ' tour, step ' + (idx + 1) + ' of ' + steps.length);
  layout(t, true);
  try { nx.focus({ preventScroll: true }); } catch (e) { return; }
}

function relayout() {
  if (!built) return;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (running && steps[idx]) {
      const t = find(steps[idx].sel);
      if (t) layout(t, false);
    } else if (!running) {
      dock(false);
      if (hintEl && !hintEl.hidden) placeHint();
    }
  });
}

function rectOf(t) {
  const r = t.getBoundingClientRect();
  const x = Math.max(r.left, 0);
  const y = Math.max(r.top, 0);
  return { x, y, w: Math.max(8, Math.min(r.right, innerWidth) - x), h: Math.max(8, Math.min(r.bottom, innerHeight) - y) };
}

function layout(t, fly) {
  const r = rectOf(t);
  spot.style.left = (r.x - PAD) + 'px';
  spot.style.top = (r.y - PAD) + 'px';
  spot.style.width = (r.w + PAD * 2) + 'px';
  spot.style.height = (r.h + PAD * 2) + 'px';
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const vw = innerWidth;
  const vh = innerHeight;
  const sl = seal();
  const ok = (b, k) => b.x >= EDGE && b.y >= EDGE && b.x + bw <= vw - EDGE && b.y + bh <= vh - EDGE
    && k.x >= 4 && k.y >= 4 && k.x + BEE <= vw - 4 && k.y + BEE <= vh - 4
    && !hit({ x: b.x, y: b.y, w: bw, h: bh }, sl) && !hit({ x: k.x, y: k.y, w: BEE, h: BEE }, sl);
  const cy = clamp(r.y, EDGE + BEE * 0.4, vh - EDGE - bh);
  const cx = clamp(r.x + BEE * 0.7, EDGE + BEE * 0.7, vw - EDGE - bw);
  const cands = [];
  { const b = { x: r.x + r.w + PAD + GAP + BEE * 0.8, y: cy }; cands.push([b, { x: b.x - BEE * 0.9, y: b.y - BEE * 0.4 }]); }
  { const b = { x: r.x - PAD - GAP - BEE * 0.8 - bw, y: cy }; cands.push([b, { x: b.x + bw - BEE * 0.1, y: b.y - BEE * 0.4 }]); }
  { const b = { x: cx, y: r.y + r.h + PAD + GAP + BEE * 0.45 }; cands.push([b, { x: b.x - BEE * 0.7, y: b.y - BEE * 0.75 }]); }
  { const b = { x: cx, y: r.y - PAD - GAP - bh }; cands.push([b, { x: b.x - BEE * 0.7, y: b.y + bh - BEE * 0.35 }]); }
  let pick = cands.find(([b, k]) => ok(b, k));
  if (!pick) {
    const b = { x: clamp(r.x + r.w - bw - 28, EDGE + BEE, vw - EDGE - bw), y: clamp(r.y + r.h - bh - 28, EDGE + BEE, vh - EDGE - bh) };
    if (sl && hit({ x: b.x, y: b.y, w: bw, h: bh }, sl)) b.y = Math.max(EDGE + BEE, sl.y - bh - GAP);
    pick = [b, { x: b.x - BEE * 0.7, y: b.y - BEE * 0.75 }];
  }
  const [b, k] = pick;
  bubble.style.setProperty('--bx', Math.round(b.x) + 'px');
  bubble.style.setProperty('--by', Math.round(b.y) + 'px');
  moveBee(clamp(k.x, 4, vw - BEE - 4), clamp(k.y, 4, vh - BEE - 4), fly);
  if (spot.classList.contains('fresh')) requestAnimationFrame(() => requestAnimationFrame(() => { spot.classList.remove('fresh'); bubble.classList.remove('fresh'); }));
}

function hideHint() {
  clearTimeout(hintTimer);
  if (hintEl) hintEl.hidden = true;
  if (bee) bee.classList.remove('is-waving');
}

function placeHint() {
  const p = dockXY();
  const h = hintEl.offsetHeight || 44;
  hintEl.style.left = Math.round(p.x + BEE + 8) + 'px';
  hintEl.style.top = Math.round(clamp(p.y + BEE / 2 - h / 2, EDGE, innerHeight - EDGE - h)) + 'px';
}

export function hint(force) {
  if (!active() || running) return false;
  build();
  const k = detectContext();
  if (!k || !TOURS[k]) return false;
  if (!force && (read(K_HINT) === '1' || seen().includes(k) || hinted.has(k))) return false;
  if (!usable(TOURS[k]).length) return false;
  hinted.add(k);
  if (!hintEl) {
    hintEl = el('<div class="tour-hint mx-only" role="status" hidden><span>Need a tour?</span>'
      + '<button type="button" class="tour-hint-go">Show me</button>'
      + '<button type="button" class="tour-hint-x" aria-label="No thanks" title="No thanks">' + lineSvg('x', 14) + '</button></div>');
    document.body.appendChild(hintEl);
    hintEl.querySelector('.tour-hint-go').onclick = () => start();
    hintEl.querySelector('.tour-hint-x').onclick = () => { markSeen(detectContext()); hideHint(); };
  }
  hintEl.hidden = false;
  placeHint();
  if (!still()) {
    bee.classList.remove('is-waving');
    void bee.offsetWidth;
    bee.classList.add('is-waving');
  }
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 9000);
  return true;
}

function onContext() {
  ctxTimer = 0;
  const k = detectContext();
  if (k === lastCtx) return;
  lastCtx = k;
  if (running && k !== ctxKey) close();
  hideHint();
  if (!running) setTimeout(() => { if (detectContext() === k) hint(false); }, 900);
}

function watchContext() {
  if (!window.MutationObserver) return;
  const ping = () => { if (!ctxTimer) ctxTimer = setTimeout(onContext, 500); };
  const host = document.getElementById('content');
  if (host) new MutationObserver(ping).observe(host, { childList: true });
  const mo = new MutationObserver(ping);
  document.querySelectorAll('.modal').forEach(m => mo.observe(m, { attributes: true, attributeFilter: ['class'] }));
  ping();
}

function paintMenu() {
  const mi = document.getElementById('mx-bee-mi');
  if (mi) mi.innerHTML = lineSvg('help', 20) + ' Tour bee' + (beeOff() ? '' : '<span class="mx-mi-on">' + lineSvg('check', 16) + '</span>');
}

function addMenu() {
  const menu = document.querySelector('#dd-settings .hmenu');
  if (!menu || document.getElementById('mx-bee-mi')) return;
  const mi = el('<button class="hmi mx-only" id="mx-bee-mi" type="button" title="Show or hide the bee that gives a tour of each page"></button>');
  const after = document.getElementById('mx-modern-mi');
  if (after && after.parentNode === menu) after.after(mi); else menu.appendChild(mi);
  mi.onclick = () => { write(K_OFF, beeOff() ? null : '1'); apply(); };
  paintMenu();
}

function apply() {
  const on = active();
  document.documentElement.classList.toggle('tour-off', !on);
  paintMenu();
  if (!on) { close(); hideHint(); return; }
  build();
  dock(false);
}

function audit() {
  const k = detectContext();
  const list = TOURS[k] || TOURS.shell;
  return { context: k, total: list.length, found: list.filter(st => find(st.sel)).length, missing: list.filter(st => !find(st.sel)).map(st => st.sel) };
}

export function initTour(ctx) {
  USER = (ctx && ctx.user) || '';
  if (!USER) {
    fetch('/api/app-context', { credentials: 'same-origin' }).then(r => r.json()).then(me => { USER = (me && me.username) || ''; }).catch(() => {});
  }
  addMenu();
  apply();
  window.addEventListener('ui-modern', apply);
  window.edenTour = { start, close, hint, audit, context: detectContext };
}
