/* Launch confirmation with display options (window mode, resolution, frame cap, graphics quality).
   Values are read from the packed client's client.ini by /api/launch/target and written back by /api/launch
   only when they differ from the file. Resolves null on Cancel, else the body to POST to /api/launch. */

import { setupVariants, syncVariants } from './launch_variants.js';
import { lineSvg } from './line_icons.js';

const QLABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Keep current (custom)' };
let _resolve = null;
let _base = null;

const $ = s => document.querySelector(s);

function _opt(value, label, selected) {
  const o = document.createElement('option');
  o.value = value; o.textContent = label; if (selected) o.selected = true;
  return o;
}

function _screenSize() {
  try {
    const r = window.devicePixelRatio || 1;
    return [Math.round(screen.width * r), Math.round(screen.height * r)];
  } catch (_) { return [0, 0]; }
}

function _fillRes(d) {
  const sel = $('#lm-res'); sel.innerHTML = '';
  const cur = (d.width && d.height) ? d.width + 'x' + d.height : '';
  const [sw, sh] = _screenSize();
  const native = (sw && sh) ? sw + 'x' + sh : '';
  const list = (d.resolutions || []).filter(r => {
    if (!sw || !sh) return true;
    const [w, h] = r.split('x').map(Number);
    return w <= sw && h <= sh;
  });
  if (native && !list.includes(native)) list.push(native);
  if (cur && !list.includes(cur)) list.push(cur);
  list.sort((a, b) => { const [aw, ah] = a.split('x').map(Number), [bw, bh] = b.split('x').map(Number); return aw * ah - bw * bh || aw - bw; });
  for (const r of list) {
    const tags = [];
    if (r === native) tags.push('screen');
    if (r === cur) tags.push('current');
    sel.appendChild(_opt(r, r.replace('x', ' × ') + (tags.length ? '  (' + tags.join(', ') + ')' : ''), r === (cur || native)));
  }
}

function _fillFps(d) {
  const sel = $('#lm-fps'); sel.innerHTML = '';
  const list = [...(d.fps_choices || [30, 60, 120, 144])];
  if (d.fps && !list.includes(d.fps)) list.push(d.fps);
  list.sort((a, b) => a - b);
  for (const f of list) sel.appendChild(_opt(String(f), f + ' FPS' + (f === d.fps ? '  (current)' : ''), f === (d.fps || 60)));
}

function _fillQuality(d) {
  const sel = $('#lm-quality'); sel.innerHTML = '';
  const cur = d.quality || 'custom';
  if (cur === 'custom') sel.appendChild(_opt('custom', QLABEL.custom, true));
  for (const q of (d.qualities || ['low', 'medium', 'high', 'ultra']))
    sel.appendChild(_opt(q, QLABEL[q] + (q === cur ? '  (current)' : ''), q === cur));
}

function _done(v) {
  $('#launchModal').classList.remove('open');
  const r = _resolve; _resolve = null;
  if (r) r(v);
}

function _count() {
  const n = Number($('#lm-count').value) || 1;
  try { localStorage.setItem('launch.count', String(n)); } catch (_) { }
  return Math.min(6, Math.max(1, n));
}

function _collect() {
  const body = { env: _env };
  const n = _count();
  if (n > 1) body.count = n;
  if (!_base) return body;
  const fs = $('#lm-mode').value === 'full';
  if (fs !== _base.fullscreen) body.fullscreen = fs;
  const res = $('#lm-res').value;
  if (res) {
    const [w, h] = res.split('x').map(Number);
    if (w !== _base.width || h !== _base.height) { body.width = w; body.height = h; }
  }
  const fps = Number($('#lm-fps').value);
  if (fps && fps !== _base.fps) body.fps = fps;
  const q = $('#lm-quality').value;
  if (q && q !== 'custom' && q !== _base.quality) body.quality = q;
  return body;
}

let _env = null;
let _fetch = null;

function _problem(t) {
  const el = $('#lm-problem');
  const txt = t && t.problem ? String(t.problem) : '';
  if (el) { el.textContent = txt; el.style.display = txt ? '' : 'none'; }
  $('#lm-yes').disabled = !!(t && t.blocking);
}

