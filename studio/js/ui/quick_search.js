import { modernOn } from './modern_gate.js';
import { searchScope } from './search_scope.js';
import { navLine, lineSvg } from './line_icons.js';
import { openAssistant } from './assistant.js';

const HIST_KEY = 'reforged_search_history';
const MAC = (() => {
  try {
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
    return /mac|iphone|ipad/i.test(p);
  } catch (e) { return false; }
})();
const MOD = MAC ? '⌘' : 'Ctrl';

let root = null;
let items = [];
let sel = 0;
let timer = 0;
let abort = null;
let back = null;
let seq = 0;
let featNames = null;
let featLoad = null;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function shortcutLabel() { return MAC ? '⌘K' : 'Ctrl+K'; }

export function chipHtml() {
  return '<kbd class="mx-key">' + MOD + '</kbd><kbd class="mx-key">K</kbd>';
}

function recents() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]').filter(x => typeof x === 'string').slice(0, 6); } catch (e) { return []; }
}

function remember(q) {
  q = String(q || '').trim();
  if (q.length < 2) return;
  try {
    const old = JSON.parse(localStorage.getItem(HIST_KEY) || '[]').filter(x => String(x).toLowerCase() !== q.toLowerCase());
    old.unshift(q);
    localStorage.setItem(HIST_KEY, JSON.stringify(old.slice(0, 12)));
  } catch (e) {}
}

function norm(s) { return String(s).toLowerCase().replace(/[\s_-]+/g, ''); }

function pageLeaves() {
  return Array.from(document.querySelectorAll('.rl-leaf[data-k]')).map(b => ({ k: b.dataset.k, label: (b.getAttribute('title') || b.textContent || '').trim() })).filter(p => p.label);
}

async function featureList() {
  if (featNames) return featNames;
  if (featLoad) return featLoad;
  featLoad = (async () => {
    try {
      const r = await fetch('/api/features', { credentials: 'same-origin' });
      const j = await r.json();
      const names = (j.features || []).map(f => f.name).filter(Boolean);
      if (names.length) featNames = names;
      return names;
    } catch (e) { return []; } finally { featLoad = null; }
  })();
  return featLoad;
}

function build() {
  const el = document.createElement('div');
  el.className = 'qs-ov';
  el.innerHTML = '<div class="qs" role="dialog" aria-modal="true" aria-label="Quick search">' +
    '<div class="qs-in"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.2 3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
    '<input class="qs-q" type="text" autocomplete="off" spellcheck="false" placeholder="Search — name · ID · #1234 · fuzzy" aria-label="Search">' +
    '<kbd class="mx-key">Esc</kbd></div>' +
    '<div class="qs-list" role="listbox"></div>' +
    '<div class="qs-foot"><span><kbd class="mx-key">↑</kbd><kbd class="mx-key">↓</kbd> navigate</span><span><kbd class="mx-key">Enter</kbd> open</span><span><kbd class="mx-key">Esc</kbd> close</span></div></div>';
  return el;
}

const ASK_RX = /^(how|what|why|when|where|which|who|can|could|do|does|is|are|show|open|go|find|list|tell|give|deploy|install|restart|pull|check|combien|quoi|pourquoi|quand|ou|o\u00f9|quel|quelle|quels|quelles|qui|peux|peut|est|sont|montre|montre-moi|ouvre|va|trouve|cherche|liste|donne|d\u00e9ploie|deploie|installe|red\u00e9marre|redemarre|v\u00e9rifie|verifie)$/i;

function looksLikeQuestion(q) {
  const w = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return false;
  if (/\?\s*$/.test(q)) return true;
  return w.length >= 3 || (w.length >= 2 && ASK_RX.test(w[0]));
}

const ENT_LINE = { monster: 'creatures', item: 'items', npc: 'npcs', spell: 'game-systems', droptable: 'items', enchant: 'game-systems', scene: 'map' };

function rowIcon(r) {
  let h = '';
  if (r.type === 'page') h = navLine(r.k, 'file', 18);
  else if (r.type === 'entity') h = lineSvg(ENT_LINE[r.etype] || 'file', 18);
  else if (r.type === 'feature') h = lineSvg('features', 18);
  else if (r.type === 'recent') h = lineSvg('recent', 18);
  else if (r.type === 'assistant') h = lineSvg('sparkles', 18);
  return '<span class="qs-ic" aria-hidden="true">' + (h || lineSvg('file', 18)) + '</span>';
}

function paint(groups, emptyMsg) {
  const list = root.querySelector('.qs-list');
  items = [];
  let html = '';
  for (const g of groups) {
    if (!g.rows.length) continue;
    html += '<div class="qs-gh">' + esc(g.title) + '</div>';
    for (const r of g.rows) {
      r.i = items.length;
      items.push(r);
      html += '<div class="qs-row" role="option" data-i="' + r.i + '">' + rowIcon(r) +
        '<span class="qs-nm">' + r.name + '</span>' + (r.meta ? '<span class="qs-meta">' + esc(r.meta) + '</span>' : '') + (r.type === 'entity' || r.type === 'page' || r.type === 'assistant' ? '' : '<span class="qs-kind">' + esc(r.kind) + '</span>') + '</div>';
    }
  }
  if (!items.length) html = '<div class="qs-empty">' + esc(emptyMsg) + '</div>';
  list.innerHTML = html;
  sel = 0;
  mark();
}

