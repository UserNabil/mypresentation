import { $, esc } from '../core/dom.js';
import { fmReactAvailable } from './feature_manager_react.js';
import { img, progHtml, syncAnims } from './packaging_kids_prog.js';

const KEYS = ['depack', 'pack', 'repack'];
const ICON = { depack: 'depack', pack: 'packaging', repack: 'repack' };
const TXT = { depack: ['Depack', 'Take the files out'], pack: ['Pack', 'Put all changes back'], repack: ['Repack', 'Pick which ones go back'] };
const CAP = 200;
const FAKE = [['data\\db\\c_item.ini', 'changed'], ['data\\db\\c_skill.ini', 'changed'], ['data\\db\\c_npc.ini', 'changed'], ['UIData\\layouts\\Talk.layout', 'changed'],
  ['UIData\\layouts\\Shop.layout', 'changed'], ['UIData\\imagesets\\Chat.png', 'added'], ['UIData\\imagesets\\Chat.imageset', 'added'], ['sound\\bgm\\town.ogg', 'added']];
const SIMNAMES = ['data\\db\\c_item.ini', 'data\\db\\c_skill.ini', 'UIData\\layouts\\Talk.layout', 'UIData\\imagesets\\Chat.png', 'model\\char\\human\\body_01.nif', 'sound\\bgm\\town.ogg'];

let avail = false;
let raf = 0;
let S = null;
let simTimer = 0;
let built = false;
const listeners = new Set();
const realMode = /[?&]pkgreal=1/.test(location.search);

function fresh() {
  return { st: { depack: '', pack: '', repack: '' }, err: {}, count: {}, run: null, pct: -1, prevRun: null, pending: null, snap: '',
    listOpen: false, noChanges: false, files: [], rfg: null, feed: null, sim: null, simList: false, rfgForm: false };
}

const chip = (k, t) => '<span class="k-chip ' + k + '">' + img({ ok: 'success', todo: 'warning', bad: 'error' }[k], 22) + esc(t) + '</span>';

function readProg(k) {
  const w = $('#pkg-' + k + '-prog');
  if (!w || !w.classList.contains('on')) return null;
  const bar = w.querySelector('.pkgbar'), fill = w.querySelector('.pkgbar>i');
  return { pct: bar && bar.classList.contains('indet') ? -1 : parseFloat((fill && fill.style.width) || '0') || 0 };
}
function resOf(k) { return $('#pkg-' + k + '-res'); }
function hasContent(k) { const r = resOf(k); return !!(r && r.querySelector('.ok,.err,.warn,.rpk-inc')); }

function readFiles() {
  const out = [];
  document.querySelectorAll('#pkg-repack-res .rpk-inc').forEach(cb => {
    const box = cb.closest('.rpk-box');
    const tog = box && box.parentElement && box.parentElement.querySelector('.rpk-tog');
    const sp = cb.nextElementSibling;
    out.push({ cb, path: sp && sp.firstChild ? sp.firstChild.textContent.trim() : '', kind: tog && tog.dataset.k === 'added' ? 'added' : 'changed', on: cb.checked });
  });
  return out;
}

function readRfg() {
  const box = $('#rpk-rfg');
  const note = box && box.querySelector('.note');
  return note ? { keyBad: !!box.querySelector('.err') } : null;
}

function finish(k) {
  const r = resOf(k);
  S.pending = null;
  if (k === 'repack' && r.querySelector('.rpk-inc')) { S.listOpen = true; S.noChanges = false; return; }
  if (k === 'repack' && /nothing to repack/i.test(r.textContent || '')) { S.noChanges = true; S.listOpen = false; return; }
  const e = r.querySelector('.err');
  if (e) { S.st[k] = 'bad'; S.err[k] = e.textContent.replace(/^[^\w]+/, '').trim().slice(0, 160); return; }
  const m = /(\d[\d,]*)\s+file/.exec(r.textContent || '');
  S.st[k] = 'ok'; S.err[k] = ''; S.count[k] = m ? m[1] : '';
  if (k === 'repack') { S.listOpen = false; S.noChanges = false; }
}

function sync() {
  raf = 0;
  if (!S) return;
  let run = null, p = null;
  if (S.sim) run = S.sim.key;
  else for (const k of KEYS) { p = readProg(k); if (p) { run = k; break; } }
  S.run = run;
  if (p) S.pct = p.pct;
  let fin = null;
  if (!S.sim) {
    if (S.prevRun && !run) fin = S.prevRun;
    else if (S.pending && !run && hasContent(S.pending) && resOf(S.pending).innerHTML !== S.snap) fin = S.pending;
  }
  S.prevRun = S.sim ? null : run;
  if (fin) finish(fin);
  if (S.simList && !S.sim) { const h = $('#pk-kids'); if (!h || !h.offsetParent) { S.simList = false; S.listOpen = false; } }
  if (!S.simList) S.files = readFiles();
  if (!S.simList && S.listOpen && !S.files.length && !run) S.listOpen = false;
  S.rfg = S.simList ? { keyBad: false } : readRfg();
  render();
}
function emit() {
  listeners.forEach(f => { try { f(S); } catch (e) { return; } });
}
function schedule() { if (!raf) raf = requestAnimationFrame(sync); }