function _show(env, srv, display) {
  _env = env;
  $('#lm-title').textContent = 'Launch the game on "' + env + '"?';
  $('#lm-msg').textContent = srv
    ? 'connect.ini → ' + String(srv).replace(',', ':') + ', then launching your launcher.'
    : 'Launch your launcher? (no game server set for "' + env + '" — connect.ini unchanged.)';
  const box = $('#lm-display'), warn = $('#lm-warn');
  _base = (display && !display.error && display.exists) ? display : null;
  if (_base) {
    box.style.display = '';
    $('#lm-mode').value = _base.fullscreen ? 'full' : 'window';
    _fillRes(_base); _fillFps(_base); _fillQuality(_base);
    warn.textContent = _base.game_running
      ? 'The game is already running: it rewrites client.ini when it closes, which would undo these settings. Close it first for them to stick.'
      : '';
    warn.style.display = _base.game_running ? '' : 'none';
  } else {
    box.style.display = 'none';
    warn.textContent = display && display.error ? 'Display options unavailable: ' + display.error
      : 'Display options unavailable: client.ini not found in the packed client folder (Settings).';
    warn.style.display = '';
  }
  $('#lm-env').classList.toggle('lm-prod', env === 'prod');
}

function _fillEnv(envs, env, active) {
  const sel = $('#lm-env'); sel.innerHTML = '';
  const list = (envs && envs.length) ? envs : [env];
  for (const e of list) sel.appendChild(_opt(e, e + (e === active ? '  (active in the tool)' : ''), e === env));
  $('#lm-envwrap').style.display = list.length > 1 ? '' : 'none';
}

let _wired = false;
function _wire() {
  if (_wired) return; _wired = true;
  $('#lm-yes').onclick = () => _done(_collect());
  $('#lm-no').onclick = () => { _watchMode(false); _done(null); };
  $('#launchModal').addEventListener('click', e => { if (e.target.id === 'launchModal') { _watchMode(false); _done(null); } });
  $('#lm-env').addEventListener('change', async () => {
    const want = $('#lm-env').value;
    if (!_fetch || want === _env) return;
    $('#lm-yes').disabled = true;
    try {
      const t = await _fetch(want);
      $('#lm-yes').disabled = false;
      if ($('#lm-env').value === want) { _show(t.env || want, t.server, t.display || null); _problem(t); }
    } catch (_) { $('#lm-yes').disabled = false; }
    syncVariants();
  });
}

export function openLaunchDialog({ env, srv, display, envs, active, fetchTarget, target }) {
  _wire();
  _watchMode(false);
  let saved = '1';
  try { saved = localStorage.getItem('launch.count') || '1'; } catch (_) { }
  $('#lm-count').value = ['1', '2', '3', '4', '5', '6'].includes(saved) ? saved : '1';
  _fetch = fetchTarget || null;
  _fillEnv(envs, env, active || env);
  _show(env, srv, display);
  _problem(target || null);
  setupVariants({ getEnv: () => _env, collect: _collect, launch: _done });
  $('#launchModal').classList.add('open');
  setTimeout(() => { try { $('#lm-yes').focus(); } catch (_) { } }, 60);
  return new Promise(res => { _resolve = res; });
}

export function closeLaunchDialog() { if (_resolve) _done(null); }

