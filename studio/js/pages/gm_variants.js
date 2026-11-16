import { $ } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { GMV_CSS } from './gm_variants_css.js';
import { S, byKey, cmdsOf, filtered, compose, full, more } from './gm_variants_ui.js';
import { VIEW } from './gm_variants_views.js';

let root = null, copyTimer = 0;

const load = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
const save = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} };

function render() {
  if (!root) return;
  const a = document.activeElement, id = a && root.contains(a) ? a.id : '';
  const s = id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  root.innerHTML = VIEW() + more(cmdsOf().length, filtered().length);
  $('#gm-count').textContent = filtered().length + ' / ' + cmdsOf().length + ' commands';
  const el = id && root.querySelector('#' + id);
  if (el) { el.focus(); if (s) el.setSelectionRange(s[0], s[1]); }
}

function select(c) {
  S.sel = c;
  S.vals = [];
  S.copied = false;
  S.raw = compose();
  if (c) {
    const k = c.src + ':' + c.name;
    S.recent = [k].concat(S.recent.filter(x => x !== k)).slice(0, 8);
    save('gm.recent', S.recent);
  }
}

async function copyText(t, fallback) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) { toast('clipboard blocked — select the text and Ctrl+C', 'warn'); if (fallback) fallback(); return false; }
}

async function doCopy() {
  const ok = await copyText(S.raw, () => { S.more = true; render(); const r = $('#gmv-raw'); if (r) r.select(); });
  if (!ok) return;
  toast('copied — paste it in the game chat');
  S.copied = true;
  render();
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { S.copied = false; render(); }, 2200);
}

function click(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'cat') { S.cat = t.dataset.c; render(); }
  else if (act === 'pick') {
    const c = byKey(t.dataset.k);
    select(c);
    render();
    const f = root.querySelector('#gmv-f0');
    if (f) f.focus();
  }
  else if (act === 'fav') {
    const k = S.sel.src + ':' + S.sel.name;
    S.fav = S.fav.includes(k) ? S.fav.filter(x => x !== k) : [k].concat(S.fav);
    save('gm.fav', S.fav);
    render();
  }
  else if (act === 'more') { S.more = !S.more; render(); }
  else if (act === 'copy') doCopy();
  else if (act === 'rowcopy') {
    e.stopPropagation();
    const c = byKey(t.dataset.k);
    copyText(full(c), () => { select(c); render(); }).then(ok => { if (ok) toast('copied — paste it in the game chat'); });
  }
}

function input(e) {
  const t = e.target;
  if (t.id === 'gmv-q') { S.q = t.value; render(); }
  else if (t.id === 'gmv-raw') { S.raw = t.value; const p = $('#gmv-prev'); if (p) p.textContent = S.raw; }
  else if (t.dataset.i != null) {
    S.vals[+t.dataset.i] = t.value;
    S.raw = compose();
    const p = $('#gmv-prev'), r = $('#gmv-raw');
    if (p) p.textContent = S.raw;
    if (r) r.value = S.raw;
    if (S.copied) { S.copied = false; render(); }
  }
}

function mount() {
  if (root) return;
  const st = document.createElement('style');
  st.textContent = GMV_CSS;
  document.head.appendChild(st);
  const body = $('#gmmodal .body');
  root = document.createElement('div');
  root.id = 'gmv-root';
  root.onclick = click;
  root.oninput = input;
  body.prepend(root);
  S.fav = load('gm.fav');
  S.recent = load('gm.recent');
}

export function gmvOpen(data) {
  S.data = data;
  mount();
  $('#gmmodal').classList.add('gmv-on');
  render();
}