function onStatus(e) {
  if (!S || !e.detail) return;
  const { key, j } = e.detail;
  const lv = (j && j.live) || {};
  let done = (j && j.done) || 0, total = (j && j.total) || 0, pct = -1;
  if (key !== 'depack') {
    done = lv.files_done || done; total = lv.files_total || total;
    if (lv.bytes_total) pct = 100 * (lv.bytes_done || 0) / lv.bytes_total;
  }
  if (pct < 0 && total) pct = 100 * done / total;
  S.feed = { key, done, total, pct };
  schedule();
}

function act(k) {
  if (S.run || S.sim) return;
  S.pending = k; S.noChanges = false; S.feed = null; S.err[k] = ''; S.st[k] = '';
  const r = resOf(k);
  S.snap = r ? r.innerHTML : '';
  $(k === 'repack' ? '#pkg-preview-btn' : '#pkg-' + k + '-btn').click();
  schedule();
}

export function kidsListHtml() {
  const f = S.files;
  const allOn = f.every(x => x.on);
  const n = f.filter(x => x.on).length;
  let h = '<div class="g-list"><div class="k-selall" data-all="1"><span class="k-ck ' + (allOn ? 'on' : '') + '">' + (allOn ? '✓' : '') + '</span>All ' + f.length + '</div><div class="k-list">';
  h += f.slice(0, CAP).map((x, i) => '<div class="k-li" data-i="' + i + '"><span class="k-ck ' + (x.on ? 'on' : '') + '">' + (x.on ? '✓' : '') + '</span><span class="nm" title="' + esc(x.path) + '">' + esc(x.path) + '</span><span class="k-tag ' + (x.kind === 'added' ? 'new">new' : 'chg">changed') + '</span></div>').join('');
  if (f.length > CAP) h += '<div class="k-more">+ ' + (f.length - CAP) + ' more, all included</div>';
  return h + '</div><div class="g-lacts"><button class="sbtn k-act" data-go="1" ' + (n ? '' : 'disabled') + '>Repack ' + n + ' files</button><button class="sbtn ghost" data-back="1">Cancel</button></div></div>';
}

function rfgHtml() {
  if (!S.rfg) return '';
  if (!S.rfg.keyBad) return '<span class="k-chip rfg">RFG 8.x</span>';
  return '<span class="k-chip bad">' + img('error', 22) + 'RFG key missing</span>'
    + (S.rfgForm ? '<span class="g-rfgf"><input id="pk-rfgkey" type="password" autocomplete="off" placeholder="RFG key"><button class="sbtn" data-rfgsave="1">Save key</button></span>' : '<button class="sbtn ghost" data-rfg="1">Set RFG key</button>');
}

function obj(k, i) {
  const run = S.run === k;
  const ok = S.st[k] === 'ok' || (k === 'repack' && S.noChanges);
  const [n, t] = TXT[k];
  let chips = '';
  if (ok) chips += chip('ok', k === 'repack' && S.noChanges ? 'Nothing to repack' : (S.count[k] ? S.count[k] + ' files' : 'Done'));
  else if (S.st[k] === 'bad') chips += chip('bad', 'Failed');
  else if (k === 'repack' && S.files.length) chips += chip('todo', S.files.length + ' changed');
  if (k === 'repack') chips += rfgHtml();
  const err = S.st[k] === 'bad' && S.err[k] ? '<div class="k-err">' + esc(S.err[k]) + '</div>' : '';
  const dim = S.run && !run ? 'k-dim' : '';
  const ic = run ? progHtml(S, ICON[k]) : img(ICON[k], 72);
  const btn = run ? '' : '<button class="sbtn k-act" data-act="' + k + '">' + n + '</button>';
  const list = k === 'repack' && S.listOpen && !S.run ? kidsListHtml() : '';
  return '<div class="g-obj ' + (ok ? 'done' : '') + ' ' + (run ? 'run' : '') + ' ' + dim + '"><div class="g-orow"><span class="g-ob">' + (ok ? '✓' : i) + '</span><div class="g-oic">' + ic + '</div>'
    + '<div class="g-otx"><div class="g-ot">' + n + '</div><div class="g-os">' + t + '</div><div class="g-chips">' + chips + '</div>' + err + '</div>' + btn + '</div>' + list + '</div>';
}