function mark() {
  root.querySelectorAll('.qs-row').forEach(r => {
    const on = Number(r.dataset.i) === sel;
    r.classList.toggle('on', on);
    r.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) r.scrollIntoView({ block: 'nearest' });
  });
}

function hl(text, q) {
  const t = String(text);
  const i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
}

function pageRows(q, limit) {
  const nq = norm(q);
  return pageLeaves().filter(p => !nq || norm(p.label).includes(nq)).slice(0, limit).map(p => ({ type: 'page', k: p.k, name: hl(p.label, q), kind: 'Page' }));
}

function showIdle() {
  const rec = recents().map(q => ({ type: 'recent', q, name: esc(q), kind: 'Recent' }));
  paint([{ title: 'Recent searches', rows: rec }, { title: 'Pages and actions', rows: pageRows('', 6) }], 'Type to search creatures, items, NPCs, spells, features and pages');
}

function featuresNow() {
  if (featNames && featNames.length) return featNames;
  featNames = null;
  featureList().then(f => { if (!f.length) featNames = null; else if (root) onInput(); });
  return [];
}

function paintResults(q, list, feats) {
  const by = new Map();
  for (const m of list) {
    const label = m.label || m.etype || 'Other';
    if (!by.has(label)) by.set(label, []);
    by.get(label).push({ type: 'entity', etype: m.etype, id: m.id, name: hl(m.name, q), meta: '#' + m.id, color: m.swatch || m.color, kind: label });
  }
  const nq = norm(q);
  const fr = nq.length >= 2 ? feats.filter(n => norm(n).includes(nq)).slice(0, 6).map(n => ({ type: 'feature', name: hl(n, q), feat: n, kind: 'Feature' })) : [];
  const groups = [];
  if (looksLikeQuestion(q)) groups.push({ title: 'Assistant', rows: [{ type: 'assistant', q, name: 'Ask the assistant: ' + esc(q), kind: 'Assistant' }] });
  by.forEach((rows, title) => groups.push({ title: title, rows: rows.slice(0, 8) }));
  groups.push({ title: 'Features', rows: fr });
  groups.push({ title: 'Pages and actions', rows: pageRows(q, 5) });
  paint(groups, 'No result for "' + q + '"');
  if (items.length > 1 && items[0].type === 'assistant') { sel = 1; mark(); }
}

const memo = new Map();

async function run(q) {
  const my = ++seq;
  if (abort) abort.abort();
  abort = new AbortController();
  const hit = memo.get(q);
  if (hit) { paintResults(q, hit, featuresNow()); return; }
  const listEl = root.querySelector('.qs-list');
  if (!items.length && listEl) listEl.innerHTML = '<div class="qs-empty">Searching...</div>';
  let list = [];
  const slow = setTimeout(() => {
    if (my === seq && root && !items.length) root.querySelector('.qs-list').innerHTML = '<div class="qs-empty">Still searching, the game data is waking up...</div>';
  }, 1200);
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q) + '&limit=40', { signal: abort.signal, credentials: 'same-origin' });
    if (r.ok) {
      const j = await r.json();
      list = Array.isArray(j) ? j : (j.results || []);
      if (memo.size > 60) memo.clear();
      memo.set(q, list);
    }
  } catch (e) { if (e && e.name === 'AbortError') { clearTimeout(slow); return; } }
  clearTimeout(slow);
  if (my !== seq || !root) return;
  paintResults(q, list, featuresNow());
}

async function activate(it) {
  if (!it) return;
  const q = root.querySelector('.qs-q').value;
  if (it.type === 'recent') {
    root.querySelector('.qs-q').value = it.q;
    onInput();
    return;
  }
  remember(q);
  close(true);
  if (it.type === 'assistant') {
    openAssistant(it.q);
    return;
  }
  if (it.type === 'entity') {
    try {
      const m = await import('/studio/js/pages/record_modal.js');
      await m.openRecordModal(it.etype, it.id);
    } catch (e) {
      try { (await import('/studio/js/pages/entity.js')).openEntity(it.etype, it.id, true); } catch (e2) {}
    }
  } else if (it.type === 'feature') {
    if (typeof window.edenOpenFeature === 'function') window.edenOpenFeature(it.feat);
  } else if (it.type === 'page') {
    const b = document.querySelector('.rl-leaf[data-k="' + it.k + '"]');
    if (b) b.click();
  }
}

function onInput() {
  clearTimeout(timer);
  const q = root.querySelector('.qs-q').value.trim();
  if (!q) { seq++; showIdle(); return; }
  if (q.length < 2 && !/^\d+$/.test(q)) { seq++; return; }
  timer = setTimeout(() => run(q), 100);
}

