import { optionRow } from './honeycomb_option.js';
import { drop, latSvg } from './honeycomb_drop.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CELL = 26;
const LAG = 40;
const FAINT = 0.14;
const MIN_W = 140;
const MIN_H = 56;
const PREF = 'ui.cardfx';
const SQ3 = Math.sqrt(3);

const SEL = [
  '.dm-card', '.cm-card', '.cm-ecard', '.cm-modal', '.ct-card',
  '.gs-card', '.gs-panel', '.gs-list-card', '.gs-cardlist', '.gs-carddetail',
  '.hl-card', '.hl-listcard', '.hl-panel', '.pp-card', '.al-card', '.al-slotcard',
  '.op-card', '.op-dialog', '.hl-kpi', '.crx-kpi', '.ui-card', '.prf-filters', '.prf-player', '.prf-tablewrap', '.pa-form',
  '.fmr-root .fr-card', '.fmr-root .fr-panel', '.fmr-root .fmr-col[aria-label="Feature list"]',
  '.fmr-root .fmr-pcard', '.fmr-root .fmr-envcard', '.fmr-root .fmr-relhist', '.fmr-root .fmr-qcard',
  '.card', '.panel', '.dq', '.fx-card', '.pkgcard', '.clspanel', '.pd-panel', '.upd-card',
  '.sheet', '.tst', '.lg-card', '.aid-sec',
  '#tabbody > div:has(> .chcard)',
].join(',');

const states = new WeakMap();
const live = new Set();
const active = new Set();
const dirty = new Set();
const seen = new Set();
let enabled = false;
let raf = 0;
let sweepTimer = 0;
let last = 0;
let ro = null;
let hovering = 0;
let scrolled = false;
let scrollTimer = 0;
let radius = 69;

const rmMedia = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const noHover = window.matchMedia ? matchMedia('(hover: none)') : null;
const reduced = () => !!(rmMedia && rmMedia.matches);
const still = () => reduced() || !!(noHover && noHover.matches);

function tilePath() {
  const w = 3 * CELL;
  const h = SQ3 * CELL;
  const f = (n) => n.toFixed(2);
  const centers = [[0, 0], [1.5 * CELL, h / 2], [w, 0], [0, h], [w, h]];
  const d = [];
  centers.forEach(([cx, cy]) => {
    const v = [0, 1, 2, 3, 4, 5].map((i) => [cx + CELL * Math.cos((Math.PI / 3) * i), cy + CELL * Math.sin((Math.PI / 3) * i)]);
    v.forEach((a, i) => {
      const b = v[(i + 1) % 6];
      d.push(`M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`);
    });
  });
  return d.join('');
}

function ensureDefs() {
  if (document.getElementById('hc-defs')) return;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.id = 'hc-defs';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const n = Math.max(2, Math.round(CELL / 6));
  svg.innerHTML = `<defs><pattern id="hc-pat" patternUnits="userSpaceOnUse" width="${3 * CELL}" height="${(SQ3 * CELL).toFixed(3)}"><path d="${tilePath()}" fill="none" style="stroke:var(--hc-ink)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0 ${(CELL / n).toFixed(3)}"/></pattern></defs>`;
  document.body.appendChild(svg);
  const r = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hc-rad'));
  if (r > 0) radius = r;
}


function eligible(el) {
  if (!el.isConnected || el.closest('[data-no-honeycomb]')) return false;
  if (el.getAttribute('aria-busy') === 'true' || el.querySelector('.sk-g')) return false;
  return el.clientWidth >= MIN_W && el.clientHeight >= MIN_H;
}

function coverChildren(el) {
  const area = el.clientWidth * el.clientHeight;
  let sum = 0;
  const kids = [];
  for (const c of el.children) {
    if (c.classList.contains('hc-layer') || c.classList.contains('hc-rips')) continue;
    if (c.offsetWidth < 60 || c.offsetHeight < 30) continue;
    const cs = getComputedStyle(c);
    if (cs.position === 'absolute' || cs.position === 'fixed') continue;
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent') continue;
    sum += c.offsetWidth * c.offsetHeight;
    kids.push(c);
  }
  return sum >= area * 0.3 ? { kids, full: sum >= area * 0.7 } : null;
}

function place(s) {
  const tx = (s.cur.x - radius).toFixed(2);
  const ty = (s.cur.y - radius).toFixed(2);
  s.lens.style.transform = `translate3d(${tx}px,${ty}px,0)`;
  s.svg.style.transform = `translate3d(${-tx}px,${-ty}px,0)`;
}

