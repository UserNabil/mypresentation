import { $ } from '../core/dom.js';
import { toast } from './toast.js';
import { kidsBoot, kidsRun, kidsSubscribe, kidsListHtml, kidsHandleClick } from '../pages/packaging_kids.js';
import { img } from '../pages/packaging_kids_prog.js';
import { lineSvg } from './line_icons.js';
import { modernOn } from './modern_gate.js';

const ITEMS = [
  { k: 'depack', label: 'Depack', icon: 'depack', lx: 'depack', ang: 176 },
  { k: 'pack', label: 'Pack', icon: 'packaging', lx: 'pack', ang: 128 },
  { k: 'repack', label: 'Repack', icon: 'repack', lx: 'repack', ang: 82 }
];
const DONE = { depack: 'Depack done', pack: 'Pack done', repack: 'Repack done' };
const R = 122;
const CLOSE_MS = 250;
const TICK_MS = 4000;

let root = null;
let open = false;
let closeTimer = 0;
let lastPointer = 'mouse';
let prevRun = null;
let ticks = {};
let snap = null;
let doneUntil = 0;

function pinned() {
  return !!(snap && (snap.run || snap.listOpen));
}

function setOpen(v) {
  open = v;
  if (!root) return;
  root.classList.toggle('open', v || pinned());
  const seal = $('#fab-pack');
  if (seal) seal.setAttribute('aria-expanded', v || pinned() ? 'true' : 'false');
}

function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { if (!pinned()) setOpen(false); }, CLOSE_MS);
}

function keepOpen() {
  clearTimeout(closeTimer);
  setOpen(true);
}

const SEAL = '/studio/img/ui/';
const MAIN_FB = '/studio/img/ui/btn_create_fab.png';

const failed = new Set();

function sealImg(file, fb) {
  const bad = failed.has(file);
  return '<img class="pd-seal' + (bad ? ' fb' : '') + '" data-file="' + file + '" src="' + (bad ? fb : SEAL + file) + '" data-fb="' + fb + '" width="72" height="72" alt="" draggable="false">';
}

function itemHtml(it, S) {
  const run = S.run === it.k;
  const tick = ticks[it.k] && !run;
  const dis = S.run && !run;
  const x = Math.round(R * Math.cos(it.ang * Math.PI / 180));
  const y = Math.round(-R * Math.sin(it.ang * Math.PI / 180));
  const p = run ? pct(S) : 0;
  const ring = run ? '<span class="pd-iring' + (p < 0 ? ' ind' : '') + '" style="--p:' + (p < 0 ? 30 : p) + '"></span><span class="pd-ipct">' + (p < 0 ? '…' : Math.round(p) + '%') + '</span>' : '';
  const mx = modernOn();
  const lx = mx ? '<span class="pd-lx">' + lineSvg(it.lx, 24) + '</span>' : '';
  const tk = tick ? (mx ? '<span class="pd-tick-lx">' + lineSvg('check', 14) + '</span>' : '<img class="pd-tick" src="/studio/icons/icons/128/success.png" width="26" height="26" alt="">') : '';
  return '<div class="pd-item' + (run ? ' run' : '') + '" style="--x:' + x + 'px;--y:' + y + 'px"><button type="button" class="pd-btn" data-k="' + it.k + '" ' + (dis ? 'disabled' : '') + ' aria-label="' + it.label + '">'
    + lx + sealImg('seal_' + it.k + '.png', '/studio/icons/icons/128/' + it.icon + '.png') + ring
    + tk + '</button><span class="pd-lab">' + it.label + '</span></div>';
}

function lxMain() {
  const seal = $('#fab-pack');
  const m = $('#pd-main');
  if (!seal || !modernOn()) return;
  let s = seal.querySelector('.pd-lx');
  if (!s) { s = document.createElement('span'); s.className = 'pd-lx'; seal.prepend(s); }
  const n = m && m.dataset.f === 'seal_done.png' ? 'check' : 'packaging';
  if (s.dataset.n !== n) { s.dataset.n = n; s.innerHTML = lineSvg(n, 24); }
}