function render() {
  const host = $('#pk-kids');
  emit();
  if (!host) return;
  const sim = avail ? '<div class="g-sim">▶ Simulate <button data-sim="depack">Depack</button><button data-sim="pack">Pack</button><button data-sim="repack">Repack</button></div>' : '';
  const sc = host.querySelector('.k-list');
  const top = sc ? sc.scrollTop : 0;
  host.innerHTML = '<div class="g-quest">'
    + obj('depack', 1) + obj('pack', 2) + obj('repack', 3) + sim + '</div>';
  const nl = host.querySelector('.k-list');
  if (nl) nl.scrollTop = top;
  syncAnims(host);
}

function toggle(i) {
  const f = S.files[i];
  if (!f) return;
  if (f.cb) { f.cb.checked = !f.cb.checked; f.cb.dispatchEvent(new Event('change')); } else f.on = !f.on;
  schedule();
}

function simFeed(key, p, total) {
  const done = Math.round(total * p);
  const name = SIMNAMES[done % SIMNAMES.length];
  const j = key === 'depack' ? { running: true, done, total, cur: name }
    : { running: true, done, total, live: { phase: 'writing', files_done: done, files_total: total, bytes_done: Math.round(48e6 * p), bytes_total: 48e6, folder: name } };
  window.dispatchEvent(new CustomEvent('pkg-status', { detail: { key, j } }));
}

function runSim(key) {
  if (simTimer) clearInterval(simTimer);
  const total = key === 'depack' ? 3240 : key === 'pack' ? 120 : Math.max(1, S.files.filter(x => x.on).length) * 14;
  let i = 0;
  S.listOpen = false; S.noChanges = false; S.feed = null; S.sim = { key }; S.st[key] = '';
  simFeed(key, 0, total);
  simTimer = setInterval(() => {
    i++;
    simFeed(key, Math.min(1, i / 54), total);
    if (i >= 54) {
      clearInterval(simTimer); simTimer = 0;
      S.sim = null; S.st[key] = 'ok'; S.err[key] = ''; S.count[key] = String(total);
      S.simList = false; S.feed = null; S.files = [];
    }
    schedule();
  }, 150);
  schedule();
}

function simStart(key) {
  if (!S || S.sim || S.run) return;
  S.feed = null;
  if (key === 'repack') {
    S.files = FAKE.map(x => ({ cb: null, path: x[0], kind: x[1], on: true }));
    S.simList = true; S.listOpen = true; schedule(); return;
  }
  S.simList = false; runSim(key);
}

export function kidsHandleClick(e) {
  const t = e.target;
  const a = t.closest('[data-act]');
  if (a) { act(a.dataset.act); return; }
  const s = t.closest('[data-sim]');
  if (s) { simStart(s.dataset.sim); return; }
  if (t.closest('[data-rfg]')) { S.rfgForm = true; render(); return; }
  if (t.closest('[data-rfgsave]')) {
    const v = ($('#pk-rfgkey') || {}).value || '';
    const k = $('#rpk-rfg-key'), b = $('#rpk-rfg-save');
    if (v && k && b) { k.value = v; b.click(); S.rfgForm = false; schedule(); }
    return;
  }
  if (t.closest('[data-back]')) { S.listOpen = false; S.simList = false; S.files = []; schedule(); return; }
  if (t.closest('[data-go]')) {
    if (S.simList) { runSim('repack'); return; }
    $('#pkg-repack-btn').click(); schedule(); return;
  }
  if (t.closest('[data-all]')) {
    const on = !S.files.every(x => x.on);
    S.files.forEach(x => { if (x.cb) x.cb.checked = on; else x.on = on; });
    const f = S.files[0];
    if (f && f.cb) f.cb.dispatchEvent(new Event('change'));
    schedule(); return;
  }
  const li = t.closest('.k-li');
  if (li) toggle(+li.dataset.i);
}

function buildShell() {
  const body = $('#pkgmodal .body');
  if (!body || built) return;
  built = true;
  const sub = $('#pkgmodal h2 span');
  if (sub) sub.style.display = 'none';
  const kids = document.createElement('div');
  kids.id = 'pk-kids';
  kids.onclick = kidsHandleClick;
  const wrap = document.createElement('div');
  wrap.id = 'pk-classic';
  while (body.firstChild) wrap.appendChild(body.firstChild);
  body.append(kids, wrap);
  new MutationObserver(schedule).observe(wrap, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'disabled'] });
  window.addEventListener('pkg-status', onStatus);
}

export async function kidsOnOpen() {
  buildShell();
  if (!S) S = fresh();
  sync();
  try { avail = await fmReactAvailable(); } catch (e) { avail = false; }
  schedule();
}

export const kidsBoot = kidsOnOpen;

export function kidsSubscribe(fn) {
  listeners.add(fn);
  if (S) fn(S);
  return () => listeners.delete(fn);
}

export function kidsRun(key) {
  if (!S) return;
  if (avail && !realMode) simStart(key);
  else act(key);
}
