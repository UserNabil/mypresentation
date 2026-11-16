import { modernOn } from './modern_gate.js';

let pop = null;
let cur = null;
let active = -1;
let typed = '';
let typedAt = 0;

const eligible = s => s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.disabled
  && !s.hasAttribute('data-native') && s.options.length > 0;

function close(refocus) {
  if (!pop) return;
  const s = cur;
  pop.remove();
  pop = null;
  cur = null;
  active = -1;
  if (s) s.setAttribute('aria-expanded', 'false');
  if (refocus && s) try { s.focus({ preventScroll: true }); } catch (e) { }
}

function items() {
  return pop ? Array.from(pop.querySelectorAll('.mxs-opt:not(.dis)')) : [];
}

function highlight(i, scroll) {
  const list = items();
  if (!list.length) return;
  active = (i + list.length) % list.length;
  list.forEach((n, k) => n.classList.toggle('hl', k === active));
  if (scroll !== false) list[active].scrollIntoView({ block: 'nearest' });
}

function pick(opt) {
  const s = cur;
  if (!s || !opt) return;
  const changed = s.value !== opt.value || s.selectedIndex !== opt.index;
  opt.selected = true;
  close(true);
  if (changed) {
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function build(s) {
  const root = document.createElement('div');
  root.className = 'mxs-pop';
  root.setAttribute('role', 'listbox');
  root.tabIndex = -1;
  root.addEventListener('pointerdown', e => e.stopPropagation());
  const add = (o, host) => {
    const n = document.createElement('div');
    n.className = 'mxs-opt' + (o.disabled ? ' dis' : '') + (o.selected ? ' on' : '');
    n.setAttribute('role', 'option');
    n.setAttribute('aria-selected', o.selected ? 'true' : 'false');
    n.textContent = o.textContent;
    n._opt = o;
    host.appendChild(n);
  };
  Array.from(s.children).forEach(c => {
    if (c.tagName === 'OPTGROUP') {
      const g = document.createElement('div');
      g.className = 'mxs-grp';
      g.textContent = c.label;
      root.appendChild(g);
      Array.from(c.children).forEach(o => add(o, root));
    } else if (c.tagName === 'OPTION') add(c, root);
  });
  return root;
}

function place(s) {
  const r = s.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  pop.style.minWidth = Math.max(r.width, 140) + 'px';
  pop.style.maxHeight = '';
  const below = vh - r.bottom - 12;
  const above = r.top - 12;
  const want = Math.min(pop.scrollHeight, 340);
  const up = below < Math.min(want, 180) && above > below;
  const room = Math.max(120, Math.min(340, up ? above : below));
  pop.style.maxHeight = room + 'px';
  const h = Math.min(pop.scrollHeight, room);
  pop.style.top = (up ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  const w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
}

function open(s) {
  close(false);
  cur = s;
  pop = build(s);
  document.body.appendChild(pop);
  s.setAttribute('aria-expanded', 'true');
  place(s);
  const list = items();
  const i = list.findIndex(n => n._opt.selected);
  highlight(i < 0 ? 0 : i);
}

function onDown(e) {
  if (!modernOn()) return;
  const t = e.target;
  if (pop && pop.contains(t)) return;
  const s = t.closest && t.closest('select');
  if (s && eligible(s) && e.button === 0) {
    e.preventDefault();
    try { s.focus({ preventScroll: true }); } catch (x) { }
    if (pop && cur === s) close(false); else open(s);
    return;
  }
  if (pop) close(false);
}

function onClickPop(e) {
  const n = e.target.closest && e.target.closest('.mxs-opt');
  if (!n || !pop || !pop.contains(n) || n.classList.contains('dis')) return;
  pick(n._opt);
}

function onHover(e) {
  const n = e.target.closest && e.target.closest('.mxs-opt');
  if (!n || n.classList.contains('dis')) return;
  const i = items().indexOf(n);
  if (i >= 0 && i !== active) highlight(i, false);
}

function typeahead(key) {
  const now = Date.now();
  typed = now - typedAt > 700 ? key : typed + key;
  typedAt = now;
  const list = items();
  const q = typed.toLowerCase();
  const from = typed.length === 1 ? active + 1 : active;
  for (let k = 0; k < list.length; k++) {
    const j = (from + k) % list.length;
    if (list[j].textContent.trim().toLowerCase().startsWith(q)) { highlight(j); return; }
  }
}

function onKey(e) {
  if (!modernOn()) return;
  if (pop) {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (k === 'Tab') { close(false); return; }
    if (k === 'ArrowDown') { e.preventDefault(); highlight(active + 1); return; }
    if (k === 'ArrowUp') { e.preventDefault(); highlight(active - 1); return; }
    if (k === 'Home') { e.preventDefault(); highlight(0); return; }
    if (k === 'End') { e.preventDefault(); highlight(items().length - 1); return; }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      const n = items()[active];
      if (n) pick(n._opt);
      return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(k); }
    return;
  }
  const s = e.target;
  if (!eligible(s)) return;
  if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown')) {
    e.preventDefault();
    open(s);
  }
}

export function initModernSelect() {
  if (window.__mxSelect) return;
  window.__mxSelect = true;
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', e => { if (pop && pop.contains(e.target)) onClickPop(e); }, true);
  document.addEventListener('mouseover', e => { if (pop && pop.contains(e.target)) onHover(e); }, true);
  window.addEventListener('resize', () => close(false));
  window.addEventListener('blur', () => close(false));
  document.addEventListener('scroll', e => { if (pop && !pop.contains(e.target)) close(false); }, true);
  window.addEventListener('ui-modern', () => close(false));
}