function fit(s) {
  s.w = s.el.clientWidth;
  s.h = s.el.clientHeight;
  s.svg.setAttribute('width', s.w);
  s.svg.setAttribute('height', s.h);
  s.svg.style.width = s.w + 'px';
  s.svg.style.height = s.h + 'px';
}

function measure(s) {
  const r = s.el.getBoundingClientRect();
  s.left = r.left + s.el.clientLeft;
  s.top = r.top + s.el.clientTop;
}

function home(s) {
  fit(s);
  measure(s);
  s.cur = { x: s.w / 2, y: s.h / 2 };
  s.tgt = { x: s.w / 2, y: s.h / 2 };
  place(s);
}

function tick(now) {
  raf = 0;
  if (document.hidden) return;
  const k = 1 - Math.exp(-Math.min(64, now - last || 16) / LAG);
  last = now;
  active.forEach((s) => {
    s.cur.x += (s.tgt.x - s.cur.x) * k;
    s.cur.y += (s.tgt.y - s.cur.y) * k;
    place(s);
    if (Math.abs(s.tgt.x - s.cur.x) < 0.05 && Math.abs(s.tgt.y - s.cur.y) < 0.05) active.delete(s);
  });
  if (active.size) raf = requestAnimationFrame(tick);
}

function wake(s) {
  active.add(s);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function cool(s) {
  clearTimeout(s.coolTimer);
  s.coolTimer = setTimeout(() => {
    if (!s.hover) s.el.classList.remove('hc-live');
  }, 260);
}

function onEnter(e) {
  const s = states.get(e.currentTarget);
  if (!s || still() || e.pointerType === 'touch') return;
  measure(s);
  clearTimeout(s.coolTimer);
  s.hover = true;
  hovering++;
  const x = e.clientX - s.left;
  const y = e.clientY - s.top;
  s.el.classList.add('hc-live');
  if (!s.shown) {
    s.cur = { x, y };
    place(s);
  }
  s.shown = true;
  s.tgt = { x, y };
  s.lens.style.opacity = '1';
  wake(s);
}

function onMove(e) {
  const s = states.get(e.currentTarget);
  if (!s || !s.hover) return;
  if (scrolled) measure(s);
  s.tgt.x = e.clientX - s.left;
  s.tgt.y = e.clientY - s.top;
  if (!active.has(s)) wake(s);
}

function onLeave(e) {
  const s = states.get(e.currentTarget);
  if (!s || !s.hover) return;
  s.hover = false;
  hovering = Math.max(0, hovering - 1);
  s.shown = false;
  s.lens.style.opacity = String(FAINT);
  cool(s);
}

function onDown(e) {
  const s = states.get(e.currentTarget);
  if (!s) return;
  measure(s);
  if (!still()) drop(s, e.clientX - s.left, e.clientY - s.top);
}

function mount(s) {
  if (s.layer.parentNode !== s.el) s.el.prepend(s.layer);
  if (s.rips.parentNode !== s.el) s.el.appendChild(s.rips);
}

function attach(el) {
  if (states.has(el)) return;
  ensureDefs();
  const layer = document.createElement('i');
  layer.className = 'hc-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<i class="hc-lens">${latSvg(0, 0)}</i>`;
  const rips = document.createElement('i');
  rips.className = 'hc-rips';
  rips.setAttribute('aria-hidden', 'true');
  const lens = layer.firstChild;
  const s = { el, layer, lens, svg: lens.firstChild, rips, drops: [], hover: false, shown: false, coolTimer: 0, w: 0, h: 0, left: 0, top: 0, cur: null, tgt: null };
  states.set(el, s);
  live.add(s);
  el.classList.add('hc-card');
  if (getComputedStyle(el).position === 'static') el.classList.add('hc-rel');
  mount(s);
  home(s);
  lens.style.opacity = String(FAINT);
  el.addEventListener('pointerenter', onEnter, { passive: true });
  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerleave', onLeave, { passive: true });
  el.addEventListener('pointerdown', onDown, { passive: true });
  ro.observe(el);
}

function detach(el) {
  const s = states.get(el);
  if (!s) return;
  el.removeEventListener('pointerenter', onEnter);
  el.removeEventListener('pointermove', onMove);
  el.removeEventListener('pointerleave', onLeave);
  el.removeEventListener('pointerdown', onDown);
  ro.unobserve(el);
  clearTimeout(s.coolTimer);
  if (s.hover) hovering = Math.max(0, hovering - 1);
  s.drops.forEach((d) => d.anims.forEach((a) => a.cancel()));
  s.layer.remove();
  s.rips.remove();
  el.classList.remove('hc-card', 'hc-live', 'hc-rel');
  active.delete(s);
  live.delete(s);
  states.delete(el);
}

function refresh(el) {
  if (!enabled) return;
  const s = states.get(el);
  if (!eligible(el)) {
    if (s) detach(el);
    return;
  }
  const inner = coverChildren(el);
  if (inner) {
    inner.kids.forEach(refresh);
    if (inner.full) {
      if (s) detach(el);
      return;
    }
  }
  if (s) mount(s);
  else attach(el);
}

function sweep() {
  sweepTimer = 0;
  const nodes = Array.from(seen);
  seen.clear();
  const todo = new Set();
  nodes.forEach((n) => {
    if (!n.isConnected) return;
    const panel = n.matches('.op-appear') ? n : n.querySelector('.op-appear');
    if (panel) optionRow(panel, api);
    if (!enabled) return;
    if (n.matches(SEL)) todo.add(n);
    if (n.firstElementChild) n.querySelectorAll(SEL).forEach((c) => todo.add(c));
    const up = n.closest(SEL);
    if (up) todo.add(up);
  });
  if (!enabled) return;
  live.forEach((s) => {
    if (!s.el.isConnected) detach(s.el);
  });
  todo.forEach(refresh);
}

function plan() {
  if (sweepTimer) return;
  sweepTimer = window.requestIdleCallback ? requestIdleCallback(sweep, { timeout: 400 }) : setTimeout(sweep, 120);
}

function ours(n) {
  const c = n.classList;
  return c.contains('hc-layer') || c.contains('hc-rips') || c.contains('hc-rip') || c.contains('hc-lens');
}

function onMutations(list) {
  for (const rec of list) {
    const t = rec.target;
    if (t.nodeType !== 1 || ours(t) || t.closest('.hc-layer, .hc-rips')) continue;
    if (rec.addedNodes.length) {
      rec.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && !ours(n)) seen.add(n);
      });
    } else if (rec.removedNodes.length) seen.add(t);
  }
  if (seen.size) plan();
}