const W_CSS = `
#launchModal .lm-w{display:none}
#launchModal .sheet.lm-watching .body>*:not(.lm-w){display:none}
#launchModal .sheet.lm-watching .lm-w{display:block}
#launchModal .sheet.lm-watching #lm-yes{display:none}
.lm-w-head{display:flex;align-items:center;gap:10px;color:var(--ui-ink);font:600 16px/1.3 var(--ui-font)}
.lm-w-head .lm-w-i{display:inline-flex;flex:none;color:var(--ui-muted)}
.lm-w-head.ok .lm-w-i{color:var(--ui-ok)}
.lm-w-head.bad .lm-w-i{color:var(--ui-bad)}
.lm-w-head.busy .lm-w-i{animation:lm-w-spin 1.2s linear infinite}
.lm-w-head em{margin-left:auto;font:500 12px/1 var(--ui-font);color:var(--ui-muted);font-style:normal;white-space:nowrap}
.lm-w-sub{margin:4px 0 0 30px;color:var(--ui-muted);font:400 12.5px/1.45 var(--ui-font);overflow-wrap:anywhere}
.lm-w-text{margin:12px 0 0;padding:10px 12px;border:1px solid var(--ui-line);border-radius:var(--ui-radius-ctl);background:var(--ui-surface-2);color:var(--ui-ink);font:400 13px/1.5 var(--ui-font);overflow-wrap:anywhere}
.lm-w-text.bad{border-color:var(--ui-bad);background:var(--ui-bad-soft)}
.lm-w-bar{height:4px;margin:12px 0 0;border-radius:var(--ui-radius-pill);background:var(--ui-surface-2);overflow:hidden}
.lm-w-bar i{display:block;height:100%;background:var(--ui-accent);transition:width .4s linear}
.lm-w-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px;max-height:min(40vh,320px);overflow-y:auto}
.lm-w-list li{display:flex;gap:8px;align-items:flex-start;color:var(--ui-ink);font:400 12.5px/1.45 var(--ui-font);min-width:0}
.lm-w-list li>span:first-child{flex:none;display:inline-flex;margin-top:1px;color:var(--ui-muted)}
.lm-w-list li.ok>span:first-child{color:var(--ui-ok)}
.lm-w-list li.warn>span:first-child{color:var(--ui-warn)}
.lm-w-list li.fail>span:first-child{color:var(--ui-bad)}
.lm-w-list li>span:last-child{min-width:0}
.lm-w-list b{font-weight:600}
.lm-w-list i{display:block;font-style:normal;color:var(--ui-muted);overflow-wrap:anywhere}
.lm-w-act{display:none}
.lm-w-act.on{display:inline-flex}
@keyframes lm-w-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.lm-w-head.busy .lm-w-i{animation:none}.lm-w-bar i{transition:none}}
`;

const W_ICON = { ok: 'circle-check', warn: 'triangle-alert', fail: 'circle-x', info: 'info' };
const wesc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let _wid = null;
let _wtimer = null;
let _wcloser = null;
let _wstop = 0;

function _wEnsure() {
  if (!document.getElementById('lm-w-css')) {
    const st = document.createElement('style');
    st.id = 'lm-w-css';
    st.textContent = W_CSS;
    document.head.appendChild(st);
  }
  let box = $('#launchModal .lm-w');
  if (!box) {
    box = document.createElement('div');
    box.className = 'lm-w';
    box.setAttribute('aria-live', 'polite');
    $('#launchModal .body').appendChild(box);
  }
  let chk = $('#lm-check');
  if (!chk) {
    chk = document.createElement('button');
    chk.type = 'button';
    chk.id = 'lm-check';
    chk.className = 'sbtn lm-w-act';
    chk.textContent = 'Check my setup';
    $('#lm-yes').before(chk);
    chk.addEventListener('click', () => {
      const env = chk.dataset.env || '';
      _watchMode(false);
      _done(null);
      import('./assistant.js').then(m => m.openAssistant('check my client' + (env ? ' on ' + env : ''))).catch(() => { });
    });
  }
  return box;
}

function _watchMode(on) {
  const sheet = $('#launchModal .sheet');
  if (!sheet) return;
  if (!on) {
    _wid = null;
    clearTimeout(_wtimer); _wtimer = null;
    clearTimeout(_wcloser); _wcloser = null;
    if (sheet.classList.contains('lm-watching')) $('#lm-no').textContent = 'Cancel';
    const chk = $('#lm-check');
    if (chk) chk.classList.remove('on');
  }
  sheet.classList.toggle('lm-watching', !!on);
}