function onKeydown(e) {
  if (!root) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    mark();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    activate(items[sel]);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    root.querySelector('.qs-q').focus();
  }
}

export function openQuickSearch(initial) {
  if (root) { root.querySelector('.qs-q').focus(); return; }
  back = document.activeElement;
  root = build();
  document.body.appendChild(root);
  const inp = root.querySelector('.qs-q');
  root.addEventListener('mousedown', e => { if (e.target === root) { e.preventDefault(); close(); } });
  root.addEventListener('keydown', onKeydown, true);
  inp.addEventListener('input', onInput);
  const list = root.querySelector('.qs-list');
  list.addEventListener('mousemove', e => {
    const r = e.target.closest('.qs-row');
    if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); mark(); }
  });
  list.addEventListener('click', e => {
    const r = e.target.closest('.qs-row');
    if (r) activate(items[Number(r.dataset.i)]);
  });
  inp.value = initial || '';
  requestAnimationFrame(() => root && root.classList.add('on'));
  inp.focus();
  if (inp.value) onInput(); else showIdle();
  featureList();
}

export function close(keepFocus) {
  if (!root) return;
  clearTimeout(timer);
  if (abort) abort.abort();
  seq++;
  root.remove();
  root = null;
  if (!keepFocus) { try { if (back && back.isConnected && back !== document.body && back.id !== 'q') back.focus({ preventScroll: true }); } catch (e) {} }
}

const SC_DELAY = 100;
let scTimer = 0;
let scChip = null;

function scopeInput() { return document.getElementById('q'); }

const PH_DEFAULT = 'Search name or ID';
const PH_MAX = 20;

function scopedPlaceholder(sc) {
  const own = String(sc.placeholder || '').trim();
  if (own && own.length <= PH_MAX) return own;
  return 'Search ' + String(sc.label || '').toLowerCase();
}

function renderChip(sc) {
  const box = document.querySelector('header .searchbox');
  const q = scopeInput();
  if (!box || !q) return;
  if (!q.dataset.ph) q.dataset.ph = PH_DEFAULT;
  if (!scChip) {
    scChip = document.createElement('span');
    scChip.className = 'sc-chip';
    scChip.innerHTML = '<span class="sc-chip-t"></span><button type="button" class="sc-chip-x" aria-label="Search everywhere" title="Search everywhere">&times;</button>';
    box.insertBefore(scChip, q);
    const x = scChip.querySelector('.sc-chip-x');
    x.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    x.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); scopeOff(); });
  }
  box.classList.toggle('sc-on', !!sc);
  scChip.hidden = !sc;
  if (sc) {
    scChip.querySelector('.sc-chip-t').textContent = sc.label;
    q.setAttribute('placeholder', scopedPlaceholder(sc));
  } else {
    q.setAttribute('placeholder', q.dataset.ph);
  }
  if (q.value) q.value = '';
}

function scopeOff() {
  const sc = searchScope.active();
  if (sc) { try { sc.onQuery(''); } catch (e) {} }
  searchScope.setOff(true);
  const q = scopeInput();
  if (q) q.focus();
}

function scoped() { return modernOn() && !!searchScope.active(); }

export function initQuickSearch() {
  document.addEventListener('keydown', e => {
    if (!modernOn() || !(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== 'k') return;
    e.preventDefault();
    if (root) { close(); return; }
    const q = scopeInput();
    if (scoped() && q) { q.focus(); q.select(); return; }
    openQuickSearch();
  });
  searchScope.subscribe(renderChip);
  const q0 = scopeInput();
  if (q0 && !scoped()) { q0.dataset.ph = PH_DEFAULT; q0.setAttribute('placeholder', PH_DEFAULT); }
  const box = document.querySelector('header .searchbox');
  if (!box) return;
  const hijack = e => {
    if (!modernOn() || scoped()) return;
    e.preventDefault();
    e.stopPropagation();
    openQuickSearch();
  };
  box.addEventListener('mousedown', hijack, true);
  box.addEventListener('click', hijack, true);
  const q = document.getElementById('q');
  if (!q) return;
  q.addEventListener('input', e => {
    if (!scoped()) return;
    e.stopImmediatePropagation();
    const sc = searchScope.active();
    const v = q.value;
    clearTimeout(scTimer);
    scTimer = setTimeout(() => { try { sc.onQuery(v.trim()); } catch (err) {} }, SC_DELAY);
  }, true);
  q.addEventListener('keydown', e => {
    if (!modernOn()) return;
    const sc = searchScope.active();
    if (sc) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        q.value = '';
        clearTimeout(scTimer);
        sc.onQuery('');
        return;
      }
      if (e.key === 'Backspace' && !q.value) { e.preventDefault(); scopeOff(); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') && sc.onKey) {
        clearTimeout(scTimer);
        sc.onQuery(q.value.trim());
        if (sc.onKey(e) !== false) e.preventDefault();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    openQuickSearch(e.key);
  }, true);
}