const api = { get enabled() { return enabled; }, set: (on) => setEnabled(!!on) };

function setEnabled(on, persist = true) {
  enabled = !!on;
  document.documentElement.dataset.cardfx = enabled ? 'on' : 'off';
  if (persist) {
    try {
      localStorage.setItem(PREF, enabled ? '1' : '0');
    } catch (e) {
      enabled = !!on;
    }
  }
  if (enabled) {
    document.querySelectorAll(SEL).forEach((c) => dirty.add(c));
    dirty.forEach(refresh);
    dirty.clear();
  } else {
    Array.from(live).forEach((s) => detach(s.el));
    active.clear();
    hovering = 0;
  }
  window.dispatchEvent(new CustomEvent('ui-cardfx'));
}

function stored() {
  try {
    return localStorage.getItem(PREF) !== '0';
  } catch (e) {
    return true;
  }
}

function boot() {
  if (document.documentElement.dataset.ui !== 'modern') return;
  ro = new ResizeObserver((entries) => {
    entries.forEach((en) => {
      const s = states.get(en.target);
      if (!s) {
        seen.add(en.target);
        plan();
      } else if (!eligible(en.target)) {
        detach(en.target);
      } else if (en.target.clientWidth !== s.w || en.target.clientHeight !== s.h) {
        if (s.hover) {
          fit(s);
          measure(s);
        } else home(s);
      }
    });
  });
  new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', () => {
    if (!hovering) return;
    scrolled = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrolled = false;
      live.forEach((s) => s.hover && measure(s));
    }, 120);
  }, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    live.forEach((s) => {
      if (s.hover) {
        s.hover = false;
        s.shown = false;
        s.lens.style.opacity = String(FAINT);
      }
      s.el.classList.remove('hc-live');
    });
    active.clear();
    hovering = 0;
  });
  document.querySelectorAll('.op-appear').forEach((p) => optionRow(p, api));
  window.edenCardFx = api;
  setEnabled(stored(), false);
}

if (document.body) boot();
else document.addEventListener('DOMContentLoaded', boot, { once: true });