function _wRows(rows) {
  if (!rows || !rows.length) return '';
  return '<ul class="lm-w-list">' + rows.map(c => {
    const st = W_ICON[c.state] ? c.state : 'info';
    return '<li class="' + st + '"><span aria-hidden="true">' + lineSvg(W_ICON[st], 16) + '</span><span><b>' + wesc(c.label) + '</b>' +
      (c.detail ? '<i>' + wesc(c.detail) + '</i>' : '') + (c.help ? '<i>' + wesc(c.help) + '</i>' : '') + '</span></li>';
  }).join('') + '</ul>';
}

function _wRender(st) {
  const box = _wEnsure();
  const state = st.state || 'starting';
  const env = String(st.env || '').toUpperCase();
  const tone = state === 'running' ? 'ok' : state === 'failed' ? 'bad' : 'busy';
  const icon = state === 'running' ? 'circle-check' : state === 'failed' ? 'circle-x' : 'refresh-cw';
  const title = st.title || (state === 'failed' ? 'The game did not start' : 'Starting the game');
  const where = [env, st.server ? String(st.server).replace(',', ':') : '', st.launcher || ''].filter(Boolean).join(' · ');
  const limit = Math.max(1, Number(st.limit) || 20);
  const pct = state === 'starting' ? Math.min(100, Math.round(100 * (Number(st.elapsed) || 0) / limit)) : 100;
  let h = '<div class="lm-w-head ' + tone + '"><span class="lm-w-i" aria-hidden="true">' + lineSvg(icon, 20) + '</span><span>' + wesc(title) + '</span>' +
    (state === 'starting' ? '<em>' + wesc((Number(st.elapsed) || 0) + ' s') + '</em>' : '') + '</div>';
  if (where) h += '<div class="lm-w-sub">' + wesc(where) + '</div>';
  if (state === 'starting') h += '<div class="lm-w-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
  if (st.text) h += '<p class="lm-w-text' + (state === 'failed' ? ' bad' : '') + '">' + wesc(st.text) + '</p>';
  h += _wRows(st.checks);
  box.innerHTML = h;
  $('#lm-title').textContent = state === 'starting' ? 'Launching on ' + (env || 'the test server') : state === 'running' ? 'Game started' : 'Launch problem';
  $('#lm-no').textContent = 'Close';
  const chk = $('#lm-check');
  chk.dataset.env = st.env || '';
  chk.classList.toggle('on', state === 'failed');
}

async function _wPoll(id) {
  if (id !== _wid) return;
  const modal = $('#launchModal');
  if (!modal || !modal.classList.contains('open')) { _watchMode(false); return; }
  let st = null;
  try {
    const r = await fetch('/api/launch/watch/' + encodeURIComponent(id), { credentials: 'same-origin' });
    st = await r.json().catch(() => null);
    if (!r.ok) st = { id, state: 'failed', title: 'Launch not followed', text: (st && st.detail) || ('HTTP ' + r.status), checks: [] };
  } catch (_) { st = null; }
  if (id !== _wid) return;
  if (!st && Date.now() > _wstop) st = { id, state: 'failed', title: 'Launch not followed', text: 'The tool did not answer. Run Check my setup.', checks: [] };
  if (st) _wRender(st);
  if (!st || st.state === 'starting') { _wtimer = setTimeout(() => _wPoll(id), 1000); return; }
  if (st.state === 'running') _wcloser = setTimeout(() => { if (id === _wid) { _watchMode(false); _done(null); } }, 6000);
}

export function watchLaunch(res) {
  const w = (res && res.watch) || {};
  if (!w.id) return false;
  _wire();
  _wEnsure();
  _watchMode(false);
  _watchMode(true);
  _wid = w.id;
  _wstop = Date.now() + (Math.max(1, Number(w.limit) || 20) + 10) * 1000;
  _wRender(Object.assign({ env: res.env, server: res.server }, w));
  $('#launchModal').classList.add('open');
  _wtimer = setTimeout(() => _wPoll(w.id), 800);
  return true;
}

export function showLaunchError(text, env, spawn) {
  _wire();
  _wEnsure();
  _watchMode(false);
  _watchMode(true);
  _wid = 'error';
  _wRender({ state: 'failed', env, title: spawn ? 'Windows did not start the game' : 'The game was not launched', text: String(text || 'The launch failed.'), checks: [] });
  $('#launchModal').classList.add('open');
}