function setMain(file) {
  const m = $('#pd-main');
  if (!m || m.dataset.f === file) return;
  m.dataset.f = file;
  m.dataset.fb = MAIN_FB;
  m.dataset.tried = '';
  m.src = failed.has(file) ? MAIN_FB : SEAL + file;
}

function pct(S) {
  if (!S.run) return -1;
  const f = S.feed && S.feed.key === S.run ? S.feed : null;
  const p = f && f.pct >= 0 ? f.pct : S.pct;
  return p < 0 ? -1 : Math.max(0, Math.min(100, p));
}

function finishWatch(S) {
  const run = S.run || null;
  if (prevRun && !run) {
    const k = prevRun;
    if (S.st[k] === 'ok') {
      ticks[k] = true;
      doneUntil = Date.now() + TICK_MS;
      setTimeout(() => { delete ticks[k]; if (snap) paint(snap); }, TICK_MS + 50);
      toast(DONE[k], 'ok');
    } else if (S.st[k] === 'bad') {
      toast((S.err[k] || (k + ' failed')), 'error');
    }
  }
  prevRun = run;
}

function paint(S) {
  if (!root) return;
  snap = S;
  const p = pct(S);
  const seal = $('#fab-pack');
  root.classList.toggle('busy', !!S.run);
  root.classList.toggle('listing', !!(S.listOpen && !S.run));
  root.style.setProperty('--p', p < 0 ? 0 : p);
  const lab = $('#pd-pct');
  if (lab) lab.textContent = S.run ? (p < 0 ? '…' : Math.round(p) + '%') : '';
  setMain(S.run ? 'seal_busy.png' : (Date.now() < doneUntil ? 'seal_done.png' : 'seal_packing.png'));
  $('#pd-fan').innerHTML = ITEMS.map(it => itemHtml(it, S)).join('');
  const panel = $('#pd-panel');
  const showList = S.listOpen && !S.run && S.files && S.files.length;
  panel.hidden = !showList;
  if (showList) {
    const old = panel.querySelector('.k-list');
    const top = old ? old.scrollTop : 0;
    panel.innerHTML = '<div class="pd-ph">' + img('repack', 40) + '<span>Pick which ones go back</span></div>' + kidsListHtml();
    const nl = panel.querySelector('.k-list');
    if (nl) nl.scrollTop = top;
  }
  if (seal) seal.title = S.run ? 'Packing: working' : 'Packing';
  root.classList.toggle('open', open || pinned());
  if (seal) seal.setAttribute('aria-expanded', open || pinned() ? 'true' : 'false');
  lxMain();
}

function onState(S) {
  finishWatch(S);
  paint(S);
}

export function initPackDial() {
  root = $('#pack-dial');
  if (!root) return;
  root.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset.fb && !t.dataset.tried) {
      t.dataset.tried = '1';
      if (t.dataset.file) failed.add(t.dataset.file);
      if (t.id === 'pd-main') failed.add(t.dataset.f);
      t.classList.add('fb');
      t.src = t.dataset.fb;
    }
  }, true);
  const seal = $('#fab-pack');
  const m0 = $('#pd-main');
  if (m0 && m0.complete && m0.naturalWidth === 0) { failed.add(m0.dataset.f); m0.dataset.tried = '1'; m0.src = MAIN_FB; }
  root.addEventListener('mouseenter', keepOpen);
  root.addEventListener('mouseleave', scheduleClose);
  root.addEventListener('focusin', keepOpen);
  root.addEventListener('focusout', scheduleClose);
  seal.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; });
  seal.addEventListener('click', e => {
    if (lastPointer === 'touch' || e.detail === 0) setOpen(!open);
    else keepOpen();
    lastPointer = 'mouse';
  });
  $('#pd-fan').addEventListener('click', e => {
    const b = e.target.closest('.pd-btn');
    if (!b || b.disabled) return;
    keepOpen();
    kidsRun(b.dataset.k);
  });
  $('#pd-panel').addEventListener('click', e => kidsHandleClick(e));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open && !pinned()) { setOpen(false); seal.blur(); }
  });
  kidsSubscribe(onState);
  kidsBoot().catch(() => {});
  lxMain();
  window.addEventListener('ui-modern', () => { if (snap) paint(snap); else lxMain(); });
}
